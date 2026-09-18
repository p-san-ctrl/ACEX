-- ============================================================
-- RadIA — estrutura inicial do banco no Supabase
-- PostgreSQL / Supabase
-- ============================================================
--
-- MODELO:
-- auth.users (Supabase Auth)
--        |
--        +--> profiles
--              +--> patients
--              +--> radiologists
--
-- exams -> exam_files -> Storage
--      -> consents
--      -> ai_analyses -> ai_findings
--      -> reports
--      -> notifications
--      -> audit_logs
--
-- IMPORTANTE:
-- 1. Rode este script no SQL Editor do Supabase.
-- 2. Crie o bucket privado "medical-images".
-- 3. Nunca coloque a service_role key no frontend.
-- 4. Este esquema é para o projeto acadêmico; produção médica exige
--    revisão de segurança, LGPD, controles de acesso e infraestrutura
--    apropriados.

create extension if not exists pgcrypto;

create type public.user_role as enum ('paciente', 'radiologista');

create type public.exam_status as enum (
  'pendente',
  'em_analise',
  'concluido',
  'rejeitado'
);

create type public.exam_priority as enum (
  'normal',
  'prioritario',
  'urgente'
);

create type public.ai_run_status as enum (
  'pendente',
  'processando',
  'concluido',
  'erro'
);

-- ============================================================
-- PERFIS
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key references public.profiles(id) on delete cascade,
  cpf text not null unique,
  insurance text,
  birth_date date,
  created_at timestamptz not null default now()
);

create table public.radiologists (
  id uuid primary key references public.profiles(id) on delete cascade,
  crm text not null unique,
  specialty text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONSENTIMENTO LGPD
-- ============================================================

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  exam_id uuid,
  version text not null,
  purpose text not null,
  accepted boolean not null default false,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- EXAMES
-- ============================================================

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  radiologist_id uuid not null references public.radiologists(id) on delete restrict,
  exam_date date not null,
  exam_type text not null,
  body_region text not null,
  status public.exam_status not null default 'pendente',
  priority public.exam_priority not null default 'normal',
  notes text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consents
  add constraint consents_exam_id_fkey
  foreign key (exam_id) references public.exams(id) on delete cascade;

-- ============================================================
-- ARQUIVOS DO EXAME
-- O arquivo físico fica no Supabase Storage; esta tabela guarda
-- apenas os metadados e o caminho do objeto.
-- ============================================================

create table public.exam_files (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

-- ============================================================
-- IA
-- Uma análise pode gerar vários achados.
-- annotation pode guardar bounding box/polígono/máscara em JSON.
-- ============================================================

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  model_name text,
  model_version text,
  status public.ai_run_status not null default 'pendente',
  raw_response jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_findings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.ai_analyses(id) on delete cascade,
  label text not null,
  confidence numeric(5,4),
  annotation jsonb,
  created_at timestamptz not null default now(),
  constraint ai_findings_confidence_ck
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

-- ============================================================
-- LAUDO
-- ============================================================

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null unique references public.exams(id) on delete cascade,
  radiologist_id uuid not null references public.radiologists(id) on delete restrict,
  ai_analysis_id uuid references public.ai_analyses(id) on delete set null,
  report_text text,
  patient_feedback text,
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- NOTIFICAÇÕES
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AUDITORIA
-- ============================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

create index exams_patient_id_idx on public.exams(patient_id);
create index exams_radiologist_id_idx on public.exams(radiologist_id);
create index exams_status_idx on public.exams(status);
create index exams_date_idx on public.exams(exam_date);
create index exam_files_exam_id_idx on public.exam_files(exam_id);
create index ai_analyses_exam_id_idx on public.ai_analyses(exam_id);
create index ai_findings_analysis_id_idx on public.ai_findings(analysis_id);
create index notifications_user_id_idx on public.notifications(user_id);
create index audit_logs_actor_user_id_idx on public.audit_logs(actor_user_id);

-- ============================================================
-- TRIGGER: cria profile + patient/radiologist após signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  v_role := coalesce(
    (new.raw_user_meta_data->>'role')::public.user_role,
    'paciente'::public.user_role
  );

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', 'Usuário'),
    nullif(new.raw_user_meta_data->>'phone', '')
  );

  if v_role = 'paciente' then
    insert into public.patients (id, cpf, insurance)
    values (
      new.id,
      new.raw_user_meta_data->>'cpf',
      new.raw_user_meta_data->>'insurance'
    );
  elsif v_role = 'radiologista' then
    insert into public.radiologists (id, crm, specialty)
    values (
      new.id,
      new.raw_user_meta_data->>'crm',
      coalesce(new.raw_user_meta_data->>'specialty', 'Radiologia')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ============================================================
-- FUNÇÕES AUXILIARES PARA RLS
-- ============================================================

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_exam_participant(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exams e
    where e.id = p_exam_id
      and (e.patient_id = auth.uid() or e.radiologist_id = auth.uid())
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.radiologists enable row level security;
alter table public.consents enable row level security;
alter table public.exams enable row level security;
alter table public.exam_files enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.ai_findings enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles
create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Patients
create policy "patients_select_own"
on public.patients for select to authenticated
using (id = auth.uid());

create policy "patients_update_own"
on public.patients for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Radiologists
create policy "radiologists_select_own"
on public.radiologists for select to authenticated
using (id = auth.uid());

create policy "radiologists_update_own"
on public.radiologists for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Exams
create policy "exams_select_participant"
on public.exams for select to authenticated
using (patient_id = auth.uid() or radiologist_id = auth.uid());

create policy "exams_insert_radiologist"
on public.exams for insert to authenticated
with check (
  radiologist_id = auth.uid()
  and public.current_role() = 'radiologista'
);

create policy "exams_update_radiologist"
on public.exams for update to authenticated
using (
  radiologist_id = auth.uid()
  and public.current_role() = 'radiologista'
)
with check (
  radiologist_id = auth.uid()
  and public.current_role() = 'radiologista'
);

-- Consent
create policy "consents_select_participant"
on public.consents for select to authenticated
using (
  patient_id = auth.uid()
  or (exam_id is not null and public.is_exam_participant(exam_id))
);

create policy "consents_insert_patient"
on public.consents for insert to authenticated
with check (
  patient_id = auth.uid()
  and public.current_role() = 'paciente'
);

-- Exam files
create policy "exam_files_select_participant"
on public.exam_files for select to authenticated
using (public.is_exam_participant(exam_id));

create policy "exam_files_insert_radiologist"
on public.exam_files for insert to authenticated
with check (
  public.current_role() = 'radiologista'
  and exists (
    select 1 from public.exams e
    where e.id = exam_id and e.radiologist_id = auth.uid()
  )
);

-- AI analyses
create policy "ai_analyses_select_radiologist"
on public.ai_analyses for select to authenticated
using (
  exists (
    select 1 from public.exams e
    where e.id = exam_id and e.radiologist_id = auth.uid()
  )
);

create policy "ai_analyses_insert_radiologist"
on public.ai_analyses for insert to authenticated
with check (
  public.current_role() = 'radiologista'
  and exists (
    select 1 from public.exams e
    where e.id = exam_id and e.radiologist_id = auth.uid()
  )
);

create policy "ai_analyses_update_radiologist"
on public.ai_analyses for update to authenticated
using (
  exists (
    select 1 from public.exams e
    where e.id = exam_id and e.radiologist_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.exams e
    where e.id = exam_id and e.radiologist_id = auth.uid()
  )
);

-- AI findings
create policy "ai_findings_select_participant"
on public.ai_findings for select to authenticated
using (
  exists (
    select 1
    from public.ai_analyses a
    join public.exams e on e.id = a.exam_id
    where a.id = analysis_id
      and (e.patient_id = auth.uid() or e.radiologist_id = auth.uid())
  )
);

create policy "ai_findings_insert_radiologist"
on public.ai_findings for insert to authenticated
with check (
  public.current_role() = 'radiologista'
  and exists (
    select 1
    from public.ai_analyses a
    join public.exams e on e.id = a.exam_id
    where a.id = analysis_id and e.radiologist_id = auth.uid()
  )
);

-- Reports
create policy "reports_select_participant"
on public.reports for select to authenticated
using (
  exists (
    select 1 from public.exams e
    where e.id = exam_id
      and (e.patient_id = auth.uid() or e.radiologist_id = auth.uid())
  )
);

create policy "reports_insert_radiologist"
on public.reports for insert to authenticated
with check (
  radiologist_id = auth.uid()
  and public.current_role() = 'radiologista'
);

create policy "reports_update_radiologist"
on public.reports for update to authenticated
using (radiologist_id = auth.uid())
with check (radiologist_id = auth.uid());

-- Notifications
create policy "notifications_select_own"
on public.notifications for select to authenticated
using (user_id = auth.uid());

create policy "notifications_update_own"
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Audit: usuário vê seus próprios eventos; inserções podem ser feitas
-- pelo backend/Edge Functions em uma etapa posterior.
create policy "audit_logs_select_own"
on public.audit_logs for select to authenticated
using (actor_user_id = auth.uid());

-- ============================================================
-- STORAGE
-- Crie o bucket privado "medical-images" no Dashboard.
-- Depois execute as políticas abaixo.
-- ============================================================

create policy "medical_images_select_participant"
on storage.objects for select to authenticated
using (
  bucket_id = 'medical-images'
  and exists (
    select 1
    from public.exams e
    where e.id::text = (storage.foldername(name))[2]
      and (e.patient_id = auth.uid() or e.radiologist_id = auth.uid())
  )
);

create policy "medical_images_insert_radiologist"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'medical-images'
  and public.current_role() = 'radiologista'
  and exists (
    select 1
    from public.exams e
    where e.id::text = (storage.foldername(name))[2]
      and e.radiologist_id = auth.uid()
  )
);
