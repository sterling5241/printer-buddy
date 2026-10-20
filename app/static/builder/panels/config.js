// Config editor panel: edit printer.cfg, moonraker.conf and the rest; Save, or Save & restart.
PB.panel("config", {
  title: "Config editor", cls: "adv",
  icon: PB.icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  settings: [{ k: "height", label: "Editor height", type: "select", def: 420, options: [[280, "Small"], [420, "Medium"], [640, "Tall"]] }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><select data-a="file" aria-label="Config file"><option value="">Pick a file…</option></select>
        <span class="pb-cstate pb-muted"></span><span class="bd-sp"></span>
        <button type="button" data-a="save">Save</button><button type="button" class="pb-pri" data-a="restart">Save &amp; restart</button></div>
      <textarea class="pb-code" spellcheck="false" autocomplete="off" aria-label="Config file contents" placeholder="Pick a file to edit"></textarea>`;
    const q = s => host.querySelector(s), ta = q("textarea"), sel = q("[data-a=file]"), state = q(".pb-cstate");
    ta.style.height = `${cfg.height}px`;
    let path = "", saved = "";
    const dirty = () => path && ta.value !== saved;
    const mark = () => { state.textContent = !path ? "" : dirty() ? "● unsaved changes" : "saved"; };
    async function list() {
      try {
        const files = (await PB.rpc("server.files.list", { root: "config" })) || [];
        const names = files.map(f => f.path || f.filename).filter(n => /\.(cfg|conf|ini|txt|json)$/i.test(n) && !n.includes("backup")).sort();
        sel.innerHTML = `<option value="">Pick a file…</option>` + names.map(n => `<option${n === path ? " selected" : ""}>${esc(n)}</option>`).join("");
      } catch (e) { state.textContent = e.message; }
    }
    async function open(p) {
      if (dirty() && !confirm(`Throw away your changes to ${path}?`)) { sel.value = path; return; }
      path = p; ta.value = ""; saved = ""; mark();
      if (!p) return;
      state.textContent = "Loading…";
      try {
        const r = await fetch(PB.fileUrl("config", p)); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        ta.value = saved = await r.text(); mark();
      } catch (e) { state.textContent = e.message; }
      if (sel.value !== p) { if (![...sel.options].some(o => o.value === p)) sel.add(new Option(p, p)); sel.value = p; }
    }
    async function save() {
      if (!path) return false;
      try {
        const r = await fetch(PB.fileUrl("config", path), { method: "PUT", body: ta.value });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        saved = ta.value; mark(); toast(`Saved ${path}`); return true;
      } catch (e) { toast(`Save failed: ${e.message}`); return false; }
    }
    sel.onchange = () => open(sel.value);
    ta.oninput = mark;
    ta.onkeydown = e => {
      if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("  ", s, ta.selectionEnd, "end"); mark(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
    };
    q("[data-a=save]").onclick = save;
    q("[data-a=restart]").onclick = async () => {
      const mr = path.startsWith("moonraker");
      if (!confirm(mr ? "Save and restart Moonraker?" : "Save and restart Klipper? (Don't do this mid-print.)")) return;
      if (!(await save())) return;
      try { await PB.rpc(mr ? "machine.services.restart" : "printer.restart", mr ? { service: "moonraker" } : undefined); toast(mr ? "Restarting Moonraker…" : "Restarting Klipper…"); }
      catch (e) { toast(e.message); }
    };
    PB.openConfig = p => { PB.reveal(host); open(p); };
    return {
      open() { path = ""; saved = ""; ta.value = ""; mark(); list(); },
      shown() { if (sel.options.length < 2) list(); },
      update(p) { const busy = p.state === "printing" || p.state === "paused"; q("[data-a=restart]").disabled = busy || p.connection !== "online"; },
    };
  },
});
