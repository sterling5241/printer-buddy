// Toolhead panel: position, home, jog with a step size, move to an exact position, motors off, and live print speed (M220).
// ⚙: jog distances, jog speeds, invert X / Y / Z (for printers whose axes run the other way on screen).
PB.panel("toolhead", {
  title: "Toolhead", desc: "Position, home, jog, move to and print speed", cls: "adv", gear: true,
  icon: PB.icon('<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>'),
  settings: [
    { k: "jog", label: "Show home + jog buttons", type: "check", def: true },
    { k: "speed", label: "Show the speed slider", type: "check", def: true },
    { k: "moveto", label: "Show \"Move to\" (type a position)", type: "check", def: true },
    { k: "steps", label: "Jog distances (mm)", type: "select", def: "0.1,1,10,50", options: [["0.1,1,10,50", "0.1 · 1 · 10 · 50"], ["0.1,1,10,100", "0.1 · 1 · 10 · 100"],
      ["0.05,0.5,5,25", "0.05 · 0.5 · 5 · 25"], ["1,5,10,50", "1 · 5 · 10 · 50"], ["0.01,0.1,1,10", "0.01 · 0.1 · 1 · 10"]] },
    { k: "fxy", label: "Jog speed X / Y", type: "select", def: 100, options: [[50, "50 mm/s"], [100, "100 mm/s"], [200, "200 mm/s"], [300, "300 mm/s"]] },
    { k: "fz", label: "Jog speed Z", type: "select", def: 10, options: [[5, "5 mm/s"], [10, "10 mm/s"], [20, "20 mm/s"], [30, "30 mm/s"]] },
    { k: "invx", label: "Invert X buttons", type: "check", def: false },
    { k: "invy", label: "Invert Y buttons", type: "check", def: false },
    { k: "invz", label: "Invert Z buttons", type: "check", def: false },
  ],
  create(host, cfg) {
    const STEPS = String(cfg.steps || "0.1,1,10,50").split(",").map(Number);
    host.innerHTML = `<div class="pb-pos">X <b>—</b> · Y <b>—</b> · Z <b>—</b> <span></span></div>
      <div class="pb-row"><button data-home="">Home all</button><button data-home="X">X</button><button data-home="Y">Y</button><button data-home="Z">Z</button></div>
      <div class="pb-seg">${STEPS.map((s, i) => `<button data-step="${s}" aria-pressed="${i === 2}">${s}</button>`).join("")}</div>
      <div class="pb-row">${["X-", "X+", "Y-", "Y+", "Z-", "Z+"].map(j => `<button data-jog="${j}">${j.replace("-", "−")}</button>`).join("")}</div>
      <form class="pb-moveto"><span>Move to</span>${["X", "Y", "Z"].map(a => `<label>${a}<input type="number" step="any" name="${a}" aria-label="${a} position"></label>`).join("")}
        <button type="submit">Go</button><button type="button" data-a="off" title="Turn the motors off (M84) so you can move the axes by hand">Motors off</button></form>
      <label class="pb-speed">Speed <input type="range" min="10" max="300" step="5" value="100"><output>100%</output></label>
      <div class="pb-note"></div>`;
    let step = STEPS[2], dragging = false;
    if (!cfg.jog) for (const e of host.querySelectorAll(".pb-row, .pb-seg")) e.hidden = true;
    if (!cfg.speed) host.querySelector(".pb-speed").hidden = true;
    if (!cfg.moveto) host.querySelector(".pb-moveto").hidden = true;
    host.querySelector(".pb-moveto").onsubmit = e => {
      e.preventDefault();
      const f = e.target, parts = ["X", "Y", "Z"].filter(a => f[a].value !== "").map(a => `${a}${+f[a].value}`);
      if (!parts.length) return;
      gcode(`G90\nG1 ${parts.join(" ")} F${(parts.length === 1 && parts[0][0] === "Z" ? cfg.fz : cfg.fxy) * 60}`);
      for (const a of ["X", "Y", "Z"]) f[a].value = "";
    };
    host.querySelector("[data-a=off]").onclick = () => PB.confirmGcode("Turn the motors off? Axes will need homing again.", "M84", "Motors off");
    const range = host.querySelector("input[type=range]"), out = host.querySelector("output");
    for (const b of host.querySelectorAll("[data-home]")) b.onclick = () => gcode(`G28 ${b.dataset.home}`.trim());
    for (const b of host.querySelectorAll("[data-step]")) b.onclick = () => {
      step = +b.dataset.step;
      for (const o of host.querySelectorAll("[data-step]")) o.setAttribute("aria-pressed", String(o === b));
    };
    for (const b of host.querySelectorAll("[data-jog]")) b.onclick = () => {
      const axis = b.dataset.jog[0], inv = cfg[`inv${axis.toLowerCase()}`] ? -1 : 1, dir = (b.dataset.jog[1] === "-" ? -1 : 1) * inv;
      gcode(`G91\nG1 ${axis}${dir * step} F${(axis === "Z" ? cfg.fz : cfg.fxy) * 60}\nG90`);
    };
    range.oninput = () => { dragging = true; out.textContent = `${range.value}%`; };
    range.onchange = () => { dragging = false; gcode(`M220 S${range.value}`); };
    return {
      update(p) {
        const live = p.connection === "online" && p.klippy_state === "ready", printing = p.state === "printing" || p.state === "paused";
        const pos = p.position || [], homed = (p.homed_axes || "").toUpperCase();
        const b = host.querySelectorAll(".pb-pos b");
        ["X", "Y", "Z"].forEach((a, i) => { b[i].textContent = pos[i] == null ? "—" : (+pos[i]).toFixed(i === 2 ? 2 : 1); });
        host.querySelector(".pb-pos span").textContent = `· homed ${homed || "none"}`;
        for (const e of host.querySelectorAll("button")) e.disabled = !live || printing;
        range.disabled = !live;
        if (!dragging && p.speed_factor != null) { range.value = Math.round(p.speed_factor * 100); out.textContent = `${range.value}%`; }
        host.querySelector(".pb-note").textContent = printing ? "Moving is off while a print is running." : homed.length < 3 ? "Home before jogging." : "";
      },
    };
  },
});
