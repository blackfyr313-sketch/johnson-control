create table if not exists public.locations (
  name text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  name text primary key,
  created_at timestamptz not null default now()
);

insert into public.locations (name)
select distinct location
from public.employees
where location is not null
on conflict (name) do nothing;

insert into public.departments (name)
select distinct department
from public.employees
where department is not null
on conflict (name) do nothing;

alter table public.employees
  add column if not exists father_name text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_location_fkey'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      add constraint employees_location_fkey
      foreign key (location) references public.locations(name)
      on update cascade on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_department_fkey'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      add constraint employees_department_fkey
      foreign key (department) references public.departments(name)
      on update cascade on delete restrict;
  end if;
end
$$;

create table if not exists public.attendance_logins (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  login_time time not null,
  location text not null,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create table if not exists public.attendance_logouts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  logout_time time not null,
  location text not null,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

insert into public.attendance_logins (employee_id, date, login_time, location, created_at)
select employee_id, date, nullif(btrim(login_time), '')::time, location, created_at
from public.attendance
where nullif(btrim(login_time), '') is not null
on conflict (employee_id, date) do nothing;

insert into public.attendance_logouts (employee_id, date, logout_time, location, created_at)
select employee_id, date, nullif(btrim(logout_time), '')::time, location, created_at
from public.attendance
where nullif(btrim(logout_time), '') is not null
on conflict (employee_id, date) do nothing;

alter table public.locations enable row level security;
alter table public.departments enable row level security;
alter table public.attendance_logins enable row level security;
alter table public.attendance_logouts enable row level security;

drop policy if exists "Allow all reads and writes for public access" on public.locations;
create policy "Allow all reads and writes for public access"
on public.locations for all
using (true)
with check (true);

drop policy if exists "Allow all reads and writes for public access" on public.departments;
create policy "Allow all reads and writes for public access"
on public.departments for all
using (true)
with check (true);

drop policy if exists "Allow all reads and writes for public access" on public.attendance_logins;
create policy "Allow all reads and writes for public access"
on public.attendance_logins for all
using (true)
with check (true);

drop policy if exists "Allow all reads and writes for public access" on public.attendance_logouts;
create policy "Allow all reads and writes for public access"
on public.attendance_logouts for all
using (true)
with check (true);