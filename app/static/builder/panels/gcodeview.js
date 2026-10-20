// G-code preview panel: a top-down layer view of the print file, following the live print position.
PB.panel("gcodeview", {
  title: "G-code preview", cls: "adv",
  icon: PB.icon('<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>'),
  settings: [
    { k: "travel", label: "Show travel moves", type: "check", def: false },
    { k: "height", label: "Height", type: "select", def: 320, options: [[220, "Small"], [320, "Medium"], [480, "Tall"]] },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><button type="button" data-a="load">Load current print</button>
        <label class="pb-chk"><input type="checkbox" data-a="follow" checked> Follow print</label><span class="bd-sp"></span>
        <span class="pb-gmsg pb-muted"></span></div>
      <canvas class="pb-gcv"></canvas>
      <label class="pb-speed">Layer <input type="range" min="0" max="0" value="0"><output>—</output></label>`;
    const q = s => host.querySelector(s), cv = q("canvas"), range = q("input[type=range]"), out = q("output"), gmsg = q(".pb-gmsg");
    cv.style.height = `${cfg.height}px`;
    let layers = [], file = null, bed = null, pos = null, loading = false;
    // parse: layers = [{z, start (byte offset), segs: Float32Array [x0,y0,x1,y1,...], trav: [...], offs: byte offset per extrusion seg}]
    function parse(text) {
      const L = []; let cur = null, x = 0, y = 0, z = 0, e = 0, absE = true, abs = true, off = 0;
      const seg = [], trav = [], offs = [];
      const flush = () => { if (cur) { cur.segs = Float32Array.from(seg); cur.trav = Float32Array.from(trav); cur.offs = Float64Array.from(offs); L.push(cur); } seg.length = trav.length = offs.length = 0; };
      for (const raw of text.split("\n")) {
        const at = off; off += raw.length + 1;
        const line = raw.split(";")[0].trim().toUpperCase();
        if (!line) continue;
        const w = line.split(/\s+/), c = w[0];
        if (c === "G90") { abs = true; absE = true; continue; } if (c === "G91") { abs = false; absE = false; continue; }
        if (c === "M82") { absE = true; continue; } if (c === "M83") { absE = false; continue; }
        if (c === "G92") { for (const t of w) if (t[0] === "E") e = +t.slice(1); continue; }
        if (c !== "G0" && c !== "G1" && c !== "G2" && c !== "G3") continue;
        let nx = x, ny = y, nz = z, de = 0;
        for (const t of w.slice(1)) {
          const v = +t.slice(1); if (isNaN(v)) continue;
          if (t[0] === "X") nx = abs ? v : x + v; else if (t[0] === "Y") ny = abs ? v : y + v;
          else if (t[0] === "Z") nz = abs ? v : z + v; else if (t[0] === "E") { de = absE ? v - e : v; e = absE ? v : e + v; }
        }
        const extruding = de > 0 && (nx !== x || ny !== y);
        if (extruding && (!cur || Math.abs(nz - cur.z) > 1e-4)) { flush(); cur = { z: nz, start: at }; }
        if (cur && (nx !== x || ny !== y)) {
          if (extruding) { seg.push(x, y, nx, ny); offs.push(at); } else if (Math.abs(nz - cur.z) < 1e-4) trav.push(x, y, nx, ny);
        }
        x = nx; y = ny; z = nz;
      }
      flush();
      return L;
    }
    function draw() {
      const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
      const g = cv.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      if (!layers.length) return;
      const [x0, y0, x1, y1] = bed || [0, 0, 250, 250], s = Math.min(cv.width / (x1 - x0), cv.height / (y1 - y0)) * 0.96;
      const ox = (cv.width - (x1 - x0) * s) / 2, oy = (cv.height - (y1 - y0) * s) / 2;
      g.setTransform(s, 0, 0, -s, ox - x0 * s, cv.height - oy + y0 * s);   // printer coords, Y up
      g.lineWidth = 1.5 / s; g.strokeStyle = "#2c2c31"; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const li = +range.value, line = (arr, n = arr.length) => { g.beginPath(); for (let i = 0; i < n; i += 4) { g.moveTo(arr[i], arr[i + 1]); g.lineTo(arr[i + 2], arr[i + 3]); } g.stroke(); };
      if (layers[li - 1]) { g.strokeStyle = "rgba(143,139,153,.35)"; g.lineWidth = 0.45; line(layers[li - 1].segs); }
      const L = layers[li]; if (!L) return;
      if (cfg.travel) { g.strokeStyle = "rgba(79,209,197,.35)"; g.lineWidth = 0.25; line(L.trav); }
      let done = L.segs.length;
      if (q("[data-a=follow]").checked && pos != null && pos >= L.start) { done = 0; while (done / 4 < L.offs.length && L.offs[done / 4] < pos) done += 4; }
      g.lineWidth = 0.45; g.strokeStyle = "#ff8a1f"; line(L.segs, done);
      if (done < L.segs.length) { g.strokeStyle = "rgba(255,138,31,.25)"; const rest = L.segs.slice(done); line(rest); }
    }
    function setLayer(i) { range.value = i; out.textContent = layers[i] ? `${i + 1} / ${layers.length} · Z ${layers[i].z.toFixed(2)}` : "—"; draw(); }
    async function load(name) {
      if (!name || loading) return;
      loading = true; gmsg.textContent = `Loading ${name}…`;
      try {
        const r = await fetch(PB.fileUrl("gcodes", name)); if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        gmsg.textContent = "Reading the G-code…"; await new Promise(res => setTimeout(res, 20));
        layers = parse(text); file = name;
        range.max = Math.max(0, layers.length - 1);
        gmsg.textContent = `${name} · ${layers.length} layers`;
        setLayer(0); follow();
      } catch (e) { gmsg.textContent = `Couldn't load: ${e.message}`; }
      loading = false;
    }
    function follow() {
      if (!q("[data-a=follow]").checked || pos == null || !layers.length) return;
      let i = 0; while (i + 1 < layers.length && layers[i + 1].start <= pos) i++;
      if (i !== +range.value) setLayer(i); else draw();
    }
    let cur = null;
    q("[data-a=load]").onclick = () => load(cur);
    range.oninput = () => { q("[data-a=follow]").checked = false; setLayer(+range.value); };
    new ResizeObserver(draw).observe(cv);
    return {
      open() { layers = []; file = null; pos = null; gmsg.textContent = ""; out.textContent = "—"; range.max = 0; draw(); },
      shown() { draw(); },
      update(p) {
        bed = p.bed_area; cur = (p.state === "printing" || p.state === "paused" || p.state === "complete") ? p.filename : null;
        q("[data-a=load]").disabled = !cur || loading;
        if (cur && file !== cur && !loading && host.offsetParent && (p.state === "printing" || p.state === "paused")) load(cur);
        if (p.file_position !== pos) { pos = p.file_position; if (file === cur) follow(); }
      },
    };
  },
});
