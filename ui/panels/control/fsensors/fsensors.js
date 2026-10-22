PB.panel("fsensors", {
  title: "Filament sensors", desc: "Filament runout sensors on / off", cls: "adv",
  icon: PB.icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-list"></div>`;
    const list = host.querySelector(".pb-list");
    let key = "";
    return {
      update(p) {
        const fs = p.fsensors || [], k = JSON.stringify(fs);
        if (k === key) return;
        key = k;
        list.innerHTML = fs.length ? fs.map(f => `<div class="pb-li"><div class="pb-lmain"><div class="pb-lname">${esc(f.name)}</div></div>
            <span class="pb-chip ${!f.enabled ? "" : f.detected ? "done" : "failed"}">${!f.enabled ? "Off" : f.detected ? "Filament in" : "Runout"}</span>
            <div class="pb-lbtn"><button type="button" data-s="${esc(f.id.split(" ").slice(1).join(" "))}" data-on="${f.enabled ? 0 : 1}">${f.enabled ? "Turn off" : "Turn on"}</button></div></div>`).join("")
          : `<p class="pb-muted">No filament sensors in printer.cfg.</p>`;
        for (const b of list.querySelectorAll("[data-s]")) b.onclick = () => gcode(`SET_FILAMENT_SENSOR SENSOR=${b.dataset.s} ENABLE=${b.dataset.on}`);
      },
    };
  },
});
