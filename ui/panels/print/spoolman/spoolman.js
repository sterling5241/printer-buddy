PB.panel("spoolman", {
  title: "Spools", desc: "Active filament spool (Spoolman)", cls: "adv",
  icon: PB.icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-tool"><span class="pb-msg pb-muted"></span><span class="bd-sp"></span><button type="button" data-a="ref" data-head title="Refresh" aria-label="Refresh">${PB.ic.refresh}</button></div>
      <div class="pb-spool"></div><div class="pb-sub-h">Other spools</div><input type="search" class="pb-sfind" placeholder="Search spools…" aria-label="Search spools"><div class="pb-list"></div>`;
    const q = s => host.querySelector(s), list = q(".pb-list"), msg = q(".pb-msg");
    let spools = [], active = null, loaded = false;
    const name = s => [s.filament?.vendor?.name, s.filament?.name].filter(Boolean).join(" ") || `Spool ${s.id}`;
    const left = s => s.remaining_weight != null ? `${Math.round(s.remaining_weight)} g left` : s.remaining_length != null ? `${(s.remaining_length / 1000).toFixed(1)} m left` : "";
    const sw = s => `<span class="pb-swatch" style="background:#${esc(s.filament?.color_hex || "555")}"></span>`;
    async function load() {
      if (pageId === null) return;
      loaded = true; msg.textContent = "Loading…";
      try {
        const st = await PB.rpc("server.spoolman.status");
        if (!st?.spoolman_connected) { msg.textContent = "Spoolman isn't connected (check [spoolman] in moonraker.conf)."; q(".pb-spool").innerHTML = ""; list.innerHTML = ""; return; }
        active = st.spool_id ?? (await PB.rpc("server.spoolman.get_spool_id"))?.spool_id ?? null;
        const r = await PB.rpc("server.spoolman.proxy", { request_method: "GET", path: "/v1/spool", use_v2_response: true });
        spools = (Array.isArray(r) ? r : r?.response || []).filter(s => !s.archived);
        draw();
      } catch (e) { msg.textContent = e.message.includes("not found") ? "Spoolman isn't set up in moonraker.conf." : e.message; }
    }
    function draw() {
      const a = spools.find(s => s.id === active), term = q(".pb-sfind").value.trim().toLowerCase();
      msg.textContent = `${spools.length} spools`;
      q(".pb-spool").innerHTML = a ? `<div class="pb-li">${sw(a)}<div class="pb-lmain"><div class="pb-lname">${esc(name(a))}</div>
          <div class="pb-lsub">${esc(a.filament?.material || "")} · ${left(a)}</div></div><div class="pb-lbtn"><button type="button" data-clear>Clear</button></div></div>`
        : `<p class="pb-muted">No active spool.</p>`;
      list.innerHTML = spools.filter(s => s.id !== active && (!term || name(s).toLowerCase().includes(term) || (s.filament?.material || "").toLowerCase().includes(term)))
        .slice(0, 50).map(s => `<div class="pb-li">${sw(s)}<div class="pb-lmain"><div class="pb-lname">${esc(name(s))}</div>
          <div class="pb-lsub">#${s.id} · ${esc(s.filament?.material || "")} · ${left(s)}</div></div>
          <div class="pb-lbtn"><button type="button" data-use="${s.id}">Use</button></div></div>`).join("");
      q("[data-clear]")?.addEventListener("click", () => set(null));
      for (const b of list.querySelectorAll("[data-use]")) b.onclick = () => set(+b.dataset.use);
    }
    async function set(id) {
      try { await PB.rpc("server.spoolman.post_spool_id", { spool_id: id }); active = id; draw(); toast(id ? `Spool #${id} active` : "No active spool"); }
      catch (e) { toast(e.message); }
    }
    q(".pb-sfind").oninput = draw;
    q("[data-a=ref]").onclick = load;
    return { open() { loaded = false; spools = []; }, shown() { if (!loaded) load(); } };
  },
});
