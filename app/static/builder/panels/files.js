// Files panel: the page's own G-code file list (print, delete, upload).
PB.panel("files", {
  title: "Files", single: true, cls: "adv",
  icon: PB.icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
  create(host) {
    const box = PB.take("#pgFiles");
    host.append(box);
    return { open() { this.loaded = false; }, shown() { if (!this.loaded) { this.loaded = true; loadFiles(); } },
             destroy() { PB.park(box); } };
  },
});
