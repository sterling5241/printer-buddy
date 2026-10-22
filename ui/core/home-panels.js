PB.homePanel("printers", {
  title: "Printers", desc: "Your printers as cards or a list (sort, search, groups)", single: true, flush: true,
  icon: PB.icon('<rect x="4" y="3" width="16" height="13" rx="2"/><path d="M4 12h16M8 20h8M12 16v4"/>'),
  create(host) {
    host.classList.add("pb-printers");
    const parts = ["#grid", "#noMatch", "#setupLine", "#empty"].map(s => $(s)).filter(Boolean);
    host.append(...parts);
    return { destroy() { for (const n of parts) $("#home").after(n); } };
  },
});

PB.homePanel("fleet", {
  title: "Fleet", desc: "How many are printing, idle, offline or in error, and what finishes next",
  icon: PB.icon('<path d="M3 20h18M6 16V9M10 16V5M14 16v-6M18 16v-3"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-fleet"></div><div class="pb-next pb-muted"></div>`;
    const box = host.querySelector(".pb-fleet"), next = host.querySelector(".pb-next");
    const KINDS = [["printing", "Printing", "running"], ["idle", "Idle", "done"], ["offline", "Offline", ""], ["error", "Error", "failed"]];
    const kind = p => { const s = statusOf(p); return s === "printing" || s === "paused" ? "printing" : ["error", "shutdown"].includes(s) ? "error"
                                                    : ["offline", "connecting", "auth_error"].includes(s) ? "offline" : "idle"; };
    return {
      update(list) {
        const n = Object.fromEntries(KINDS.map(([k]) => [k, 0])); for (const p of list) n[kind(p)]++;
        box.innerHTML = KINDS.map(([k, label, cls]) => `<div class="pb-fstat ${cls}"><b>${n[k]}</b><span>${label}</span></div>`).join("");
        const run = list.filter(p => p.state === "printing" && p.eta != null).sort((a, b) => a.eta - b.eta)[0];
        next.innerHTML = run ? `Finishing next: <a href="#printer-${run.id}">${esc(run.name)}</a> in ${fmtDur(run.eta)} (around ${fmtClock(new Date(Date.now() + run.eta * 1000))})`
                             : list.length ? "Nothing printing right now." : "";
      },
    };
  },
});

PB.homePanel("active", {
  title: "Active prints", desc: "Every running print with progress, time left and pause",
  icon: PB.icon('<path d="M6 4l14 8-14 8z"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-list"></div>`;
    const list = host.querySelector(".pb-list");
    let key = "";
    return {
      update(all) {
        const act = all.filter(p => p.state === "printing" || p.state === "paused");
        const k = act.map(p => `${p.id}:${p.state}:${Math.floor((p.progress || 0) * 100)}:${Math.round((p.eta || 0) / 60)}`).join("|");
        if (k === key) return; key = k;
        list.innerHTML = act.length ? act.map(p => `<div class="pb-li">
            <img class="pb-lthumb" alt="" loading="lazy" src="${PB.thumbUrl(p.id, p.filename || "")}" onerror="this.classList.add('none')">
            <div class="pb-lmain"><div class="pb-lname"><a href="#printer-${p.id}">${esc(p.name)}</a> · ${esc(p.filename || "")}</div>
              <div class="pb-prog"><i style="width:${(p.progress || 0) * 100}%;background:var(--orange)"></i></div>
              <div class="pb-lsub">${Math.floor((p.progress || 0) * 100)}%${p.eta != null ? ` · ${fmtDur(p.eta)} left` : ""}${p.state === "paused" ? " · paused" : ""}</div></div>
            <div class="pb-lbtn"><button type="button" data-id="${p.id}" data-act="${p.state === "paused" ? "resume" : "pause"}">${p.state === "paused" ? "Resume" : "Pause"}</button></div></div>`).join("")
          : `<p class="pb-muted">No prints running.</p>`;
        for (const b of list.querySelectorAll("[data-act]")) b.onclick = () => doAction(+b.dataset.id, b.dataset.act);
      },
    };
  },
});

PB.homePanel("camwall", {
  title: "Camera wall", desc: "Every printer's camera in one grid", flush: true,
  icon: PB.icon('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
  settings: [{ k: "cols", label: "Columns", type: "select", def: 3, options: [[2, "2"], [3, "3"], [4, "4"]] }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-camwall"></div>`;
    const wall = host.querySelector(".pb-camwall");
    wall.style.gridTemplateColumns = `repeat(${cfg.cols}, minmax(0, 1fr))`;
    let key = "";
    return {
      update(all) {
        const cams = all.filter(p => p.has_webcam && p.connection === "online");
        const k = cams.map(p => p.id).join();
        if (k === key) return; key = k;
        wall.innerHTML = cams.length ? cams.map(p => `<a class="pb-camtile" href="#printer-${p.id}"><img alt="${esc(p.name)}" data-cam-pid="${p.id}" data-cam-kind="card">
            <span>${esc(p.name)}</span></a>`).join("") : `<p class="pb-muted" style="padding:12px">No cameras online.</p>`;
      },
    };
  },
});

PB.homePanel("news", {
  title: "News", desc: "Printer Buddy announcements (same as the bell)",
  icon: PB.icon('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  create(host) {
    const draw = () => { host.innerHTML = PB.news ? PB.news.html(10) : ""; };
    addEventListener("pb-news", draw);
    draw();
    return { destroy() { removeEventListener("pb-news", draw); } };
  },
});
