"""Push notifications (ntfy and/or Discord). Set up in the web page; env vars are only defaults."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import smtplib
import ssl
import urllib.request
import uuid
from email.message import EmailMessage

log = logging.getLogger(__name__)

ALL_EVENTS = ["started", "paused", "resumed", "finished", "failed", "cancelled", "offline", "shutdown"]
PROGRESS_STEPS = [0, 10, 20, 25, 33, 50]          # 0 = off
SERVICES = ["ntfy", "discord", "telegram", "pushover", "email"]
ADVANCED_SERVICES = {"telegram", "pushover", "email"}


def advanced() -> bool:
    return os.getenv("PB_NOTIFY", "basic").strip().lower() == "advanced"


def _hdr(text: str) -> str:
    """HTTP headers must be latin-1; use RFC 2047 (which ntfy understands) for anything else."""
    try:
        text.encode("ascii")
        return text
    except UnicodeEncodeError:
        return "=?UTF-8?B?" + base64.b64encode(text.encode()).decode() + "?="


class Notifier:
    def __init__(self, store):
        self.store = store

    def config(self) -> dict:
        s = self.store.settings()
        env_events = os.getenv("NOTIFY_EVENTS")
        default_events = [e.strip() for e in env_events.split(",") if e.strip()] if env_events else ALL_EVENTS
        return {
            "ntfy_url": s.get("ntfy_url", os.getenv("NTFY_URL", "")),
            "ntfy_token": s.get("ntfy_token", os.getenv("NTFY_TOKEN", "")),
            "discord_webhook": s.get("discord_webhook", os.getenv("DISCORD_WEBHOOK", "")),
            "events": s.get("events", default_events),
            "attach_snapshot": s.get("attach_snapshot", True),
            # advanced
            "telegram_token": s.get("telegram_token", ""), "telegram_chat": s.get("telegram_chat", ""),
            "pushover_user": s.get("pushover_user", ""), "pushover_token": s.get("pushover_token", ""),
            "smtp_host": s.get("smtp_host", ""), "smtp_port": s.get("smtp_port", 587), "smtp_tls": s.get("smtp_tls", "starttls"),
            "smtp_user": s.get("smtp_user", ""), "smtp_pass": s.get("smtp_pass", ""),
            "smtp_from": s.get("smtp_from", ""), "smtp_to": s.get("smtp_to", ""),
            "progress_step": s.get("progress_step", 25),
        }

    def targets(self, c: dict | None = None) -> list[str]:
        c = c or self.config()
        on = []
        if c["ntfy_url"]:
            on.append("ntfy")
        if c["discord_webhook"]:
            on.append("discord")
        if advanced():
            if c["telegram_token"] and c["telegram_chat"]:
                on.append("telegram")
            if c["pushover_user"] and c["pushover_token"]:
                on.append("pushover")
            if c["smtp_host"] and c["smtp_to"]:
                on.append("email")
        return on

    @property
    def enabled(self) -> bool:
        return bool(self.targets())

    def wants(self, event: str) -> bool:
        c = self.config()
        if event == "progress":
            return advanced() and bool(c["progress_step"])
        return event in c["events"]

    def progress_step(self) -> int:
        return int(self.config()["progress_step"] or 0) if advanced() else 0

    async def send(self, title: str, message: str, image: bytes | None = None, only: str | None = None) -> list[str]:
        c = self.config()
        if not c["attach_snapshot"]:
            image = None
        senders = {
            "ntfy": lambda: _ntfy(c["ntfy_url"], c["ntfy_token"], title, message, image),
            "discord": lambda: _discord(c["discord_webhook"], title, message, image),
            "telegram": lambda: _telegram(c["telegram_token"], c["telegram_chat"], title, message, image),
            "pushover": lambda: _pushover(c["pushover_user"], c["pushover_token"], title, message, image),
            "email": lambda: _email(c, title, message, image),
        }
        names = [n for n in self.targets(c) if only in (None, n)]
        errors = []
        results = await asyncio.gather(*(asyncio.to_thread(senders[n]) for n in names), return_exceptions=True)
        for n, res in zip(names, results):
            if isinstance(res, Exception):
                log.warning("%s notification failed: %s", n, res)
                errors.append(f"{n}: {res}")
        return errors


def _request(url: str, body: bytes, headers: dict, method: str = "POST"):
    req = urllib.request.Request(url, data=body, method=method, headers={"User-Agent": "printer-buddy", **headers})
    with urllib.request.urlopen(req, timeout=15) as r:
        r.read()


def _ntfy(url: str, token: str, title: str, message: str, image: bytes | None):
    headers = {"Title": _hdr(title)}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if image:
        headers.update({"Message": _hdr(message), "Filename": "snapshot.jpg"})
        _request(url, image, headers, method="PUT")
    else:
        _request(url, message.encode(), headers)


def _multipart(fields: dict, files: list[tuple[str, str, str, bytes]]) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = b""
    for k, v in fields.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for field, filename, ctype, data in files:
        out += (f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
                f"Content-Type: {ctype}\r\n\r\n").encode() + data + b"\r\n"
    return out + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"


def _telegram(token: str, chat: str, title: str, message: str, image: bytes | None):
    text = f"{title}\n{message}"
    if image:
        body, ctype = _multipart({"chat_id": chat, "caption": text[:1000]}, [("photo", "snapshot.jpg", "image/jpeg", image)])
        _request(f"https://api.telegram.org/bot{token}/sendPhoto", body, {"Content-Type": ctype})
    else:
        _request(f"https://api.telegram.org/bot{token}/sendMessage",
                 json.dumps({"chat_id": chat, "text": text}).encode(), {"Content-Type": "application/json"})


def _pushover(user: str, token: str, title: str, message: str, image: bytes | None):
    files = [("attachment", "snapshot.jpg", "image/jpeg", image)] if image else []
    body, ctype = _multipart({"token": token, "user": user, "title": title, "message": message}, files)
    _request("https://api.pushover.net/1/messages.json", body, {"Content-Type": ctype})


def _email(c: dict, title: str, message: str, image: bytes | None):
    msg = EmailMessage()
    msg["Subject"] = title
    msg["From"] = c["smtp_from"] or c["smtp_user"] or "printer-buddy@localhost"
    msg["To"] = c["smtp_to"]
    msg.set_content(message)
    if image:
        msg.add_attachment(image, maintype="image", subtype="jpeg", filename="snapshot.jpg")
    port = int(c["smtp_port"] or 587)
    if c["smtp_tls"] == "ssl":
        server = smtplib.SMTP_SSL(c["smtp_host"], port, timeout=20, context=ssl.create_default_context())
    else:
        server = smtplib.SMTP(c["smtp_host"], port, timeout=20)
        if c["smtp_tls"] == "starttls":
            server.starttls(context=ssl.create_default_context())
    with server:
        if c["smtp_user"]:
            server.login(c["smtp_user"], c["smtp_pass"])
        server.send_message(msg)


def _discord(url: str, title: str, message: str, image: bytes | None):
    content = f"**{title}**\n{message}"
    if not image:
        _request(url, json.dumps({"content": content}).encode(), {"Content-Type": "application/json"})
        return
    boundary = uuid.uuid4().hex
    payload = json.dumps({"content": content, "embeds": [{"image": {"url": "attachment://snapshot.jpg"}}]})
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
        f"Content-Type: application/json\r\n\r\n{payload}\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"snapshot.jpg\"\r\n"
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode() + image + f"\r\n--{boundary}--\r\n".encode()
    _request(url, body, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
