(() => {
  const { el } = PB;
  const row = $(".top .row");
  $("#aiBtn").hidden = true; $("#notifyBtn").hidden = true;
  const bell = el("button", "pb-bell", `${PB.ic.bell}<i hidden></i>`); bell.type = "button"; bell.title = "News and printer notices"; bell.setAttribute("aria-label", "News");
  const gear = el("button", "pb-iconbtn", `${PB.ic.cog}Settings`); gear.type = "button";
  row.insertBefore(gear, $("#homeEdit") || $("#manualBtn"));
  row.insertBefore(bell, gear);

  const read = () => new Set(PB.store.get("pb-news-read", []));
  const LEVEL = { update: "Update", important: "Important" };
  PB.news = {
    items: [],
    unread() { const r = read(); return this.items.filter(n => !r.has(n.id)); },
    html(max) {
      const r = read();
      return this.items.length ? this.items.slice(0, max).map(n => `<div class="pb-news${r.has(n.id) ? "" : " unread"}">
          <div class="pb-newshead"><b>${esc(n.title)}</b>${LEVEL[n.level] ? `<span class="pb-chip ${n.level === "important" ? "failed" : "running"}">${LEVEL[n.level]}</span>` : ""}<span class="pb-muted">${esc(n.date || "")}</span></div>
          ${n.body ? `<p>${esc(n.body)}</p>` : ""}${n.link && /^https?:\/\//.test(n.link) ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">Read more →</a>` : ""}</div>`).join("")
        : `<p class="pb-muted">No news yet.</p>`;
    },
    async load() {
      const [news, notes] = await Promise.all([api("/api/news").then(r => r.items || [], () => null), api("/api/notices").then(r => r.items || [], () => [])]);
      if (news === null && !notes.length) return;
      this.items = [...notes, ...(news || [])];
      bell.querySelector("i").hidden = !this.unread().length;
      dispatchEvent(new Event("pb-news"));
      banner();
    },
  };
  const drop = el("div", "pb-newsdrop"); drop.hidden = true; document.body.append(drop);
  bell.onclick = () => {
    if (!drop.hidden) { drop.hidden = true; return; }
    drop.innerHTML = `<div class="pb-newstop"><b>News</b><button type="button" data-a="read">Mark all read</button></div>${PB.news.html(20)}`;
    drop.querySelector("[data-a=read]").onclick = () => {
      PB.store.set("pb-news-read", PB.news.items.map(n => n.id)); bell.querySelector("i").hidden = true; drop.hidden = true; dispatchEvent(new Event("pb-news"));
    };
    const r = bell.getBoundingClientRect();
    drop.hidden = false;
    drop.style.top = `${r.bottom + 6}px`; drop.style.left = `${Math.max(8, Math.min(innerWidth - drop.offsetWidth - 8, r.right - drop.offsetWidth))}px`;
    setTimeout(() => document.addEventListener("pointerdown", function close(e) {
      if (!drop.contains(e.target) && e.target !== bell) { drop.hidden = true; document.removeEventListener("pointerdown", close); }
    }), 0);
  };
  function banner() {
    const seen = new Set(PB.store.get("pb-news-banner", []));
    const n = PB.news.items.find(x => x.level === "important" && !seen.has(x.id));
    $(".pb-banner")?.remove();
    if (!n) return;
    const b = el("div", "pb-banner", `<b>${esc(n.title)}</b> ${esc(n.body || "")} ${n.link && /^https?:\/\//.test(n.link) ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">Read more →</a>` : ""}<button type="button" aria-label="Dismiss">${PB.ic.x}</button>`);
    b.querySelector("button").onclick = () => { seen.add(n.id); PB.store.set("pb-news-banner", [...seen]); b.remove(); };
    document.body.prepend(b);
  }
  PB.news.load();
  setInterval(() => PB.news.load(), 15 * 60 * 1000);

  const panel = el("section", "panel pb-settings"); panel.hidden = true;
  panel.innerHTML = `<div class="pb-settop"><h2>Settings</h2><span class="bd-sp"></span><button type="button" data-a="close">Close</button></div>
    <div class="pb-settabs" role="tablist"><button type="button" data-tab="alerts">Alerts</button><button type="button" data-tab="ai" class="ai">AI</button>
      <button type="button" data-tab="look">Look</button><button type="button" data-tab="about">About</button></div>
    <div data-body="alerts"></div><div data-body="ai"></div>
    <div data-body="look"><label class="field">Theme <select data-a="theme"><option value="auto">Auto (follow this device)</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label class="pb-chk pb-keysopt"><input type="checkbox" data-a="keys"> Keyboard shortcuts on printer pages (press <kbd>?</kbd> for the list)</label>
      <label class="field">Clock <select data-o="pb-clock"><option value="auto">Auto (this device)</option><option value="12">12 hour (3:45 PM)</option><option value="24">24 hour (15:45)</option></select></label>
      <label class="field">"Time left" based on <select data-a="eta"><option value="file">How far through the file (default)</option><option value="slicer">The slicer's estimate</option><option value="filament">Filament used so far</option></select></label>
      <div class="pb-sub-h">Ask before</div>
      <label class="pb-chk"><input type="checkbox" data-c="pb-confirm-estop" data-def="1"> Emergency stop</label>
      <label class="pb-chk"><input type="checkbox" data-c="pb-confirm-cancel" data-def="1"> Cancelling a print</label>
      <label class="pb-chk"><input type="checkbox" data-c="pb-confirm-cool" data-def=""> Cool down (all heaters off)</label>
      <div class="pb-sub-h">Other</div>
      <label class="pb-chk"><input type="checkbox" data-c="pb-lock" data-def=""> Lock sliders on touch screens (tap once to unlock, so scrolling can't change them)</label>
      <label class="pb-chk"><input type="checkbox" data-c="pb-title" data-def="1"> Show print progress in the browser tab title</label>
      <p class="pb-muted">These are saved in this browser. "Time left" is for everyone using this box.</p></div>
    <div data-body="about"><dl class="pb-kv pb-about"></dl></div>`;
  $(".top").after(panel);
  panel.querySelector("[data-body=alerts]").append($("#notifyPanel"));
  panel.querySelector("[data-body=ai]").append($("#aiPanel"));
  const close = () => { panel.hidden = true; };
  panel.querySelector("[data-a=close]").onclick = close;
  $("#notifyClose").onclick = close; $("#aiClose").onclick = close;
  const theme = panel.querySelector("[data-a=theme]");
  theme.onchange = () => PB.setTheme(theme.value);
  const keys = panel.querySelector("[data-a=keys]");
  keys.onchange = () => PB.store.set("pb-keys", keys.checked);
  const clock = panel.querySelector("[data-o=pb-clock]");
  clock.onchange = () => { PB.store.set("pb-clock", clock.value); render(); };
  const eta = panel.querySelector("[data-a=eta]");
  eta.onchange = () => api("/api/ui/eta", { method: "PUT", body: JSON.stringify({ mode: eta.value }) }).then(() => toast("Saved"), e => toast(e.message));
  for (const c of panel.querySelectorAll("[data-c]")) c.onchange = () => PB.store.set(c.dataset.c, c.checked);
  async function tab(name) {
    for (const b of panel.querySelectorAll("[data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    for (const d of panel.querySelectorAll("[data-body]")) d.hidden = d.dataset.body !== name;
    if (name === "alerts") { $("#notifyPanel").hidden = false; try { await loadNotify(); } catch (e) { toast(e.message); } }
    if (name === "ai") { $("#aiPanel").hidden = false; await loadAI(); if (aiCfg) fillAIForm(); }
    if (name === "look") {
      theme.value = PB.store.get("pb-theme", "auto"); keys.checked = !!PB.store.get("pb-keys", false); clock.value = PB.store.get("pb-clock", "auto");
      for (const c of panel.querySelectorAll("[data-c]")) c.checked = !!PB.store.get(c.dataset.c, !!c.dataset.def);
      api("/api/ui/eta").then(r => { eta.value = r.mode; }).catch(() => {});
    }
    if (name === "about") {
      let v = {}; try { v = (await api("/api/config")).version || {}; } catch {}
      panel.querySelector(".pb-about").innerHTML = [["Version", v.commit || "?"], ["Branch", v.branch || "?"], ["Updated", v.date || "?"],
        ["Interface", isBasic() ? "Basic" : "Advanced"], ["Printers", printers.size]].map(([k, x]) => `<div><dt>${k}</dt><dd>${esc(x)}</dd></div>`).join("");
    }
  }
  for (const b of panel.querySelectorAll("[data-tab]")) b.onclick = () => tab(b.dataset.tab);
  gear.onclick = () => { if (!panel.hidden) return close(); panel.hidden = false; tab("alerts"); panel.scrollIntoView({ block: "nearest" }); };
})();
