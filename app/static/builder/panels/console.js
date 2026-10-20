// Console panel: Klipper's replies and your commands, with a G-code input under it.
// Extras (Fluidd-style ideas, our code): filters (hide temperature reports + your own text / /regex/ filters, saved on the
// box per printer), clear, auto-scroll toggle, up/down command history, click a sent command to reuse it, autocomplete.
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
        <span class="bd-sp"></span><button type="button" data-a="clear" title="Clear the console">Clear</button></div>
      <div class="pb-log" role="log" aria-label="Klipper console"></div>
      <form class="pb-cin"><input autocomplete="off" spellcheck="false" aria-label="G-code command" placeholder="Send G-code… (↑ ↓ history)"><button>Send</button></form>`;
    const dl = PB.el("datalist"); dl.id = "pb-cmds-" + Math.random().toString(36).slice(2, 7); host.append(dl);
    const q = s => host.querySelector(s), logEl = q(".pb-log"), input = q("input");
    input.setAttribute("list", dl.id);
    logEl.style.height = `${cfg.height}px`;
    let filters = [], auto = true, hist = -1;
    async function commands(id) {   // autocomplete: every G-code command Klipper knows (incl. macros), with its help text
      try {
        const help = await PB.rpc("printer.gcode.help");
        if (id === pageId) dl.innerHTML = Object.entries(help || {}).sort().map(([c, d]) => `<option value="${esc(c)}">${esc(d || "")}</option>`).join("");
      } catch {}
    }
    const TEMP = /^(ok\s+)?(T\d*|B|C):\s*-?\d/;
    const tests = () => filters.map(f => { const m = /^\/(.+)\/([a-z]*)$/.exec(f); try { return m ? new RegExp(m[1], m[2]) : null; } catch { return null; } }
      ).map((re, i) => re ? (t => re.test(t)) : (t => t.toLowerCase().includes(filters[i].toLowerCase())));
    function draw() {
      const fs = tests(), hidden = t => (cfg.temps && TEMP.test(t)) || fs.some(f => f(t));
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
    // stop following when you scroll up to read; follow again at the bottom
    logEl.onscroll = () => { const bottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4; if (auto !== bottom) { auto = bottom; q("[data-a=scroll]").setAttribute("aria-pressed", auto); } };
    q("[data-a=scroll]").onclick = () => { auto = !auto; q("[data-a=scroll]").setAttribute("aria-pressed", auto); if (auto) logEl.scrollTop = logEl.scrollHeight; };
    q("[data-a=clear]").onclick = () => { conLogs.set(pageId, []); draw(); };
    const fd = PB.el("dialog", "bd-lib pb-xd"); document.body.append(fd);
    q("[data-a=filters]").onclick = () => {
      fd.innerHTML = `<h3>Console filters</h3><p class="pb-muted">One per line. Lines that contain the text are hidden. Use /pattern/ for a regular expression.
        Your commands and errors always show.</p><textarea class="pb-code" rows="8" spellcheck="false" placeholder="echo: Recv:&#10;/^\\/\\/ probe/">${esc(filters.join("\n"))}</textarea>
        <div class="bd-libfoot"><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="ok">Save</button></div>`;
      fd.querySelector("[data-a=no]").onclick = () => fd.close();
      fd.querySelector("[data-a=ok]").onclick = async () => {
        filters = fd.querySelector("textarea").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 50);
        fd.close(); draw();
        try { await PB.kv.set("console_filters", filters); } catch (e) { toast(`Couldn't save the filters: ${e.message}`); }
      };
      fd.showModal();
    };
    input.onkeydown = e => {   // the same command history as the rest of the app
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
      destroy() { fd.remove(); },
    };
  },
});
