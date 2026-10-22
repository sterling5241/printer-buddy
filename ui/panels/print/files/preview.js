PB.parts = PB.parts || {};
PB.parts.filesPreview = c => {
    const PREVIEW = /\.(png|jpe?g|gif|webp|bmp|txt|log|cfg|conf|ini|json|md|csv|sh|py)$/i;
    const pv = PB.el("dialog", "bd-lib pb-xd pb-pvdlg"); document.body.append(pv);
    async function look(path) {
      const url = PB.fileUrl(c.root, path), img = /\.(png|jpe?g|gif|webp|bmp)$/i.test(path);
      pv.innerHTML = `<div class="pb-ptop"><h3>${esc(path.split("/").pop())}</h3><button type="button" class="pb-px" aria-label="Close">${PB.ic.x}</button></div>
        <div class="pb-pvbody">${img ? `<img src="${url}" alt="">` : `<pre class="pb-muted">Loading…</pre>`}</div>
        <div class="bd-libfoot"><a class="pb-dl" href="${PB.fileUrl(c.root, path, true)}">${PB.ic.download}Download</a></div>`;
      pv.querySelector(".pb-px").onclick = () => pv.close();
      pv.showModal();
      if (img) return;
      try {
        const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`);
        let t = await r.text(); const lines = t.split("\n");
        if (lines.length > 3000) t = `… (showing the last 3000 of ${lines.length} lines)\n` + lines.slice(-3000).join("\n");
        const pre = pv.querySelector("pre"); pre.className = ""; pre.textContent = t; if (c.root === "logs") pre.scrollTop = pre.scrollHeight;
      } catch (e) { pv.querySelector("pre").textContent = `Couldn't load it: ${e.message}`; }
    }
  return { look, PREVIEW, destroy() { pv.remove(); } };
};
