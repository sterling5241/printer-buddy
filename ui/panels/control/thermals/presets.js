// Thermals panel, part: temperature presets - your own (saved on the box per printer): a name, a target per heater,
// optional G-code after. Used by thermals.js.
PB.parts = PB.parts || {};
PB.parts.thermalsPresets = (host, cmd) => {
    // ---- presets: your own (saved on the box per printer) - name, a target per heater, optional G-code after ----
    const BASE = [{ name: "PLA", temps: { extruder: 210, heater_bed: 60 } }, { name: "PETG", temps: { extruder: 240, heater_bed: 80 } },
                  { name: "ABS", temps: { extruder: 250, heater_bed: 100 } }];
    let presets = BASE;
    const heaters = () => (PB.current()?.sensors || []).filter(s => s.target != null);
    function drawPresets() {
      const box = host.querySelector(".pb-pres"); if (!box) return;
      box.innerHTML = presets.map((p, i) => `<button type="button" data-pi="${i}" title="${esc(Object.entries(p.temps || {}).map(([k, v]) => `${k}: ${v}°`).join(", "))}">🔥 ${esc(p.name)}</button>`).join("")
        + `<button type="button" data-cool>Cool down</button><button type="button" data-edit title="Edit presets" aria-label="Edit presets">✎</button>`;
      for (const b of box.querySelectorAll("[data-pi]")) b.onclick = () => apply(presets[+b.dataset.pi]);
      box.querySelector("[data-cool]").onclick = () => { if (PB.store.get("pb-confirm-cool", false) && !confirm("Turn all heaters off?")) return; const hs = heaters(); if (hs.length) gcode(hs.map(s => cmd(s, 0)).join("\n")); toast("Heaters off"); };
      box.querySelector("[data-edit]").onclick = editPresets;
    }
    function apply(p) {
      const hs = heaters(), lines = Object.entries(p.temps || {}).filter(([, v]) => v !== "" && v != null)
        .map(([id, v]) => { const s = hs.find(h => h.id === id); return s ? cmd(s, Math.max(0, Math.round(+v))) : null; }).filter(Boolean);
      if (p.gcode?.trim()) lines.push(p.gcode.trim());
      if (lines.length) { gcode(lines.join("\n")); toast(`${p.name}: ${Object.entries(p.temps || {}).filter(([, v]) => +v).map(([k, v]) => `${(hs.find(h => h.id === k) || {}).name || k} ${v}°`).join(", ") || "sent"}`); }
    }
    const pdl = PB.el("dialog", "bd-lib pb-xd pb-presdlg"); document.body.append(pdl);
    function editPresets() {
      const hs = heaters(); let list = presets.map(p => ({ ...p, temps: { ...(p.temps || {}) } }));
      const row = (p, i) => `<div class="pb-prow" data-i="${i}"><div class="pb-prowtop"><input data-k="name" value="${esc(p.name)}" placeholder="Name" aria-label="Preset name">
          <button type="button" data-del title="Delete this preset" aria-label="Delete">✕</button></div>
        <div class="pb-ptemps">${hs.map(h => `<label>${esc(h.name)} <input type="number" min="0" max="400" data-t="${esc(h.id)}" value="${p.temps[h.id] ?? ""}" placeholder="—"></label>`).join("")}</div>
        <textarea data-k="gcode" rows="1" placeholder="G-code to run after (optional), e.g. M106 S128" spellcheck="false">${esc(p.gcode || "")}</textarea></div>`;
      const read = () => list = [...pdl.querySelectorAll(".pb-prow")].map(r => ({ name: r.querySelector("[data-k=name]").value.trim() || "Preset",
        gcode: r.querySelector("[data-k=gcode]").value, temps: Object.fromEntries([...r.querySelectorAll("[data-t]")].filter(x => x.value !== "").map(x => [x.dataset.t, +x.value])) }));
      const render = () => {
        pdl.innerHTML = `<h3>Temperature presets</h3><p class="pb-muted">Empty = leave that heater alone. Saved on this box for this printer.</p>
          <div class="pb-plist">${list.map(row).join("") || `<p class="pb-muted">No presets.</p>`}</div>
          <div class="bd-libfoot"><button type="button" data-a="add">+ Add</button><button type="button" data-a="reset">Reset to PLA / PETG / ABS</button><span class="bd-sp"></span>
            <button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="ok">Save</button></div>`;
        for (const b of pdl.querySelectorAll("[data-del]")) b.onclick = () => { read(); list.splice(+b.closest(".pb-prow").dataset.i, 1); render(); };
        pdl.querySelector("[data-a=add]").onclick = () => { read(); list.push({ name: "New", temps: {}, gcode: "" }); render(); };
        pdl.querySelector("[data-a=reset]").onclick = () => { list = BASE.map(p => ({ ...p, temps: { ...p.temps } })); render(); };
        pdl.querySelector("[data-a=no]").onclick = () => pdl.close();
        pdl.querySelector("[data-a=ok]").onclick = async () => {
          read(); presets = list.slice(0, 30); pdl.close(); drawPresets();
          try { await PB.kv.set("presets", presets); toast("Presets saved"); } catch (e) { toast(`Couldn't save: ${e.message}`); }
        };
      };
      render(); pdl.showModal();
    }
    drawPresets();
  return {
    load(id) { presets = BASE; drawPresets(); PB.kv.get("presets", id).then(v => { if (id === pageId && Array.isArray(v)) { presets = v; drawPresets(); } }).catch(() => {}); },
    destroy() { pdl.remove(); },
  };
};
