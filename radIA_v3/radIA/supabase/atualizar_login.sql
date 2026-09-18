-- ============================================================
-- RadIA — atualização da autenticação/login
-- Execute este arquivo DEPOIS do schema.sql no SQL Editor.
-- ============================================================

-- 1) Função usada pelo frontend para descobrir o e-mail do usuário
-- a partir do CPF/CRM, sem expor auth.users diretamente ao navegador.
create or replace function public.obter_email_login(
  p_tipo public.tipo_usuario,
  p_identificador text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from auth.users as u
  where u.id = case
    when p_tipo = 'paciente'::public.tipo_usuario then (
      select p.id
      from public.pacientes as p
      where p.cpf = regexp_replace(coalesce(p_identificador, ''), '[^0-9]', '', 'g')
      limit 1
    )
    when p_tipo = 'radiologista'::public.tipo_usuario then (
      select r.id
      from public.radiologistas as r
      where r.crm = regexp_replace(coalesce(p_identificador, ''), '[^0-9]', '', 'g')
      limit 1
    )
    else null
  end
  limit 1;
$$;

revoke execute on function public.obter_email_login(public.tipo_usuario, text) from public;
grant execute on function public.obter_email_login(public.tipo_usuario, text) to anon, authenticated;

-- 2) Trigger corrigido para novos cadastros.
-- O trigger cria o perfil automaticamente após o signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.tipo_usuario;
  v_cpf text;
  v_crm text;
begin
  v_role := coalesce(
    (new.raw_user_meta_data->>'tipo')::public.tipo_usuario,
    'paciente'::public.tipo_usuario
  );

  insert into public.perfis (id, tipo, nome_completo, telefone)
  values (
    new.id,
    v_role,
    coalesce(nullif(new.raw_user_meta_data->>'nome_completo', ''), 'Usuário'),
    nullif(new.raw_user_meta_data->>'telefone', '')
  );

  if v_role = 'paciente'::public.tipo_usuario then
    v_cpf := regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '[^0-9]', '', 'g');
    if length(v_cpf) <> 11 then
      raise exception 'CPF inválido ou ausente para o cadastro de paciente.';
    end if;

    if nullif(new.raw_user_meta_data->>'convenio', '') is null then
      raise exception 'Convênio é obrigatório para o cadastro de paciente.';
    end if;

    insert into public.pacientes (id, cpf, convenio)
    values (new.id, v_cpf, new.raw_user_meta_data->>'convenio');

  elsif v_role = 'radiologista'::public.tipo_usuario then
    v_crm := regexp_replace(coalesce(new.raw_user_meta_data->>'crm', ''), '[^0-9]', '', 'g');
    if length(v_crm) < 4 then
      raise exception 'CRM inválido ou ausente para o cadastro de radiologista.';
    end if;

    insert into public.radiologistas (id, crm, especialidade)
    values (
      new.id,
      v_crm,
      coalesce(nullif(new.raw_user_meta_data->>'especialidade', ''), 'Radiologia')
    );

  elsif v_role = 'administrador'::public.tipo_usuario then
    -- Administrador não precisa de CPF nem CRM.
    null;
  end if;

  return new;
end;
$$;

-- O trigger havia sido desativado durante o diagnóstico do cadastro do ADM.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists apos_criacao_usuario_auth on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
