(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const opt = (k, d) => PB.store.get(k, d);
  doAction = async (id, action) => {
    const p = printers.get(id); if (!p) return;
    if (action === "cancel" && opt("pb-confirm-cancel", true) && !confirm(`Cancel the print on ${p.name}?`)) return;
    if (action === "estop" && opt("pb-confirm-estop", true) && !confirm(`Emergency stop ${p.name}? This halts the printer immediately and Klipper will need a restart.`)) return;
    try { await api(`/api/printers/${p.id}/${action}`, { method: "POST" }); } catch (e) { toast(`${p.name}: ${e.message}`); }
  };
  const baseTitle = document.title;
  function tabTitle() {
    if (!opt("pb-title", true)) { document.title = baseTitle; return; }
    const p = onPage() ? cur() : null, active = q => q && (q.state === "printing" || q.state === "paused");
    if (p) { document.title = active(p) ? `${Math.round((p.progress || 0) * 100)}% ${p.state === "paused" ? "⏸ " : ""}· ${p.name}` : `${p.name} · Printer Buddy`; return; }
    const busy = [...printers.values()].filter(active);
    document.title = busy.length === 1 ? `${Math.round((busy[0].progress || 0) * 100)}% · ${busy[0].name}` : busy.length ? `${busy.length} printing · Printer Buddy` : baseTitle;
  }
  const baseHome = render;
  render = () => { baseHome(); tabTitle(); };
  PB.onRoute(tabTitle);
  // slider lock (touch screens): the first tap on a slider only unlocks it for 5 s, so scrolling past can't change it
  let unlocked = null, unlockTimer = null;
  document.addEventListener("touchstart", e => {
    const r = e.target.closest?.("input[type=range]");
    if (!r || !opt("pb-lock", false) || r === unlocked) return;
    e.preventDefault(); e.stopPropagation();
    unlocked?.classList.remove("pb-unlocked"); unlocked = r; r.classList.add("pb-unlocked"); toast("Slider unlocked for 5 seconds");
    clearTimeout(unlockTimer); unlockTimer = setTimeout(() => { r.classList.remove("pb-unlocked"); unlocked = null; }, 5000);
  }, { capture: true, passive: false });
  pageHook(tabTitle);
})();
