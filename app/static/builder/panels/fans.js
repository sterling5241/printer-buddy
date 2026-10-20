// Fans & outputs panel: fan speeds, output pins, LED colours, and Moonraker power devices (smart plugs etc).
PB.panel("fans", {
  title: "Fans & outputs", desc: "Fan speeds, pins, LEDs and power devices", cls: "adv",
  icon: PB.icon('<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 2 3 0 5M14 12c4 0 7 1 7 4 0 2-3 2-5 0M12 14c0 4-1 7-4 7-2 0-2-3 0-5M10 12c-4 0-7-1-7-4 0-2 3-2 5 0"/>'),
  settings: [{ k: "power", label: "Show power devices", type: "check", def: true }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-ctl"></div><div class="pb-pow"></div>`;
    const ctl = host.querySelector(".pb-ctl"), pow = host.querySelector(".pb-pow");
    let key = "", busy = new Set();
    const fanName = id => id.split(" ").slice(1).join(" ");
    const settable = f => f.id === "fan" || f.id.startsWith("fan_generic ");
    function setFan(id, pct) {
      if (id === "fan") gcode(`M106 S${Math.round(pct * 2.55)}`);
      else gcode(`SET_FAN_SPEED FAN=${fanName(id)} SPEED=${(pct / 100).toFixed(2)}`);
    }
    function build(p) {
      const fans = (p.sensors || []).filter(s => s.kind === "fan"), outs = p.outputs || [];
      ctl.innerHTML = fans.map(f => `<label class="pb-speed" data-id="${esc(f.id)}"><span class="pb-lab">${esc(f.name)}</span>
          ${settable(f) ? `<input type="range" min="0" max="100" step="1">` : `<span class="pb-bar"><i></i></span>`}<output></output></label>`).join("")
        + outs.map(o => o.kind === "pin" ? `<label class="pb-speed" data-id="${esc(o.id)}"><span class="pb-lab">${esc(o.name)}</span>
          <input type="range" min="0" max="100" step="1"><output></output></label>`
          : `<label class="pb-speed" data-id="${esc(o.id)}"><span class="pb-lab">${esc(o.name)}</span><input type="color"><output></output></label>`).join("")
        || `<p class="pb-muted">No fans or outputs found.</p>`;
      for (const row of ctl.querySelectorAll("[data-id]")) {
        const id = row.dataset.id, r = row.querySelector("input[type=range]"), c = row.querySelector("input[type=color]");
        if (r) {
          r.oninput = () => { busy.add(id); row.querySelector("output").textContent = `${r.value}%`; };
          r.onchange = () => {
            busy.delete(id);
            if (id.startsWith("output_pin ")) gcode(`SET_PIN PIN=${fanName(id)} VALUE=${(r.value / 100).toFixed(2)}`); else setFan(id, +r.value);
          };
        }
        if (c) c.onchange = () => {
          const v = [1, 3, 5].map(i => (parseInt(c.value.slice(i, i + 2), 16) / 255).toFixed(3));
          gcode(`SET_LED LED=${fanName(id)} RED=${v[0]} GREEN=${v[1]} BLUE=${v[2]}`);
        };
      }
    }
    async function loadPower() {
      if (!cfg.power) return;
      try {
        const r = await PB.rpc("machine.device_power.devices");
        const devs = r?.devices || [];
        pow.innerHTML = devs.length ? `<div class="pb-sub-h">Power</div>` + devs.map(d => `<div class="pb-li"><div class="pb-lmain"><div class="pb-lname">${esc(d.device)}</div>
            <div class="pb-lsub">${esc(d.status)}${d.locked_while_printing ? " · locked while printing" : ""}</div></div>
            <div class="pb-lbtn"><button type="button" data-dev="${esc(d.device)}" data-act="${d.status === "on" ? "off" : "on"}">${d.status === "on" ? "Turn off" : "Turn on"}</button></div></div>`).join("") : "";
        for (const b of pow.querySelectorAll("[data-dev]")) b.onclick = async () => {
          if (!confirm(`Turn ${b.dataset.act} ${b.dataset.dev}?`)) return;
          try { await PB.rpc("machine.device_power.post_device", { device: b.dataset.dev, action: b.dataset.act }); loadPower(); }
          catch (e) { toast(e.message); }
        };
      } catch { pow.innerHTML = ""; }   // no [power] devices set up in moonraker.conf
    }
    return {
      open() { key = ""; },
      shown: loadPower,
      update(p) {
        const fans = (p.sensors || []).filter(s => s.kind === "fan"), outs = p.outputs || [];
        const k = fans.map(f => f.id).concat(outs.map(o => o.id)).join("|");
        if (k !== key) { key = k; build(p); }
        const live = p.connection === "online" && p.klippy_state === "ready";
        for (const f of fans) {
          const row = ctl.querySelector(`[data-id="${CSS.escape(f.id)}"]`); if (!row || busy.has(f.id)) continue;
          const pct = Math.round((f.speed || 0) * 100);
          row.querySelector("output").textContent = live ? `${pct}%` : "—";
          const r = row.querySelector("input[type=range]"); if (r) { r.value = pct; r.disabled = !live; }
          const bar = row.querySelector(".pb-bar i"); if (bar) bar.style.width = `${pct}%`;
        }
        for (const o of outs) {
          const row = ctl.querySelector(`[data-id="${CSS.escape(o.id)}"]`); if (!row || busy.has(o.id)) continue;
          if (o.kind === "pin") { const pct = Math.round((o.value || 0) * 100); row.querySelector("output").textContent = `${pct}%`; const r = row.querySelector("input"); r.value = pct; r.disabled = !live; }
          else { const c = row.querySelector("input"); if (document.activeElement !== c) c.value = "#" + o.color.slice(0, 3).map(x => Math.round((x || 0) * 255).toString(16).padStart(2, "0")).join(""); c.disabled = !live; }
        }
      },
    };
  },
});
