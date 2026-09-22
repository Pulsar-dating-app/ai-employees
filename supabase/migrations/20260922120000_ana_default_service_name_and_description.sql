-- Content-only migration -- no schema/security changes. Two targeted edits to
-- agents.system_prompt for 'ana', with regexp_replace rather than a full
-- rewrite (see 20260921130000's own comment for why: the stored prompt has
-- drifted from the migration files before, and a pattern that no longer
-- matches is a harmless no-op where a full rewrite would overwrite whatever
-- changed in between).
--
-- 1. Step 1's defaultService guidance now says to read its `description`
--    (when the merchant set one) as the authoritative word on what it covers,
--    ahead of guessing from the business's line of work -- and to never say
--    its name out loud. The tool result no longer hands the model a name to
--    say when it's still the seeded placeholder (redact-default-service-name.ts
--    strips it), so this is the matching instruction for when a name *is*
--    present (a merchant's real rename) as well as absent.
-- 2. Step 6's confirmation line is widened from "tell them plainly what
--    happened" to explicitly cover the no-name case, so a booking under the
--    default service is confirmed by day and time alone rather than reaching
--    for a name that no longer exists in the tool result.
--
-- Found by chat testing (2026-09-20): Ana confirmed a booking as "Serviço
-- padrão: amanhã, segunda-feira, das 10h às 10h30" -- the seeded internal
-- placeholder name, read straight out loud as if it were real.
update public.agents
set system_prompt = regexp_replace(
      regexp_replace(
        system_prompt,
        'If what they want isn''t one of the listed `services` but the result includes a `defaultService` and the request plausibly fits this business''s line of work, use `defaultService` \(call get_business_information if you''re unsure what kind of business this is -- e\.g\. a dental clinic covers a toothache, a cleaning, a check-up; it does not cover haircuts or ordering food\)\. If there is no `defaultService`, tell them that specific thing isn''t something you can book and offer what is\.',
        'If what they want isn''t one of the listed `services` but the result includes a `defaultService`, check whether it fits: if it has a `description`, that is the merchant''s own word on exactly what it covers, and it wins over any guess (a dental clinic''s default service still isn''t a haircut just because it''s a health service). Without one, judge by the business''s line of work (call get_business_information if you''re unsure what kind of business this is -- e.g. a dental clinic covers a toothache, a cleaning, a check-up; it does not cover haircuts or ordering food). When it fits, use `defaultService` -- but never say its name out loud or call it "the default service"; to the customer it is simply their appointment, and `defaultService.name` is absent unless the merchant gave it a real name of their own. If there is no `defaultService`, tell them that specific thing isn''t something you can book and offer what is.',
        'g'
      ),
      'Tell them what happened: if the booking is confirmed, say so plainly; if it came back as "requested", tell them the business will review and confirm it shortly\.',
      'Tell them what happened: if the booking is confirmed, say so plainly; if it came back as "requested", tell them the business will review and confirm it shortly. If `serviceName` is absent from the result, don''t invent or ask for one -- confirm the appointment by day and time alone (e.g. "Agendamento confirmado: amanhã, das 10h às 10h30").',
      'g'
    )
where slug = 'ana';
