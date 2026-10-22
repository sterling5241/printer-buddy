PB.panel("console", {
  title: "Console", desc: "Klipper replies and a G-code input", cls: "adv", flush: true, gear: true,
  icon: PB.icon('<path d="M4 17l6-5-6-5M12 19h8"/>'),
  settings: [
    { k: "height", label: "Height", type: "select", def: 180, options: [[120, "Small"], [180, "Medium"], [320, "Tall"], [480, "Very tall"]] },
    { k: "temps", label: "Hide temperature reports (ok T:… B:…)", type: "check", def: true },
    { k: "lines", label: "Lines kept on screen", type: "select", def: 200, options: [[80, "80"], [200, "200"], [500, "500"]] },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-ctool"><button type="button" data-a="filters" title="Hide lines that match your filters">Filters<span class="pb-fn"></span></button>
        <button type="button" data-a="scroll" title="Keep scrolling to the newest line" aria-pressed="true">Auto-scroll</button>
        <span class="bd-sp"></span><button type="button" data-a="help" data-head title="Commands: every command Klipper knows" aria-label="Commands">${PB.ic.list}</button><button type="button" data-a="clear" data-head title="Clear the console" aria-label="Clear">${PB.ic.trash}</button></div>
      <div class="pb-log" role="log" aria-label="Klipper console"></div>
      <form class="pb-cin"><input autocomplete="off" spellcheck="false" aria-label="G-code command" placeholder="Send G-code… (↑ ↓ history)"><button>Send</button></form>`;
    const dl = PB.el("datalist"); dl.id = "pb-cmds-" + Math.random().toString(36).slice(2, 7); host.append(dl);
    const q = s => host.querySelector(s), logEl = q(".pb-log"), input = q("input");
    input.setAttribute("list", dl.id);
    logEl.style.height = `${cfg.height}px`;
    let filters = [], auto = true, hist = -1, help = {};
    async function commands(id) {
      try {
        const h = await PB.rpc("printer.gcode.help");
        if (id === pageId) help = h || {};
        if (id === pageId) dl.innerHTML = Object.entries(h || {}).sort().map(([c, d]) => `<option value="${esc(c)}">${esc(d || "")}</option>`).join("");
      } catch {}
    }
    function draw() {
      const hidden = flt.hidden();
      const log = (conLogs.get(pageId) || []).filter(l => l.kind === "sent" || l.kind === "err" || !hidden(l.text)).slice(-cfg.lines);
      logEl.innerHTML = log.length ? "" : `<div class="pb-muted">Klipper's replies show up here.</div>`;
      for (const { kind, text } of log) {
        const d = PB.el("div", kind); d.textContent = text;
        if (kind === "sent") { d.title = "Click to put this command back in the box"; d.onclick = () => { input.value = text.replace(/^>\s*/, ""); input.focus(); }; }
        logEl.append(d);
      }
      if (auto) logEl.scrollTop = logEl.scrollHeight;
      q(".pb-fn").textContent = filters.length ? ` (${filters.length})` : "";
    }
    logEl.onscroll = () => { const bottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4; if (auto !== bottom) { auto = bottom; q("[data-a=scroll]").setAttribute("aria-pressed", auto); } };
    q("[data-a=scroll]").onclick = () => { auto = !auto; q("[data-a=scroll]").setAttribute("aria-pressed", auto); if (auto) logEl.scrollTop = logEl.scrollHeight; };
    q("[data-a=clear]").onclick = () => { conLogs.set(pageId, []); draw(); };
    const flt = PB.parts.consoleFilters(q, cfg, { get: () => filters, set: f => { filters = f; draw(); return f; } });
    const hlp = PB.parts.consoleHelp(q, input, () => help);
    input.onkeydown = e => {
      if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || !conHistory.length) return;
      e.preventDefault();
      if (e.key === "ArrowUp") hist = hist === -1 ? conHistory.length - 1 : Math.max(0, hist - 1);
      else hist = hist === -1 ? -1 : hist + 1 >= conHistory.length ? -1 : hist + 1;
      input.value = hist === -1 ? "" : conHistory[hist];
    };
    q("form").onsubmit = e => { e.preventDefault(); const v = input.value; input.value = ""; hist = -1; if (v.trim()) { auto = true; conSend(v); } };
    return {
      async open(id) {
        filters = []; draw(); commands(id);
        try { const f = await PB.kv.get("console_filters", id); if (id === pageId) { filters = Array.isArray(f) ? f : []; draw(); } } catch {}
      },
      shown: draw, log: draw,
      update(p) { const on = p.connection === "online"; input.disabled = !on; q("form button").disabled = !on; },
      destroy() { flt.destroy(); hlp.destroy(); },
    };
  },
});
