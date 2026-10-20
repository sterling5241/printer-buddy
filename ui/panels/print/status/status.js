// Status panel: thumbnail, file, state, progress bar, then a two-column list of the numbers.
PB.panel("status", {
  title: "Status", desc: "Print progress, file, times, layer, speed and flow",
  icon: PB.icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  settings: [
    { k: "thumb", label: "Show the print's picture", type: "check", def: true },
    { k: "list", label: "Show the numbers list", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-st"><img class="pb-thumb" alt="" hidden><div class="pb-st-txt"><div class="pb-file"></div><div class="pb-state"></div></div></div>
      <div class="pb-prog"><i></i></div><div class="pb-pct"><span></span><span></span></div>
      <div class="pb-pal" hidden><span class="pb-palstate pb-muted"></span><span class="bd-sp"></span><button type="button" data-a="pal">Pause at layer…</button></div>
      <dl class="pb-kv">
        <div><dt>Elapsed</dt><dd data-k="elapsed"></dd></div><div><dt>Done around</dt><dd data-k="done"></dd></div>
        <div><dt>Layer</dt><dd data-k="layer"></dd></div><div><dt>Speed / flow</dt><dd data-k="speed"></dd></div>
      </dl>`;
    const q = s => host.querySelector(s), k = n => host.querySelector(`[data-k=${n}]`);
    const thumb = q(".pb-thumb");
    if (!cfg.list) q(".pb-kv").hidden = true;
    thumb.onload = () => { thumb.hidden = false; };
    thumb.onerror = () => { thumb.hidden = true; };
    let thumbFile;
    q("[data-a=pal]").onclick = () => PB.pauseAtLayer?.();
    return {
      open() { thumbFile = undefined; },
      update(p) {
        const st = statusOf(p), [, , barColor, statusText, statusColor] = look(st);
        const live = p.connection === "online", active = p.state === "printing" || p.state === "paused";
        const showPct = active || p.state === "complete", pct = showPct ? p.progress || 0 : 0;
        const file = showPct && p.filename ? p.filename : null;
        if (file !== thumbFile && cfg.thumb) {
          thumbFile = file; thumb.hidden = true;
          if (file) thumb.src = `/api/printers/${p.id}/thumbnail?file=${encodeURIComponent(file)}`; else thumb.removeAttribute("src");
        }
        q(".pb-file").textContent = file || "No print running";
        const pl = p.pause_layer, pal = q(".pb-pal");   // pause at layer (needs the SET_PAUSE_AT_LAYER macros)
        pal.hidden = !pl || !active;
        if (pl) q(".pb-palstate").textContent = pl.next?.enable ? "Pausing at the next layer" : pl.at?.enable && pl.at.layer ? `Pausing at layer ${pl.at.layer}` : "";
        const state = q(".pb-state");
        state.textContent = p.klippy_message || (p.state === "error" && p.message) || statusText; state.style.color = statusColor;
        q(".pb-prog i").style.width = `${pct * 100}%`; q(".pb-prog i").style.background = barColor;
        const [a, b] = host.querySelectorAll(".pb-pct span");
        a.innerHTML = showPct ? `<b>${Math.floor(pct * 100)}%</b> printed` : "";
        b.textContent = active && p.eta != null ? `${fmtDur(p.eta)} left` : "";
        k("elapsed").textContent = active && p.print_duration ? fmtDur(p.print_duration) : "—";
        k("done").textContent = active && p.eta != null ? fmtClock(new Date(Date.now() + p.eta * 1000)) : "—";
        k("layer").textContent = p.layer != null && p.total_layers ? `${p.layer} / ${p.total_layers}` : "—";
        k("speed").textContent = p.speed_factor != null ? `${Math.round(p.speed_factor * 100)}% / ${Math.round((p.extrude_factor ?? 1) * 100)}%` : "—";
      },
    };
  },
});
