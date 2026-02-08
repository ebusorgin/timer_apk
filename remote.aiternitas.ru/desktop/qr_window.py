"""
Окно с QR-кодом для сопряжения с телефоном.
"""
import tkinter as tk
from tkinter import ttk

import qrcode
from PIL import Image, ImageTk


def show_qr_window(token: str, url_base: str = "https://remote.aiternitas.ru"):
    url = f"{url_base}/connect?t={token}"
    root = tk.Tk()
    root.title("Remote — Сканируйте QR-код")
    root.resizable(False, False)

    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img = img.resize((256, 256), Image.Resampling.LANCZOS)
    photo = ImageTk.PhotoImage(img)

    frame = ttk.Frame(root, padding=20)
    frame.pack()
    ttk.Label(frame, text="Отсканируйте QR-код камерой телефона", font=("", 12)).pack(pady=(0, 10))
    label = ttk.Label(frame, image=photo)
    label.image = photo
    label.pack()
    ttk.Label(frame, text=f"Код: {token}", font=("", 14, "bold")).pack(pady=10)
    ttk.Label(frame, text="Или откройте в браузере:", font=("", 10)).pack(pady=(10, 2))
    ttk.Label(frame, text=url, font=("", 9), foreground="blue").pack()

    root.mainloop()
