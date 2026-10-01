create table if not exists locations (
  name text primary key,
  created_at timestamptz not null default now()
);

create table if not exists departments (
  name text primary key,
  created_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  father_name text not null default '',
  employee_id text not null unique,
  department text not null references departments(name) on update cascade on delete restrict,
  location text not null references locations(name) on update cascade on delete restrict,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  login_time text not null,
  logout_time text not null,
  location text not null,
  created_at timestamptz not null default now()
);

create table if not exists attendance_logins (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  login_time time not null,
  location text not null,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create table if not exists attendance_logouts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  login_date date not null,
  date date not null,
  logout_time time not null,
  location text not null,
  created_at timestamptz not null default now(),
  unique (employee_id, login_date)
);

alter table employees enable row level security;
alter table attendance enable row level security;
alter table locations enable row level security;
alter table departments enable row level security;
alter table attendance_logins enable row level security;
alter table attendance_logouts enable row level security;

drop policy if exists "Allow all reads and writes for public access" on locations;
create policy "Allow all reads and writes for public access"
on locations for all
using (true)
with check (true);

drop policy if exists "Allow all reads and writes for public access" on departments;
create policy "Allow all reads and writes for public access"
on departments for all
using (true)
with check (true);

create policy "Allow all reads and writes for public access"
on employees for all
using (true)
with check (true);

create policy "Allow all reads and writes for public access"
on attendance for all
using (true)
with check (true);

drop policy if exists "Allow all reads and writes for public access" on attendance_logins;
create policy "Allow all reads and writes for public access"
on attendance_logins for all
using (true)
with check (true);

drop policy if exists "Allow all reads and writes for public access" on attendance_logouts;
create policy "Allow all reads and writes for public access"
on attendance_logouts for all
using (true)
with check (true);
