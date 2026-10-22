PB.parts = PB.parts || {};
PB.parts.gcodeParse = (() => {
    // slicer feature names (PrusaSlicer / Orca / Bambu / Cura / Simplify3D) -> FEATS index
    const TYPE_RE = /^;\s*(?:TYPE:|FEATURE[: ])\s*(.+)/i;
    function featOf(n) {
      n = n.toLowerCase();
      return /outer|external|overhang/.test(n) ? 0 : /bridge/.test(n) ? 4 : /support/.test(n) ? 5 : /skirt|brim|prime|tower|purge|wipe/.test(n) ? 6
        : /top|bottom|solid|skin|ironing/.test(n) ? 3 : /inner|perimeter|wall/.test(n) ? 1 : /fill|gap/.test(n) ? 2 : 7;
    }
    // parse: layers = [{z, start (byte offset), segs: Float32Array [x0,y0,x1,y1,...], trav: [...], offs: byte offset per extrusion seg}]
    function parse(text) {
      const L = []; let cur = null, x = 0, y = 0, z = 0, e = 0, absE = true, abs = true, off = 0, ft = 7, tool = 0;
      const seg = [], trav = [], offs = [], fts = [], tls = [];
      const flush = () => {
        if (cur) {
          cur.segs = Float32Array.from(seg); cur.trav = Float32Array.from(trav); cur.offs = Float64Array.from(offs);
          cur.ft = Uint8Array.from(fts); cur.tl = Uint8Array.from(tls);
          cur.h = Math.min(1, Math.max(0.05, L.length ? cur.z - L.at(-1).z : cur.z)); L.push(cur);
        }
        seg.length = trav.length = offs.length = fts.length = tls.length = 0;
      };
      for (const raw of text.split("\n")) {
        const at = off; off += raw.length + 1;
        if (raw.charCodeAt(0) === 59) { const m = TYPE_RE.exec(raw); if (m) ft = featOf(m[1]); continue; }
        const line = raw.split(";")[0].trim().toUpperCase();
        if (!line) continue;
        const w = line.split(/\s+/), c = w[0];
        if (c === "G90") { abs = true; absE = true; continue; } if (c === "G91") { abs = false; absE = false; continue; }
        if (c === "M82") { absE = true; continue; } if (c === "M83") { absE = false; continue; }
        if (c === "G92") { for (const t of w) if (t[0] === "E") e = +t.slice(1); continue; }
        if (c[0] === "T" && /^T\d+$/.test(c)) { tool = +c.slice(1); continue; }
        if (c !== "G0" && c !== "G1" && c !== "G2" && c !== "G3") continue;
        let nx = x, ny = y, nz = z, de = 0;
        for (const t of w.slice(1)) {
          const v = +t.slice(1); if (isNaN(v)) continue;
          if (t[0] === "X") nx = abs ? v : x + v; else if (t[0] === "Y") ny = abs ? v : y + v;
          else if (t[0] === "Z") nz = abs ? v : z + v; else if (t[0] === "E") { de = absE ? v - e : v; e = absE ? v : e + v; }
        }
        const extruding = de > 0 && (nx !== x || ny !== y);
        if (extruding && (!cur || Math.abs(nz - cur.z) > 1e-4)) { flush(); cur = { z: nz, start: at }; }
        if (cur && (nx !== x || ny !== y)) {
          if (extruding) { seg.push(x, y, nx, ny); offs.push(at); fts.push(ft); tls.push(tool); } else if (Math.abs(nz - cur.z) < 1e-4) trav.push(x, y, nx, ny);
        }
        x = nx; y = ny; z = nz;
      }
      flush();
      return L;
    }
  return parse;
})();
