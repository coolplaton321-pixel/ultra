-- Run this once in Supabase Dashboard > SQL Editor.
-- Each signed-in user can read and write only their own tracker row.

create table if not exists public.ultra_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ultra_state enable row level security;

revoke all on table public.ultra_state from anon;
grant select, insert, update on table public.ultra_state to authenticated;

drop policy if exists "Users read their own Ultra state" on public.ultra_state;
create policy "Users read their own Ultra state"
  on public.ultra_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own Ultra state" on public.ultra_state;
create policy "Users create their own Ultra state"
  on public.ultra_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own Ultra state" on public.ultra_state;
create policy "Users update their own Ultra state"
  on public.ultra_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
