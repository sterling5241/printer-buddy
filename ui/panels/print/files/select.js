PB.parts = PB.parts || {};
PB.parts.filesSelect = c => {
    function bulkBar() {
      const bar = c.q(".pb-bulk"); bar.hidden = !c.selecting;
      c.q(".pb-bn").textContent = `${c.picked.size} picked`;
      for (const b of bar.querySelectorAll("[data-b=dl], [data-b=mv], [data-b=del]")) b.disabled = !c.picked.size;
      bar.querySelector("[data-b=mv]").hidden = c.root === "logs"; bar.querySelector("[data-b=del]").hidden = c.root === "logs";
    }
    c.q("[data-a=sel]").onclick = e => { c.selecting = !c.selecting; c.picked.clear(); e.currentTarget.setAttribute("aria-pressed", c.selecting); c.draw(); };
    c.q("[data-b=all]").onclick = () => { for (const x of c.list.querySelectorAll("[data-pick]")) c.picked.add(x.dataset.pick); c.draw(); };
    c.q("[data-b=none]").onclick = () => { c.picked.clear(); c.draw(); };
    c.q("[data-b=dl]").onclick = async () => {
      for (const n of c.picked) { const a = PB.el("a"); a.href = PB.fileUrl(c.root, c.full(n), true); a.download = n; document.body.append(a); a.click(); a.remove(); await new Promise(r => setTimeout(r, 400)); }
    };
    c.q("[data-b=mv]").onclick = async () => {
      const to = prompt(`Move ${c.picked.size} file(s) to which folder? (path from the top, empty = top folder)`, c.dir); if (to === null) return;
      const dest = to.trim().replace(/^\/+|\/+$/g, ""); if (dest.split("/").includes("..")) return toast("Bad folder");
      let ok = 0;
      for (const n of c.picked) { try { await PB.rpc("server.files.move", { source: `${c.root}/${c.full(n)}`, dest: `${c.root}/${dest ? dest + "/" : ""}${n}` }); ok++; } catch (e) { toast(`${n}: ${e.message}`); } }
      toast(`Moved ${ok} file(s)`); c.picked.clear(); c.load();
    };
    c.q("[data-b=del]").onclick = async () => {
      if (!confirm(`Delete ${c.picked.size} file(s)? This can't be undone.`)) return;
      let ok = 0;
      for (const n of c.picked) { try { await PB.rpc("server.files.delete_file", { path: `${c.root}/${c.full(n)}` }); ok++; } catch (e) { toast(`${n}: ${e.message}`); } }
      toast(`Deleted ${ok} file(s)`); c.picked.clear(); c.load();
    };
  return { bulkBar };
};
