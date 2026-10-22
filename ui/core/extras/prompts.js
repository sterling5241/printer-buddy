(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const prompts = new Map();
  const pd = dialog("pb-prompt");
  pd.addEventListener("cancel", e => { e.preventDefault(); closePrompt(); });
  const COLORS = ["primary", "secondary", "info", "warning", "error", "success"];
  const unq = s => s.trim().replace(/^"(.*)"$/s, "$1").replace(/^'(.*)'$/s, "$1");
  function button(msg) {
    const [label, cmd, color] = unq(msg).split("|").map(x => (x || "").trim());
    return { label, cmd: cmd || label, color: COLORS.includes((color || "").toLowerCase()) ? color.toLowerCase() : "" };
  }
  function onPrompt(id, line) {
    const m = /^(?:\/\/\s*)?action:prompt_(\w+)\s*(.*)$/.exec(line.trim()); if (!m) return false;
    const [, type, msg] = m; let s = prompts.get(id);
    if (type === "begin") { s = { title: unq(msg) || "Printer", items: [], footer: [], group: null, shown: false }; prompts.set(id, s); }
    else if (type === "end") { prompts.delete(id); if (id === pageId && pd.open) pd.close(); return true; }
    else if (!s) return true;
    else if (type === "text") s.items.push({ text: unq(msg) });
    else if (type === "button") (s.group || s.items).push(button(msg));
    else if (type === "button_group_start") { s.group = []; s.items.push({ group: s.group }); }
    else if (type === "button_group_end") s.group = null;
    else if (type === "footer_button") s.footer.push(button(msg));
    else if (type === "show") s.shown = true;
    if (id === pageId) drawPrompt();
    return true;
  }
  const btn = b => `<button type="button" class="pb-pbtn ${b.color ? "c-" + b.color : ""}" data-cmd="${esc(b.cmd)}">${esc(b.label)}</button>`;
  function drawPrompt() {
    const s = prompts.get(pageId);
    if (!s || !s.shown) { if (pd.open) pd.close(); return; }
    pd.innerHTML = `<div class="pb-ptop"><h3>${esc(s.title)}</h3><button type="button" class="pb-px" aria-label="Close">${PB.ic.x}</button></div>
      <div class="pb-pbody">${s.items.map(i => i.text != null ? `<p>${esc(i.text)}</p>` : i.group ? `<div class="pb-pgroup">${i.group.map(btn).join("")}</div>` : `<div class="pb-pgroup">${btn(i)}</div>`).join("")}</div>
      ${s.footer.length ? `<div class="bd-libfoot">${s.footer.map(btn).join("")}</div>` : ""}`;
    pd.querySelector(".pb-px").onclick = closePrompt;
    for (const b of pd.querySelectorAll("[data-cmd]")) b.onclick = () => send(b.dataset.cmd);
    if (!pd.open) pd.showModal();
  }
  function closePrompt() { prompts.delete(pageId); pd.close(); send('RESPOND TYPE=command MSG="action:prompt_end"'); }
  const baseCon = conAdd;
  conAdd = (id, kind, text) => { if (typeof text === "string" && text.includes("action:prompt_") && onPrompt(id, text)) return; baseCon(id, kind, text); };
  PB.onRoute(() => { if (pd.open) pd.close(); drawPrompt(); });
})();
