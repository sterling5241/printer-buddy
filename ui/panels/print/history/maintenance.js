PB.parts = PB.parts || {};
PB.parts.historyMaint = c => {
    const nowTotals = () => ({ at: Date.now() / 1000, hours: (c.totals.total_print_time || 0) / 3600, fil: (c.totals.total_filament_used || 0) / 1000 });
    function status(m) {
      const n = nowTotals(), l = m.last || n, parts = [];
      if (m.hours) parts.push([(n.hours - l.hours) / m.hours, `${(n.hours - l.hours).toFixed(1)} / ${m.hours} h`]);
      if (m.fil) parts.push([(n.fil - l.fil) / m.fil, `${Math.round(n.fil - l.fil)} / ${m.fil} m`]);
      if (m.days) parts.push([(n.at - l.at) / 86400 / m.days, `${Math.floor((n.at - l.at) / 86400)} / ${m.days} days`]);
      const worst = parts.reduce((a, b) => (b[0] > a[0] ? b : a), [0, ""]);
      return { frac: worst[0], text: parts.map(p => p[1]).join(" · ") || "no reminder set" };
    }
    function drawMaint() {
      const box = c.q(".pb-maint");
      if (!c.cfg.maint || !c.maint.length) { box.innerHTML = ""; return; }
      box.innerHTML = c.maint.map((m, i) => { const st = status(m), due = st.frac >= 1;
        return `<div class="pb-mrow${due ? " due" : ""}"><span class="pb-mname">${due ? PB.ic.alert : PB.ic.wrench}${esc(m.name)}</span>
          <span class="pb-mbar"><i style="width:${Math.min(100, Math.round(st.frac * 100))}%"></i></span><span class="pb-muted pb-mtext">${esc(st.text)}</span>
          <button type="button" data-done="${i}" title="Mark as done now (starts counting again)">Done</button></div>`; }).join("");
      for (const b of box.querySelectorAll("[data-done]")) b.onclick = async () => { c.maint[+b.dataset.done].last = nowTotals(); drawMaint(); saveMaint(); };
    }
    const saveMaint = () => PB.kv.set("maintenance", c.maint).catch(e => toast(`Couldn't save: ${e.message}`));
    c.q("[data-a=maint]").onclick = () => {
      let list = c.maint.map(m => ({ ...m }));
      const read = () => { list = [...dlg.querySelectorAll(".pb-prow")].map((r, i) => ({ ...list[i], name: r.querySelector("[data-k=name]").value.trim() || "Maintenance",
        hours: +r.querySelector("[data-k=hours]").value || 0, fil: +r.querySelector("[data-k=fil]").value || 0, days: +r.querySelector("[data-k=days]").value || 0 })); };
      const render = () => {
        c.dlg.innerHTML = `<h3>Maintenance reminders</h3><p class="pb-muted">Remind me after this much printing since it was last done (0 = off). Shown at the top of History.</p>
          <div class="pb-plist">${list.map((m, i) => `<div class="pb-prow" data-i="${i}"><div class="pb-prowtop"><input data-k="name" value="${esc(m.name)}" placeholder="e.g. Lube the Z rods">
              <button type="button" data-del aria-label="Delete">${PB.ic.x}</button></div><div class="pb-ptemps">
              <label>every <input type="number" min="0" data-k="hours" value="${m.hours || ""}"> print hours</label>
              <label><input type="number" min="0" data-k="fil" value="${m.fil || ""}"> m filament</label><label><input type="number" min="0" data-k="days" value="${m.days || ""}"> days</label></div></div>`).join("") || `<p class="pb-muted">None yet.</p>`}</div>
          <div class="bd-libfoot"><button type="button" data-a="add">+ Add</button><span class="bd-sp"></span><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="ok">Save</button></div>`;
        for (const b of c.dlg.querySelectorAll("[data-del]")) b.onclick = () => { read(); list.splice(+b.closest(".pb-prow").dataset.i, 1); render(); };
        c.dlg.querySelector("[data-a=add]").onclick = () => { read(); list.push({ name: "", hours: 200, fil: 0, days: 0, last: nowTotals() }); render(); };
        c.dlg.querySelector("[data-a=no]").onclick = () => c.dlg.close();
        c.dlg.querySelector("[data-a=ok]").onclick = () => { read(); c.maint = list.map(m => ({ ...m, last: m.last || nowTotals() })).slice(0, 30); c.dlg.close(); drawMaint(); saveMaint(); };
      };
      render(); c.dlg.showModal();
    };
  return { drawMaint };
};
