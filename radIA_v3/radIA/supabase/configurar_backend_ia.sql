-- RadIA — complemento idempotente do esquema da análise por IA
-- Execute no Supabase Dashboard > SQL Editor como proprietário do projeto.

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
    and status in (
      'pendente'::public.status_analise_ia,
      'processando'::public.status_analise_ia
    );

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analises_ia'
  and column_name in (
    'arquivo_exame_id',
    'solicitado_por',
    'erro_mensagem',
    'atualizado_em'
  )
order by column_name;
