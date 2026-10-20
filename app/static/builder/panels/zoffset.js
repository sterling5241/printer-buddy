// Z offset panel: babystep Z up / down (also mid-print), reset, and save it to the config.
PB.panel("zoffset", {
  title: "Z offset", desc: "Babystep Z up / down and save it", cls: "adv",
  icon: PB.icon('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/><path d="M3 12h4M17 12h4"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-big"><span>Z offset</span><b>0.000</b><small>mm</small></div>
      <div class="pb-seg">${[0.005, 0.01, 0.025, 0.05].map(s => `<button type="button" data-step="${s}" aria-pressed="${s === 0.01}">${s}</button>`).join("")}</div>
      <div class="pb-row"><button type="button" data-dir="-1" title="Nozzle closer to the bed">↓ Lower</button><button type="button" data-dir="1" title="Nozzle further from the bed">↑ Raise</button></div>
      <div class="pb-row"><button type="button" data-a="reset">Reset to 0</button><button type="button" data-a="save">Save</button></div>
      <div class="pb-note">Lower = closer to the bed (more squish). Save writes it to the probe or endstop, then needs SAVE_CONFIG.</div>`;
    let step = 0.01, feats = {};
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
