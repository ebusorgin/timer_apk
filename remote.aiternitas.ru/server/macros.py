"""
Запись и воспроизведение макросов (быстрых действий).
"""
import json
import threading
import time
from pathlib import Path

import pyautogui
from pynput import keyboard, mouse

MACROS_FILE = Path(__file__).parent.parent / "macros.json"
_recording = False
_recorded_events = []
_listeners = []


def _load_macros() -> dict:
    if MACROS_FILE.exists():
        with open(MACROS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_macros(macros: dict):
    MACROS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MACROS_FILE, "w", encoding="utf-8") as f:
        json.dump(macros, f, ensure_ascii=False, indent=2)


def get_macros() -> dict:
    """Список всех макросов: {id: {name, events}}."""
    return _load_macros()


def save_macro(macro_id: str, name: str, events: list):
    """Сохранить макрос."""
    macros = _load_macros()
    macros[macro_id] = {"name": name, "events": events}
    _save_macros(macros)


def delete_macro(macro_id: str):
    """Удалить макрос."""
    macros = _load_macros()
    macros.pop(macro_id, None)
    _save_macros(macros)


def replay_macro(macro_id: str) -> bool:
    """Воспроизвести макрос. Возвращает True если макрос найден."""
    macros = _load_macros()
    if macro_id not in macros:
        return False
    events = macros[macro_id]["events"]
    t0 = 0
    for ev in events:
        delay = ev.get("t", 0) - t0
        if delay > 0:
            time.sleep(delay)
        t0 = ev.get("t", 0)
        _execute_event(ev)
    return True


def _execute_event(ev: dict):
    """Выполнить одно событие макроса."""
    typ = ev.get("type")
    if typ == "mouse_move":
        pyautogui.moveTo(ev["x"], ev["y"])
    elif typ == "mouse_click":
        pyautogui.click(ev["x"], ev["y"], button=ev.get("button", "left"), clicks=ev.get("clicks", 1))
    elif typ == "mouse_scroll":
        pyautogui.scroll(ev.get("dy", 0))
    elif typ == "key_press":
        key = ev.get("key", "")
        mods = ev.get("modifiers", [])
        if mods:
            pyautogui.hotkey(*mods, key)
        else:
            pyautogui.press(key)
    elif typ == "key_type":
        pyautogui.write(ev.get("text", ""), interval=0.02)


def start_recording():
    """Начать запись макроса."""
    global _recording, _recorded_events, _listeners
    _recording = True
    _recorded_events = []
    start_time = [time.perf_counter()]

    def on_move(x, y):
        if _recording:
            t = time.perf_counter() - start_time[0]
            _recorded_events.append({"type": "mouse_move", "t": round(t, 3), "x": x, "y": y})

    def on_click(x, y, button, pressed):
        if _recording and pressed:
            btn = "left" if button == mouse.Button.left else "right"
            t = time.perf_counter() - start_time[0]
            _recorded_events.append({"type": "mouse_click", "t": round(t, 3), "x": x, "y": y, "button": btn})

    def on_scroll(x, y, dx, dy):
        if _recording:
            t = time.perf_counter() - start_time[0]
            _recorded_events.append({"type": "mouse_scroll", "t": round(t, 3), "dy": int(dy)})

    def on_press(key):
        if not _recording:
            return
        t = time.perf_counter() - start_time[0]
        try:
            k = key.char
        except AttributeError:
            k = key.name if hasattr(key, "name") else str(key)
        _recorded_events.append({"type": "key_press", "t": round(t, 3), "key": k})

    def on_release(key):
        pass

    _listeners = [
        mouse.Listener(on_move=on_move, on_click=on_click, on_scroll=on_scroll),
        keyboard.Listener(on_press=on_press, on_release=on_release),
    ]
    for l in _listeners:
        l.start()


def stop_recording() -> list:
    """Остановить запись и вернуть список событий."""
    global _recording, _listeners
    _recording = False
    for l in _listeners:
        l.stop()
    _listeners = []
    return _recorded_events.copy()
