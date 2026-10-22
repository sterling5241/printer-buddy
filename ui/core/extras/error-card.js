(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const page = $("#page");
  const ban = el("div", "pb-kban"); ban.hidden = true;
  (page.querySelector(".bd-top") || page.firstChild).after(ban);
  let banKey = "";
  pageHook(p => {
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
})();
