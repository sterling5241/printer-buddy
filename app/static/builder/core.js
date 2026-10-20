// Printer Buddy - dashboard builder core: the panel registry and one shared live feed for every panel.
// Loaded after the main page script; builds on its globals (printers, pageId, renderPage, route, conAdd, gcode...).
// A panel file calls  PB.panel("name", { title, icon, cls, single, settings, create(host, cfg) -> { open, update, shown, log, destroy } })
//   settings      [{ k, label, type: "check" | "select", options: [[value, label], ...], def }] - shown under the panel's gear
//   create(host, cfg)  build your HTML inside host (the panel body); cfg = this panel's settings (defaults filled in)
//   open(id)      a printer page was opened (reset per-printer state)
//   update(p)     new data for the open printer (several times a second)
//   shown()       the panel's tab just became visible (load lists, resize charts)
//   log(kind, t)  a console line arrived for the open printer
//   destroy()     the panel was removed from the layout
window.PB = (() => {
  const defs = {}, homeDefs = {}, live = new Set(), routeHooks = [];   // printer-page panels, home-page panels
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
  // home panels get update(listOfAllPrinters) whenever any printer changes
  function homePanel(type, def) { homeDefs[type] = { type, title: type, icon: "", cls: "", single: false, home: true, ...def }; }
  const page = i => !i.def.home, home = i => i.def.home;
  const all = () => [...printers.values()];

  const config = (def, cfg) => Object.fromEntries((def.settings || []).map(s => [s.k, cfg?.[s.k] ?? s.def]));

  function mount(type, host, cfg, reg = defs) {
    const def = reg[type];
    if (!def) { host.innerHTML = `<p class="pb-muted">Unknown panel "${esc(type)}"</p>`; return null; }
    const inst = Object.assign(def.create(host, config(def, cfg)) || {}, { type, def, host });
    live.add(inst);
    if (def.home) each(i => i.update?.(all()), [inst]);
    else { const p = current(); if (p) each(i => { i.open?.(p.id); i.update?.(p); }, [inst]); }
    return inst;
  }
  function unmount(inst) { if (!inst) return; each(i => i.destroy?.(), [inst]); live.delete(inst); }
  const shown = insts => each(i => i.shown?.(), insts.filter(Boolean));

  // one feed: the page's own render / route / console hooks fan out to every mounted panel
  const baseRender = renderPage;
  renderPage = () => { baseRender(); const p = current(); if (p) each(i => i.update?.(p), [...live].filter(page)); };
  const baseHome = render;
  render = () => { baseHome(); const a = all(); each(i => i.update?.(a), [...live].filter(home)); };
  const baseRoute = route;
  route = () => {
    baseRoute();
    const p = current();
    if (p) each(i => i.open?.(p.id), [...live].filter(page));
    for (const f of routeHooks) f(p);
    if (p) renderPage();
  };
  window.removeEventListener("hashchange", baseRoute);   // the main script listens with the original route
  window.addEventListener("hashchange", route);
  const baseConAdd = conAdd;
  conAdd = (id, kind, text) => { baseConAdd(id, kind, text); if (id === pageId) each(i => i.log?.(kind, text)); };
  showTab = () => {};   // the old tab strip is gone; panels that need loading do it in shown()

  // the gear's settings box: one form for any panel's settings list
  const dlg = el("dialog", "bd-lib bd-set");
  document.body.append(dlg);
  function settings(def, cfg, save) {
    const c = config(def, cfg);
    dlg.innerHTML = `<h3>${esc(def.title)} settings</h3><form method="dialog" class="bd-setform">${def.settings.map(s => s.type === "check"
      ? `<label class="bd-check"><input type="checkbox" name="${s.k}"${c[s.k] ? " checked" : ""}> ${esc(s.label)}</label>`
      : `<label>${esc(s.label)} <select name="${s.k}">${s.options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(c[s.k]) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`).join("")}
      <div class="bd-libfoot"><button type="button" data-a="cancel">Cancel</button><button class="bd-primary">Save</button></div></form>`;
    dlg.querySelector("[data-a=cancel]").onclick = () => dlg.close();
    dlg.querySelector("form").onsubmit = () => {
      const f = dlg.querySelector("form"), out = {};
      for (const s of def.settings) {
        const v = s.type === "check" ? f[s.k].checked : f[s.k].value;
        out[s.k] = s.type === "check" ? v : (s.options.find(([o]) => String(o) === v) || [s.def])[0];   // keep numbers as numbers
      }
      save(out);
    };
    dlg.showModal();
  }

  // "Start this print?" box with the file's picture, used by Files and History
  const pdlg = el("dialog", "bd-lib bd-print");
  document.body.append(pdlg);
  const thumbUrl = (pid, file) => `/api/printers/${pid}/thumbnail?file=${encodeURIComponent(file)}`;
  function printFile(path) {
    const p = current(); if (!p) return;
    pdlg.innerHTML = `<h3>Start this print?</h3><div class="bd-pp"><img alt="" src="${thumbUrl(p.id, path)}"><div><b>${esc(path)}</b>
      <div class="pb-muted">on ${esc(p.name)}</div></div></div>
      <div class="bd-libfoot"><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="go">Print</button></div>`;
    const img = pdlg.querySelector("img"); img.onerror = () => { img.hidden = true; };
    pdlg.querySelector("[data-a=no]").onclick = () => pdlg.close();
    pdlg.querySelector("[data-a=go]").onclick = async () => {
      pdlg.close();
      try { await api(`/api/printers/${p.id}/files/print`, { method: "POST", body: JSON.stringify({ path }) }); toast(`Started ${path}`); }
      catch (e) { toast(`${p.name}: ${e.message}`); }
    };
    pdlg.showModal();
  }

  // call an allowed Moonraker method for the open printer (see RPC_ALLOW in main.py)
  const rpc = async (method, params) => {
    if (pageId === null) throw new Error("no printer open");
    return (await api(`/api/printers/${pageId}/rpc`, { method: "POST", body: JSON.stringify({ method, params }) })).result;
  };
  const fileUrl = (root, path, download) => `/api/printers/${pageId}/file?root=${root}&path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
  const reveal = host => host.dispatchEvent(new CustomEvent("pb-reveal", { bubbles: true }));   // builder switches to its tab
  const confirmGcode = (text, script, done) => { if (confirm(text)) { gcode(script); if (done) toast(done); } };

  return { defs, homeDefs, homePanel, panel, mount, settings, printFile, thumbUrl, rpc, fileUrl, confirmGcode, reveal, unmount, shown, el, icon, store, current, take, park: n => n && parking.append(n),
           onRoute: f => routeHooks.push(f) };
})();
