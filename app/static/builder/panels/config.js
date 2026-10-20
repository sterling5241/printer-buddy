// Config editor panel (Fluidd-style, our own code): file tree, Klipper syntax highlighting, line numbers, search + replace,
// section outline, a Klipper docs link for the section you're in. Save, or Save & restart. No editor library.
PB.panel("config", {
  title: "Config editor", desc: "Edit printer.cfg and other config files", cls: "adv",
  icon: PB.icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  settings: [
    { k: "height", label: "Editor height", type: "select", def: 520, options: [[360, "Small"], [520, "Medium"], [720, "Tall"]] },
    { k: "tree", label: "Show the file list", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-cfg">
        <aside class="pb-ctree"><div class="pb-sub-h">Files</div><div class="pb-cfiles"></div><div class="pb-sub-h">Outline</div><div class="pb-coutline"></div></aside>
        <div class="pb-cmain">
          <div class="pb-tool"><b class="pb-cpath pb-muted">Pick a file</b><span class="pb-cstate pb-muted"></span><span class="bd-sp"></span>
            <a class="pb-cdoc" target="_blank" rel="noopener" hidden></a>
            <button type="button" data-a="find" title="Search and replace (Ctrl+F)">🔍</button>
            <button type="button" data-a="save">Save</button><button type="button" class="pb-pri" data-a="restart">Save &amp; restart</button></div>
          <div class="pb-cfind" hidden><input data-f="q" placeholder="Find" aria-label="Find"><input data-f="r" placeholder="Replace with" aria-label="Replace with">
            <label class="pb-chk"><input type="checkbox" data-f="case"> Aa</label><span class="pb-fcount pb-muted"></span>
            <button type="button" data-f="prev" title="Previous (Shift+Enter)">↑</button><button type="button" data-f="next" title="Next (Enter)">↓</button>
            <button type="button" data-f="one">Replace</button><button type="button" data-f="all">All</button><button type="button" data-f="x" aria-label="Close search">✕</button></div>
          <div class="pb-ed"><div class="pb-gutter" aria-hidden="true"></div>
            <div class="pb-edarea"><pre class="pb-hl" aria-hidden="true"></pre>
              <textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="Config file contents"></textarea></div></div>
          <div class="pb-cfoot pb-muted"><span class="pb-cpos"></span></div>
        </div></div>`;
    const q = s => host.querySelector(s), ta = q("textarea"), hl = q(".pb-hl"), gut = q(".pb-gutter"), state = q(".pb-cstate");
    q(".pb-ed").style.height = `${cfg.height}px`;
    if (!cfg.tree) q(".pb-ctree").hidden = true;
    let path = "", saved = "", files = [], timer = null;
    const dirty = () => path && ta.value !== saved;
    const mark = () => { state.textContent = !path ? "" : dirty() ? "● unsaved" : "saved"; };

    // ---- highlighting (Klipper config: [sections], key: value, # comments, indented G-code / Jinja in macros) ----
    const h = (cls, t) => `<span class="${cls}">${esc(t)}</span>`;
    function gcodeLine(t) {   // indented macro lines
      return esc(t)
        .replace(/(\{%.*?%\}|\{\{.*?\}\})/g, '<span class="c-jin">$1</span>')
        .replace(/^(\s*)([A-Z][A-Z0-9_]*)\b/, '$1<span class="c-cmd">$2</span>')
        .replace(/(\s)([XYZEFST])(-?\d+(?:\.\d+)?)\b/g, '$1<span class="c-key">$2</span><span class="c-num">$3</span>');
    }
    function line(t) {
      if (/^#\*#/.test(t)) return h("c-auto", t);                             // SAVE_CONFIG block
      if (/^\s*[#;]/.test(t)) return h("c-com", t);
      let m = t.match(/^(\[)([^\]]+)(\])(.*)$/);
      if (m) return `<span class="c-sec">[${esc(m[2])}]</span>${h("c-com", m[4])}`;
      if (/^\s+\S/.test(t)) { const [code, com] = split(t); return gcodeLine(code) + (com ? h("c-com", com) : ""); }
      m = t.match(/^([A-Za-z0-9_.\-]+)(\s*[:=])(.*)$/);
      if (m) {
        const [val, com] = split(m[3]);
        const v = esc(val).replace(/(^|[\s,])(-?\d+(?:\.\d+)?)(?=$|[\s,])/g, '$1<span class="c-num">$2</span>')
          .replace(/\b(True|False|true|false)\b/g, '<span class="c-bool">$1</span>')
          .replace(/(\{%.*?%\}|\{\{.*?\}\})/g, '<span class="c-jin">$1</span>');
        return `<span class="c-key">${esc(m[1])}</span>${esc(m[2])}${v}${com ? h("c-com", com) : ""}`;
      }
      return esc(t);
    }
    const split = t => { const i = t.search(/\s[#;]/); return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i)]; };
    function paint() {
      const lines = ta.value.split("\n");
      hl.innerHTML = lines.map(line).join("\n") + "\n";
      gut.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join("");
      outline(lines); sync(); where();
    }
    const repaint = () => { clearTimeout(timer); timer = setTimeout(paint, ta.value.length > 60000 ? 250 : 30); };
    function sync() { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; }
    const lineH = () => parseFloat(getComputedStyle(ta).lineHeight) || 19;
    function goLine(n) {   // 0-based
      const lines = ta.value.split("\n"); let pos = 0; for (let i = 0; i < n; i++) pos += lines[i].length + 1;
      ta.focus(); ta.setSelectionRange(pos, pos); ta.scrollTop = Math.max(0, n * lineH() - ta.clientHeight / 3); sync(); where();
    }
    // ---- outline + docs link for the section the cursor is in ----
    let sections = [];
    function outline(lines) {
      sections = []; lines.forEach((t, i) => { const m = t.match(/^\[([^\]]+)\]/); if (m) sections.push([i, m[1]]); });
      q(".pb-coutline").innerHTML = sections.map(([i, n]) => `<button type="button" data-l="${i}">${esc(n)}</button>`).join("") || `<span class="pb-muted">No sections</span>`;
      for (const b of q(".pb-coutline").querySelectorAll("[data-l]")) b.onclick = () => goLine(+b.dataset.l);
    }
    const ANCHOR = n => { const w = n.split(/\s+/)[0].toLowerCase(); return /^stepper_/.test(w) ? "stepper" : /^extruder\d+$/.test(w) ? "extruder" : w; };
    function where() {
      const before = ta.value.slice(0, ta.selectionStart).split("\n"), ln = before.length - 1, col = before.at(-1).length + 1;
      q(".pb-cpos").textContent = path ? `Line ${ln + 1}, column ${col} · ${ta.value.split("\n").length} lines` : "";
      const sec = [...sections].reverse().find(([i]) => i <= ln), doc = q(".pb-cdoc");
      doc.hidden = !sec || !path.endsWith(".cfg");
      if (sec) { doc.href = `https://www.klipper3d.org/Config_Reference.html#${ANCHOR(sec[1])}`; doc.textContent = `Docs: [${sec[1].split(/\s+/)[0]}] ↗`; }
    }
    // ---- files ----
    async function listFiles() {
      try {
        files = ((await PB.rpc("server.files.list", { root: "config" })) || []).map(f => f.path || f.filename)
          .filter(n => /\.(cfg|conf|ini|txt|json|py|sh)$/i.test(n) && !/backup|printer-\d{8}/i.test(n)).sort();
      } catch (e) { state.textContent = e.message; }
      drawTree();
    }
    function drawTree() {
      const dirs = {}; for (const f of files) { const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ""; (dirs[d] ||= []).push(f); }
      q(".pb-cfiles").innerHTML = Object.keys(dirs).sort().map(d => `${d ? `<div class="pb-cdir">📁 ${esc(d)}</div>` : ""}${dirs[d].map(f =>
        `<button type="button" data-f="${esc(f)}" class="${f === path ? "on" : ""}${d ? " in" : ""}">${esc(f.split("/").pop())}</button>`).join("")}`).join("");
      for (const b of q(".pb-cfiles").querySelectorAll("[data-f]")) b.onclick = () => open(b.dataset.f);
    }
    async function open(p) {
      if (dirty() && !confirm(`Throw away your changes to ${path}?`)) return;
      path = p; ta.value = ""; saved = ""; q(".pb-cpath").textContent = p || "Pick a file"; paint(); mark(); drawTree();
      if (!p) return;
      state.textContent = "Loading…";
      try {
        const r = await fetch(PB.fileUrl("config", p)); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        ta.value = saved = await r.text(); ta.scrollTop = 0; paint(); mark();
      } catch (e) { state.textContent = e.message; }
    }
    async function save() {
      if (!path) return false;
      try {
        const r = await fetch(PB.fileUrl("config", path), { method: "PUT", body: ta.value });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        saved = ta.value; mark(); toast(`Saved ${path}`); return true;
      } catch (e) { toast(`Save failed: ${e.message}`); return false; }
    }
    // ---- search + replace ----
    const F = n => q(`[data-f=${n}]`);
    function hits() {
      const s = F("q").value; if (!s) return [];
      const hay = F("case").checked ? ta.value : ta.value.toLowerCase(), needle = F("case").checked ? s : s.toLowerCase();
      const out = []; let i = hay.indexOf(needle); while (i >= 0 && out.length < 5000) { out.push(i); i = hay.indexOf(needle, i + needle.length); }
      return out;
    }
    function findNext(dir) {
      const all = hits(); q(".pb-fcount").textContent = F("q").value ? `${all.length} found` : "";
      if (!all.length) return;
      const from = dir > 0 ? ta.selectionEnd : ta.selectionStart - 1;
      const i = dir > 0 ? (all.find(x => x >= from) ?? all[0]) : ([...all].reverse().find(x => x <= from) ?? all.at(-1));
      ta.focus(); ta.setSelectionRange(i, i + F("q").value.length);
      const ln = ta.value.slice(0, i).split("\n").length - 1; ta.scrollTop = Math.max(0, ln * lineH() - ta.clientHeight / 3); sync(); where();
    }
    function replaceOne() {
      const s = F("q").value, sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (s && (F("case").checked ? sel === s : sel.toLowerCase() === s.toLowerCase())) { ta.setRangeText(F("r").value, ta.selectionStart, ta.selectionEnd, "end"); paint(); mark(); }
      findNext(1);
    }
    function replaceAll() {
      const all = hits(); if (!all.length) return;
      const s = F("q").value, r = F("r").value; let out = "", last = 0;
      for (const i of all) { out += ta.value.slice(last, i) + r; last = i + s.length; }
      ta.value = out + ta.value.slice(last); paint(); mark(); toast(`Replaced ${all.length}`); q(".pb-fcount").textContent = "0 found";
    }
    const openFind = () => { q(".pb-cfind").hidden = false; const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (sel && !sel.includes("\n")) F("q").value = sel; F("q").focus(); F("q").select(); };
    F("q").oninput = () => { q(".pb-fcount").textContent = F("q").value ? `${hits().length} found` : ""; };
    F("q").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); } if (e.key === "Escape") q(".pb-cfind").hidden = true; };
    F("next").onclick = () => findNext(1); F("prev").onclick = () => findNext(-1);
    F("one").onclick = replaceOne; F("all").onclick = replaceAll; F("x").onclick = () => { q(".pb-cfind").hidden = true; ta.focus(); };
    // ---- editor events ----
    ta.oninput = () => { repaint(); mark(); };
    ta.onscroll = sync;
    ta.onclick = ta.onkeyup = where;
    ta.onkeydown = e => {
      if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); repaint(); mark(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(); }
    };
    q("[data-a=find]").onclick = openFind;
    q("[data-a=save]").onclick = save;
    q("[data-a=restart]").onclick = async () => {
      const mr = path.startsWith("moonraker");
      if (!confirm(mr ? "Save and restart Moonraker?" : "Save and restart Klipper? (Don't do this mid-print.)")) return;
      if (!(await save())) return;
      try { await PB.rpc(mr ? "machine.services.restart" : "printer.restart", mr ? { service: "moonraker" } : undefined); toast(mr ? "Restarting Moonraker…" : "Restarting Klipper…"); }
      catch (e) { toast(e.message); }
    };
    PB.openConfig = p => { PB.reveal(host); open(p); };
    paint();
    return {
      open() { path = ""; saved = ""; ta.value = ""; files = []; q(".pb-cpath").textContent = "Pick a file"; paint(); mark(); drawTree(); },
      shown() { if (!files.length) listFiles(); sync(); },
      update(p) { const busy = p.state === "printing" || p.state === "paused"; q("[data-a=restart]").disabled = busy || p.connection !== "online"; },
    };
  },
});
