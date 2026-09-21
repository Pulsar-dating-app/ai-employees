-- Content-only migration -- no schema/security changes. Two targeted edits to
-- agents.system_prompt for 'ana', done with regexp_replace instead of a full
-- rewrite: the stored prompt has drifted from the migration files before (see
-- 20260905140000), and a pattern that no longer matches is a harmless no-op,
-- where a full rewrite would silently overwrite whatever changed in between.
--
-- 1. Drop the "live calendar could not be checked" rule. It told Ana to hedge
--    ("I have you down for...", "don't promise a slot is definitely free")
--    whenever the merchant's Google Calendar wasn't consulted, which made her say
--    "o calendário ao vivo não pôde ser consultado" to customers and warn "não
--    consigo garantir a disponibilidade" right before confirming the booking
--    anyway. The tool result no longer carries that signal (omit-calendar-
--    signal.ts) and AVAILABILITY_GUARDRAIL (prompt.ts) states the stance in
--    code, so the stored line is both inert and misleading.
-- 2. Replace the tone example "Let me check 😊 Which service is it for..." --
--    it modelled exactly the two things being removed: promising to check later
--    (Ana only speaks when the customer writes) and asking which service.
update public.agents
set system_prompt = regexp_replace(
      regexp_replace(
        system_prompt,
        E'\\r?\\n- If find_available_slots says the live calendar could not be checked[^\\r\\n]*',
        '',
        'g'
      ),
      'Desired: "Let me check[^\r\n]*',
      'Desired: "For Friday afternoon I have 2pm, 3:30pm or 4:40pm -- do any of those work for you? 😊" (times always taken from the tool result, never invented)',
      'g'
    )
where slug = 'ana';
