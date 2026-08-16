-- Tabla de entradas del blog
create table if not exists blog_posts (
  id text primary key,
  titulo text not null,
  resumen text,
  contenido text,
  portada text,
  fotos jsonb default '[]'::jsonb,
  publicado boolean default true,
  orden int default 0,
  created_at timestamptz default now()
);

alter table blog_posts enable row level security;

-- Cualquiera puede leer las entradas publicadas (web pública)
create policy "blog_select_publico" on blog_posts
  for select using (publicado = true);

-- Solo un usuario logueado (tú, desde el panel admin) puede leer todas (incluidas borradores), crear, editar o borrar
create policy "blog_select_admin" on blog_posts
  for select using (auth.role() = 'authenticated');

create policy "blog_insert_admin" on blog_posts
  for insert with check (auth.role() = 'authenticated');

create policy "blog_update_admin" on blog_posts
  for update using (auth.role() = 'authenticated');

create policy "blog_delete_admin" on blog_posts
  for delete using (auth.role() = 'authenticated');

-- Bucket de almacenamiento para las fotos del blog
insert into storage.buckets (id, name, public)
values ('fotos-blog', 'fotos-blog', true)
on conflict (id) do nothing;

create policy "fotos_blog_lectura_publica" on storage.objects
  for select using (bucket_id = 'fotos-blog');

create policy "fotos_blog_escritura_admin" on storage.objects
  for insert with check (bucket_id = 'fotos-blog' and auth.role() = 'authenticated');

create policy "fotos_blog_borrado_admin" on storage.objects
  for delete using (bucket_id = 'fotos-blog' and auth.role() = 'authenticated');
