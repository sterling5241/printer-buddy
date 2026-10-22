PB.parts = PB.parts || {};
PB.parts.gcode3d = S => {
    const FEATS = [["Outer wall", 0xff8a1f], ["Inner wall", 0xf6c344], ["Infill", 0xe5484d], ["Top / bottom", 0x8b5cf6],
                   ["Bridge", 0x4fd1c5], ["Support", 0x4ade80], ["Skirt / brim", 0x90cdf4], ["Other", 0x9ca3af]];
    const TOOLS = [0xff8a1f, 0x4fd1c5, 0x8b5cf6, 0x4ade80, 0x90cdf4, 0xe5484d, 0xf6c344, 0xf472b6];
    const SOLID_MAX = 1500000;
    let T = null, three = null, built = "";   // T = THREE; built = what the meshes were made for (file + settings)
    const loadThree = () => window.THREE ? Promise.resolve(window.THREE) : (PB._three ||= new Promise((ok, bad) => {
      const sc = document.createElement("script"); sc.src = "/static/vendor/three.min.js";
      sc.onload = () => ok(window.THREE); sc.onerror = () => { PB._three = null; bad(new Error("couldn't load the 3D library")); };
      document.head.appendChild(sc);
    }));
    async function setMode(m) {
      S.mode = m; for (const b of S.q(".pb-gmode").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.m === m);
      S.cv.hidden = m === "3d"; S.g3.hidden = m !== "3d";
      if (m === "3d" && !three) {
        try { T = await loadThree(); init3d(); } catch (e) { S.gmsg.textContent = `3D unavailable: ${e.message}`; return setMode("2d"); }
      }
      S.draw();
    }
    function init3d() {
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); S.g3.prepend(renderer.domElement);
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, 0.5, 5000); camera.up.set(0, 0, 1);
      scene.add(new T.HemisphereLight(0xffffff, 0x444450, 0.75));
      const sun = new T.DirectionalLight(0xffffff, 0.75); camera.add(sun); sun.position.set(0.4, 1, 0.6); scene.add(camera);
      const bedGrp = new T.Group(); scene.add(bedGrp);
      const nozzle = new T.Mesh(new T.ConeGeometry(2.2, 6, 20), new T.MeshPhongMaterial({ color: 0xe5e5ea, emissive: 0x333338, shininess: 80 }));
      nozzle.rotation.x = -Math.PI / 2; nozzle.geometry.translate(0, 3, 0); nozzle.visible = false; scene.add(nozzle);
      three = { renderer, scene, camera, bedGrp, nozzle, bedKey: "", objs: [], starts: null, solid: false,
                orbit: { th: 0, ph: 1, r: 400, tx: 0, ty: 0, tz: 0 } };
      PB.parts.gcodeOrbit(renderer.domElement, { get three() { return three; }, draw3d, home3d });
    }
    function home3d() {
      const [x0, y0, x1, y1] = S.bed || [0, 0, 250, 250], o = three.orbit, zTop = S.layers.at(-1)?.z || 0;
      Object.assign(o, { th: -Math.PI / 2 - 0.5, ph: 0.95, r: Math.max(x1 - x0, y1 - y0) * 1.7, tx: (x0 + x1) / 2, ty: (y0 + y1) / 2, tz: zTop / 3 });
    }
    function bed3d() {
      const [x0, y0, x1, y1] = S.bed || [0, 0, 250, 250], key = `${x0},${y0},${x1},${y1}`;
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
    const colorOf = (L, k, c) => S.cfg.color === "tool" ? c.setHex(TOOLS[L.tl[k] % TOOLS.length])
      : S.cfg.color === "single" ? c.setHex(0xff8a1f) : c.setHex(FEATS[L.ft[k]][1]);
    function clear3d() {
      for (const o of three.objs) { three.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
      three.objs = []; three.lines = three.ghost = three.mesh = three.trav = null;
    }
    function build3d() {   // all toolpaths of the S.file at once; S.draw ranges / instance counts show "printed so far"
      clear3d(); built = `${S.file}|${S.cfg.quality}|${S.cfg.color}|${S.cfg.specular}`;
      let n = 0; for (const L of S.layers) n += L.segs.length / 4;
      three.solid = S.cfg.quality === "solid" || (S.cfg.quality !== "lines" && n <= SOLID_MAX);
      const starts = new Uint32Array(S.layers.length + 1), c = new T.Color(), zTop = S.layers.at(-1)?.z || 1;
      // thin lines: always built (the faint "rest of this layer" ghost), and the main view in lines quality
      const vtx = new Float32Array(n * 6), col = new Float32Array(n * 6);
      let s = 0;
      S.layers.forEach((L, i) => {
        starts[i] = s;
        for (let k = 0; k < L.segs.length; k += 4, s++) {
          const v = s * 6; vtx[v] = L.segs[k]; vtx[v + 1] = L.segs[k + 1]; vtx[v + 2] = L.z; vtx[v + 3] = L.segs[k + 2]; vtx[v + 4] = L.segs[k + 3]; vtx[v + 5] = L.z;
          colorOf(L, k / 4, c); if (!three.solid) c.multiplyScalar(0.45 + 0.55 * (L.z / zTop));
          col[v] = col[v + 3] = c.r; col[v + 1] = col[v + 4] = c.g; col[v + 2] = col[v + 5] = c.b;
        }
      });
      starts[S.layers.length] = s; three.starts = starts;
      const pa = new T.BufferAttribute(vtx, 3);
      const ghostGeo = new T.BufferGeometry(); ghostGeo.setAttribute("position", pa);
      three.ghost = new T.LineSegments(ghostGeo, new T.LineBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.22, depthWrite: false }));
      three.objs.push(three.ghost);
      if (!three.solid) {
        const g = new T.BufferGeometry(); g.setAttribute("position", pa); g.setAttribute("color", new T.BufferAttribute(col, 3));
        three.lines = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true })); three.objs.push(three.lines);
      } else {
        // solid: one lit box per extrusion move: length x line width x layer height, matrices written straight into the buffer
        const mat = S.cfg.specular ? new T.MeshPhongMaterial({ shininess: 60, specular: 0x555555 }) : new T.MeshLambertMaterial();
        const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, n);
        const m = mesh.instanceMatrix.array, ic = new Float32Array(n * 3), W = 0.45;
        let i = 0;
        for (const L of S.layers) {
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
    function legend() {
      const box = S.q(".pb-g3legend"); box.innerHTML = "";
      if (!S.layers.length || S.cfg.color === "single") return;
      const used = new Set(); for (const L of S.layers) for (const v of (S.cfg.color === "tool" ? L.tl : L.ft)) used.add(v);
      box.innerHTML = [...used].sort((a, b) => a - b).map(v => {
        const [name, hex] = S.cfg.color === "tool" ? [`Tool ${v}`, TOOLS[v % TOOLS.length]] : FEATS[v];
        return `<span><i style="background:#${hex.toString(16).padStart(6, "0")}"></i>${esc(name)}</span>`;
      }).join("");
    }
    function draw3d() {
      if (!three) return;
      const r = S.g3.getBoundingClientRect(); if (!r.width) return;
      three.renderer.setSize(r.width, r.height, false); three.camera.aspect = r.width / r.height; three.camera.updateProjectionMatrix();
      bed3d();
      const want = `${S.file}|${S.cfg.quality}|${S.cfg.color}|${S.cfg.specular}`;
      if (!S.layers.length) { if (three.objs.length) { clear3d(); built = ""; legend(); } }
      else if (built !== want) build3d();
      if (three.trav) { three.scene.remove(three.trav); three.objs.splice(three.objs.indexOf(three.trav), 1); three.trav.geometry.dispose(); three.trav.material.dispose(); three.trav = null; }
      const li = +S.range.value, L = S.layers[li];
      three.nozzle.visible = false;
      if (L && three.starts) {
        const live = S.q("[data-a=follow]").checked && S.pos != null && S.pos >= L.start;
        let done = L.segs.length;
        if (live) { done = 0; while (done / 4 < L.offs.length && L.offs[done / 4] < S.pos) done += 4; }
        const upto = three.starts[li] + done / 4;
        if (three.lines) three.lines.geometry.setDrawRange(0, upto * 2);
        if (three.mesh) { three.mesh.count = upto; }
        three.ghost.geometry.setDrawRange(upto * 2, (three.starts[li + 1] - upto) * 2);
        if (S.cfg.toolhead && live && done > 0) {
          three.nozzle.position.set(L.segs[done - 2], L.segs[done - 1], L.z); three.nozzle.visible = true;
        }
        if (S.cfg.travel && L.trav.length) {
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
  return { setMode, draw3d, destroy() { if (three) { clear3d(); three.renderer.dispose(); three = null; } } };
};
