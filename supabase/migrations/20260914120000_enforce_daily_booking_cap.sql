-- Race-safe copy of the per-customer daily booking cap that
-- AppointmentRepository.book() checks in application code
-- (src/lib/appointments/repository.ts, MAX_DAILY_BOOKINGS_PER_CUSTOMER).
--
-- That check counts, then inserts. When a single model reply asked to "book
-- every free slot", Ana emitted several book_appointment calls at once, the
-- tool loop ran them in parallel, every count saw 0, and every insert went
-- through -- found in live testing (9 confirmed bookings for one customer on
-- one day, created within 0.29s). The EXCLUDE constraint only stops
-- *overlapping* slots, so distinct slots sailed past it.
--
-- This trigger takes a transaction-scoped advisory lock per
-- (company, customer) before counting, so concurrent inserts for the same
-- customer queue behind each other and each one counts the rows the previous
-- ones committed.
--
-- Scoped to agent-made bookings (agent_id is not null): the merchant's own
-- H3 write routes stay exempt, same as the app-layer check. Only INSERT --
-- reschedule_appointment (an UPDATE) is not subject to the cap either.
--
-- The limit (3) must match MAX_DAILY_BOOKINGS_PER_CUSTOMER.
create or replace function private.enforce_daily_booking_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_local_day date;
  v_count integer;
begin
  if new.agent_id is null or new.status::text in ('cancelled', 'no_show') then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.company_id::text || ':' || new.customer_id::text, 0)
  );

  -- "Same day" is the business's local calendar day, with the same
  -- invalid/unset-timezone -> UTC fallback the application code uses.
  select c.timezone into v_timezone from public.companies c where c.id = new.company_id;
  if v_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = v_timezone) then
    v_timezone := 'UTC';
  end if;

  v_local_day := (new.starts_at at time zone v_timezone)::date;

  select count(*) into v_count
  from public.appointments a
  where a.company_id = new.company_id
    and a.customer_id = new.customer_id
    and a.status::text not in ('cancelled', 'no_show')
    and a.starts_at >= (v_local_day::timestamp at time zone v_timezone)
    and a.starts_at < ((v_local_day + 1)::timestamp at time zone v_timezone);

  if v_count >= 3 then
    -- The message is matched verbatim by AppointmentRepository.book().
    raise exception 'daily_booking_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger enforce_daily_booking_cap_before_insert
before insert on public.appointments
for each row execute function private.enforce_daily_booking_cap();
