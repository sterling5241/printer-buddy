// Machine panel: host load / temperature / memory / disk, restart Klipper / Moonraker, reboot or shut down, logs.
PB.panel("machine", {
  title: "Machine", desc: "Host load, restarts, reboot and logs", cls: "adv",
  icon: PB.icon('<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  create(host) {
    host.innerHTML = `<dl class="pb-kv pb-mach"></dl>
      <div class="pb-sub-h">Restart</div>
      <div class="pb-row"><button type="button" data-r="klipper">Klipper</button><button type="button" data-r="firmware">Firmware</button><button type="button" data-r="moonraker">Moonraker</button></div>
      <div class="pb-row"><button type="button" data-r="reboot">Reboot host</button><button type="button" data-r="shutdown">Shut down host</button></div>
      <div class="pb-sub-h">Logs</div>
      <div class="pb-row"><a class="pb-dl pb-dlw" data-log="klippy.log">⬇ klippy.log</a><a class="pb-dl pb-dlw" data-log="moonraker.log">⬇ moonraker.log</a></div>`;
    const kv = host.querySelector(".pb-mach");
    let timer = null, busy = false;
    const gb = b => b == null ? "—" : `${(b / 1073741824).toFixed(1)} GB`;
    async function load() {
      if (pageId === null || !host.offsetParent) return;
      try {
        const [st, dir] = await Promise.all([PB.rpc("machine.proc_stats"), PB.rpc("server.files.get_directory", { path: "gcodes" }).catch(() => null)]);
        const mem = st.system_memory || {}, du = dir?.disk_usage || {}, cpu = st.system_cpu_usage?.cpu;
        const rows = [["CPU", cpu != null ? `${cpu.toFixed(0)}%` : "—"], ["CPU temp", st.cpu_temp != null ? `${st.cpu_temp.toFixed(1)}°` : "—"],
          ["Memory", mem.total ? `${Math.round((mem.used ?? mem.total - mem.available) / 1024)} / ${Math.round(mem.total / 1024)} MB` : "—"],
          ["Disk free", du.free != null ? `${gb(du.free)} of ${gb(du.total)}` : "—"],
          ["Up", st.system_uptime ? fmtDur(st.system_uptime) : "—"], ["Moonraker", st.moonraker_stats?.length ? `${st.moonraker_stats.at(-1).cpu_usage?.toFixed(0)}% · ${Math.round((st.moonraker_stats.at(-1).memory || 0) / 1024)} MB` : "—"]];
        kv.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      } catch (e) { kv.innerHTML = `<div><dt>Couldn't read the host</dt><dd>${esc(e.message)}</dd></div>`; }
    }
    const ACT = {
      klipper: ["Restart Klipper?", "printer.restart"], firmware: ["Firmware restart (MCU reset)?", "printer.firmware_restart"],
      moonraker: ["Restart Moonraker?", "machine.services.restart", { service: "moonraker" }],
      reboot: ["Reboot the printer's computer? It goes offline for a minute.", "machine.reboot"],
      shutdown: ["Shut down the printer's computer? You'll need to power it on by hand.", "machine.shutdown"],
    };
    for (const b of host.querySelectorAll("[data-r]")) b.onclick = async () => {
      const [text, method, params] = ACT[b.dataset.r];
      if (busy && !confirm("A print is running. Really?")) return;
      if (!confirm(text)) return;
      try { await PB.rpc(method, params); toast("Done"); } catch (e) { toast(e.message); }
    };
    return {
      open() { for (const a of host.querySelectorAll("[data-log]")) a.href = PB.fileUrl("logs", a.dataset.log, true); },
      shown() { load(); clearInterval(timer); timer = setInterval(load, 5000); },
      update(p) {
        busy = p.state === "printing" || p.state === "paused";
        for (const b of host.querySelectorAll("button")) b.disabled = p.connection !== "online";
      },
      destroy() { clearInterval(timer); },
    };
  },
});
