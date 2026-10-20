// Printer Buddy - dashboard builder core: the panel registry and one shared live feed for every panel.
// Loaded after the main page script; builds on its globals (printers, pageId, renderPage, route, conAdd, gcode...).
// A panel file calls  PB.panel("name", { title, icon, cls, single, settings, gear, create(host, cfg) -> { open, update, shown, log, destroy } })
//   gear: true    its ⚙ settings button shows all the time, not only in Edit layout (for options people change often)
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
  const pageHooks = [];   // extras/ features that run on every printer page refresh
  renderPage = () => {
    baseRender(); const p = current();
    if (p) { each(i => i.update?.(p), [...live].filter(page)); for (const f of pageHooks) { try { f(p); } catch (e) { console.error(e); } } }
  };
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
  // start-print dialog: thumbnail, time + filament, the spool to use (Spoolman) and timelapse on / off (if this box records)
  let tlOn = null;
  const dur = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
  async function printFile(path) {
    const p = current(); if (!p) return;
    pdlg.innerHTML = `<h3>Start this print?</h3><div class="bd-pp"><img alt="" src="${thumbUrl(p.id, path)}"><div><b>${esc(path)}</b>
      <div class="pb-muted">on ${esc(p.name)}</div><div class="pb-muted bd-ppmeta"></div></div></div>
      <div class="bd-ppopts"></div>
      <div class="bd-libfoot"><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="go">Print</button></div>`;
    const img = pdlg.querySelector("img"); img.onerror = () => { img.hidden = true; };
    const opts = pdlg.querySelector(".bd-ppopts");
    let spool = null, spools = [];
    pdlg.querySelector("[data-a=no]").onclick = () => pdlg.close();
    pdlg.querySelector("[data-a=go]").onclick = async () => {
      const sel = opts.querySelector("[data-o=spool]"), tl = opts.querySelector("[data-o=tl]");
      pdlg.close();
      try {
        if (sel && sel.value !== String(spool ?? "")) await rpc("server.spoolman.post_spool_id", { spool_id: sel.value ? +sel.value : null });
        await api(`/api/printers/${p.id}/files/print`, { method: "POST", body: JSON.stringify({ path, ...(tl ? { timelapse: tl.checked } : {}) }) });
        toast(`Started ${path}`);
      } catch (e) { toast(`${p.name}: ${e.message}`); }
    };
    pdlg.showModal();
    // the extras load after the dialog is open, so it never waits on a slow printer
    rpc("server.files.metadata", { filename: path }).then(m => {
      const bits = [m?.estimated_time && `about ${dur(m.estimated_time)}`, m?.filament_total && `${(m.filament_total / 1000).toFixed(1)} m filament`,
                    m?.filament_type, m?.layer_height && `${m.layer_height} mm layers`].filter(Boolean);
      pdlg.querySelector(".bd-ppmeta").textContent = bits.join(" · ");
    }).catch(() => {});
    if (tlOn === null) { try { tlOn = !!(await api("/api/timelapse/settings")).enabled; } catch { tlOn = false; } }
    if (tlOn) opts.insertAdjacentHTML("beforeend", `<label class="bd-check"><input type="checkbox" data-o="tl" checked> Record a timelapse of this print</label>`);
    try {
      const st = await rpc("server.spoolman.status");
      if (!st?.spoolman_connected) return;
      spool = st.spool_id ?? null;
      const r = await rpc("server.spoolman.proxy", { request_method: "GET", path: "/v1/spool", use_v2_response: true });
      spools = (Array.isArray(r) ? r : r?.response || []).filter(s => !s.archived);
      const nm = s => [s.filament?.vendor?.name, s.filament?.name, s.filament?.material].filter(Boolean).join(" · ") || `Spool ${s.id}`;
      const left = s => s.remaining_weight != null ? ` (${Math.round(s.remaining_weight)} g left)` : "";
      opts.insertAdjacentHTML("afterbegin", `<label class="bd-field">Spool <select data-o="spool"><option value="">No spool</option>
        ${spools.map(s => `<option value="${s.id}"${s.id === spool ? " selected" : ""}>#${s.id} ${esc(nm(s))}${left(s)}</option>`).join("")}</select></label>`);
    } catch {}
  }
  // call an allowed Moonraker method for the open printer (see RPC_ALLOW in main.py)
  const rpc = async (method, params) => {
    if (pageId === null) throw new Error("no printer open");
    return (await api(`/api/printers/${pageId}/rpc`, { method: "POST", body: JSON.stringify({ method, params }) })).result;
  };
  const fileUrl = (root, path, download) => `/api/printers/${pageId}/file?root=${root}&path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
  const reveal = host => host.dispatchEvent(new CustomEvent("pb-reveal", { bubbles: true }));   // builder switches to its tab
  const confirmGcode = (text, script, done) => { if (confirm(text)) { gcode(script); if (done) toast(done); } };
  // small per-printer lists saved on the box (presets, notes, maintenance, console filters) - see printer_kv in main.py
  const kv = {
    get: async (key, pid = pageId) => (await api(`/api/printers/${pid}/kv?key=${key}`)).value,
    set: (key, value, pid = pageId) => api(`/api/printers/${pid}/kv?key=${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
  };

  // shared helpers for the page-wide features in core/extras/
  const x = {
    onPage: () => pageId !== null && !$("#page").hidden && $("#page").offsetParent !== null,
    cur: () => current(),
    send: script => gcode(script),
    live: p => p && p.connection === "online" && p.klippy_state === "ready",
    dialog: cls => { const d = el("dialog", `bd-lib pb-xd ${cls}`); document.body.append(d); return d; },
    pageHook: f => pageHooks.push(f),
  };

  return { x, defs, homeDefs, homePanel, panel, mount, settings, printFile, thumbUrl, rpc, fileUrl, confirmGcode, kv, gcode: script => gcode(script), reveal, unmount, shown, el, icon, store, current, take, park: n => n && parking.append(n),
           onRoute: f => routeHooks.push(f) };
})();
