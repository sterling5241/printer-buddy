(() => {
  const { el, icon } = PB;
  const SPLITS = { "1": [1], "1-1": [1, 1], "1-2": [1, 2], "2-1": [2, 1], "1-1-1": [1, 1, 1], "1-1-1-1": [1, 1, 1, 1] };
  const SPLIT_NAMES = { "1": "1 column", "1-1": "½ + ½", "1-2": "⅓ + ⅔", "2-1": "⅔ + ⅓", "1-1-1": "⅓ ×3", "1-1-1-1": "¼ ×4" };
  const TAB_ICONS = {
    dash: icon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
    jobs: icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
    history: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>'),
    tuning: icon('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
    console: icon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l4 3-4 3M12 15h5"/>'),
    timelapse: icon('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-4v12l-6-4z"/>'),
    machine: icon('<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  };
  const GRID = icon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>');
  const rid = () => Math.random().toString(36).slice(2, 9);
  const phone = matchMedia("(max-width: 760px)");
  const P = (tab, t, o) => ({ id: `${tab}-${t}`, t, o: o || {} });

  const H = (tab, t, o) => ({ ...P(tab, t, o), h: true });
  const PAGE_DEFAULT = { v: 4, tabs: [
    { id: "dash", name: "Dashboard", rows: [{ s: "1-1", cols: [
        [P("dash", "status"), P("dash", "spoolman"), P("dash", "camera"), P("dash", "toolhead"), P("dash", "zoffset"), P("dash", "extruder"),
         P("dash", "macros"), P("dash", "fans"), H("dash", "fsensors"), P("dash", "limits")],
        [P("dash", "thermals"), P("dash", "console"), P("dash", "files"), H("dash", "queue"), P("dash", "gcodeview"), H("dash", "bedmesh"),
         P("dash", "exclude"), P("dash", "ai")]] }],
      phone: ["status", "camera", "thermals", "toolhead", "zoffset", "extruder", "macros", "fans", "console", "files", "gcodeview",
              "exclude", "ai", "spoolman", "limits", "fsensors", "queue", "bedmesh"].map(t => `dash-${t}`) },
    { id: "jobs", name: "Jobs", rows: [{ s: "2-1", cols: [[P("jobs", "files")], [P("jobs", "queue")]] },
                                      { s: "1", cols: [[P("jobs", "gcodeview")]] }] },
    { id: "history", name: "History", rows: [{ s: "1", cols: [[P("history", "history")]] }] },
    { id: "tuning", name: "Tuning", rows: [{ s: "2-1", cols: [[P("tuning", "bedmesh")], [P("tuning", "actions"), P("tuning", "endstops"), P("tuning", "fsensors")]] }] },
    { id: "console", name: "Console", rows: [{ s: "2-1", cols: [[P("console", "console", { height: 320 })], [P("console", "macros")]] }] },
    { id: "timelapse", name: "Timelapses", rows: [{ s: "1", cols: [[P("timelapse", "timelapse")]] }] },
    { id: "machine", name: "Machine", rows: [{ s: "1-1-1", cols: [[P("machine", "machine")], [P("machine", "updates")], [P("machine", "spoolman"), P("machine", "devices")]] },
                                            { s: "1", cols: [[P("machine", "system")]] },
                                            { s: "1", cols: [[P("machine", "config", { height: 640 })]] }] },
  ] };
  const HOME_DEFAULT = { v: 1, tabs: [
    { id: "home", name: "Home", rows: [{ s: "1", cols: [[P("home", "fleet")]] }, { s: "1", cols: [[P("home", "printers")]] }] },
  ] };

  const page = $("#page");
  const head = page.querySelector(".pg-head");
  const top = el("div", "bd-top"), actions = el("div", "bd-actions");
  const editBtn = el("button", "adv bd-ghost", "Edit layout"); editBtn.type = "button";
  const themeBtn = el("button", "bd-theme"); themeBtn.type = "button";
  const THEMES = ["auto", "light", "dark"], dark = matchMedia("(prefers-color-scheme: dark)");
  PB.applyTheme = () => {
    const t = PB.store.get("pb-theme", "auto");
    document.documentElement.dataset.theme = t === "auto" ? (dark.matches ? "dark" : "light") : t;
    themeBtn.innerHTML = t === "auto" ? PB.ic.contrast : t === "light" ? PB.ic.sun : PB.ic.moon;
    themeBtn.title = `Theme: ${t} (click to change)`;
  };
  PB.setTheme = t => { PB.store.set("pb-theme", t); PB.applyTheme(); };
  themeBtn.onclick = () => PB.setTheme(THEMES[(THEMES.indexOf(PB.store.get("pb-theme", "auto")) + 1) % 3]);
  dark.addEventListener("change", PB.applyTheme);
  PB.applyTheme();
  actions.append(themeBtn, editBtn, el("span", "bd-divider"), $("#pgPause"), $("#pgCancel"), $("#pgStop"));
  top.append(head.querySelector(".pg-back"), $("#pgName"), $("#pgTag"), el("span", "bd-sp"), actions);
  head.replaceWith(top);
  page.querySelector(".pg-tabs").hidden = true;
  for (const id of ["pgStatus", "pgControl", "pgConsole"]) $("#" + id).hidden = true;
  page.classList.add("bd");
  const pageWrap = el("div", "bd-wrap");
  page.append(pageWrap);

  const homeRoot = el("div", "bd bd-homewrap"); homeRoot.id = "home";
  $("#grid").before(homeRoot);
  const homeEdit = el("button", "adv", "Edit layout"); homeEdit.type = "button"; homeEdit.id = "homeEdit";
  $("#manualBtn").before(homeEdit);

  PB.builders = {
    page: makeBuilder({ root: page, wrap: pageWrap, rail: true, reg: PB.defs, url: "/api/ui/layout", base: PAGE_DEFAULT, tabKey: "pb-tab", editBtn }),
    home: makeBuilder({ root: homeRoot, wrap: homeRoot, rail: false, reg: PB.homeDefs, url: "/api/ui/layout?scope=home", base: HOME_DEFAULT, tabKey: "pb-home-tab", editBtn: homeEdit }),
  };

  function makeBuilder(o) {
    const { root, reg } = o;
    const rail = o.rail ? el("nav", "bd-rail") : null, main = el("div", "bd-main");
    if (rail) { rail.setAttribute("aria-label", "Tabs"); o.wrap.append(rail); }
    o.wrap.append(main);

    let layout = null, active = PB.store.get(o.tabKey, o.base.tabs[0].id), saveTimer = null, preview = false;
    const insts = new Map();
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
      saveTimer = setTimeout(() => api(o.url, { method: "PUT", body: JSON.stringify({ layout }) })
        .catch(e => toast(`Couldn't save the layout: ${e.message}`)), 500);
    };
    const changed = () => { save(); build(); };
    const used = t => layout.tabs.some(tab => tab.rows.some(r => r.cols.some(c => c.some(it => it.t === t))));
    const fresh = () => clean(structuredClone(o.base));
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
    const editing = () => root.classList.contains("bd-editing");
    const phoneView = () => phone.matches || (editing() && preview);

    function build() {
      for (const list of insts.values()) list.forEach(PB.unmount);
      insts.clear();
      if (!layout.tabs.some(t => t.id === active)) active = layout.tabs[0].id;
      root.classList.toggle("bd-preview", editing() && preview && !phone.matches);
      if (rail) {
        rail.replaceChildren(...layout.tabs.map(t => {
          const first = items(t)[0];
          const b = el("button", "", `${TAB_ICONS[t.id] || reg[first?.t]?.icon || GRID}<span>${esc(t.name)}</span>`);
          b.type = "button"; b.setAttribute("aria-current", String(t.id === active)); b.title = t.name;
          b.onclick = () => showTab(t.id);
          if (editing()) {
            b.draggable = true;
            b.ondragstart = e => { e.dataTransfer.setData("text/x-pb-tab", t.id); e.dataTransfer.effectAllowed = "move"; };
            b.ondragover = e => { if ([...e.dataTransfer.types].includes("text/x-pb-tab")) { e.preventDefault(); b.classList.add("bd-tabover"); } };
            b.ondragleave = () => b.classList.remove("bd-tabover");
            b.ondrop = e => {
              e.preventDefault(); b.classList.remove("bd-tabover");
              const from = layout.tabs.findIndex(x => x.id === e.dataTransfer.getData("text/x-pb-tab")), to = layout.tabs.indexOf(t);
              if (from < 0 || from === to) return;
              layout.tabs.splice(to, 0, layout.tabs.splice(from, 1)[0]); changed();
            };
          }
          return b;
        }));
        const fold = el("button", "bd-fold"); fold.type = "button";
        const setFold = compact => {
          rail.classList.toggle("bd-compact", compact);
          fold.innerHTML = `${icon(compact ? '<path d="M9 6l6 6-6 6"/>' : '<path d="M15 6l-6 6 6 6"/>')}<span>Collapse</span>`;
          fold.title = compact ? "Expand the sidebar" : "Collapse the sidebar";
        };
        setFold(PB.store.get("pb-rail-compact", false));
        fold.onclick = () => { const c = !rail.classList.contains("bd-compact"); PB.store.set("pb-rail-compact", c); setFold(c); };
        if (editing()) {
          const add = el("button", "bd-add", `${icon('<path d="M12 5v14M5 12h14"/>')}<span>Add tab</span>`);
          add.onclick = () => {
            const name = prompt("Name for the new tab:", "New tab"); if (!name) return;
            const id = "t" + Date.now().toString(36);
            layout.tabs.push({ id, name: name.slice(0, 30), rows: [{ s: "1", cols: [[]] }], phone: [] }); active = id; changed();
          };
          rail.append(add);
        }
        rail.prepend(fold);
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
      if (rail) renderPage(); else render();
    }

    function tabBar(tab) {
      const bar = el("div", "bd-tabbar", `<span>Editing <b>${esc(tab.name)}</b>: drag ${PB.ic.grip} to move a panel, ${PB.ic.eye} hides it.</span>
        ${phone.matches ? "" : `<span class="bd-seg"><button type="button" data-v="0" aria-pressed="${!preview}">Desktop</button><button type="button" data-v="1" aria-pressed="${preview}">Phone</button></span>`}
        <span class="bd-sp"></span>
        ${rail ? `<button type="button" data-a="up" title="Move this tab up the side bar (or drag it there)">↑ Tab</button><button type="button" data-a="down" title="Move this tab down the side bar (or drag it there)">↓ Tab</button>
          <button type="button" data-a="rename">Rename tab</button><button type="button" data-a="del">Delete tab</button>` : ""}
        <button type="button" data-a="reset">Reset to base layout</button><button type="button" class="bd-primary" data-a="done">Done</button>`);
      for (const b of bar.querySelectorAll("[data-v]")) b.onclick = () => { preview = b.dataset.v === "1"; build(); };
      if (phoneView()) bar.querySelector("span").innerHTML = `Phone order for <b>${esc(tab.name)}</b>: only used on small screens. Drag ${PB.ic.grip} to reorder.`;
      if (rail) {
        bar.querySelector("[data-a=rename]").onclick = () => { const n = prompt("Tab name:", tab.name); if (n) { tab.name = n.slice(0, 30); changed(); } };
        const i = layout.tabs.indexOf(tab), move = d => { layout.tabs.splice(i + d, 0, layout.tabs.splice(i, 1)[0]); changed(); };
        bar.querySelector("[data-a=up]").disabled = i === 0; bar.querySelector("[data-a=up]").onclick = () => move(-1);
        bar.querySelector("[data-a=down]").disabled = i === layout.tabs.length - 1; bar.querySelector("[data-a=down]").onclick = () => move(1);
        const del = bar.querySelector("[data-a=del]");
        del.disabled = layout.tabs.length < 2;
        del.onclick = () => { if (confirm(`Delete the "${tab.name}" tab and its panels?`)) { layout.tabs = layout.tabs.filter(t => t !== tab); changed(); } };
      }
      bar.querySelector("[data-a=reset]").onclick = () => { if (confirm("Replace this page's layout with the base layout?")) { layout = fresh(); active = layout.tabs[0].id; changed(); } };
      bar.querySelector("[data-a=done]").onclick = () => setEditing(false);
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
          while (cols.length > n) cols[n - 1].push(...cols.pop());
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

    function buildPhone(tab, list) {
      const r = el("div", "bd-row"), c = el("div", "bd-col"), order = phoneItems(tab);
      const setOrder = ord => { tab.phone = ord.map(i => i.id); };
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
      const def = reg[item.t] || { title: item.t, icon: "", cls: "" };
      const card = el("section", `pb-card${def.cls ? " " + def.cls : ""}${def.flush ? " flush" : ""}${item.c ? " collapsed" : ""}${item.h ? " pb-hidden" : ""}`);
      card._item = item;
      const head = el("header", "", `<span class="pb-handle" title="Drag to move" aria-hidden="true">${PB.ic.grip}</span>${def.icon || ""}<button type="button" class="pb-title">${esc(def.title)}</button>
        <span class="pb-tools"><button type="button" data-a="eye" title="${item.h ? "Show this panel" : "Hide this panel"}" aria-pressed="${!item.h}">${item.h ? PB.ic.eyeOff : PB.ic.eye}</button>
        <button type="button" data-a="set" title="Panel settings">${PB.ic.cog}</button><button type="button" data-a="menu" title="More" aria-haspopup="menu">${PB.ic.more}</button></span>
        ${def.gear && (def.settings?.length || def.edit) ? `<button type="button" class="pb-qset" title="${esc(def.title)} settings">${PB.ic.cog}</button>` : ""}
        <button type="button" class="pb-tog" aria-label="Collapse">${icon('<path d="M6 9l6 6 6-6"/>')}</button>`);
      const body = el("div", "pb-body");
      card.append(head, body);
      // buttons a panel marks data-head go in its title strip; its own host.querySelector(...) still finds them
      const q1 = Element.prototype.querySelector, qa = Element.prototype.querySelectorAll, moved = () => [...qa.call(head, "[data-head]")];
      body.querySelector = sel => q1.call(body, sel) || moved().find(e => e.matches(sel)) || null;
      body.querySelectorAll = sel => [...qa.call(body, sel), ...moved().filter(e => e.matches(sel))];
      const inst = PB.mount(item.t, body, item.o, reg);
      const slot = head.querySelector(".pb-qset") || head.querySelector(".pb-tools");
      for (const b of [...qa.call(body, "[data-head]")]) { b.classList.add("pb-hbtn"); slot.before(b); }
      if (inst) list.push(inst);
      const toggle = () => { item.c = !item.c; card.classList.toggle("collapsed", item.c); save(); if (!item.c && inst) PB.shown([inst]); };
      head.querySelector(".pb-title").onclick = toggle;
      head.querySelector(".pb-tog").onclick = toggle;
      head.querySelector("[data-a=eye]").onclick = () => { item.h = !item.h; changed(); };
      const gear = head.querySelector("[data-a=set]");
      if (def.settings?.length) gear.onclick = () => PB.settings(def, item.o, v => { item.o = v; changed(); });
      else if (def.edit) gear.onclick = () => def.edit(item.o, v => { item.o = v; changed(); });
      else gear.remove();
      const qset = head.querySelector(".pb-qset");
      if (qset) qset.onclick = () => def.edit ? def.edit(item.o, v => { item.o = v; changed(); }) : PB.settings(def, item.o, v => { item.o = v; changed(); });
      head.querySelector("[data-a=menu]").onclick = e => menu(e.currentTarget, [
        ["Move up", ops.up], ["Move down", ops.down], ["Move to the left column", ops.left], ["Move to the right column", ops.right],
        ["Remove panel", ops.del, "danger"],
      ], changed);
      if (editing()) head.querySelector(".pb-handle").addEventListener("pointerdown", e => startDrag(e, card, changed));
      return card;
    }

    function library(pick) {
      lib.innerHTML = `<h3>Add a panel</h3><div class="bd-libgrid">${Object.values(reg).map(d => {
        const taken = d.single && used(d.type);
        return `<button type="button" class="${d.cls}" data-t="${esc(d.type)}"${taken ? " disabled" : ""}>${d.icon}<span>${esc(d.title)}</span>
          <small>${taken ? "already placed" : esc(d.desc || "")}</small></button>`;
      }).join("")}</div><div class="bd-libfoot"><button type="button" data-a="close">Cancel</button></div>`;
      for (const b of lib.querySelectorAll("[data-t]")) b.onclick = () => { lib.close(); pick(b.dataset.t); };
      lib.querySelector("[data-a=close]").onclick = () => lib.close();
      lib.showModal();
    }

    function showTab(id) {
      active = id; PB.store.set(o.tabKey, id);
      if (rail) for (const [i, b] of [...rail.querySelectorAll("button:not(.bd-add):not(.bd-fold)")].entries()) b.setAttribute("aria-current", String(layout.tabs[i]?.id === id));
      for (const [i, s] of [...main.children].entries()) s.hidden = layout.tabs[i]?.id !== id;
      PB.shown(insts.get(id) || []);
    }
    function setEditing(on) { root.classList.toggle("bd-editing", on); preview = false; build(); }
    o.editBtn.onclick = () => setEditing(!editing());
    phone.addEventListener("change", build);
    main.addEventListener("pb-reveal", e => {
      const sec = e.target.closest(".bd-tab"), i = [...main.children].indexOf(sec);
      if (i >= 0 && layout.tabs[i] && layout.tabs[i].id !== active) showTab(layout.tabs[i].id);
      e.target.closest(".pb-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    if (rail) PB.onRoute(p => { if (p) PB.shown(insts.get(active) || []); });
    build();
    api(o.url).then(r => { const l = clean(r.layout); if (l) { layout = l; build(); } }).catch(() => {});
    return { build, showTab, setEditing };
  }

  const lib = el("dialog", "bd-lib");
  document.body.append(lib);
  const pop = el("div", "bd-menu"); pop.hidden = true; document.body.append(pop);
  function menu(btn, entries, changed) {
    const live = entries.filter(([, f]) => f);
    pop.innerHTML = live.map(([label, , cls], i) => `<button type="button" data-i="${i}" class="${cls || ""}">${label}</button>`).join("");
    for (const b of pop.querySelectorAll("button")) b.onclick = () => { pop.hidden = true; live[+b.dataset.i][1](); changed(); };
    const r = btn.getBoundingClientRect();
    pop.hidden = false;
    pop.style.top = `${r.bottom + 4}px`; pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth))}px`;
    setTimeout(() => document.addEventListener("pointerdown", function close(ev) {
      if (!pop.contains(ev.target)) { pop.hidden = true; document.removeEventListener("pointerdown", close); }
    }), 0);
  }
  let drag = null;
  const marker = el("div", "bd-marker");
  function startDrag(e, card, changed) {
    e.preventDefault();
    drag = { card, item: card._item, from: card.parentElement, changed, target: null, before: null,
             ghost: el("div", "bd-dragghost", esc((PB.defs[card._item.t] || PB.homeDefs[card._item.t])?.title || card._item.t)) };
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
    if (e.clientY < 70) scrollBy(0, -14); else if (e.clientY > innerHeight - 50) scrollBy(0, 14);
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest(".bd-col");
    if (!under || !under._list || under.closest(".bd") !== drag.from.closest(".bd")) { marker.remove(); drag.target = null; return; }
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
    d.changed();
  }
  function cancelDrag() {
    removeEventListener("pointermove", moveDrag);
    if (!drag) return;
    drag.ghost.remove(); marker.remove(); drag.card.classList.remove("bd-dragging"); drag = null;
  }
})();
