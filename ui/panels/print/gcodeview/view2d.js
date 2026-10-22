PB.parts = PB.parts || {};
PB.parts.gcode2d = S => {
    function draw2d() {
      const r = S.cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      S.cv.width = Math.max(1, r.width * dpr); S.cv.height = Math.max(1, r.height * dpr);
      const g = S.cv.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S.cv.width, S.cv.height);
      if (!S.layers.length) return;
      const [x0, y0, x1, y1] = S.bed || [0, 0, 250, 250], s = Math.min(S.cv.width / (x1 - x0), S.cv.height / (y1 - y0)) * 0.96;
      const ox = (S.cv.width - (x1 - x0) * s) / 2, oy = (S.cv.height - (y1 - y0) * s) / 2;
      g.setTransform(s, 0, 0, -s, ox - x0 * s, S.cv.height - oy + y0 * s);   // printer coords, Y up
      g.lineWidth = 1.5 / s; g.strokeStyle = "#2c2c31"; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const li = +S.range.value, line = (arr, n = arr.length) => { g.beginPath(); for (let i = 0; i < n; i += 4) { g.moveTo(arr[i], arr[i + 1]); g.lineTo(arr[i + 2], arr[i + 3]); } g.stroke(); };
      if (S.layers[li - 1]) { g.strokeStyle = "rgba(143,139,153,.35)"; g.lineWidth = 0.45; line(S.layers[li - 1].segs); }
      const L = S.layers[li]; if (!L) return;
      if (S.cfg.travel) { g.strokeStyle = "rgba(79,209,197,.35)"; g.lineWidth = 0.25; line(L.trav); }
      let done = L.segs.length;
      if (S.q("[data-a=follow]").checked && S.pos != null && S.pos >= L.start) { done = 0; while (done / 4 < L.offs.length && L.offs[done / 4] < S.pos) done += 4; }
      g.lineWidth = 0.45; g.strokeStyle = "#ff8a1f"; line(L.segs, done);
      if (done < L.segs.length) { g.strokeStyle = "rgba(255,138,31,.25)"; const rest = L.segs.slice(done); line(rest); }
    }
  return { draw2d };
};
