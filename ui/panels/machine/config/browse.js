PB.parts = PB.parts || {};
PB.parts.cfgBrowse = c => {
    const ROOTS = { config: "Config", config_examples: "Config examples", docs: "Docs" };
    const FILTERS = [   // [key, label, test(name), folders too]
      ["hidden", "Hide hidden files", n => /^\.(?!\.$)/.test(n), true],
      ["klipper", "Hide Klipper backups", n => /^printer-\d{8}_\d{6}\.cfg$/.test(n)],
      ["moonraker", "Hide Moonraker backup", n => n === ".moonraker.conf.bkp"],
      ["mru", "Hide temporary uploads", n => /\.mru$/i.test(n)],
      ["crowsnest", "Hide Crowsnest backups", n => /^crowsnest\.conf\.\d{4}-\d{2}-\d{2}-\d{4}$/.test(n)],
    ];
    const hide = new Set(PB.store.get("pb-cfg-hide", FILTERS.map(f => f[0])));
    let sort = PB.store.get("pb-cfg-sort", { k: "name", desc: false });
    const list = c.q(".pb-cfiles"), msg = t => { c.q(".pb-ccount").textContent = t; };
    const when = t => t ? new Date(t * 1000).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "";
    const kb = n => n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
    const shows = (n, dir) => !FILTERS.some(([k, , t, dirs]) => hide.has(k) && (dirs || !dir) && t(n));
    async function load() {
      const id = pageId; if (id === null) return;
      c.loaded = true; msg("Loading…");
      try {
        const r = await PB.rpc("server.files.get_directory", { path: c.root + (c.dir ? "/" + c.dir : "") });
        if (id !== pageId) return;
        Object.assign(c, { dirs: r.dirs || [], files: r.files || [], disk: r.disk_usage || null, err: "" });
      } catch (e) { if (id !== pageId) return; Object.assign(c, { dirs: [], files: [], disk: null, err: e.message }); }
      draw();
    }
    const go = d => { c.dir = d; c.picked.clear(); c.q("input[type=search]").value = ""; load(); };
    function crumbs() {
      const parts = c.dir ? c.dir.split("/") : [];
      c.q(".pb-crumbs").innerHTML = [`<button type="button" data-d="">${ROOTS[c.root]}</button>`]
        .concat(parts.map((p, i) => `<button type="button" data-d="${esc(parts.slice(0, i + 1).join("/"))}">${esc(p)}</button>`)).join(" / ");
      for (const b of c.q(".pb-crumbs").querySelectorAll("[data-d]")) b.onclick = () => go(b.dataset.d);
    }
    function low() {
      const d = c.disk, w = c.q(".pb-clow"), on = !!d && d.free < Math.min(1073741824, d.total * 0.2);
      w.hidden = !on;
      if (on) w.title = `Low on disk space: ${kb(d.free)} free of ${kb(d.total)}`;
    }
    function draw() {
      crumbs(); low();
      const ro = c.ro(), term = c.q("input[type=search]").value.trim().toLowerCase();
      c.q("[data-a=add]").hidden = ro;
      const ok = (n, dir) => (!term || n.toLowerCase().includes(term)) && shows(n, dir);
      const by = (a, b) => { const r = sort.k === "name" ? a.n.localeCompare(b.n, undefined, { numeric: true }) : (a[sort.k] || 0) - (b[sort.k] || 0); return sort.desc ? -r : r; };
      const ds = c.dirs.map(d => ({ n: d.dirname, modified: d.modified, size: d.size, d: true })).filter(x => ok(x.n, true)).sort(by);
      const fs = c.files.map(f => ({ n: f.filename, modified: f.modified, size: f.size })).filter(x => ok(x.n, false)).sort(by);
      c.rows = [...ds, ...fs];
      for (const n of [...c.picked]) if (!c.rows.some(r => r.n === n)) c.picked.delete(n);
      const arrow = k => sort.k === k ? (sort.desc ? " ↓" : " ↑") : "";
      const all = c.rows.length && c.rows.every(r => c.picked.has(r.n));
      c.q(".pb-chead").innerHTML = `${ro ? "<span></span>" : `<input type="checkbox" data-all aria-label="Pick all"${all ? " checked" : ""}>`}
        <button type="button" data-s="name">Name${arrow("name")}</button><button type="button" data-s="modified">Modified${arrow("modified")}</button><button type="button" data-s="size">Size${arrow("size")}</button>`;
      const up = c.dir ? `<div class="pb-crow pb-cdir" data-to="${esc(c.dir.split("/").slice(0, -1).join("/"))}" tabindex="0"><span></span>
          <span class="pb-cname">${PB.ic.folder}<span>..</span></span><small></small><small></small></div>` : "";
      list.innerHTML = up + (c.rows.map(r => `<div class="pb-crow${r.d ? " pb-cdir" : ""}${c.picked.has(r.n) ? " picked" : ""}" data-n="${esc(r.n)}"${r.d ? ` data-to="${esc(c.full(r.n))}"` : ""}${ro ? "" : ' draggable="true"'} tabindex="0">
          ${ro ? "<span></span>" : `<input type="checkbox" data-pick${c.picked.has(r.n) ? " checked" : ""} aria-label="Pick ${esc(r.n)}">`}
          <span class="pb-cname">${r.d ? PB.ic.folder : PB.ic.file}<span>${esc(r.n)}</span></span>
          <small class="pb-muted">${esc(when(r.modified))}</small><small class="pb-muted">${r.d ? "" : esc(kb(r.size))}</small></div>`).join("")
        || (c.loaded && !c.err ? `<p class="pb-muted">${term ? "Nothing matches." : "This folder is empty."}</p>` : ""));
      msg(c.err || (c.loaded ? `${ds.length ? `${ds.length} folder${ds.length === 1 ? "" : "s"}, ` : ""}${fs.length} file${fs.length === 1 ? "" : "s"}` : ""));
      c.q("[data-all]")?.addEventListener("change", e => { for (const r of c.rows) e.target.checked ? c.picked.add(r.n) : c.picked.delete(r.n); draw(); });
      for (const b of c.q(".pb-chead").querySelectorAll("[data-s]")) b.onclick = () => {
        const k = b.dataset.s; sort = sort.k === k ? { k, desc: !sort.desc } : { k, desc: k !== "name" }; PB.store.set("pb-cfg-sort", sort); draw();
      };
      for (const row of list.querySelectorAll(".pb-crow")) {
        row.onclick = e => { if (e.target.matches("[data-pick]")) return; if (row.dataset.to != null) go(row.dataset.to); else c.openFile(row.dataset.n); };
        row.onkeydown = e => { if (e.key === "Enter" && e.target === row) row.click(); };
      }
      for (const x of list.querySelectorAll("[data-pick]")) x.onchange = () => {
        const row = x.closest(".pb-crow"); if (x.checked) c.picked.add(row.dataset.n); else c.picked.delete(row.dataset.n);
        row.classList.toggle("picked", x.checked); c.q("[data-all]").checked = c.rows.every(r => c.picked.has(r.n)); c.bulk();
      };
      c.wire(list);
      c.bulk();
    }
    c.q("input[type=search]").oninput = draw;
    c.q("[data-a=root]").onchange = e => { c.root = e.target.value; go(""); };
    c.q("[data-a=filter]").onclick = e => c.menu(e.currentTarget, FILTERS.map(([k, label]) => ({
      label, check: hide.has(k), run: on => { if (on) hide.add(k); else hide.delete(k); PB.store.set("pb-cfg-hide", [...hide]); draw(); } })));
    const gd = PB.el("dialog", "bd-lib pb-xd pb-cmdhelp"); document.body.append(gd);
    gd.innerHTML = `<div class="pb-ptop"><h3>Go to file</h3><button type="button" class="pb-px" aria-label="Close">${PB.ic.x}</button></div>
      <input type="search" placeholder="File name…" aria-label="File name"><div class="pb-cmdlist"></div>`;
    const gin = gd.querySelector("input"), gbox = gd.querySelector(".pb-cmdlist");
    let every = [];
    const pick = p => { gd.close(); const i = p.lastIndexOf("/"); go(i > 0 ? p.slice(0, i) : ""); c.openFile(p.slice(i + 1)); };
    function drawGo() {
      const t = gin.value.trim().toLowerCase(), hits = every.filter(p => !t || p.toLowerCase().includes(t)).slice(0, 200);
      gbox.innerHTML = hits.map(p => `<button type="button" data-p="${esc(p)}"><b>${esc(p)}</b></button>`).join("") || `<p class="pb-muted">No match.</p>`;
      for (const b of gbox.querySelectorAll("[data-p]")) b.onclick = () => pick(b.dataset.p);
    }
    gin.oninput = drawGo;
    gin.onkeydown = e => { const b = gbox.querySelector("[data-p]"); if (e.key === "Enter" && b) { e.preventDefault(); pick(b.dataset.p); } };
    gd.querySelector(".pb-px").onclick = () => gd.close();
    c.q("[data-a=goto]").onclick = async () => {
      gin.value = ""; gbox.innerHTML = `<p class="pb-muted">Loading…</p>`; gd.showModal(); gin.focus();
      try { every = ((await PB.rpc("server.files.list", { root: c.root })) || []).map(f => f.path || f.filename).sort(); drawGo(); }
      catch (e) { gbox.innerHTML = `<p class="pb-muted">${esc(e.message)}</p>`; }
    };
  Object.assign(c, { load, draw });
  return { destroy() { gd.remove(); } };
};
