create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  locale text not null default 'en' check (locale in ('en', 'fr')),
  timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'company_bodacc' check (type = 'company_bodacc'),
  title text not null check (char_length(title) between 1 and 200),
  siren text not null check (siren ~ '^[0-9]{9}$'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index watches_user_id_idx on public.watches (user_id);
create unique index watches_active_user_siren_idx
  on public.watches (user_id, siren)
  where deleted_at is null;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger watches_set_updated_at
before update on public.watches
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.watches enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.watches from anon;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.watches to authenticated;

create policy profiles_select_own
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy profiles_insert_own
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy profiles_delete_own
on public.profiles for delete to authenticated
using (id = (select auth.uid()));

create policy watches_select_own
on public.watches for select to authenticated
using (user_id = (select auth.uid()));

create policy watches_insert_own
on public.watches for insert to authenticated
with check (user_id = (select auth.uid()));

create policy watches_update_own
on public.watches for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy watches_delete_own
on public.watches for delete to authenticated
using (user_id = (select auth.uid()));
