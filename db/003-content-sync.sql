create table public.kim_flora_lab_content (
  id integer primary key check (id = 1),
  revision integer not null default 0 check (revision >= 0),
  snapshot text check (snapshot ~ '^[0-9a-f]{64}$'),
  completed_part integer generated always as (-1) stored,
  foreign key (snapshot, completed_part)
    references public.kim_flora_lab_backups (snapshot, part)
);
insert into public.kim_flora_lab_content (id)
values (1);

alter table public.kim_flora_lab_content enable row level security;
revoke all on public.kim_flora_lab_content from public, anon, authenticated;
grant select, update (revision, snapshot) on public.kim_flora_lab_content to anon;
create policy lab_content_gateway on public.kim_flora_lab_content to anon
using (exists (select 1 from public.kim_flora_lab_access where id = 1))
with check (exists (select 1 from public.kim_flora_lab_access where id = 1));
