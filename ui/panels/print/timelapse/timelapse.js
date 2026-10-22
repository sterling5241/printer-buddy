PB.panel("timelapse", {
  title: "Timelapses", desc: "Timelapse videos and settings", single: true, cls: "vtl",
  icon: PB.icon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/><path d="M9.5 9.5v3l2 1"/>'),
  create(host) {
    const box = PB.take("#pgTimelapse");
    host.append(box);
    return { open() { this.loaded = false; }, shown() { if (!this.loaded) { this.loaded = true; loadTimelapses(); } },
             destroy() { PB.park(box); } };
  },
});
