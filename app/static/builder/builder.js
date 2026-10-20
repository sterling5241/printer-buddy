// Printer Buddy - dashboard builder: tabs -> rows (pick a column split) -> columns -> panels.
// Edit layout: drag panels between columns, add / remove panels, rows and tabs. Saved on the box (/api/ui/layout).
(() => {
  const { el, icon } = PB;
  const page = $("#page");
  const SPLITS = { "1": [1], "1-1": [1, 1], "1-2": [1, 2], "2-1": [2, 1], "1-1-1": [1, 1, 1], "1-1-1-1": [1, 1, 1, 1] };
  const SPLIT_NAMES = { "1": "1 column", "1-1": "½ + ½", "1-2": "⅓ + ⅔", "2-1": "⅔ + ⅓", "1-1-1": "⅓ ×3", "1-1-1-1": "¼ ×4" };
  const GRID = icon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>');
  const rid = () => Math.random().toString(36).slice(2, 9);
  const P = t => ({ t });
  const phone = matchMedia("(max-width: 760px)");   // phones: one column per tab, in the tab's own phone order
  const DEFAULT = { v: 1, tabs: [
    { id: "dash", name: "Dashboard", rows: [{ s: "1-1", cols: [[P("camera"), P("thermals"), P("console")], [P("status"), P("ai"), P("exclude"), P("toolhead"), P("macros")]] }] },
    { id: "files", name: "Files", rows: [{ s: "1", cols: [[P("files")]] }] },
    { id: "history", name: "History", rows: [{ s: "1", cols: [[P("history")]] }] },
    { id: "timelapse", name: "Timelapses", rows: [{ s: "1", cols: [[P("timelapse")]] }] },
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
          .map(it => ({ id: String(it.id || rid()), t: it.t, c: !!it.c, o: it.o && typeof it.o === "object" && !Array.isArray(it.o) ? it.o : {} }))),
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
  function build() {
    for (const list of insts.values()) list.forEach(PB.unmount);
    insts.clear();
    if (!layout.tabs.some(t => t.id === active)) active = layout.tabs[0].id;
    const editing = page.classList.contains("bd-editing");

    rail.replaceChildren(...layout.tabs.map(t => {
      const first = t.rows.flatMap(r => r.cols.flat())[0];
      const b = el("button", "", `${PB.defs[first?.t]?.icon || GRID}<span>${esc(t.name)}</span>`);
      b.type = "button"; b.setAttribute("aria-current", String(t.id === active));
      b.onclick = () => showTab(t.id);
      return b;
    }));
    if (editing) {
      const add = el("button", "bd-add", `${icon('<path d="M12 5v14M5 12h14"/>')}<span>Add tab</span>`);
      add.onclick = () => {
        const name = prompt("Name for the new tab:", "New tab"); if (!name) return;
        const id = "t" + Date.now().toString(36);
        layout.tabs.push({ id, name: name.slice(0, 30), rows: [{ s: "1", cols: [[]] }] }); active = id; changed();
      };
      rail.append(add);
    }

    main.replaceChildren(...layout.tabs.map(tab => {
      const sec = el("section", "bd-tab"); sec.hidden = tab.id !== active;
      const list = []; insts.set(tab.id, list);
      if (editing) sec.append(tabBar(tab));
      if (phone.matches) { sec.append(buildPhone(tab, list)); return sec; }
      tab.rows.forEach((row, ri) => sec.append(buildRow(tab, row, ri, list)));
      if (editing) {
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
    const bar = el("div", "bd-tabbar", `<span>Editing <b>${esc(tab.name)}</b>: drag panels by their title bar, or use the buttons.</span><span class="bd-sp"></span>
      <button type="button" data-a="rename">Rename tab</button><button type="button" data-a="del">Delete tab</button>
      <button type="button" data-a="reset">Reset everything</button><button type="button" class="bd-primary" data-a="done">Done</button>`);
    bar.querySelector("[data-a=rename]").onclick = () => { const n = prompt("Tab name:", tab.name); if (n) { tab.name = n.slice(0, 30); changed(); } };
    const del = bar.querySelector("[data-a=del]");
    del.disabled = layout.tabs.length < 2;
    del.onclick = () => { if (confirm(`Delete the "${tab.name}" tab and its panels?`)) { layout.tabs = layout.tabs.filter(t => t !== tab); changed(); } };
    bar.querySelector("[data-a=reset]").onclick = () => { if (confirm("Put every tab back to the default layout?")) { layout = fresh(); active = "dash"; changed(); } };
    if (phone.matches) bar.querySelector("span").innerHTML = `Editing <b>${esc(tab.name)}</b> on phones: this order is only used on small screens.`;
    bar.querySelector("[data-a=done]").onclick = () => { page.classList.remove("bd-editing"); build(); };
    return bar;
  }

  function buildRow(tab, row, ri, list) {
    const r = el("div", "bd-row");
    r.style.gridTemplateColumns = SPLITS[row.s].map(n => `minmax(0, ${n}fr)`).join(" ");
    if (page.classList.contains("bd-editing")) {
      const tools = el("div", "bd-rowtools", `<label>Columns <select>${Object.keys(SPLITS).map(k => `<option value="${k}"${k === row.s ? " selected" : ""}>${SPLIT_NAMES[k]}</option>`).join("")}</select></label>
        <button type="button" data-a="up" title="Move row up">↑</button><button type="button" data-a="down" title="Move row down">↓</button><button type="button" data-a="del">Remove row</button>`);
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
    row.cols.forEach((col, ci) => r.append(buildCol(row, col, ci, list)));
    return r;
  }

  let drag = null;   // { col, item } while a panel is dragged
  function buildCol(row, col, ci, list) {
    const c = el("div", "bd-col");
    const editing = page.classList.contains("bd-editing");
    col.forEach((item, i) => c.append(buildCard(item, list, {
      up: i > 0 && (() => { [col[i - 1], col[i]] = [col[i], col[i - 1]]; }),
      down: i < col.length - 1 && (() => { [col[i + 1], col[i]] = [col[i], col[i + 1]]; }),
      left: !!row.cols[ci - 1] && (() => { col.splice(i, 1); row.cols[ci - 1].push(item); }),
      right: !!row.cols[ci + 1] && (() => { col.splice(i, 1); row.cols[ci + 1].push(item); }),
      del: () => col.splice(i, 1),
      drag: col,
    })));
    if (editing) {
      const add = el("button", "bd-addpanel", "+ Add panel"); add.type = "button";
      add.onclick = () => library(t => { col.push({ id: rid(), t }); changed(); });
      c.append(add);
      c.ondragover = e => { if (drag) { e.preventDefault(); c.classList.add("bd-over"); } };
      c.ondragleave = () => c.classList.remove("bd-over");
      c.ondrop = e => {
        e.preventDefault(); c.classList.remove("bd-over");
        if (!drag) return;
        const target = e.target.closest(".pb-card");
        const from = drag.col.indexOf(drag.item); drag.col.splice(from, 1);
        let at = target ? [...c.querySelectorAll(":scope > .pb-card")].indexOf(target) : col.length;
        if (target && drag.col === col && from < at) at--;   // removed above the drop spot
        col.splice(at < 0 ? col.length : at, 0, drag.item);
        drag = null; changed();
      };
    }
    return c;
  }

  function buildPhone(tab, list) {   // phones: one column in the tab's phone order; edits only change that order
    const r = el("div", "bd-row"), c = el("div", "bd-col"), order = phoneItems(tab);
    const setOrder = o => { tab.phone = o.map(i => i.id); };
    order.forEach((item, i) => c.append(buildCard(item, list, {
      up: i > 0 && (() => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; setOrder(order); }),
      down: i < order.length - 1 && (() => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; setOrder(order); }),
      del: () => removeItem(tab, item),
    })));
    if (page.classList.contains("bd-editing")) {
      const add = el("button", "bd-addpanel", "+ Add panel"); add.type = "button";
      add.onclick = () => library(t => {
        if (!tab.rows.length) tab.rows.push({ s: "1", cols: [[]] });
        const item = { id: rid(), t }, last = tab.rows[tab.rows.length - 1];
        last.cols[last.cols.length - 1].push(item); setOrder([...order, item]); changed();
      });
      c.append(add);
    }
    r.style.gridTemplateColumns = "minmax(0, 1fr)";
    r.append(c);
    return r;
  }

  function buildCard(item, list, ops) {
    const def = PB.defs[item.t] || { title: item.t, icon: "", cls: "" };
    const card = el("section", `pb-card${def.cls ? " " + def.cls : ""}${def.flush ? " flush" : ""}${item.c ? " collapsed" : ""}`);
    const head = el("header", "", `${def.icon || ""}<button type="button" class="pb-title">${esc(def.title)}</button>
      <span class="pb-tools"><button type="button" data-a="up" title="Move up">↑</button><button type="button" data-a="down" title="Move down">↓</button>
      <button type="button" data-a="left" title="Move to the column on the left">←</button><button type="button" data-a="right" title="Move to the column on the right">→</button>
      <button type="button" data-a="set" title="Panel settings">⚙</button><button type="button" data-a="del" title="Remove panel">✕</button></span>
      <button type="button" class="pb-tog" aria-label="Collapse">${icon('<path d="M6 9l6 6 6-6"/>')}</button>`);
    const body = el("div", "pb-body");
    card.append(head, body);
    const inst = PB.mount(item.t, body, item.o);
    const gear = head.querySelector("[data-a=set]");
    if (def.settings?.length) gear.onclick = () => PB.settings(def, item.o, o => { item.o = o; changed(); });
    else gear.remove();
    if (inst) list.push(inst);
    const toggle = () => { item.c = !item.c; card.classList.toggle("collapsed", item.c); save(); if (!item.c && inst) PB.shown([inst]); };
    head.querySelector(".pb-title").onclick = toggle;
    head.querySelector(".pb-tog").onclick = toggle;
    for (const a of ["up", "down", "left", "right", "del"]) {
      const b = head.querySelector(`[data-a=${a}]`);
      if (!ops[a]) { if (a === "left" || a === "right") b.remove(); else b.disabled = true; continue; }
      b.onclick = () => { ops[a](); changed(); };
    }
    if (page.classList.contains("bd-editing") && ops.drag) {
      const col = ops.drag;
      head.draggable = true;
      head.ondragstart = e => { drag = { col, item }; e.dataTransfer.effectAllowed = "move"; card.classList.add("bd-dragging"); };
      head.ondragend = () => { drag = null; card.classList.remove("bd-dragging"); };
    }
    return card;
  }

  // ---- panel library ------------------------------------------------------------------------
  const lib = el("dialog", "bd-lib");
  document.body.append(lib);
  function library(pick) {
    lib.innerHTML = `<h3>Add a panel</h3><div class="bd-libgrid">${Object.values(PB.defs).map(d => {
      const taken = d.single && used(d.type);
      return `<button type="button" class="${d.cls}" data-t="${esc(d.type)}"${taken ? " disabled" : ""}>${d.icon}<span>${esc(d.title)}</span>${taken ? "<small>already placed</small>" : ""}</button>`;
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
  editBtn.onclick = () => { page.classList.toggle("bd-editing"); build(); };
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
