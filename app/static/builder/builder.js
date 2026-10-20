// Printer Buddy - dashboard builder: tabs -> rows (pick a column split) -> columns -> panels.
// Edit layout: drag panels by their handle (mouse or touch), hide / show, settings, rows + tabs, a separate phone order.
// Saved on the box (/api/ui/layout). New boxes and "Reset to base layout" get DEFAULT (every panel in a sensible place).
(() => {
  const { el, icon } = PB;
  const page = $("#page");
  const SPLITS = { "1": [1], "1-1": [1, 1], "1-2": [1, 2], "2-1": [2, 1], "1-1-1": [1, 1, 1], "1-1-1-1": [1, 1, 1, 1] };
  const SPLIT_NAMES = { "1": "1 column", "1-1": "½ + ½", "1-2": "⅓ + ⅔", "2-1": "⅔ + ⅓", "1-1-1": "⅓ ×3", "1-1-1-1": "¼ ×4" };
  const GRID = icon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>');
  const rid = () => Math.random().toString(36).slice(2, 9);
  const phone = matchMedia("(max-width: 760px)");   // phones: one column per tab, in the tab's own phone order
  // the base layout (Mainsail / Fluidd style): every panel has a home. Items: { id, t: panel type, o: settings }
  const P = (tab, t, o) => ({ id: `${tab}-${t}`, t, o: o || {} });
  const DEFAULT = { v: 2, tabs: [
    { id: "dash", name: "Dashboard", rows: [{ s: "1-1-1", cols: [
        [P("dash", "status"), P("dash", "camera"), P("dash", "ai"), P("dash", "exclude")],
        [P("dash", "toolhead"), P("dash", "zoffset"), P("dash", "extruder"), P("dash", "macros")],
        [P("dash", "thermals"), P("dash", "fans"), P("dash", "console")]] }],
      phone: ["status", "camera", "thermals", "toolhead", "zoffset", "extruder", "fans", "macros", "exclude", "ai", "console"].map(t => `dash-${t}`) },
    { id: "jobs", name: "Jobs", rows: [{ s: "2-1", cols: [[P("jobs", "files")], [P("jobs", "queue")]] },
                                      { s: "1", cols: [[P("jobs", "gcodeview")]] }] },
    { id: "history", name: "History", rows: [{ s: "1", cols: [[P("history", "history")]] }] },
    { id: "tuning", name: "Tuning", rows: [{ s: "2-1", cols: [[P("tuning", "bedmesh")], [P("tuning", "actions"), P("tuning", "limits"), P("tuning", "fsensors")]] }] },
    { id: "console", name: "Console", rows: [{ s: "2-1", cols: [[P("console", "console", { height: 320 })], [P("console", "macros")]] }] },
    { id: "timelapse", name: "Timelapses", rows: [{ s: "1", cols: [[P("timelapse", "timelapse")]] }] },
    { id: "machine", name: "Machine", rows: [{ s: "1-1-1", cols: [[P("machine", "machine")], [P("machine", "updates")], [P("machine", "spoolman")]] },
                                            { s: "1", cols: [[P("machine", "config", { height: 640 })]] }] },
  ] };

  // ---- shell: top bar + rail + main ------------------------------------------------------
  const head = page.querySelector(".pg-head");
  const top = el("div", "bd-top"), actions = el("div", "bd-actions");
  const editBtn = el("button", "adv bd-ghost", "Edit layout"); editBtn.type = "button";
  // theme: auto (follow the computer) -> light -> dark, remembered in this browser
  const themeBtn = el("button", "bd-theme"); themeBtn.type = "button";
  const THEMES = ["auto", "light", "dark"], dark = matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = () => {
    const t = PB.store.get("pb-theme", "auto");
    document.documentElement.dataset.theme = t === "auto" ? (dark.matches ? "dark" : "light") : t;
    themeBtn.textContent = t === "auto" ? "◐" : t === "light" ? "☀" : "☾";
    themeBtn.title = `Theme: ${t} (click to change)`;
  };
  themeBtn.onclick = () => { const t = PB.store.get("pb-theme", "auto"); PB.store.set("pb-theme", THEMES[(THEMES.indexOf(t) + 1) % 3]); applyTheme(); };
  dark.addEventListener("change", applyTheme);
  applyTheme();
  actions.append(themeBtn, editBtn, $("#pgPause"), $("#pgCancel"), $("#pgStop"));
  top.append(head.querySelector(".pg-back"), $("#pgName"), $("#pgTag"), el("span", "bd-sp"), actions);
  head.replaceWith(top);
  page.querySelector(".pg-tabs").hidden = true;
  for (const id of ["pgStatus", "pgControl", "pgConsole"]) $("#" + id).hidden = true;
  const wrap = el("div", "bd-wrap"), rail = el("nav", "bd-rail"), main = el("div", "bd-main");
  rail.setAttribute("aria-label", "Tabs");
  wrap.append(rail, main);
  page.append(wrap);
  page.classList.add("bd");

  // ---- layout state -------------------------------------------------------------------------
  let layout = null, active = PB.store.get("pb-tab", "dash"), saveTimer = null;
  const insts = new Map();   // tab id -> [panel instances]
  const clean = l => {
    if (!l || !Array.isArray(l.tabs) || !l.tabs.length) return null;
    l.tabs = l.tabs.filter(t => t && t.id && Array.isArray(t.rows)).map(t => ({
      id: String(t.id), name: String(t.name || "Tab"),
      rows: t.rows.filter(r => r && SPLITS[r.s] && Array.isArray(r.cols)).map(r => ({
        s: r.s, cols: SPLITS[r.s].map((_, i) => (r.cols[i] || []).filter(it => it && typeof it.t === "string")
          .map(it => ({ id: String(it.id || rid()), t: it.t, c: !!it.c, h: !!it.h, o: it.o && typeof it.o === "object" && !Array.isArray(it.o) ? it.o : {} }))),
      })),
      phone: Array.isArray(t.phone) ? t.phone.map(String) : [],
    }));
    return l.tabs.length ? l : null;
  };
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api("/api/ui/layout", { method: "PUT", body: JSON.stringify({ layout }) })
      .catch(e => toast(`Couldn't save the layout: ${e.message}`)), 500);
  };
  const changed = () => { save(); build(); };
  const used = t => layout.tabs.some(tab => tab.rows.some(r => r.cols.some(c => c.some(it => it.t === t))));
  const tabOf = () => layout.tabs.find(t => t.id === active) || layout.tabs[0];
  const fresh = () => clean(structuredClone(DEFAULT));
  layout = fresh();
  const items = tab => tab.rows.flatMap(r => r.cols.flat());
  const phoneItems = tab => {   // the tab's phone order; panels added since go at the end in desktop order
    const all = items(tab), seen = new Set(tab.phone);
    return [...tab.phone.map(id => all.find(i => i.id === id)).filter(Boolean), ...all.filter(i => !seen.has(i.id))];
  };
  const removeItem = (tab, item) => {
    for (const r of tab.rows) for (const c of r.cols) { const i = c.indexOf(item); if (i >= 0) c.splice(i, 1); }
    tab.phone = tab.phone.filter(id => id !== item.id);
  };

  // ---- building ---------------------------------------------------------------------------------
  let preview = false;   // edit mode on a computer: "Phone" previews + edits the phone order
  const editing = () => page.classList.contains("bd-editing");
  const phoneView = () => phone.matches || (editing() && preview);

  function build() {
    for (const list of insts.values()) list.forEach(PB.unmount);
    insts.clear();
    if (!layout.tabs.some(t => t.id === active)) active = layout.tabs[0].id;
    page.classList.toggle("bd-preview", editing() && preview && !phone.matches);

    rail.replaceChildren(...layout.tabs.map(t => {
      const first = t.rows.flatMap(r => r.cols.flat())[0];
      const b = el("button", "", `${PB.defs[first?.t]?.icon || GRID}<span>${esc(t.name)}</span>`);
      b.type = "button"; b.setAttribute("aria-current", String(t.id === active));
      b.onclick = () => showTab(t.id);
      return b;
    }));
    if (editing()) {
      const add = el("button", "bd-add", `${icon('<path d="M12 5v14M5 12h14"/>')}<span>Add tab</span>`);
      add.onclick = () => {
        const name = prompt("Name for the new tab:", "New tab"); if (!name) return;
        const id = "t" + Date.now().toString(36);
        layout.tabs.push({ id, name: name.slice(0, 30), rows: [{ s: "1", cols: [[]] }], phone: [] }); active = id; changed();
      };
      rail.append(add);
    }

    main.replaceChildren(...layout.tabs.map(tab => {
      const sec = el("section", "bd-tab"); sec.hidden = tab.id !== active;
      const list = []; insts.set(tab.id, list);
      if (editing()) sec.append(tabBar(tab));
      if (phoneView()) { sec.append(buildPhone(tab, list)); return sec; }
      tab.rows.forEach((row, ri) => sec.append(buildRow(tab, row, ri, list)));
      if (editing()) {
        const add = el("button", "bd-addrow", "+ Add row"); add.type = "button";
        add.onclick = () => { tab.rows.push({ s: "1-1", cols: [[], []] }); changed(); };
        sec.append(add);
      }
      return sec;
    }));
    PB.shown(insts.get(active) || []);
    renderPage();
  }

  function tabBar(tab) {
    const bar = el("div", "bd-tabbar", `<span>Editing <b>${esc(tab.name)}</b>: drag <b>⠿</b> to move a panel, <b>👁</b> hides it.</span>
      ${phone.matches ? "" : `<span class="bd-seg"><button type="button" data-v="0" aria-pressed="${!preview}">Desktop</button><button type="button" data-v="1" aria-pressed="${preview}">Phone</button></span>`}
      <span class="bd-sp"></span>
      <button type="button" data-a="rename">Rename tab</button><button type="button" data-a="del">Delete tab</button>
      <button type="button" data-a="reset">Reset to base layout</button><button type="button" class="bd-primary" data-a="done">Done</button>`);
    for (const b of bar.querySelectorAll("[data-v]")) b.onclick = () => { preview = b.dataset.v === "1"; build(); };
    if (phoneView()) bar.querySelector("span").innerHTML = `Phone order for <b>${esc(tab.name)}</b>: only used on small screens. Drag <b>⠿</b> to reorder.`;
    bar.querySelector("[data-a=rename]").onclick = () => { const n = prompt("Tab name:", tab.name); if (n) { tab.name = n.slice(0, 30); changed(); } };
    const del = bar.querySelector("[data-a=del]");
    del.disabled = layout.tabs.length < 2;
    del.onclick = () => { if (confirm(`Delete the "${tab.name}" tab and its panels?`)) { layout.tabs = layout.tabs.filter(t => t !== tab); changed(); } };
    bar.querySelector("[data-a=reset]").onclick = () => { if (confirm("Replace all your tabs with the base layout?")) { layout = fresh(); active = "dash"; changed(); } };
    bar.querySelector("[data-a=done]").onclick = () => { page.classList.remove("bd-editing"); preview = false; build(); };
    return bar;
  }

  function buildRow(tab, row, ri, list) {
    const r = el("div", "bd-row");
    r.style.gridTemplateColumns = SPLITS[row.s].map(n => `minmax(0, ${n}fr)`).join(" ");
    if (editing()) {
      const tools = el("div", "bd-rowtools", `<label>Row ${ri + 1} columns <select>${Object.keys(SPLITS).map(k => `<option value="${k}"${k === row.s ? " selected" : ""}>${SPLIT_NAMES[k]}</option>`).join("")}</select></label>
        <button type="button" data-a="up" title="Move row up"${ri ? "" : " disabled"}>↑</button><button type="button" data-a="down" title="Move row down"${ri < tab.rows.length - 1 ? "" : " disabled"}>↓</button>
        <button type="button" data-a="del">Remove row</button>`);
      tools.querySelector("select").onchange = e => {
        const n = SPLITS[e.target.value].length, cols = row.cols;
        while (cols.length > n) cols[n - 1].push(...cols.pop());   // fewer columns: panels move left, nothing is lost
        while (cols.length < n) cols.push([]);
        row.s = e.target.value; changed();
      };
      const move = d => { const j = ri + d; if (j < 0 || j >= tab.rows.length) return; [tab.rows[ri], tab.rows[j]] = [tab.rows[j], tab.rows[ri]]; changed(); };
      tools.querySelector("[data-a=up]").onclick = () => move(-1);
      tools.querySelector("[data-a=down]").onclick = () => move(1);
      tools.querySelector("[data-a=del]").onclick = () => {
        if (row.cols.some(c => c.length) && !confirm("Remove this row and its panels?")) return;
        tab.rows.splice(ri, 1); changed();
      };
      r.append(tools);
    }
    row.cols.forEach((col, ci) => r.append(buildCol(tab, row, col, ci, list)));
    return r;
  }

  // a column element knows its list (col._list) and how to save a new order (col._commit)
  function buildCol(tab, row, col, ci, list) {
    const c = el("div", "bd-col");
    c._list = col; c._commit = () => {};
    col.forEach((item, i) => {
      if (item.h && !editing()) return;
      c.append(buildCard(tab, item, list, {
        up: i > 0 && (() => { [col[i - 1], col[i]] = [col[i], col[i - 1]]; }),
        down: i < col.length - 1 && (() => { [col[i + 1], col[i]] = [col[i], col[i + 1]]; }),
        left: !!row.cols[ci - 1] && (() => { col.splice(i, 1); row.cols[ci - 1].push(item); }),
        right: !!row.cols[ci + 1] && (() => { col.splice(i, 1); row.cols[ci + 1].push(item); }),
        del: () => removeItem(tab, item),
      }));
    });
    if (editing()) {
      if (!col.length) c.append(el("div", "bd-empty", "Drop a panel here"));
      const add = el("button", "bd-addpanel", "+ Add panel"); add.type = "button";
      add.onclick = () => library(t => { col.push({ id: rid(), t, o: {} }); changed(); });
      c.append(add);
    }
    return c;
  }

  function buildPhone(tab, list) {   // phones: one column in the tab's phone order; edits only change that order
    const r = el("div", "bd-row"), c = el("div", "bd-col"), order = phoneItems(tab);
    const setOrder = o => { tab.phone = o.map(i => i.id); };
    c._list = order; c._commit = () => setOrder(order);
    order.forEach((item, i) => {
      if (item.h && !editing()) return;
      c.append(buildCard(tab, item, list, {
        up: i > 0 && (() => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; setOrder(order); }),
        down: i < order.length - 1 && (() => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; setOrder(order); }),
        del: () => removeItem(tab, item),
      }));
    });
    if (editing()) {
      const add = el("button", "bd-addpanel", "+ Add panel"); add.type = "button";
      add.onclick = () => library(t => {
        if (!tab.rows.length) tab.rows.push({ s: "1", cols: [[]] });
        const item = { id: rid(), t, o: {} }, last = tab.rows[tab.rows.length - 1];
        last.cols[last.cols.length - 1].push(item); setOrder([...order, item]); changed();
      });
      c.append(add);
    }
    r.style.gridTemplateColumns = "minmax(0, 1fr)";
    r.append(c);
    return r;
  }

  function buildCard(tab, item, list, ops) {
    const def = PB.defs[item.t] || { title: item.t, icon: "", cls: "" };
    const card = el("section", `pb-card${def.cls ? " " + def.cls : ""}${def.flush ? " flush" : ""}${item.c ? " collapsed" : ""}${item.h ? " pb-hidden" : ""}`);
    card._item = item;
    const head = el("header", "", `<span class="pb-handle" title="Drag to move" aria-hidden="true">⠿</span>${def.icon || ""}<button type="button" class="pb-title">${esc(def.title)}</button>
      <span class="pb-tools"><button type="button" data-a="eye" title="${item.h ? "Show this panel" : "Hide this panel"}" aria-pressed="${!item.h}">${item.h ? "🙈" : "👁"}</button>
      <button type="button" data-a="set" title="Panel settings">⚙</button><button type="button" data-a="menu" title="More" aria-haspopup="menu">⋯</button></span>
      <button type="button" class="pb-tog" aria-label="Collapse">${icon('<path d="M6 9l6 6 6-6"/>')}</button>`);
    const body = el("div", "pb-body");
    card.append(head, body);
    const inst = PB.mount(item.t, body, item.o);
    if (inst) list.push(inst);
    const toggle = () => { item.c = !item.c; card.classList.toggle("collapsed", item.c); save(); if (!item.c && inst) PB.shown([inst]); };
    head.querySelector(".pb-title").onclick = toggle;
    head.querySelector(".pb-tog").onclick = toggle;
    head.querySelector("[data-a=eye]").onclick = () => { item.h = !item.h; changed(); };
    const gear = head.querySelector("[data-a=set]");
    if (def.settings?.length) gear.onclick = () => PB.settings(def, item.o, o => { item.o = o; changed(); });
    else gear.remove();
    head.querySelector("[data-a=menu]").onclick = e => menu(e.currentTarget, [
      ["Move up", ops.up], ["Move down", ops.down], ["Move to the left column", ops.left], ["Move to the right column", ops.right],
      ["Remove panel", ops.del, "danger"],
    ]);
    if (editing()) head.querySelector(".pb-handle").addEventListener("pointerdown", e => startDrag(e, card));
    return card;
  }

  // small popup menu for the ⋯ button
  const pop = el("div", "bd-menu"); pop.hidden = true; document.body.append(pop);
  function menu(btn, entries) {
    pop.innerHTML = entries.filter(([, f]) => f).map(([label, , cls], i) => `<button type="button" data-i="${i}" class="${cls || ""}">${label}</button>`).join("");
    const live = entries.filter(([, f]) => f);
    for (const b of pop.querySelectorAll("button")) b.onclick = () => { pop.hidden = true; live[+b.dataset.i][1](); changed(); };
    const r = btn.getBoundingClientRect();
    pop.hidden = false;
    pop.style.top = `${r.bottom + 4}px`; pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth))}px`;
    setTimeout(() => document.addEventListener("pointerdown", function close(ev) {
      if (!pop.contains(ev.target)) { pop.hidden = true; document.removeEventListener("pointerdown", close); }
    }), 0);
  }

  // ---- drag + drop with mouse or touch: grab ⠿, a line shows where it lands ---------------------
  let drag = null;
  const marker = el("div", "bd-marker");
  function startDrag(e, card) {
    e.preventDefault();
    const from = card.parentElement;
    drag = { card, item: card._item, from, ghost: el("div", "bd-dragghost", esc(PB.defs[card._item.t]?.title || card._item.t)), target: null, before: null };
    document.body.append(drag.ghost);
    card.classList.add("bd-dragging");
    moveDrag(e);
    addEventListener("pointermove", moveDrag);
    addEventListener("pointerup", endDrag, { once: true });
    addEventListener("pointercancel", cancelDrag, { once: true });
  }
  function moveDrag(e) {
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX + 12}px`; drag.ghost.style.top = `${e.clientY + 12}px`;
    if (e.clientY < 70) scrollBy(0, -14); else if (e.clientY > innerHeight - 50) scrollBy(0, 14);   // scroll while dragging
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest(".bd-col");
    if (!under || !under._list) { marker.remove(); drag.target = null; return; }
    const cards = [...under.querySelectorAll(":scope > .pb-card")].filter(c => c !== drag.card);
    const before = cards.find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) || null;
    drag.target = under; drag.before = before;
    under.insertBefore(marker, before || under.querySelector(":scope > .bd-empty, :scope > .bd-addpanel"));
  }
  function endDrag() {
    removeEventListener("pointermove", moveDrag);
    removeEventListener("pointercancel", cancelDrag);
    const d = drag; cancelDrag();
    if (!d?.target) return;
    const src = d.from._list, dst = d.target._list;
    src.splice(src.indexOf(d.item), 1);
    const at = d.before ? dst.indexOf(d.before._item) : -1;
    dst.splice(at < 0 ? dst.length : at, 0, d.item);
    d.target._commit(); if (src !== dst) d.from._commit();
    changed();
  }
  function cancelDrag() {
    removeEventListener("pointermove", moveDrag);
    if (!drag) return;
    drag.ghost.remove(); marker.remove(); drag.card.classList.remove("bd-dragging"); drag = null;
  }

  // ---- panel library ------------------------------------------------------------------------
  const lib = el("dialog", "bd-lib");
  document.body.append(lib);
  function library(pick) {
    lib.innerHTML = `<h3>Add a panel</h3><div class="bd-libgrid">${Object.values(PB.defs).map(d => {
      const taken = d.single && used(d.type);
      return `<button type="button" class="${d.cls}" data-t="${esc(d.type)}"${taken ? " disabled" : ""}>${d.icon}<span>${esc(d.title)}</span>
        <small>${taken ? "already placed" : esc(d.desc || "")}</small></button>`;
    }).join("")}</div><div class="bd-libfoot"><button type="button" data-a="close">Cancel</button></div>`;
    for (const b of lib.querySelectorAll("[data-t]")) b.onclick = () => { lib.close(); pick(b.dataset.t); };
    lib.querySelector("[data-a=close]").onclick = () => lib.close();
    lib.showModal();
  }

  // ---- tabs + events ------------------------------------------------------------------------
  function showTab(id) {
    active = id; PB.store.set("pb-tab", id);
    for (const [i, b] of [...rail.querySelectorAll("button:not(.bd-add)")].entries()) b.setAttribute("aria-current", String(layout.tabs[i]?.id === id));
    for (const [i, s] of [...main.children].entries()) s.hidden = layout.tabs[i]?.id !== id;
    PB.shown(insts.get(id) || []);
  }
  editBtn.onclick = () => { page.classList.toggle("bd-editing"); preview = false; build(); };
  phone.addEventListener("change", build);
  main.addEventListener("pb-reveal", e => {   // a panel asked to be shown (e.g. Files -> Edit opens the config editor's tab)
    const sec = e.target.closest(".bd-tab"), i = [...main.children].indexOf(sec);
    if (i >= 0 && layout.tabs[i] && layout.tabs[i].id !== active) showTab(layout.tabs[i].id);
    e.target.closest(".pb-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  PB.onRoute(p => { if (p) PB.shown(insts.get(tabOf().id) || []); });

  build();
  api("/api/ui/layout").then(r => { const l = clean(r.layout); if (l) { layout = l; build(); } }).catch(() => {});
})();
