"""
Remote Desktop — точка входа. Подключение к relay, QR-окно, стрим + команды.
"""
import asyncio
import threading

from relay_client import run_relay_client
from qr_window import show_qr_window


def main():
    token_holder = {"token": None}

    def on_token(token: str):
        token_holder["token"] = token
        threading.Thread(target=lambda: show_qr_window(token), daemon=True).start()

    asyncio.run(run_relay_client(on_token))


if __name__ == "__main__":
    main()
