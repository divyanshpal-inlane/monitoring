# Sales Dashboard - Monitoring Window

A small local web page that reads the `sales_dashboard_temporary_logs` table and
shows usage analytics for everyone using the Sales Dashboard: a live feed, users,
sessions (with per-session timeline), bookings funnel, customers, instructors,
API health and errors.

Zero dependencies. Needs Node 18+.

## Run

1. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. (If `inlane-web-app` sits next to this folder,
   its `.env` is used automatically.)
2. `node server.mjs` (or double-click `start-monitor.cmd` on Windows).
3. Open <http://127.0.0.1:4455>.

## Why a server and not just an HTML file

The table is insert-only for the browser (RLS), so a page using the public anon
key reads 0 rows. Reading needs the service-role key, which must never be put in
a web page. `server.mjs` keeps the key in memory, listens on `127.0.0.1` only,
and serves the page plus a few read-only `GET` endpoints.

## Security

- The service-role key bypasses all RLS. Treat it like a password.
- The data includes staff names and customer names (never phone or address).
  Anyone who runs this with a key can see them.
- Do not bind the server to anything other than `127.0.0.1`.
