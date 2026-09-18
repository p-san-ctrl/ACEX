/*
 * RadIA — Cadastro de usuários
 * Usa Supabase Auth para credenciais e o trigger do banco para criar
 * automaticamente os registros em perfis/pacientes/radiologistas.
 */

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function openRegisterModal() {
  const modal = document.getElementById('register-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  toggleRegisterFields();
}

function closeRegisterModal() {
  const modal = document.getElementById('register-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function toggleRegisterFields() {
  const role = document.getElementById('register-role')?.value;
  document.getElementById('register-patient-fields')?.classList.toggle('hidden', role !== 'paciente');
  document.getElementById('register-radiologist-fields')?.classList.toggle('hidden', role !== 'radiologista');
}

function registrationMessage(message) {
  if (typeof notify === 'function') notify(message);
  else alert(message);
}

async function handleRegister(event) {
  event.preventDefault();

  if (!window.radiaSupabase) {
    registrationMessage('Supabase ainda não foi configurado. Preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.');
    return;
  }

  const role = document.getElementById('register-role').value;
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim().toLowerCase();
  const phone = document.getElementById('register-phone').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmation = document.getElementById('register-password-confirm').value;

  if (password.length < 8) {
    registrationMessage('A senha precisa ter pelo menos 8 caracteres.');
    return;
  }

  if (password !== confirmation) {
    registrationMessage('As senhas não conferem.');
    return;
  }

  const metadata = {
    tipo: role,
    nome_completo: name,
    telefone: phone
  };

  if (role === 'paciente') {
    const cpf = onlyDigits(document.getElementById('register-cpf').value);
    const insurance = document.getElementById('register-insurance').value.trim();

    if (cpf.length !== 11) {
      registrationMessage('Informe um CPF válido com 11 dígitos.');
      return;
    }

    if (!insurance) {
      registrationMessage('Informe o convênio.');
      return;
    }

    metadata.cpf = cpf;
    metadata.convenio = insurance;
  } else {
    const crm = onlyDigits(document.getElementById('register-crm').value);
    const specialty = document.getElementById('register-specialty').value.trim();

    if (crm.length < 4) {
      registrationMessage('Informe um CRM válido.');
      return;
    }

    metadata.crm = crm;
    metadata.especialidade = specialty || 'Radiologia';
  }

  const button = document.getElementById('register-submit');
  button.disabled = true;
  button.textContent = 'Criando conta...';

  try {
    const { data, error } = await window.radiaSupabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });

    if (error) throw error;

    /*
     * Se a confirmação de e-mail estiver habilitada no Supabase,
     * data.session será null até o usuário confirmar o endereço.
     * O trigger do banco já prepara os registros de perfil.
     */
    if (!data.session) {
      registrationMessage('Conta criada. Verifique o e-mail para confirmar o cadastro.');
    } else {
      registrationMessage('Conta criada com sucesso.');
    }

    document.getElementById('register-form').reset();
    toggleRegisterFields();
    closeRegisterModal();
  } catch (error) {
    console.error('Erro no cadastro:', error);
    registrationMessage(error.message || 'Não foi possível criar a conta.');
  } finally {
    button.disabled = false;
    button.textContent = 'Criar conta';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  toggleRegisterFields();

  document.getElementById('register-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'register-modal') closeRegisterModal();
  });
});
