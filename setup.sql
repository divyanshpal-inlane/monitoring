-- Public, read-only, SANITIZED feed for the monitoring website (GitHub Pages).
--
-- Run this ONCE in the Supabase dashboard -> SQL Editor. It is additive: it
-- creates one view and five functions and does not touch the logs table or its
-- insert-only policy.
--
-- Why this exists: the website is static and public, so it can only use the
-- public anon key. The logs table is insert-only for that key (RLS), so the
-- page could read nothing. These functions are the ONLY read path the anon key
-- gets, and they remove what must never be public:
--   * props.customer_name  -> replaced by props.customer_present = true
--   * user_id / auth_user_id / booking_id are not returned at all
-- Anon still cannot SELECT the table or the view directly.
--
-- To remove everything again, run the DROP block at the bottom.

create or replace view public.sales_dashboard_monitoring_public as
select
  l.ts,
  l.received_at,
  l.session_id,
  l.user_name,
  l.user_role,
  l.category,
  l.event_name,
  l.success,
  l.instructor_id,
  l.slot_date,
  l.slot_start,
  l.slot_end,
  l.error_code,
  l.error_message,
  l.api_name,
  l.http_method,
  l.http_status,
  l.duration_ms,
  l.device,
  case
    when l.props ->> 'customer_name' is not null
      then (l.props - 'customer_name') || jsonb_build_object('customer_present', true)
    else l.props
  end as props
from public.sales_dashboard_temporary_logs l;

-- The view is internal plumbing: nobody but the functions below reads it.
revoke all on public.sales_dashboard_monitoring_public from public, anon, authenticated;

create or replace function public.monitoring_feed_rows(
  p_since timestamptz default null,
  p_limit integer default 20000
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.ts desc), '[]'::jsonb)
  from (
    select *
    from public.sales_dashboard_monitoring_public v
    where p_since is null or v.ts >= p_since
    order by v.ts desc
    limit least(greatest(coalesce(p_limit, 20000), 1), 20000)
  ) r;
$$;

-- Live feed. Ordered/cursored by received_at (server clock), because a browser
-- clock can lag or skew. The cursor is a timestamptz and must be passed back
-- exactly as returned (microsecond precision) or the newest row repeats.
create or replace function public.monitoring_feed_live(
  p_after timestamptz default null,
  p_limit integer default 60
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_after is null then
    return coalesce((
      select jsonb_agg(to_jsonb(r) order by r.received_at asc)
      from (
        select *
        from public.sales_dashboard_monitoring_public
        order by received_at desc
        limit least(greatest(coalesce(p_limit, 60), 1), 500)
      ) r
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.received_at asc)
    from (
      select *
      from public.sales_dashboard_monitoring_public
      where received_at > p_after
      order by received_at asc
      limit 500
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.monitoring_feed_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'total', (select count(*) from public.sales_dashboard_temporary_logs),
    'newest', (
      select jsonb_build_object('ts', t.ts, 'received_at', t.received_at)
      from public.sales_dashboard_temporary_logs t
      order by t.received_at desc
      limit 1
    ),
    'serverTime', now()
  );
$$;

-- Instructor id -> name, ONLY for instructors that appear in the logs.
create or replace function public.monitoring_feed_instructors()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(i.id_instructor::text, btrim(i.name)), '{}'::jsonb)
  from public."Instructor" i
  where i.id_instructor::text in (
    select distinct instructor_id
    from public.sales_dashboard_temporary_logs
    where instructor_id is not null
  );
$$;

-- Functions are executable by PUBLIC by default; lock that down, then grant
-- only what the website needs.
revoke all on function public.monitoring_feed_rows(timestamptz, integer) from public;
revoke all on function public.monitoring_feed_live(timestamptz, integer) from public;
revoke all on function public.monitoring_feed_health() from public;
revoke all on function public.monitoring_feed_instructors() from public;

grant execute on function public.monitoring_feed_rows(timestamptz, integer) to anon, authenticated;
grant execute on function public.monitoring_feed_live(timestamptz, integer) to anon, authenticated;
grant execute on function public.monitoring_feed_health() to anon, authenticated;
grant execute on function public.monitoring_feed_instructors() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- TO REMOVE (run separately):
--   drop function if exists public.monitoring_feed_rows(timestamptz, integer);
--   drop function if exists public.monitoring_feed_live(timestamptz, integer);
--   drop function if exists public.monitoring_feed_health();
--   drop function if exists public.monitoring_feed_instructors();
--   drop view if exists public.sales_dashboard_monitoring_public;
-- ---------------------------------------------------------------------------
