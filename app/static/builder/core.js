// Printer Buddy - dashboard builder core: the panel registry and one shared live feed for every panel.
// Loaded after the main page script; builds on its globals (printers, pageId, renderPage, route, conAdd, gcode...).
// A panel file calls  PB.panel("name", { title, icon, cls, single, create(host) -> { open, update, shown, log, destroy } })
//   create(host)  build your HTML inside host (the panel body)
//   open(id)      a printer page was opened (reset per-printer state)
//   update(p)     new data for the open printer (several times a second)
//   shown()       the panel's tab just became visible (load lists, resize charts)
//   log(kind, t)  a console line arrived for the open printer
//   destroy()     the panel was removed from the layout
window.PB = (() => {
  const defs = {}, live = new Set(), routeHooks = [];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const icon = path => `<svg class="pb-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
                  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const each = (fn, only) => { for (const i of only || live) { try { fn(i); } catch (e) { console.error(`panel ${i.type}:`, e); } } };
  const current = () => (pageId !== null && printers.get(pageId)) || null;
  // panels that reuse one of the page's own blocks (camera, files, ...) put it back here when removed
  const parking = el("div"); parking.hidden = true; document.body.append(parking);
  const take = sel => { const n = document.querySelector(sel); if (n) n.hidden = false; return n; };

  function panel(type, def) { defs[type] = { type, title: type, icon: "", cls: "", single: false, ...def }; }

  function mount(type, host) {
    const def = defs[type];
    if (!def) { host.innerHTML = `<p class="pb-muted">Unknown panel "${esc(type)}"</p>`; return null; }
    const inst = Object.assign(def.create(host) || {}, { type, def, host });
    live.add(inst);
    const p = current();
    if (p) each(i => { i.open?.(p.id); i.update?.(p); }, [inst]);
    return inst;
  }
  function unmount(inst) { if (!inst) return; each(i => i.destroy?.(), [inst]); live.delete(inst); }
  const shown = insts => each(i => i.shown?.(), insts.filter(Boolean));

  // one feed: the page's own render / route / console hooks fan out to every mounted panel
  const baseRender = renderPage;
  renderPage = () => { baseRender(); const p = current(); if (p) each(i => i.update?.(p)); };
  const baseRoute = route;
  route = () => {
    baseRoute();
    const p = current();
    if (p) each(i => i.open?.(p.id));
    for (const f of routeHooks) f(p);
    if (p) renderPage();
  };
  window.removeEventListener("hashchange", baseRoute);   // the main script listens with the original route
  window.addEventListener("hashchange", route);
  const baseConAdd = conAdd;
  conAdd = (id, kind, text) => { baseConAdd(id, kind, text); if (id === pageId) each(i => i.log?.(kind, text)); };
  showTab = () => {};   // the old tab strip is gone; panels that need loading do it in shown()

  return { defs, panel, mount, unmount, shown, el, icon, store, current, take, park: n => n && parking.append(n),
           onRoute: f => routeHooks.push(f) };
})();
