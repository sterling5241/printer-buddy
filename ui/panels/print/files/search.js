PB.parts = PB.parts || {};
PB.parts.filesSearch = c => {
    async function drawEverywhere(term, by) {
      const id = pageId, r0 = c.root;
      if (!c.everything || c.everything.root !== c.root) {
        c.msg.textContent = "Searching every folder…";
        try { c.everything = { root: c.root, files: (await PB.rpc("server.files.list", { root: c.root })) || [] }; } catch (e) { c.msg.textContent = e.message; return; }
        if (id !== pageId || r0 !== c.root) return;
      }
      const hits = c.everything.files.filter(f => (f.path || "").toLowerCase().includes(term)).map(f => ({ ...f, filename: f.path })).sort(by).slice(0, 100);
      c.crumbs(); c.msg.textContent = `${hits.length}${hits.length === 100 ? "+" : ""} found in every folder`;
      c.list.innerHTML = hits.map(f => { const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        return `<div class="pb-li"><div class="pb-lmain"><div class="pb-lname">${esc(f.path.split("/").pop())}</div><div class="pb-lsub">${esc(d || "(top)")} · ${fmtSize(f.size)} · ${fmtDate(f.modified)}</div></div>
          <div class="pb-lbtn">${c.root === "gcodes" ? `<button type="button" class="pb-pri" data-gp="${esc(f.path)}"${c.busy ? " disabled" : ""}>Print</button>` : ""}
            <button type="button" data-gd="${esc(d)}">Open folder</button></div></div>`; }).join("");
      for (const b of c.list.querySelectorAll("[data-gp]")) b.onclick = () => PB.printFile(b.dataset.gp);
      for (const b of c.list.querySelectorAll("[data-gd]")) b.onclick = () => { c.dir = b.dataset.gd; c.q("input[type=search]").value = ""; c.showAll = false; c.load(); };
      c.more.hidden = true;
    }
  return { drawEverywhere };
};
