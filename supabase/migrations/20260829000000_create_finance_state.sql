-- Private financial data for myFinances.
-- One JSON document per authenticated user keeps the static frontend free of
-- balances while row-level security prevents cross-account access.

create table if not exists public.finance_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint finance_state_object check (jsonb_typeof(state) = 'object')
);

alter table public.finance_state enable row level security;

revoke all on table public.finance_state from anon;
grant select, insert, update, delete on table public.finance_state to authenticated;

drop policy if exists "Users read their own finance state" on public.finance_state;
create policy "Users read their own finance state"
  on public.finance_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own finance state" on public.finance_state;
create policy "Users create their own finance state"
  on public.finance_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own finance state" on public.finance_state;
create policy "Users update their own finance state"
  on public.finance_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own finance state" on public.finance_state;
create policy "Users delete their own finance state"
  on public.finance_state for delete
  to authenticated
  using ((select auth.uid()) = user_id);
