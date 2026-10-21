// Custom panels: panels people make themselves (+ Add panel > Custom panels…), saved on this box for every device.
// Each one has a type (a folder in panels/custom/, e.g. chart) and its own settings (cfg; cfg.title is its name).
// A type file calls  PB.custom.type("name", { title, desc, icon, blank() -> cfg, create(host, cfg) -> panel, edit(cfg, done(cfg)) })
//   blank()   settings for a new panel of this type
//   create()  same as PB.panel's create: build the panel, return { open, update, shown, destroy }
//   edit()    show the setup box; call done(cfg) when the user saves
PB.custom = (() => {
  const types = {};
  let panels = [];   // [{ id, type, cfg }]
  const key = p => `custom:${p.id}`;
  const save = () => api("/api/ui/custom", { method: "PUT", body: JSON.stringify({ panels }) })
    .catch(e => toast(`Couldn't save custom panels: ${e.message}`));
  // put every custom panel in the panel list, then redraw the page so placed ones show up / change
  function refresh() {
    for (const k of Object.keys(PB.defs)) if (k.startsWith("custom:")) delete PB.defs[k];
    for (const p of panels) {
      const t = types[p.type]; if (!t) continue;
      PB.panel(key(p), { title: p.cfg.title || t.title, desc: `Custom: ${t.title}`, icon: t.icon, cls: "pb-custom",
                         edit: () => edit(p), create: host => t.create(host, p.cfg) });
    }
    PB.builders?.page.build();
  }
  function edit(p, isNew, place) {
    types[p.type].edit(structuredClone(p.cfg), cfg => {
      p.cfg = cfg; if (isNew) panels.push(p);
      save(); refresh(); if (isNew && place) place(key(p));
    });
  }
  function remove(p) {
    if (!confirm(`Delete the custom panel "${p.cfg.title}"? It's taken off the layout too.`)) return;
    panels = panels.filter(x => x !== p); save();
    PB.builders?.page.dropType(key(p)); refresh();
  }
  // ---- the Custom panels box: your panels (edit / delete) and "make a new one" ----
  const dlg = PB.x.dialog("pb-custdlg");
  function manage(place) {
    dlg.innerHTML = `<div class="pb-ptop"><h3>Custom panels</h3><button type="button" class="pb-px" aria-label="Close">${PB.ic.x}</button></div>
      <p class="pb-muted">Panels you make yourself. They're saved on this box, so every device sees them.</p>
      <h4>Your panels</h4>
      <div class="pb-custlist">${panels.map((p, i) => `<div class="pb-custrow">${types[p.type]?.icon || ""}<b>${esc(p.cfg.title || "Untitled")}</b>
          <small class="pb-muted">${esc(types[p.type]?.title || p.type)}</small><span class="bd-sp"></span>
          <button type="button" data-e="${i}">${PB.ic.pencil} Edit</button><button type="button" data-d="${i}" class="pb-danger">${PB.ic.trash}</button></div>`).join("")
        || `<p class="pb-muted">None yet. Make one below.</p>`}</div>
      <h4>Make a new one</h4>
      <div class="pb-custtypes">${Object.entries(types).map(([k, t]) => `<button type="button" data-t="${k}">${t.icon}<b>${esc(t.title)}</b><small>${esc(t.desc)}</small></button>`).join("")}</div>`;
    dlg.querySelector(".pb-px").onclick = () => dlg.close();
    for (const b of dlg.querySelectorAll("[data-e]")) b.onclick = () => { dlg.close(); edit(panels[b.dataset.e]); };
    for (const b of dlg.querySelectorAll("[data-d]")) b.onclick = () => { remove(panels[b.dataset.d]); manage(place); };
    for (const b of dlg.querySelectorAll("[data-t]")) b.onclick = () => {
      dlg.close(); const t = b.dataset.t;
      edit({ id: Date.now().toString(36), type: t, cfg: types[t].blank() }, true, place);
    };
    if (!dlg.open) dlg.showModal();
  }
  api("/api/ui/custom").then(r => { panels = Array.isArray(r.panels) ? r.panels : []; refresh(); }).catch(() => {});
  return { type: (name, def) => { types[name] = def; }, manage };
})();
