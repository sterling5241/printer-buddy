PB.panel("zoffset", {
  title: "Z offset", desc: "Babystep Z up / down and save it", cls: "adv", gear: true,
  settings: [{ k: "steps", label: "Step sizes (mm)", type: "select", def: "0.005,0.01,0.025,0.05", options: [["0.005,0.01,0.025,0.05", "0.005 · 0.01 · 0.025 · 0.05"],
    ["0.01,0.025,0.05,0.1", "0.01 · 0.025 · 0.05 · 0.1"], ["0.001,0.005,0.01,0.05", "0.001 · 0.005 · 0.01 · 0.05"]] }],
  icon: PB.icon('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/><path d="M3 12h4M17 12h4"/>'),
  create(host, cfg) {
    const STEPS = String(cfg.steps || "0.005,0.01,0.025,0.05").split(",").map(Number);
    host.innerHTML = `<div class="pb-big"><span>Z offset</span><b>0.000</b><small>mm</small></div>
      <div class="pb-seg">${STEPS.map((s, i) => `<button type="button" data-step="${s}" aria-pressed="${i === 1}">${s}</button>`).join("")}</div>
      <div class="pb-row"><button type="button" data-dir="-1" title="Nozzle closer to the bed">↓ Lower</button><button type="button" data-dir="1" title="Nozzle further from the bed">↑ Raise</button></div>
      <div class="pb-row"><button type="button" data-a="reset">Reset to 0</button><button type="button" data-a="save">Save</button></div>
      <div class="pb-note">Lower = closer to the bed (more squish). Save writes it to the probe or endstop, then needs SAVE_CONFIG.</div>`;
    let step = STEPS[1], feats = {};
    for (const b of host.querySelectorAll("[data-step]")) b.onclick = () => {
      step = +b.dataset.step; for (const o of host.querySelectorAll("[data-step]")) o.setAttribute("aria-pressed", String(o === b));
    };
    for (const b of host.querySelectorAll("[data-dir]")) b.onclick = () => gcode(`SET_GCODE_OFFSET Z_ADJUST=${(+b.dataset.dir * step).toFixed(3)} MOVE=1`);
    host.querySelector("[data-a=reset]").onclick = () => PB.confirmGcode("Set the Z offset back to 0?", "SET_GCODE_OFFSET Z=0 MOVE=1");
    host.querySelector("[data-a=save]").onclick = () => {
      const cmd = feats.probe || feats.bltouch ? "Z_OFFSET_APPLY_PROBE" : "Z_OFFSET_APPLY_ENDSTOP";
      PB.confirmGcode(`Save this offset (${cmd})? You then need SAVE_CONFIG (restarts Klipper) when the printer is idle.`, cmd, "Saved. Run SAVE_CONFIG when idle.");
    };
    return {
      update(p) {
        feats = p.features || {};
        host.querySelector(".pb-big b").textContent = p.z_offset == null ? "—" : (p.z_offset >= 0 ? "+" : "") + p.z_offset.toFixed(3);
        const live = p.connection === "online" && p.klippy_state === "ready";
        for (const b of host.querySelectorAll("button")) b.disabled = !live;
      },
    };
  },
});
