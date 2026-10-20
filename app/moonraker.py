"""One persistent Moonraker WebSocket connection per *selected* printer."""
from __future__ import annotations

import asyncio
import itertools
import json
import logging
import time
from typing import Callable

import uuid

from .net import HandshakeError, WebSocket, get_json, http_get, http_post

log = logging.getLogger(__name__)
VERSION = "0.1.0"

SUBSCRIBE = {
    "print_stats": None,
    "extruder": ["temperature", "target"],
    "heater_bed": ["temperature", "target"],
    "display_status": ["progress", "message"],
    "virtual_sdcard": ["progress", "is_active"],
    "webhooks": ["state", "state_message"],
    "gcode_move": ["speed_factor", "extrude_factor"],
    "toolhead": ["homed_axes", "position", "axis_minimum", "axis_maximum"],
}

# Extra Klipper objects shown on the printer dashboard (found per printer on connect).
SENSOR_PREFIXES = ("temperature_sensor ", "temperature_fan ", "heater_generic ")
FAN_PREFIXES = ("heater_fan ", "controller_fan ", "fan_generic ")
EXTRA_HEATERS = ("extruder1", "extruder2", "extruder3")


def _pretty(obj: str) -> str:
    """'temperature_sensor chamber_temp' -> 'Chamber Temp', 'heater_bed' -> 'Bed'."""
    named = {"extruder": "Nozzle", "heater_bed": "Bed", "fan": "Part fan"}
    if obj in named:
        return named[obj]
    if obj.startswith("extruder"):
        return f"Nozzle {obj[8:]}"
    name = obj.split(" ", 1)[1] if " " in obj else obj
    return name.replace("_", " ").title()


class AuthError(Exception):
    pass


class RPCError(Exception):
    pass


def _merge(dst: dict, src: dict):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _merge(dst[k], v)
        else:
            dst[k] = v


class MoonrakerClient:
    def __init__(self, printer_id: int, host: str, port: int, api_key: str | None,
                 on_change: Callable[["MoonrakerClient"], None]):
        self.id, self.host, self.port, self.api_key = printer_id, host, port, api_key
        self._on_change = on_change
        self.on_gcode: Callable[["MoonrakerClient", str], None] | None = None
        self.connection = "connecting"  # connecting | online | offline | auth_error
        self.error: str | None = None
        self.klippy_state: str | None = None
        self.klippy_message: str | None = None
        self.status: dict = {}
        self.webcams: list[dict] = []
        self.extras: list[str] = []          # extra sensors/fans/heaters this printer has
        self.macros: list[dict] = []         # [{"name", "description"}], hidden ones (_NAME) left out
        self._thumbs: dict[str, tuple[str, bytes] | None] = {}   # filename -> (content type, image)
        self._ids = itertools.count(1)
        self._pending: dict[int, asyncio.Future] = {}
        self._ws: WebSocket | None = None
        self._task: asyncio.Task | None = None

    # lifecycle -----------------------------------------------------------
    def start(self):
        self._task = asyncio.create_task(self._run(), name=f"moonraker-{self.id}")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run(self):
        backoff = 1.0
        while True:
            started = time.monotonic()
            try:
                await self._session()
                self._set(connection="offline", error="connection closed")
            except asyncio.CancelledError:
                raise
            except AuthError as e:
                self._set(connection="auth_error", error=str(e))
                backoff = 60.0
            except Exception as e:
                self._set(connection="offline", error=f"{type(e).__name__}: {e}" if str(e) else type(e).__name__)
            if time.monotonic() - started > 60:
                backoff = 1.0
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 15.0)

    async def _session(self):
        url = f"ws://{self.host}:{self.port}/websocket"
        if self.api_key:
            status, data = await get_json(f"http://{self.host}:{self.port}/access/oneshot_token",
                                          {"X-Api-Key": self.api_key})
            if status in (401, 403):
                raise AuthError("API key rejected")
            if status == 200 and isinstance(data, dict):
                url += "?token=" + str(data.get("result", ""))
        try:
            ws = await WebSocket.connect(url)
        except HandshakeError as e:
            if e.status in (401, 403):
                raise AuthError("Moonraker requires an API key") from e
            raise
        self._ws = ws
        reader = asyncio.create_task(self._reader(ws))
        pinger = asyncio.create_task(self._pinger(ws))
        try:
            try:
                await self._call("server.connection.identify", {
                    "client_name": "printer-monitor", "version": VERSION, "type": "other",
                    "url": "https://github.com/",
                })
            except RPCError:
                pass  # very old Moonraker
            info = await self._call("server.info")
            self._set(connection="online", error=None, klippy_state=info.get("klippy_state"))
            await self._load_webcams()
            if info.get("klippy_state") == "ready":
                await self._subscribe()
            elif info.get("klippy_state") in ("shutdown", "error"):
                await self._load_klippy_message()
            await reader
        finally:
            reader.cancel()
            pinger.cancel()
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(ConnectionError("disconnected"))
            self._pending.clear()
            await ws.close()
            self._ws = None

    async def _pinger(self, ws: WebSocket):
        while not ws.closed:
            await asyncio.sleep(20)
            if time.monotonic() - ws.last_rx > 65:
                log.info("printer %s: no data for 65s, reconnecting", self.id)
                ws.abort()
                return
            try:
                await ws.ping()
            except Exception:
                ws.abort()
                return

    # JSON-RPC -------------------------------------------------------------
    async def _call(self, method: str, params: dict | None = None, timeout: float = 10.0):
        if not self._ws:
            raise ConnectionError("not connected")
        rid = next(self._ids)
        fut = asyncio.get_running_loop().create_future()
        self._pending[rid] = fut
        msg = {"jsonrpc": "2.0", "method": method, "id": rid}
        if params is not None:
            msg["params"] = params
        try:
            await self._ws.send_text(json.dumps(msg))
            return await asyncio.wait_for(fut, timeout)
        finally:
            self._pending.pop(rid, None)

    async def _reader(self, ws: WebSocket):
        while (raw := await ws.recv()) is not None:
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            rid = msg.get("id")
            if rid is not None and rid in self._pending:
                fut = self._pending[rid]
                if fut.done():
                    continue
                if "error" in msg:
                    err = msg["error"]
                    fut.set_exception(RPCError(err.get("message", str(err)) if isinstance(err, dict) else str(err)))
                else:
                    fut.set_result(msg.get("result"))
                continue
            self._notification(msg.get("method"), msg.get("params") or [])
        for fut in self._pending.values():
            if not fut.done():
                fut.set_exception(ConnectionError("disconnected"))

    def _notification(self, method: str | None, params: list):
        if method == "notify_status_update" and params and isinstance(params[0], dict):
            _merge(self.status, params[0])
            self._changed()
        elif method == "notify_klippy_ready":
            self._set(klippy_state="ready", klippy_message=None)
            asyncio.create_task(self._safe(self._subscribe()))
        elif method == "notify_klippy_shutdown":
            self._set(klippy_state="shutdown")
            asyncio.create_task(self._safe(self._load_klippy_message()))
        elif method == "notify_klippy_disconnected":
            self._set(klippy_state="disconnected")
        elif method == "notify_gcode_response" and params:
            if self.on_gcode:
                try:
                    self.on_gcode(self, str(params[0]))
                except Exception:
                    log.exception("on_gcode handler failed")
        elif method == "notify_webcams_changed":
            asyncio.create_task(self._safe(self._load_webcams()))

    async def _safe(self, coro):
        try:
            await coro
        except Exception as e:
            log.warning("printer %s: %s", self.id, e)

    async def _load_klippy_message(self):
        """printer.info carries Klipper's state_message (e.g. 'MCU shutdown: Timer too close')."""
        try:
            res = await self._call("printer.info")
            self._set(klippy_state=res.get("state", self.klippy_state), klippy_message=res.get("state_message"))
        except RPCError:
            pass

    async def _subscribe(self):
        objects = dict(SUBSCRIBE)
        try:
            names = (await self._call("printer.objects.list") or {}).get("objects", [])
        except (RPCError, asyncio.TimeoutError):
            names = []
        self.extras = [n for n in names
                       if n.startswith(SENSOR_PREFIXES + FAN_PREFIXES) or n == "fan" or n in EXTRA_HEATERS]
        for n in self.extras:
            objects[n] = None
        if "exclude_object" in names:            # slicer-labelled objects in the print (skip one mid-print)
            objects["exclude_object"] = None
        await self._load_macros([n[len("gcode_macro "):] for n in names if n.startswith("gcode_macro ")])
        res = await self._call("printer.objects.subscribe", {"objects": objects})
        self.status = (res or {}).get("status", {})
        self._changed()

    async def _load_macros(self, names: list[str]):
        """Macro names + descriptions (from the printer's config). _NAME macros are Klipper's 'hidden' ones."""
        desc = {}
        try:
            res = await self._call("printer.objects.query", {"objects": {"configfile": ["settings"]}})
            settings = ((res or {}).get("status", {}).get("configfile", {}) or {}).get("settings", {}) or {}
            desc = {k[len("gcode_macro "):]: (v or {}).get("description") for k, v in settings.items()
                    if k.startswith("gcode_macro ")}
        except (RPCError, asyncio.TimeoutError):
            pass
        self.macros = sorted(({"name": n.upper(), "description": desc.get(n.lower()) or desc.get(n) or None}
                              for n in names if not n.startswith("_")), key=lambda m: m["name"])

    async def _load_webcams(self):
        try:
            res = await self._call("server.webcams.list")
            self.webcams = [c for c in (res or {}).get("webcams", []) if c.get("enabled", True)]
        except (RPCError, asyncio.TimeoutError):
            self.webcams = []
        self._changed()

    async def command(self, action: str):
        """pause / resume / cancel / estop"""
        methods = {"pause": "printer.print.pause", "resume": "printer.print.resume",
                   "cancel": "printer.print.cancel", "estop": "printer.emergency_stop"}
        return await self._call(methods[action], timeout=15)

    async def list_files(self) -> list[dict]:
        res = await self._call("server.files.list", {"root": "gcodes"})
        files = [{"path": f.get("path") or f.get("filename"), "size": f.get("size"), "modified": f.get("modified")}
                 for f in (res or []) if isinstance(f, dict)]
        return sorted(files, key=lambda f: f["modified"] or 0, reverse=True)

    async def start_print(self, path: str):
        return await self._call("printer.print.start", {"filename": path}, timeout=30)

    async def delete_file(self, path: str):
        return await self._call("server.files.delete_file", {"path": f"gcodes/{path}"})

    async def upload(self, filename: str, data: bytes, start: bool = False):
        """Upload a G-code file to the printer's gcodes folder (Moonraker HTTP upload)."""
        boundary = uuid.uuid4().hex
        parts = [("root", "gcodes")] + ([("print", "true")] if start else [])
        body = b"".join(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in parts)
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                 f'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f"\r\n--{boundary}--\r\n".encode()
        headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
        if self.api_key:
            headers["X-Api-Key"] = self.api_key
        status, _, resp = await http_post(f"http://{self.host}:{self.port}/server/files/upload", body, headers)
        if status not in (200, 201):
            raise RuntimeError(f"upload failed (HTTP {status}): {resp[:200].decode(errors='replace')}")

    async def history(self, start: int = 0, limit: int = 30) -> dict:
        res = await self._call("server.history.list", {"start": start, "limit": limit, "order": "desc"})
        jobs = [{"id": j.get("job_id"), "filename": j.get("filename"), "status": j.get("status"),
                 "start_time": j.get("start_time"), "end_time": j.get("end_time"),
                 "print_duration": j.get("print_duration"), "filament_used": j.get("filament_used"),
                 "exists": j.get("exists", False)}
                for j in (res or {}).get("jobs", [])]
        return {"count": (res or {}).get("count", len(jobs)), "jobs": jobs}

    async def history_totals(self) -> dict:
        res = await self._call("server.history.totals")
        return (res or {}).get("job_totals", {})

    async def temperature_history(self) -> dict:
        """Moonraker keeps ~20 minutes of 1-per-second readings: {object: {"temperatures": [...], "targets": [...]}}."""
        res = await self._call("server.temperature_store", {"include_monitors": False}, timeout=15) or {}
        keep = {"extruder", "heater_bed", *self.extras}
        return {k: {f: v[f] for f in ("temperatures", "targets", "powers", "speeds") if f in v}
                for k, v in res.items() if k in keep and isinstance(v, dict)}

    async def thumbnail(self, filename: str) -> tuple[str, bytes] | None:
        """The slicer's preview picture for a G-code file (the largest up to 400 px wide), cached."""
        if filename in self._thumbs:
            return self._thumbs[filename]
        try:
            meta = await self._call("server.files.metadata", {"filename": filename}) or {}
        except RPCError:
            return None
        thumbs = [t for t in meta.get("thumbnails") or [] if t.get("relative_path")]
        if not thumbs:
            self._thumbs[filename] = None
            return None
        fit = [t for t in thumbs if (t.get("width") or 0) <= 400]
        pick = max(fit, key=lambda t: t.get("width") or 0) if fit else min(thumbs, key=lambda t: t.get("width") or 0)
        folder = filename.rsplit("/", 1)[0] + "/" if "/" in filename else ""
        from urllib.parse import quote
        url = f"http://{self.host}:{self.port}/server/files/gcodes/{quote(folder + pick['relative_path'])}"
        status, headers, data = await http_get(url, {"X-Api-Key": self.api_key} if self.api_key else {}, timeout=10,
                                               max_bytes=2_000_000)
        if status != 200 or not data:
            return None
        ctype = next((v for k, v in headers.items() if k.lower() == "content-type"), "image/png")
        if len(self._thumbs) > 100:
            self._thumbs.clear()
        self._thumbs[filename] = (ctype, data)
        return self._thumbs[filename]

    async def gcode(self, script: str):
        """Run G-code; waits until Klipper finishes it (homing can take a while)."""
        return await self._call("printer.gcode.script", {"script": script}, timeout=120)

    # state ------------------------------------------------------------------
    def _set(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)
        self._changed()

    def _changed(self):
        try:
            self._on_change(self)
        except Exception:
            log.exception("on_change handler failed")

    def _snap_cams(self) -> list[dict]:
        return [cam for cam in self.webcams if cam.get("snapshot_url")]

    def snapshot_url(self, index: int = 0) -> str | None:
        cams = self._snap_cams()
        if not cams:
            return None
        url = cams[min(max(index, 0), len(cams) - 1)]["snapshot_url"]
        if url.startswith(("http://", "https://")):
            return url
        # relative URLs are served by the web frontend (Mainsail/Fluidd nginx), not Moonraker's port
        return f"http://{self.host}{url if url.startswith('/') else '/' + url}"

    def _abs(self, url: str) -> str:
        if url.startswith(("http://", "https://")):
            return url
        return f"http://{self.host}{url if url.startswith('/') else '/' + url}"

    @staticmethod
    def _is_mjpeg(cam: dict) -> bool:
        service = (cam.get("service") or "").lower()
        url = (cam.get("stream_url") or "").lower()
        if not url or any(x in service for x in ("webrtc", "hls", "iframe")):
            return False
        return service.startswith(("mjpegstreamer", "uv4l-mjpeg", "ipstream")) or "action=stream" in url or service == ""

    def stream_url(self, index: int = 0) -> str | None:
        """MJPEG stream URL of a camera, or None if it has none (e.g. WebRTC-only)."""
        cams = self._snap_cams()
        if not cams:
            return None
        cam = cams[min(max(index, 0), len(cams) - 1)]
        return self._abs(cam["stream_url"]) if self._is_mjpeg(cam) else None

    def cams_info(self) -> list[dict]:
        """Name / flip / rotation / fps of each camera, as configured in Moonraker."""
        out = []
        for i, cam in enumerate(self._snap_cams()):
            try:
                rotation = int(cam.get("rotation") or 0)
            except (TypeError, ValueError):
                rotation = 0
            out.append({"name": cam.get("name") or f"Camera {i + 1}", "flip_h": bool(cam.get("flip_horizontal")),
                        "flip_v": bool(cam.get("flip_vertical")), "rotation": rotation, "target_fps": cam.get("target_fps"),
                        "live": self._is_mjpeg(cam)})
        return out

    def view(self) -> dict:
        s = self.status
        ps = s.get("print_stats", {})
        ds = s.get("display_status", {})
        vs = s.get("virtual_sdcard", {})
        live = self.connection == "online" and self.klippy_state == "ready"
        state = ps.get("state") if live else None
        progress = ds.get("progress") or vs.get("progress") or 0.0
        duration = ps.get("print_duration") or 0.0
        eta = None
        if state == "printing" and progress > 0.01 and duration > 0:
            eta = duration / progress - duration
        return {
            "connection": self.connection,
            "error": self.error,
            "klippy_state": self.klippy_state,
            "klippy_message": self.klippy_message if self.klippy_state != "ready" else None,
            "state": state,
            "filename": ps.get("filename") or None,
            "message": ps.get("message") or ds.get("message") or None,
            "progress": progress,
            "print_duration": duration,
            "eta": eta,
            "nozzle": s.get("extruder", {}).get("temperature"),
            "nozzle_target": s.get("extruder", {}).get("target"),
            "bed": s.get("heater_bed", {}).get("temperature"),
            "bed_target": s.get("heater_bed", {}).get("target"),
            "has_webcam": self.snapshot_url() is not None,
            "layer": (ps.get("info") or {}).get("current_layer"),
            "total_layers": (ps.get("info") or {}).get("total_layer"),
            "cams": self.cams_info(),
            "speed_factor": s.get("gcode_move", {}).get("speed_factor"),
            "extrude_factor": s.get("gcode_move", {}).get("extrude_factor"),
            "homed_axes": s.get("toolhead", {}).get("homed_axes"),
            "position": (s.get("toolhead", {}).get("position") or [None] * 4)[:4],
            "sensors": self.sensors() if live else [],
            "macro_count": len(self.macros),
            "objects": self.print_objects() if live else None,
            "bed": self.bed_area(),
        }

    def print_objects(self) -> dict | None:
        """Objects in the current print (Klipper exclude_object): outlines, which are skipped, which is printing now."""
        eo = self.status.get("exclude_object")
        if not isinstance(eo, dict) or not eo.get("objects"):
            return None
        return {"list": [{"name": o.get("name"), "center": o.get("center"), "polygon": o.get("polygon")}
                         for o in eo["objects"] if o.get("name")],
                "excluded": eo.get("excluded_objects") or [], "current": eo.get("current_object")}

    def bed_area(self) -> list | None:
        """[min x, min y, max x, max y] the toolhead can reach, for drawing the objects map."""
        th = self.status.get("toolhead", {})
        lo, hi = th.get("axis_minimum"), th.get("axis_maximum")
        return [lo[0], lo[1], hi[0], hi[1]] if lo and hi and len(lo) > 1 and len(hi) > 1 else None

    def sensors(self) -> list[dict]:
        """Every heater / temperature sensor / fan, for the dashboard's Thermals card and chart."""
        out = []
        for obj in ["extruder", "heater_bed", *self.extras]:
            st = self.status.get(obj)
            if not isinstance(st, dict):
                continue
            is_fan = obj == "fan" or obj.startswith(FAN_PREFIXES)
            kind = ("fan" if is_fan else "heater" if "target" in st and not obj.startswith("temperature_fan ")
                    else "sensor")
            out.append({"id": obj, "name": _pretty(obj), "kind": kind,
                        "temp": st.get("temperature"), "target": st.get("target"),
                        "power": st.get("power"), "speed": st.get("speed")})
        return out
