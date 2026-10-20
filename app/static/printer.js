// Printer Buddy - printer dashboard (UI v2): top bar, left rail, cards you can move, hide and collapse.
// Our own code; Fluidd/Mainsail were only a reference for which features a dashboard should have.
// Loaded after the main script in index.html and builds on its functions (renderPage, showTab, conAdd, gcode...).
(() => {
  const page = $("#page");
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
                  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  let chart = null, series = {}, lastPush = 0, tempsKey = "";   // thermals state (declared early: the layout code resizes the chart)
  const ICON = p => `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  // ---- top bar -------------------------------------------------------------
  const head = page.querySelector(".pg-head");
  const top = el("div", "pb-top");
  const editBtn = el("button", "adv", "Edit layout"); editBtn.id = "pbEdit"; editBtn.type = "button";
  const back = head.querySelector(".pg-back"), actions = el("div", "pb-actions");
  for (const n of back.childNodes) if (n.nodeType === 3 && n.textContent.trim()) n.replaceWith(el("span", "pb-backtxt", esc(n.textContent.trim())));
  actions.append(editBtn, $("#pgPause"), $("#pgCancel"), $("#pgStop"));
  top.append(back, $("#pgName"), $("#pgTag"), el("span", "pb-spacer"), actions);
  head.replaceWith(top);
  page.querySelector(".pg-tabs").hidden = true;

  // ---- rail + main ----------------------------------------------------------
  const wrap = el("div", "pb-wrap"), rail = el("nav", "pb-rail"), main = el("div", "pb-main");
  rail.setAttribute("aria-label", "Printer sections");
  const VIEWS = [
    ["status", "Dashboard", '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>', ""],
    ["console", "Console", '<path d="M4 17l6-5-6-5M12 19h8"/>', "adv"],
    ["files", "Files", '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>', "adv"],
    ["history", "History", '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>', "adv"],
    ["timelapse", "Timelapses", '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>', "vtl"],
  ];
  for (const [name, label, svg, cls] of VIEWS) {
    const b = el("button", cls, `${ICON(svg)}<span>${label}</span>`); b.type = "button"; b.dataset.view = name;
    b.onclick = () => showTab(name);
    rail.append(b);
  }
  wrap.append(rail, main);
  page.append(wrap);
  for (const id of ["pgStatus", "pgControl", "pgConsole", "pgFiles", "pgHistory", "pgTimelapse"]) main.append($("#" + id));
  const baseShowTab = showTab;
  showTab = name => {
    baseShowTab(name === "control" ? "status" : name);
    const shown = Object.entries({ status: "#pgStatus", console: "#pgConsole", files: "#pgFiles", history: "#pgHistory", timelapse: "#pgTimelapse" })
      .find(([, sel]) => !$(sel).hidden)?.[0] || "status";
    for (const b of rail.querySelectorAll("button")) b.setAttribute("aria-current", String(b.dataset.view === shown));
    if (shown === "status") chart?.resize();
  };

  // ---- cards ------------------------------------------------------------------
  const dash = $("#pgStatus");
  const side = dash.querySelector(".pg-side"), cambox = dash.querySelector(".pg-cambox");
  const statusHead = el("div", "pb-stathead");
  const thumb = el("img", "pb-thumb"); thumb.alt = ""; thumb.hidden = true;
  statusHead.append(thumb, $("#pgState").parentElement);
  const stats2 = el("dl", "pg-stats", `<div><dt>Layer</dt><dd id="pbLayer">—</dd></div><div><dt>Speed / flow</dt><dd id="pbSpeed">—</dd></div>`);
  const thermals = el("div", "", `<div class="pb-chart" id="pbChart"></div>
    <table class="pb-temps"><thead><tr><th>Name</th><th>Now</th><th>Target</th><th></th></tr></thead><tbody id="pbTemps"></tbody></table>
    <div class="pre adv" id="pbPresets"><button data-pbpre="210,60">PLA</button><button data-pbpre="240,80">PETG</button><button data-pbpre="250,100">ABS</button><button data-pbpre="0,0">Cool down</button></div>`);
  const tool = el("div", "", `<div class="pb-pos" id="pbPos">X — · Y — · Z —</div>`);
  for (const h of ["#ctlMoveH", "#ctlSpeedH"]) { const sec = $(h).closest("section"); sec.className = "pb-sub"; tool.append(sec); }
  tool.id = "pbToolhead";
  const macros = el("div", "", `<div class="pb-macros" id="pbMacros"><span class="muted">Loading…</span></div>
    <div class="pb-maclinks"><button type="button" id="pbMacEdit">Hide some…</button><button type="button" id="pbMacShow" hidden></button></div>`);
  const mini = el("div", "", `<div class="con-log pb-minilog" id="pbMiniLog" role="log" aria-label="Klipper console"></div>
    <form class="pb-miniform" id="pbMiniForm"><input id="pbMiniInput" autocomplete="off" spellcheck="false" aria-label="G-code command" placeholder="G-code, e.g. G28"><button class="primary">Send</button></form>`);

  const CARDS = {
    status:   { title: "Status", body: [statusHead, side.querySelector(".pg-big"), side.querySelector(".pg-stats"), stats2] },
    camera:   { title: "Camera", body: [cambox], flush: true },
    thermals: { title: "Thermals", body: [thermals] },
    toolhead: { title: "Toolhead", body: [tool], cls: "adv" },
    macros:   { title: "Macros", body: [macros], cls: "adv" },
    ai:       { title: "AI watch", body: [$("#pgAi")], cls: "ai" },
    console:  { title: "Console", body: [mini], cls: "adv" },
  };
  const DEFAULT = { cols: [["camera", "thermals", "console"], ["status", "ai", "toolhead", "macros"]],
                    phone: ["status", "camera", "ai", "thermals", "toolhead", "macros", "console"], off: [], collapsed: [] };
  let layout = store.get("pb-layout-v1", null);
  if (!layout || !Array.isArray(layout.cols) || layout.cols.length !== 2) layout = structuredClone(DEFAULT);
  for (const id of Object.keys(CARDS)) if (!layout.cols.flat().includes(id)) layout.cols[0].push(id);   // cards added later
  layout.cols = layout.cols.map(c => c.filter(id => CARDS[id]));
  if (!Array.isArray(layout.phone)) layout.phone = [...DEFAULT.phone];                  // phones: one column, own order
  layout.phone = layout.phone.filter(id => CARDS[id]);
  for (const id of Object.keys(CARDS)) if (!layout.phone.includes(id)) layout.phone.push(id);
  const phone = matchMedia("(max-width: 760px)");

  const cardEl = {};
  for (const [id, c] of Object.entries(CARDS)) {
    const card = el("section", "pb-card" + (c.cls ? " " + c.cls : "") + (c.flush ? " pb-flush" : ""));
    card.dataset.card = id;
    const hdr = el("header", "", `<button type="button" class="pb-title"><svg class="pb-chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>${c.title}</button>
      <span class="pb-tools"><button type="button" data-t="up" title="Move up">↑</button><button type="button" data-t="down" title="Move down">↓</button>
      <button type="button" data-t="col" title="Move to the other column">⇄</button><button type="button" data-t="off">Hide</button></span>`);
    const body = el("div", "pb-cbody");
    for (const b of c.body) body.append(b);
    card.append(hdr, body);
    hdr.querySelector(".pb-title").onclick = () => toggle(layout.collapsed, id) || saveLayout();
    for (const b of hdr.querySelectorAll("[data-t]")) b.onclick = () => moveCard(id, b.dataset.t);
    cardEl[id] = card;
  }
  side.remove();
  dash.className = "pb-dash";
  const editbar = el("div", "pb-editbar", `<span>Move cards with ↑ ↓ ⇄, hide what you don't use. Saved in this browser.</span><span class="pb-spacer"></span>
    <button type="button" id="pbReset">Reset layout</button><button type="button" class="primary" id="pbDone">Done</button>`);
  main.insertBefore(editbar, dash);
  const cols = [el("div", "pb-col"), el("div", "pb-col")];
  dash.replaceChildren(...cols);

  function toggle(list, id) { const i = list.indexOf(id); i >= 0 ? list.splice(i, 1) : list.push(id); }
  function saveLayout() { store.set("pb-layout-v1", layout); drawLayout(); }
  function drawLayout() {
    if (phone.matches) { cols[0].replaceChildren(...layout.phone.map(id => cardEl[id])); cols[1].replaceChildren(); }
    else layout.cols.forEach((ids, i) => cols[i].replaceChildren(...ids.map(id => cardEl[id])));
    cols[1].hidden = phone.matches;
    for (const [id, card] of Object.entries(cardEl)) {
      card.classList.toggle("pb-off", layout.off.includes(id));
      card.classList.toggle("collapsed", layout.collapsed.includes(id));
      card.querySelector("[data-t=off]").textContent = layout.off.includes(id) ? "Show" : "Hide";
    }
    chart?.resize();
  }
  function moveCard(id, how) {
    const ci = layout.cols.findIndex(c => c.includes(id)), col = phone.matches ? layout.phone : layout.cols[ci], i = col.indexOf(id);
    // step past cards this setup never shows (e.g. AI off, Basic UI), so every click visibly moves the card
    const shown = j => j >= 0 && j < col.length && getComputedStyle(cardEl[col[j]]).display !== "none";
    let j = i + (how === "up" ? -1 : 1);
    while (j >= 0 && j < col.length && !shown(j)) j += how === "up" ? -1 : 1;
    if ((how === "up" || how === "down") && shown(j)) { col.splice(i, 1); col.splice(j, 0, id); }
    else if (how === "col" && !phone.matches) { col.splice(i, 1); layout.cols[1 - ci].push(id); }
    else if (how === "off") toggle(layout.off, id);
    saveLayout();
  }
  editBtn.onclick = () => page.classList.toggle("pb-editing");
  $("#pbDone").onclick = () => page.classList.remove("pb-editing");
  $("#pbReset").onclick = () => { layout = structuredClone(DEFAULT); saveLayout(); };
  phone.addEventListener("change", drawLayout);
  drawLayout();

  // ---- thermals: chart + table + presets ------------------------------------------------
  const COLORS = { extruder: "#FF8A1F", heater_bed: "#7C3AED" }, EXTRA = ["#C4A7FF", "#4FD1C5", "#F6E05E", "#FC8181", "#90CDF4", "#68D391"];
  const colorOf = (id, i) => COLORS[id] || EXTRA[i % EXTRA.length];
  const SPAN = 20 * 60 * 1000;
  if (window.echarts) {
    chart = echarts.init($("#pbChart"), null, { renderer: "canvas" });
    new ResizeObserver(() => chart.resize()).observe($("#pbChart"));
  } else {
    $("#pbChart").outerHTML = `<p class="muted">Chart unavailable (app/static/vendor/echarts.min.js missing).</p>`;
  }
  function drawChart() {
    if (!chart) return;
    const out = [], legend = [];
    Object.entries(series).forEach(([id, s], i) => {
      const color = colorOf(id, i);
      legend.push(s.name);
      out.push({ name: s.name, type: "line", showSymbol: false, data: s.temp, lineStyle: { width: 2, color }, itemStyle: { color } });
      if (s.hasTarget) out.push({ name: s.name + " target", type: "line", showSymbol: false, data: s.target,
                                  lineStyle: { width: 1.5, type: "dashed", color, opacity: .6 }, itemStyle: { color } });
    });
    chart.setOption({
      backgroundColor: "transparent", animation: false,
      textStyle: { color: "#8E8A99", fontFamily: "inherit" },
      grid: { left: 44, right: 14, top: 34, bottom: 26 },
      legend: { data: legend, top: 0, textStyle: { color: "#F4F2F8" }, icon: "roundRect", itemHeight: 8 },
      tooltip: { trigger: "axis", backgroundColor: "#1F1E24", borderColor: "#26242C", textStyle: { color: "#F4F2F8" },
                 valueFormatter: v => v == null ? "—" : `${v.toFixed(1)}°` },
      xAxis: { type: "time", axisLine: { lineStyle: { color: "#26242C" } }, splitLine: { show: false },
               axisLabel: { formatter: v => new Date(v).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) } },
      yAxis: { type: "value", min: 0, axisLabel: { formatter: "{value}°" }, splitLine: { lineStyle: { color: "#26242C" } } },
      series: out,
    }, { replaceMerge: ["series"] });
  }
  async function loadHistory(id) {
    series = {}; lastPush = 0;
    try {
      const { history, sensors } = await api(`/api/printers/${id}/temps`);
      const now = Date.now();
      for (const s of sensors.filter(s => s.kind !== "fan")) {
        const h = history[s.id] || {}, temps = h.temperatures || [], targets = h.targets || [];
        const t0 = now - (temps.length - 1) * 1000;
        series[s.id] = { name: s.name, hasTarget: s.target != null,
                         temp: temps.map((v, i) => [t0 + i * 1000, v]), target: targets.map((v, i) => [t0 + i * 1000, v]) };
      }
    } catch {}
    if (id === pageId) drawChart();
  }
  function pushLive(p) {
    if (!chart || Date.now() - lastPush < 1000 || !p.sensors?.length) return;
    const now = lastPush = Date.now();
    p.sensors.filter(s => s.kind !== "fan" && s.temp != null).forEach(s => {
      const ser = series[s.id] ||= { name: s.name, hasTarget: s.target != null, temp: [], target: [] };
      ser.temp.push([now, s.temp]); if (ser.hasTarget) ser.target.push([now, s.target ?? 0]);
      while (ser.temp.length && ser.temp[0][0] < now - SPAN) ser.temp.shift();
      while (ser.target.length && ser.target[0][0] < now - SPAN) ser.target.shift();
    });
    drawChart();
  }
  const heaterCmd = (s, v) => s.id.startsWith("temperature_fan ")
    ? `SET_TEMPERATURE_FAN_TARGET TEMPERATURE_FAN=${s.id.slice(16)} TARGET=${v}`
    : `SET_HEATER_TEMPERATURE HEATER=${s.id.startsWith("heater_generic ") ? s.id.slice(15) : s.id} TARGET=${v}`;
  function drawTemps(p) {
    const list = p.sensors || [], body = $("#pbTemps"), live = p.connection === "online" && p.klippy_state === "ready";
    const key = list.map(s => s.id).join("|");
    if (key !== tempsKey) {
      tempsKey = key;
      const heatIdx = list.filter(x => x.kind !== "fan").map(x => x.id);   // same order and colours as the chart
      body.innerHTML = list.length ? list.map(s => `<tr data-s="${esc(s.id)}">
        <td><span class="dot" style="background:${s.kind === "fan" ? "var(--track)" : colorOf(s.id, heatIdx.indexOf(s.id))}"></span>${esc(s.name)}</td>
        <td class="num" data-f="now"></td>
        <td>${s.target != null ? `<input type="number" min="0" max="400" inputmode="numeric" aria-label="${esc(s.name)} target °C" class="adv-in">` : `<span class="muted" data-f="tgt"></span>`}</td>
        <td class="muted" data-f="extra"></td></tr>`).join("")
        : `<tr><td colspan="4" class="muted">No temperatures (printer offline?)</td></tr>`;
      for (const row of body.querySelectorAll("tr[data-s]")) {
        const inp = row.querySelector("input"); if (!inp) continue;
        inp.onkeydown = e => {
          if (e.key !== "Enter" || inp.value === "") return;
          const s = (printers.get(pageId)?.sensors || []).find(x => x.id === row.dataset.s);
          if (s) { gcode(heaterCmd(s, Math.max(0, Math.round(+inp.value)))); inp.value = ""; inp.blur(); }
        };
      }
    }
    for (const s of list) {
      const row = body.querySelector(`tr[data-s="${CSS.escape(s.id)}"]`); if (!row) continue;
      row.querySelector("[data-f=now]").textContent = !live ? "—" : s.kind === "fan" ? `${Math.round((s.speed || 0) * 100)}%` : s.temp != null ? `${s.temp.toFixed(1)}°` : "—";
      const inp = row.querySelector("input");
      if (inp) { inp.placeholder = s.target ? `${Math.round(s.target)}°` : "off"; inp.disabled = !live || isBasic(); }
      row.querySelector("[data-f=extra]").textContent = s.kind === "heater" && s.power != null ? `${Math.round(s.power * 100)}% power` : "";
    }
  }
  for (const b of document.querySelectorAll("[data-pbpre]")) b.onclick = () => {
    const [n, bed] = b.dataset.pbpre.split(",").map(Number);
    gcode(`SET_HEATER_TEMPERATURE HEATER=extruder TARGET=${n}\nSET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=${bed}`);
    toast(n ? `Heating: nozzle ${n}°, bed ${bed}°` : "Heaters off");
  };

  // ---- macros ------------------------------------------------------------------------------
  let macroList = [], macroFor = null, macroCount = -1;
  const hiddenMacros = () => store.get("pb-macros-hidden", {})[pageId] || [];
  async function loadMacros(id) {
    macroFor = id;
    try { macroList = (await api(`/api/printers/${id}/macros`)).macros || []; } catch { macroList = []; }
    if (id === pageId) drawMacros();
  }
  function drawMacros() {
    const hid = hiddenMacros(), box = $("#pbMacros");
    const shown = macroList.filter(m => !hid.includes(m.name));
    box.innerHTML = shown.length ? shown.map(m => `<span class="pb-mac"><button type="button" data-mac="${esc(m.name)}" title="${esc(m.description || m.name)}">${esc(m.name.replaceAll("_", " "))}</button><button type="button" class="x" data-machide="${esc(m.name)}" title="Hide">✕</button></span>`).join("")
      : `<span class="muted">${macroList.length ? "All macros are hidden." : "No macros on this printer."}</span>`;
    const show = $("#pbMacShow"); show.hidden = !hid.length; show.textContent = `Show hidden (${hid.length})`;
    for (const b of box.querySelectorAll("[data-mac]")) b.onclick = () => {
      const p = printers.get(pageId); if (!p) return;
      if ((p.state === "printing" || p.state === "paused") && !confirm(`Run ${b.dataset.mac} while a print is running?`)) return;
      gcode(b.dataset.mac); toast(`Sent ${b.dataset.mac}`);
    };
    for (const b of box.querySelectorAll("[data-machide]")) b.onclick = () => {
      const all = store.get("pb-macros-hidden", {}); (all[pageId] ||= []).push(b.dataset.machide); store.set("pb-macros-hidden", all); drawMacros();
    };
  }
  $("#pbMacEdit").onclick = () => { const on = macros.classList.toggle("pb-macedit"); $("#pbMacEdit").textContent = on ? "Done" : "Hide some…"; };
  $("#pbMacShow").onclick = () => { const all = store.get("pb-macros-hidden", {}); delete all[pageId]; store.set("pb-macros-hidden", all); drawMacros(); };

  // ---- mini console ------------------------------------------------------------------------
  function drawMini() {
    const box = $("#pbMiniLog"), log = (conLogs.get(pageId) || []).slice(-60);
    box.innerHTML = log.length ? "" : `<div class="empty">Klipper's replies show up here.</div>`;
    for (const { kind, text } of log) { const d = el("div", kind); d.textContent = text; box.append(d); }
    box.scrollTop = box.scrollHeight;
  }
  const baseConAdd = conAdd;
  conAdd = (id, kind, text) => { baseConAdd(id, kind, text); if (id === pageId) drawMini(); };
  $("#pbMiniForm").onsubmit = e => { e.preventDefault(); const v = $("#pbMiniInput").value; $("#pbMiniInput").value = ""; conSend(v); };

  // ---- status extras + toolhead -------------------------------------------------------------
  let thumbFile = null;
  function drawStatus(p) {
    const file = p.filename && (p.state === "printing" || p.state === "paused" || p.state === "complete") ? p.filename : null;
    if (file !== thumbFile) {
      thumbFile = file; thumb.hidden = true;
      if (file) { thumb.onload = () => { thumb.hidden = false; }; thumb.onerror = () => { thumb.hidden = true; };
                  thumb.src = `/api/printers/${p.id}/thumbnail?file=${encodeURIComponent(file)}`; }
      else thumb.removeAttribute("src");
    }
    $("#pbLayer").textContent = p.layer != null && p.total_layers ? `${p.layer} / ${p.total_layers}` : "—";
    $("#pbSpeed").textContent = p.speed_factor != null ? `${Math.round(p.speed_factor * 100)}% / ${Math.round((p.extrude_factor ?? 1) * 100)}%` : "—";
    const pos = p.position || [];
    $("#pbPos").textContent = pos[0] == null ? "X — · Y — · Z —" : `X ${(+pos[0]).toFixed(1)} · Y ${(+pos[1]).toFixed(1)} · Z ${(+pos[2]).toFixed(2)}`;
  }

  // ---- hook into the main page ---------------------------------------------------------------
  const baseRenderPage = renderPage;
  renderPage = () => {
    baseRenderPage();
    const p = pageId !== null && printers.get(pageId);
    if (!p) return;
    drawStatus(p); drawTemps(p); pushLive(p);
    if (macroFor !== pageId || p.macro_count !== macroCount) { macroCount = p.macro_count; if (p.connection === "online") loadMacros(pageId); }
  };
  const baseRoute = route;
  route = () => {
    tempsKey = ""; thumbFile = null; macroFor = null; macroCount = -1;
    baseRoute();
    if (pageId !== null) { loadHistory(pageId); drawMini(); showTab("status"); }
  };
  window.removeEventListener("hashchange", baseRoute);   // the main script listens with the original route
  window.addEventListener("hashchange", route);
})();
