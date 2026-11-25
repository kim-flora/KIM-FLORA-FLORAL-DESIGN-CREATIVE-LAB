-- Run through the database administration connection.
-- Seed the singleton separately with a server key digest and a password hash.
create table public.kim_flora_lab_access (
  id integer primary key check (id = 1),
  gateway_digest text not null,
  password_hash text not null,
  version integer not null default 1,
  must_rotate boolean not null default true,
  attempt_window timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.kim_flora_lab_access enable row level security;
revoke all on public.kim_flora_lab_access from public, anon, authenticated;
grant select, update on public.kim_flora_lab_access to anon;

create policy lab_gateway on public.kim_flora_lab_access for all to anon
using (
  encode(sha256(convert_to(coalesce(
    current_setting('request.headers', true)::jsonb ->> 'x-lab-gateway', ''
  ), 'UTF8')), 'hex') = gateway_digest
);

create function public.kim_flora_lab_attempt()
returns table (password_hash text, version integer, must_rotate boolean)
language sql
security invoker
set search_path = ''
as $$
  update public.kim_flora_lab_access as a
  set attempts = case when a.attempt_window <= now() - interval '1 minute'
                      then 1 else a.attempts + 1 end,
      attempt_window = case when a.attempt_window <= now() - interval '1 minute'
                            then now() else a.attempt_window end
  where a.id = 1 and (a.attempts < 12 or a.attempt_window <= now() - interval '1 minute')
  returning a.password_hash, a.version, a.must_rotate;
$$;
revoke all on function public.kim_flora_lab_attempt() from public, anon, authenticated;
grant execute on function public.kim_flora_lab_attempt() to anon;
