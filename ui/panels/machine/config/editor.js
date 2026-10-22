PB.parts = PB.parts || {};
PB.parts.cfgEditor = (cfg, onClose) => {
    const fx = PB.el("div", "pb-cfx"); fx.hidden = true;
    fx.innerHTML = `<div class="pb-cfx-bar">
          <button type="button" data-a="close" title="Close (Esc)" aria-label="Close">${PB.ic.x}</button>
          <b class="pb-cpath"></b><span class="pb-cstate pb-muted"></span><span class="bd-sp"></span>
          <button type="button" data-a="outline" title="Section outline">${PB.ic.list}<span> Outline</span></button>
          <button type="button" data-a="find" title="Search and replace (Ctrl+F)">${PB.ic.search}<span> Find</span></button>
          <a class="pb-cdoc" target="_blank" rel="noopener" hidden></a>
          <button type="button" data-a="restart">${PB.ic.refresh}<span> Save &amp; restart</span></button>
          <button type="button" class="pb-pri" data-a="save" title="Save (Ctrl+S)">Save</button></div>
        <div class="pb-cfind" hidden><input data-f="q" placeholder="Find" aria-label="Find"><input data-f="r" placeholder="Replace with" aria-label="Replace with">
          <label class="pb-chk"><input type="checkbox" data-f="case"> Aa</label><span class="pb-fcount pb-muted"></span>
          <button type="button" data-f="prev" title="Previous (Shift+Enter)">↑</button><button type="button" data-f="next" title="Next (Enter)">↓</button>
          <button type="button" data-f="one">Replace</button><button type="button" data-f="all">All</button><button type="button" data-f="x" aria-label="Close search">${PB.ic.x}</button></div>
        <div class="pb-cfx-main">
          <div class="pb-ed"><div class="pb-gutter" aria-hidden="true"></div>
            <div class="pb-edarea"><pre class="pb-hl" aria-hidden="true"></pre>
              <textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="Config file contents"></textarea></div></div>
          <aside class="pb-coutline"></aside></div>
        <div class="pb-cfoot pb-muted"><span class="pb-cpos"></span></div>`;
    ($("#page") || document.body).appendChild(fx);
    const q = s => fx.querySelector(s), ta = q("textarea"), hl = q(".pb-hl"), gut = q(".pb-gutter"), state = q(".pb-cstate");
    let showOutline = cfg.outline;
    const setOutline = () => { q(".pb-coutline").hidden = !showOutline; q("[data-a=outline]").setAttribute("aria-pressed", showOutline); };
    setOutline();
    let path = "", saved = "", timer = null;
    const dirty = () => path && ta.value !== saved;
    const mark = () => { state.textContent = !path ? "" : dirty() ? "● unsaved" : ""; };

    const { line } = PB.parts.cfgHighlight;
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
      if (sec) { doc.href = `https://www.klipper3d.org/Config_Reference.html#${ANCHOR(sec[1])}`; doc.innerHTML = `Docs: [${esc(sec[1].split(/\s+/)[0])}] ${PB.ic.external}`; }
    }
    function show(on) {
      fx.hidden = !on; document.documentElement.classList.toggle("pb-noscroll", on);
      if (on) { addEventListener("keydown", onKey); setTimeout(() => ta.focus(), 0); } else removeEventListener("keydown", onKey);
    }
    function close() {
      if (dirty() && !confirm(`Throw away your changes to ${path}?`)) return;
      saved = ta.value; show(false); onClose();
    }
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (!q(".pb-cfind").hidden) { q(".pb-cfind").hidden = true; ta.focus(); } else close();
    }
    async function open(p) {
      if (!fx.hidden && dirty() && !confirm(`Throw away your changes to ${path}?`)) return;
      path = p; ta.value = ""; saved = ""; q(".pb-cpath").textContent = p; q(".pb-cfind").hidden = true; show(true); paint(); mark();
      state.textContent = "Loading…";
      try {
        const r = await fetch(PB.fileUrl("config", p)); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        ta.value = saved = await r.text(); ta.scrollTop = 0; paint(); mark(); ta.setSelectionRange(0, 0);
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
    ta.oninput = () => { repaint(); mark(); };
    ta.onscroll = sync;
    ta.onclick = ta.onkeyup = where;
    ta.onkeydown = e => {
      if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); repaint(); mark(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); openFind(); }
    };
    q("[data-a=find]").onclick = openFind;
    q("[data-a=close]").onclick = close;
    q("[data-a=outline]").onclick = () => { showOutline = !showOutline; setOutline(); };
    q("[data-a=save]").onclick = save;
    q("[data-a=restart]").onclick = async () => {
      const mr = path.startsWith("moonraker");
      if (!confirm(mr ? "Save and restart Moonraker?" : "Save and restart Klipper? (Don't do this mid-print.)")) return;
      if (!(await save())) return;
      try { await PB.rpc(mr ? "machine.services.restart" : "printer.restart", mr ? { service: "moonraker" } : undefined); toast(mr ? "Restarting Moonraker…" : "Restarting Klipper…"); }
      catch (e) { toast(e.message); }
    };
  return {
    open,
    reset() { if (!fx.hidden) { saved = ta.value; show(false); } path = ""; },
    setBusy(b) { q("[data-a=restart]").disabled = b; },
    destroy() { show(false); fx.remove(); },
  };
};
