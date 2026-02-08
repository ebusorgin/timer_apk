"""
Сервер удалённого управления компьютером.
Стриминг экрана на телефон, управление по касаниям, запись и воспроизведение макросов.
"""
import json
import re
import uuid
from pathlib import Path

import pyautogui
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse

from server.streamer import generate_mjpeg
from server import macros
from server.auth import router as auth_router
from server.db import init_db
from server.relay import router as relay_router

# Отключаем fail-safe pyautogui
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.01

app = FastAPI(title="Remote Control Server")

app.include_router(auth_router)
app.include_router(relay_router)


@app.on_event("startup")
async def startup():
    init_db()

screen_width, screen_height = pyautogui.size()
active_connections: list[WebSocket] = []

# Размер стрима (для маппинга координат)
STREAM_WIDTH = 960
STREAM_HEIGHT = 540

PREDEFINED_ACTIONS = {
    "run_dialog": lambda: pyautogui.hotkey("win", "r"),
    "alt_tab": lambda: pyautogui.hotkey("alt", "tab"),
    "ctrl_tab": lambda: pyautogui.hotkey("ctrl", "tab"),
    "ctrl_shift_tab": lambda: pyautogui.hotkey("ctrl", "shift", "tab"),
    "space": lambda: pyautogui.press("space"),
    "enter": lambda: pyautogui.press("enter"),
    "escape": lambda: pyautogui.press("escape"),
    "tab": lambda: pyautogui.press("tab"),
    "backspace": lambda: pyautogui.press("backspace"),
    "zoom_in": lambda: pyautogui.hotkey("ctrl", "+"),
    "zoom_out": lambda: pyautogui.hotkey("ctrl", "-"),
    "copy": lambda: pyautogui.hotkey("ctrl", "c"),
    "paste": lambda: pyautogui.hotkey("ctrl", "v"),
    "undo": lambda: pyautogui.hotkey("ctrl", "z"),
    "save": lambda: pyautogui.hotkey("ctrl", "s"),
    "fullscreen": lambda: pyautogui.press("f11"),
}


def execute_action(action_name: str) -> bool:
    if action_name in PREDEFINED_ACTIONS:
        try:
            PREDEFINED_ACTIONS[action_name]()
            return True
        except Exception:
            return False
    return False


def screen_coords_from_stream(x: float, y: float, stream_w: float, stream_h: float) -> tuple[int, int]:
    """Преобразовать координаты со стрима в координаты экрана."""
    px = int(x * screen_width / stream_w) if stream_w else int(x)
    py = int(y * screen_height / stream_h) if stream_h else int(y)
    return (max(0, min(px, screen_width - 1)), max(0, min(py, screen_height - 1)))


@app.get("/stream")
async def stream_screen():
    """MJPEG стрим экрана компьютера."""
    return StreamingResponse(
        generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        await websocket.send_json({
            "type": "screen_info",
            "width": screen_width,
            "height": screen_height,
            "streamWidth": STREAM_WIDTH,
            "streamHeight": STREAM_HEIGHT,
        })
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            cmd = msg.get("type", "")
            payload = msg.get("payload", {})

            try:
                if cmd == "mouse_move":
                    x, y = payload.get("x", 0), payload.get("y", 0)
                    absolute = payload.get("absolute", False)
                    if absolute:
                        sw, sh = payload.get("srcWidth", STREAM_WIDTH), payload.get("srcHeight", STREAM_HEIGHT)
                        px, py = screen_coords_from_stream(x, y, sw, sh)
                        pyautogui.moveTo(px, py)
                    else:
                        pyautogui.move(x, y)

                elif cmd == "mouse_click":
                    button = payload.get("button", "left")
                    clicks = payload.get("clicks", 1)
                    x, y = payload.get("x"), payload.get("y")
                    if x is not None and y is not None:
                        sw = payload.get("srcWidth", STREAM_WIDTH)
                        sh = payload.get("srcHeight", STREAM_HEIGHT)
                        px, py = screen_coords_from_stream(x, y, sw, sh)
                        pyautogui.click(px, py, clicks=clicks, button=button)
                    else:
                        pyautogui.click(clicks=clicks, button=button)

                elif cmd == "mouse_down":
                    pyautogui.mouseDown(button=payload.get("button", "left"))

                elif cmd == "mouse_up":
                    pyautogui.mouseUp(button=payload.get("button", "left"))

                elif cmd == "scroll":
                    dy = payload.get("dy", 0) or payload.get("dx", 0)
                    pyautogui.scroll(int(dy))

                elif cmd == "key":
                    key = payload.get("key", "")
                    mods = payload.get("modifiers", [])
                    if mods:
                        pyautogui.hotkey(*mods, key)
                    else:
                        pyautogui.press(key)

                elif cmd == "type":
                    pyautogui.write(payload.get("text", ""), interval=0.02)

                elif cmd == "action":
                    execute_action(payload.get("name", ""))

                elif cmd == "macro":
                    macro_id = payload.get("id", "")
                    if macros.replay_macro(macro_id):
                        await websocket.send_json({"type": "macro_ok"})
                    else:
                        await websocket.send_json({"type": "error", "message": "Макрос не найден"})

            except Exception as e:
                await websocket.send_json({"type": "error", "message": str(e)})
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)


# API макросов
@app.get("/api/macros")
def api_get_macros():
    return macros.get_macros()


@app.post("/api/macros/record/start")
def api_start_record():
    macros.start_recording()
    return {"status": "recording"}


@app.post("/api/macros/record/stop")
def api_stop_record():
    events = macros.stop_recording()
    return {"events": events, "count": len(events)}


@app.post("/api/macros/save")
def api_save_macro(data: dict = Body(...)):
    macro_id = data.get("id") or str(uuid.uuid4())[:8]
    name = data.get("name", "Без имени")
    events = data.get("events", [])
    if not re.match(r"^[a-zA-Z0-9_-]+$", macro_id):
        macro_id = str(uuid.uuid4())[:8]
    macros.save_macro(macro_id, name, events)
    return {"id": macro_id, "name": name}


@app.delete("/api/macros/{macro_id}")
def api_delete_macro(macro_id: str):
    macros.delete_macro(macro_id)
    return {"deleted": macro_id}


# Статика и страницы
web_dir = Path(__file__).parent.parent / "web"
if web_dir.exists():
    app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": __import__("time").time()}


@app.get("/")
async def root():
    return FileResponse(web_dir / "landing.html")


@app.get("/login")
async def login_page():
    return FileResponse(web_dir / "login.html")


@app.get("/register")
async def register_page():
    return FileResponse(web_dir / "register.html")


@app.get("/connect")
async def connect_page():
    return FileResponse(web_dir / "connect.html")


@app.get("/control")
async def control_page():
    return FileResponse(web_dir / "control.html")


@app.get("/record")
async def record_page():
    """Страница записи макросов (открывать на компьютере)."""
    record_path = web_dir / "record.html"
    if record_path.exists():
        return FileResponse(record_path)
    return {"message": "Record page not found"}


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", "8765"))
    uvicorn.run(app, host="0.0.0.0", port=port)
