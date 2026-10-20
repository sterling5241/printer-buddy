// Toolhead panel: position, home, jog with a step size, and live print speed (M220).
PB.panel("toolhead", {
  title: "Toolhead", cls: "adv",
  icon: PB.icon('<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>'),
  settings: [
    { k: "jog", label: "Show home + jog buttons", type: "check", def: true },
    { k: "speed", label: "Show the speed slider", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-pos">X <b>—</b> · Y <b>—</b> · Z <b>—</b> <span></span></div>
      <div class="pb-row"><button data-home="">Home all</button><button data-home="X">X</button><button data-home="Y">Y</button><button data-home="Z">Z</button></div>
      <div class="pb-seg">${[0.1, 1, 10, 50].map(s => `<button data-step="${s}" aria-pressed="${s === 10}">${s}</button>`).join("")}</div>
      <div class="pb-row">${["X-", "X+", "Y-", "Y+", "Z-", "Z+"].map(j => `<button data-jog="${j}">${j.replace("-", "−")}</button>`).join("")}</div>
      <label class="pb-speed">Speed <input type="range" min="10" max="300" step="5" value="100"><output>100%</output></label>
      <div class="pb-note"></div>`;
    let step = 10, dragging = false;
    if (!cfg.jog) for (const e of host.querySelectorAll(".pb-row, .pb-seg")) e.hidden = true;
    if (!cfg.speed) host.querySelector(".pb-speed").hidden = true;
    const range = host.querySelector("input[type=range]"), out = host.querySelector("output");
    for (const b of host.querySelectorAll("[data-home]")) b.onclick = () => gcode(`G28 ${b.dataset.home}`.trim());
    for (const b of host.querySelectorAll("[data-step]")) b.onclick = () => {
      step = +b.dataset.step;
      for (const o of host.querySelectorAll("[data-step]")) o.setAttribute("aria-pressed", String(o === b));
    };
    for (const b of host.querySelectorAll("[data-jog]")) b.onclick = () => {
      const axis = b.dataset.jog[0], dir = b.dataset.jog[1] === "-" ? -1 : 1;
      gcode(`G91\nG1 ${axis}${dir * step} F${axis === "Z" ? 600 : 6000}\nG90`);
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
