PB.panel("exclude", {
  title: "Objects", desc: "Skip one failed object mid-print", cls: "adv",
  icon: PB.icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14l7 7M21 14l-7 7"/>'),
  settings: [
    { k: "map", label: "Show the bed map", type: "check", def: true },
    { k: "list", label: "Show the list", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-objmap"></div><div class="pb-list"></div><div class="pb-msg pb-muted"></div>`;
    const map = host.querySelector(".pb-objmap"), list = host.querySelector(".pb-list"), msg = host.querySelector(".pb-msg");
    if (!cfg.map) map.remove();
    if (!cfg.list) list.remove();
    let key = null, printing = false;
    const skip = name => {
      const p = PB.current(); if (!p) return;
      if (!confirm(`Skip "${name}" for the rest of this print? This can't be undone.`)) return;
      gcode(`EXCLUDE_OBJECT NAME=${name}`);
      toast(`Skipping ${name}`);
    };
    function draw(o, bed) {
      if (!o) {
        if (cfg.map) map.innerHTML = "";
        if (cfg.list) list.innerHTML = "";
        msg.innerHTML = `No objects in this print. Turn on <b>label objects</b> in your slicer and add <code>[exclude_object]</code> to printer.cfg.`;
        return;
      }
      msg.textContent = `${o.list.length} object${o.list.length > 1 ? "s" : ""}${o.excluded.length ? `, ${o.excluded.length} skipped` : ""}`;
      const state = n => o.excluded.includes(n) ? "skipped" : n === o.current ? "now" : "";
      if (cfg.map) {
        const pts = o.list.flatMap(x => x.polygon || (x.center ? [x.center] : []));
        let [x0, y0, x1, y1] = bed || [Math.min(...pts.map(q => q[0])) - 10, Math.min(...pts.map(q => q[1])) - 10, Math.max(...pts.map(q => q[0])) + 10, Math.max(...pts.map(q => q[1])) + 10];
        if (!isFinite(x0)) [x0, y0, x1, y1] = [0, 0, 220, 220];
        const W = x1 - x0, H = y1 - y0, fy = y => y1 - y + y0;   // flip Y: bed front at the bottom
        map.innerHTML = `<svg viewBox="${x0} ${y0} ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Objects on the bed">
          <rect x="${x0}" y="${y0}" width="${W}" height="${H}" class="bed"/>
          ${o.list.map((x, i) => {
            const st = state(x.name), poly = x.polygon?.length > 2 ? x.polygon : null, c = x.center;
            const shape = poly ? `<polygon points="${poly.map(q => `${q[0]},${fy(q[1])}`).join(" ")}"/>` : c ? `<circle cx="${c[0]}" cy="${fy(c[1])}" r="${Math.max(W, H) / 60}"/>` : "";
            return `<g class="obj ${st}" data-i="${i}"><title>${esc(x.name)}</title>${shape}</g>`;
          }).join("")}</svg>`;
        for (const g of map.querySelectorAll(".obj:not(.skipped)")) g.onclick = () => printing && skip(o.list[+g.dataset.i].name);
      }
      if (cfg.list) {
        list.innerHTML = o.list.map((x, i) => {
          const st = state(x.name);
          return `<div class="pb-li"><div class="pb-lmain"><div class="pb-lname">${esc(x.name)}</div></div>
            ${st ? `<span class="pb-chip ${st === "now" ? "running" : "failed"}">${st === "now" ? "Printing now" : "Skipped"}</span>` : ""}
            <div class="pb-lbtn"><button type="button" data-i="${i}"${st === "skipped" || !printing ? " disabled" : ""}>Skip</button></div></div>`;
        }).join("");
        for (const b of list.querySelectorAll("[data-i]")) b.onclick = () => skip(o.list[+b.dataset.i].name);
      }
    }
    return {
      open() { key = null; },
      update(p) {
        printing = p.state === "printing" || p.state === "paused";
        const o = p.objects, k = JSON.stringify([o?.list?.map(x => x.name), o?.excluded, o?.current, printing, p.bed_area]);
        if (k !== key) { key = k; draw(o, p.bed_area); }
      },
    };
  },
});
