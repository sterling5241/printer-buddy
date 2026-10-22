PB.panel("explorer", {
  title: "State explorer", desc: "Browse every Klipper object and its live values (for tinkering)", cls: "adv",
  icon: PB.icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>'),
  create(host) {
    host.innerHTML = `<div class="pb-tool"><input type="search" placeholder="Filter objects…" aria-label="Filter objects"><select aria-label="Object"></select>
        <label class="pb-chk"><input type="checkbox" data-a="live" checked> Live</label><span class="bd-sp"></span><button type="button" data-a="ref" data-head title="Refresh" aria-label="Refresh">${PB.ic.refresh}</button></div>
      <pre class="pb-expl pb-muted">Pick an object.</pre>`;
    const q = s => host.querySelector(s), sel = q("select"), out = q(".pb-expl");
    let names = [], timer = null;
    async function list() {
      try { names = ((await PB.rpc("printer.objects.list"))?.objects || []).sort(); } catch (e) { out.textContent = e.message; return; }
      fill();
    }
    function fill() {
      const t = q("input[type=search]").value.trim().toLowerCase(), cur = sel.value;
      sel.innerHTML = `<option value="">— ${names.length} objects —</option>` + names.filter(n => !t || n.toLowerCase().includes(t)).map(n => `<option${n === cur ? " selected" : ""}>${esc(n)}</option>`).join("");
    }
    async function show() {
      const n = sel.value; if (!n || pageId === null || !host.offsetParent) return;
      try {
        const r = await PB.rpc("printer.objects.query", { objects: { [n]: null } });
        if (sel.value === n) { out.classList.remove("pb-muted"); out.textContent = JSON.stringify(r?.status?.[n] ?? {}, null, 2); }
      } catch (e) { out.textContent = e.message; }
    }
    q("input[type=search]").oninput = fill;
    sel.onchange = show; q("[data-a=ref]").onclick = () => { list(); show(); };
    return {
      open() { names = []; sel.innerHTML = ""; out.textContent = "Pick an object."; },
      shown() { if (!names.length) list(); clearInterval(timer); timer = setInterval(() => { if (q("[data-a=live]").checked) show(); }, 2000); },
      destroy() { clearInterval(timer); },
    };
  },
});
