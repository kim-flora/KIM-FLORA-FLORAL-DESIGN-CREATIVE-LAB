create table if not exists public.kim_flora_lab_backups (
  snapshot text not null check (snapshot ~ '^[0-9a-f]{64}$'),
  part integer not null check (part between -1 and 998),
  data text not null check (length(data) <= 700000),
  created_at timestamptz not null default now(),
  primary key (snapshot, part)
);

alter table public.kim_flora_lab_backups enable row level security;
revoke all on public.kim_flora_lab_backups from public, anon, authenticated;
grant select, insert on public.kim_flora_lab_backups to anon;

create policy lab_backup_gateway on public.kim_flora_lab_backups for all to anon
using (exists (select 1 from public.kim_flora_lab_access where id = 1))
with check (exists (select 1 from public.kim_flora_lab_access where id = 1));

create index lab_backup_history on public.kim_flora_lab_backups (created_at desc) where part = -1;
