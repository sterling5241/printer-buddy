import asyncio
import json
import logging
import re
import time

from .camera import Camera
from .ftps import Files
from .mqtt import MQTT

log = logging.getLogger("bambu.printer")

# serial prefix -> (model, bed x, bed y, max z, chamber sensor)
MODELS = {
    "00M": ("X1 Carbon", 256, 256, 256, True), "00W": ("X1", 256, 256, 256, True), "03W": ("X1E", 256, 256, 256, True),
    "01S": ("P1P", 256, 256, 256, False), "01P": ("P1S", 256, 256, 256, False),
    "030": ("A1 mini", 180, 180, 180, False), "039": ("A1", 256, 256, 256, False),
    "094": ("H2D", 325, 320, 325, True),
}
STATES = {"IDLE": "standby", "PREPARE": "printing", "SLICING": "printing", "RUNNING": "printing",
          "PAUSE": "paused", "FINISH": "complete", "FAILED": "error"}
CANCELLED = 50348044
SPEEDS = {1: 50, 2: 100, 3: 124, 4: 166}
FANS = {"fan": ("cooling_fan_speed", 1), "fan_generic Aux": ("big_fan1_speed", 2),
        "fan_generic Chamber": ("big_fan2_speed", 3), "heater_fan Hotend": ("heatbreak_fan_speed", None)}


def _merge(dst: dict, src: dict):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _merge(dst[k], v)
        else:
            dst[k] = v


def _num(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


class Bambu:
    def __init__(self, cfg: dict):
        self.name = cfg.get("name") or "Bambu"
        self.host, self.serial, self.code = cfg["host"], cfg["serial"].strip().upper(), str(cfg["access_code"]).strip()
        model = MODELS.get(self.serial[:3], ("Bambu Lab", 256, 256, 256, True))
        self.model, self.size, self.has_chamber = model[0], model[1:4], model[4]
        self.report: dict = {}
        self.connected = False
        self.error: str | None = None
        self.camera = Camera(self.host, self.code)
        if cfg.get("camera") == "rtsp":
            self.camera.rtsp_url = f"rtsps://{self.host}:322/streaming/live/1"
        self._camera_mode = cfg.get("camera", "auto")
        self.files = Files(self.host, self.code)
        self.listeners: list = []
        self.gcode_listeners: list = []
        self._mqtt: MQTT | None = None
        self._seq = 0
        self._job_started: float | None = None
        self._paused_at: float | None = None
        self._paused_total = 0.0
        self._last_state = "standby"
        self.job_ended: tuple | None = None

    # -------------------------------------------------------------- connection

    async def run(self):
        backoff = 2
        while True:
            m = MQTT(self.host, "bblp", self.code, f"printer-buddy-{self.serial[-6:]}-{int(time.time()) % 10000}")
            try:
                await m.connect()
                await m.subscribe(f"device/{self.serial}/report")
                self._mqtt, self.connected, self.error, backoff = m, True, None, 2
                log.info("%s: connected to %s", self.name, self.host)
                await self._send({"pushing": {"command": "pushall"}})
                await self._send({"info": {"command": "get_version"}})
                self._changed()
                pinger = asyncio.create_task(self._pinger(m))
                try:
                    async for topic, payload in m.messages():
                        self._on_message(payload)
                finally:
                    pinger.cancel()
            except asyncio.CancelledError:
                await m.close()
                raise
            except Exception as e:
                self.error = str(e) or type(e).__name__
                log.info("%s: %s", self.name, self.error)
            self._mqtt, self.connected = None, False
            await m.close()
            self._changed()
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

    async def _pinger(self, m: MQTT):
        n = 0
        while True:
            await asyncio.sleep(30)
            await m.ping()
            n += 1
            # P1 / A1 only send what changed; ask for everything now and then
            if n % 20 == 0:
                await self._send({"pushing": {"command": "pushall"}})

    async def _send(self, msg: dict):
        if not self._mqtt:
            raise ConnectionError("printer not connected")
        self._seq += 1
        for section in msg.values():
            section.setdefault("sequence_id", str(self._seq))
        await self._mqtt.publish(f"device/{self.serial}/request", json.dumps(msg).encode())

    def _on_message(self, payload: bytes):
        try:
            msg = json.loads(payload)
        except ValueError:
            return
        p = msg.get("print")
        if isinstance(p, dict):
            if p.get("result") in ("fail", "failed") and p.get("command") != "push_status":
                self._gcode(f"!! Printer refused {p.get('command')}: {p.get('reason') or p.get('result')}"
                            " (turn on LAN only + Developer mode on the printer)")
            if p.get("command") in (None, "push_status"):
                _merge(self.report, p)
                ipcam = (self.report.get("ipcam") or {}).get("rtsp_url") or ""
                if self._camera_mode == "auto":
                    self.camera.rtsp_url = ipcam if ipcam.startswith("rtsp") else None
                self._track_job()
                self._changed()
        info = msg.get("info")
        if isinstance(info, dict) and info.get("command") == "get_version":
            self.report["_modules"] = info.get("module") or []
            self._changed()

    def _changed(self):
        for cb in list(self.listeners):
            cb()

    def _gcode(self, line: str):
        for cb in list(self.gcode_listeners):
            cb(line)

    # -------------------------------------------------------------- job tracking

    def state(self) -> str:
        s = STATES.get(str(self.report.get("gcode_state", "IDLE")).upper(), "standby")
        if s == "error" and int(_num(self.report.get("print_error"))) == CANCELLED:
            return "cancelled"
        return s

    def _track_job(self):
        s, now = self.state(), time.time()
        if s in ("printing", "paused") and self._job_started is None:
            elapsed = 0.0
            remaining = _num(self.report.get("mc_remaining_time")) * 60
            pct = _num(self.report.get("mc_percent")) / 100
            if 0 < pct < 1 and remaining:
                elapsed = remaining * pct / (1 - pct)
            self._job_started, self._paused_total = now - elapsed, 0.0
        if s == "paused" and self._paused_at is None:
            self._paused_at = now
        if s != "paused" and self._paused_at is not None:
            self._paused_total += now - self._paused_at
            self._paused_at = None
        if s not in ("printing", "paused") and self._last_state in ("printing", "paused"):
            self.job_ended = (self.filename(), self.print_duration(), s)
            self._job_started = None
        self._last_state = s

    def print_duration(self) -> float:
        if self._job_started is None:
            return 0.0
        end = self._paused_at or time.time()
        return max(0.0, end - self._job_started - self._paused_total)

    def total_duration(self) -> float:
        return 0.0 if self._job_started is None else time.time() - self._job_started

    def filename(self) -> str:
        r = self.report
        name = r.get("gcode_file") or r.get("subtask_name") or ""
        return re.sub(r"^(/sdcard/|/mnt/sdcard/|file:///sdcard/|ftp://)", "", str(name)).lstrip("/")

    # -------------------------------------------------------------- klipper objects

    def objects(self) -> dict:
        r, s = self.report, self.state()
        pct = _num(r.get("mc_percent")) / 100
        printing = s in ("printing", "paused")
        nozzle, nozzle_t = _num(r.get("nozzle_temper")), _num(r.get("nozzle_target_temper"))
        bed, bed_t = _num(r.get("bed_temper")), _num(r.get("bed_target_temper"))
        x, y, z = self.size
        speed = SPEEDS.get(int(_num(r.get("spd_lvl"), 2)), 100) / 100
        fw = next((m.get("sw_ver") for m in r.get("_modules", []) if m.get("name") == "ota"), "") or ""
        layer, layers = int(_num(r.get("layer_num"))), int(_num(r.get("total_layer_num")))
        message = ""
        if s == "error":
            message = f"print failed (error {int(_num(r.get('print_error'))):08X})"
        heaters = ["extruder", "heater_bed"]
        sensors = heaters + (["temperature_sensor Chamber"] if self.has_chamber else [])
        o = {
            "webhooks": {"state": "ready" if self.connected else "shutdown",
                         "state_message": "Printer is ready" if self.connected else f"Bambu printer not reachable: {self.error}"},
            "print_stats": {"filename": self.filename() if printing or s in ("complete", "error", "cancelled") else "",
                            "state": s, "message": message, "print_duration": self.print_duration(),
                            "total_duration": self.total_duration(), "filament_used": 0.0,
                            "info": {"current_layer": layer or None, "total_layer": layers or None}},
            "virtual_sdcard": {"progress": pct, "is_active": s == "printing", "file_position": 0, "file_size": 0,
                               "file_path": f"/sdcard/{self.filename()}" if printing else None},
            "display_status": {"progress": pct, "message": None},
            "idle_timeout": {"state": "Printing" if s == "printing" else "Ready" if printing else "Idle",
                             "printing_time": self.print_duration()},
            "pause_resume": {"is_paused": s == "paused"},
            "extruder": {"temperature": nozzle, "target": nozzle_t, "power": 1.0 if nozzle_t > nozzle + 2 else 0.0,
                         "can_extrude": nozzle >= 170, "pressure_advance": 0.0, "smooth_time": 0.04},
            "heater_bed": {"temperature": bed, "target": bed_t, "power": 1.0 if bed_t > bed + 2 else 0.0},
            "heaters": {"available_heaters": heaters, "available_sensors": sensors, "available_monitors": []},
            "gcode_move": {"speed_factor": speed, "extrude_factor": 1.0, "homing_origin": [0.0, 0.0, 0.0, 0.0],
                           "position": [0.0, 0.0, 0.0, 0.0], "gcode_position": [0.0, 0.0, 0.0, 0.0],
                           "absolute_coordinates": True, "absolute_extrude": True, "speed": 0.0},
            "toolhead": {"homed_axes": "", "position": [0.0, 0.0, 0.0, 0.0], "axis_minimum": [0.0, 0.0, 0.0, 0.0],
                         "axis_maximum": [float(x), float(y), float(z), 0.0], "extruder": "extruder",
                         "max_velocity": 500.0, "max_accel": 20000.0, "square_corner_velocity": 5.0,
                         "minimum_cruise_ratio": 0.5, "max_accel_to_decel": 10000.0, "print_time": 0.0,
                         "estimated_print_time": 0.0, "stalls": 0},
            "motion_report": {"live_position": [0.0, 0.0, 0.0, 0.0], "live_velocity": 0.0, "live_extruder_velocity": 0.0},
            "exclude_object": {"objects": [], "excluded_objects": [], "current_object": None},
            "system_stats": {"sysload": 0.0, "cputime": 0.0, "memavail": 0},
            "mcu": {"mcu_version": fw, "mcu_build_versions": "", "mcu_constants": {}, "last_stats": {}},
            "output_pin Chamber_light": {"value": 1.0 if any(
                l.get("node") == "chamber_light" and l.get("mode") == "on" for l in r.get("lights_report") or []) else 0.0},
            "configfile": {"warnings": [], "save_config_pending": False, "save_config_pending_items": {},
                           "settings": self._settings(), "config": {}},
        }
        if self.has_chamber:
            c = _num(r.get("chamber_temper"))
            o["temperature_sensor Chamber"] = {"temperature": c, "measured_min_temp": c, "measured_max_temp": c}
        for name, (field, _) in FANS.items():
            if field in r:
                o[name] = {"speed": round(_num(r.get(field)) / 15, 2), "rpm": None}
        # TODO: second nozzle on H2D (extruder1) once its report format is checked on a real printer
        return o

    def _settings(self) -> dict:
        x, y, z = self.size
        return {
            "printer": {"kinematics": "corexy" if not self.model.startswith("A1") else "cartesian",
                        "max_velocity": 500, "max_accel": 20000},
            "extruder": {"min_temp": 0, "max_temp": 300, "min_extrude_temp": 170, "nozzle_diameter": 0.4,
                         "filament_diameter": 1.75},
            "heater_bed": {"min_temp": 0, "max_temp": 120},
            "stepper_x": {"position_min": 0, "position_max": x}, "stepper_y": {"position_min": 0, "position_max": y},
            "stepper_z": {"position_min": 0, "position_max": z},
            "virtual_sdcard": {"path": "/sdcard"}, "pause_resume": {}, "display_status": {},
            "output_pin chamber_light": {"pwm": False},
            "fan": {}, "fan_generic aux": {}, "fan_generic chamber": {}, "heater_fan hotend": {},
        }

    # -------------------------------------------------------------- commands

    async def pause(self):
        await self._send({"print": {"command": "pause"}})

    async def resume(self):
        await self._send({"print": {"command": "resume"}})

    async def stop(self):
        await self._send({"print": {"command": "stop"}})

    async def light(self, on: bool):
        await self._send({"system": {"command": "ledctrl", "led_node": "chamber_light", "led_mode": "on" if on else "off",
                                     "led_on_time": 500, "led_off_time": 500, "loop_times": 0, "interval_time": 0}})

    async def speed(self, percent: float):
        level = min(SPEEDS, key=lambda k: abs(SPEEDS[k] - percent))
        await self._send({"print": {"command": "print_speed", "param": str(level)}})

    async def gcode(self, line: str):
        await self._send({"print": {"command": "gcode_line", "param": line.rstrip("\n") + "\n"}})

    async def start(self, path: str, plate: int = 1):
        path = path.lstrip("/")
        if path.lower().endswith(".3mf"):
            name = path.rsplit("/", 1)[-1]
            await self._send({"print": {
                "command": "project_file", "param": f"Metadata/plate_{plate}.gcode", "project_id": "0",
                "profile_id": "0", "task_id": "0", "subtask_id": "0", "subtask_name": name.rsplit(".", 2)[0],
                "url": f"file:///sdcard/{path}", "md5": "", "timelapse": False, "bed_type": "auto",
                "bed_levelling": True, "flow_cali": False, "vibration_cali": False, "layer_inspect": False,
                "use_ams": bool((self.report.get("ams") or {}).get("ams")), "ams_mapping": []}})
        else:
            await self._send({"print": {"command": "gcode_file", "param": f"/sdcard/{path}"}})
