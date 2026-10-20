// Camera panel: the page's own camera box (live stream, camera switcher, grid, full screen all keep working).
PB.panel("camera", {
  title: "Camera", single: true, flush: true,
  settings: [
    { k: "cam", label: "Camera", type: "select", def: "main", options: [["main", "Main camera"], [0, "Camera 1"], [1, "Camera 2"], [2, "Camera 3"], [3, "Camera 4"], ["grid", "All (grid)"]] },
    { k: "aspect", label: "Shape", type: "select", def: "16/9", options: [["16/9", "16:9"], ["4/3", "4:3"], ["1/1", "Square"]] },
    { k: "fit", label: "Fit", type: "select", def: "contain", options: [["contain", "Whole picture"], ["cover", "Fill (crop edges)"]] },
  ],
  icon: PB.icon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  create(host, cfg) {
    const box = PB.take(".pg-cambox");
    host.append(box);
    host.dataset.aspect = cfg.aspect; host.dataset.fit = cfg.fit;
    const pick = p => {   // the chosen camera when a printer opens; the camera buttons can still switch after that
      if (cfg.cam === "main") return;
      const n = p?.cams?.length || 0;
      pageSel = cfg.cam === "grid" ? (n > 1 ? "grid" : 0) : Math.min(+cfg.cam, Math.max(0, n - 1));
    };
    pick(PB.current());
    return { open() { pick(PB.current()); }, destroy() { PB.park(box); delete host.dataset.aspect; delete host.dataset.fit; } };
  },
});
