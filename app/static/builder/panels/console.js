// Console panel: Klipper's replies and your commands, with a G-code input under it.
PB.panel("console", {
  title: "Console", cls: "adv", flush: true,
  icon: PB.icon('<path d="M4 17l6-5-6-5M12 19h8"/>'),
  settings: [{ k: "height", label: "Height", type: "select", def: 180, options: [[120, "Small"], [180, "Medium"], [320, "Tall"]] }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-log" role="log" aria-label="Klipper console"></div>
      <form class="pb-cin"><input autocomplete="off" spellcheck="false" aria-label="G-code command" placeholder="Send G-code…"><button>Send</button></form>`;
    const logEl = host.querySelector(".pb-log"), input = host.querySelector("input");
    logEl.style.height = `${cfg.height}px`;
    function draw() {
      const log = (conLogs.get(pageId) || []).slice(-80);
      logEl.innerHTML = log.length ? "" : `<div class="pb-muted">Klipper's replies show up here.</div>`;
      for (const { kind, text } of log) { const d = PB.el("div", kind); d.textContent = text; logEl.append(d); }
      logEl.scrollTop = logEl.scrollHeight;
    }
    host.querySelector("form").onsubmit = e => { e.preventDefault(); const v = input.value; input.value = ""; if (v.trim()) conSend(v); };
    return {
      open: draw, shown: draw, log: draw,
      update(p) { const on = p.connection === "online"; input.disabled = !on; host.querySelector("form button").disabled = !on; },
    };
  },
});
