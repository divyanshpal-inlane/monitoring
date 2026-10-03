# Sales Dashboard - Monitoring Window

Analytics for everyone using the Sales Dashboard, read from the
`sales_dashboard_temporary_logs` table: live feed, users, sessions (with a
per-session timeline), bookings funnel, instructors, API health and errors.

It runs in two modes from the same `index.html`:

| | Public site (GitHub Pages) | Local |
| --- | --- | --- |
| Who | anyone with the link | you, on your machine |
| Data source | read-only `monitoring_feed_*` DB functions via the public anon key | `server.mjs` with the service-role key |
| Customer names | **removed on the server** | shown |
| Setup | run `setup.sql` once | `.env` with the service-role key |

Live site: <https://divyanshpal-inlane.github.io/monitoring/>

## Public site: one-time setup

The logs table is insert-only for the browser, so a static page cannot read it.
Run **`setup.sql`** once in the Supabase dashboard -> SQL Editor. It creates a
view and four functions that return the logs **without** `props.customer_name`,
`user_id`, `auth_user_id` or `booking_id`. The public anon key can call those
functions and still cannot `SELECT` the table or the view. `setup.sql` ends with
the `DROP` statements that remove everything again.

Until it has been run, the site shows "backend is not set up yet".

`config.js` holds the project URL and the **anon** key, which is public by design
(every browser that opens the InLane app already receives it). Never put a
service-role key in that file.

## Local mode (full data)

1. Copy `.env.example` to `.env` and set `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (if `inlane-web-app` sits next to this folder, its
   `.env` is used automatically).
2. `node server.mjs`, or double-click `start-monitor.cmd` on Windows. Needs Node 18+.
3. Open <http://127.0.0.1:4455>. The server serves its own empty `config.js`, so
   the committed one is ignored and the page uses the local `/api/*` endpoints.

## Security

- The service-role key bypasses all RLS. Treat it like a password, keep it on
  your own machine, and never bind `server.mjs` to anything but `127.0.0.1`.
- The public feed still shows staff names, instructor names, event details and
  error messages. Error messages are free text written by the dashboard; check
  them before sharing the link widely.
