"""
Relay-клиент для desktop: подключение к серверу, отправка кадров, приём команд.
"""
import asyncio
import io
import json
from concurrent.futures import ThreadPoolExecutor

import mss
from PIL import Image
import pyautogui
import websockets

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.01

STREAM_WIDTH = 960
STREAM_HEIGHT = 540
JPEG_QUALITY = 60
TARGET_FPS = 15
RELAY_URL = "wss://remote.aiternitas.ru/relay/desktop"

_executor = ThreadPoolExecutor(max_workers=1)
screen_width, screen_height = pyautogui.size()


def _capture_frame() -> bytes:
    with mss.mss() as sct:
        monitor = sct.monitors[0]
        img = sct.grab(monitor)
        pil = Image.frombytes("RGB", (img.width, img.height), img.raw, "raw", "BGRX")
        pil = pil.resize((STREAM_WIDTH, STREAM_HEIGHT), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        pil.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return buf.getvalue()


def _screen_coords(x: float, y: float, sw: float, sh: float) -> tuple[int, int]:
    px = int(x * screen_width / sw) if sw else int(x)
    py = int(y * screen_height / sh) if sh else int(y)
    return (max(0, min(px, screen_width - 1)), max(0, min(py, screen_height - 1)))


def _execute_command(msg: dict):
    cmd = msg.get("type", "")
    payload = msg.get("payload", {})
    try:
        if cmd == "mouse_move":
            x, y = payload.get("x", 0), payload.get("y", 0)
            if payload.get("absolute"):
                sw = payload.get("srcWidth", STREAM_WIDTH)
                sh = payload.get("srcHeight", STREAM_HEIGHT)
                px, py = _screen_coords(x, y, sw, sh)
                pyautogui.moveTo(px, py)
            else:
                pyautogui.move(x, y)
        elif cmd == "mouse_click":
            btn = payload.get("button", "left")
            clicks = payload.get("clicks", 1)
            x, y = payload.get("x"), payload.get("y")
            if x is not None and y is not None:
                sw = payload.get("srcWidth", STREAM_WIDTH)
                sh = payload.get("srcHeight", STREAM_HEIGHT)
                px, py = _screen_coords(x, y, sw, sh)
                pyautogui.click(px, py, clicks=clicks, button=btn)
            else:
                pyautogui.click(clicks=clicks, button=btn)
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
            name = payload.get("name", "")
            actions = {
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
            if name in actions:
                actions[name]()
    except Exception:
        pass


async def run_relay_client(on_token: callable):
    async with websockets.connect(RELAY_URL) as ws:
        await ws.send(json.dumps({"type": "pair"}))
        resp = json.loads(await ws.recv())
        if resp.get("type") != "paired":
            raise RuntimeError("Pair failed")
        token = resp.get("token", "")
        on_token(token)

        async def send_frames():
            loop = asyncio.get_event_loop()
            while True:
                frame = await loop.run_in_executor(_executor, _capture_frame)
                await ws.send(frame)
                await asyncio.sleep(1 / TARGET_FPS)

        async def recv_commands():
            try:
                async for msg in ws:
                    if isinstance(msg, str):
                        data = json.loads(msg)
                        _execute_command(data)
            except websockets.exceptions.ConnectionClosed:
                pass

        await asyncio.gather(send_frames(), recv_commands())
