PB.panel("endstops", {
  title: "Endstops", desc: "Live endstop / probe state (open or triggered)", cls: "adv", gear: true,
  icon: PB.icon('<path d="M4 20h16M8 20V9l4-5 4 5v11"/><circle cx="12" cy="13" r="2"/>'),
  settings: [{ k: "live", label: "Refresh every 2 seconds while visible", type: "check", def: true }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><span class="pb-msg pb-muted">Press a switch by hand and watch it change.</span><span class="bd-sp"></span>
        <button type="button" data-a="ref" data-head title="Check now" aria-label="Check now">${PB.ic.refresh}</button></div><div class="pb-endst"></div>`;
    const box = host.querySelector(".pb-endst"), msg = host.querySelector(".pb-msg");
    let timer = null, busy = false, live = false;
    async function check() {
      if (busy || pageId === null || !live) return;
      busy = true;
      try {
        const r = await PB.rpc("printer.query_endstops.status") || {};
        const items = Object.entries(r);
        box.innerHTML = items.length ? items.map(([n, v]) => { const t = String(v).toUpperCase() === "TRIGGERED";
          return `<div class="pb-es ${t ? "on" : ""}"><b>${esc(n.replace(/^manual_stepper /, "").toUpperCase())}</b><span>${t ? "TRIGGERED" : "open"}</span></div>`; }).join("")
          : `<p class="pb-muted">No endstops reported.</p>`;
      } catch (e) { box.innerHTML = `<p class="pb-muted">${esc(e.message)}</p>`; }
      busy = false;
    }
    host.querySelector("[data-a=ref]").onclick = check;
    const loop = on => { clearInterval(timer); timer = on && cfg.live ? setInterval(() => { if (host.offsetParent) check(); }, 2000) : null; };
    return {
      open() { box.innerHTML = ""; },
      shown() { check(); loop(true); },
      update(p) {
        const was = live; live = p.connection === "online" && p.klippy_state === "ready";
        host.querySelector("[data-a=ref]").disabled = !live;
        if (live && !was && host.offsetParent) check();
      },
      destroy() { loop(false); },
    };
  },
});
