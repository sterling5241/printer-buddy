// G-code preview panel: 2D (top-down layer) or 3D (rotate / zoom) view of a print file, following the live print position.
// 3D uses Three.js (MIT, static/vendor/three.min.js), loaded only the first time someone picks 3D; the camera controls are ours.
PB.panel("gcodeview", {
  title: "G-code preview", desc: "2D layer view or 3D view of a print file; follows the print", cls: "adv",
  icon: PB.icon('<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>'),
  settings: [
    { k: "view", label: "Start in", type: "select", def: "2d", options: [["2d", "2D (layer)"], ["3d", "3D"]] },
    { k: "travel", label: "Show travel moves", type: "check", def: false },
    { k: "height", label: "Height", type: "select", def: 320, options: [[220, "Small"], [320, "Medium"], [480, "Tall"]] },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><select data-a="pick" aria-label="Preview a file"><option value="">Preview a file…</option></select>
        <button type="button" data-a="load">Current print</button>
        <label class="pb-chk"><input type="checkbox" data-a="follow" checked> Follow print</label><span class="bd-sp"></span>
        <span class="bd-seg pb-gmode"><button type="button" data-m="2d">2D</button><button type="button" data-m="3d">3D</button></span>
        <span class="pb-gmsg pb-muted"></span></div>
      <canvas class="pb-gcv"></canvas><div class="pb-g3" hidden><span class="pb-g3help pb-muted">Drag: rotate · Right-drag / Shift: pan · Wheel / pinch: zoom · Double-click: reset</span></div>
      <label class="pb-speed">Layer <input type="range" min="0" max="0" value="0"><output>—</output></label>`;
    const q = s => host.querySelector(s), cv = q("canvas"), range = q("input[type=range]"), out = q("output"), gmsg = q(".pb-gmsg");
    const g3 = q(".pb-g3"); cv.style.height = g3.style.height = `${cfg.height}px`;
    let mode = cfg.view === "3d" ? "3d" : "2d";
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
    const draw = () => mode === "3d" ? draw3d() : draw2d();
    function draw2d() {
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
    // ---- 3D (Three.js scene, our own orbit controls, renders only when something changes) ----
    let T = null, three = null, built = null;   // T = THREE, three = {renderer, scene, camera, ...}, built = file the geometry is for
    const loadThree = () => window.THREE ? Promise.resolve(window.THREE) : (PB._three ||= new Promise((ok, bad) => {
      const sc = document.createElement("script"); sc.src = "/static/vendor/three.min.js";
      sc.onload = () => ok(window.THREE); sc.onerror = () => { PB._three = null; bad(new Error("couldn't load the 3D library")); };
      document.head.appendChild(sc);
    }));
    async function setMode(m) {
      mode = m; for (const b of q(".pb-gmode").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.m === m);
      cv.hidden = m === "3d"; g3.hidden = m !== "3d";
      if (m === "3d" && !three) {
        try { T = await loadThree(); init3d(); } catch (e) { gmsg.textContent = `3D unavailable: ${e.message}`; return setMode("2d"); }
      }
      draw();
    }
    function init3d() {
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(devicePixelRatio || 1); g3.prepend(renderer.domElement);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, 0.5, 5000); camera.up.set(0, 0, 1);
      const bedGrp = new T.Group(); scene.add(bedGrp);
      three = { renderer, scene, camera, bedGrp, bedKey: "", done: null, ghost: null, trav: null, starts: null, orbit: { th: -Math.PI / 2.6, ph: 1.0, r: 400, tx: 0, ty: 0, tz: 0 } };
      orbitControls(renderer.domElement);
    }
    function home3d() {   // camera looks at the middle of the bed from the front-left, high up
      const [x0, y0, x1, y1] = bed || [0, 0, 250, 250], o = three.orbit, zTop = layers.at(-1)?.z || 0;
      Object.assign(o, { th: -Math.PI / 2 - 0.5, ph: 0.95, r: Math.max(x1 - x0, y1 - y0) * 1.7, tx: (x0 + x1) / 2, ty: (y0 + y1) / 2, tz: zTop / 3 });
    }
    function bed3d() {
      const [x0, y0, x1, y1] = bed || [0, 0, 250, 250], key = `${x0},${y0},${x1},${y1}`;
      if (three.bedKey === key) return; three.bedKey = key;
      const g = three.bedGrp; for (const c of [...g.children]) { g.remove(c); c.geometry.dispose(); c.material.dispose(); }
      const pts = [], step = Math.max(x1 - x0, y1 - y0) > 400 ? 50 : 25;
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) pts.push(x, y0, 0, x, y1, 0);
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) pts.push(x0, y, 0, x1, y, 0);
      const grid = new T.BufferGeometry(); grid.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
      g.add(new T.LineSegments(grid, new T.LineBasicMaterial({ color: 0x8f8b99, transparent: true, opacity: 0.18 })));
      const edge = new T.BufferGeometry(); edge.setAttribute("position", new T.Float32BufferAttribute([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 3));
      g.add(new T.LineLoop(edge, new T.LineBasicMaterial({ color: 0x8f8b99, transparent: true, opacity: 0.6 })));
    }
    function build3d() {   // one geometry for the whole file; drawRange shows "printed so far"
      for (const k of ["done", "ghost"]) if (three[k]) { three.scene.remove(three[k]); three[k].material.dispose(); }
      three.geo?.dispose(); three.ghostGeo?.dispose(); three.done = three.ghost = null; built = file;
      let n = 0; for (const L of layers) n += L.segs.length / 4;
      const pos = new Float32Array(n * 6), col = new Float32Array(n * 6), starts = new Uint32Array(layers.length + 1);
      const zTop = layers.at(-1)?.z || 1, base = new T.Color(0xff8a1f), c = new T.Color();
      let v = 0;
      layers.forEach((L, i) => {
        starts[i] = v / 3; const shade = 0.45 + 0.55 * (L.z / zTop); c.copy(base).multiplyScalar(shade);
        for (let k = 0; k < L.segs.length; k += 4) {
          pos.set([L.segs[k], L.segs[k + 1], L.z, L.segs[k + 2], L.segs[k + 3], L.z], v);
          col.set([c.r, c.g, c.b, c.r, c.g, c.b], v); v += 6;
        }
      });
      starts[layers.length] = v / 3; three.starts = starts;
      const pa = new T.BufferAttribute(pos, 3), ca = new T.BufferAttribute(col, 3);
      three.geo = new T.BufferGeometry(); three.geo.setAttribute("position", pa); three.geo.setAttribute("color", ca);
      three.ghostGeo = new T.BufferGeometry(); three.ghostGeo.setAttribute("position", pa);
      three.done = new T.LineSegments(three.geo, new T.LineBasicMaterial({ vertexColors: true }));
      three.ghost = new T.LineSegments(three.ghostGeo, new T.LineBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.18, depthWrite: false }));
      three.scene.add(three.done, three.ghost); home3d();
    }
    function draw3d() {
      if (!three) return;
      const r = g3.getBoundingClientRect(); if (!r.width) return;
      three.renderer.setSize(r.width, r.height, false); three.camera.aspect = r.width / r.height; three.camera.updateProjectionMatrix();
      bed3d();
      if (layers.length && built !== file) build3d();
      if (!layers.length && three.done) { three.done.visible = three.ghost.visible = false; }
      const li = +range.value, L = layers[li];
      if (three.trav) { three.scene.remove(three.trav); three.trav.geometry.dispose(); three.trav.material.dispose(); three.trav = null; }
      if (L && three.done) {
        let done = L.segs.length;
        if (q("[data-a=follow]").checked && pos != null && pos >= L.start) { done = 0; while (done / 4 < L.offs.length && L.offs[done / 4] < pos) done += 4; }
        three.done.visible = three.ghost.visible = true;
        three.geo.setDrawRange(0, three.starts[li] + (done / 4) * 2);                       // printed layers + this layer so far
        three.ghostGeo.setDrawRange(three.starts[li], three.starts[li + 1] - three.starts[li]);   // the whole current layer, faint
        if (cfg.travel && L.trav.length) {
          const tp = new Float32Array(L.trav.length / 2 * 3); for (let i = 0, j = 0; i < L.trav.length; i += 2, j += 3) tp.set([L.trav[i], L.trav[i + 1], L.z], j);
          const tg = new T.BufferGeometry(); tg.setAttribute("position", new T.BufferAttribute(tp, 3));
          three.trav = new T.LineSegments(tg, new T.LineBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.35 })); three.scene.add(three.trav);
        }
      }
      const o = three.orbit, cam = three.camera;
      cam.position.set(o.tx + o.r * Math.sin(o.ph) * Math.cos(o.th), o.ty + o.r * Math.sin(o.ph) * Math.sin(o.th), o.tz + o.r * Math.cos(o.ph));
      cam.lookAt(o.tx, o.ty, o.tz);
      three.renderer.render(three.scene, cam);
    }
    function orbitControls(c) {   // drag = rotate, right-drag / shift-drag / two fingers = pan, wheel / pinch = zoom, double-click = reset
      const pts = new Map(); let last = null, pinch = 0;
      c.addEventListener("contextmenu", e => e.preventDefault());
      c.addEventListener("pointerdown", e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.button === 2 || e.shiftKey]; pinch = 0; });
      c.addEventListener("pointerup", e => { pts.delete(e.pointerId); last = null; pinch = 0; });
      c.addEventListener("pointercancel", e => { pts.delete(e.pointerId); last = null; });
      c.addEventListener("pointermove", e => {
        if (!pts.has(e.pointerId) || !last) return;
        pts.set(e.pointerId, [e.clientX, e.clientY]); const o = three.orbit;
        if (pts.size === 2) {   // pinch zoom + two-finger pan
          const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch) o.r = Math.min(4000, Math.max(20, o.r * pinch / d)); pinch = d; draw3d(); return;
        }
        const dx = e.clientX - last[0], dy = e.clientY - last[1]; last[0] = e.clientX; last[1] = e.clientY;
        if (last[2]) {   // pan in the view plane
          const k = o.r / c.clientHeight * 0.75, sx = -Math.sin(o.th), sy = Math.cos(o.th);
          o.tx -= (dx * sx) * k; o.ty -= (dx * sy) * k; o.tz += dy * k * Math.sin(o.ph);
        } else { o.th -= dx * 0.008; o.ph = Math.min(Math.PI - 0.05, Math.max(0.05, o.ph - dy * 0.008)); }
        draw3d();
      });
      c.addEventListener("wheel", e => { e.preventDefault(); const o = three.orbit; o.r = Math.min(4000, Math.max(20, o.r * Math.exp(e.deltaY * 0.0012))); draw3d(); }, { passive: false });
      c.addEventListener("dblclick", () => { home3d(); draw3d(); });
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
    let cur = null, manual = false, listed = false;
    async function listFiles() {   // any G-code file on the printer, newest first
      try {
        const files = (await PB.rpc("server.files.list", { root: "gcodes" })) || [];
        const sel = q("[data-a=pick]");
        sel.innerHTML = `<option value="">Preview a file…</option>` + files.filter(f => /\.(gcode|gco|g)$/i.test(f.path || ""))
          .sort((a, b) => (b.modified || 0) - (a.modified || 0)).slice(0, 300).map(f => `<option>${esc(f.path)}</option>`).join("");
        listed = true;
      } catch {}
    }
    const pick = name => { manual = true; q("[data-a=follow]").checked = false; load(name); };
    q("[data-a=pick]").onchange = e => { if (e.target.value) pick(e.target.value); };
    q("[data-a=load]").onclick = () => { manual = false; q("[data-a=follow]").checked = true; load(cur); };
    PB.previewFile = name => { PB.reveal(host); pick(name); };   // Files panel: "Preview"
    range.oninput = () => { q("[data-a=follow]").checked = false; setLayer(+range.value); };
    for (const b of q(".pb-gmode").querySelectorAll("button")) b.onclick = () => setMode(b.dataset.m);
    new ResizeObserver(() => draw()).observe(host);
    setMode(mode);
    return {
      open() { layers = []; file = null; pos = null; manual = false; listed = false; gmsg.textContent = ""; out.textContent = "—"; range.max = 0; draw(); },
      shown() { draw(); if (!listed) listFiles(); },
      destroy() { if (three) { three.geo?.dispose(); three.ghostGeo?.dispose(); three.renderer.dispose(); three = null; } },
      update(p) {
        bed = p.bed_area; cur = (p.state === "printing" || p.state === "paused" || p.state === "complete") ? p.filename : null;
        q("[data-a=load]").disabled = !cur || loading;
        if (!manual && cur && file !== cur && !loading && host.offsetParent && (p.state === "printing" || p.state === "paused")) load(cur);
        if (p.file_position !== pos) { pos = p.file_position; if (file === cur) follow(); }
      },
    };
  },
});
