-- ============================================================
-- RadIA — criação/ajuste do usuário administrador de testes
-- ============================================================
--
-- IMPORTANTE:
-- O usuário e a senha devem ser criados em:
-- Supabase > Authentication > Users > Add user
--
-- Dados sugeridos para testes da faculdade:
-- E-mail: admin@radia.test
-- Senha: Radia@123456
-- Marque "Auto Confirm User" para não depender de confirmação de e-mail.
--
-- Em "User Metadata", informe:
-- {"tipo":"administrador","nome_completo":"Administrador RadIA","telefone":""}
--
-- Depois de criar o usuário, execute este SQL.
-- A senha NÃO fica armazenada nesta tabela; o Supabase Auth cuida dela.

do $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id
  from auth.users
  where email = 'admin@radia.test'
  limit 1;

  if v_usuario_id is null then
    raise exception 'Usuário admin@radia.test não encontrado. Crie-o primeiro em Authentication > Users.';
  end if;

  update public.perfis
  set tipo = 'administrador',
      nome_completo = 'Administrador RadIA',
      telefone = null,
      atualizado_em = now()
  where id = v_usuario_id;

  -- Caso o usuário tenha sido criado anteriormente com outro tipo,
  -- removemos o registro específico desse tipo.
  delete from public.pacientes where id = v_usuario_id;
  delete from public.radiologistas where id = v_usuario_id;

  if not exists (select 1 from public.perfis where id = v_usuario_id) then
    insert into public.perfis (id, tipo, nome_completo, telefone)
    values (v_usuario_id, 'administrador', 'Administrador RadIA', null);
  end if;
end $$;

-- Conferência:
select
  p.id,
  p.nome_completo,
  p.tipo,
  u.email
from public.perfis p
join auth.users u on u.id = p.id
where u.email = 'admin@radia.test';
