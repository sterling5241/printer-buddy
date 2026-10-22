PB.parts = PB.parts || {};
PB.parts.consoleHelp = (q, input, getHelp) => {
    const hd = PB.el("dialog", "bd-lib pb-xd pb-cmdhelp"); document.body.append(hd);
    q("[data-a=help]").onclick = () => {
      hd.innerHTML = `<div class="pb-ptop"><h3>Commands</h3><button type="button" class="pb-px" aria-label="Close">${PB.ic.x}</button></div>
        <input type="search" placeholder="Search commands or what they do…" aria-label="Search commands"><div class="pb-cmdlist"></div>`;
      const box = hd.querySelector(".pb-cmdlist"), find = hd.querySelector("input");
      const draw = () => {
        const t = find.value.trim().toLowerCase(), all = Object.entries(getHelp()).sort(([a], [b]) => a.localeCompare(b))
          .filter(([c, d]) => !t || c.toLowerCase().includes(t) || (d || "").toLowerCase().includes(t));
        box.innerHTML = all.length ? all.map(([c, d]) => `<button type="button" data-c="${esc(c)}"><b>${esc(c)}</b><span>${esc(d || "")}</span></button>`).join("")
          : `<p class="pb-muted">${Object.keys(getHelp()).length ? "Nothing matches." : "Klipper didn't send its command list (is it running?)."}</p>`;
        for (const b of box.querySelectorAll("[data-c]")) b.onclick = () => { input.value = b.dataset.c + " "; hd.close(); input.focus(); };
      };
      find.oninput = draw; hd.querySelector(".pb-px").onclick = () => hd.close();
      draw(); hd.showModal(); find.focus();
    };
  return { destroy() { hd.remove(); } };
};
