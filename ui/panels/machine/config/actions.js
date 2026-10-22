PB.parts = PB.parts || {};
PB.parts.cfgActions = c => {
    const ACCEPT = [".conf", ".cfg", ".md", ".css", ".jpg", ".jpeg", ".png", ".gif"];
    const IMG = /\.(png|jpe?g|gif|webp|bmp)$/i, MOVE = "text/x-pb-cfg";
    const pv = PB.parts.filesPreview(c);
    const isDir = n => c.dirs.some(d => d.dirname === n);
    const call = async (method, params) => { try { await PB.rpc(method, params); return true; } catch (e) { const p = params.source || params.path; toast(p ? `${p}: ${e.message}` : e.message); return false; } };
    function openFile(n) {
      if (c.root === "config" && !IMG.test(n)) c.ed.open(c.full(n)); else pv.look(c.full(n));
    }
    async function rename(n) {
      const name = prompt("New name:", n); if (!name || name === n || name.includes("/")) return;
      if (await call("server.files.move", { source: c.path(n), dest: c.path(name) })) c.load();
    }
    async function duplicate(n) {
      const dot = n.lastIndexOf("."), def = dot > 0 ? `${n.slice(0, dot)}_copy${n.slice(dot)}` : `${n}_copy`;
      const name = prompt("Name of the copy:", def); if (!name || name === n || name.includes("/")) return;
      if (await call("server.files.copy", { source: c.path(n), dest: c.path(name) })) { toast(`Copied to ${name}`); c.load(); }
    }
    function download(n) { const a = PB.el("a"); a.href = PB.fileUrl(c.root, c.full(n), true); a.download = n; document.body.append(a); a.click(); a.remove(); }
    async function zip(names) {
      const t = new Date(), p = v => String(v).padStart(2, "0");
      const name = `collection-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.zip`;
      c.q(".pb-ccount").textContent = "Zipping…";
      if (await call("server.files.zip", { dest: c.path(name), items: names.map(c.path) })) { toast(`Made ${name}`); c.picked.clear(); }
      c.load();
    }
    async function remove(names) {
      if (!confirm(names.length > 1 ? `Delete ${names.length} items? This can't be undone.` : `Delete ${names[0]}${isDir(names[0]) ? " and everything in it" : ""}?`)) return;
      let ok = 0;
      for (const n of names) if (await call(isDir(n) ? "server.files.delete_directory" : "server.files.delete_file", isDir(n) ? { path: c.path(n), force: true } : { path: c.path(n) })) ok++;
      if (names.length > 1) toast(`Deleted ${ok} of ${names.length}`);
      c.picked.clear(); c.load();
    }
    async function move(names, to) {   // to: folder inside the root, "" = top
      let ok = 0;
      for (const n of names) {
        const dest = `${c.root}/${to ? to + "/" : ""}${n}`;
        if (dest === c.path(n) || (to + "/").startsWith(c.full(n) + "/")) continue;   // same place, or a folder into itself
        if (await call("server.files.move", { source: c.path(n), dest })) ok++;
      }
      if (ok) toast(`Moved ${ok} to ${to || "the top folder"}`);
      c.picked.clear(); c.load();
    }
    function rowMenu(e, n) {
      e.preventDefault();
      const ro = c.ro(), d = isDir(n), many = c.picked.has(n) && c.picked.size > 1, names = many ? [...c.picked] : [n];
      c.menu(e, many ? [
        { label: `Zip ${names.length} items`, run: () => zip(names) },
        { icon: PB.ic.trash, label: `Delete ${names.length} items`, danger: true, run: () => remove(names) },
      ] : [
        !d && c.root === "config" && !IMG.test(n) && { icon: PB.ic.pencil, label: "Edit", run: () => c.ed.open(c.full(n)) },
        !d && (ro || IMG.test(n)) && { icon: PB.ic.eye, label: "View", run: () => pv.look(c.full(n)) },
        !ro && { label: "Rename", run: () => rename(n) },
        !ro && !d && { icon: PB.ic.copy, label: "Duplicate", run: () => duplicate(n) },
        !d && { icon: PB.ic.download, label: "Download", run: () => download(n) },
        !ro && { label: "Create zip", run: () => zip(names) },
        !ro && { icon: PB.ic.trash, label: "Delete", danger: true, run: () => remove(names) },
      ]);
    }
    function bulk() {
      c.q(".pb-bulk").hidden = !c.picked.size;
      c.q(".pb-bn").textContent = `${c.picked.size} picked`;
    }
    c.q("[data-b=zip]").onclick = () => zip([...c.picked]);
    c.q("[data-b=del]").onclick = () => remove([...c.picked]);
    async function newFile() {
      const name = prompt("New file name:", "new.cfg"); if (!name || name.includes("/")) return;
      if (c.files.some(f => f.filename === name)) return toast(`${name} already exists`);
      try {
        const r = await fetch(PB.fileUrl("config", c.full(name)), { method: "PUT", body: "" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      } catch (e) { return toast(e.message); }
      c.load(); c.ed.open(c.full(name));
    }
    async function newDir() {
      const name = prompt("New folder name:"); if (!name || name.includes("/")) return;
      if (await call("server.files.post_directory", { path: c.path(name) })) c.load();
    }
    c.q("[data-a=add]").onclick = e => c.menu(e.currentTarget, [
      { icon: PB.ic.file, label: "New file", run: newFile },
      { icon: PB.ic.folder, label: "New folder", run: newDir },
      { label: "Upload files", run: () => c.q("[data-u=files]").click() },
      { label: "Upload folder", run: () => c.q("[data-u=dir]").click() },
    ]);
    async function upload(items) {
      const id = pageId, ok = items.filter(([f]) => ACCEPT.some(x => f.name.toLowerCase().endsWith(x)));
      if (items.length > ok.length) toast(`Skipped ${items.length - ok.length} file(s) that aren't ${ACCEPT.join(" ")}`);
      let done = 0;
      for (const [n, [file, dir]] of ok.entries()) {
        if (id !== pageId) return;
        await new Promise(next => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/printers/${id}/files/upload?root=config&name=${encodeURIComponent(file.name)}&dir=${encodeURIComponent(dir)}`);
          xhr.upload.onprogress = ev => { if (ev.lengthComputable) c.q(".pb-ccount").textContent = `Uploading ${n + 1}/${ok.length}: ${file.name}… ${Math.round(ev.loaded / ev.total * 100)}%`; };
          xhr.onload = () => {
            let err = null; try { err = JSON.parse(xhr.responseText).error; } catch {}
            if (xhr.status >= 200 && xhr.status < 300) done++; else toast(`${file.name}: upload failed: ${err || `HTTP ${xhr.status}`}`);
            next();
          };
          xhr.onerror = () => { toast(`${file.name}: upload failed (network)`); next(); };
          xhr.send(file);
        });
      }
      if (done) toast(`Uploaded ${done} file(s)`);
      if (id === pageId) c.load();
    }
    const fin = c.q("[data-u=files]"), din = c.q("[data-u=dir]");
    fin.accept = ACCEPT.join(",");
    fin.onchange = () => { const fs = [...fin.files]; fin.value = ""; upload(fs.map(f => [f, c.dir])); };
    din.onchange = () => {
      const fs = [...din.files]; din.value = "";
      upload(fs.map(f => [f, [c.dir, f.webkitRelativePath.split("/").slice(0, -1).join("/")].filter(Boolean).join("/")]));
    };
    const has = (e, t) => [...(e.dataTransfer?.types || [])].includes(t);
    const wrap = c.q("[data-drop]");
    function wire(list) {
      for (const row of list.querySelectorAll(".pb-crow")) {
        if (row.dataset.n != null) row.oncontextmenu = e => rowMenu(e, row.dataset.n);
        if (row.draggable) row.ondragstart = e => {
          const n = row.dataset.n; e.dataTransfer.setData(MOVE, JSON.stringify(c.picked.has(n) ? [...c.picked] : [n])); e.dataTransfer.effectAllowed = "move";
        };
        if (row.dataset.to == null || c.ro()) continue;
        row.ondragover = e => { if (has(e, MOVE) || has(e, "Files")) { e.preventDefault(); row.classList.add("over"); } };
        row.ondragleave = () => row.classList.remove("over");
        row.ondrop = e => {
          if (!has(e, MOVE) && !has(e, "Files")) return;
          e.preventDefault(); e.stopPropagation(); row.classList.remove("over"); wrap.classList.remove("over");
          if (has(e, MOVE)) move(JSON.parse(e.dataTransfer.getData(MOVE)), row.dataset.to);
          else upload([...e.dataTransfer.files].map(f => [f, row.dataset.to]));
        };
      }
    }
    wrap.ondragover = e => {
      if (!has(e, "Files")) return;
      e.preventDefault(); if (c.ro()) e.dataTransfer.dropEffect = "none"; else wrap.classList.add("over");
    };
    wrap.ondragleave = e => { if (!wrap.contains(e.relatedTarget)) wrap.classList.remove("over"); };
    wrap.ondrop = e => {
      if (!has(e, "Files")) return;
      e.preventDefault(); e.stopPropagation(); wrap.classList.remove("over");
      if (!c.ro()) upload([...e.dataTransfer.files].map(f => [f, c.dir]));
    };
  Object.assign(c, { openFile, wire, bulk });
  return { destroy() { pv.destroy(); } };
};
