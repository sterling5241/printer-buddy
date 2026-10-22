PB.parts = PB.parts || {};
PB.parts.macroParams = () => {
    const dlg = PB.el("dialog", "bd-lib pb-xd pb-macdlg"); document.body.append(dlg);
    function form(m) {
      dlg.innerHTML = `<h3>${esc(m.name)}</h3>${m.description ? `<p class="pb-muted">${esc(m.description)}</p>` : ""}
        <form class="pb-macform">${m.params.map(x => `<label>${esc(x.name)}<input name="${esc(x.name)}" placeholder="${esc(x.default ?? "")}" autocomplete="off" spellcheck="false"></label>`).join("")}</form>
        <div class="bd-libfoot"><button type="button" data-a="no">Cancel</button><button type="button" class="bd-primary" data-a="go">Run</button></div>`;
      const run = () => {
        const args = [...dlg.querySelectorAll("input")].filter(i => i.value.trim()).map(i => `${i.name}=${/\s/.test(i.value.trim()) ? `"${i.value.trim()}"` : i.value.trim()}`);
        const cmd = [m.name, ...args].join(" "); dlg.close(); gcode(cmd); toast(`Sent ${cmd}`);
      };
      dlg.querySelector("[data-a=no]").onclick = () => dlg.close();
      dlg.querySelector("[data-a=go]").onclick = run;
      dlg.querySelector("form").onsubmit = e => { e.preventDefault(); run(); };
      dlg.querySelector("form").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); run(); } };
      dlg.showModal(); dlg.querySelector("input")?.focus();
    }
  return { form, destroy() { dlg.remove(); } };
};
