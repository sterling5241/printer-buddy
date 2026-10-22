PB.parts = PB.parts || {};
PB.parts.historyDetails = c => {
    async function details(jid) {
      const j = c.jobs.find(x => String(x.id) === String(jid)); if (!j) return;
      c.dlg.innerHTML = `<h3>${esc(j.filename)}</h3><dl class="pb-kv pb-hkv"><dt>Result</dt><dd>${esc((RESULT[j.status] || [j.status])[0] || "—")}</dd>
          <dt>Started</dt><dd>${fmtDate(j.start_time)}</dd><dt>Ended</dt><dd>${j.end_time ? fmtDate(j.end_time) : "—"}</dd>
          <dt>Printing time</dt><dd>${j.print_duration ? fmtDur(j.print_duration) : "—"}</dd><dt>Filament</dt><dd>${fmtFil(j.filament_used)}</dd></dl>
        <dl class="pb-kv pb-hkv pb-hmore"></dl>
        <label class="bd-field">Note<textarea rows="3" class="pb-code" placeholder="e.g. first layer too high, used the textured sheet">${esc(c.notes[j.id] || "")}</textarea></label>
        <div class="bd-libfoot">${j.exists ? `<button type="button" data-a="re">Reprint</button>` : ""}<span class="bd-sp"></span>
          <button type="button" data-a="no">Close</button><button type="button" class="bd-primary" data-a="ok">Save note</button></div>`;
      c.dlg.querySelector("[data-a=no]").onclick = () => c.dlg.close();
      c.dlg.querySelector("[data-a=re]")?.addEventListener("click", () => { c.dlg.close(); PB.printFile(j.filename); });
      c.dlg.querySelector("[data-a=ok]").onclick = async () => {
        const v = c.dlg.querySelector("textarea").value.trim(); if (v) c.notes[j.id] = v.slice(0, 2000); else delete c.notes[j.id];
        c.dlg.close(); c.draw();
        try { await PB.kv.set("notes", c.notes); } catch (e) { toast(`Couldn't save the note: ${e.message}`); }
      };
      c.dlg.showModal();
      try {
        const r = await PB.rpc("server.history.get_job", { uid: String(j.id) }), m = r?.job?.metadata || {};
        const rows = [["Slicer", [m.slicer, m.slicer_version].filter(Boolean).join(" ")], ["Estimated", m.estimated_time && fmtDur(m.estimated_time)],
          ["Total time", r?.job?.total_duration && fmtDur(r.job.total_duration)], ["Layer height", m.layer_height && `${m.layer_height} mm`],
          ["Filament type", m.filament_type], ["Filament (sliced)", m.filament_total && fmtFil(m.filament_total)], ["Nozzle", m.nozzle_diameter && `${m.nozzle_diameter} mm`],
          ["Temps", [m.first_layer_extr_temp && `nozzle ${m.first_layer_extr_temp}°`, m.first_layer_bed_temp && `bed ${m.first_layer_bed_temp}°`].filter(Boolean).join(", ")]].filter(([, v]) => v);
        c.dlg.querySelector(".pb-hmore").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join("");
      } catch {}
    }
  return { details };
};
