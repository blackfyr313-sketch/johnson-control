create table if not exists public.locations (
  name text primary key,
  created_at timestamptz not null default now()
);

insert into public.locations (name)
select distinct location
from public.employees
where location is not null
on conflict (name) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_location_fkey'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      add constraint employees_location_fkey
      foreign key (location) references public.locations(name)
      on update cascade on delete restrict;
  end if;
end
$$;

alter table public.locations enable row level security;

drop policy if exists "Allow all reads and writes for public access" on public.locations;
create policy "Allow all reads and writes for public access"
on public.locations for all
using (true)
with check (true);