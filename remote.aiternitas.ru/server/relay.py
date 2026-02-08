"""
Relay: WebSocket-посредник между desktop (.exe) и phone (веб).
Pairing по токену, маршрутизация команд и стрима.
"""
import asyncio
import json
import random
import string
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["relay"])

# token -> desktop WebSocket (для pairing)
pairing_store: dict[str, WebSocket] = {}
# token -> (desktop_ws, [phone_ws, ...]) после успешного pairing
sessions: dict[str, tuple[WebSocket, list[WebSocket]]] = {}
PAIRING_TTL = 600  # 10 минут
TOKEN_LEN = 6


def _gen_token() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=TOKEN_LEN))


@router.websocket("/relay/desktop")
async def relay_desktop(websocket: WebSocket):
    await websocket.accept()
    token = None
    try:
        # Ожидаем pair request
        data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
        msg = json.loads(data)
        if msg.get("type") != "pair":
            await websocket.send_json({"type": "error", "message": "Expected pair request"})
            await websocket.close()
            return
        token = _gen_token()
        pairing_store[token] = websocket
        await websocket.send_json({"type": "paired", "token": token})
        sessions[token] = (websocket, [])

        while True:
            raw = await websocket.receive()
            if "bytes" in raw:
                # Бинарные данные — кадр стрима, переслать на phones
                _, phones = sessions.get(token, (None, []))
                for ws in phones:
                    try:
                        await ws.send_bytes(raw["bytes"])
                    except Exception:
                        pass
    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        await websocket.close()
    finally:
        if token:
            pairing_store.pop(token, None)
            if token in sessions:
                desktop_ws, phones = sessions.pop(token)
                for p in phones:
                    try:
                        await p.close()
                    except Exception:
                        pass


@router.websocket("/relay/phone")
async def relay_phone(websocket: WebSocket, token: Optional[str] = None):
    await websocket.accept()
    token = token or (websocket.query_params.get("token") or websocket.query_params.get("t"))
    if not token:
        await websocket.send_json({"type": "error", "message": "Missing token"})
        await websocket.close()
        return
    token = token.upper()[:TOKEN_LEN]
    desktop_ws = pairing_store.get(token)
    if not desktop_ws and token not in sessions:
        await websocket.send_json({"type": "error", "message": "Invalid or expired token"})
        await websocket.close()
        return
    if token in pairing_store:
        # Переводим в сессию
        desktop_ws = pairing_store.pop(token)
        sessions[token] = (desktop_ws, [websocket])
    else:
        sessions[token][1].append(websocket)
    desktop_ws = sessions[token][0]
    try:
        await websocket.send_json({
            "type": "screen_info",
            "width": 1920,
            "height": 1080,
            "streamWidth": 960,
            "streamHeight": 540,
        })
        while True:
            raw = await websocket.receive()
            if "text" in raw:
                msg = json.loads(raw["text"])
                try:
                    await desktop_ws.send_text(raw["text"])
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        if token in sessions:
            _, phones = sessions[token]
            if websocket in phones:
                phones.remove(websocket)
            if not phones:
                sessions.pop(token, None)
