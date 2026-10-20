// Macros panel: every macro on the printer as a button (Klipper's _HIDDEN ones skipped); hide the ones you don't use.
// Macros that read parameters (params.TEMP|default(200) …) open a small form first; "…" marks them.
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
      box.innerHTML = shown.length ? shown.map(m => `<span class="pb-mac"><button type="button" data-mac="${esc(m.name)}" title="${esc(m.description || m.name)}">${esc(m.name.replaceAll("_", " "))}</button><button type="button" class="x" data-hide="${esc(m.name)}" title="Hide">✕</button></span>`).join("")
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
    const dlg = PB.el("dialog", "bd-lib pb-xd pb-macdlg"); document.body.append(dlg);
    function form(m) {   // fields start empty with the macro's default shown; empty = let the macro use its default
      dlg.innerHTML = `<h3>${esc(m.name)}</h3>${m.description ? `<p class="pb-muted">${esc(m.description)}</p>` : ""}
        <form class="pb-macform">${m.params.map(x => `<label>${esc(x.name)}<input name="${esc(x.name)}" placeholder="${esc(x.default ?? "")}" autocomplete="off" spellcheck="false"></label>`).join("")}</form>
        <div class="bd-libfoot"><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="go">Run</button></div>`;
      const run = () => {
        const args = [...dlg.querySelectorAll("input")].filter(i => i.value.trim()).map(i => `${i.name}=${/\s/.test(i.value.trim()) ? `"${i.value.trim()}"` : i.value.trim()}`);
        const cmd = [m.name, ...args].join(" "); dlg.close(); gcode(cmd); toast(`Sent ${cmd}`);
      };
      dlg.querySelector("[data-a=no]").onclick = () => dlg.close();
      dlg.querySelector("[data-a=go]").onclick = run;
      dlg.querySelector("form").onsubmit = e => { e.preventDefault(); run(); };
      dlg.querySelector("form").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); run(); } };
      dlg.showModal(); dlg.querySelector("input")?.focus();
    }
    host.querySelector("[data-a=edit]").onclick = e => { const on = host.classList.toggle("pb-macedit"); e.target.textContent = on ? "Done" : "Hide some…"; };
    host.querySelector("[data-a=show]").onclick = () => { const all = PB.store.get("pb-macros-hidden", {}); delete all[pid]; PB.store.set("pb-macros-hidden", all); draw(); };
    return {
      open() { pid = null; count = -1; },
      destroy() { dlg.remove(); },
      update(p) { if ((pid !== p.id || p.macro_count !== count) && p.connection === "online") { count = p.macro_count; load(p.id); } },
    };
  },
});
