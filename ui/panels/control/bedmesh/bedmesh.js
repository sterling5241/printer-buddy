PB.panel("bedmesh", {
  title: "Bed mesh", desc: "3D bed mesh, profiles and calibrate", cls: "adv",
  icon: PB.icon('<path d="M3 17l9 4 9-4M3 12l9 4 9-4M3 7l9 4 9-4-9-4z"/>'),
  settings: [{ k: "probed", label: "Start on the probed points (not the smoothed mesh)", type: "check", def: false }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><select data-a="prof" aria-label="Mesh profile"></select><button type="button" data-a="load">Load</button>
        <span class="bd-sp"></span><span class="pb-range pb-muted"></span></div>
      <div class="pb-meshopts"><span class="pb-seg"><button type="button" data-v="mesh">Mesh</button><button type="button" data-v="probed">Probed</button></span>
        <button type="button" data-o="flat" title="Look straight down on the bed">Flat</button><button type="button" data-o="wire" title="Show the grid lines">Wireframe</button></div>
      <div class="pb-chart pb-mesh"></div>
      <div class="pb-row"><button type="button" data-a="cal">Calibrate</button><button type="button" data-a="clear">Clear</button>
        <button type="button" data-a="save">Save as…</button><button type="button" data-a="rm">Remove</button></div>`;
    const q = s => host.querySelector(s), chartEl = q(".pb-mesh");
    const opt = { view: cfg.probed ? "probed" : "mesh", flat: false, wire: true, ...PB.store.get("pb-mesh-view", {}) };
    let chart = null, key = "", printing = false, mesh = {};
    if (window.echarts) { chart = echarts.init(chartEl); new ResizeObserver(() => chart.resize()).observe(chartEl); }
    function marks() {
      for (const b of host.querySelectorAll("[data-v]")) b.setAttribute("aria-pressed", String(b.dataset.v === opt.view));
      for (const b of host.querySelectorAll("[data-o]")) b.setAttribute("aria-pressed", String(!!opt[b.dataset.o]));
    }
    async function load() {
      if (pageId === null) return;
      try {
        const r = await PB.rpc("printer.objects.query", { objects: { bed_mesh: null } });
        mesh = r?.status?.bed_mesh || {}; draw();
      } catch (e) { q(".pb-range").textContent = e.message; }
    }
    function draw() {
      const m = mesh, z = (opt.view === "probed" ? m.probed_matrix : m.mesh_matrix) || [];
      const sel = q("[data-a=prof]"), profs = Object.keys(m.profiles || {});
      sel.innerHTML = profs.map(n => `<option${n === m.profile_name ? " selected" : ""}>${esc(n)}</option>`).join("") || `<option value="">No saved profiles</option>`;
      marks();
      if (!z.length || !z[0]?.length) { q(".pb-range").textContent = "No mesh loaded"; chart?.clear(); return; }
      const flat = z.flat(), lo = Math.min(...flat), hi = Math.max(...flat);
      q(".pb-range").textContent = `${m.profile_name ? m.profile_name + " · " : ""}min ${lo.toFixed(3)} · max ${hi.toFixed(3)} · range ${(hi - lo).toFixed(3)} mm`;
      if (!chart) return;
      const [x0, y0] = m.mesh_min || [0, 0], [x1, y1] = m.mesh_max || [z[0].length - 1, z.length - 1];
      const cols = z[0].length, rows = z.length;
      const at = (a, b, i, n) => a + (b - a) * i / Math.max(1, n - 1);
      const lim = Math.max(Math.abs(lo), Math.abs(hi), 0.1), muted = { color: "#8F8B99", fontSize: 10 };
      const axis = (name, min, max) => ({ type: "value", name, min, max, nameTextStyle: muted, axisLabel: { ...muted, formatter: v => +v.toFixed(2) },
                                          axisLine: { lineStyle: { color: "#55525e" } }, splitLine: { lineStyle: { color: "rgba(127,127,140,.18)" } } });
      try { chart.setOption({
        backgroundColor: "transparent", animation: false,
        tooltip: { formatter: p => `X ${p.value[0].toFixed(1)} · Y ${p.value[1].toFixed(1)}<br><b>${p.value[2].toFixed(3)} mm</b>` },
        visualMap: { show: true, dimension: 2, min: -lim, max: lim, calculable: true, right: 0, top: "middle", itemHeight: 150, precision: 3,
                     textStyle: muted, inRange: { color: ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8", "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"] } },
        xAxis3D: axis("X", x0, x1), yAxis3D: axis("Y", y0, y1), zAxis3D: { ...axis("Z", -lim * 2, lim * 2), show: !opt.flat },
        grid3D: { boxWidth: 100, boxDepth: 100 * Math.max(0.2, (y1 - y0) / Math.max(1, x1 - x0)), boxHeight: opt.flat ? 1 : 40, top: -10, right: 50,
                  axisPointer: { show: false },
                  viewControl: opt.flat ? { projection: "orthographic", alpha: 90, beta: 0, rotateSensitivity: 0, orthographicSize: 130 }
                                        : { projection: "perspective", alpha: 30, beta: 30, distance: 190, rotateSensitivity: 1 } },
        series: [{ type: "surface", shading: "color", dataShape: [rows, cols], wireframe: { show: opt.wire, lineStyle: { color: "rgba(0,0,0,.35)" } },
                   data: z.flatMap((row, j) => row.map((v, i) => [at(x0, x1, i, cols), at(y0, y1, j, rows), v])) }],
      }, true); } catch (e) { chart.clear(); q(".pb-range").textContent = `3D view unavailable: ${e.message}`; }
    }
    for (const b of host.querySelectorAll("[data-v]")) b.onclick = () => { opt.view = b.dataset.v; PB.store.set("pb-mesh-view", opt); draw(); };
    for (const b of host.querySelectorAll("[data-o]")) b.onclick = () => { opt[b.dataset.o] = !opt[b.dataset.o]; PB.store.set("pb-mesh-view", opt); draw(); };
    const bm = (text, cmd) => PB.confirmGcode(text, cmd, "Sent");
    q("[data-a=load]").onclick = () => { const n = q("[data-a=prof]").value; if (n) gcode(`BED_MESH_PROFILE LOAD="${n}"`); };
    q("[data-a=cal]").onclick = () => bm("Probe a new bed mesh now? The printer must be homed (and hot, if you mesh hot).", "BED_MESH_CALIBRATE");
    q("[data-a=clear]").onclick = () => bm("Clear the active mesh?", "BED_MESH_CLEAR");
    q("[data-a=save]").onclick = () => { const n = prompt("Save the current mesh as profile:", "default"); if (n) bm(`Save as "${n}"? Then run SAVE_CONFIG when idle.`, `BED_MESH_PROFILE SAVE="${n}"`); };
    q("[data-a=rm]").onclick = () => { const n = q("[data-a=prof]").value; if (n) bm(`Remove profile "${n}"? Then run SAVE_CONFIG when idle.`, `BED_MESH_PROFILE REMOVE="${n}"`); };
    marks();
    return {
      open() { key = ""; mesh = {}; },
      shown() { load(); chart?.resize(); },
      update(p) {
        const k = JSON.stringify(p.mesh);
        if (k !== key) { key = k; if (host.offsetParent) load(); }
        printing = p.state === "printing" || p.state === "paused";
        const live = p.connection === "online" && p.klippy_state === "ready";
        for (const b of host.querySelectorAll(".pb-tool button, .pb-row button")) b.disabled = !live || (printing && b.dataset.a !== "load");
        if (!p.features?.bed_mesh) q(".pb-range").textContent = "No [bed_mesh] in printer.cfg";
      },
      destroy() { chart?.dispose(); },
    };
  },
});
