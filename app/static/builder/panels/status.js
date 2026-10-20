// Status panel: thumbnail, file, state, progress bar, then a two-column list of the numbers.
PB.panel("status", {
  title: "Status",
  icon: PB.icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-st"><img class="pb-thumb" alt="" hidden><div class="pb-st-txt"><div class="pb-file"></div><div class="pb-state"></div></div></div>
      <div class="pb-prog"><i></i></div><div class="pb-pct"><span></span><span></span></div>
      <dl class="pb-kv">
        <div><dt>Nozzle</dt><dd data-k="nozzle"></dd></div><div><dt>Bed</dt><dd data-k="bed"></dd></div>
        <div><dt>Elapsed</dt><dd data-k="elapsed"></dd></div><div><dt>Done around</dt><dd data-k="done"></dd></div>
        <div><dt>Layer</dt><dd data-k="layer"></dd></div><div><dt>Speed / flow</dt><dd data-k="speed"></dd></div>
      </dl>`;
    const q = s => host.querySelector(s), k = n => host.querySelector(`[data-k=${n}]`);
    const thumb = q(".pb-thumb");
    thumb.onload = () => { thumb.hidden = false; };
    thumb.onerror = () => { thumb.hidden = true; };
    let thumbFile;
    const temp = (t, tg) => t == null ? "—" : `${t.toFixed(1)}°` + (tg > 0 ? ` / ${tg.toFixed(0)}°` : "");
    return {
      open() { thumbFile = undefined; },
      update(p) {
        const st = statusOf(p), [, , barColor, statusText, statusColor] = look(st);
        const live = p.connection === "online", active = p.state === "printing" || p.state === "paused";
        const showPct = active || p.state === "complete", pct = showPct ? p.progress || 0 : 0;
        const file = showPct && p.filename ? p.filename : null;
        if (file !== thumbFile) {
          thumbFile = file; thumb.hidden = true;
          if (file) thumb.src = `/api/printers/${p.id}/thumbnail?file=${encodeURIComponent(file)}`; else thumb.removeAttribute("src");
        }
        q(".pb-file").textContent = file || "No print running";
        const state = q(".pb-state");
        state.textContent = p.klippy_message || (p.state === "error" && p.message) || statusText; state.style.color = statusColor;
        q(".pb-prog i").style.width = `${pct * 100}%`; q(".pb-prog i").style.background = barColor;
        const [a, b] = host.querySelectorAll(".pb-pct span");
        a.innerHTML = showPct ? `<b>${Math.floor(pct * 100)}%</b> printed` : "";
        b.textContent = active && p.eta != null ? `${fmtDur(p.eta)} left` : "";
        k("nozzle").textContent = live ? temp(p.nozzle, p.nozzle_target) : "—";
        k("bed").textContent = live ? temp(p.bed, p.bed_target) : "—";
        k("elapsed").textContent = active && p.print_duration ? fmtDur(p.print_duration) : "—";
        k("done").textContent = active && p.eta != null ? fmtClock(new Date(Date.now() + p.eta * 1000)) : "—";
        k("layer").textContent = p.layer != null && p.total_layers ? `${p.layer} / ${p.total_layers}` : "—";
        k("speed").textContent = p.speed_factor != null ? `${Math.round(p.speed_factor * 100)}% / ${Math.round((p.extrude_factor ?? 1) * 100)}%` : "—";
      },
    };
  },
});
