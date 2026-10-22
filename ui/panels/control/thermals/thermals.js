PB.panel("thermals", {
  title: "Thermals", desc: "Temperatures table, presets and history chart",
  icon: PB.icon('<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>'),
  gear: true,
  settings: [
    { k: "table", label: "Show the table", type: "check", def: true },
    { k: "presets", label: "Show presets (PLA / PETG / ABS / your own)", type: "check", def: true },
    { k: "chart", label: "Show the chart", type: "check", def: true },
    { k: "span", label: "Chart length", type: "select", def: 20, options: [[10, "10 minutes"], [20, "20 minutes"], [60, "1 hour"]] },
    { k: "height", label: "Chart height", type: "select", def: 180, options: [[120, "Small"], [180, "Medium"], [280, "Tall"]] },
  ],
  create(host, cfg) {
    host.innerHTML = `<table class="pb-temps"><thead><tr><th>Name</th><th class="r">Power</th><th class="r">Actual</th><th class="r">Target</th></tr></thead><tbody></tbody></table>
      <div class="pb-pres adv"></div>
      <div class="pb-chart"></div>`;
    const body = host.querySelector("tbody"), chartEl = host.querySelector(".pb-chart");
    host.querySelector(".pb-temps").hidden = !cfg.table;
    if (!cfg.presets) host.querySelector(".pb-pres").remove();
    chartEl.style.height = `${cfg.height}px`;
    if (!cfg.chart) chartEl.remove();
    const COLORS = { extruder: "#FF8A1F", heater_bed: "#8B5CF6" }, EXTRA = ["#4FD1C5", "#F6E05E", "#FC8181", "#90CDF4", "#68D391", "#C4A7FF"];
    const SPAN = cfg.span * 60 * 1000;
    let chart = null, series = {}, lastPush = 0, key = "", order = [];
    const hidden = new Set(PB.store.get("pb-thermals-hidden", []));
    const colorOf = id => COLORS[id] || EXTRA[Math.max(0, order.indexOf(id) - (order.includes("extruder") ? 1 : 0) - (order.includes("heater_bed") ? 1 : 0)) % EXTRA.length];
    if (!cfg.chart) { }
    else if (window.echarts) {
      chart = echarts.init(chartEl, null, { renderer: "canvas" });
      new ResizeObserver(() => chart.resize()).observe(chartEl);
    } else chartEl.innerHTML = `<p class="pb-muted">Chart unavailable (vendor/echarts.min.js missing).</p>`;

    function draw() {
      if (!chart) return;
      const out = [], legend = [];
      for (const [id, s] of Object.entries(series)) {
        if (hidden.has(id)) continue;
        const color = colorOf(id);
        legend.push(s.name);
        out.push({ name: s.name, type: "line", showSymbol: false, data: s.temp, lineStyle: { width: 2, color }, itemStyle: { color } });
        if (s.hasTarget) out.push({ name: s.name + " target", type: "line", showSymbol: false, data: s.target,
                                    lineStyle: { width: 1, type: "dashed", color, opacity: .6 }, itemStyle: { color } });
      }
      chart.setOption({
        backgroundColor: "transparent", animation: false, textStyle: { color: "#8F8B99", fontFamily: "inherit", fontSize: 11 },
        grid: { left: 38, right: 8, top: 26, bottom: 22 },
        legend: { data: legend, top: 0, textStyle: { color: "#C9C6D1", fontSize: 11 }, icon: "roundRect", itemHeight: 6, itemWidth: 12 },
        tooltip: { trigger: "axis", backgroundColor: "#232327", borderColor: "#2C2C31", textStyle: { color: "#E8E6EC" },
                   valueFormatter: v => v == null ? "—" : `${v.toFixed(1)}°` },
        xAxis: { type: "time", axisLine: { lineStyle: { color: "#2C2C31" } }, splitLine: { show: false },
                 axisLabel: { formatter: v => new Date(v).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) } },
        yAxis: { type: "value", min: 0, axisLabel: { formatter: "{value}°" }, splitLine: { lineStyle: { color: "#2C2C31" } } },
        series: out,
      }, { replaceMerge: ["series"] });
    }
    const cmd = (s, v) => s.id.startsWith("temperature_fan ")
      ? `SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=${s.id.slice(16)} TARGET=${v}`
      : `SET_HEATER_TEMPERATURE HEATER=${s.id.startsWith("heater_generic ") ? s.id.slice(15) : s.id} TARGET=${v}`;
    const presets = PB.parts.thermalsPresets(host, cmd);
    return {
      async open(id) {
        series = {}; lastPush = 0; key = "";
        presets.load(id);
        try {
          const { history, sensors } = await api(`/api/printers/${id}/temps`);
          if (id !== pageId) return;
          const now = Date.now();
          for (const s of sensors.filter(s => s.kind !== "fan")) {
            const h = history[s.id] || {}, keep = SPAN / 1000;
            const temps = (h.temperatures || []).slice(-keep), targets = (h.targets || []).slice(-keep), t0 = now - (temps.length - 1) * 1000;
            series[s.id] = { name: s.name, hasTarget: s.target != null, temp: temps.map((v, i) => [t0 + i * 1000, v]),
                             target: targets.map((v, i) => [t0 + i * 1000, v]) };
          }
        } catch {}
        draw();
      },
      shown() { chart?.resize(); },
      update(p) {
        const list = (p.sensors || []).filter(s => s.kind !== "fan"), live = p.connection === "online" && p.klippy_state === "ready";
        const k = list.map(s => s.id).join("|");
        if (k !== key) {
          key = k; order = list.map(s => s.id);
          body.innerHTML = list.length ? list.map(s => `<tr data-s="${esc(s.id)}"${hidden.has(s.id) ? ' class="off"' : ""}><td><button type="button" class="pb-tname" title="Show or hide on the graph"><span class="dot" style="background:${colorOf(s.id)}"></span>${esc(s.name)}</button></td>
            <td class="r pb-muted" data-f="pw"></td><td class="r" data-f="now"></td>
            <td class="r">${s.target != null ? `<input type="number" min="0" max="400" inputmode="numeric" aria-label="${esc(s.name)} target °C">` : `<span class="pb-muted">—</span>`}</td></tr>`).join("")
            : `<tr><td colspan="4" class="pb-muted">No temperatures (printer offline?)</td></tr>`;
          for (const row of body.querySelectorAll("tr[data-s]")) {
            row.querySelector(".pb-tname").onclick = () => {
              const id = row.dataset.s;
              if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
              PB.store.set("pb-thermals-hidden", [...hidden]);
              row.classList.toggle("off", hidden.has(id));
              draw();
            };
            const inp = row.querySelector("input"); if (!inp) continue;
            inp.onkeydown = e => {
              if (e.key !== "Enter" || inp.value === "") return;
              const s = (PB.current()?.sensors || []).find(x => x.id === row.dataset.s);
              if (s) { gcode(cmd(s, Math.max(0, Math.round(+inp.value)))); inp.value = ""; inp.blur(); }
            };
          }
        }
        for (const s of list) {
          const row = body.querySelector(`tr[data-s="${CSS.escape(s.id)}"]`); if (!row) continue;
          row.querySelector("[data-f=now]").textContent = !live ? "—" : s.temp != null ? `${s.temp.toFixed(1)}°` : "—";
          row.querySelector("[data-f=pw]").textContent = live && s.kind === "heater" && s.power != null ? `${Math.round(s.power * 100)}%` : "";
          const inp = row.querySelector("input");
          if (inp) { if (document.activeElement !== inp) inp.placeholder = s.target ? `${Math.round(s.target)}` : "off"; inp.disabled = !live || isBasic(); }
        }
        if (!chart || Date.now() - lastPush < 1000 || !live) return;
        const now = lastPush = Date.now();
        for (const s of list) {
          if (s.temp == null) continue;
          const ser = series[s.id] ||= { name: s.name, hasTarget: s.target != null, temp: [], target: [] };
          ser.temp.push([now, s.temp]); if (ser.hasTarget) ser.target.push([now, s.target ?? 0]);
          while (ser.temp.length && ser.temp[0][0] < now - SPAN) ser.temp.shift();
          while (ser.target.length && ser.target[0][0] < now - SPAN) ser.target.shift();
        }
        if (chartEl.offsetParent) draw();
      },
      destroy() { chart?.dispose(); presets.destroy(); },
    };
  },
});
