PB.panel("history", {
  title: "History", desc: "Past prints, totals and reprint", cls: "adv",
  icon: PB.icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>'),
  settings: [
    { k: "thumbs", label: "Show thumbnails", type: "check", def: true },
    { k: "totals", label: "Show totals", type: "check", def: true },
    { k: "maint", label: "Show maintenance reminders", type: "check", def: true },
  ],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><div class="pb-totals pb-muted"></div><span class="bd-sp"></span>
        <button type="button" data-a="charts" data-head title="Charts" aria-label="Charts" aria-pressed="false">${PB.ic.chart}</button><button type="button" data-a="maint" data-head title="Maintenance reminders" aria-label="Maintenance">${PB.ic.wrench}</button><button type="button" data-a="csv" title="Download the whole history as a spreadsheet (CSV)" data-head aria-label="Download CSV">${PB.ic.download}</button></div>
      <div class="pb-hcharts" hidden><div class="pb-hc1"></div><div class="pb-hc2"></div><div class="pb-hcnums pb-muted"></div></div>
      <div class="pb-maint"></div><div class="pb-msg pb-muted" aria-live="polite"></div>
      <div class="pb-list"></div><button type="button" class="pb-more" hidden>Load more</button>`;
    const q = s => host.querySelector(s), list = q(".pb-list"), msg = q(".pb-msg"), more = q(".pb-more");
    if (!cfg.totals) q(".pb-totals").hidden = true;
    let jobs = [], count = 0, loaded = false, busy = false, forId = null, notes = {}, maint = [], totals = {};
    async function load(reset) {
      const id = pageId; if (id === null) return;
      if (reset) {
        jobs = []; count = 0; forId = id; loaded = true; list.innerHTML = "";
        PB.kv.get("notes", id).then(v => { if (id === pageId) { notes = v && typeof v === "object" ? v : {}; draw(); } }).catch(() => {});
        PB.kv.get("maintenance", id).then(v => { if (id === pageId) { maint = Array.isArray(v) ? v : []; mt.drawMaint(); } }).catch(() => {});
        api(`/api/printers/${id}/history/totals`).then(t => {
          if (id !== pageId) return;
          totals = t || {}; mt.drawMaint();
          if (!cfg.totals) return;
          q(".pb-totals").innerHTML = `<b>${t.total_jobs ?? "—"}</b> prints · <b>${t.total_print_time != null ? fmtDur(t.total_print_time) : "—"}</b> printing ·
            <b>${fmtFil(t.total_filament_used)}</b> filament · longest <b>${t.longest_print != null ? fmtDur(t.longest_print) : "—"}</b>`;
        }).catch(() => {});
      }
      msg.textContent = "Loading…";
      try {
        const r = await api(`/api/printers/${id}/history?start=${jobs.length}&limit=30`);
        if (id !== pageId || id !== forId) return;
        jobs = jobs.concat(r.jobs); count = r.count; draw();
      } catch (e) { if (id === pageId) msg.textContent = e.message.includes("history") ? "This printer's Moonraker has no print history turned on." : e.message; }
    }
    const COLS = [["filename", "File"], ["start_time", "Started"], ["print_duration", "Duration"], ["filament_used", "Filament"], ["status", "Result"]];
    let sortKey = "start_time", sortDir = -1;
    function draw() {
      msg.textContent = jobs.length ? `${jobs.length} of ${count} prints` : "No prints recorded yet.";
      if (!jobs.length) { list.innerHTML = ""; more.hidden = true; return; }
      const rows = [...jobs].sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        return (typeof x === "string" || typeof y === "string" ? String(x ?? "").localeCompare(String(y ?? "")) : (x ?? -1) - (y ?? -1)) * sortDir;
      });
      list.innerHTML = `<div class="pb-tablewrap"><table class="pb-htable"><thead><tr>${cfg.thumbs ? "<th></th>" : ""}${COLS.map(([k, l]) =>
          `<th><button type="button" data-sort="${k}" aria-sort="${k === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none"}">${l}${k === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}<th></th></tr></thead>
        <tbody>${rows.map(j => {
          const [label, cls] = RESULT[j.status] || [j.status || "—", ""];
          return `<tr>${cfg.thumbs ? `<td class="pb-tthumb"><img class="pb-lthumb" loading="lazy" alt="" src="${PB.thumbUrl(pageId, j.filename)}"></td>` : ""}
            <td class="pb-tname" title="${esc(j.filename)}"><button type="button" class="pb-hname" data-job="${esc(j.id)}">${esc(j.filename)}</button>
              ${notes[j.id] ? `<div class="pb-hnote" title="Note">${PB.ic.note}${esc(notes[j.id].slice(0, 80))}</div>` : ""}</td><td class="num">${fmtDate(j.start_time)}</td>
            <td class="num">${j.print_duration ? fmtDur(j.print_duration) : "—"}</td><td class="num">${fmtFil(j.filament_used)}</td>
            <td><span class="pb-chip ${cls}">${esc(label)}</span></td>
            <td class="pb-tbtn">${j.exists ? `<button type="button" data-print="${esc(j.filename)}"${busy ? " disabled" : ""}>Reprint</button>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>`;
      for (const img of list.querySelectorAll(".pb-lthumb")) img.onerror = () => img.classList.add("none");
      for (const b of list.querySelectorAll("[data-print]")) b.onclick = () => PB.printFile(b.dataset.print);
      for (const b of list.querySelectorAll("[data-job]")) b.onclick = () => dt.details(b.dataset.job);
      for (const b of list.querySelectorAll("[data-sort]")) b.onclick = () => {
        if (sortKey === b.dataset.sort) sortDir = -sortDir; else { sortKey = b.dataset.sort; sortDir = sortKey === "filename" || sortKey === "status" ? 1 : -1; }
        draw();
      };
      more.hidden = jobs.length >= count;
    }
    more.onclick = () => load(false);
    const dlg = PB.el("dialog", "bd-lib pb-xd pb-hdlg"); document.body.append(dlg);
    let allJobs = null;
    async function fetchAll(id) {
      if (allJobs?.id === id) return allJobs.jobs;
      let all = [], total = 1;
      while (all.length < total && all.length < 20000) { const r = await api(`/api/printers/${id}/history?start=${all.length}&limit=100`); total = r.count; if (!r.jobs.length) break; all = all.concat(r.jobs); }
      allJobs = { id, jobs: all }; return all;
    }
    const c = {
      q, msg, cfg, dlg, draw: () => draw(), fetchAll: id => fetchAll(id),
      get jobs() { return jobs; }, get notes() { return notes; }, set notes(v) { notes = v; },
      get maint() { return maint; }, set maint(v) { maint = v; }, get totals() { return totals; },
    };
    const dt = PB.parts.historyDetails(c), ch = PB.parts.historyCharts(c), mt = PB.parts.historyMaint(c);
    PB.parts.historyCsv(c);
    return {
      open() { allJobs = null; q(".pb-hcharts").hidden = true; q("[data-a=charts]").setAttribute("aria-pressed", false); loaded = false; jobs = []; notes = {}; maint = []; totals = {}; list.innerHTML = ""; msg.textContent = ""; q(".pb-totals").textContent = ""; q(".pb-maint").innerHTML = ""; },
      shown() { if (!loaded) load(true); },
      update(p) {
        const b = p.state === "printing" || p.state === "paused";
        if (b !== busy) { busy = b; for (const x of list.querySelectorAll("[data-print]")) x.disabled = busy; }
      },
      destroy() { dlg.remove(); ch.destroy(); },
    };
  },
});
