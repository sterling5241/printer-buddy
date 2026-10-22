(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const KEYS = [["Ctrl + Shift + E", "Emergency stop (no confirm)"], ["Shift + P", "Pause / resume the print"], ["Shift + C", "Cancel the print"],
                ["Shift + H", "Home all axes (not while printing)"], ["?", "This list"]];
  const help = dialog("pb-keys");
  help.innerHTML = `<h3>Keyboard shortcuts</h3><table class="pb-ktable">${KEYS.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join("")}</table>
    <p class="pb-muted">Turn these on or off in Settings → Look.</p><div class="bd-libfoot"><button type="button">Close</button></div>`;
  help.querySelector("button").onclick = () => help.close();
  addEventListener("keydown", e => {
    if (!PB.store.get("pb-keys", false) || !onPage() || document.querySelector("dialog[open]") || e.repeat) return;
    const t = e.target; if (t.closest?.("input, textarea, select, [contenteditable=true]")) return;
    const p = cur(); if (!p) return;
    const k = e.key.toLowerCase(), printing = p.state === "printing" || p.state === "paused";
    let act = null;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === "e") act = () => api(`/api/printers/${p.id}/estop`, { method: "POST" }).then(() => toast("Emergency stop sent"), err => toast(err.message));
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (e.shiftKey && k === "p" && printing) act = () => doAction(p.id, p.state === "paused" ? "resume" : "pause");
    else if (e.shiftKey && k === "c" && printing) act = () => doAction(p.id, "cancel");
    else if (e.shiftKey && k === "h" && !printing && live(p)) act = () => { send("G28"); toast("Homing…"); };
    else if (e.key === "?") act = () => help.showModal();
    if (act) { e.preventDefault(); act(); }
  });
})();
