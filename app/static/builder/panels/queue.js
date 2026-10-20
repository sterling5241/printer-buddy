// Queue panel: Moonraker's job queue - prints lined up to run one after another. Add files from the Files panel (+ Queue).
PB.panel("queue", {
  title: "Queue", cls: "adv",
  icon: PB.icon('<path d="M4 6h16M4 12h16M4 18h10"/><path d="M18 16l3 2-3 2z"/>'),
  settings: [{ k: "thumbs", label: "Show thumbnails", type: "check", def: true }],
  create(host, cfg) {
    host.innerHTML = `<div class="pb-tool"><span class="pb-qstate pb-muted"></span><span class="bd-sp"></span>
        <button type="button" class="pb-pri" data-a="start">Start queue</button><button type="button" data-a="pause">Pause queue</button>
        <button type="button" data-a="ref" title="Refresh" aria-label="Refresh">↻</button></div>
      <div class="pb-msg pb-muted"></div><div class="pb-list"></div>`;
    const q = s => host.querySelector(s), list = q(".pb-list"), msg = q(".pb-msg");
    let jobs = [], state = null, timer = null, pid = null;
    const STATE = { ready: "Waiting: starts the next job when the printer is free", paused: "Paused: nothing starts on its own",
                    loading: "Loading the next job…", starting: "Starting the next job…" };
    async function call(action, extra) {
      const id = pageId; if (id === null) return;
      try {
        const r = action ? await api(`/api/printers/${id}/queue`, { method: "POST", body: JSON.stringify({ action, ...extra }) })
                         : await api(`/api/printers/${id}/queue`);
        if (id !== pageId) return;
        jobs = r.jobs || []; state = r.state; draw();
      } catch (e) { if (id === pageId) { jobs = []; state = null; list.innerHTML = ""; msg.textContent = e.message; setButtons(); } }
    }
    function setButtons() {
      q("[data-a=start]").hidden = state !== "paused";
      q("[data-a=pause]").hidden = state === "paused" || state == null;
      q(".pb-qstate").textContent = state ? STATE[state] || state : "";
    }
    function draw() {
      setButtons();
      msg.textContent = jobs.length ? `${jobs.length} job${jobs.length > 1 ? "s" : ""} queued` : "The queue is empty. Add files with + Queue in the Files panel.";
      list.innerHTML = jobs.map((j, i) => `<div class="pb-li">
          ${cfg.thumbs ? `<img class="pb-lthumb" loading="lazy" alt="" src="${PB.thumbUrl(pageId, j.filename)}">` : ""}
          <div class="pb-lmain"><div class="pb-lname">${i + 1}. ${esc(j.filename)}</div>
            <div class="pb-lsub">added ${j.added ? fmtDate(j.added) : "—"}</div></div>
          <div class="pb-lbtn">${i ? `<button type="button" data-next="${esc(j.id)}" title="Make this the next job">↑ Next</button>` : ""}
            <button type="button" data-rm="${esc(j.id)}" title="Remove from the queue" aria-label="Remove">✕</button></div></div>`).join("");
      for (const img of list.querySelectorAll(".pb-lthumb")) img.onerror = () => img.classList.add("none");
      for (const b of list.querySelectorAll("[data-next]")) b.onclick = () => call("jump", { job_id: b.dataset.next });
      for (const b of list.querySelectorAll("[data-rm]")) b.onclick = () => call("remove", { job_ids: [b.dataset.rm] });
    }
    q("[data-a=start]").onclick = () => call("start");
    q("[data-a=pause]").onclick = () => call("pause");
    q("[data-a=ref]").onclick = () => call();
    PB.queueAdd = async path => {   // the Files panel's "+ Queue"
      const id = pageId; if (id === null) return;
      try {
        const r = await api(`/api/printers/${id}/queue`, { method: "POST", body: JSON.stringify({ action: "add", filenames: [path] }) });
        toast(`Queued ${path} (${r.jobs.length} in the queue)`);
        if (id === pageId) { jobs = r.jobs; state = r.state; draw(); }
      } catch (e) { toast(e.message); }
    };
    return {
      open(id) { pid = id; jobs = []; state = null; list.innerHTML = ""; msg.textContent = ""; },
      shown() {
        call();
        clearInterval(timer);   // the queue changes when prints finish: refresh while it's on screen
        timer = setInterval(() => { if (host.offsetParent && pageId !== null) call(); }, 10000);
      },
      destroy() { clearInterval(timer); },
    };
  },
});
