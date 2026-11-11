-- Propuesta para ATLAS Murcia. Revisar y aplicar por Rubén en Supabase Murcia.
-- No incluye Alicante ni modifica listas existentes.
create table if not exists public.atlas_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  clinic_id uuid not null,
  entry_id text not null check (length(entry_id) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, clinic_id, entry_id)
);

comment on table public.atlas_waitlist_entries is
  'ATLAS Murcia shared agenda waitlist. Payload includes patient identifiers and requires clinic-scoped agenda permissions.';

create index if not exists atlas_waitlist_entries_clinic_active_idx
  on public.atlas_waitlist_entries (organization_id, clinic_id, created_at)
  where deleted_at is null;

alter table public.atlas_waitlist_entries enable row level security;
grant select, insert, update on public.atlas_waitlist_entries to authenticated;

drop policy if exists atlas_waitlist_entries_read on public.atlas_waitlist_entries;
create policy atlas_waitlist_entries_read
  on public.atlas_waitlist_entries
  for select to authenticated
  using (has_clinic_permission(organization_id, clinic_id, 'agenda_read'));

drop policy if exists atlas_waitlist_entries_insert on public.atlas_waitlist_entries;
create policy atlas_waitlist_entries_insert
  on public.atlas_waitlist_entries
  for insert to authenticated
  with check (has_clinic_permission(organization_id, clinic_id, 'agenda_write'));

drop policy if exists atlas_waitlist_entries_update on public.atlas_waitlist_entries;
create policy atlas_waitlist_entries_update
  on public.atlas_waitlist_entries
  for update to authenticated
  using (has_clinic_permission(organization_id, clinic_id, 'agenda_write'))
  with check (has_clinic_permission(organization_id, clinic_id, 'agenda_write'));
