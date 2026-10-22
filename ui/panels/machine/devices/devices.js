PB.panel("devices", {
  title: "Devices", desc: "Serial, USB, CAN and camera IDs to paste into your config", cls: "adv",
  icon: PB.icon('<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-tool"><span class="bd-seg pb-dtabs"><button type="button" data-t="serial" aria-pressed="true">Serial</button>
        <button type="button" data-t="usb">USB</button><button type="button" data-t="can">CAN</button><button type="button" data-t="video">Cameras</button></span>
        <span class="bd-sp"></span><input class="pb-canif" value="can0" aria-label="CAN interface" title="CAN interface" hidden>
        <button type="button" data-a="scan" data-head title="Scan again" aria-label="Scan again">${PB.ic.refresh}</button></div><div class="pb-msg pb-muted"></div><div class="pb-list"></div>`;
    const q = s => host.querySelector(s), list = q(".pb-list"), msg = q(".pb-msg");
    let tab = "serial", busy = false;
    const copy = async t => { try { await navigator.clipboard.writeText(t); toast("Copied"); } catch { prompt("Copy this:", t); } };
    const row = (title, sub, value) => `<div class="pb-li"><div class="pb-lmain"><div class="pb-lname pb-mono">${esc(value || title)}</div>
        <div class="pb-lsub">${esc([value ? title : "", ...sub].filter(Boolean).join(" · "))}</div></div>
        ${value ? `<div class="pb-lbtn"><button type="button" data-copy="${esc(value)}">Copy</button></div>` : ""}</div>`;
    async function scan() {
      if (busy || pageId === null) return;
      busy = true; list.innerHTML = ""; msg.textContent = tab === "can" ? "Asking the CAN bus (only unconfigured boards answer)…" : "Looking…";
      try {
        let rows = [];
        if (tab === "serial") {
          const r = await PB.rpc("machine.peripherals.serial");
          rows = (r?.serial_devices || []).map(d => row(d.device_path, [d.device_type, d.driver_name, d.path_by_hardware && `by-path: ${d.path_by_hardware}`], d.path_by_id || d.device_path));
        } else if (tab === "usb") {
          const r = await PB.rpc("machine.peripherals.usb");
          rows = (r?.usb_devices || []).map(d => row([d.manufacturer, d.product].filter(Boolean).join(" ") || "USB device",
            [`${d.vendor_id}:${d.product_id}`, d.serial_number && `serial ${d.serial_number}`, d.class], `${d.vendor_id}:${d.product_id}`));
        } else if (tab === "can") {
          const r = await PB.rpc("machine.peripherals.canbus", { interface: q(".pb-canif").value.trim() || "can0" });
          rows = (r?.can_uuids || []).map(d => row(d.application || "CAN node", [], d.uuid));
        } else {
          const r = await PB.rpc("machine.peripherals.video");
          rows = [...(r?.v4l2_devices || []).map(d => row(d.camera_name || d.device_name, [d.driver_name, d.hardware_bus, (d.capabilities || []).slice(0, 3).join(", ")], d.device_path)),
                  ...(r?.libcamera_devices || []).map(d => row(d.model || "libcamera", ["libcamera"], d.libcamera_id))];
        }
        msg.textContent = rows.length ? `${rows.length} found` : tab === "can" ? "No unconfigured CAN boards answered (boards already in your config don't show)." : "Nothing found.";
        list.innerHTML = rows.join("");
        for (const b of list.querySelectorAll("[data-copy]")) b.onclick = () => copy(b.dataset.copy);
      } catch (e) { msg.textContent = /not found|method/i.test(e.message) ? "This printer's Moonraker is too old for device lookup." : e.message; }
      busy = false;
    }
    for (const b of host.querySelectorAll("[data-t]")) b.onclick = () => {
      tab = b.dataset.t; for (const x of host.querySelectorAll("[data-t]")) x.setAttribute("aria-pressed", x === b);
      q(".pb-canif").hidden = tab !== "can"; scan();
    };
    q("[data-a=scan]").onclick = scan;
    let done = false;
    return {
      open() { done = false; list.innerHTML = ""; msg.textContent = ""; },
      shown() { if (!done) { done = true; scan(); } },
    };
  },
});
