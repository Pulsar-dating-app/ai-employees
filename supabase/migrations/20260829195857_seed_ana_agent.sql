insert into public.agents (slug, role, description, is_active)
values (
  'ana',
  'Scheduling Assistant',
  'Ana is organized, courteous, and always on time — she checks your calendar in real time, books appointments your customers can count on, and keeps your day running without the back-and-forth.',
  true
)
on conflict (slug) do update set
  role = excluded.role,
  description = excluded.description,
  is_active = excluded.is_active;
