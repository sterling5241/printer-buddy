PB.parts = PB.parts || {};
PB.parts.cfgHighlight = (() => {
    const h = (cls, t) => `<span class="${cls}">${esc(t)}</span>`;
    function gcodeLine(t) {
      return esc(t)
        .replace(/(\{%.*?%\}|\{\{.*?\}\})/g, '<span class="c-jin">$1</span>')
        .replace(/^(\s*)([A-Z][A-Z0-9_]*)\b/, '$1<span class="c-cmd">$2</span>')
        .replace(/(\s)([XYZEFST])(-?\d+(?:\.\d+)?)\b/g, '$1<span class="c-key">$2</span><span class="c-num">$3</span>');
    }
    function line(t) {
      if (/^#\*#/.test(t)) return h("c-auto", t);
      if (/^\s*[#;]/.test(t)) return h("c-com", t);
      let m = t.match(/^(\[)([^\]]+)(\])(.*)$/);
      if (m) return `<span class="c-sec">[${esc(m[2])}]</span>${h("c-com", m[4])}`;
      if (/^\s+\S/.test(t)) { const [code, com] = split(t); return gcodeLine(code) + (com ? h("c-com", com) : ""); }
      m = t.match(/^([A-Za-z0-9_.\-]+)(\s*[:=])(.*)$/);
      if (m) {
        const [val, com] = split(m[3]);
        const v = esc(val).replace(/(^|[\s,])(-?\d+(?:\.\d+)?)(?=$|[\s,])/g, '$1<span class="c-num">$2</span>')
          .replace(/\b(True|False|true|false)\b/g, '<span class="c-bool">$1</span>')
          .replace(/(\{%.*?%\}|\{\{.*?\}\})/g, '<span class="c-jin">$1</span>');
        return `<span class="c-key">${esc(m[1])}</span>${esc(m[2])}${v}${com ? h("c-com", com) : ""}`;
      }
      return esc(t);
    }
    const split = t => { const i = t.search(/\s[#;]/); return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i)]; };
  return { line };
})();
