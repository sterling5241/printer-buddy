PB.panel("config", {
  title: "Config files", desc: "printer.cfg and other config files; opens a full-screen editor", cls: "adv",
  icon: PB.icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  settings: [
    { k: "outline", label: "Show the section outline in the editor", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool">
        <select data-a="root" aria-label="Folder"><option value="config">Config</option><option value="config_examples">Config examples</option><option value="docs">Docs</option></select>
        <input type="search" placeholder="Search…" aria-label="Search this folder">
        <button type="button" data-a="add">+ Add</button><button type="button" data-a="filter">Filter</button>
        <button type="button" data-a="goto" title="Go to file" aria-label="Go to file">${PB.ic.search}</button>
        <span class="pb-clow" hidden>${PB.ic.alert}</span>
        <button type="button" data-a="refresh" data-head title="Refresh" aria-label="Refresh">${PB.ic.refresh}</button></div>
      <div class="pb-bulk" hidden><b class="pb-bn"></b><span class="bd-sp"></span><button type="button" data-b="zip">Zip</button><button type="button" data-b="del" class="pb-danger">Delete</button></div>
      <div class="pb-crumbs"></div><div class="pb-ccount pb-muted" aria-live="polite"></div>
      <div class="pb-cwrap" data-drop><div class="pb-chead"></div><div class="pb-cfiles"></div></div>
      <input type="file" data-u="files" multiple hidden><input type="file" data-u="dir" webkitdirectory hidden>`;
    const q = s => host.querySelector(s);
    // ---- small pop-up menu (Add, Filter, right-click): items [{ label, icon, run, danger } | { label, check, run(on) }] ----
    const pop = PB.el("div", "pb-cmenu"); pop.hidden = true; ($("#page") || document.body).append(pop);
    const outside = e => { if (!pop.contains(e.target)) shut(); };
    const onKey = e => { if (e.key === "Escape") shut(); };
    function shut() { pop.hidden = true; removeEventListener("pointerdown", outside, true); removeEventListener("keydown", onKey, true); }
    function menu(at, items) {
      items = items.filter(Boolean); if (!items.length) return;
      pop.innerHTML = items.map((it, i) => it.check != null
        ? `<label class="bd-check"><input type="checkbox" data-i="${i}"${it.check ? " checked" : ""}> ${esc(it.label)}</label>`
        : `<button type="button" data-i="${i}"${it.danger ? ' class="pb-danger"' : ""}>${it.icon || ""}${esc(it.label)}</button>`).join("");
      for (const b of pop.querySelectorAll("[data-i]")) {
        const it = items[b.dataset.i];
        if (it.check != null) b.onchange = () => it.run(b.checked); else b.onclick = () => { shut(); it.run(); };
      }
      pop.hidden = false;
      const r = at instanceof Event ? { left: at.clientX, bottom: at.clientY } : at.getBoundingClientRect();
      pop.style.left = `${Math.max(4, Math.min(r.left, innerWidth - pop.offsetWidth - 4))}px`;
      pop.style.top = `${Math.max(4, Math.min(r.bottom, innerHeight - pop.offsetHeight - 4))}px`;
      addEventListener("pointerdown", outside, true); addEventListener("keydown", onKey, true);
    }
    const c = {
      q, menu, root: "config", dir: "", dirs: [], files: [], rows: [], disk: null, err: "", loaded: false, picked: new Set(),
      full: n => (c.dir ? c.dir + "/" : "") + n, path: n => `${c.root}/${c.full(n)}`, ro: () => c.root !== "config",
    };
    c.ed = PB.parts.cfgEditor(cfg, () => c.load());
    const br = PB.parts.cfgBrowse(c), act = PB.parts.cfgActions(c);
    q("[data-a=refresh]").onclick = () => c.load();
    PB.openConfig = p => c.ed.open(p);
    return {
      open() { c.ed.reset(); shut(); Object.assign(c, { root: "config", dir: "", dirs: [], files: [], disk: null, err: "", loaded: false }); c.picked.clear(); q("[data-a=root]").value = "config"; c.draw(); },
      shown() { if (!c.loaded) c.load(); },
      update(p) { const busy = p.state === "printing" || p.state === "paused"; c.ed.setBusy(busy || p.connection !== "online"); },
      destroy() { c.ed.destroy(); br.destroy(); act.destroy(); shut(); pop.remove(); if (PB.openConfig) delete PB.openConfig; },
    };
  },
});
