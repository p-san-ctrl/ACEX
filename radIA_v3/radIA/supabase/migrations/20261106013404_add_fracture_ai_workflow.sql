-- RadIA: infraestrutura para análise real de radiografias de punho pediátrico.
-- Esta migração usa os nomes confirmados no projeto Supabase ACEX.

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

alter table public.analises_ia
  add column if not exists arquivo_exame_id uuid
    references public.arquivos_exame(id) on delete cascade,
  add column if not exists solicitado_por uuid
    references public.perfis(id) on delete set null,
  add column if not exists erro_mensagem text,
  add column if not exists atualizado_em timestamptz not null default now();

alter table public.laudos
  add column if not exists decisao_ia text,
  add column if not exists motivo_decisao_ia text,
  add column if not exists revisado_em timestamptz;

alter table public.laudos
  drop constraint if exists laudos_decisao_ia_ck;

alter table public.laudos
  add constraint laudos_decisao_ia_ck
  check (decisao_ia is null or decisao_ia in ('aprovada', 'rejeitada'));

create index if not exists analises_ia_arquivo_exame_id_idx
  on public.analises_ia (arquivo_exame_id);

create index if not exists analises_ia_solicitado_por_idx
  on public.analises_ia (solicitado_por);

create unique index if not exists analises_ia_ativa_por_arquivo_uidx
  on public.analises_ia (arquivo_exame_id)
  where arquivo_exame_id is not null
    and status in ('pendente'::public.status_analise_ia, 'processando'::public.status_analise_ia);

-- Acesso às imagens privadas por participante do exame.
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

-- Radiologistas e administradores só podem enviar arquivos para exames pelos
-- quais são responsáveis. O caminho esperado é usuario/exame/arquivo.
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

-- Permite desfazer um upload que falhou antes de o metadado ser gravado.
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

-- Achados preliminares ficam restritos ao profissional responsável. O paciente
-- recebe somente a conclusão aprovada em laudos.
drop policy if exists "achados_ia_select_participante" on public.achados_ia;
create policy "achados_ia_select_radiologista"
on public.achados_ia for select to authenticated
using (
  exists (
    select 1
    from public.analises_ia a
    join public.exames e on e.id = a.exame_id
    where a.id = achados_ia.analise_id
      and e.radiologista_id = (select auth.uid())
  )
);

-- Funções auxiliares internas não precisam ser executáveis anonimamente.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.eh_participante_exame(uuid) from anon;
revoke execute on function public.tipo_usuario_atual() from anon;

comment on column public.analises_ia.arquivo_exame_id is
  'Arquivo exato enviado ao modelo; usado para idempotência e rastreabilidade.';
comment on column public.analises_ia.erro_mensagem is
  'Erro técnico sanitizado. Nunca deve conter a imagem ou dados pessoais.';
comment on column public.laudos.decisao_ia is
  'Decisão profissional sobre a análise preliminar da IA; não substitui o laudo.';
