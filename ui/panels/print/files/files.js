PB.panel("files", {
  title: "Files", desc: "G-code, config and log files with folders", cls: "adv",
  icon: PB.icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
  settings: [
    { k: "thumbs", label: "Show thumbnails", type: "check", def: true },
    { k: "rows", label: "Files shown", type: "select", def: 25, options: [[10, "10"], [25, "25"], [0, "All"]] },
    { k: "roots", label: "Show config + logs folders", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool">
        <select data-a="root" aria-label="Folder"${cfg.roots ? "" : " hidden"}><option value="gcodes">G-code</option><option value="config">Config</option><option value="logs">Logs</option></select>
        <label class="pb-btn pb-pri" data-g>Upload<input type="file" accept=".gcode,.gco,.g" multiple hidden></label>
        <label class="pb-chk" data-g><input type="checkbox"> Start after upload</label>
        <input type="search" placeholder="Search…" aria-label="Search files">
        <label class="pb-chk" title="Search every folder, not just this one"><input type="checkbox" data-a="everywhere"> All folders</label>
        <select data-a="filter" aria-label="Show" data-g><option value="">All files</option><option value="new">Not printed yet</option><option value="done">Printed before</option></select>
        <select data-a="sort" aria-label="Sort"><option value="new">Newest</option><option value="name">Name</option><option value="size">Biggest</option><option value="time">Print time</option></select>
        <button type="button" data-a="mkdir" title="New folder">+ Folder</button>
        <button type="button" data-a="sel" title="Pick several files to delete, move or download" aria-pressed="false">Select</button>
        <button type="button" data-a="ref" data-head title="Refresh" aria-label="Refresh">${PB.ic.refresh}</button></div>
      <div class="pb-bulk" hidden><b class="pb-bn">0 picked</b><button type="button" data-b="all">All</button><button type="button" data-b="none">None</button><span class="bd-sp"></span>
        <button type="button" data-b="dl">${PB.ic.download}Download</button><button type="button" data-b="mv">Move to…</button><button type="button" data-b="del" class="pb-danger">Delete</button></div>
      <div class="pb-crumbs"></div><div class="pb-msg pb-muted" aria-live="polite"></div><div class="pb-list"></div>
      <button type="button" class="pb-more" hidden></button>`;
    const q = s => host.querySelector(s), list = q(".pb-list"), msg = q(".pb-msg"), more = q(".pb-more");
    let root = "gcodes", dir = "", dirs = [], files = [], loaded = false, showAll = false, busy = false, selecting = false, picked = new Set(), everything = null;
    const full = name => (dir ? dir + "/" : "") + name;
    const meta = f => [f.estimated_time ? fmtDur(f.estimated_time) : null, f.filament_total ? fmtFil(f.filament_total) : null,
                       f.layer_height ? `${f.layer_height} mm layers` : null, f.slicer || null].filter(Boolean);
    async function load() {
      const id = pageId; if (id === null) return;
      loaded = true; msg.textContent = "Loading…"; everything = null; picked.clear();
      try {
        const r = await PB.rpc("server.files.get_directory", { path: root + (dir ? "/" + dir : ""), extended: true });
        if (id !== pageId) return;
        dirs = (r.dirs || []).filter(d => !d.dirname.startsWith("."));
        files = (r.files || []).filter(f => !f.filename.startsWith("."));
        draw();
      } catch (e) { if (id === pageId) { msg.textContent = e.message; list.innerHTML = ""; } }
    }
    function crumbs() {
      const parts = dir ? dir.split("/") : [];
      q(".pb-crumbs").innerHTML = [`<button type="button" data-d="">${root === "gcodes" ? "G-code" : root === "config" ? "Config" : "Logs"}</button>`]
        .concat(parts.map((p, i) => `<button type="button" data-d="${esc(parts.slice(0, i + 1).join("/"))}">${esc(p)}</button>`)).join(" / ");
      for (const b of q(".pb-crumbs").querySelectorAll("[data-d]")) b.onclick = () => { dir = b.dataset.d; showAll = false; load(); };
    }
    function draw() {
      crumbs();
      const g = root === "gcodes";
      for (const e of host.querySelectorAll("[data-g]")) e.hidden = !g;
      q("[data-a=mkdir]").hidden = root === "logs";
      const term = q("input[type=search]").value.trim().toLowerCase(), sort = q("[data-a=sort]").value;
      const by = { name: (a, b) => a.filename.localeCompare(b.filename), size: (a, b) => (b.size || 0) - (a.size || 0),
                   time: (a, b) => (b.estimated_time || 0) - (a.estimated_time || 0), new: (a, b) => (b.modified || 0) - (a.modified || 0) }[sort];
      if (term && q("[data-a=everywhere]").checked) return srch.drawEverywhere(term, by);
      const filt = g ? q("[data-a=filter]").value : "";
      let rows = files.filter(f => (!term || f.filename.toLowerCase().includes(term))
        && (!filt || (filt === "new" ? !f.print_start_time : !!f.print_start_time))).sort(by);
      const ds = dirs.filter(d => !term || d.dirname.toLowerCase().includes(term)).sort((a, b) => a.dirname.localeCompare(b.dirname));
      const total = rows.length, cap = cfg.rows && !showAll ? cfg.rows : Infinity;
      rows = rows.slice(0, cap);
      msg.textContent = !files.length && !dirs.length ? "This folder is empty." : `${ds.length ? ds.length + " folders, " : ""}${files.length} files`;
      list.innerHTML = (dir ? `<div class="pb-li pb-dir" data-up><span class="pb-lthumb pb-ico">↩</span><div class="pb-lmain"><div class="pb-lname">..</div></div></div>` : "")
        + ds.map(d => `<div class="pb-li pb-dir" data-open="${esc(d.dirname)}"><span class="pb-lthumb pb-ico">${PB.ic.folder}</span>
            <div class="pb-lmain"><div class="pb-lname">${esc(d.dirname)}</div><div class="pb-lsub">${fmtDate(d.modified)}</div></div>
            <div class="pb-lbtn">${root !== "logs" ? `<button type="button" data-ren="${esc(d.dirname)}" data-isdir="1" title="Rename">${PB.ic.pencil}</button>
            <button type="button" data-deld="${esc(d.dirname)}" title="Delete folder">${PB.ic.x}</button>` : ""}</div></div>`).join("")
        + rows.map(f => `<div class="pb-li${picked.has(f.filename) ? " picked" : ""}">${selecting ? `<input type="checkbox" class="pb-pick" data-pick="${esc(f.filename)}"${picked.has(f.filename) ? " checked" : ""} aria-label="Pick ${esc(f.filename)}">` : ""}
            ${g && cfg.thumbs ? `<img class="pb-lthumb" loading="lazy" alt="" src="${PB.thumbUrl(pageId, full(f.filename))}">` : g ? "" : `<span class="pb-lthumb pb-ico">${PB.ic.file}</span>`}
            <div class="pb-lmain"><div class="pb-lname">${esc(f.filename)}</div>
              <div class="pb-lsub">${[fmtSize(f.size), fmtDate(f.modified), ...(g ? meta(f) : [])].join(" · ")}</div></div>
            <div class="pb-lbtn">${g ? `<button type="button" class="pb-pri" data-print="${esc(f.filename)}"${busy ? " disabled" : ""}>Print</button>
              <button type="button" data-queue="${esc(f.filename)}" title="Add to the job queue">+ Queue</button>
              ${PB.previewFile ? `<button type="button" data-prev="${esc(f.filename)}" title="Preview the G-code">Preview</button>` : ""}` : ""}
              ${root === "config" && PB.openConfig ? `<button type="button" data-edit="${esc(f.filename)}">Edit</button>` : ""}
              ${pv.PREVIEW.test(f.filename) ? `<button type="button" data-look="${esc(f.filename)}" title="Show it here">${PB.ic.eye}</button>` : ""}
              <a class="pb-dl" href="${PB.fileUrl(root, full(f.filename), true)}" title="Download" aria-label="Download">${PB.ic.download}</a>
              ${root !== "logs" ? `<button type="button" data-ren="${esc(f.filename)}" title="Rename">${PB.ic.pencil}</button><button type="button" data-dup="${esc(f.filename)}" title="Duplicate">⧉</button><button type="button" data-del="${esc(f.filename)}" title="Delete">${PB.ic.x}</button>` : ""}
            </div></div>`).join("");
      for (const img of list.querySelectorAll("img.pb-lthumb")) img.onerror = () => img.classList.add("none");
      list.querySelector("[data-up]")?.addEventListener("click", () => { dir = dir.split("/").slice(0, -1).join("/"); showAll = false; load(); });
      for (const r of list.querySelectorAll("[data-open]")) r.onclick = e => { if (e.target.closest("button")) return; dir = full(r.dataset.open); showAll = false; load(); };
      for (const b of list.querySelectorAll("[data-print]")) b.onclick = () => PB.printFile(full(b.dataset.print));
      for (const c of list.querySelectorAll("[data-pick]")) c.onchange = () => { if (c.checked) picked.add(c.dataset.pick); else picked.delete(c.dataset.pick); c.closest(".pb-li").classList.toggle("picked", c.checked); bulkBar(); };
      for (const b of list.querySelectorAll("[data-look]")) b.onclick = () => pv.look(full(b.dataset.look));
      sel.bulkBar();
      for (const b of list.querySelectorAll("[data-queue]")) b.onclick = () => PB.queueAdd ? PB.queueAdd(full(b.dataset.queue))
        : api(`/api/printers/${pageId}/queue`, { method: "POST", body: JSON.stringify({ action: "add", filenames: [full(b.dataset.queue)] }) })
            .then(r => toast(`Queued ${b.dataset.queue} (${r.jobs.length} in the queue)`), e => toast(e.message));
      for (const b of list.querySelectorAll("[data-edit]")) b.onclick = () => PB.openConfig(full(b.dataset.edit));
      for (const b of list.querySelectorAll("[data-prev]")) b.onclick = () => PB.previewFile(full(b.dataset.prev));
      for (const b of list.querySelectorAll("[data-ren]")) b.onclick = async () => {
        const old = b.dataset.ren, name = prompt("New name:", old);
        if (!name || name === old || name.includes("/")) return;
        try { await PB.rpc("server.files.move", { source: `${root}/${full(old)}`, dest: `${root}/${full(name)}` }); load(); } catch (e) { toast(e.message); }
      };
      for (const b of list.querySelectorAll("[data-dup]")) b.onclick = async () => {
        const old = b.dataset.dup, dot = old.lastIndexOf("."), def = dot > 0 ? `${old.slice(0, dot)}_copy${old.slice(dot)}` : `${old}_copy`;
        const name = prompt("Name of the copy:", def);
        if (!name || name === old || name.includes("/")) return;
        try { await PB.rpc("server.files.copy", { source: `${root}/${full(old)}`, dest: `${root}/${full(name)}` }); toast(`Copied to ${name}`); load(); } catch (e) { toast(e.message); }
      };
      for (const b of list.querySelectorAll("[data-del]")) b.onclick = async () => {
        if (!confirm(`Delete ${b.dataset.del}?`)) return;
        try { await PB.rpc("server.files.delete_file", { path: `${root}/${full(b.dataset.del)}` }); load(); } catch (e) { toast(e.message); }
      };
      for (const b of list.querySelectorAll("[data-deld]")) b.onclick = async () => {
        if (!confirm(`Delete the folder ${b.dataset.deld} and everything in it?`)) return;
        try { await PB.rpc("server.files.delete_directory", { path: `${root}/${full(b.dataset.deld)}`, force: true }); load(); } catch (e) { toast(e.message); }
      };
      more.hidden = total <= cap || showAll;
      more.textContent = `Show all ${total}`;
    }
    q("input[type=search]").oninput = draw;
    q("[data-a=everywhere]").onchange = draw;
    q("[data-a=filter]").onchange = draw;
    const c = {
      q, list, msg, more, load: () => load(), draw: () => draw(), crumbs: () => crumbs(), full: n => full(n), picked,
      get root() { return root; }, get dir() { return dir; }, set dir(v) { dir = v; }, get busy() { return busy; },
      get selecting() { return selecting; }, set selecting(v) { selecting = v; }, get showAll() { return showAll; }, set showAll(v) { showAll = v; },
      get everything() { return everything; }, set everything(v) { everything = v; },
    };
    const srch = PB.parts.filesSearch(c), sel = PB.parts.filesSelect(c), pv = PB.parts.filesPreview(c);
    q("[data-a=sort]").onchange = draw;
    q("[data-a=ref]").onclick = load;
    q("[data-a=root]").onchange = e => { root = e.target.value; dir = ""; showAll = false; load(); };
    q("[data-a=mkdir]").onclick = async () => {
      const name = prompt("New folder name:"); if (!name || name.includes("/")) return;
      try { await PB.rpc("server.files.post_directory", { path: `${root}/${full(name)}` }); load(); } catch (e) { toast(e.message); }
    };
    more.onclick = () => { showAll = true; draw(); };
    q("input[type=file]").onchange = e => {
      const picked = [...e.target.files], start = q(".pb-chk input").checked && picked.length === 1; e.target.value = "";
      uploadAll(picked, start, dir);
    };
    PB.uploadFiles = picked => uploadAll(picked, false, root === "gcodes" ? dir : "");
    async function uploadAll(picked, start, dir) {
      const id = pageId;
      for (const [n, file] of picked.entries()) {
        if (id !== pageId) return;
        await new Promise(done => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/printers/${id}/files/upload?name=${encodeURIComponent(file.name)}&dir=${encodeURIComponent(dir)}&print=${start ? 1 : 0}`);
          xhr.upload.onprogress = ev => { if (ev.lengthComputable) msg.textContent = `Uploading ${n + 1}/${picked.length}: ${file.name}… ${Math.round(ev.loaded / ev.total * 100)}%`; };
          xhr.onload = () => {
            let err = null; try { err = JSON.parse(xhr.responseText).error; } catch {}
            if (xhr.status >= 200 && xhr.status < 300) toast(start ? `Uploaded and started ${file.name}` : `Uploaded ${file.name}`);
            else toast(`${file.name}: upload failed: ${err || `HTTP ${xhr.status}`}`);
            done();
          };
          xhr.onerror = () => { toast(`${file.name}: upload failed (network)`); done(); };
          xhr.send(file);
        });
      }
      if (id === pageId) load();
    }
    return {
      open() { files = []; dirs = []; dir = ""; loaded = false; showAll = false; everything = null; picked.clear(); list.innerHTML = ""; msg.textContent = ""; },
      destroy() { pv.destroy(); },
      shown() { if (!loaded) load(); },
      update(p) {
        const b = p.state === "printing" || p.state === "paused";
        if (b !== busy) { busy = b; for (const x of list.querySelectorAll("[data-print]")) x.disabled = busy; }
        const on = p.connection === "online";
        for (const x of host.querySelectorAll(".pb-tool button, .pb-tool input[type=file]")) x.disabled = !on;
      },
    };
  },
});
