"""AI failure detection: while a printer prints, score its camera every few seconds with our model.

Only active when the installer's AI choice is "basic". The model lives in <data>/ai/<tag>/:
  printer-buddy-basic.onnx + model.json   (published as "ai-basic-*" releases; the installer downloads them)

Alert rule: the highest "alert" label score must reach the threshold for `hold` checks in a row,
then nothing more for `cooldown` minutes. "warn" labels never trigger anything, they're only shown.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import time
from pathlib import Path
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

DEFAULTS = {"ai_threshold": 0.6, "ai_interval": 10, "ai_hold": 3, "ai_cooldown": 10}
CHOICES = {"ai_threshold": (0.4, 0.5, 0.6, 0.7, 0.8), "ai_interval": (5, 10, 20, 30),
           "ai_hold": (1, 2, 3, 5), "ai_cooldown": (5, 10, 20, 30)}
MODES = ("off", "alert", "pause")      # per printer; default "alert"
DEFAULT_MODE = "alert"


def enabled() -> bool:
    return os.getenv("PB_AI", "off").strip().lower() == "basic"


class Model:
    """The ONNX model + its model.json. score() is blocking: call it in a thread."""

    def __init__(self, folder: Path):
        self.meta = json.load(open(folder / "model.json"))
        path = folder / self.meta["file"]
        want = self.meta.get("sha256")
        if want and hashlib.sha256(path.read_bytes()).hexdigest() != want:
            raise ValueError(f"{path.name} is damaged (checksum doesn't match model.json)")
        import numpy as np
        import onnxruntime as ort
        self.np = np
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2          # leave CPU for the rest of the box
        self.sess = ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])
        inp = self.meta["input"]
        self.size = int(inp["shape"][2])
        self.mean = np.array(inp["mean"], dtype=np.float32).reshape(3, 1, 1)
        self.std = np.array(inp["std"], dtype=np.float32).reshape(3, 1, 1)
        self.labels = self.meta["labels"]
        self.kinds = self.meta["kinds"]
        self.tag = self.meta.get("tag") or folder.name

    def score(self, jpeg: bytes, flip_h=False, flip_v=False, rotation=0) -> dict[str, float]:
        from PIL import Image, ImageOps
        im = Image.open(io.BytesIO(jpeg)).convert("RGB")
        # show the model the print the way the app shows it (upright)
        if rotation:
            im = im.rotate(-int(rotation), expand=True)
        if flip_h:
            im = ImageOps.mirror(im)
        if flip_v:
            im = ImageOps.flip(im)
        im = im.resize((self.size, self.size), Image.BILINEAR)
        x = self.np.asarray(im, dtype=self.np.float32).transpose(2, 0, 1) / 255.0
        x = ((x - self.mean) / self.std)[None].astype(self.np.float32)
        out = self.sess.run([self.meta["output"]["name"]], {self.meta["input"]["name"]: x})[0][0]
        return {l: round(float(s), 4) for l, s in zip(self.labels, out)}


class AI:
    def __init__(self, store, data_dir: str,
                 snapshot: Callable[[int], Awaitable[bytes | None]],
                 transform: Callable[[int], tuple[bool, bool, int]],
                 mode_of: Callable[[int], str],
                 on_alert: Callable[[int, str, float, bytes | None, str], Awaitable[None]],
                 on_update: Callable[[int], None]):
        self.store = store
        self.root = Path(data_dir) / "ai"
        self.snapshot, self.transform, self.mode_of = snapshot, transform, mode_of
        self.on_alert, self.on_update = on_alert, on_update
        self.model: Model | None = None
        self.error: str | None = None
        self.tasks: dict[int, asyncio.Task] = {}
        self.state: dict[int, dict] = {}

    # model ----------------------------------------------------------------
    def load(self):
        """Load the newest model in <data>/ai/. Safe to call again (e.g. after the installer downloads one)."""
        self.model, self.error = None, None
        if not enabled():
            return
        folders = sorted((p.parent for p in self.root.glob("*/model.json")),
                         key=lambda p: json.load(open(p / "model.json")).get("created", ""))
        if not folders:
            self.error = "no model installed - run the installer (AI detection: basic)"
            log.warning("AI: %s", self.error)
            return
        try:
            self.model = Model(folders[-1])
            log.info("AI: loaded model %s (%s)", self.model.tag, ", ".join(self.model.labels))
        except ImportError:
            self.error = "onnxruntime/numpy/Pillow not installed - run the installer (AI detection: basic)"
            log.warning("AI: %s", self.error)
        except Exception as e:
            self.error = f"couldn't load the model: {e}"
            log.warning("AI: %s", self.error)

    def info(self) -> dict:
        m = self.model
        return {"enabled": enabled(), "loaded": bool(m), "error": self.error,
                "tag": m.tag if m else None, "labels": m.labels if m else [],
                "kinds": m.kinds if m else {}, "default_threshold": m.meta.get("default_threshold") if m else None}

    # settings -------------------------------------------------------------
    def settings(self) -> dict:
        s = self.store.settings()
        return {k: s.get(k, v) for k, v in DEFAULTS.items()}

    # per printer ----------------------------------------------------------
    def status(self, pid: int) -> dict | None:
        if not enabled():
            return None
        st = self.state.get(pid, {})
        return {"mode": self.mode_of(pid), "watching": pid in self.tasks,
                "score": st.get("score"), "top": st.get("top"), "scores": st.get("scores"),
                "at": st.get("at"), "streak": st.get("streak", 0), "alerted_at": st.get("alerted_at"),
                "alert_item": st.get("alert_item")}   # photo the "was it really a failure?" question is about

    def on_change(self, pid: int, prev: dict, v: dict):
        if not enabled() or not self.model:
            return
        if v["state"] == "printing" and v["connection"] == "online" and self.mode_of(pid) != "off":
            if pid not in self.tasks:
                if prev["state"] not in ("printing", "paused"):   # a new print: start fresh
                    self.state[pid] = {}
                self.tasks[pid] = asyncio.get_running_loop().create_task(self._watch(pid))
        else:
            self.cancel(pid, keep_scores=True)

    def refresh(self, pid: int, v: dict):
        """Mode changed: start or stop watching right away."""
        self.on_change(pid, {"state": v["state"]}, v)

    def cancel(self, pid: int, keep_scores: bool = False):
        if t := self.tasks.pop(pid, None):
            t.cancel()
        if not keep_scores:
            self.state.pop(pid, None)
        elif pid in self.state:
            self.state[pid]["streak"] = 0

    async def stop(self):
        for pid in list(self.tasks):
            self.cancel(pid)

    async def check_now(self, pid: int) -> dict:
        """One test score of the camera right now, in any printer state. Never alerts, pauses or counts."""
        if not enabled():
            raise RuntimeError("AI detection is off (installer: AI detection = basic)")
        m = self.model
        if not m:
            raise RuntimeError(self.error or "No AI model loaded")
        img = await self.snapshot(pid)
        if not img:
            raise RuntimeError("Couldn't get a picture from this printer's camera")
        scores = await asyncio.to_thread(m.score, img, *self.transform(pid))
        alerts = {l: v for l, v in scores.items() if m.kinds.get(l) == "alert"}
        top = max(alerts, key=alerts.get) if alerts else None
        return {"scores": scores, "top": top, "score": alerts.get(top, 0.0), "at": time.time()}

    async def _watch(self, pid: int):
        try:
            while True:
                s = self.settings()
                await self._check(pid, s)
                await asyncio.sleep(float(s["ai_interval"]))
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("AI watcher for printer %s stopped", pid)
        finally:
            if self.tasks.get(pid) is asyncio.current_task():
                self.tasks.pop(pid, None)

    async def _check(self, pid: int, s: dict):
        m = self.model
        img = await self.snapshot(pid)
        if not m or not img:
            return
        try:
            scores = await asyncio.to_thread(m.score, img, *self.transform(pid))
        except Exception as e:
            log.info("AI: couldn't score printer %s snapshot: %s", pid, e)
            return
        alerts = {l: v for l, v in scores.items() if m.kinds.get(l) == "alert"}
        top = max(alerts, key=alerts.get) if alerts else None
        score = alerts.get(top, 0.0)
        st = self.state.setdefault(pid, {})
        st.update(scores=scores, top=top, score=score, at=time.time())
        st["streak"] = st.get("streak", 0) + 1 if score >= float(s["ai_threshold"]) else 0
        cooled = time.time() - (st.get("alerted_at") or 0) >= float(s["ai_cooldown"]) * 60
        if st["streak"] >= int(s["ai_hold"]) and cooled:
            st["alerted_at"], st["streak"] = time.time(), 0
            mode = self.mode_of(pid)
            log.info("AI: printer %s %s %.0f%% for %s checks -> %s", pid, top, score * 100, s["ai_hold"], mode)
            if mode != "off":
                await self.on_alert(pid, top, score, img, mode)
        self.on_update(pid)
