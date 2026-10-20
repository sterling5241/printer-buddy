// Files panel: the printer's G-code files with thumbnails, search, sort, upload, print and delete.
PB.panel("files", {
  title: "Files", cls: "adv",
  icon: PB.icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
  settings: [
    { k: "thumbs", label: "Show thumbnails", type: "check", def: true },
    { k: "rows", label: "Files shown", type: "select", def: 25, options: [[10, "10"], [25, "25"], [0, "All"]] },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool">
        <label class="pb-btn pb-pri">Upload<input type="file" accept=".gcode,.gco,.g" hidden></label>
        <label class="pb-chk"><input type="checkbox"> Start after upload</label>
        <input type="search" placeholder="Search files…" aria-label="Search files">
        <select aria-label="Sort"><option value="new">Newest</option><option value="name">Name</option><option value="size">Biggest</option></select>
        <button type="button" data-a="ref" title="Refresh" aria-label="Refresh">↻</button></div>
      <div class="pb-msg pb-muted" aria-live="polite"></div><div class="pb-list"></div>
      <button type="button" class="pb-more" hidden></button>`;
    const q = s => host.querySelector(s), list = q(".pb-list"), msg = q(".pb-msg"), more = q(".pb-more");
    let files = [], loaded = false, showAll = false, busy = false;
    async function load() {
      const id = pageId; if (id === null) return;
      loaded = true; msg.textContent = "Loading…";
      try { files = (await api(`/api/printers/${id}/files`)).files || []; if (id === pageId) draw(); }
      catch (e) { if (id === pageId) { msg.textContent = e.message; list.innerHTML = ""; } }
    }
    function draw() {
      const term = q("input[type=search]").value.trim().toLowerCase(), sort = q("select").value;
      let rows = files.filter(f => !term || f.path.toLowerCase().includes(term));
      rows.sort(sort === "name" ? (a, b) => a.path.localeCompare(b.path) : sort === "size" ? (a, b) => (b.size || 0) - (a.size || 0)
                                : (a, b) => (b.modified || 0) - (a.modified || 0));
      const total = rows.length, cap = cfg.rows && !showAll ? cfg.rows : Infinity;
      rows = rows.slice(0, cap);
      msg.textContent = !files.length ? "No G-code files on the printer yet." : term ? `${total} of ${files.length} files match` : `${files.length} file${files.length > 1 ? "s" : ""}`;
      list.innerHTML = rows.map(f => `<div class="pb-li">
          ${cfg.thumbs ? `<img class="pb-lthumb" loading="lazy" alt="" src="${PB.thumbUrl(pageId, f.path)}">` : ""}
          <div class="pb-lmain"><div class="pb-lname">${esc(f.path)}</div><div class="pb-lsub">${fmtSize(f.size)} · ${fmtDate(f.modified)}</div></div>
          <div class="pb-lbtn"><button type="button" class="pb-pri" data-print="${esc(f.path)}"${busy ? " disabled" : ""}>Print</button>
          <button type="button" data-del="${esc(f.path)}" title="Delete" aria-label="Delete ${esc(f.path)}">✕</button></div></div>`).join("");
      for (const img of list.querySelectorAll(".pb-lthumb")) img.onerror = () => img.classList.add("none");
      for (const b of list.querySelectorAll("[data-print]")) b.onclick = () => PB.printFile(b.dataset.print);
      for (const b of list.querySelectorAll("[data-del]")) b.onclick = async () => {
        const p = PB.current(); if (!p || !confirm(`Delete ${b.dataset.del} from ${p.name}?`)) return;
        try { await api(`/api/printers/${p.id}/files?path=${encodeURIComponent(b.dataset.del)}`, { method: "DELETE" }); load(); }
        catch (e) { toast(`${p.name}: ${e.message}`); }
      };
      more.hidden = total <= cap || showAll;
      more.textContent = `Show all ${total}`;
    }
    q("input[type=search]").oninput = draw;
    q("select").onchange = draw;
    q("[data-a=ref]").onclick = load;
    more.onclick = () => { showAll = true; draw(); };
    q("input[type=file]").onchange = e => {
      const file = e.target.files[0], id = pageId, start = q(".pb-chk input").checked; e.target.value = "";
      if (!file || id === null) return;
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/printers/${id}/files/upload?name=${encodeURIComponent(file.name)}&print=${start ? 1 : 0}`);
      xhr.upload.onprogress = ev => { if (ev.lengthComputable) msg.textContent = `Uploading ${file.name}… ${Math.round(ev.loaded / ev.total * 100)}%`; };
      xhr.onload = () => {
        let err = null; try { err = JSON.parse(xhr.responseText).error; } catch {}
        if (xhr.status >= 200 && xhr.status < 300) { toast(start ? `Uploaded and started ${file.name}` : `Uploaded ${file.name}`); if (id === pageId) load(); }
        else msg.textContent = `Upload failed: ${err || `HTTP ${xhr.status}`}`;
      };
      xhr.onerror = () => { msg.textContent = "Upload failed: network error"; };
      msg.textContent = `Uploading ${file.name}…`;
      xhr.send(file);
    };
    return {
      open() { files = []; loaded = false; showAll = false; list.innerHTML = ""; msg.textContent = ""; },
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
