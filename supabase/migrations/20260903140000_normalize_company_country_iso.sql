-- companies.country is now an ISO 3166-1 alpha-2 code (the Settings country
-- dropdown), not free text. Normalize the one legacy free-text value in
-- production ("Brasil"); rows already holding a 2-letter code are untouched.
-- No column type change — it stays `varchar`, the app validates the shape.
update public.companies
set country = 'BR'
where country is not null
  and lower(btrim(country)) in ('brasil', 'brazil');

-- Anything else non-code (unexpected) is cleared rather than left to render
-- as a broken dropdown selection. Safe: country is a profile field only,
-- surfaced via get_business_information, nothing keys logic off it.
update public.companies
set country = null
where country is not null
  and country !~ '^[A-Za-z]{2}$';

update public.companies
set country = upper(country)
where country is not null
  and country ~ '^[a-z]{2}$';
