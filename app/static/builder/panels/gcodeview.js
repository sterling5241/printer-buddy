// G-code preview panel: 2D (top-down layer) or 3D (rotate / zoom) view of a print file, following the live print position.
// 3D uses Three.js (MIT, static/vendor/three.min.js), loaded only the first time someone picks 3D; the camera controls are ours.
PB.panel("gcodeview", {
  title: "G-code preview", desc: "2D layer view or 3D view of a print file; follows the print", cls: "adv",
  icon: PB.icon('<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>'),
  settings: [
    { k: "view", label: "Start in", type: "select", def: "2d", options: [["2d", "2D (layer)"], ["3d", "3D"]] },
    { k: "quality", label: "3D quality", type: "select", def: "auto", options: [["auto", "Auto"], ["solid", "Solid (lit)"], ["lines", "Lines (fast)"]] },
    { k: "color", label: "3D colours", type: "select", def: "feature", options: [["feature", "By feature (walls, infill…)"], ["tool", "By tool"], ["single", "One colour"]] },
    { k: "toolhead", label: "Show the nozzle in 3D", type: "check", def: true },
    { k: "specular", label: "Shiny lighting in 3D", type: "check", def: true },
    { k: "travel", label: "Show travel moves", type: "check", def: false },
    { k: "height", label: "Height", type: "select", def: 320, options: [[220, "Small"], [320, "Medium"], [480, "Tall"]] },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><select data-a="pick" aria-label="Preview a file"><option value="">Preview a file…</option></select>
        <button type="button" data-a="load">Current print</button>
        <label class="pb-chk"><input type="checkbox" data-a="follow" checked> Follow print</label><span class="bd-sp"></span>
        <span class="bd-seg pb-gmode"><button type="button" data-m="2d">2D</button><button type="button" data-m="3d">3D</button></span>
        <span class="pb-gmsg pb-muted"></span></div>
      <canvas class="pb-gcv"></canvas><div class="pb-g3" hidden><div class="pb-g3legend"></div><span class="pb-g3help pb-muted">Drag: rotate · Right-drag / Shift: pan · Wheel / pinch: zoom · Double-click: reset</span></div>
      <label class="pb-speed">Layer <input type="range" min="0" max="0" value="0"><output>—</output></label>`;
    const q = s => host.querySelector(s), cv = q("canvas"), range = q("input[type=range]"), out = q("output"), gmsg = q(".pb-gmsg");
    const g3 = q(".pb-g3"); cv.style.height = g3.style.height = `${cfg.height}px`;
    let mode = cfg.view === "3d" ? "3d" : "2d";
    let layers = [], file = null, bed = null, pos = null, loading = false;
    // slicer feature names (PrusaSlicer / Orca / Bambu / Cura / Simplify3D) -> FEATS index
    const TYPE_RE = /^;\s*(?:TYPE:|FEATURE[: ])\s*(.+)/i;
    function featOf(n) {
      n = n.toLowerCase();
      return /outer|external|overhang/.test(n) ? 0 : /bridge/.test(n) ? 4 : /support/.test(n) ? 5 : /skirt|brim|prime|tower|purge|wipe/.test(n) ? 6
        : /top|bottom|solid|skin|ironing/.test(n) ? 3 : /inner|perimeter|wall/.test(n) ? 1 : /fill|gap/.test(n) ? 2 : 7;
    }
    // parse: layers = [{z, start (byte offset), segs: Float32Array [x0,y0,x1,y1,...], trav: [...], offs: byte offset per extrusion seg}]
    function parse(text) {
      const L = []; let cur = null, x = 0, y = 0, z = 0, e = 0, absE = true, abs = true, off = 0, ft = 7, tool = 0;
      const seg = [], trav = [], offs = [], fts = [], tls = [];
      const flush = () => {
        if (cur) {
          cur.segs = Float32Array.from(seg); cur.trav = Float32Array.from(trav); cur.offs = Float64Array.from(offs);
          cur.ft = Uint8Array.from(fts); cur.tl = Uint8Array.from(tls);
          cur.h = Math.min(1, Math.max(0.05, L.length ? cur.z - L.at(-1).z : cur.z)); L.push(cur);
        }
        seg.length = trav.length = offs.length = fts.length = tls.length = 0;
      };
      for (const raw of text.split("\n")) {
        const at = off; off += raw.length + 1;
        if (raw.charCodeAt(0) === 59) { const m = TYPE_RE.exec(raw); if (m) ft = featOf(m[1]); continue; }   // ;TYPE:Outer wall …
        const line = raw.split(";")[0].trim().toUpperCase();
        if (!line) continue;
        const w = line.split(/\s+/), c = w[0];
        if (c === "G90") { abs = true; absE = true; continue; } if (c === "G91") { abs = false; absE = false; continue; }
        if (c === "M82") { absE = true; continue; } if (c === "M83") { absE = false; continue; }
        if (c === "G92") { for (const t of w) if (t[0] === "E") e = +t.slice(1); continue; }
        if (c[0] === "T" && /^T\d+$/.test(c)) { tool = +c.slice(1); continue; }
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
          if (extruding) { seg.push(x, y, nx, ny); offs.push(at); fts.push(ft); tls.push(tool); } else if (Math.abs(nz - cur.z) < 1e-4) trav.push(x, y, nx, ny);
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
    // ---- 3D (Three.js scene, our own camera controls + toolpath meshes; renders only when something changes) ----
    // Quality: "lines" = thin lines (fast), "solid" = every extrusion is a lit box (width x layer height), "auto" = solid
    // unless the file is huge. Colours: by feature (from the slicer's ;TYPE: comments), by tool, or one colour.
    const FEATS = [["Outer wall", 0xff8a1f], ["Inner wall", 0xf6c344], ["Infill", 0xe5484d], ["Top / bottom", 0x8b5cf6],
                   ["Bridge", 0x4fd1c5], ["Support", 0x4ade80], ["Skirt / brim", 0x90cdf4], ["Other", 0x9ca3af]];
    const TOOLS = [0xff8a1f, 0x4fd1c5, 0x8b5cf6, 0x4ade80, 0x90cdf4, 0xe5484d, 0xf6c344, 0xf472b6];
    const SOLID_MAX = 1500000;   // auto: above this many moves, fall back to lines
    let T = null, three = null, built = "";   // T = THREE; built = what the meshes were made for (file + settings)
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
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); g3.prepend(renderer.domElement);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, 0.5, 5000); camera.up.set(0, 0, 1);
      scene.add(new T.HemisphereLight(0xffffff, 0x444450, 0.75));
      const sun = new T.DirectionalLight(0xffffff, 0.75); camera.add(sun); sun.position.set(0.4, 1, 0.6); scene.add(camera);   // light follows the camera
      const bedGrp = new T.Group(); scene.add(bedGrp);
      const nozzle = new T.Mesh(new T.ConeGeometry(2.2, 6, 20), new T.MeshPhongMaterial({ color: 0xe5e5ea, emissive: 0x333338, shininess: 80 }));
      nozzle.rotation.x = -Math.PI / 2; nozzle.geometry.translate(0, 3, 0); nozzle.visible = false; scene.add(nozzle);
      three = { renderer, scene, camera, bedGrp, nozzle, bedKey: "", objs: [], starts: null, solid: false,
                orbit: { th: 0, ph: 1, r: 400, tx: 0, ty: 0, tz: 0 } };
      orbitControls(renderer.domElement);
    }
    function home3d() {   // look at the middle of the bed from the front-left, high up
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
      const plate = new T.Mesh(new T.PlaneGeometry(x1 - x0, y1 - y0), new T.MeshBasicMaterial({ color: 0x8f8b99, transparent: true, opacity: 0.06, depthWrite: false }));
      plate.position.set((x0 + x1) / 2, (y0 + y1) / 2, -0.01); g.add(plate);
    }
    const colorOf = (L, k, c) => cfg.color === "tool" ? c.setHex(TOOLS[L.tl[k] % TOOLS.length])
      : cfg.color === "single" ? c.setHex(0xff8a1f) : c.setHex(FEATS[L.ft[k]][1]);
    function clear3d() {
      for (const o of three.objs) { three.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
      three.objs = []; three.lines = three.ghost = three.mesh = three.trav = null;
    }
    function build3d() {   // all toolpaths of the file at once; draw ranges / instance counts show "printed so far"
      clear3d(); built = `${file}|${cfg.quality}|${cfg.color}|${cfg.specular}`;
      let n = 0; for (const L of layers) n += L.segs.length / 4;
      three.solid = cfg.quality === "solid" || (cfg.quality !== "lines" && n <= SOLID_MAX);
      const starts = new Uint32Array(layers.length + 1), c = new T.Color(), zTop = layers.at(-1)?.z || 1;
      // thin lines: always built (the faint "rest of this layer" ghost), and the main view in lines quality
      const pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
      let s = 0;
      layers.forEach((L, i) => {
        starts[i] = s;
        for (let k = 0; k < L.segs.length; k += 4, s++) {
          const v = s * 6; pos[v] = L.segs[k]; pos[v + 1] = L.segs[k + 1]; pos[v + 2] = L.z; pos[v + 3] = L.segs[k + 2]; pos[v + 4] = L.segs[k + 3]; pos[v + 5] = L.z;
          colorOf(L, k / 4, c); if (!three.solid) c.multiplyScalar(0.45 + 0.55 * (L.z / zTop));   // lines: darker low down, for depth
          col[v] = col[v + 3] = c.r; col[v + 1] = col[v + 4] = c.g; col[v + 2] = col[v + 5] = c.b;
        }
      });
      starts[layers.length] = s; three.starts = starts;
      const pa = new T.BufferAttribute(pos, 3);
      const ghostGeo = new T.BufferGeometry(); ghostGeo.setAttribute("position", pa);
      three.ghost = new T.LineSegments(ghostGeo, new T.LineBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.22, depthWrite: false }));
      three.objs.push(three.ghost);
      if (!three.solid) {
        const g = new T.BufferGeometry(); g.setAttribute("position", pa); g.setAttribute("color", new T.BufferAttribute(col, 3));
        three.lines = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true })); three.objs.push(three.lines);
      } else {
        // solid: one lit box per extrusion move: length x line width x layer height, matrices written straight into the buffer
        const mat = cfg.specular ? new T.MeshPhongMaterial({ shininess: 60, specular: 0x555555 }) : new T.MeshLambertMaterial();
        const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, n);
        const m = mesh.instanceMatrix.array, ic = new Float32Array(n * 3), W = 0.45;
        let i = 0;
        for (const L of layers) {
          const h = L.h;
          for (let k = 0; k < L.segs.length; k += 4, i++) {
            const x0 = L.segs[k], y0 = L.segs[k + 1], dx = L.segs[k + 2] - x0, dy = L.segs[k + 3] - y0, len = Math.hypot(dx, dy) || 1e-3;
            const cs = dx / len, sn = dy / len, l = len + W * 0.5, o = i * 16;
            m[o] = cs * l; m[o + 1] = sn * l; m[o + 2] = 0; m[o + 3] = 0;
            m[o + 4] = -sn * W; m[o + 5] = cs * W; m[o + 6] = 0; m[o + 7] = 0;
            m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = h; m[o + 11] = 0;
            m[o + 12] = x0 + dx / 2; m[o + 13] = y0 + dy / 2; m[o + 14] = L.z - h / 2; m[o + 15] = 1;
            colorOf(L, k / 4, c); ic[i * 3] = c.r; ic[i * 3 + 1] = c.g; ic[i * 3 + 2] = c.b;
          }
        }
        mesh.instanceColor = new T.InstancedBufferAttribute(ic, 3);
        mesh.frustumCulled = false; three.mesh = mesh; three.objs.push(mesh);
      }
      for (const o of three.objs) three.scene.add(o);
      legend(); home3d();
    }
    function legend() {   // which colours mean what (feature / tool mode), only the ones in this file
      const box = q(".pb-g3legend"); box.innerHTML = "";
      if (!layers.length || cfg.color === "single") return;
      const used = new Set(); for (const L of layers) for (const v of (cfg.color === "tool" ? L.tl : L.ft)) used.add(v);
      box.innerHTML = [...used].sort((a, b) => a - b).map(v => {
        const [name, hex] = cfg.color === "tool" ? [`Tool ${v}`, TOOLS[v % TOOLS.length]] : FEATS[v];
        return `<span><i style="background:#${hex.toString(16).padStart(6, "0")}"></i>${esc(name)}</span>`;
      }).join("");
    }
    function draw3d() {
      if (!three) return;
      const r = g3.getBoundingClientRect(); if (!r.width) return;
      three.renderer.setSize(r.width, r.height, false); three.camera.aspect = r.width / r.height; three.camera.updateProjectionMatrix();
      bed3d();
      const want = `${file}|${cfg.quality}|${cfg.color}|${cfg.specular}`;
      if (!layers.length) { if (three.objs.length) { clear3d(); built = ""; legend(); } }
      else if (built !== want) build3d();
      if (three.trav) { three.scene.remove(three.trav); three.objs.splice(three.objs.indexOf(three.trav), 1); three.trav.geometry.dispose(); three.trav.material.dispose(); three.trav = null; }
      const li = +range.value, L = layers[li];
      three.nozzle.visible = false;
      if (L && three.starts) {
        const live = q("[data-a=follow]").checked && pos != null && pos >= L.start;
        let done = L.segs.length;
        if (live) { done = 0; while (done / 4 < L.offs.length && L.offs[done / 4] < pos) done += 4; }
        const upto = three.starts[li] + done / 4;   // moves shown solid / bright
        if (three.lines) three.lines.geometry.setDrawRange(0, upto * 2);
        if (three.mesh) { three.mesh.count = upto; }
        three.ghost.geometry.setDrawRange(upto * 2, (three.starts[li + 1] - upto) * 2);   // the rest of this layer, faint
        if (cfg.toolhead && live && done > 0) {
          three.nozzle.position.set(L.segs[done - 2], L.segs[done - 1], L.z); three.nozzle.visible = true;
        }
        if (cfg.travel && L.trav.length) {
          const tp = new Float32Array(L.trav.length / 2 * 3); for (let i = 0, j = 0; i < L.trav.length; i += 2, j += 3) { tp[j] = L.trav[i]; tp[j + 1] = L.trav[i + 1]; tp[j + 2] = L.z; }
          const tg = new T.BufferGeometry(); tg.setAttribute("position", new T.BufferAttribute(tp, 3));
          three.trav = new T.LineSegments(tg, new T.LineBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.35 }));
          three.objs.push(three.trav); three.scene.add(three.trav);
        }
      }
      const o = three.orbit, cam = three.camera;
      cam.position.set(o.tx + o.r * Math.sin(o.ph) * Math.cos(o.th), o.ty + o.r * Math.sin(o.ph) * Math.sin(o.th), o.tz + o.r * Math.cos(o.ph));
      cam.lookAt(o.tx, o.ty, o.tz);
      three.renderer.render(three.scene, cam);
    }
    function orbitControls(c) {   // drag = rotate, right-drag / shift-drag = pan, wheel / pinch = zoom, double-click = reset
      const pts = new Map(); let last = null, pinch = 0;
      c.addEventListener("contextmenu", e => e.preventDefault());
      c.addEventListener("pointerdown", e => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.button === 2 || e.shiftKey]; pinch = 0; });
      c.addEventListener("pointerup", e => { pts.delete(e.pointerId); last = null; pinch = 0; });
      c.addEventListener("pointercancel", e => { pts.delete(e.pointerId); last = null; });
      c.addEventListener("pointermove", e => {
        if (!pts.has(e.pointerId) || !last) return;
        pts.set(e.pointerId, [e.clientX, e.clientY]); const o = three.orbit;
        if (pts.size === 2) {   // pinch zoom
          const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch) o.r = Math.min(4000, Math.max(20, o.r * pinch / d)); pinch = d; draw3d(); return;
        }
        const dx = e.clientX - last[0], dy = e.clientY - last[1]; last[0] = e.clientX; last[1] = e.clientY;
        if (last[2]) {   // pan sideways + up/down in the view
          const k = o.r / c.clientHeight * 0.75;
          o.tx += dx * Math.sin(o.th) * k; o.ty -= dx * Math.cos(o.th) * k; o.tz += dy * k * Math.sin(o.ph);
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
      destroy() { if (three) { clear3d(); three.renderer.dispose(); three = null; } },
      update(p) {
        bed = p.bed_area; cur = (p.state === "printing" || p.state === "paused" || p.state === "complete") ? p.filename : null;
        q("[data-a=load]").disabled = !cur || loading;
        if (!manual && cur && file !== cur && !loading && host.offsetParent && (p.state === "printing" || p.state === "paused")) load(cur);
        if (p.file_position !== pos) { pos = p.file_position; if (file === cur) follow(); }
      },
    };
  },
});
