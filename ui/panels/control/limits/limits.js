PB.panel("limits", {
  title: "Limits", desc: "Velocity and acceleration, live", cls: "adv",
  icon: PB.icon('<path d="M3 17a9 9 0 0 1 18 0"/><path d="M12 17l4-6"/>'),
  create(host) {
    const F = [["max_velocity", "VELOCITY", "Velocity", "mm/s"], ["max_accel", "ACCEL", "Acceleration", "mm/s²"],
               ["square_corner_velocity", "SQUARE_CORNER_VELOCITY", "Square corner velocity", "mm/s"],
               ["minimum_cruise_ratio", "MINIMUM_CRUISE_RATIO", "Minimum cruise ratio", ""], ["max_accel_to_decel", "ACCEL_TO_DECEL", "Accel to decel", "mm/s²"]];
    host.innerHTML = `<div class="pb-fields pb-col2">${F.map(([k, , l, u]) => `<label data-f="${k}">${l} <input type="number" step="any" min="0" data-k="${k}"> <span class="pb-muted">${u}</span></label>`).join("")}</div>
      <div class="pb-row"><button type="button" class="pb-pri" data-a="set">Apply</button></div>
      <div class="pb-note">Grey numbers are the current values. Changes last until Klipper restarts.</div>`;
    host.querySelector("[data-a=set]").onclick = () => {
      const parts = F.filter(([k]) => { const i = host.querySelector(`[data-k=${k}]`); return i.value !== "" && !i.closest("label").hidden; })
        .map(([k, cmd]) => `${cmd}=${+host.querySelector(`[data-k=${k}]`).value}`);
      if (!parts.length) return toast("Type a new value first");
      gcode(`SET_VELOCITY_LIMIT ${parts.join(" ")}`);
      for (const i of host.querySelectorAll("input")) i.value = "";
    };
    return {
      update(p) {
        const l = p.limits || {}, live = p.connection === "online" && p.klippy_state === "ready";
        for (const [k] of F) {
          const lab = host.querySelector(`[data-f=${k}]`), i = lab.querySelector("input");
          lab.hidden = l[k] == null;
          if (document.activeElement !== i) i.placeholder = l[k] != null ? +(+l[k]).toFixed(3) : "";
          i.disabled = !live;
        }
        host.querySelector("[data-a=set]").disabled = !live;
      },
    };
  },
});
