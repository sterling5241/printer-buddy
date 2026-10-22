PB.panel("macros", {
  title: "Macros", desc: "Your printer's macros as buttons", cls: "adv",
  icon: PB.icon('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-macs"><span class="pb-muted">Loading…</span></div>
      <div class="pb-maclinks"><button type="button" class="pb-link" data-a="edit">Hide some…</button><button type="button" class="pb-link" data-a="show" hidden></button></div>`;
    const box = host.querySelector(".pb-macs");
    let list = [], count = -1, pid = null;
    const hidden = () => PB.store.get("pb-macros-hidden", {})[pid] || [];
    async function load(id) {
      pid = id;
      try { list = (await api(`/api/printers/${id}/macros`)).macros || []; } catch { list = []; }
      if (id === pageId) draw();
    }
    function draw() {
      const hid = hidden(), shown = list.filter(m => !hid.includes(m.name));
      box.innerHTML = shown.length ? shown.map(m => `<span class="pb-mac"><button type="button" data-mac="${esc(m.name)}" title="${esc(m.description || m.name)}">${esc(m.name.replaceAll("_", " "))}</button><button type="button" class="x" data-hide="${esc(m.name)}" title="Hide">${PB.ic.x}</button></span>`).join("")
        : `<span class="pb-muted">${list.length ? "All macros are hidden." : "No macros on this printer."}</span>`;
      const show = host.querySelector("[data-a=show]");
      show.hidden = !hid.length; show.textContent = `Show hidden (${hid.length})`;
      for (const b of box.querySelectorAll("[data-mac]")) {
        const m = list.find(x => x.name === b.dataset.mac);
        if (m?.params?.length) { b.textContent += " …"; b.title = `${m.description || m.name}\nParameters: ${m.params.map(x => x.name).join(", ")}`; }
        b.onclick = () => {
          const p = PB.current(); if (!p) return;
          if ((p.state === "printing" || p.state === "paused") && !confirm(`Run ${b.dataset.mac} while a print is running?`)) return;
          if (m?.params?.length) return form(m);
          gcode(b.dataset.mac); toast(`Sent ${b.dataset.mac}`);
        };
      }
      for (const b of box.querySelectorAll("[data-hide]")) b.onclick = () => {
        const all = PB.store.get("pb-macros-hidden", {}); (all[pid] ||= []).push(b.dataset.hide); PB.store.set("pb-macros-hidden", all); draw();
      };
    }
    const params = PB.parts.macroParams(), form = params.form;
    host.querySelector("[data-a=edit]").onclick = e => { const on = host.classList.toggle("pb-macedit"); e.target.textContent = on ? "Done" : "Hide some…"; };
    host.querySelector("[data-a=show]").onclick = () => { const all = PB.store.get("pb-macros-hidden", {}); delete all[pid]; PB.store.set("pb-macros-hidden", all); draw(); };
    return {
      open() { pid = null; count = -1; },
      destroy() { params.destroy(); },
      update(p) { if ((pid !== p.id || p.macro_count !== count) && p.connection === "online") { count = p.macro_count; load(p.id); } },
    };
  },
});
