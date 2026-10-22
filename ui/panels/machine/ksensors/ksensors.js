(() => {
  const COLORS = ["#ff8a1f", "#4fd1c5", "#c4a7ff", "#f6ad55", "#90cdf4", "#f87171", "#a3e635"];
  const txt = { color: "#8f8b99", fontSize: 10 };
  const get = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
  const ref = r => { const i = r.indexOf("."); return [r.slice(0, i), r.slice(i + 1)]; };   // "extruder.target" -> [object, field]
  const refs = f => (f || "").match(/\{[^}]+\}/g)?.map(r => r.slice(1, -1).trim()) || [];
  const num = v => +(+v).toFixed(4);
  const live = new Map();   // setup (as JSON) -> the min / max each axis is showing now, for the setup box

  // ---- formula -> function({ x, ref(name) }) ----
  function compile(src) {
    src = (src || "").trim(); if (!src) return c => c.x;
    const toks = src.match(/\{[^}]+\}|\d*\.?\d+(?:e[+-]?\d+)?|[a-z_]+|\S/gi) || [];
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    const bin = (sub, ops) => () => {
      let l = sub();
      while (ops.includes(peek())) {
        const op = next(), a = l, b = sub();
        l = { "+": c => a(c) + b(c), "-": c => a(c) - b(c), "*": c => a(c) * b(c), "/": c => a(c) / b(c) }[op];
      }
      return l;
    };
    const atom = () => {
      const t = next();
      if (t === "-") { const a = atom(); return c => -a(c); }
      if (t === "(") { const a = expr(); if (next() !== ")") throw new Error("a ( is missing its )"); return a; }
      if (t === "x") return c => c.x;
      if (t?.startsWith("{")) { const r = t.slice(1, -1).trim(); if (!r.includes(".")) throw new Error(`write ${t} as {object.field}`); return c => c.ref(r); }
      if (t != null && !isNaN(+t)) { const n = +t; return () => n; }
      throw new Error(t == null ? "the formula ends too early" : `don't understand "${t}"`);
    };
    const term = bin(atom, ["*", "/"]), expr = bin(term, ["+", "-"]);
    const f = expr(); if (i < toks.length) throw new Error(`don't understand "${toks[i]}"`);
    return f;
  }

  function create(host, cfg) {
    const key = JSON.stringify(cfg);
    host.innerHTML = `<div class="pb-cc" style="height:${cfg.height}px"></div><p class="pb-muted pb-ccmsg"></p>`;
    const box = host.querySelector(".pb-cc"), msg = t => { host.querySelector(".pb-ccmsg").textContent = t; };
    const fns = cfg.lines.map(l => { try { return compile(l.formula); } catch { return () => NaN; } });
    const objs = [...new Set(cfg.lines.flatMap(l => [l.obj, ...refs(l.formula).map(r => ref(r)[0])]))];
    let data = cfg.lines.map(() => []), chart = null, timer = null, busy = false;
    if (!cfg.lines.length) msg("Nothing picked yet: click ⚙ on this panel to pick values.");
    async function poll() {
      if (pageId === null || busy || !objs.length) return;
      busy = true;
      try {
        const st = (await PB.rpc("printer.objects.query", { objects: Object.fromEntries(objs.map(o => [o, null])) }))?.status || {};
        const now = Date.now(), cut = now - cfg.minutes * 60000;
        cfg.lines.forEach((l, i) => {
          const v = fns[i]({ x: +get(st[l.obj], l.field), ref: r => +get(st[ref(r)[0]], ref(r)[1]) });
          if (Number.isFinite(v)) data[i].push([now, v]);
          while (data[i].length && data[i][0][0] < cut) data[i].shift();
        });
        msg(""); draw();
      } catch (e) { msg(e.message); }
      busy = false;
    }
    function draw() {
      if (!window.echarts || box.offsetParent === null) return;
      chart ||= echarts.init(box, null, { renderer: "canvas" });
      const right = cfg.lines.some(l => l.axis === 1);
      const lim = v => v === "" || v == null ? undefined : +v;
      chart.setOption({
        animation: false, grid: { left: 50, right: right ? 50 : 14, top: 30, bottom: 24 },
        tooltip: { trigger: "axis", valueFormatter: v => v == null ? "" : String(num(v)) },
        legend: { top: 0, textStyle: { color: "#8f8b99", fontSize: 11 } },
        xAxis: { type: "time", axisLabel: txt, splitLine: { show: false } },
        yAxis: cfg.axes.map((a, i) => ({ type: "value", name: a.unit, position: i ? "right" : "left", show: !i || right, scale: true, min: lim(a.min), max: lim(a.max),
                                        axisLabel: txt, nameTextStyle: txt, splitLine: { show: !i, lineStyle: { color: "rgba(127,127,140,.15)" } } })),
        series: cfg.lines.map((l, i) => ({ type: "line", name: l.name, yAxisIndex: l.axis, showSymbol: false, data: data[i],
                                          lineStyle: { color: l.color, width: 1.5 }, itemStyle: { color: l.color } })),
      });
      live.set(key, cfg.axes.map((_, i) => chart.getModel().getComponent("yAxis", i)?.axis.scale.getExtent().map(num)));
    }
    const ro = new ResizeObserver(() => chart?.resize()); ro.observe(box);
    timer = setInterval(poll, 1000);
    return {
      open() { data = cfg.lines.map(() => []); chart?.clear(); },
      shown() { chart?.resize(); draw(); },
      destroy() { clearInterval(timer); ro.disconnect(); chart?.dispose(); live.delete(key); },
    };
  }

  const dlg = PB.x.dialog("pb-ccedit");
  function edit(cfg, done) {
    dlg.innerHTML = `<div class="pb-ptop"><h3>Klipper sensors setup</h3><button type="button" class="pb-px" aria-label="Close">${PB.ic.x}</button></div>
      <h4>1. Values to show</h4>
      <p class="pb-muted pb-cchint">Each value is one line on the chart.</p>
      <div class="pb-cclines"></div>
      <button type="button" data-a="add">+ Add values from the printer</button>
      <div class="pb-ccpick" hidden></div>
      <h4>2. Axes</h4>
      <p class="pb-muted pb-cchint">Leave min / max empty to fit the values automatically.</p>
      <div class="pb-ccaxes">${["Left", "Right"].map((n, i) => `<b>${n}</b>
        <label>Unit <input data-ax="${i}" data-f="unit" placeholder="e.g. °C"></label>
        <label>Min <input data-ax="${i}" data-f="min" inputmode="decimal"></label>
        <label>Max <input data-ax="${i}" data-f="max" inputmode="decimal"></label>`).join("")}</div>
      <h4>3. Size</h4>
      <div class="pb-ccsize"><label class="bd-field">Height <select data-k="height"><option value="200">Small</option><option value="280">Medium</option><option value="400">Large</option></select></label>
        <label class="bd-field">Show the last <select data-k="minutes"><option value="1">1 minute</option><option value="5">5 minutes</option><option value="15">15 minutes</option>
          <option value="30">30 minutes</option><option value="60">1 hour</option></select></label></div>
      <p class="pb-ccerr" hidden></p>
      <div class="bd-libfoot"><button type="button" data-a="cancel">Cancel</button><button type="button" class="bd-primary" data-a="save">Save</button></div>`;
    const q = s => dlg.querySelector(s), lines = q(".pb-cclines"), pick = q(".pb-ccpick");
    q("[data-k=height]").value = cfg.height; q("[data-k=minutes]").value = cfg.minutes;
    // empty min / max = auto: show what the chart is using now; left untouched they stay auto
    const now = live.get(JSON.stringify(cfg)), right = cfg.lines.some(l => l.axis === 1);
    for (const x of dlg.querySelectorAll("[data-ax]")) {
      x.value = cfg.axes[x.dataset.ax][x.dataset.f] ?? "";
      const auto = now?.[x.dataset.ax]?.[x.dataset.f === "min" ? 0 : 1];
      if (x.value === "" && x.dataset.f !== "unit" && auto != null && (x.dataset.ax === "0" || right)) {
        x.value = auto; x.dataset.auto = "1"; x.oninput = () => { delete x.dataset.auto; };
      }
    }
    function drawLines() {
      lines.innerHTML = cfg.lines.map((l, i) => `<div class="pb-ccline" data-i="${i}">
          <input type="color" data-f="color" value="${l.color}" aria-label="Line colour">
          <input data-f="name" value="${esc(l.name)}" aria-label="Line name">
          <select data-f="axis" aria-label="Axis"><option value="0">Left axis</option><option value="1"${l.axis ? " selected" : ""}>Right axis</option></select>
          <button type="button" data-x title="Remove this line" aria-label="Remove">${PB.ic.x}</button>
          <small class="pb-muted">${esc(l.obj)} → ${esc(l.field)}</small>
          <input data-f="formula" value="${esc(l.formula)}" placeholder="Formula (optional), e.g. x / 1000" aria-label="Formula"></div>`).join("")
        || `<p class="pb-muted">No values yet.</p>`;
      for (const row of lines.querySelectorAll("[data-i]")) {
        const l = cfg.lines[row.dataset.i];
        for (const x of row.querySelectorAll("[data-f]")) x.oninput = () => { l[x.dataset.f] = x.dataset.f === "axis" ? +x.value : x.value; };
        row.querySelector("[data-x]").onclick = () => { cfg.lines.splice(row.dataset.i, 1); drawLines(); };
      }
    }
    async function objects() {
      pick.hidden = false; pick.innerHTML = `<p class="pb-muted">Loading…</p>`;
      let all;
      try { all = ((await PB.rpc("printer.objects.list"))?.objects || []).sort(); } catch (e) { pick.innerHTML = `<p class="pb-muted">${esc(e.message)}</p>`; return; }
      pick.innerHTML = `<input type="search" placeholder="Find an object, e.g. cartographer" aria-label="Find an object"><div class="pb-ccobjs"></div>`;
      const find = pick.querySelector("input"), list = pick.querySelector(".pb-ccobjs");
      const show = () => {
        const t = find.value.trim().toLowerCase();
        list.innerHTML = all.filter(o => !t || o.toLowerCase().includes(t)).map(o => `<button type="button" data-o="${esc(o)}">${esc(o)}</button>`).join("") || `<p class="pb-muted">No match.</p>`;
        for (const b of list.querySelectorAll("[data-o]")) b.onclick = () => fields(b.dataset.o);
      };
      find.oninput = show; show(); find.focus();
    }
    async function fields(o) {
      pick.innerHTML = `<p class="pb-muted">Loading ${esc(o)}…</p>`;
      let st;
      try { st = (await PB.rpc("printer.objects.query", { objects: { [o]: null } }))?.status?.[o] || {}; } catch (e) { pick.innerHTML = `<p class="pb-muted">${esc(e.message)}</p>`; return; }
      const flat = (v, pre, out = []) => {
        for (const [k, x] of Object.entries(v || {})) {
          if (typeof x === "number") out.push([pre + k, x]);
          else if (x && typeof x === "object" && !Array.isArray(x) && !pre) flat(x, k + ".", out);
        }
        return out;
      };
      const nums = flat(st, "");
      pick.innerHTML = `<div class="pb-ccpt"><button type="button" data-a="back">← Objects</button><b>${esc(o)}</b></div>
        ${nums.map(([k, v]) => `<label class="bd-check"><input type="checkbox" value="${esc(k)}"> ${esc(k)} <span class="pb-muted">${num(v)}</span></label>`).join("")
          || `<p class="pb-muted">${esc(o)} has no number values to chart.</p>`}
        <div class="pb-ccpt"><button type="button" data-a="take" class="bd-primary"${nums.length ? "" : " hidden"}>Add ticked values</button></div>`;
      pick.querySelector("[data-a=back]").onclick = objects;
      pick.querySelector("[data-a=take]").onclick = () => {
        for (const c of pick.querySelectorAll("input:checked")) {
          cfg.lines.push({ obj: o, field: c.value, name: `${o.split(" ").pop()} ${c.value}`, color: COLORS[cfg.lines.length % COLORS.length], axis: 0, formula: "" });
        }
        pick.hidden = true; drawLines();
      };
    }
    q("[data-a=add]").onclick = () => pageId === null ? toast("Open a printer first") : objects();
    q(".pb-px").onclick = q("[data-a=cancel]").onclick = () => dlg.close();
    q("[data-a=save]").onclick = () => {
      const err = q(".pb-ccerr");
      for (const l of cfg.lines) {
        try { compile(l.formula); } catch (e) { err.hidden = false; err.textContent = `"${l.name}" formula: ${e.message}`; return; }
      }
      cfg.height = +q("[data-k=height]").value; cfg.minutes = +q("[data-k=minutes]").value;
      for (const x of dlg.querySelectorAll("[data-ax]")) cfg.axes[x.dataset.ax][x.dataset.f] = x.dataset.auto ? "" : x.value.trim();
      dlg.close(); done(cfg);
    };
    drawLines(); dlg.showModal();
  }

  const blank = () => ({ height: 280, minutes: 5, lines: [], axes: [{ unit: "", min: "", max: "" }, { unit: "", min: "", max: "" }] });
  const full = cfg => ({ ...blank(), ...structuredClone(cfg || {}) });
  PB.panel("ksensors", {
    title: "Klipper sensors", desc: "Live chart of any Klipper values, e.g. Cartographer temperature and frequency", cls: "adv",
    gear: true,
    icon: PB.icon('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    edit: (cfg, save) => edit(full(cfg), save),
    create: (host, cfg) => create(host, full(cfg)),
  });
})();
