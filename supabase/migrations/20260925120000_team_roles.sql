-- 2026-09-25 -- Team members and roles (see decisions.md "Team members join by
-- email; members see only their own schedule").
--
-- Until now only owners ever existed (company_users had 55 owners and 0
-- members), so every "Company members can ..." policy effectively meant "the
-- owner can ...". With professionals now able to log in as `member`s, those
-- policies would let any barber edit services, products, the shop's hours,
-- other barbers' appointments and every customer conversation. This
-- migration:
--   1. adds the pending-invite email on professionals;
--   2. links every company's owner to its seeded professional (Malu
--      companies too), in the creation RPC and as a backfill;
--   3. makes company-level writes admin-only (owner/admin), and scopes the
--      scheduling tables so a member reads/writes only rows of the
--      professional linked to them.
-- Everything that runs with the service role (Ana, webhooks, crons) is
-- unaffected.

-- ---------------------------------------------------------------------------
-- 1. Pending invite
-- ---------------------------------------------------------------------------

-- The email a professional was added with, kept only until someone signs in
-- with it and is linked (professionals.user_id); then it's cleared and the
-- email comes from public.users. One pending invite per email platform-wide:
-- an account belongs to one company.
alter table public.professionals
  add column invite_email text,
  add constraint professionals_invite_email_format
    check (invite_email is null or (invite_email = lower(btrim(invite_email)) and invite_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

create unique index professionals_invite_email_idx
  on public.professionals (invite_email)
  where invite_email is not null;

-- ---------------------------------------------------------------------------
-- 2. The owner is the company's first professional
-- ---------------------------------------------------------------------------

-- Same body as 20260902180000, plus: link the seeded professional (created by
-- the after-insert trigger from 20260924120000) to the owner.
create or replace function public.create_company_with_owner(
  company_name varchar,
  company_email varchar,
  company_phone varchar,
  company_website_url varchar,
  company_description text,
  company_currency varchar,
  company_country varchar,
  company_timezone varchar
)
returns public.companies
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_company public.companies;
  max_attempts constant int := 5;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  for attempt in 1..max_attempts loop
    begin
      insert into public.companies (name, slug, email, phone, website_url, description, currency, country, timezone)
      values (
        company_name,
        private.generate_unique_company_slug(company_name),
        company_email, company_phone, company_website_url, company_description, company_currency, company_country,
        coalesce(company_timezone, 'America/Sao_Paulo')
      )
      returning * into new_company;
      exit;
    exception when unique_violation then
      if attempt = max_attempts then
        raise;
      end if;
    end;
  end loop;

  insert into public.company_users (company_id, user_id, role)
  values (new_company.id, auth.uid(), 'owner');

  update public.professionals
  set user_id = auth.uid()
  where company_id = new_company.id and user_id is null;

  return new_company;
end;
$$;

-- Backfill: each company's oldest professional belongs to its owner.
update public.professionals p
set user_id = cu.user_id
from public.company_users cu
where cu.company_id = p.company_id
  and cu.role = 'owner'
  and p.user_id is null
  and p.id = (
    select p2.id from public.professionals p2
    where p2.company_id = p.company_id
    order by p2.created_at, p2.id
    limit 1
  )
  and not exists (
    select 1 from public.professionals p3
    where p3.company_id = p.company_id and p3.user_id = cu.user_id
  );

-- ---------------------------------------------------------------------------
-- 3. Role-aware RLS
-- ---------------------------------------------------------------------------

-- The professional is linked to the signed-in user.
create or replace function private.is_own_professional(target_professional_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.professionals p
    where p.id = target_professional_id
      and p.user_id = auth.uid()
  );
$$;

-- A customer who has at least one appointment with the signed-in user's
-- professional -- what a member needs to see on their own agenda.
create or replace function private.is_own_customer(target_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.appointments a
    join public.professionals p on p.id = a.professional_id
    where a.customer_id = target_customer_id
      and p.user_id = auth.uid()
  );
$$;

-- appointments: admin, or the member's own professional. Delete: admin.
drop policy "Company members can view appointments" on public.appointments;
drop policy "Company members can create appointments" on public.appointments;
drop policy "Company members can update appointments" on public.appointments;
drop policy "Company members can delete appointments" on public.appointments;

create policy "Admins or the own professional can view appointments"
on public.appointments for select
using (
  private.is_company_admin(company_id)
  or (private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins or the own professional can create appointments"
on public.appointments for insert
with check (
  private.is_company_admin(company_id)
  or (private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins or the own professional can update appointments"
on public.appointments for update
using (
  private.is_company_admin(company_id)
  or (private.is_company_member(company_id) and private.is_own_professional(professional_id))
)
with check (
  private.is_company_admin(company_id)
  or (private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins can delete appointments"
on public.appointments for delete
using (private.is_company_admin(company_id));

-- business_hours / company_time_off: every member reads (hours are
-- inherited); establishment rows (professional_id null) are admin-only to
-- write; a professional's own rows are writable by them too.
drop policy "Company members can create business hours" on public.business_hours;
drop policy "Company members can update business hours" on public.business_hours;
drop policy "Company members can delete business hours" on public.business_hours;

create policy "Admins or the own professional can create business hours"
on public.business_hours for insert
with check (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins or the own professional can update business hours"
on public.business_hours for update
using (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
)
with check (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins or the own professional can delete business hours"
on public.business_hours for delete
using (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

drop policy "Company members can create time off" on public.company_time_off;
drop policy "Company members can update time off" on public.company_time_off;
drop policy "Company members can delete time off" on public.company_time_off;

create policy "Admins or the own professional can create time off"
on public.company_time_off for insert
with check (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins or the own professional can update time off"
on public.company_time_off for update
using (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
)
with check (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins or the own professional can delete time off"
on public.company_time_off for delete
using (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

-- appointment_waitlist: read by admins or for the own professional; writes
-- are admin-only (Ana writes through the service role).
drop policy "Company members can view waitlist entries" on public.appointment_waitlist;
drop policy "Company members can create waitlist entries" on public.appointment_waitlist;
drop policy "Company members can update waitlist entries" on public.appointment_waitlist;
drop policy "Company members can delete waitlist entries" on public.appointment_waitlist;

create policy "Admins or the own professional can view waitlist entries"
on public.appointment_waitlist for select
using (
  private.is_company_admin(company_id)
  or (professional_id is not null and private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

create policy "Admins can create waitlist entries"
on public.appointment_waitlist for insert
with check (private.is_company_admin(company_id));

create policy "Admins can update waitlist entries"
on public.appointment_waitlist for update
using (private.is_company_admin(company_id));

create policy "Admins can delete waitlist entries"
on public.appointment_waitlist for delete
using (private.is_company_admin(company_id));

-- customers: admins see everyone; a member only customers booked with them.
drop policy "Company members can view customers" on public.customers;
drop policy "Company members can create customers" on public.customers;
drop policy "Company members can update customers" on public.customers;
drop policy "Company members can delete customers" on public.customers;

create policy "Admins or the own professional can view customers"
on public.customers for select
using (
  private.is_company_admin(company_id)
  or (private.is_company_member(company_id) and private.is_own_customer(id))
);

create policy "Admins can create customers"
on public.customers for insert
with check (private.is_company_admin(company_id));

create policy "Admins can update customers"
on public.customers for update
using (private.is_company_admin(company_id));

create policy "Admins can delete customers"
on public.customers for delete
using (private.is_company_admin(company_id));

-- conversations / messages / events: admin-only (members don't see the inbox
-- or metrics).
drop policy "Company members can view conversations" on public.conversations;
drop policy "Company members can create conversations" on public.conversations;
drop policy "Company members can update conversations" on public.conversations;
drop policy "Company members can delete conversations" on public.conversations;

create policy "Admins can view conversations"
on public.conversations for select using (private.is_company_admin(company_id));
create policy "Admins can create conversations"
on public.conversations for insert with check (private.is_company_admin(company_id));
create policy "Admins can update conversations"
on public.conversations for update using (private.is_company_admin(company_id));
create policy "Admins can delete conversations"
on public.conversations for delete using (private.is_company_admin(company_id));

drop policy "Company members can view messages" on public.messages;
drop policy "Company members can create messages" on public.messages;

create policy "Admins can view messages"
on public.messages for select using (private.is_company_admin(company_id));
create policy "Admins can create messages"
on public.messages for insert with check (private.is_company_admin(company_id));

drop policy "Company members can view events" on public.events;
drop policy "Company members can create events" on public.events;

create policy "Admins can view events"
on public.events for select using (private.is_company_admin(company_id));
create policy "Admins can create events"
on public.events for insert with check (private.is_company_admin(company_id));

-- services / products / intake fields / hired agents: every member reads,
-- only admins write.
drop policy "Company members can create services" on public.services;
drop policy "Company members can update services" on public.services;
drop policy "Company members can delete services" on public.services;
create policy "Admins can create services"
on public.services for insert with check (private.is_company_admin(company_id));
create policy "Admins can update services"
on public.services for update using (private.is_company_admin(company_id));
create policy "Admins can delete services"
on public.services for delete using (private.is_company_admin(company_id));

drop policy "Company members can create products" on public.products;
drop policy "Company members can update products" on public.products;
drop policy "Company members can delete products" on public.products;
create policy "Admins can create products"
on public.products for insert with check (private.is_company_admin(company_id));
create policy "Admins can update products"
on public.products for update using (private.is_company_admin(company_id));
create policy "Admins can delete products"
on public.products for delete using (private.is_company_admin(company_id));

drop policy "Company members can create intake fields" on public.appointment_intake_fields;
drop policy "Company members can update intake fields" on public.appointment_intake_fields;
drop policy "Company members can delete intake fields" on public.appointment_intake_fields;
create policy "Admins can create intake fields"
on public.appointment_intake_fields for insert with check (private.is_company_admin(company_id));
create policy "Admins can update intake fields"
on public.appointment_intake_fields for update using (private.is_company_admin(company_id));
create policy "Admins can delete intake fields"
on public.appointment_intake_fields for delete using (private.is_company_admin(company_id));

drop policy "Company members can hire agents" on public.company_agents;
drop policy "Company members can update hired agents" on public.company_agents;
drop policy "Company members can remove hired agents" on public.company_agents;
create policy "Admins can hire agents"
on public.company_agents for insert with check (private.is_company_admin(company_id));
create policy "Admins can update hired agents"
on public.company_agents for update using (private.is_company_admin(company_id));
create policy "Admins can remove hired agents"
on public.company_agents for delete using (private.is_company_admin(company_id));

-- Google Calendar connection rows: admins, or the own professional's.
drop policy "Company members can view their calendar connection" on public.company_calendar_connections;
create policy "Admins or the own professional can view calendar connections"
on public.company_calendar_connections for select
using (
  private.is_company_admin(company_id)
  or (private.is_company_member(company_id) and private.is_own_professional(professional_id))
);

-- Storage: widget and agent-photo uploads are admin-only.
drop policy "Company members can upload widget assets" on storage.objects;
drop policy "Company members can delete widget assets" on storage.objects;
drop policy "Company members can upload agent photos" on storage.objects;
drop policy "Company members can delete agent photos" on storage.objects;

create policy "Company admins can upload widget assets"
on storage.objects for insert
with check (bucket_id = 'widget-assets' and private.is_company_admin(((storage.foldername(name))[1])::uuid));
create policy "Company admins can delete widget assets"
on storage.objects for delete
using (bucket_id = 'widget-assets' and private.is_company_admin(((storage.foldername(name))[1])::uuid));
create policy "Company admins can upload agent photos"
on storage.objects for insert
with check (bucket_id = 'agent-photos' and private.is_company_admin(((storage.foldername(name))[1])::uuid));
create policy "Company admins can delete agent photos"
on storage.objects for delete
using (bucket_id = 'agent-photos' and private.is_company_admin(((storage.foldername(name))[1])::uuid));
