PB.parts = PB.parts || {};
PB.parts.historyCharts = c => {
    let c1 = null, c2 = null;
    c.q("[data-a=charts]").onclick = async e => {
      const box = c.q(".pb-hcharts"), on = box.hidden; box.hidden = !on; e.currentTarget.setAttribute("aria-pressed", on);
      if (!on) return;
      if (!window.echarts) { c.q(".pb-hcnums").textContent = "Charts unavailable."; return; }
      const id = pageId; c.q(".pb-hcnums").textContent = "Collecting the history…";
      let all; try { all = await c.fetchAll(id); } catch (err) { c.q(".pb-hcnums").textContent = err.message; return; }
      if (id !== pageId) return;
      const count = {}; for (const j of all) count[j.status || "unknown"] = (count[j.status || "unknown"] || 0) + 1;
      const COL = { completed: "#4ade80", cancelled: "#8f8b99", error: "#e5484d", klippy_shutdown: "#e5484d", klippy_disconnect: "#f6c344", interrupted: "#f6c344", in_progress: "#ff8a1f" };
      const WEEK = 7 * 86400, now = Date.now() / 1000, weeks = Array.from({ length: 12 }, (_, i) => Math.floor(now / WEEK) - 11 + i);
      const fil = weeks.map(() => 0), hrs = weeks.map(() => 0);
      for (const j of all) { const w = weeks.indexOf(Math.floor((j.start_time || 0) / WEEK)); if (w >= 0) { fil[w] += (j.filament_used || 0) / 1000; hrs[w] += (j.print_duration || 0) / 3600; } }
      const label = w => new Date(w * WEEK * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
      c1 ||= echarts.init(c.q(".pb-hc1")); c2 ||= echarts.init(c.q(".pb-hc2"));
      const txt = { color: "#8f8b99", fontSize: 11 };
      c1.setOption({ tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: txt }, series: [{ type: "pie", radius: ["45%", "70%"], center: ["50%", "42%"], label: { show: false },
        data: Object.entries(count).map(([k, v]) => ({ name: (RESULT[k] || [k])[0], value: v, itemStyle: { color: COL[k] || "#90cdf4" } })) }] });
      c2.setOption({ tooltip: { trigger: "axis" }, legend: { top: 0, textStyle: txt }, grid: { left: 40, right: 40, top: 28, bottom: 24 },
        xAxis: { type: "category", data: weeks.map(label), axisLabel: txt },
        yAxis: [{ type: "value", name: "m", axisLabel: txt, nameTextStyle: txt, splitLine: { lineStyle: { color: "rgba(127,127,140,.15)" } } }, { type: "value", name: "h", axisLabel: txt, nameTextStyle: txt, splitLine: { show: false } }],
        series: [{ name: "Filament (m)", type: "bar", data: fil.map(v => +v.toFixed(1)), itemStyle: { color: "#ff8a1f" } },
                 { name: "Print hours", type: "line", yAxisIndex: 1, data: hrs.map(v => +v.toFixed(1)), itemStyle: { color: "#4fd1c5" }, showSymbol: false }] });
      const done = all.filter(j => j.status === "completed"), avg = done.length ? done.reduce((a, j) => a + (j.print_duration || 0), 0) / done.length : 0;
      c.q(".pb-hcnums").textContent = `${all.length} prints · ${all.length ? Math.round(done.length / all.length * 100) : 0}% finished · average finished print ${avg ? fmtDur(avg) : "—"}`;
      c1.resize(); c2.resize();
    };
  return { destroy() { c1?.dispose(); c2?.dispose(); } };
};
