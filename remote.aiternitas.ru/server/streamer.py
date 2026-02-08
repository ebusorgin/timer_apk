"""
Стриминг экрана компьютера в MJPEG формате.
"""
import asyncio
import io
from concurrent.futures import ThreadPoolExecutor

import mss
import mss.tools
from PIL import Image

# Разрешение стрима (меньше = меньше трафика)
STREAM_WIDTH = 960
STREAM_HEIGHT = 540
JPEG_QUALITY = 60
TARGET_FPS = 15

_executor = ThreadPoolExecutor(max_workers=1)


def _capture_frame() -> bytes:
    """Захват одного кадра экрана, возвращает JPEG bytes."""
    with mss.mss() as sct:
        monitor = sct.monitors[0]
        img = sct.grab(monitor)
        # mss возвращает BGRA
        pil = Image.frombytes("RGB", (img.width, img.height), img.raw, "raw", "BGRX")
        pil = pil.resize((STREAM_WIDTH, STREAM_HEIGHT), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        pil.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return buf.getvalue()


async def generate_mjpeg():
    """Асинхронный генератор MJPEG потока."""
    boundary = b"frame"
    header = (
        b"--" + boundary + b"\r\n"
        b"Content-Type: image/jpeg\r\n"
        b"Content-Length: %d\r\n\r\n"
    )
    while True:
        loop = asyncio.get_running_loop()
        frame = await loop.run_in_executor(_executor, _capture_frame)
        yield header % len(frame) + frame + b"\r\n"
        await asyncio.sleep(1 / TARGET_FPS)
