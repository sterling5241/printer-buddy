// History panel: totals, maintenance reminders, then past prints with thumbnails, result, time, filament and Reprint.
// Extras (Mainsail-style ideas, our code): a note per print, a details box, CSV export, and maintenance reminders
// (every N print hours / metres of filament / days), all saved on the box per printer.
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
        <button type="button" data-a="charts" title="Charts: results, filament and print time per week" aria-pressed="false">📊 Charts</button><button type="button" data-a="maint" title="Maintenance reminders">🔧 Maintenance</button><button type="button" data-a="csv" title="Download the whole history as a spreadsheet (CSV)">⬇ CSV</button></div>
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
        PB.kv.get("maintenance", id).then(v => { if (id === pageId) { maint = Array.isArray(v) ? v : []; drawMaint(); } }).catch(() => {});
        api(`/api/printers/${id}/history/totals`).then(t => {
          if (id !== pageId) return;
          totals = t || {}; drawMaint();
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
    // sortable table: click a header to sort by it, again to flip the direction (sorts the prints loaded so far)
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
              ${notes[j.id] ? `<div class="pb-hnote" title="Note">📝 ${esc(notes[j.id].slice(0, 80))}</div>` : ""}</td><td class="num">${fmtDate(j.start_time)}</td>
            <td class="num">${j.print_duration ? fmtDur(j.print_duration) : "—"}</td><td class="num">${fmtFil(j.filament_used)}</td>
            <td><span class="pb-chip ${cls}">${esc(label)}</span></td>
            <td class="pb-tbtn">${j.exists ? `<button type="button" data-print="${esc(j.filename)}"${busy ? " disabled" : ""}>Reprint</button>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>`;
      for (const img of list.querySelectorAll(".pb-lthumb")) img.onerror = () => img.classList.add("none");
      for (const b of list.querySelectorAll("[data-print]")) b.onclick = () => PB.printFile(b.dataset.print);
      for (const b of list.querySelectorAll("[data-job]")) b.onclick = () => details(b.dataset.job);
      for (const b of list.querySelectorAll("[data-sort]")) b.onclick = () => {
        if (sortKey === b.dataset.sort) sortDir = -sortDir; else { sortKey = b.dataset.sort; sortDir = sortKey === "filename" || sortKey === "status" ? 1 : -1; }
        draw();
      };
      more.hidden = jobs.length >= count;
    }
    more.onclick = () => load(false);
    // ---- details + note ----
    const dlg = PB.el("dialog", "bd-lib pb-xd pb-hdlg"); document.body.append(dlg);
    async function details(jid) {
      const j = jobs.find(x => String(x.id) === String(jid)); if (!j) return;
      dlg.innerHTML = `<h3>${esc(j.filename)}</h3><dl class="pb-kv pb-hkv"><dt>Result</dt><dd>${esc((RESULT[j.status] || [j.status])[0] || "—")}</dd>
          <dt>Started</dt><dd>${fmtDate(j.start_time)}</dd><dt>Ended</dt><dd>${j.end_time ? fmtDate(j.end_time) : "—"}</dd>
          <dt>Printing time</dt><dd>${j.print_duration ? fmtDur(j.print_duration) : "—"}</dd><dt>Filament</dt><dd>${fmtFil(j.filament_used)}</dd></dl>
        <dl class="pb-kv pb-hkv pb-hmore"></dl>
        <label class="bd-field">Note<textarea rows="3" class="pb-code" placeholder="e.g. first layer too high, used the textured sheet">${esc(notes[j.id] || "")}</textarea></label>
        <div class="bd-libfoot">${j.exists ? `<button type="button" data-a="re">Reprint</button>` : ""}<span class="bd-sp"></span>
          <button type="button" data-a="no">Close</button><button type="button" class="bd-primary" data-a="ok">Save note</button></div>`;
      dlg.querySelector("[data-a=no]").onclick = () => dlg.close();
      dlg.querySelector("[data-a=re]")?.addEventListener("click", () => { dlg.close(); PB.printFile(j.filename); });
      dlg.querySelector("[data-a=ok]").onclick = async () => {
        const v = dlg.querySelector("textarea").value.trim(); if (v) notes[j.id] = v.slice(0, 2000); else delete notes[j.id];
        dlg.close(); draw();
        try { await PB.kv.set("notes", notes); } catch (e) { toast(`Couldn't save the note: ${e.message}`); }
      };
      dlg.showModal();
      try {   // the slicer's details for this job (Moonraker keeps the file's metadata with the job)
        const r = await PB.rpc("server.history.get_job", { uid: String(j.id) }), m = r?.job?.metadata || {};
        const rows = [["Slicer", [m.slicer, m.slicer_version].filter(Boolean).join(" ")], ["Estimated", m.estimated_time && fmtDur(m.estimated_time)],
          ["Total time", r?.job?.total_duration && fmtDur(r.job.total_duration)], ["Layer height", m.layer_height && `${m.layer_height} mm`],
          ["Filament type", m.filament_type], ["Filament (sliced)", m.filament_total && fmtFil(m.filament_total)], ["Nozzle", m.nozzle_diameter && `${m.nozzle_diameter} mm`],
          ["Temps", [m.first_layer_extr_temp && `nozzle ${m.first_layer_extr_temp}°`, m.first_layer_bed_temp && `bed ${m.first_layer_bed_temp}°`].filter(Boolean).join(", ")]].filter(([, v]) => v);
        dlg.querySelector(".pb-hmore").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join("");
      } catch {}
    }
    let allJobs = null;   // every job (for CSV + charts), fetched once per printer
    async function fetchAll(id) {
      if (allJobs?.id === id) return allJobs.jobs;
      let all = [], total = 1;
      while (all.length < total && all.length < 20000) { const r = await api(`/api/printers/${id}/history?start=${all.length}&limit=100`); total = r.count; if (!r.jobs.length) break; all = all.concat(r.jobs); }
      allJobs = { id, jobs: all }; return all;
    }
    // ---- charts: results (donut), and filament + print hours per week for the last 12 weeks ----
    let c1 = null, c2 = null;
    q("[data-a=charts]").onclick = async e => {
      const box = q(".pb-hcharts"), on = box.hidden; box.hidden = !on; e.currentTarget.setAttribute("aria-pressed", on);
      if (!on) return;
      if (!window.echarts) { q(".pb-hcnums").textContent = "Charts unavailable."; return; }
      const id = pageId; q(".pb-hcnums").textContent = "Collecting the history…";
      let all; try { all = await fetchAll(id); } catch (err) { q(".pb-hcnums").textContent = err.message; return; }
      if (id !== pageId) return;
      const count = {}; for (const j of all) count[j.status || "unknown"] = (count[j.status || "unknown"] || 0) + 1;
      const COL = { completed: "#4ade80", cancelled: "#8f8b99", error: "#e5484d", klippy_shutdown: "#e5484d", klippy_disconnect: "#f6c344", interrupted: "#f6c344", in_progress: "#ff8a1f" };
      const WEEK = 7 * 86400, now = Date.now() / 1000, weeks = Array.from({ length: 12 }, (_, i) => Math.floor(now / WEEK) - 11 + i);
      const fil = weeks.map(() => 0), hrs = weeks.map(() => 0);
      for (const j of all) { const w = weeks.indexOf(Math.floor((j.start_time || 0) / WEEK)); if (w >= 0) { fil[w] += (j.filament_used || 0) / 1000; hrs[w] += (j.print_duration || 0) / 3600; } }
      const label = w => new Date(w * WEEK * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
      c1 ||= echarts.init(q(".pb-hc1")); c2 ||= echarts.init(q(".pb-hc2"));
      const txt = { color: "#8f8b99", fontSize: 11 };
      c1.setOption({ tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: txt }, series: [{ type: "pie", radius: ["45%", "70%"], center: ["50%", "42%"], label: { show: false },
        data: Object.entries(count).map(([k, v]) => ({ name: (RESULT[k] || [k])[0], value: v, itemStyle: { color: COL[k] || "#90cdf4" } })) }] });
      c2.setOption({ tooltip: { trigger: "axis" }, legend: { top: 0, textStyle: txt }, grid: { left: 40, right: 40, top: 28, bottom: 24 },
        xAxis: { type: "category", data: weeks.map(label), axisLabel: txt },
        yAxis: [{ type: "value", name: "m", axisLabel: txt, nameTextStyle: txt, splitLine: { lineStyle: { color: "rgba(127,127,140,.15)" } } }, { type: "value", name: "h", axisLabel: txt, nameTextStyle: txt, splitLine: { show: false } }],
        series: [{ name: "Filament (m)", type: "bar", data: fil.map(v => +v.toFixed(1)), itemStyle: { color: "#ff8a1f" } },
                 { name: "Print hours", type: "line", yAxisIndex: 1, data: hrs.map(v => +v.toFixed(1)), itemStyle: { color: "#4fd1c5" }, showSymbol: false }] });
      const done = all.filter(j => j.status === "completed"), avg = done.length ? done.reduce((a, j) => a + (j.print_duration || 0), 0) / done.length : 0;
      q(".pb-hcnums").textContent = `${all.length} prints · ${all.length ? Math.round(done.length / all.length * 100) : 0}% finished · average finished print ${avg ? fmtDur(avg) : "—"}`;
      c1.resize(); c2.resize();
    };
    // ---- CSV export: every job, not just the ones loaded ----
    q("[data-a=csv]").onclick = async () => {
      const id = pageId; if (id === null) return;
      msg.textContent = "Collecting the history…";
      try {
        const all = await fetchAll(id);
        const cell = v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const iso = t => t ? new Date(t * 1000).toISOString() : "";
        const csv = [["file", "result", "started", "ended", "print_seconds", "filament_mm", "note"].join(","),
          ...all.map(j => [j.filename, j.status, iso(j.start_time), iso(j.end_time), Math.round(j.print_duration || 0), Math.round(j.filament_used || 0), notes[j.id] || ""].map(cell).join(","))].join("\n");
        const a = PB.el("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = `${(PB.current()?.name || "printer").replace(/[^\w-]+/g, "_")}-history.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        draw();
      } catch (e) { msg.textContent = e.message; }
    };
    // ---- maintenance reminders: due after N print hours, metres of filament or days since last done ----
    const nowTotals = () => ({ at: Date.now() / 1000, hours: (totals.total_print_time || 0) / 3600, fil: (totals.total_filament_used || 0) / 1000 });
    function status(m) {
      const n = nowTotals(), l = m.last || n, parts = [];
      if (m.hours) parts.push([(n.hours - l.hours) / m.hours, `${(n.hours - l.hours).toFixed(1)} / ${m.hours} h`]);
      if (m.fil) parts.push([(n.fil - l.fil) / m.fil, `${Math.round(n.fil - l.fil)} / ${m.fil} m`]);
      if (m.days) parts.push([(n.at - l.at) / 86400 / m.days, `${Math.floor((n.at - l.at) / 86400)} / ${m.days} days`]);
      const worst = parts.reduce((a, b) => (b[0] > a[0] ? b : a), [0, ""]);
      return { frac: worst[0], text: parts.map(p => p[1]).join(" · ") || "no reminder set" };
    }
    function drawMaint() {
      const box = q(".pb-maint");
      if (!cfg.maint || !maint.length) { box.innerHTML = ""; return; }
      box.innerHTML = maint.map((m, i) => { const st = status(m), due = st.frac >= 1;
        return `<div class="pb-mrow${due ? " due" : ""}"><span class="pb-mname">${due ? "⚠ " : "🔧 "}${esc(m.name)}</span>
          <span class="pb-mbar"><i style="width:${Math.min(100, Math.round(st.frac * 100))}%"></i></span><span class="pb-muted pb-mtext">${esc(st.text)}</span>
          <button type="button" data-done="${i}" title="Mark as done now (starts counting again)">Done</button></div>`; }).join("");
      for (const b of box.querySelectorAll("[data-done]")) b.onclick = async () => { maint[+b.dataset.done].last = nowTotals(); drawMaint(); saveMaint(); };
    }
    const saveMaint = () => PB.kv.set("maintenance", maint).catch(e => toast(`Couldn't save: ${e.message}`));
    q("[data-a=maint]").onclick = () => {
      let list = maint.map(m => ({ ...m }));
      const read = () => { list = [...dlg.querySelectorAll(".pb-prow")].map((r, i) => ({ ...list[i], name: r.querySelector("[data-k=name]").value.trim() || "Maintenance",
        hours: +r.querySelector("[data-k=hours]").value || 0, fil: +r.querySelector("[data-k=fil]").value || 0, days: +r.querySelector("[data-k=days]").value || 0 })); };
      const render = () => {
        dlg.innerHTML = `<h3>Maintenance reminders</h3><p class="pb-muted">Remind me after this much printing since it was last done (0 = off). Shown at the top of History.</p>
          <div class="pb-plist">${list.map((m, i) => `<div class="pb-prow" data-i="${i}"><div class="pb-prowtop"><input data-k="name" value="${esc(m.name)}" placeholder="e.g. Lube the Z rods">
              <button type="button" data-del aria-label="Delete">✕</button></div><div class="pb-ptemps">
              <label>every <input type="number" min="0" data-k="hours" value="${m.hours || ""}"> print hours</label>
              <label><input type="number" min="0" data-k="fil" value="${m.fil || ""}"> m filament</label><label><input type="number" min="0" data-k="days" value="${m.days || ""}"> days</label></div></div>`).join("") || `<p class="pb-muted">None yet.</p>`}</div>
          <div class="bd-libfoot"><button type="button" data-a="add">+ Add</button><span class="bd-sp"></span><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="ok">Save</button></div>`;
        for (const b of dlg.querySelectorAll("[data-del]")) b.onclick = () => { read(); list.splice(+b.closest(".pb-prow").dataset.i, 1); render(); };
        dlg.querySelector("[data-a=add]").onclick = () => { read(); list.push({ name: "", hours: 200, fil: 0, days: 0, last: nowTotals() }); render(); };
        dlg.querySelector("[data-a=no]").onclick = () => dlg.close();
        dlg.querySelector("[data-a=ok]").onclick = () => { read(); maint = list.map(m => ({ ...m, last: m.last || nowTotals() })).slice(0, 30); dlg.close(); drawMaint(); saveMaint(); };
      };
      render(); dlg.showModal();
    };
    return {
      open() { allJobs = null; q(".pb-hcharts").hidden = true; q("[data-a=charts]").setAttribute("aria-pressed", false); loaded = false; jobs = []; notes = {}; maint = []; totals = {}; list.innerHTML = ""; msg.textContent = ""; q(".pb-totals").textContent = ""; q(".pb-maint").innerHTML = ""; },
      shown() { if (!loaded) load(true); },
      update(p) {
        const b = p.state === "printing" || p.state === "paused";
        if (b !== busy) { busy = b; for (const x of list.querySelectorAll("[data-print]")) x.disabled = busy; }
      },
      destroy() { dlg.remove(); c1?.dispose(); c2?.dispose(); },
    };
  },
});
