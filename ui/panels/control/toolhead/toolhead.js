PB.panel("toolhead", {
  title: "Toolhead", desc: "Position, home, jog, move to and print speed", cls: "adv", gear: true,
  icon: PB.icon('<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>'),
  settings: [
    { k: "style", label: "Layout", type: "select", def: "cross", options: [["cross", "Cross (arrows)"], ["bars", "Bars (one row per axis)"], ["circle", "Circle (jog wheel)"]] },
    { k: "jog", label: "Show home + jog buttons", type: "check", def: true },
    { k: "speed", label: "Show the speed slider", type: "check", def: true },
    { k: "moveto", label: "Show the X / Y / Z position boxes (type a position to move there)", type: "check", def: true },
    { k: "steps", label: "Jog distances (mm)", type: "select", def: "0.1,1,10,50", options: [["0.1,1,10,50", "0.1 · 1 · 10 · 50"], ["0.1,1,10,100", "0.1 · 1 · 10 · 100"],
      ["0.05,0.5,5,25", "0.05 · 0.5 · 5 · 25"], ["1,5,10,50", "1 · 5 · 10 · 50"], ["0.01,0.1,1,10", "0.01 · 0.1 · 1 · 10"]] },
    { k: "fxy", label: "Jog speed X / Y", type: "select", def: 100, options: [[50, "50 mm/s"], [100, "100 mm/s"], [200, "200 mm/s"], [300, "300 mm/s"]] },
    { k: "fz", label: "Jog speed Z", type: "select", def: 10, options: [[5, "5 mm/s"], [10, "10 mm/s"], [20, "20 mm/s"], [30, "30 mm/s"]] },
    { k: "invx", label: "Invert X buttons", type: "check", def: false },
    { k: "invy", label: "Invert Y buttons", type: "check", def: false },
    { k: "invz", label: "Invert Z buttons", type: "check", def: false },
  ],
  create(host, cfg) {
    const STEPS = String(cfg.steps || "0.1,1,10,50").split(",").map(Number), style = cfg.style || "cross";
    const ar = { up: PB.icon('<path d="M6 15l6-6 6 6"/>'), down: PB.icon('<path d="M6 9l6 6 6-6"/>'),
                 left: PB.icon('<path d="M15 6l-6 6 6 6"/>'), right: PB.icon('<path d="M9 6l6 6-6 6"/>') };
    const house = PB.icon('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>');
    const jog = (j, icon) => `<button type="button" data-jog="${j}" aria-label="${j}">${icon}<span>${j.replace("-", "−")}</span></button>`;
    const home = (a, label) => `<button type="button" class="pb-thh" data-home="${a}" title="Home ${label}">${house}<span>${label}</span></button>`;
    const zcol = `<div class="pb-thz">${jog("Z+", ar.up)}${home("Z", "Z")}${jog("Z-", ar.down)}</div>`;
    const cross = () => `<div class="pb-th">
        <div class="pb-thhxy">${home("X", "X")}${home("Y", "Y")}</div>
        <div class="pb-thx"><span></span>${jog("Y+", ar.up)}<span></span>${jog("X-", ar.left)}${home("", "All")}${jog("X+", ar.right)}<span></span>${jog("Y-", ar.down)}<span></span></div>
        ${zcol}</div>`;
    const bars = () => `<div class="pb-thbars">${["X", "Y", "Z"].map(a => `<div class="pb-thbar">${home(a, a)}
        ${[...STEPS].reverse().map(s => `<button type="button" data-jog="${a}-" data-s="${s}">−${s}</button>`).join("")}
        ${STEPS.map(s => `<button type="button" data-jog="${a}+" data-s="${s}">+${s}</button>`).join("")}</div>`).join("")}
        <div class="pb-thbar">${home("", "All")}</div></div>`;
    function circle() {   // quarters: top Y+, right X+, bottom Y−, left X−; ring i (from the middle out) moves STEPS[i]
      const C = 136, R0 = 28, W = (C - 22 - R0) / STEPS.length, rad = d => d * Math.PI / 180;
      const pt = (r, d) => `${(C + r * Math.cos(rad(d))).toFixed(1)} ${(C + r * Math.sin(rad(d))).toFixed(1)}`;
      const seg = (r1, r2, a0, a1) => `M${pt(r2, a0)} A${r2} ${r2} 0 0 1 ${pt(r2, a1)} L${pt(r1, a1)} A${r1} ${r1} 0 0 0 ${pt(r1, a0)}Z`;
      const quarters = [["Y+", -90], ["X+", 0], ["Y-", 90], ["X-", 180]];
      const rings = quarters.flatMap(([j, mid]) => STEPS.map((s, i) => {
        const r1 = R0 + i * W + 1.5, r2 = r1 + W - 3;
        return `<g class="pb-thseg" data-jog="${j}" data-s="${s}" role="button" aria-label="${j} ${s} mm"><path d="${seg(r1, r2, mid - 43, mid + 43)}"/>
          <text x="${pt((r1 + r2) / 2, mid).split(" ")[0]}" y="${pt((r1 + r2) / 2, mid).split(" ")[1]}">${s}</text></g>`;
      })).join("");
      const tags = quarters.map(([j, mid]) => { const [x, y] = pt(C - 11, mid).split(" ");
        return `<text class="pb-thtag" x="${x}" y="${y}">${j.replace("-", "−")}</text>`; }).join("");
      return `<div class="pb-th"><div class="pb-thhxy">${home("X", "X")}${home("Y", "Y")}</div><div class="pb-thc"><svg viewBox="0 0 ${2 * C} ${2 * C}" aria-label="Jog wheel">${rings}${tags}
          <g class="pb-thseg pb-thh" data-home="" role="button" aria-label="Home all"><circle cx="${C}" cy="${C}" r="${R0 - 3}"/><text x="${C}" y="${C}">All</text></g></svg></div>${zcol}</div>`;
    }
    host.innerHTML = `${style === "bars" ? bars() : style === "circle" ? circle() : cross()}
      <div class="pb-seg"${style === "bars" ? " hidden" : ""}>${style === "circle" ? `<span class="pb-muted">Z step</span>` : ""}${STEPS.map((s, i) => `<button data-step="${s}" aria-pressed="${i === 2}">${s}</button>`).join("")}</div>
      <div class="pb-thpos">${["X", "Y", "Z"].map(a => `<label>${a}<input type="number" step="any" data-ax="${a}" aria-label="${a} position, type a number and press Enter to move there"></label>`).join("")}
        <button type="button" data-a="off" title="Turn the motors off (M84) so you can move the axes by hand">Motors off</button></div>
      <label class="pb-speed">Speed <input type="range" min="10" max="300" step="5" value="100"><output>100%</output></label>
      <div class="pb-note"></div>`;
    let step = STEPS[2], dragging = false, ok = false;
    if (!cfg.jog) for (const e of host.querySelectorAll(".pb-th, .pb-thbars, .pb-seg")) e.hidden = true;
    if (!cfg.speed) host.querySelector(".pb-speed").hidden = true;
    if (!cfg.moveto) host.querySelector(".pb-thpos").hidden = true;
    const boxes = [...host.querySelectorAll("[data-ax]")];
    for (const x of boxes) {
      x.onkeydown = e => {
        if (e.key === "Escape") x.blur();
        if (e.key !== "Enter" || x.value === "") return;
        const a = x.dataset.ax; gcode(`G90\nG1 ${a}${+x.value} F${(a === "Z" ? cfg.fz : cfg.fxy) * 60}`); x.blur();
      };
    }
    host.querySelector("[data-a=off]").onclick = () => PB.confirmGcode("Turn the motors off? Axes will need homing again.", "M84", "Motors off");
    const range = host.querySelector("input[type=range]"), out = host.querySelector("output");
    for (const b of host.querySelectorAll("[data-home]")) b.onclick = () => { if (ok) gcode(`G28 ${b.dataset.home}`.trim()); };
    for (const b of host.querySelectorAll("[data-step]")) b.onclick = () => {
      step = +b.dataset.step;
      for (const o of host.querySelectorAll("[data-step]")) o.setAttribute("aria-pressed", String(o === b));
    };
    for (const b of host.querySelectorAll("[data-jog]")) b.onclick = () => {   // data-s = a fixed step (bars, circle rings)
      if (!ok) return;
      const axis = b.dataset.jog[0], inv = cfg[`inv${axis.toLowerCase()}`] ? -1 : 1, dir = (b.dataset.jog[1] === "-" ? -1 : 1) * inv;
      gcode(`G91\nG1 ${axis}${dir * (b.dataset.s ? +b.dataset.s : step)} F${(axis === "Z" ? cfg.fz : cfg.fxy) * 60}\nG90`);
    };
    range.oninput = () => { dragging = true; out.textContent = `${range.value}%`; };
    range.onchange = () => { dragging = false; gcode(`M220 S${range.value}`); };
    return {
      update(p) {
        const live = p.connection === "online" && p.klippy_state === "ready", printing = p.state === "printing" || p.state === "paused";
        const pos = p.position || [], homed = (p.homed_axes || "").toUpperCase();
        ok = live && !printing;
        host.classList.toggle("pb-thoff", !ok);
        boxes.forEach((x, i) => { if (document.activeElement !== x) x.value = pos[i] == null ? "" : (+pos[i]).toFixed(i === 2 ? 2 : 1); x.disabled = !ok; });
        for (const b of host.querySelectorAll("[data-home]")) {
          const need = b.dataset.home ? !homed.includes(b.dataset.home) : homed.length < 3;
          b.classList.toggle("need", need); b.setAttribute("title", `Home ${b.dataset.home || "all"}${need ? " (not homed)" : ""}`);
        }
        for (const e of host.querySelectorAll("button")) e.disabled = !ok;
        range.disabled = !live;
        if (!dragging && p.speed_factor != null) { range.value = Math.round(p.speed_factor * 100); out.textContent = `${range.value}%`; }
        host.querySelector(".pb-note").textContent = printing ? "Moving is off while a print is running." : homed.length < 3 ? "Home before jogging." : "";
      },
    };
  },
});
