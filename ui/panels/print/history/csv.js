PB.parts = PB.parts || {};
PB.parts.historyCsv = c => {
    c.q("[data-a=csv]").onclick = async () => {
      const id = pageId; if (id === null) return;
      c.msg.textContent = "Collecting the history…";
      try {
        const all = await c.fetchAll(id);
        const cell = v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const iso = t => t ? new Date(t * 1000).toISOString() : "";
        const csv = [["file", "result", "started", "ended", "print_seconds", "filament_mm", "note"].join(","),
          ...all.map(j => [j.filename, j.status, iso(j.start_time), iso(j.end_time), Math.round(j.print_duration || 0), Math.round(j.filament_used || 0), c.notes[j.id] || ""].map(cell).join(","))].join("\n");
        const a = PB.el("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = `${(PB.current()?.name || "printer").replace(/[^\w-]+/g, "_")}-history.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        c.draw();
      } catch (e) { c.msg.textContent = e.message; }
    };
  return {};
};
