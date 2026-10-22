PB.parts = PB.parts || {};
PB.parts.gcodeOrbit = (() => {
  return function orbitControls(c, O) {   // O: { three, draw3d, home3d }   // drag = rotate, right-drag / shift-drag = pan, wheel / pinch = zoom, double-click = reset
      const pts = new Map(); let last = null, pinch = 0;
      c.addEventListener("contextmenu", e => e.preventDefault());
      c.addEventListener("pointerdown", e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.button === 2 || e.shiftKey]; pinch = 0; });
      c.addEventListener("pointerup", e => { pts.delete(e.pointerId); last = null; pinch = 0; });
      c.addEventListener("pointercancel", e => { pts.delete(e.pointerId); last = null; });
      c.addEventListener("pointermove", e => {
        if (!pts.has(e.pointerId) || !last) return;
        pts.set(e.pointerId, [e.clientX, e.clientY]); const o = O.three.orbit;
        if (pts.size === 2) {
          const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch) o.r = Math.min(4000, Math.max(20, o.r * pinch / d)); pinch = d; O.draw3d(); return;
        }
        const dx = e.clientX - last[0], dy = e.clientY - last[1]; last[0] = e.clientX; last[1] = e.clientY;
        if (last[2]) {
          const k = o.r / c.clientHeight * 0.75;
          o.tx += dx * Math.sin(o.th) * k; o.ty -= dx * Math.cos(o.th) * k; o.tz += dy * k * Math.sin(o.ph);
        } else { o.th -= dx * 0.008; o.ph = Math.min(Math.PI - 0.05, Math.max(0.05, o.ph - dy * 0.008)); }
        O.draw3d();
      });
      c.addEventListener("wheel", e => { e.preventDefault(); const o = O.three.orbit; o.r = Math.min(4000, Math.max(20, o.r * Math.exp(e.deltaY * 0.0012))); O.draw3d(); }, { passive: false });
      c.addEventListener("dblclick", () => { O.home3d(); O.draw3d(); });
    };
})();
