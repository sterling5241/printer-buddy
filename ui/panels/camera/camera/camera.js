PB.panel("camera", {
  title: "Camera", desc: "Live camera with grid and full screen", single: true, flush: true,
  gear: true,
  settings: [
    { k: "cam", label: "Camera", type: "select", def: "main", options: [["main", "Main camera"], [0, "Camera 1"], [1, "Camera 2"], [2, "Camera 3"], [3, "Camera 4"], ["grid", "All (grid)"]] },
    { k: "aspect", label: "Shape", type: "select", def: "16/9", options: [["16/9", "16:9"], ["4/3", "4:3"], ["1/1", "Square"]] },
    { k: "fit", label: "Fit", type: "select", def: "contain", options: [["contain", "Whole picture"], ["cover", "Fill (crop edges)"]] },
    { k: "cross", label: "Nozzle crosshair", type: "check", def: false },
  ],
  icon: PB.icon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  create(host, cfg) {
    const box = PB.take(".pg-cambox");
    host.append(box);
    host.dataset.aspect = cfg.aspect; host.dataset.fit = cfg.fit;
    const cross = PB.el("div", "pb-cross"); cross.hidden = !cfg.cross; box.querySelector(".pg-cam")?.append(cross);
    const edit = PB.el("button", "pb-camedit pb-iconbtn", `${PB.ic.pencil}Cameras`); edit.type = "button"; edit.title = "Add or edit this printer's cameras";
    box.querySelector(".pg-cam")?.append(edit);
    edit.onclick = e => { e.stopPropagation(); PB.editCameras?.(); };
    const pick = p => {
      if (cfg.cam === "main") return;
      const n = p?.cams?.length || 0;
      pageSel = cfg.cam === "grid" ? (n > 1 ? "grid" : 0) : Math.min(+cfg.cam, Math.max(0, n - 1));
    };
    pick(PB.current());
    return { open() { pick(PB.current()); }, destroy() { cross.remove(); edit.remove(); PB.park(box); delete host.dataset.aspect; delete host.dataset.fit; } };
  },
});
