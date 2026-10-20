// Config files panel + full-screen editor (Fluidd-style layout, our own code). The panel lists the config files; clicking
// one opens a full-screen editor: top bar (close, file name, unsaved dot | outline, find, docs, Save & restart, Save),
// Klipper syntax highlighting, line numbers, search + replace, section outline. No editor library.
PB.panel("config", {
  title: "Config files", desc: "printer.cfg and other config files; opens a full-screen editor", cls: "adv",
  icon: PB.icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  settings: [
    { k: "outline", label: "Show the section outline in the editor", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><span class="pb-ccount pb-muted"></span><span class="bd-sp"></span>
        <button type="button" data-a="refresh" data-head title="Refresh" aria-label="Refresh">${PB.ic.refresh}</button></div><div class="pb-cfiles"></div>`;
    const ed = PB.parts.cfgEditor(cfg, () => listFiles());   // editor.js (+ highlight.js)
    const el2 = s => host.querySelector(s);
    let files = [];
    // ---- files (panel) ----
    let meta = {};
    const when = t => t ? new Date(t * 1000).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "";
    const kb = n => n == null ? "" : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    async function listFiles() {
      el2(".pb-ccount").textContent = "Loading…";
      try {
        const all = (await PB.rpc("server.files.list", { root: "config" })) || [];
        meta = {}; for (const f of all) meta[f.path || f.filename] = f;
        files = Object.keys(meta).filter(n => /\.(cfg|conf|ini|txt|json|py|sh)$/i.test(n) && !/backup|printer-\d{8}/i.test(n)).sort();
        el2(".pb-ccount").textContent = `${files.length} file${files.length === 1 ? "" : "s"}`;
      } catch (e) { el2(".pb-ccount").textContent = e.message; }
      drawList();
    }
    function drawList() {
      const dirs = {}; for (const f of files) { const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ""; (dirs[d] ||= []).push(f); }
      el2(".pb-cfiles").innerHTML = Object.keys(dirs).sort().map(d => `${d ? `<div class="pb-cdir">${PB.ic.folder}${esc(d)}</div>` : ""}${dirs[d].map(f =>
        `<button type="button" data-f="${esc(f)}" class="pb-crow${d ? " in" : ""}"><span>${esc(f.split("/").pop())}</span>
          <small class="pb-muted">${esc(when(meta[f]?.modified))}</small><small class="pb-muted">${esc(kb(meta[f]?.size))}</small></button>`).join("")}`).join("")
        || `<p class="pb-muted">No config files found.</p>`;
      for (const b of el2(".pb-cfiles").querySelectorAll("[data-f]")) b.onclick = () => ed.open(b.dataset.f);
    }
    el2("[data-a=refresh]").onclick = listFiles;
    PB.openConfig = p => ed.open(p);
    return {
      open() { ed.reset(); files = []; meta = {}; drawList(); el2(".pb-ccount").textContent = ""; },
      shown() { if (!files.length) listFiles(); },
      update(p) { const busy = p.state === "printing" || p.state === "paused"; ed.setBusy(busy || p.connection !== "online"); },
      destroy() { ed.destroy(); if (PB.openConfig) delete PB.openConfig; },
    };
  },
});
