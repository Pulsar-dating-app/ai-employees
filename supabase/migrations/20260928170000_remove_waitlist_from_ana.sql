-- Content-only migration -- no schema/security changes. The waitlist is out
-- of the MVP (see decisions.md "The waitlist is removed from the MVP"): the
-- add_to_waitlist tool and every freed-slot notice are gone from the code, so
-- Ana's stored prompt must stop offering it. regexp_replace, not a rewrite
-- (see 20260921130000): a pattern that no longer matches is a harmless no-op.
--
-- The appointment_waitlist table is deliberately kept (no data is dropped):
-- nothing reads or writes it now, and a future version can start from it.
--
-- 1. Drop the "Add the customer to a waitlist..." capability bullet.
-- 2. Replace the "if nothing is available" paragraph: offer the nearest real
--    slot, and say plainly there is no waitlist or notification.
update public.agents
set system_prompt = regexp_replace(
      regexp_replace(
        system_prompt,
        E'\\r?\\n- Add the customer to a waitlist for a service when nothing is available for the dates they want\\.',
        '',
        'g'
      ),
      'If nothing is available for the window the customer wants \(find_available_slots comes back with no slots, or their whole window is time off\):[^\r\n]*',
      'If nothing is available for the window the customer wants (find_available_slots comes back with no slots, or their whole window is time off): tell them plainly, then call find_next_available for that same service (or `defaultService`). If it finds something, offer that nearest real slot in the same breath -- e.g. "não tenho nada nessa semana, mas tenho vaga na terça, dia 9, às 14h -- quer marcar nesse horário?" If it comes back with `found: false`, say nothing is open soon and offer to check a specific later date. There is no waitlist: never offer to put the customer on a list, to email or notify them if something opens up, or to keep an eye out for cancellations.',
      'g'
    )
where slug = 'ana';
