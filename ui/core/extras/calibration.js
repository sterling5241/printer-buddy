(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const mp = dialog("pb-mprobe"), bs = dialog("pb-bscrew"), st = dialog("pb-tilt");
  for (const d of [mp, bs]) d.addEventListener("cancel", e => e.preventDefault());
  const STEPS = [-1, -0.1, -0.05, -0.01, 0.01, 0.05, 0.1, 1];
  const fmt = v => v == null ? "—" : Number(v).toFixed(3);
  let mpKey = "", bsKey = "", tiltSeen = new Map();
  pageHook(p => {
    const m = p.manual_probe;
    if (m?.active) {
      const key = `${p.id}|${m.z}|${m.lo}|${m.hi}`;
      if (key !== mpKey) {
        mpKey = key;
        mp.innerHTML = `<h3>Manual probe</h3><p class="pb-muted">Lower the nozzle until a sheet of paper just drags, then Accept.</p>
          <div class="pb-mpz"><span><small>Lower bound</small>${fmt(m.lo)}</span><span class="now"><small>Z now</small>${fmt(m.z)}</span><span><small>Upper bound</small>${fmt(m.hi)}</span></div>
          <div class="pb-mpsteps">${STEPS.map(s => `<button type="button" data-z="${s > 0 ? "+" : ""}${s}">${s > 0 ? "+" : ""}${s}</button>`).join("")}</div>
          <div class="pb-mpsteps"><button type="button" data-z="--" title="TESTZ Z=--: halfway down, bigger step">−−</button><button type="button" data-z="-" title="TESTZ Z=-: halfway to the lower bound">− ½</button>
            <button type="button" data-z="+" title="TESTZ Z=+: halfway to the upper bound">+ ½</button><button type="button" data-z="++" title="TESTZ Z=++">++</button></div>
          <div class="bd-libfoot"><button type="button" data-a="abort">Abort</button><button type="button" class="bd-primary" data-a="accept">Accept</button></div>`;
        for (const b of mp.querySelectorAll("[data-z]")) b.onclick = () => send(`TESTZ Z=${b.dataset.z}`);
        mp.querySelector("[data-a=abort]").onclick = () => send("ABORT");
        mp.querySelector("[data-a=accept]").onclick = () => send("ACCEPT");
      }
      if (!mp.open) mp.showModal();
    } else if (mp.open) { mp.close(); mpKey = ""; }
    const b = p.bed_screws;
    if (b?.active) {
      const key = `${p.id}|${b.state}|${b.screw}|${b.accepted}`;
      if (key !== bsKey) {
        bsKey = key;
        bs.innerHTML = `<h3>Bed screws</h3>
          <dl class="pb-kv"><dt>Screw</dt><dd>${b.screw == null ? "—" : b.screw + 1}</dd><dt>Pass</dt><dd>${b.state === "fine" ? "Fine adjustment" : "Coarse adjustment"}</dd>
            <dt>Accepted without change</dt><dd>${b.accepted ?? 0}</dd></dl>
          <p class="pb-muted">Turn the screw until a sheet of paper just drags. Changed it? <b>Adjusted</b>. Already right? <b>Accept</b>.</p>
          <div class="bd-libfoot"><button type="button" data-a="abort">Abort</button><button type="button" data-a="adj">Adjusted</button><button type="button" class="bd-primary" data-a="acc">Accept</button></div>`;
        bs.querySelector("[data-a=abort]").onclick = () => send("ABORT");
        bs.querySelector("[data-a=adj]").onclick = () => send("ADJUSTED");
        bs.querySelector("[data-a=acc]").onclick = () => send("ACCEPT");
      }
      if (!bs.open) bs.showModal();
    } else if (bs.open) { bs.close(); bsKey = ""; }
    const t = p.screws_tilt;
    if (t) {
      const key = JSON.stringify(t);
      if (!tiltSeen.has(p.id)) tiltSeen.set(p.id, key);
      else if (tiltSeen.get(p.id) !== key) { tiltSeen.set(p.id, key); if (Object.keys(t.results || {}).length || t.error) showTilt(t); }
    }
  });
  function showTilt(t) {
    const rows = Object.entries(t.results || {}).map(([name, r]) => {
      const [h, mm] = String(r.adjust || "00:00").split(":").map(Number), mins = (h || 0) * 60 + (mm || 0);
      const ok = r.is_base || mins < 6;
      return `<tr class="${ok ? "ok" : "bad"}"><td>${esc(r.name || name)}</td><td>${Number(r.z).toFixed(4)}</td>
        <td>${r.is_base ? "<b>base</b>" : mins === 0 ? "✓" : `${r.sign === "CW" ? "clockwise" : "anticlockwise"} <b>${esc(r.adjust)}</b>`}</td></tr>`;
    }).join("");
    st.innerHTML = `<h3>Screws tilt</h3>${t.error ? `<p class="pb-terr">The last run failed. Check the console.</p>` : ""}
      ${rows ? `<table class="pb-ttable"><tr><th>Screw</th><th>Z</th><th>Turn</th></tr>${rows}</table>
      <p class="pb-muted">01:15 = one full turn and a quarter. Green = within 5 minutes (good enough).</p>` : ""}
      <div class="bd-libfoot"><button type="button" data-a="close">Close</button><button type="button" class="bd-primary" data-a="retry">Run again</button></div>`;
    st.querySelector("[data-a=close]").onclick = () => st.close();
    st.querySelector("[data-a=retry]").onclick = () => { st.close(); send("SCREWS_TILT_CALCULATE"); toast("Probing the screws…"); };
    if (!st.open) st.showModal();
  }
  PB.showTilt = () => { const p = cur(); if (p?.screws_tilt) showTilt(p.screws_tilt); };
})();
