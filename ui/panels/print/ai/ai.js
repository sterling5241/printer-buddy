PB.panel("ai", {
  title: "AI watch", desc: "AI failure watch: mode, check now, was it right", single: true, cls: "ai",
  icon: PB.icon('<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 15l.8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z"/>'),
  create(host) {
    const box = document.querySelector("#pgAi");   // renderPageAI shows / hides it itself
    host.append(box);
    return { destroy() { PB.park(box); } };
  },
});
