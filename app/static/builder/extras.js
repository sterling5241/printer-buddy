// Printer Buddy - printer page extras (Fluidd / Mainsail-style quality of life, our own code). Loaded after builder.js.
//  - Klipper error card: when Klipper isn't ready, its message + Restart / Firmware restart / klippy.log, on every tab
//  - drag & drop: drop G-code anywhere on a printer page to upload it (into the folder open in the Files panel)
//  - keyboard shortcuts (off by default; Settings > Look): Ctrl+Shift+E e-stop, Shift+P pause/resume, Shift+C cancel,
//    Shift+H home, ? help
//  - macro prompts: macros that send  RESPOND TYPE=command MSG="action:prompt_begin …"  get a pop-up with buttons
//  - calibration helpers: manual probe (PROBE_CALIBRATE, Z_ENDSTOP_CALIBRATE …), BED_SCREWS_ADJUST, SCREWS_TILT_CALCULATE
(() => {
  const { el } = PB;
  const page = $("#page");
  const onPage = () => pageId !== null && !page.hidden && page.offsetParent !== null;
  const cur = () => PB.current();
  const send = script => PB.gcode(script);
  const live = p => p && p.connection === "online" && p.klippy_state === "ready";
  const dialog = cls => { const d = el("dialog", `bd-lib pb-xd ${cls}`); document.body.append(d); return d; };
  const hooks = [];   // run on every printer page refresh with the open printer
  const baseRender = renderPage;
  renderPage = () => { baseRender(); const p = cur(); if (p) for (const f of hooks) { try { f(p); } catch (e) { console.error(e); } } };

  // ---- Klipper error card ------------------------------------------------------------------------------------------
  const ban = el("div", "pb-kban"); ban.hidden = true;
  (page.querySelector(".bd-top") || page.firstChild).after(ban);
  let banKey = "";
  hooks.push(p => {
    const bad = p.connection === "online" && p.klippy_state && p.klippy_state !== "ready";
    ban.hidden = !bad; if (!bad) { banKey = ""; return; }
    const key = `${p.id}|${p.klippy_state}|${p.klippy_message}`; if (key === banKey) return; banKey = key;
    const starting = p.klippy_state === "startup";
    ban.className = `pb-kban ${starting ? "warn" : "err"}`;
    ban.innerHTML = `<div class="pb-kbhead"><b>${starting ? "Klipper is starting…" : `Klipper: ${esc(p.klippy_state)}`}</b><span class="bd-sp"></span>
        <a href="${PB.fileUrl("logs", "klippy.log", 1)}" class="pb-kblog">klippy.log ↓</a>
        <button type="button" data-k="restart">Restart</button><button type="button" data-k="fw">Firmware restart</button>
        <button type="button" data-k="svc" title="Restart the Klipper service on the printer">Restart service</button></div>
      ${p.klippy_message ? `<pre>${esc(p.klippy_message)}</pre>` : ""}`;
    const run = async (method, params, what) => { try { await PB.rpc(method, params); toast(what); } catch (e) { toast(e.message); } };
    ban.querySelector("[data-k=restart]").onclick = () => run("printer.restart", undefined, "Restarting Klipper…");
    ban.querySelector("[data-k=fw]").onclick = () => run("printer.firmware_restart", undefined, "Firmware restart…");
    ban.querySelector("[data-k=svc]").onclick = () => run("machine.services.restart", { service: "klipper" }, "Restarting the Klipper service…");
  });

  // ---- drag & drop upload -------------------------------------------------------------------------------------------
  const drop = el("div", "pb-drop", `<div>Drop G-code to upload</div>`); drop.hidden = true; document.body.append(drop);
  const isFiles = e => [...(e.dataTransfer?.types || [])].includes("Files");
  let dragN = 0;
  addEventListener("dragenter", e => {
    if (!isFiles(e) || !onPage()) return; e.preventDefault(); dragN++;
    const p = cur(); drop.firstChild.textContent = `Drop G-code to upload to ${p ? p.name : "this printer"}`; drop.hidden = false;
  });
  addEventListener("dragover", e => { if (isFiles(e) && onPage()) e.preventDefault(); });
  addEventListener("dragleave", e => { if (isFiles(e) && --dragN <= 0) { dragN = 0; drop.hidden = true; } });
  addEventListener("drop", e => {
    if (!isFiles(e) || !onPage()) return;
    e.preventDefault(); dragN = 0; drop.hidden = true;
    const all = [...e.dataTransfer.files], ok = all.filter(f => /\.(gcode|gco|g|bgcode|ufp)$/i.test(f.name));
    if (all.length > ok.length) toast(`Skipped ${all.length - ok.length} file(s) that aren't G-code`);
    if (!ok.length) return;
    if (PB.uploadFiles) return PB.uploadFiles(ok);
    (async () => {   // no Files panel on the page: upload to the top G-code folder
      const id = pageId;
      for (const f of ok) {
        try { await fetch(`/api/printers/${id}/files/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f })
          .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); }); toast(`Uploaded ${f.name}`); }
        catch (err) { toast(`${f.name}: upload failed: ${err.message}`); }
      }
    })();
  });

  // ---- keyboard shortcuts -------------------------------------------------------------------------------------------
  const KEYS = [["Ctrl + Shift + E", "Emergency stop (no confirm)"], ["Shift + P", "Pause / resume the print"], ["Shift + C", "Cancel the print"],
                ["Shift + H", "Home all axes (not while printing)"], ["?", "This list"]];
  const help = dialog("pb-keys");
  help.innerHTML = `<h3>Keyboard shortcuts</h3><table class="pb-ktable">${KEYS.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join("")}</table>
    <p class="pb-muted">Turn these on or off in Settings → Look.</p><div class="bd-libfoot"><button type="button">Close</button></div>`;
  help.querySelector("button").onclick = () => help.close();
  addEventListener("keydown", e => {
    if (!PB.store.get("pb-keys", false) || !onPage() || document.querySelector("dialog[open]") || e.repeat) return;
    const t = e.target; if (t.closest?.("input, textarea, select, [contenteditable=true]")) return;
    const p = cur(); if (!p) return;
    const k = e.key.toLowerCase(), printing = p.state === "printing" || p.state === "paused";
    let act = null;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === "e") act = () => api(`/api/printers/${p.id}/estop`, { method: "POST" }).then(() => toast("Emergency stop sent"), err => toast(err.message));
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (e.shiftKey && k === "p" && printing) act = () => doAction(p.id, p.state === "paused" ? "resume" : "pause");
    else if (e.shiftKey && k === "c" && printing) act = () => doAction(p.id, "cancel");
    else if (e.shiftKey && k === "h" && !printing && live(p)) act = () => { send("G28"); toast("Homing…"); };
    else if (e.key === "?") act = () => help.showModal();
    if (act) { e.preventDefault(); act(); }
  });

  // ---- macro prompts (action:prompt_*) -----------------------------------------------------------------------------
  const prompts = new Map();   // printer id -> { title, items, footer, group, shown }
  const pd = dialog("pb-prompt");
  pd.addEventListener("cancel", e => { e.preventDefault(); closePrompt(); });
  const COLORS = ["primary", "secondary", "info", "warning", "error", "success"];
  const unq = s => s.trim().replace(/^"(.*)"$/s, "$1").replace(/^'(.*)'$/s, "$1");
  function button(msg) {
    const [label, cmd, color] = unq(msg).split("|").map(x => (x || "").trim());
    return { label, cmd: cmd || label, color: COLORS.includes((color || "").toLowerCase()) ? color.toLowerCase() : "" };
  }
  function onPrompt(id, line) {
    const m = /^(?:\/\/\s*)?action:prompt_(\w+)\s*(.*)$/.exec(line.trim()); if (!m) return false;
    const [, type, msg] = m; let s = prompts.get(id);
    if (type === "begin") { s = { title: unq(msg) || "Printer", items: [], footer: [], group: null, shown: false }; prompts.set(id, s); }
    else if (type === "end") { prompts.delete(id); if (id === pageId && pd.open) pd.close(); return true; }
    else if (!s) return true;
    else if (type === "text") s.items.push({ text: unq(msg) });
    else if (type === "button") (s.group || s.items).push(button(msg));
    else if (type === "button_group_start") { s.group = []; s.items.push({ group: s.group }); }
    else if (type === "button_group_end") s.group = null;
    else if (type === "footer_button") s.footer.push(button(msg));
    else if (type === "show") s.shown = true;
    if (id === pageId) drawPrompt();
    return true;
  }
  const btn = b => `<button type="button" class="pb-pbtn ${b.color ? "c-" + b.color : ""}" data-cmd="${esc(b.cmd)}">${esc(b.label)}</button>`;
  function drawPrompt() {
    const s = prompts.get(pageId);
    if (!s || !s.shown) { if (pd.open) pd.close(); return; }
    pd.innerHTML = `<div class="pb-ptop"><h3>${esc(s.title)}</h3><button type="button" class="pb-px" aria-label="Close">✕</button></div>
      <div class="pb-pbody">${s.items.map(i => i.text != null ? `<p>${esc(i.text)}</p>` : i.group ? `<div class="pb-pgroup">${i.group.map(btn).join("")}</div>` : `<div class="pb-pgroup">${btn(i)}</div>`).join("")}</div>
      ${s.footer.length ? `<div class="bd-libfoot">${s.footer.map(btn).join("")}</div>` : ""}`;
    pd.querySelector(".pb-px").onclick = closePrompt;
    for (const b of pd.querySelectorAll("[data-cmd]")) b.onclick = () => send(b.dataset.cmd);
    if (!pd.open) pd.showModal();
  }
  function closePrompt() { prompts.delete(pageId); pd.close(); send('RESPOND TYPE=command MSG="action:prompt_end"'); }
  const baseCon = conAdd;
  conAdd = (id, kind, text) => { if (typeof text === "string" && text.includes("action:prompt_") && onPrompt(id, text)) return; baseCon(id, kind, text); };
  PB.onRoute(() => { if (pd.open) pd.close(); drawPrompt(); });

  // ---- calibration helpers ------------------------------------------------------------------------------------------
  const mp = dialog("pb-mprobe"), bs = dialog("pb-bscrew"), st = dialog("pb-tilt");
  for (const d of [mp, bs]) d.addEventListener("cancel", e => e.preventDefault());   // close with Abort / Accept only
  const STEPS = [-1, -0.1, -0.05, -0.01, 0.01, 0.05, 0.1, 1];
  const fmt = v => v == null ? "—" : Number(v).toFixed(3);
  let mpKey = "", bsKey = "", tiltSeen = new Map();
  hooks.push(p => {
    // manual probe (TESTZ / ACCEPT / ABORT)
    const m = p.manual_probe;
    if (m?.active) {
      const key = `${p.id}|${m.z}|${m.lo}|${m.hi}`;
      if (key !== mpKey) {
        mpKey = key;
        mp.innerHTML = `<h3>Manual probe</h3><p class="pb-muted">Lower the nozzle until a sheet of paper just drags, then Accept.</p>
          <div class="pb-mpz"><span><small>Lower bound</small>${fmt(m.lo)}</span><span class="now"><small>Z now</small>${fmt(m.z)}</span><span><small>Upper bound</small>${fmt(m.hi)}</span></div>
          <div class="pb-mpsteps">${STEPS.map(s => `<button type="button" data-z="${s > 0 ? "+" : ""}${s}">${s > 0 ? "+" : ""}${s}</button>`).join("")}</div>
          <div class="pb-mpsteps"><button type="button" data-z="--" title="TESTZ Z=--: halfway down, bigger step">−−</button><button type="button" data-z="-" title="TESTZ Z=-: halfway to the lower bound">− ½</button>
            <button type="button" data-z="+" title="TESTZ Z=+: halfway to the upper bound">+ ½</button><button type="button" data-z="++" title="TESTZ Z=++">++</button></div>
          <div class="bd-libfoot"><button type="button" data-a="abort">Abort</button><button type="button" class="bd-primary" data-a="accept">Accept</button></div>`;
        for (const b of mp.querySelectorAll("[data-z]")) b.onclick = () => send(`TESTZ Z=${b.dataset.z}`);
        mp.querySelector("[data-a=abort]").onclick = () => send("ABORT");
        mp.querySelector("[data-a=accept]").onclick = () => send("ACCEPT");
      }
      if (!mp.open) mp.showModal();
    } else if (mp.open) { mp.close(); mpKey = ""; }
    // bed screws (ADJUSTED / ACCEPT / ABORT)
    const b = p.bed_screws;
    if (b?.active) {
      const key = `${p.id}|${b.state}|${b.screw}|${b.accepted}`;
      if (key !== bsKey) {
        bsKey = key;
        bs.innerHTML = `<h3>Bed screws</h3>
          <dl class="pb-kv"><dt>Screw</dt><dd>${b.screw == null ? "—" : b.screw + 1}</dd><dt>Pass</dt><dd>${b.state === "fine" ? "Fine adjustment" : "Coarse adjustment"}</dd>
            <dt>Accepted without change</dt><dd>${b.accepted ?? 0}</dd></dl>
          <p class="pb-muted">Turn the screw until a sheet of paper just drags. Changed it? <b>Adjusted</b>. Already right? <b>Accept</b>.</p>
          <div class="bd-libfoot"><button type="button" data-a="abort">Abort</button><button type="button" data-a="adj">Adjusted</button><button type="button" class="bd-primary" data-a="acc">Accept</button></div>`;
        bs.querySelector("[data-a=abort]").onclick = () => send("ABORT");
        bs.querySelector("[data-a=adj]").onclick = () => send("ADJUSTED");
        bs.querySelector("[data-a=acc]").onclick = () => send("ACCEPT");
      }
      if (!bs.open) bs.showModal();
    } else if (bs.open) { bs.close(); bsKey = ""; }
    // screws tilt results: pop up when new results arrive (not for old results already there when the page opened)
    const t = p.screws_tilt;
    if (t) {
      const key = JSON.stringify(t);
      if (!tiltSeen.has(p.id)) tiltSeen.set(p.id, key);
      else if (tiltSeen.get(p.id) !== key) { tiltSeen.set(p.id, key); if (Object.keys(t.results || {}).length || t.error) showTilt(t); }
    }
  });
  function showTilt(t) {
    const rows = Object.entries(t.results || {}).map(([name, r]) => {
      const [h, mm] = String(r.adjust || "00:00").split(":").map(Number), mins = (h || 0) * 60 + (mm || 0);
      const ok = r.is_base || mins < 6;
      return `<tr class="${ok ? "ok" : "bad"}"><td>${esc(r.name || name)}</td><td>${Number(r.z).toFixed(4)}</td>
        <td>${r.is_base ? "<b>base</b>" : mins === 0 ? "✓" : `${r.sign === "CW" ? "↻ clockwise" : "↺ anticlockwise"} <b>${esc(r.adjust)}</b>`}</td></tr>`;
    }).join("");
    st.innerHTML = `<h3>Screws tilt</h3>${t.error ? `<p class="pb-terr">The last run failed. Check the console.</p>` : ""}
      ${rows ? `<table class="pb-ttable"><tr><th>Screw</th><th>Z</th><th>Turn</th></tr>${rows}</table>
      <p class="pb-muted">01:15 = one full turn and a quarter. Green = within 5 minutes (good enough).</p>` : ""}
      <div class="bd-libfoot"><button type="button" data-a="close">Close</button><button type="button" class="bd-primary" data-a="retry">Run again</button></div>`;
    st.querySelector("[data-a=close]").onclick = () => st.close();
    st.querySelector("[data-a=retry]").onclick = () => { st.close(); send("SCREWS_TILT_CALCULATE"); toast("Probing the screws…"); };
    if (!st.open) st.showModal();
  }
  // ---- pause at layer (SET_PAUSE_NEXT_LAYER / SET_PAUSE_AT_LAYER macros, as in Mainsail's / Fluidd's macro sets) ----
  const pl = dialog("pb-pal");
  PB.pauseAtLayer = async () => {
    const p = cur(); if (!p?.pause_layer) return;
    const st = p.pause_layer, layer = p.layer || 0, total = p.total_layers || 0;
    let names = []; try { names = ((await api(`/api/printers/${p.id}/macros`)).macros || []).map(m => m.name); } catch {}
    const macros = ["PAUSE", ...names.filter(n => n === "M600" || n === "FILAMENT_CHANGE")];
    pl.innerHTML = `<h3>Pause at layer</h3><p class="pb-muted">Now on layer ${layer || "?"}${total ? ` of ${total}` : ""}.
        ${st.next?.enable ? "<b>Set: pause at the next layer.</b>" : st.at?.enable ? `<b>Set: pause at layer ${esc(String(st.at.layer))}.</b>` : ""}</p>
      <label class="bd-check"><input type="radio" name="w" value="next" checked> At the next layer</label>
      <label class="bd-check"><input type="radio" name="w" value="at"> At layer <input type="number" class="pb-palnum" min="${layer + 1}" ${total ? `max="${total}"` : ""} value="${st.at?.layer || layer + 1}"></label>
      <label class="bd-field">Then run <select data-a="call">${macros.map(m => `<option>${m}</option>`).join("")}</select></label>
      <div class="bd-libfoot">${st.next?.enable || st.at?.enable ? `<button type="button" data-a="off">Clear it</button>` : ""}<span class="bd-sp"></span>
        <button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="ok">Set</button></div>`;
    pl.querySelector(".pb-palnum").onfocus = () => { pl.querySelector("input[value=at]").checked = true; };
    pl.querySelector("[data-a=no]").onclick = () => pl.close();
    pl.querySelector("[data-a=off]")?.addEventListener("click", () => { send("SET_PAUSE_NEXT_LAYER ENABLE=0\nSET_PAUSE_AT_LAYER ENABLE=0"); pl.close(); toast("Pause at layer cleared"); });
    pl.querySelector("[data-a=ok]").onclick = () => {
      const call = pl.querySelector("[data-a=call]").value, at = pl.querySelector("input[value=at]").checked, n = Math.round(+pl.querySelector(".pb-palnum").value);
      if (at && !(n > layer)) return toast("Pick a layer after the current one");
      send(at ? `SET_PAUSE_AT_LAYER ENABLE=1 LAYER=${n} MACRO=${call}` : `SET_PAUSE_NEXT_LAYER ENABLE=1 MACRO=${call}`);
      pl.close(); toast(at ? `Will pause at layer ${n}` : "Will pause at the next layer");
    };
    pl.showModal();
  };
  PB.showTilt = () => { const p = cur(); if (p?.screws_tilt) showTilt(p.screws_tilt); };
})();
