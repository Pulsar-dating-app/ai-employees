-- 2026-09-28 -- A professional who doesn't take bookings (see decisions.md
-- "Professionals can be marked as not taking bookings"). Every company's
-- owner is its first professional (20260925120000), but an owner who only
-- runs the place -- the barbershop's owner who doesn't cut hair -- must not
-- be offered to customers. Deactivating them isn't the same thing: that
-- turns the schedule off and, for a member, the login's agenda with it.
--
-- "Bookable" = is_active AND takes_bookings. Ana, availability, the
-- dashboard's booking forms and the single-professional defaults all read
-- that; the person keeps their login, their page and their past appointments.

alter table public.professionals
  add column takes_bookings boolean not null default true;

-- Same as 20260924120000, counting only professionals who take bookings: a
-- company whose owner doesn't book and who has one barber still has exactly
-- one professional to default to.
create or replace function private.default_appointment_professional()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if new.professional_id is null then
    select case when count(*) = 1 then (array_agg(p.id))[1] end into v_id
    from public.professionals p
    where p.company_id = new.company_id and p.is_active and p.takes_bookings;
    new.professional_id := v_id;
  end if;
  return new;
end $$;
