(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const drop = el("div", "pb-drop", `<div>Drop G-code to upload</div>`); drop.hidden = true; document.body.append(drop);
  const own = e => e.target.closest?.("[data-drop]");
  const isFiles = e => [...(e.dataTransfer?.types || [])].includes("Files") && !own(e);
  let dragN = 0;
  addEventListener("dragenter", e => {
    if (own(e)) { dragN = 0; drop.hidden = true; return; }
    if (!isFiles(e) || !onPage()) return; e.preventDefault(); dragN++;
    const p = cur(); drop.firstChild.textContent = `Drop G-code to upload to ${p ? p.name : "this printer"}`; drop.hidden = false;
  });
  addEventListener("dragover", e => { if (isFiles(e) && onPage()) e.preventDefault(); });
  addEventListener("dragleave", e => { if (isFiles(e) && --dragN <= 0) { dragN = 0; drop.hidden = true; } });
  addEventListener("drop", e => {
    if (!isFiles(e) || !onPage()) return;
    e.preventDefault(); dragN = 0; drop.hidden = true;
    const all = [...e.dataTransfer.files], ok = all.filter(f => /\.(gcode|gco|g|bgcode|ufp)$/i.test(f.name));
    if (all.length > ok.length) toast(`Skipped ${all.length - ok.length} file(s) that aren't G-code`);
    if (!ok.length) return;
    if (PB.uploadFiles) return PB.uploadFiles(ok);
    (async () => {
      const id = pageId;
      for (const f of ok) {
        try { await fetch(`/api/printers/${id}/files/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f })
          .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); }); toast(`Uploaded ${f.name}`); }
        catch (err) { toast(`${f.name}: upload failed: ${err.message}`); }
      }
    })();
  });
})();
