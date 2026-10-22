PB.panel("extruder", {
  title: "Extruder", desc: "Extrude, retract, load, flow and pressure advance", cls: "adv",
  icon: PB.icon('<path d="M8 3h8v6l-2 3h-4L8 9z"/><path d="M11 12v4l1 3 1-3v-4"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-row pb-tools-t" hidden></div>
      <div class="pb-fields"><label>Length <input type="number" data-k="len" value="10" min="1" max="200"> mm</label>
        <label>Speed <input type="number" data-k="spd" value="5" min="1" max="50"> mm/s</label><span class="pb-muted pb-flow" title="Volumetric flow for 1.75 mm filament (most hotends top out around 10-25 mm³/s)"></span></div>
      <div class="pb-row"><button type="button" data-ex="-1">Retract</button><button type="button" data-ex="1">Extrude</button></div>
      <div class="pb-row pb-fil" hidden><button type="button" data-mac="UNLOAD_FILAMENT">Unload filament</button><button type="button" data-mac="LOAD_FILAMENT">Load filament</button></div>
      <div class="pb-note pb-cold"></div>
      <label class="pb-speed">Flow <input type="range" min="50" max="150" step="1" value="100"><output>100%</output></label>
      <div class="pb-fields"><label>Pressure advance <input type="number" data-k="pa" step="0.001" min="0" max="2"></label>
        <label>Smooth time <input type="number" data-k="st" step="0.001" min="0" max="0.2"></label><button type="button" data-a="pa">Set</button></div>
      <div class="pb-fields pb-retr" hidden><label>Retract <input type="number" data-k="rl" step="0.05" min="0"> mm</label>
        <label>Speed <input type="number" data-k="rs" step="1" min="1"> mm/s</label><button type="button" data-a="retr">Set</button></div>`;
    const q = s => host.querySelector(s), k = n => host.querySelector(`[data-k=${n}]`);
    const range = q("input[type=range]"), out = q("output");
    let dragging = false, toolsKey = "";
    const flow = () => { q(".pb-flow").textContent = `≈ ${(Math.min(50, Math.max(0.5, +k("spd").value || 5)) * Math.PI * 0.875 ** 2).toFixed(1)} mm³/s`; };
    k("spd").addEventListener("input", flow); flow();
    for (const b of host.querySelectorAll("[data-ex]")) b.onclick = () => {
      const len = Math.min(200, Math.max(0.1, +k("len").value || 10)), spd = Math.min(50, Math.max(0.5, +k("spd").value || 5));
      gcode(`M83\nG1 E${(+b.dataset.ex * len).toFixed(2)} F${Math.round(spd * 60)}`);
    };
    for (const b of host.querySelectorAll("[data-mac]")) b.onclick = () => gcode(b.dataset.mac);
    range.oninput = () => { dragging = true; out.textContent = `${range.value}%`; };
    range.onchange = () => { dragging = false; gcode(`M221 S${range.value}`); };
    q("[data-a=pa]").onclick = () => {
      const parts = [k("pa").value !== "" && `ADVANCE=${+k("pa").value}`, k("st").value !== "" && `SMOOTH_TIME=${+k("st").value}`].filter(Boolean);
      if (parts.length) { gcode(`SET_PRESSURE_ADVANCE ${parts.join(" ")}`); k("pa").value = k("st").value = ""; }
    };
    q("[data-a=retr]").onclick = () => {
      const parts = [k("rl").value !== "" && `RETRACT_LENGTH=${+k("rl").value}`, k("rs").value !== "" && `RETRACT_SPEED=${+k("rs").value}`].filter(Boolean);
      if (parts.length) { gcode(`SET_RETRACTION ${parts.join(" ")}`); k("rl").value = k("rs").value = ""; }
    };
    return {
      async open(id) {
        try { const m = (await api(`/api/printers/${id}/macros`)).macros || []; const names = m.map(x => x.name);
              q(".pb-fil").hidden = !names.includes("LOAD_FILAMENT") && !names.includes("UNLOAD_FILAMENT"); } catch {}
      },
      update(p) {
        const live = p.connection === "online" && p.klippy_state === "ready";
        const tools = p.extruders || [], tk = tools.join() + p.active_extruder;
        if (tk !== toolsKey) {
          toolsKey = tk; const t = q(".pb-tools-t"); t.hidden = tools.length < 2;
          t.innerHTML = tools.map((e, i) => `<button type="button" data-t="${i}" aria-pressed="${e === p.active_extruder}">T${i}</button>`).join("");
          for (const b of t.querySelectorAll("[data-t]")) b.onclick = () => gcode(`T${b.dataset.t}`);
        }
        const cold = p.can_extrude === false;
        q(".pb-cold").textContent = cold ? "Heat the nozzle to extrude (Klipper blocks cold extrusion)." : "";
        for (const b of host.querySelectorAll("button")) b.disabled = !live;
        for (const b of host.querySelectorAll("[data-ex], [data-mac]")) b.disabled = !live || cold;
        range.disabled = !live;
        if (!dragging && p.extrude_factor != null) { range.value = Math.round(p.extrude_factor * 100); out.textContent = `${range.value}%`; }
        if (document.activeElement !== k("pa")) k("pa").placeholder = p.pa?.pressure_advance != null ? p.pa.pressure_advance.toFixed(3) : "";
        if (document.activeElement !== k("st")) k("st").placeholder = p.pa?.smooth_time != null ? p.pa.smooth_time.toFixed(3) : "";
        const r = p.retraction; q(".pb-retr").hidden = !r;
        if (r) { k("rl").placeholder = r.retract_length ?? ""; k("rs").placeholder = r.retract_speed ?? ""; }
      },
    };
  },
});
