// Loaded after the main page script; builds on its globals (printers, pageId, renderPage, route, conAdd, gcode...).
// A panel file calls  PB.panel("name", { title, icon, cls, single, settings, gear, create(host, cfg) -> { open, update, shown, log, destroy } })
//   gear: true    its ⚙ settings button shows all the time, not only in Edit layout (for options people change often)
//   settings      [{ k, label, type: "check" | "select", options: [[value, label], ...], def }] - shown under the panel's gear
//   edit(cfg, save)  instead of settings: the gear opens the panel's own setup box; call save(newCfg) when done
//   create(host, cfg)  build your HTML inside host (the panel body); cfg = this panel's settings (defaults filled in)
//   open(id)      a printer page was opened (reset per-printer state)
//   update(p)     new data for the open printer (several times a second)
//   shown()       the panel's tab just became visible (load lists, resize charts)
//   log(kind, t)  a console line arrived for the open printer
//   destroy()     the panel was removed from the layout
window.PB = (() => {
  const defs = {}, homeDefs = {}, live = new Set(), routeHooks = [];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const icon = path => `<svg class="pb-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
                  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const each = (fn, only) => { for (const i of only || live) { try { fn(i); } catch (e) { console.error(`panel ${i.type}:`, e); } } };
  const current = () => (pageId !== null && printers.get(pageId)) || null;
  const parking = el("div"); parking.hidden = true; document.body.append(parking);
  const take = sel => { const n = document.querySelector(sel); if (n) n.hidden = false; return n; };

  function panel(type, def) { defs[type] = { type, title: type, icon: "", cls: "", single: false, ...def }; }
  function homePanel(type, def) { homeDefs[type] = { type, title: type, icon: "", cls: "", single: false, home: true, ...def }; }
  const page = i => !i.def.home, home = i => i.def.home;
  const all = () => [...printers.values()];

  const config = (def, cfg) => def.edit ? structuredClone(cfg || {}) : Object.fromEntries((def.settings || []).map(s => [s.k, cfg?.[s.k] ?? s.def]));

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
  const pageHooks = [];
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
  showTab = () => {};

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

  const pdlg = el("dialog", "bd-lib bd-print");
  document.body.append(pdlg);
  const thumbUrl = (pid, file) => `/api/printers/${pid}/thumbnail?file=${encodeURIComponent(file)}`;
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
  const rpc = async (method, params) => {
    if (pageId === null) throw new Error("no printer open");
    return (await api(`/api/printers/${pageId}/rpc`, { method: "POST", body: JSON.stringify({ method, params }) })).result;
  };
  const fileUrl = (root, path, download) => `/api/printers/${pageId}/file?root=${root}&path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
  const reveal = host => host.dispatchEvent(new CustomEvent("pb-reveal", { bubbles: true }));
  const confirmGcode = (text, script, done) => { if (confirm(text)) { gcode(script); if (done) toast(done); } };
  const kv = {
    get: async (key, pid = pageId) => (await api(`/api/printers/${pid}/kv?key=${key}`)).value,
    set: (key, value, pid = pageId) => api(`/api/printers/${pid}/kv?key=${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
  };

  const ic = {
    x: icon('<path d="M18 6L6 18M6 6l12 12"/>'),
    cog: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    download: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
    refresh: icon('<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>'),
    pencil: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    eye: icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: icon('<path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"/>'),
    grip: icon('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
    more: icon('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
    folder: icon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
    file: icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
    wrench: icon('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>'),
    bell: icon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
    alert: icon('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>'),
    flame: icon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.3 1.3 2.6 2.5 2.8z"/>'),
    snow: icon('<path d="M12 2v20M17 5l-5 5-5-5M7 19l5-5 5 5M2 12h20M5 7l5 5-5 5M19 17l-5-5 5-5"/>'),
    search: icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    note: icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    chart: icon('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    list: icon('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    external: icon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>'),
    sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: icon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    contrast: icon('<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>'),
    down: icon('<path d="M6 9l6 6 6-6"/>'),
    copy: icon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    trash: icon('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
    camera: icon('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-4v12l-6-4z"/>'),
  };

  const x = {
    onPage: () => pageId !== null && !$("#page").hidden && $("#page").offsetParent !== null,
    cur: () => current(),
    send: script => gcode(script),
    live: p => p && p.connection === "online" && p.klippy_state === "ready",
    dialog: cls => { const d = el("dialog", `bd-lib pb-xd ${cls}`); document.body.append(d); return d; },
    pageHook: f => pageHooks.push(f),
  };

  return { x, ic, defs, homeDefs, homePanel, panel, mount, settings, printFile, thumbUrl, rpc, fileUrl, confirmGcode, kv, gcode: script => gcode(script), reveal, unmount, shown, el, icon, store, current, take, park: n => n && parking.append(n),
           onRoute: f => routeHooks.push(f) };
})();
