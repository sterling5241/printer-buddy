PB.panel("sensors", {
  title: "Sensors", desc: "Moonraker sensors (power, MQTT …) and Nevermore air filter", cls: "adv",
  icon: PB.icon('<path d="M12 3v12"/><circle cx="12" cy="18" r="3"/><path d="M8 7h8M8 11h8"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-sens"></div><div class="pb-msg pb-muted"></div>`;
    const box = host.querySelector(".pb-sens"), msg = host.querySelector(".pb-msg");
    let timer = null, hasNever = null;
    const val = v => typeof v === "number" ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) : v == null ? "—" : String(v);
    const pretty = k => k.replace(/_/g, " ").replace(/\b\w/, c => c.toUpperCase());
    async function load() {
      const id = pageId; if (id === null || !host.offsetParent) return;
      const cards = [];
      try {
        const r = await PB.rpc("server.sensors.list", { extended: true });
        for (const [sid, s] of Object.entries(r?.sensors || {})) {
          const units = Object.fromEntries((s.parameter_info || []).map(p => [p.name, p.units || ""]));
          cards.push({ name: s.friendly_name || sid, rows: Object.entries(s.values || {}).map(([k, v]) => [pretty(k), `${val(v)} ${units[k] || ""}`.trim()]) });
        }
      } catch {}
      try {
        if (hasNever === null) hasNever = ((await PB.rpc("printer.objects.list"))?.objects || []).includes("nevermore");
        if (hasNever) {
          const n = (await PB.rpc("printer.objects.query", { objects: { nevermore: null } }))?.status?.nevermore || {};
          cards.push({ name: "Nevermore", rows: Object.entries(n).filter(([, v]) => typeof v !== "object").map(([k, v]) => [pretty(k), val(v)]) });
        }
      } catch {}
      if (id !== pageId) return;
      box.innerHTML = cards.map(c => `<div class="pb-scard"><b>${esc(c.name)}</b><dl class="pb-kv">${c.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>`).join("");
      msg.textContent = cards.length ? "" : "No sensors. Add [sensor …] sections to moonraker.conf, or install Nevermore.";
    }
    return {
      open() { box.innerHTML = ""; msg.textContent = ""; hasNever = null; },
      shown() { load(); clearInterval(timer); timer = setInterval(load, 5000); },
      destroy() { clearInterval(timer); },
    };
  },
});
