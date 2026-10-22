(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const pl = dialog("pb-paldlg");
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
})();
