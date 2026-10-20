// Camera panel: the page's own camera box (live stream, camera switcher, grid, full screen all keep working).
PB.panel("camera", {
  title: "Camera", single: true, flush: true,
  icon: PB.icon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  create(host) {
    const box = PB.take(".pg-cambox");
    host.append(box);
    return { destroy() { PB.park(box); } };
  },
});
