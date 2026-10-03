// Local-only monitoring window for the Sales Dashboard.
// Lives OUTSIDE the inlane-web-app repo on purpose: never commit/push it.
//
//   node server.mjs            ->  http://127.0.0.1:4455
//
// Why a server instead of a bare HTML file: public.sales_dashboard_temporary_logs
// has RLS with INSERT-only policy, so the browser's anon key can never read it
// (it just returns 0 rows). Reading needs the service-role key, which must not
// be pasted into a web page. This process reads it from the repo's .env at
// startup, keeps it in memory, and only ever listens on 127.0.0.1.
//
// Zero dependencies: Node 18+ built-ins only (http, fs, fetch).

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(
  process.env.MONITOR_ENV || resolve(HERE, "..", "inlane-web-app", ".env"),
);
const PORT = Number(process.env.MONITOR_PORT || 4455);
const HOST = "127.0.0.1"; // never 0.0.0.0: this process holds a service-role key
const TABLE = "sales_dashboard_temporary_logs";

function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// Credentials, in order of preference:
//   1. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment
//   2. the same names (or the VITE_ ones) in a local ".env" next to this file
//   3. the inlane-web-app .env (or the file named by MONITOR_ENV)
// Nothing here is ever written to disk, logged, or sent to the browser.
let env = {};
for (const p of [resolve(HERE, ".env"), ENV_PATH]) {
  try {
    env = { ...readEnv(p), ...env };
  } catch {
    // file absent: try the next source
  }
}
const SB_URL =
  process.env.SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("Missing Supabase credentials.");
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (environment or a .env file next to server.mjs).",
  );
  process.exit(1);
}

const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

async function pg(path, extra = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { ...headers, ...extra },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body, res };
}

const send = (res, status, payload, type = "application/json") => {
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store",
  });
  res.end(type === "application/json" ? JSON.stringify(payload) : payload);
};

const isoOr = (v, fallback) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
};

// ---- /api/rows : every row since `since`, newest first, paged past the
// 1000-row PostgREST cap. Capped so a huge table cannot freeze the page.
async function getRows(url) {
  const since = url.searchParams.get("since"); // optional
  const max = Math.min(Number(url.searchParams.get("limit")) || 20000, 50000);
  const PAGE = 1000;
  const rows = [];
  let truncated = false;
  for (let offset = 0; offset < max; offset += PAGE) {
    let q = `${TABLE}?select=*&order=ts.desc,received_at.desc&limit=${PAGE}&offset=${offset}`;
    if (since) q += `&ts=gte.${encodeURIComponent(isoOr(since, since))}`;
    const r = await pg(q);
    if (!r.ok) return { error: r.body, status: r.status };
    rows.push(...r.body);
    if (r.body.length < PAGE) return { rows, truncated };
  }
  truncated = true;
  return { rows, truncated };
}

// ---- /api/live : rows that ARRIVED after the cursor (server clock), oldest
// first. received_at, not ts: the browser clock can lag/skew, and a row from a
// laptop that just woke up carries an old ts but is still "new" to us.
async function getLive(url) {
  const after = url.searchParams.get("after");
  if (!after) {
    const r = await pg(
      `${TABLE}?select=*&order=received_at.desc&limit=${Number(url.searchParams.get("limit")) || 60}`,
    );
    return r.ok ? { rows: r.body.reverse() } : { error: r.body, status: r.status };
  }
  // The cursor must reach Postgres EXACTLY as Postgres produced it. received_at
  // has microsecond precision ("...06.080653+00:00"); round-tripping it through
  // a JS Date truncates to milliseconds ("...06.080"), which makes
  // `received_at > cursor` true for the very row the cursor came from, so every
  // poll re-returned the newest row forever. Validate the shape, then pass it
  // through untouched.
  if (!/^\d{4}-\d{2}-\d{2}[T ][\d:.]+(Z|[+-]\d{2}(:?\d{2})?)?$/.test(after)) {
    return { error: { message: "bad cursor" }, status: 400 };
  }
  const r = await pg(
    `${TABLE}?select=*&received_at=gt.${encodeURIComponent(after)}&order=received_at.asc&limit=500`,
  );
  return r.ok ? { rows: r.body } : { error: r.body, status: r.status };
}

// ---- /api/instructors : id -> name, cached (names change rarely)
let instCache = { at: 0, map: {} };
async function getInstructors() {
  if (Date.now() - instCache.at < 10 * 60 * 1000) return instCache.map;
  const map = {};
  for (let offset = 0; offset < 5000; offset += 1000) {
    const r = await pg(
      `Instructor?select=id_instructor,name&order=id_instructor&limit=1000&offset=${offset}`,
    );
    if (!r.ok) break;
    for (const i of r.body) map[i.id_instructor] = (i.name || "").trim();
    if (r.body.length < 1000) break;
  }
  instCache = { at: Date.now(), map };
  return map;
}

// ---- /api/health : is the pipe alive, and is the schema what the app writes?
async function getHealth() {
  const count = await pg(`${TABLE}?select=ts&limit=1`, { Prefer: "count=exact" });
  if (!count.ok) {
    return {
      ok: false,
      status: count.status,
      error: count.body,
      hint:
        count.body?.code === "PGRST205" || count.body?.code === "42P01"
          ? "Table does not exist. Apply 20261002_000000_sales_dashboard_temporary_logs.sql in the Supabase SQL editor."
          : undefined,
    };
  }
  const total = Number((count.res.headers.get("content-range") || "").split("/")[1]) || 0;
  const newest = await pg(`${TABLE}?select=ts,received_at&order=received_at.desc&limit=1`);
  return {
    ok: true,
    total,
    newest: newest.body?.[0] ?? null,
    serverTime: new Date().toISOString(),
  };
}

const HTML_PATH = resolve(HERE, "monitor.html");

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method !== "GET") return send(res, 405, { error: "GET only" });
    if (url.pathname === "/" || url.pathname === "/monitor.html") {
      // Re-read each time so edits to monitor.html show up on refresh.
      return send(res, 200, readFileSync(HTML_PATH, "utf8"), "text/html");
    }
    if (url.pathname === "/api/health") return send(res, 200, await getHealth());
    if (url.pathname === "/api/instructors")
      return send(res, 200, await getInstructors());
    if (url.pathname === "/api/rows" || url.pathname === "/api/live") {
      const out =
        url.pathname === "/api/rows" ? await getRows(url) : await getLive(url);
      return send(res, out.error ? out.status || 500 : 200, out);
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: String(e?.message || e) });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log(`Port ${PORT} is already in use - the monitoring window is probably already running.`);
    console.log(`Just open  http://${HOST}:${PORT}`);
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Monitoring window:  http://${HOST}:${PORT}`);
  console.log(`Reading credentials from ${ENV_PATH}`);
});
