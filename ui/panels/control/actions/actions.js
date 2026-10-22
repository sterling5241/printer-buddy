PB.panel("actions", {
  title: "Actions", desc: "Home, QGL / Z-tilt, motors off, checks", cls: "adv",
  icon: PB.icon('<path d="M4 12h4l3-8 4 16 3-8h2"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-acts"></div><div class="pb-note">Results (endstops, probe, screws) show up in the console.</div>`;
    const box = host.querySelector(".pb-acts");
    let key = "";
    const A = [
      ["home", "Home all", "G28", null, () => true],
      ["qgl", "Quad gantry level", "QUAD_GANTRY_LEVEL", "Run quad gantry level? (Home first.)", f => f.quad_gantry_level],
      ["ztilt", "Z tilt adjust", "Z_TILT_ADJUST", "Run Z tilt adjust? (Home first.)", f => f.z_tilt],
      ["screws", "Bed screws check", "SCREWS_TILT_CALCULATE", "Probe the bed screws?", f => f.screws_tilt_adjust],
      ["off", "Motors off", "M84", null, () => true],
      ["endstops", "Check endstops", "QUERY_ENDSTOPS", null, () => true],
      ["probe", "Check probe", "QUERY_PROBE", null, f => f.probe || f.bltouch],
      ["save", "SAVE_CONFIG", "SAVE_CONFIG", "Save config changes (mesh, offsets, calibrations)? Klipper restarts.", () => true],
    ];
    return {
      update(p) {
        const f = p.features || {}, printing = p.state === "printing" || p.state === "paused";
        const live = p.connection === "online" && p.klippy_state === "ready";
        const shown = A.filter(a => a[4](f)), k = shown.map(a => a[0]).join() + JSON.stringify(p.leveled);
        if (k !== key) {
          key = k;
          box.innerHTML = shown.map(([id, label]) => {
            const lv = id === "qgl" ? p.leveled?.quad_gantry_level : id === "ztilt" ? p.leveled?.z_tilt : undefined;
            return `<button type="button" data-id="${id}">${label}${lv ? " ✓" : ""}</button>`;
          }).join("");
          for (const b of box.querySelectorAll("[data-id]")) b.onclick = () => {
            const [, label, cmd, ask] = A.find(a => a[0] === b.dataset.id);
            if (ask ? confirm(ask) : true) { gcode(cmd); toast(`Sent ${label}`); }
          };
        }
        for (const b of box.querySelectorAll("[data-id]")) b.disabled = !live || (printing && !["endstops"].includes(b.dataset.id));
      },
    };
  },
});
