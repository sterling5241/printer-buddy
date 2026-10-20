// Bed mesh panel: the mesh as a colour map (ECharts heatmap), range, profiles (load / save / remove), calibrate, clear.
PB.panel("bedmesh", {
  title: "Bed mesh", desc: "Bed mesh map, profiles and calibrate", cls: "adv",
  icon: PB.icon('<path d="M3 17l9 4 9-4M3 12l9 4 9-4M3 7l9 4 9-4-9-4z"/>'),
  settings: [{ k: "probed", label: "Show the probed points (not the smoothed mesh)", type: "check", def: false }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><select data-a="prof" aria-label="Mesh profile"></select><button type="button" data-a="load">Load</button>
        <span class="bd-sp"></span><span class="pb-range pb-muted"></span></div>
      <div class="pb-chart pb-mesh"></div>
      <div class="pb-row"><button type="button" data-a="cal">Calibrate</button><button type="button" data-a="clear">Clear</button>
        <button type="button" data-a="save">Save as…</button><button type="button" data-a="rm">Remove</button></div>`;
    const q = s => host.querySelector(s), chartEl = q(".pb-mesh");
    let chart = null, key = "", printing = false;
    if (window.echarts) { chart = echarts.init(chartEl); new ResizeObserver(() => chart.resize()).observe(chartEl); }
    async function load() {
      if (pageId === null) return;
      try {
        const r = await PB.rpc("printer.objects.query", { objects: { bed_mesh: null } });
        draw(r?.status?.bed_mesh || {});
      } catch (e) { q(".pb-range").textContent = e.message; }
    }
    function draw(m) {
      const z = (cfg.probed ? m.probed_matrix : m.mesh_matrix) || [];
      const sel = q("[data-a=prof]"), profs = Object.keys(m.profiles || {});
      sel.innerHTML = profs.map(n => `<option${n === m.profile_name ? " selected" : ""}>${esc(n)}</option>`).join("") || `<option value="">No saved profiles</option>`;
      if (!z.length || !z[0]?.length) {
        q(".pb-range").textContent = "No mesh loaded"; chart?.clear();
        if (!chart) chartEl.innerHTML = `<p class="pb-muted">No mesh loaded.</p>`;
        return;
      }
      const flat = z.flat(), lo = Math.min(...flat), hi = Math.max(...flat);
      q(".pb-range").textContent = `${m.profile_name ? m.profile_name + " · " : ""}range ${(hi - lo).toFixed(3)} mm (${lo.toFixed(3)} to ${hi.toFixed(3)})`;
      if (!chart) return;
      const [x0, y0] = m.mesh_min || [0, 0], [x1, y1] = m.mesh_max || [z[0].length - 1, z.length - 1];
      const xs = z[0].map((_, i) => (x0 + (x1 - x0) * i / Math.max(1, z[0].length - 1)).toFixed(0));
      const ys = z.map((_, j) => (y0 + (y1 - y0) * j / Math.max(1, z.length - 1)).toFixed(0));
      const lim = Math.max(Math.abs(lo), Math.abs(hi), 0.05);
      chart.setOption({
        backgroundColor: "transparent", animation: false, textStyle: { color: "#8F8B99", fontSize: 11 },
        grid: { left: 40, right: 60, top: 10, bottom: 26 },
        tooltip: { formatter: p => `X ${xs[p.value[0]]} · Y ${ys[p.value[1]]}<br><b>${p.value[2].toFixed(3)} mm</b>` },
        xAxis: { type: "category", data: xs, splitArea: { show: false } }, yAxis: { type: "category", data: ys },
        visualMap: { min: -lim, max: lim, calculable: true, orient: "vertical", right: 0, top: "middle", itemHeight: 140,
                     textStyle: { color: "#8F8B99" }, inRange: { color: ["#3b82f6", "#1c1c1f", "#ff8a1f"] }, formatter: v => v.toFixed(2) },
        series: [{ type: "heatmap", data: z.flatMap((row, j) => row.map((v, i) => [i, j, v])),
                   label: { show: z[0].length <= 9, formatter: p => p.value[2].toFixed(2), color: "#e8e6ec", fontSize: 10 } }],
      }, true);
    }
    const bm = (text, cmd) => PB.confirmGcode(text, cmd, "Sent");
    q("[data-a=load]").onclick = () => { const n = q("[data-a=prof]").value; if (n) gcode(`BED_MESH_PROFILE LOAD="${n}"`); };
    q("[data-a=cal]").onclick = () => bm("Probe a new bed mesh now? The printer must be homed (and hot, if you mesh hot).", "BED_MESH_CALIBRATE");
    q("[data-a=clear]").onclick = () => bm("Clear the active mesh?", "BED_MESH_CLEAR");
    q("[data-a=save]").onclick = () => { const n = prompt("Save the current mesh as profile:", "default"); if (n) bm(`Save as "${n}"? Then run SAVE_CONFIG when idle.`, `BED_MESH_PROFILE SAVE="${n}"`); };
    q("[data-a=rm]").onclick = () => { const n = q("[data-a=prof]").value; if (n) bm(`Remove profile "${n}"? Then run SAVE_CONFIG when idle.`, `BED_MESH_PROFILE REMOVE="${n}"`); };
    return {
      open() { key = ""; },
      shown() { load(); chart?.resize(); },
      update(p) {
        const k = JSON.stringify(p.mesh);
        if (k !== key) { key = k; if (host.offsetParent) load(); }
        printing = p.state === "printing" || p.state === "paused";
        const live = p.connection === "online" && p.klippy_state === "ready";
        for (const b of host.querySelectorAll("button")) b.disabled = !live || (printing && b.dataset.a !== "load");
        if (!p.features?.bed_mesh) q(".pb-range").textContent = "No [bed_mesh] in printer.cfg";
      },
      destroy() { chart?.dispose(); },
    };
  },
});
