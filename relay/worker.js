import NEWS from "./news.json";
// Printer Buddy share relay: a Cloudflare Worker for www.printerbuddy.stream
//
// Viewers open   https://www.printerbuddy.stream/share/user/<ID>/printer/<printer>/<code>
// and the Worker fetches it through that box's tunnel:
//                https://u<ID>.printerbuddy.stream/share/printer/<printer>/<code>
// so viewers only ever see printerbuddy.stream, never the box's home address.
//
// Setup (once):
//  1. Cloudflare dashboard > Workers & Pages > Create > Worker, name it "printer-buddy-share",
//     replace its code with this file, Deploy.
//  2. Worker > Settings > Domains & Routes > Add route:  www.printerbuddy.stream/*
//     (and printerbuddy.stream/* if you want the bare domain too).
//  3. DNS: make sure "www" exists and is proxied (orange cloud). If it points nowhere,
//     add an AAAA record: name www, value 100::, proxied.
//  4. Optional: Worker > Settings > Variables: SHARE_DOMAIN = printerbuddy.stream
//     (otherwise it's taken from the address the viewer used).
//
// Automatic tunnel setup (/api/tunnel) needs a few more settings: see relay/README.md.

const SHARE = /^\/share\/user\/(\d{6,10})\/(printer\/\d{1,9}\/[A-Za-z0-9_-]{20,100}(?:\/(?:status|snapshot|stream))?)\/?$/;

const page = (title, text, status) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;background:#0B0B0D;color:#F4F2F8;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:16px}
h1{margin:0 0 8px;font-size:26px}p{margin:0;color:#8E8A99}b{color:#FF8A1F}</style></head>
<body><div><p>Printer <b>Buddy</b></p><h1>${title}</h1><p>${text}</p></div></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

// News for every Printer Buddy box (the bell on the home page). Edit relay/news.json; see relay/news.example.
function newsApi() {
  const items = (Array.isArray(NEWS) ? NEWS : []).filter(n => n && n.id && n.title).slice(0, 50);
  return new Response(JSON.stringify({ items }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600", "access-control-allow-origin": "*" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/tunnel") return tunnelApi(request, env, ctx, url);
    if (url.pathname === "/api/contribute") return contributeApi(request, env);
    if (url.pathname === "/api/ai-stats") return statsApi(env);
    if (url.pathname === "/api/news") return newsApi();
    const m = url.pathname.match(SHARE);
    if (!m) {
      if (url.pathname === "/") return page("Printer Buddy", "Self-hosted 3D printer monitoring. Open a share link to watch a printer.", 200);
      return page("Link not found", "Check that you copied the whole link.", 404);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    const domain = (env.SHARE_DOMAIN || url.hostname).replace(/^www\./, "");
    const target = `https://u${m[1]}.${domain}/share/${m[2]}${url.search}`;

    // pass along only harmless headers (no cookies or auth)
    const headers = new Headers();
    for (const h of ["accept", "accept-language", "user-agent", "range"]) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }

    let res;
    try {
      res = await fetch(target, { method: request.method, headers, redirect: "manual" });
    } catch {
      return offline(m[2]);
    }
    // 502/503/530 = the box or its tunnel is down (Cloudflare error 1033 comes back as 530)
    if ([502, 503, 504, 530].includes(res.status)) return offline(m[2]);

    const out = new Response(res.body, res);   // streams through, so live video works
    out.headers.delete("set-cookie");
    out.headers.set("cache-control", "no-store");
    out.headers.set("x-robots-tag", "noindex");
    out.headers.set("referrer-policy", "no-referrer");
    return out;
  },

  // daily Discord summary (Worker > Settings > Triggers > Cron, e.g. "0 13 * * *")
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dailySummary(env));
  },
};

function offline(path) {
  // JSON for the share page's background requests, a page for people opening the link
  if (/\/(status|snapshot|stream)$/.test(path)) {
    return new Response(JSON.stringify({ error: "This printer is offline right now. Try again later." }),
      { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  return page("Printer is offline", "This printer's box isn't reachable right now. Try again in a little while.", 503);
}

// ---------------------------------------------------------------- automatic tunnels
// A box asks for its tunnel:   POST   /api/tunnel  {"id": "1234567", "port": 8080, "key": "<box key, after the first time>"}
//   -> creates tunnel "pb-u<id>" routing https://u<id>.<domain>/share/... to http://localhost:<port>,
//      plus the DNS record, and returns {"token", "key", "hostname"}. Asking again (with the key) reuses
//      the same tunnel and updates the port if it changed.
// A box removes its tunnel:    DELETE /api/tunnel  {"id": "...", "key": "..."}
// Only the box holding the key can change or delete its tunnel.
//
// Needs (Worker > Settings): secrets CF_API_TOKEN, DISCORD_WEBHOOK (optional); variables CF_ACCOUNT_ID,
// CF_ZONE_ID, SHARE_DOMAIN, MAX_TUNNELS (optional, default 500), NEW_PER_IP_PER_DAY (optional, default 5);
// KV binding BOXES.

const json = (data, status = 200) => new Response(JSON.stringify(data),
  { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function newKey() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function cf(env, method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const err = new Error((j.errors || []).map(e => `${e.code}: ${e.message}`).join("; ") || `Cloudflare HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return j.result;
}

function routing(env, id, host, port) {
  return cf(env, "PUT", `/accounts/${env.CF_ACCOUNT_ID}/cfd_tunnel/${id}/configurations`, {
    config: { ingress: [
      { hostname: host, path: "^/share/", service: `http://localhost:${port}`, originRequest: {} },
      { service: "http_status:404" },
    ] },
  });
}

async function dnsRecord(env, host) {
  const list = await cf(env, "GET", `/zones/${env.CF_ZONE_ID}/dns_records?type=CNAME&name=${encodeURIComponent(host)}`);
  return (list || [])[0] || null;
}

async function pointDns(env, host, tunnelId) {
  const rec = { type: "CNAME", name: host, content: `${tunnelId}.cfargotunnel.com`, proxied: true };
  const old = await dnsRecord(env, host);
  if (old) return cf(env, "PUT", `/zones/${env.CF_ZONE_ID}/dns_records/${old.id}`, rec);
  return cf(env, "POST", `/zones/${env.CF_ZONE_ID}/dns_records`, rec);
}

async function tunnelApi(request, env, ctx, url) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_ZONE_ID || !env.BOXES) {
    return json({ error: "Automatic setup isn't configured on this server yet." }, 503);
  }
  if (request.method !== "POST" && request.method !== "DELETE") return json({ error: "Method not allowed" }, 405);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const id = String(b.id || "");
  if (!/^\d{6,10}$/.test(id)) return json({ error: "Bad Printer Buddy ID" }, 400);
  const domain = (env.SHARE_DOMAIN || url.hostname).replace(/^www\./, "");
  const host = `u${id}.${domain}`;
  const kvKey = `box:${id}`;
  const box = await env.BOXES.get(kvKey, "json");

  if (box && (typeof b.key !== "string" || (await sha256(b.key)) !== box.key_hash)) {
    return json({ error: "This Printer Buddy ID is already set up on another box (or this box lost its key). " +
                        "Remove PB_USER_ID and PB_TUNNEL_KEY from printer-buddy.env to get a new ID." }, 403);
  }

  try {
    if (request.method === "DELETE") {
      if (!box) return json({ ok: true, note: "nothing to remove" });
      const rec = await dnsRecord(env, host);
      if (rec) await cf(env, "DELETE", `/zones/${env.CF_ZONE_ID}/dns_records/${rec.id}`);
      try {
        await cf(env, "DELETE", `/accounts/${env.CF_ACCOUNT_ID}/cfd_tunnel/${box.tunnel_id}`);
      } catch (e) {
        return json({ error: `The tunnel is still connected. Stop cloudflared on the box and try again in a minute. (${e.message})` }, 409);
      }
      await env.BOXES.delete(kvKey);
      return json({ ok: true });
    }

    const port = Number(b.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return json({ error: "Bad port" }, 400);

    // already set up: reuse, update the port if it changed
    if (box) {
      if (box.port !== port) {
        await routing(env, box.tunnel_id, host, port);
        box.port = port;
      }
      box.updated = Date.now();
      await env.BOXES.put(kvKey, JSON.stringify(box));
      return json({ token: box.token, hostname: host });
    }

    // new box: limits first
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const day = new Date().toISOString().slice(0, 10);
    const ipKey = `ip:${ip}:${day}`;
    const perIp = Number(await env.BOXES.get(ipKey) || 0);
    if (perIp >= Number(env.NEW_PER_IP_PER_DAY || 5)) return json({ error: "Too many new boxes from this network today. Try again tomorrow." }, 429);
    const total = Number(await env.BOXES.get("count") || 0);
    if (total >= Number(env.MAX_TUNNELS || 500)) return json({ error: "Wireless sharing is full right now. Please tell the Printer Buddy team." }, 503);

    const t = await cf(env, "POST", `/accounts/${env.CF_ACCOUNT_ID}/cfd_tunnel`, { name: `pb-u${id}`, config_src: "cloudflare" });
    await routing(env, t.id, host, port);
    await pointDns(env, host, t.id);

    const key = newKey();
    await env.BOXES.put(kvKey, JSON.stringify({ tunnel_id: t.id, token: t.token, key_hash: await sha256(key),
                                                port, created: Date.now(), updated: Date.now() }));
    await env.BOXES.put(ipKey, String(perIp + 1), { expirationTtl: 2 * 24 * 3600 });
    await env.BOXES.put("count", String(total + 1));

    if (env.DISCORD_WEBHOOK) {
      ctx.waitUntil(fetch(env.DISCORD_WEBHOOK, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: `Box ${id} set up wireless sharing!` }),
      }).catch(() => {}));
    }
    return json({ token: t.token, key, hostname: host }, 201);
  } catch (e) {
    return json({ error: `Cloudflare said: ${e.message}` }, 502);
  }
}

// ---------------------------------------------------------------- AI training photos
// A box that opted in ("Help improve the AI") sends one labelled photo:
//   POST /api/contribute  {"id": "1234567", "label": "spaghetti", "source": "alert_yes",
//                          "image": "<base64 JPEG>", "meta": {"model": "basic-v1", "score": 0.87, ...}}
// The Worker commits it to the private data repo as incoming/<label>/<id>-<time>-<source>-<score>-...jpg
// (you review it and move the good ones to photos/, which is what training uses)
// (full details in the commit message). Boxes never get any GitHub access themselves.
//
// Needs: secret GITHUB_TOKEN (fine-grained, Contents: Read and write on the data repo only),
// variable DATA_REPO (e.g. sterling5241/printer-buddy-data); optional CONTRIB_PER_BOX_PER_DAY (default 50),
// CONTRIB_PER_IP_PER_DAY (default 200). Uses the same BOXES KV for the daily counters.

const LABELS = ["ok", "spaghetti", "warping", "first_layer", "failure", "stringing", "blob", "crack"];
const SOURCES = ["alert_yes", "alert_no", "print_ok", "print_failed", "user"];
const VERDICTS = ["right", "false_alarm", "missed"];

async function contributeApi(request, env) {
  if (!env.GITHUB_TOKEN || !env.DATA_REPO || !env.BOXES) return json({ error: "Photo sharing isn't set up on this server yet." }, 503);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const id = String(b.id || ""), label = String(b.label || ""), source = String(b.source || "user");
  if (!/^\d{6,10}$/.test(id)) return json({ error: "Bad Printer Buddy ID" }, 400);
  if (!LABELS.includes(label)) return json({ error: `label must be one of: ${LABELS.join(", ")}` }, 400);
  if (!SOURCES.includes(source)) return json({ error: "Bad source" }, 400);

  let bytes;
  try { bytes = Uint8Array.from(atob(String(b.image || "")), c => c.charCodeAt(0)); }
  catch { return json({ error: "image must be base64" }, 400); }
  if (bytes.length < 1000 || bytes.length > 500_000) return json({ error: "image must be 1-500 KB" }, 400);
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return json({ error: "image must be a JPEG" }, 400);

  // daily limits
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const boxKey = `contrib:box:${id}:${day}`, ipKey = `contrib:ip:${ip}:${day}`;
  const [nBox, nIp] = await Promise.all([env.BOXES.get(boxKey), env.BOXES.get(ipKey)]).then(v => v.map(x => Number(x || 0)));
  if (nBox >= Number(env.CONTRIB_PER_BOX_PER_DAY || 50) || nIp >= Number(env.CONTRIB_PER_IP_PER_DAY || 200)) {
    return json({ error: "Daily photo limit reached. The rest will be sent tomorrow." }, 429);
  }

  const meta = (b.meta && typeof b.meta === "object") ? b.meta : {};
  const verdict = VERDICTS.includes(b.verdict) ? b.verdict : "na";
  const sev = Number.isInteger(b.severity) && b.severity >= 1 && b.severity <= 10 ? b.severity : null;
  const model = /^[A-Za-z0-9._-]{1,40}$/.test(String(meta.model || "")) ? String(meta.model) : "unknown";
  const score = Number.isFinite(Number(meta.score)) ? Math.round(Number(meta.score) * 100) : "na";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "");      // 20261019T211429
  const rand = Math.random().toString(36).slice(2, 6);
  const path = `incoming/${label}/${id}-${stamp}-${source}-${score}-${verdict}-s${sev ?? "na"}-${rand}.jpg`;
  const message = `${label} from box ${id} (${source}, AI ${verdict.replace("_", " ")})\n\n` +
                  JSON.stringify({ id, label, source, verdict, severity: sev, meta }).slice(0, 4000);

  const api = `https://api.github.com/repos/${env.DATA_REPO}/contents/${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(api, {
      method: "PUT",
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json",
                 "user-agent": "printer-buddy-worker", "content-type": "application/json" },
      body: JSON.stringify({ message, content: String(b.image) }),
    });
    if (r.status === 201 || r.status === 200) {
      await Promise.all([
        env.BOXES.put(boxKey, String(nBox + 1), { expirationTtl: 2 * 24 * 3600 }),
        env.BOXES.put(ipKey, String(nIp + 1), { expirationTtl: 2 * 24 * 3600 }),
        verdict !== "na" ? countVerdict(env, model, verdict, day) : null,
      ]);
      return json({ ok: true, path }, 201);
    }
    if (r.status !== 409) {   // 409 = someone else committed at the same moment: try again
      const t = await r.text();
      return json({ error: `GitHub said ${r.status}: ${t.slice(0, 200)}` }, 502);
    }
    await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
  }
  return json({ error: "GitHub was busy, try again later" }, 503);
}

// ---------------------------------------------------------------- was the AI right? (totals from shared photos)
// stats:<model>              all-time {right, false_alarm, missed}
// statsday:<YYYY-MM-DD>:<model>  same, for one day (kept 40 days) - used by the daily Discord summary
const emptyStats = () => ({ right: 0, false_alarm: 0, missed: 0 });

async function bump(env, key, verdict, ttl) {
  const cur = (await env.BOXES.get(key, "json")) || emptyStats();
  cur[verdict] = (cur[verdict] || 0) + 1;
  await env.BOXES.put(key, JSON.stringify(cur), ttl ? { expirationTtl: ttl } : undefined);
}

function countVerdict(env, model, verdict, day) {
  return Promise.all([bump(env, `stats:${model}`, verdict), bump(env, `statsday:${day}:${model}`, verdict, 40 * 24 * 3600)]);
}

const pct = s => { const n = s.right + s.false_alarm + s.missed; return n ? Math.round(100 * s.right / n) : 0; };

async function readStats(env, prefix) {
  const out = {};
  const list = await env.BOXES.list({ prefix });
  for (const k of list.keys) out[k.name.slice(prefix.length)] = (await env.BOXES.get(k.name, "json")) || emptyStats();
  return out;
}

async function statsApi(env) {
  if (!env.BOXES) return json({ error: "Not set up" }, 503);
  const models = await readStats(env, "stats:");
  const out = {};
  for (const [m, s] of Object.entries(models)) {
    out[m] = { ...s, photos: s.right + s.false_alarm + s.missed, right_percent: pct(s) };
  }
  return json({ models: out, note: "From labelled photos that Printer Buddy users chose to share." });
}

async function dailySummary(env) {
  if (!env.BOXES || !env.DISCORD_WEBHOOK) return;
  const y = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const day = await readStats(env, `statsday:${y}:`);
  const all = await readStats(env, "stats:");
  const lines = Object.entries(day).map(([m, s]) => {
    const t = all[m] || s, n = s.right + s.false_alarm + s.missed, tn = t.right + t.false_alarm + t.missed;
    return `**${m}**: ${pct(s)}% right over ${n} photos (${s.false_alarm} false alarms, ${s.missed} missed) - all time ${pct(t)}% over ${tn}`;
  });
  if (!lines.length) return;   // nothing shared yesterday: stay quiet
  await fetch(env.DISCORD_WEBHOOK, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: `AI report for ${y}\n` + lines.join("\n") }),
  }).catch(() => {});
}
