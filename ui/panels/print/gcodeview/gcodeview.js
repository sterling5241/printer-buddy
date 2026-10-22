PB.panel("gcodeview", {
  title: "G-code preview", desc: "2D layer view or 3D view of a print file; follows the print", cls: "adv",
  icon: PB.icon('<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>'),
  gear: true,
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
    const S = {
      cv, q, cfg, g3, gmsg, range, draw: () => draw(),
      get layers() { return layers; }, get file() { return file; }, get bed() { return bed; }, get pos() { return pos; },
      get mode() { return mode; }, set mode(v) { mode = v; },
    };
    const v2 = PB.parts.gcode2d(S), v3 = PB.parts.gcode3d(S), parse = PB.parts.gcodeParse;
    const draw = () => mode === "3d" ? v3.draw3d() : v2.draw2d();
    const setMode = m => v3.setMode(m);
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
    async function listFiles() {
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
    PB.previewFile = name => { PB.reveal(host); pick(name); };
    range.oninput = () => { q("[data-a=follow]").checked = false; setLayer(+range.value); };
    for (const b of q(".pb-gmode").querySelectorAll("button")) b.onclick = () => setMode(b.dataset.m);
    new ResizeObserver(() => draw()).observe(host);
    setMode(mode);
    return {
      open() { layers = []; file = null; pos = null; manual = false; listed = false; gmsg.textContent = ""; out.textContent = "—"; range.max = 0; draw(); },
      shown() { draw(); if (!listed) listFiles(); },
      destroy() { v3.destroy(); },
      update(p) {
        bed = p.bed_area; cur = (p.state === "printing" || p.state === "paused" || p.state === "complete") ? p.filename : null;
        q("[data-a=load]").disabled = !cur || loading;
        if (!manual && cur && file !== cur && !loading && host.offsetParent && (p.state === "printing" || p.state === "paused")) load(cur);
        if (p.file_position !== pos) { pos = p.file_position; if (file === cur) follow(); }
      },
    };
  },
});
