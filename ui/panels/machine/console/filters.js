PB.parts = PB.parts || {};
PB.parts.consoleFilters = (q, cfg, S) => {   // S: { get() -> filters, set(list) -> list (and redraw) }
    let filters;
    const TEMP = /^(ok\s+)?(T\d*|B|C):\s*-?\d/;
    const tests = () => S.get().map(f => { const m = /^\/(.+)\/([a-z]*)$/.exec(f); try { return m ? new RegExp(m[1], m[2]) : null; } catch { return null; } }
      ).map((re, i) => re ? (t => re.test(t)) : (t => t.toLowerCase().includes(S.get()[i].toLowerCase())));
    const fd = PB.el("dialog", "bd-lib pb-xd"); document.body.append(fd);
    q("[data-a=filters]").onclick = () => {
      fd.innerHTML = `<h3>Console filters</h3><p class="pb-muted">One per line. Lines that contain the text are hidden. Use /pattern/ for a regular expression.
        Your commands and errors always show.</p><textarea class="pb-code" rows="8" spellcheck="false" placeholder="echo: Recv:&#10;/^\\/\\/ probe/">${esc(S.get().join("\n"))}</textarea>
        <div class="bd-libfoot"><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="ok">Save</button></div>`;
      fd.querySelector("[data-a=no]").onclick = () => fd.close();
      fd.querySelector("[data-a=ok]").onclick = async () => {
        filters = S.set(fd.querySelector("textarea").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 50));
        fd.close();
        try { await PB.kv.set("console_filters", filters); } catch (e) { toast(`Couldn't save the filters: ${e.message}`); }
      };
      fd.showModal();
    };
  return {
    hidden() { const fs = tests(); return t => (cfg.temps && TEMP.test(t)) || fs.some(f => f(t)); },
    destroy() { fd.remove(); },
  };
};
