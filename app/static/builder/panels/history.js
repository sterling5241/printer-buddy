// History panel: the page's own print history (totals + job list).
PB.panel("history", {
  title: "History", single: true, cls: "adv",
  icon: PB.icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>'),
  create(host) {
    const box = PB.take("#pgHistory");
    host.append(box);
    return { open() { this.loaded = false; }, shown() { if (!this.loaded) { this.loaded = true; loadHistory(true); } },
             destroy() { PB.park(box); } };
  },
});
