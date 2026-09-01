-- Trello K8 — appointment_intake_fields: the customer details a merchant
-- wants collected before an appointment is booked. Each row is just a
-- free-text label ("Full name", "Age", "CPF") plus whether answering it is
-- mandatory and where it sits in the list. No field types / validation /
-- options for MVP — the merchant types a label, the scheduling agent asks
-- for it in natural language before calling book_appointment.
--
-- One flat list per company (no per-service overrides), same shape and
-- member-level RLS as company_time_off (20260831170000): the scheduling
-- routes only ever call requireMember. The whole set is replaced at once
-- through PUT /api/companies/[companyId]/intake-fields (delete-then-insert),
-- exactly like business_hours — `position` is assigned from array order on
-- write, so it is dense and 0-based but not constrained here.
create table public.appointment_intake_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  is_required boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint appointment_intake_fields_label_not_blank check (btrim(label) <> ''),
  constraint appointment_intake_fields_label_len check (char_length(label) <= 120)
);

-- Read path is always "every field for this company, in display order".
create index appointment_intake_fields_company_id_position_idx
  on public.appointment_intake_fields(company_id, position);

create trigger set_appointment_intake_fields_updated_at
before update on public.appointment_intake_fields
for each row execute function public.set_updated_at();

alter table public.appointment_intake_fields enable row level security;

create policy "Company members can view intake fields"
on public.appointment_intake_fields for select
using (private.is_company_member(company_id));

create policy "Company members can create intake fields"
on public.appointment_intake_fields for insert
with check (private.is_company_member(company_id));

create policy "Company members can update intake fields"
on public.appointment_intake_fields for update
using (private.is_company_member(company_id));

create policy "Company members can delete intake fields"
on public.appointment_intake_fields for delete
using (private.is_company_member(company_id));
