-- full_name joins email as a locked intake field: always collected, always
-- required (every downstream surface and the calendar event needs a name).
-- The PUT route now refuses to disable it; this forces any existing row a
-- merchant had turned off / made optional back on.
update public.appointment_intake_fields
set is_enabled = true, is_required = true
where key = 'full_name'
  and (is_enabled is distinct from true or is_required is distinct from true);
