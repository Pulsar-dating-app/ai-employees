insert into public.agents (slug, role, description, is_active)
values (
  'malu',
  'Sales Representative',
  'Sidde''s AI sales representative — helps customers find products and guides them toward checkout over WhatsApp.',
  true
)
on conflict (slug) do update set
  role = excluded.role,
  description = excluded.description,
  is_active = excluded.is_active;
