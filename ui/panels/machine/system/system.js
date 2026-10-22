PB.panel("system", {
  title: "System", desc: "MCU boards (version, load) and host / Klipper / Moonraker load charts", cls: "adv", gear: true,
  icon: PB.icon('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  settings: [{ k: "chart", label: "Show the load chart", type: "check", def: true },
             { k: "height", label: "Chart height", type: "select", def: 180, options: [[140, "Small"], [180, "Medium"], [260, "Tall"]] }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-throt" hidden></div><div class="pb-mcus"></div><div class="pb-syschart"></div>`;
    const q = s => host.querySelector(s), chartEl = q(".pb-syschart");
    chartEl.style.height = `${cfg.height}px`; if (!cfg.chart) chartEl.hidden = true;
    let chart = null, timer = null, mcus = [], hist = {}, forId = null, prevCpu = null;
    const KEEP = 72;
    const push = (k, v) => { if (v == null || isNaN(v)) return; (hist[k] ||= []).push([Date.now(), Math.round(v * 10) / 10]); if (hist[k].length > KEEP) hist[k].shift(); };
    const load = st => st && st.mcu_task_avg != null ? ((st.mcu_task_avg + 3 * (st.mcu_task_stddev || 0)) / 0.0025) * 100 : null;
    const THROTTLE = { "Under-Voltage Detected": "Under-voltage now", "Frequency Capped": "CPU slowed", "Currently Throttled": "Throttled now",
                       "Temperature Limit Active": "Too hot", "Previously Under-Volted": "Under-voltage earlier", "Previously Throttled": "Throttled earlier" };
    async function tick() {
      const id = pageId; if (id === null || !host.offsetParent) return;
      if (forId !== id) { forId = id; hist = {}; mcus = []; prevCpu = null; }
      try {
        if (!mcus.length) {
          const names = ((await PB.rpc("printer.objects.list"))?.objects || []);
          mcus = names.filter(n => n === "mcu" || n.startsWith("mcu "));
        }
        const objs = Object.fromEntries([...mcus.map(n => [n, ["mcu_version", "mcu_constants", "last_stats"]]), ["system_stats", null]]);
        const [r, ps] = await Promise.all([PB.rpc("printer.objects.query", { objects: objs }), PB.rpc("machine.proc_stats").catch(() => null)]);
        if (id !== pageId) return;
        const st = r?.status || {};
        q(".pb-mcus").innerHTML = mcus.map(n => {
          const m = st[n] || {}, c = m.mcu_constants || {}, l = load(m.last_stats), awake = m.last_stats?.mcu_awake;
          push(n, l);
          return `<div class="pb-mcu"><div class="pb-mcuh"><b>${esc(n === "mcu" ? "Main board (mcu)" : n.slice(4))}</b><span class="pb-muted">${esc(c.MCU || "")}${c.CLOCK_FREQ ? ` · ${Math.round(c.CLOCK_FREQ / 1e6)} MHz` : ""}</span></div>
            <div class="pb-mcuv pb-mono">${esc(m.mcu_version || "—")}</div>
            <div class="pb-muted">Load ${l != null ? `${l.toFixed(0)}%` : "—"}${awake != null ? ` · awake ${(awake / 5 * 100).toFixed(1)}%` : ""}</div></div>`;
        }).join("") || `<p class="pb-muted">No boards reported (is Klipper running?).</p>`;
        const ss = st.system_stats || {};
        if (ss.cputime != null) {   // Klipper's own CPU use = its CPU seconds used per second
          const now = Date.now() / 1000;
          if (prevCpu) push("Klipper", Math.max(0, (ss.cputime - prevCpu[0]) / (now - prevCpu[1]) * 100));
          prevCpu = [ss.cputime, now];
        }
        push("Host CPU", ps?.system_cpu_usage?.cpu);
        push("Moonraker", ps?.moonraker_stats?.at?.(-1)?.cpu_usage);
        const flags = (ps?.throttled_state?.flags || []).map(f => THROTTLE[f] || f);
        const th = q(".pb-throt"); th.hidden = !flags.length;
        if (flags.length) th.textContent = `The Pi reports: ${flags.join(", ")}. Check the power supply.`;
        draw();
      } catch (e) { q(".pb-mcus").innerHTML = `<p class="pb-muted">${esc(e.message)}</p>`; }
    }
    function draw() {
      if (!cfg.chart) return;
      if (!chart) { if (!window.echarts) { chartEl.innerHTML = `<p class="pb-muted">Chart unavailable.</p>`; return; } chart = echarts.init(chartEl, null, { renderer: "canvas" }); }
      const COL = ["#ff8a1f", "#4fd1c5", "#8b5cf6", "#4ade80", "#90cdf4", "#e5484d", "#f6c344"];
      const series = Object.entries(hist).map(([k, d], i) => ({ name: k === "mcu" ? "MCU" : k.replace(/^mcu /, "MCU "), type: "line", showSymbol: false, data: d,
        lineStyle: { width: 1.5 }, itemStyle: { color: COL[i % COL.length] } }));
      chart.setOption({ animation: false, grid: { left: 40, right: 10, top: 28, bottom: 22 }, legend: { top: 0, textStyle: { color: "#8f8b99", fontSize: 11 } },
        tooltip: { trigger: "axis", valueFormatter: v => `${v}%` }, xAxis: { type: "time", axisLabel: { color: "#8f8b99", fontSize: 10 } },
        yAxis: { type: "value", min: 0, max: v => Math.max(100, Math.ceil(v.max / 10) * 10), axisLabel: { formatter: "{value}%", color: "#8f8b99", fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(127,127,140,.15)" } } },
        series }, { replaceMerge: ["series"] });
    }
    return {
      open() { forId = null; hist = {}; mcus = []; q(".pb-mcus").innerHTML = ""; chart?.clear(); },
      shown() { tick(); clearInterval(timer); timer = setInterval(tick, 5000); chart?.resize(); },
      destroy() { clearInterval(timer); chart?.dispose(); },
    };
  },
});
