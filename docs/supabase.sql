-- Ejecutar una sola vez en Supabase (SQL Editor) para que el panel guarde los cambios.

-- Una fila (id = 'main') con toda la carta, los ajustes y los eventos.
create table if not exists public.site_data (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Sin políticas: nadie con la clave pública puede leer ni escribir.
-- Solo el servidor (clave service_role) accede.
alter table public.site_data enable row level security;

-- Bucket público para las imágenes de las historias de Instagram.
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do nothing;
