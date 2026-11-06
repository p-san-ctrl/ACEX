-- RadIA — bucket privado e políticas para imagens médicas
-- Execute no Supabase Dashboard > SQL Editor como proprietário do projeto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical-images',
  'medical-images',
  false,
  10485760,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "medical_images_select_participant" on storage.objects;
drop policy if exists "imagens_medicas_select_participante" on storage.objects;
create policy "imagens_medicas_select_participante"
on storage.objects for select to authenticated
using (
  bucket_id = 'medical-images'
  and exists (
    select 1
    from public.exames e
    where e.id::text = (storage.foldername(name))[2]
      and (
        e.paciente_id = (select auth.uid())
        or e.radiologista_id = (select auth.uid())
      )
  )
);

drop policy if exists "medical_images_insert_radiologist" on storage.objects;
drop policy if exists "imagens_medicas_insert_radiologista" on storage.objects;
create policy "imagens_medicas_insert_radiologista"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'medical-images'
  and public.tipo_usuario_atual() in (
    'radiologista'::public.tipo_usuario,
    'administrador'::public.tipo_usuario
  )
  and exists (
    select 1
    from public.exames e
    where e.id::text = (storage.foldername(name))[2]
      and e.radiologista_id = (select auth.uid())
  )
);

drop policy if exists "medical_images_delete_radiologist" on storage.objects;
drop policy if exists "imagens_medicas_delete_radiologista" on storage.objects;
create policy "imagens_medicas_delete_radiologista"
on storage.objects for delete to authenticated
using (
  bucket_id = 'medical-images'
  and public.tipo_usuario_atual() in (
    'radiologista'::public.tipo_usuario,
    'administrador'::public.tipo_usuario
  )
  and exists (
    select 1
    from public.exames e
    where e.id::text = (storage.foldername(name))[2]
      and e.radiologista_id = (select auth.uid())
  )
);

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'medical-images';
