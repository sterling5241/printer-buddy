PB.panel("updates", {
  title: "Updates", desc: "Update Klipper, Moonraker and more", cls: "adv",
  icon: PB.icon('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-tool"><span class="pb-msg pb-muted"></span><span class="bd-sp"></span>
      <button type="button" data-a="check">Check</button><button type="button" class="pb-pri" data-a="all" hidden>Update all</button></div><div class="pb-list"></div>`;
    const q = s => host.querySelector(s), list = q(".pb-list"), msg = q(".pb-msg");
    let printing = false, working = false;
    const LEGACY = { klipper: "machine.update.klipper", moonraker: "machine.update.moonraker", system: "machine.update.system" };
    async function load(refresh) {
      if (pageId === null) return;
      msg.textContent = refresh ? "Checking for updates…" : "Loading…";
      try {
        if (refresh) await PB.rpc("machine.update.refresh").catch(() => PB.rpc("machine.update.status", { refresh: true }));
        draw(await PB.rpc("machine.update.status"));
      } catch (e) { msg.textContent = e.message.includes("not found") ? "The update manager isn't set up in moonraker.conf." : e.message; list.innerHTML = ""; }
    }
    function draw(st) {
      const vi = st?.version_info || {}, rows = [];
      for (const [name, v] of Object.entries(vi)) {
        if (name === "system") { rows.push({ name, label: "System packages", cur: "", next: v.package_count ? `${v.package_count} updates` : "", out: !!v.package_count }); continue; }
        const cur = v.version || v.full_version_string || "?", next = v.remote_version || "?";
        const out = v.is_valid !== false && ((v.commits_behind?.length || 0) > 0 || (next !== "?" && cur !== next));
        rows.push({ name, label: name, cur, next: out ? next : "", out, bad: v.is_valid === false || v.is_dirty, info: v.is_dirty ? "local changes" : v.is_valid === false ? "invalid" : "" });
      }
      const n = rows.filter(r => r.out).length;
      msg.textContent = st?.busy ? "An update is running…" : n ? `${n} update${n > 1 ? "s" : ""} available` : "Everything is up to date.";
      q("[data-a=all]").hidden = !n;
      list.innerHTML = rows.map(r => `<div class="pb-li"><div class="pb-lmain"><div class="pb-lname">${esc(r.label)}</div>
          <div class="pb-lsub">${esc(r.cur)}${r.next ? ` → ${esc(r.next)}` : ""}${r.info ? ` · ${esc(r.info)}` : ""}</div></div>
          ${r.out ? `<div class="pb-lbtn"><button type="button" data-up="${esc(r.name)}">Update</button></div>` : `<span class="pb-chip ${r.bad ? "failed" : "done"}">${r.bad ? "Check" : "Up to date"}</span>`}</div>`).join("");
      for (const b of list.querySelectorAll("[data-up]")) b.onclick = () => run(b.dataset.up);
      setBusy();
    }
    function setBusy() { for (const b of host.querySelectorAll("button")) b.disabled = working || printing; }
    async function run(name) {
      if (!confirm(name ? `Update ${name}? It can take several minutes and may restart services.` : "Update everything? This can take a long time.")) return;
      working = true; setBusy(); msg.textContent = `Updating ${name || "everything"}… keep this page open.`;
      try {
        if (!name) await PB.rpc("machine.update.full");
        else await PB.rpc("machine.update.upgrade", { name }).catch(e => {
          if (!e.message.toLowerCase().includes("not found")) throw e;
          return LEGACY[name] ? PB.rpc(LEGACY[name]) : PB.rpc("machine.update.client", { name });
        });
        toast(`Updated ${name || "everything"}`);
      } catch (e) { toast(`Update failed: ${e.message}`); }
      working = false; load(false);
    }
    q("[data-a=check]").onclick = () => load(true);
    q("[data-a=all]").onclick = () => run(null);
    return {
      open() { list.innerHTML = ""; msg.textContent = ""; },
      shown() { if (!list.children.length) load(false); },
      update(p) { const b = p.state === "printing" || p.state === "paused"; if (b !== printing) { printing = b; setBusy(); } },
    };
  },
});
