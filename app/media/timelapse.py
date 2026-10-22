from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import time
from pathlib import Path
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

DEFAULTS = {"tl_mode": "layer", "tl_interval": 10, "tl_fps": 25, "tl_keep": 20}
MODES = ("layer", "interval")
INTERVALS = (5, 10, 30)
FPS = (15, 25, 30)
KEEPS = (5, 10, 20, 50, 100)


def enabled() -> bool:
    return os.getenv("PB_VIDEO", "snapshots").strip().lower() == "timelapse"


class Timelapse:
    def __init__(self, store, data_dir: str, snapshot: Callable[[int], Awaitable[bytes | None]],
                 transform: Callable[[int], tuple[bool, bool, int]]):
        self.store = store
        self.root = Path(data_dir) / "timelapses"
        self.snapshot = snapshot
        self.transform = transform
        self.active: dict[int, dict] = {}
        self.skip: set[int] = set()

    def settings(self) -> dict:
        s = self.store.settings()
        return {k: s.get(k, v) for k, v in DEFAULTS.items()}

    def recording(self, pid: int) -> int | None:
        job = self.active.get(pid)
        return job["frames"] if job else None

    def on_change(self, pid: int, prev: dict, v: dict):
        if not enabled():
            return
        self.set_state(pid, v["state"])
        job = self.active.get(pid)
        if v["state"] == "printing" and prev["state"] not in ("printing", "paused") and not job:
            self._start(pid, v)
        elif job and v["state"] in ("complete", "cancelled", "error", "standby"):
            self._finish(pid, v["state"])
        elif job and job["mode"] == "layer" and v["state"] == "printing":
            layer = v.get("layer")
            if layer is not None and layer != job["layer"]:
                job["layer"] = layer
                asyncio.get_running_loop().create_task(self._capture(pid))

    def _start(self, pid: int, v: dict):
        if pid in self.skip:
            self.skip.discard(pid)
            return
        cfg = self.settings()
        tid = str(int(time.time()))
        frames_dir = self.root / str(pid) / f"{tid}.frames"
        frames_dir.mkdir(parents=True, exist_ok=True)
        job = {"id": tid, "dir": frames_dir, "frames": 0, "layer": v.get("layer"), "mode": cfg["tl_mode"],
               "fps": cfg["tl_fps"], "file": v.get("filename"), "printer": v.get("name"), "started": time.time(),
               "state": "printing", "task": None}
        self.active[pid] = job
        if job["mode"] == "interval":
            job["task"] = asyncio.get_running_loop().create_task(self._interval_loop(pid, cfg["tl_interval"]))
        asyncio.get_running_loop().create_task(self._capture(pid))
        log.info("timelapse started for printer %s (%s)", pid, job["mode"])

    async def _interval_loop(self, pid: int, every: int):
        while pid in self.active:
            await asyncio.sleep(every)
            job = self.active.get(pid)
            if job and self._printing(pid):
                await self._capture(pid)

    def _printing(self, pid: int) -> bool:
        return self.active.get(pid, {}).get("state") == "printing"

    def set_state(self, pid: int, state: str | None):
        if pid in self.active:
            self.active[pid]["state"] = state

    async def _capture(self, pid: int):
        job = self.active.get(pid)
        if not job:
            return
        data = await self.snapshot(pid)
        if not data or self.active.get(pid) is not job:
            return
        job["frames"] += 1
        (job["dir"] / f"frame_{job['frames']:05d}.jpg").write_bytes(data)

    def _finish(self, pid: int, result: str):
        job = self.active.pop(pid, None)
        if not job:
            return
        if job["task"]:
            job["task"].cancel()
        asyncio.get_running_loop().create_task(self._render(pid, job, result))

    def cancel(self, pid: int):
        job = self.active.pop(pid, None)
        if job:
            if job["task"]:
                job["task"].cancel()
            shutil.rmtree(job["dir"], ignore_errors=True)

    async def _render(self, pid: int, job: dict, result: str):
        out_dir = job["dir"].parent
        meta = {"id": job["id"], "printer": job["printer"], "file": job["file"], "started": job["started"],
                "ended": time.time(), "frames": job["frames"], "fps": job["fps"], "result": result, "video": False}
        if job["frames"] < 2:
            shutil.rmtree(job["dir"], ignore_errors=True)
            log.info("timelapse for printer %s had %s frame(s); nothing to render", pid, job["frames"])
            return
        if not shutil.which("ffmpeg"):
            meta["error"] = "ffmpeg is not installed (installer: Install / reinstall)"
        else:
            fh, fv, rot = self.transform(pid)
            vf = (["hflip"] if fh else []) + (["vflip"] if fv else []) + \
                 {90: ["transpose=1"], 180: ["transpose=1", "transpose=1"], 270: ["transpose=2"]}.get(rot % 360, [])
            vf.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")
            mp4 = out_dir / f"{job['id']}.mp4"
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-loglevel", "error", "-framerate", str(job["fps"]),
                "-i", str(job["dir"] / "frame_%05d.jpg"), "-vf", ",".join(vf),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
            _, err = await proc.communicate()
            if proc.returncode == 0 and mp4.exists():
                meta["video"] = True
                shutil.rmtree(job["dir"], ignore_errors=True)
            else:
                meta["error"] = (err or b"").decode(errors="replace").strip()[-300:] or "ffmpeg failed"
        (out_dir / f"{job['id']}.json").write_text(json.dumps(meta))
        self._prune(pid)
        log.info("timelapse for printer %s saved (%s frames)", pid, job["frames"])

    def _prune(self, pid: int):
        keep = int(self.settings()["tl_keep"])
        for item in self.list(pid)[keep:]:
            self.delete(pid, item["id"])

    def list(self, pid: int) -> list[dict]:
        d = self.root / str(pid)
        out = []
        for meta_file in sorted(d.glob("*.json"), reverse=True) if d.exists() else []:
            try:
                meta = json.loads(meta_file.read_text())
            except ValueError:
                continue
            mp4 = d / f"{meta['id']}.mp4"
            meta["size"] = mp4.stat().st_size if mp4.exists() else None
            meta["length"] = round(meta["frames"] / meta["fps"], 1) if meta.get("fps") else None
            out.append(meta)
        return out

    def video_path(self, pid: int, tid: str) -> Path | None:
        if not tid.isdigit():
            return None
        p = self.root / str(pid) / f"{tid}.mp4"
        return p if p.exists() else None

    def delete(self, pid: int, tid: str) -> bool:
        if not tid.isdigit():
            return False
        d = self.root / str(pid)
        found = False
        for p in (d / f"{tid}.mp4", d / f"{tid}.json"):
            if p.exists():
                p.unlink()
                found = True
        shutil.rmtree(d / f"{tid}.frames", ignore_errors=True)
        return found

    def delete_printer(self, pid: int):
        self.cancel(pid)
        shutil.rmtree(self.root / str(pid), ignore_errors=True)
