(() => {
  const { el } = PB;
  const NAMES = { color: "Colour", mode: "Dark / light (this device)", background: "Background picture", logo: "Logo", sidebar: "Side bar picture",
                  page: "Background (from custom.css)", panel: "See-through panels", head: "Header tint", over: "Background logo" };
  let theme = {};
  const style = el("style"); document.head.append(style);
  const imp = decls => decls.split(";").filter(d => d.trim()).map(d => `${d.trim()} !important`).join("; ");
  function use() {
    const root = document.documentElement, url = n => `/api/ui/theme/${encodeURIComponent(n)}?v=${Date.now()}`;
    if (theme.color) root.style.setProperty("--orange", theme.color); else root.style.removeProperty("--orange");
    document.body.classList.toggle("pb-hasbg", !!theme.background);
    if (theme.background) root.style.setProperty("--pb-bgimg", `url("${url(theme.background)}")`); else root.style.removeProperty("--pb-bgimg");
    if (theme.sidebar) root.style.setProperty("--pb-railimg", `url("${url(theme.sidebar)}")`); else root.style.removeProperty("--pb-railimg");
    document.body.classList.toggle("pb-hasrail", !!theme.sidebar);
    const css = theme.css || {};
    document.body.classList.toggle("pb-thmpage", !!css.page);
    style.textContent = [
      css.page && `html body.pb-thmpage { ${imp(css.page)} }`,
      css.panel && `:is(#page, #home).bd :is(.pb-card, .bd-rail), .panel, .card { ${imp(css.panel)} }`,
      css.head && `:is(#page, #home).bd .pb-card > header, .bd-top { ${imp(css.head)} }`,
      css.over && `body::before { content: ""; position: fixed; pointer-events: none; z-index: -1; ${imp(css.over)} }`,
    ].filter(Boolean).join("\n");
    for (const h of document.querySelectorAll(".top h1, #pgName")) {
      let img = h.previousElementSibling?.classList.contains("pb-logo") ? h.previousElementSibling : null;
      if (!theme.logo) { img?.remove(); continue; }
      if (!img) { img = el("img", "pb-logo"); img.alt = ""; h.before(img); }
      img.src = url(theme.logo);
    }
  }
  api("/api/ui/theme").then(r => { theme = r.theme || {}; use(); }).catch(() => {});

  const look = document.querySelector('.pb-settings [data-body="look"]'); if (!look) return;
  const box = el("div", "pb-thm", `<h4>Theme from Fluidd or Mainsail</h4>
    <p class="pb-muted">Copy a printer's Fluidd or Mainsail look: its colour, dark / light, background, logo, and from its custom.css the
      background, see-through panels and header tint. The rest of custom.css isn't copied, it only fits their own pages.</p>
    <div class="pb-thmrow"><select data-t="printer" aria-label="Printer"></select>
      <select data-t="source" aria-label="Theme from"><option value="fluidd">Fluidd</option><option value="mainsail">Mainsail</option></select>
      <button type="button" data-t="check">Look at its theme</button></div>
    <div class="pb-thmfound"></div>
    <div class="pb-thmrow"><span class="pb-muted pb-thmnow"></span><span class="bd-sp"></span><button type="button" data-t="reset">Back to Printer Buddy's own look</button></div>`);
  look.append(box);
  const q = s => box.querySelector(s), found = q(".pb-thmfound");
  const now = () => {
    q(".pb-thmnow").textContent = theme.source ? `Using the ${theme.source === "fluidd" ? "Fluidd" : "Mainsail"} theme you copied.` : "Using Printer Buddy's own look.";
    q("[data-t=reset]").hidden = !theme.source;
  };
  const fill = () => {
    const sel = q("[data-t=printer]"), was = sel.value;
    sel.innerHTML = [...printers.values()].map(p => `<option value="${p.id}"${p.connection === "online" ? "" : " disabled"}>${esc(p.name)}${p.connection === "online" ? "" : " (offline)"}</option>`).join("")
      || `<option value="">No printers yet</option>`;
    if (was) sel.value = was;
    now();
  };
  q("[data-t=printer]").onfocus = fill;
  fill();
  q("[data-t=check]").onclick = async () => {
    const pid = q("[data-t=printer]").value, source = q("[data-t=source]").value; if (!pid) return;
    found.innerHTML = `<p class="pb-muted">Looking…</p>`;
    let t;
    try { t = await api(`/api/printers/${pid}/theme?source=${source}`); } catch (e) { found.innerHTML = `<p class="pb-muted">${esc(e.message)}</p>`; return; }
    const pic = path => `<img alt="" src="/api/printers/${pid}/file?root=config&path=${encodeURIComponent(path)}">`;
    const rows = [
      t.color && ["color", `<span class="pb-thmsw" style="background:${esc(t.color)}"></span>${esc(t.color)}`],
      t.mode && ["mode", esc(t.mode === "dark" ? "Dark" : "Light")],
      ...Object.entries(t.files).map(([k, path]) => [k, pic(path)]),
      ...Object.entries(t.css || {}).map(([k, decls]) => [k, `<span class="pb-thmcss" style="${esc(decls.split(";").filter(d => /^\s*(-webkit-)?(background|backdrop)/.test(d)).join(";"))}"></span>`]),
    ].filter(Boolean);
    if (!rows.length) { found.innerHTML = `<p class="pb-muted">That printer has no ${source === "fluidd" ? "Fluidd" : "Mainsail"} theme to copy.</p>`; return; }
    found.innerHTML = rows.map(([k, v]) => `<label class="pb-thmpart"><input type="checkbox" value="${k}" checked><b>${NAMES[k]}</b>${v}</label>`).join("")
      + `<div class="pb-thmrow"><button type="button" class="pb-pri" data-t="apply">Use the ticked parts</button></div>`;
    found.querySelector("[data-t=apply]").onclick = async () => {
      const parts = [...found.querySelectorAll("input:checked")].map(c => c.value);
      if (!parts.length) return toast("Tick at least one part");
      try { theme = (await api(`/api/printers/${pid}/theme`, { method: "PUT", body: JSON.stringify({ source, parts }) })).theme; }
      catch (e) { return toast(e.message); }
      if (theme.mode) PB.setTheme(theme.mode);
      use(); now(); found.innerHTML = ""; toast("Theme copied");
    };
  };
  q("[data-t=reset]").onclick = async () => {
    if (!confirm("Go back to Printer Buddy's own look on every device?")) return;
    try { theme = (await api("/api/ui/theme", { method: "DELETE" })).theme || {}; } catch (e) { return toast(e.message); }
    use(); now(); toast("Back to Printer Buddy's own look");
  };
})();
