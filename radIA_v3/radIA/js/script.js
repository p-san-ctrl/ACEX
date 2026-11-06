const CONSENT_VERSION = 'LGPD-2026.08';
let currentUser = null;
let currentExam = null;
let activeExamId = null;
let currentAnalysis = null;
let previewUrl = null;
let examChart = null;
let statusChart = null;

window.radiaCurrentUser = null;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function notify(message) {
  const toast = document.getElementById('toast');
  const output = document.getElementById('toast-msg');
  if (!toast || !output) return;
  output.textContent = message;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3500);
}

function clearLoginFieldError(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
  input.removeAttribute('aria-invalid');
  document.getElementById(`${inputId}-error`)?.remove();
}

function setLoginFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  clearLoginFieldError(inputId);
  input.classList.add('border-red-500', 'ring-2', 'ring-red-200');
  input.setAttribute('aria-invalid', 'true');
  const error = document.createElement('p');
  error.id = `${inputId}-error`;
  error.className = 'text-xs text-red-600 mt-1';
  error.textContent = message;
  input.insertAdjacentElement('afterend', error);
}

function clearLoginErrors() {
  ['cpf-input', 'insurance-input', 'patient-password-input', 'crm-input', 'password-input']
    .forEach(clearLoginFieldError);
}

function setupLoginValidation() {
  ['cpf-input', 'insurance-input', 'patient-password-input', 'crm-input', 'password-input'].forEach(id => {
    const input = document.getElementById(id);
    if (!input || input.dataset.loginValidationReady) return;
    input.dataset.loginValidationReady = 'true';
    input.addEventListener('input', () => clearLoginFieldError(id));
  });
}

function toggleLoginFields() {
  const patient = document.getElementById('user-type').value === 'paciente';
  document.getElementById('patient-login').classList.toggle('hidden', !patient);
  document.getElementById('professional-login').classList.toggle('hidden', patient);
  clearLoginErrors();
}

async function handleLogin() {
  if (!window.radiaSupabase) return notify('Supabase não está configurado.');
  clearLoginErrors();
  setupLoginValidation();

  const accessType = document.getElementById('user-type').value;
  const patientAccess = accessType === 'paciente';
  const credentialId = patientAccess ? 'cpf-input' : 'crm-input';
  const passwordId = patientAccess ? 'patient-password-input' : 'password-input';
  const credential = document.getElementById(credentialId)?.value.trim() || '';
  const password = document.getElementById(passwordId)?.value || '';
  const insurance = document.getElementById('insurance-input')?.value.trim() || '';
  const emailLogin = credential.includes('@');
  let invalid = false;

  if (!credential) {
    setLoginFieldError(credentialId, patientAccess ? 'Informe o CPF ou o e-mail.' : 'Informe o CRM ou o e-mail.');
    invalid = true;
  } else if (emailLogin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credential)) {
    setLoginFieldError(credentialId, 'Informe um e-mail válido.');
    invalid = true;
  }
  if (password.length < 6) {
    setLoginFieldError(passwordId, 'A senha deve ter pelo menos 6 caracteres.');
    invalid = true;
  }
  if (patientAccess && !emailLogin && !insurance) {
    setLoginFieldError('insurance-input', 'Informe o convênio.');
    invalid = true;
  }
  if (invalid) return notify('Preencha corretamente os campos destacados.');

  try {
    let email = credential.toLowerCase();
    if (!emailLogin) {
      const identifier = credential.replace(/\D/g, '');
      if ((patientAccess && identifier.length !== 11) || (!patientAccess && identifier.length < 4)) {
        setLoginFieldError(credentialId, patientAccess ? 'Informe um CPF válido.' : 'Informe um CRM válido.');
        return notify('Corrija o identificador destacado.');
      }
      const { data: lookup, error: lookupError } = await window.radiaSupabase.rpc('obter_email_login', {
        p_tipo: patientAccess ? 'paciente' : 'radiologista', p_identificador: identifier,
      });
      if (lookupError) throw lookupError;
      if (!lookup) {
        setLoginFieldError(credentialId, 'Cadastro não encontrado.');
        return notify('Cadastro não encontrado.');
      }
      email = lookup;
    }

    const { data, error } = await window.radiaSupabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginFieldError(passwordId, 'Credenciais inválidas.');
      return notify('Não foi possível entrar. Verifique seus dados.');
    }
    const { data: profile, error: profileError } = await window.radiaSupabase.from('perfis')
      .select('id, tipo, nome_completo, telefone').eq('id', data.user.id).single();
    if (profileError || !profile) throw profileError || new Error('Perfil não encontrado.');
    if (profile.tipo !== 'administrador' && profile.tipo !== accessType) {
      await window.radiaSupabase.auth.signOut();
      return notify(`Este usuário é cadastrado como ${profile.tipo}.`);
    }
    if (profile.tipo === 'paciente') {
      const { data: patient } = await window.radiaSupabase.from('pacientes')
        .select('convenio').eq('id', data.user.id).single();
      if (!insurance || patient?.convenio?.trim().toLowerCase() !== insurance.toLowerCase()) {
        await window.radiaSupabase.auth.signOut();
        setLoginFieldError('insurance-input', 'O convênio não corresponde ao cadastro.');
        return notify('Convênio inválido.');
      }
    }

    currentUser = {
      type: accessType,
      actualRole: profile.tipo,
      name: profile.nome_completo || 'Usuário',
      identifier: emailLogin ? data.user.email : credential,
      id: data.user.id,
      email: data.user.email,
    };
    window.radiaCurrentUser = currentUser;
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-role').textContent = profile.tipo === 'administrador'
      ? `${accessType} • administrador • ${currentUser.identifier}`
      : `${accessType} • ${currentUser.identifier}`;
    document.getElementById('user-avatar').textContent = currentUser.name.slice(0, 2).toUpperCase();
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('nav-patient').classList.toggle('hidden', accessType !== 'paciente');
    document.getElementById('nav-radiologist').classList.toggle('hidden', accessType !== 'radiologista');

    if (accessType === 'paciente') showSection('patient-dashboard');
    else {
      await updateDashboard();
      showSection('dashboard');
    }
  } catch (error) {
    console.error('Erro de login:', error);
    await window.radiaSupabase.auth.signOut();
    notify('Não foi possível concluir o login.');
  }
}

function showSection(id) {
  const patientSections = ['patient-dashboard', 'patient-exams', 'patient-notifications', 'patient-consent', 'patient-feedback'];
  if (currentUser?.type === 'paciente' && !patientSections.includes(id)) return;
  if (currentUser?.type === 'radiologista' && patientSections.includes(id)) return;
  document.querySelectorAll('main > section').forEach(section => section.classList.add('hidden'));
  document.getElementById(`sec-${id}`)?.classList.remove('hidden');
  if (id === 'history') loadHistory();
  if (id === 'logs') loadLogs();
  if (id === 'dashboard') updateDashboard();
  if (id === 'patient-feedback') loadPatientFeedback();
  if (['patient-dashboard', 'patient-exams', 'patient-notifications'].includes(id)) renderPatientArea();
  if (id === 'queue') renderEnhancedQueue();
}

async function loadPatientFeedback() {
  const box = document.getElementById('patient-feedback-list');
  if (!box) return;
  box.innerHTML = '<div class="bg-white p-6 rounded-xl border text-slate-500">Carregando...</div>';
  try {
    const items = await window.RadiaExamService.patientFeedback();
    box.innerHTML = items.length ? items.map(item => {
      const exam = item.exames || {};
      return `<div class="bg-white p-6 rounded-xl border shadow-sm"><p class="font-bold">${esc(exam.tipo_exame)} • ${esc(exam.regiao_corpo)}</p><p class="text-xs text-slate-500 mt-1">${esc(formatDate(exam.data_exame))}</p><p class="mt-4 whitespace-pre-wrap text-slate-700">${esc(item.retorno_paciente)}</p></div>`;
    }).join('') : '<div class="bg-white p-6 rounded-xl border text-slate-500">Nenhum feedback foi disponibilizado.</div>';
  } catch (error) {
    console.error(error);
    box.innerHTML = '<div class="bg-red-50 p-6 rounded-xl border border-red-200 text-red-700">Não foi possível carregar os feedbacks.</div>';
  }
}

function toggleUploadButton() {
  const button = document.getElementById('select-file-btn');
  if (button) button.disabled = !document.getElementById('consent-checkbox')?.checked;
}

function openConsentDetails() {
  const modal = document.getElementById('consent-modal');
  modal?.classList.remove('hidden');
  modal?.classList.add('flex');
}

function closeConsentDetails() {
  const modal = document.getElementById('consent-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
}

function prepareExamFile() {
  const input = document.getElementById('file-input');
  const file = input?.files?.[0];
  if (!file) return;
  try {
    window.RadiaExamService.assertFile(file);
    if (!document.getElementById('consent-checkbox')?.checked) throw new Error('Confirme o consentimento antes do envio.');
    ['patient-name', 'patient-cpf', 'exam-type', 'body-region'].forEach(id => {
      if (!document.getElementById(id)?.value.trim()) throw new Error('Preencha paciente, CPF, tipo e região antes de selecionar a imagem.');
    });
  } catch (error) {
    input.value = '';
    return notify(error.message);
  }

  document.getElementById('file-name').textContent = `${file.name} • ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  const image = document.getElementById('exam-img-preview');
  image.src = previewUrl;
  document.getElementById('exam-image-stage').classList.remove('hidden');
  document.getElementById('dicom-preview')?.classList.add('hidden');
  document.getElementById('pdf-preview')?.classList.add('hidden');
  document.getElementById('exam-workspace').classList.remove('hidden');
  resetAiPanel('pendente', 'Imagem validada. Envie para iniciar a análise.');
}

function resetAiPanel(status, message) {
  const badge = document.getElementById('ai-status-badge');
  if (badge) badge.textContent = status;
  const text = document.getElementById('ai-status-message');
  if (text) text.textContent = message;
  const model = document.getElementById('ai-model-name');
  if (model) model.textContent = 'YOLOv8 GRAZPEDWRI-DX';
  window.RadiaAIViewer.renderList(document.getElementById('ai-findings-list'), []);
  window.RadiaAIViewer.renderOverlay(document.getElementById('ai-overlay'), []);
}

async function startAIAnalysis() {
  const file = document.getElementById('file-input')?.files?.[0];
  const button = document.getElementById('start-ai-analysis-btn');
  if (!file) return notify('Selecione a radiografia antes de iniciar a análise.');
  button.disabled = true;
  button.textContent = 'Enviando e processando...';
  resetAiPanel('processando', 'Upload privado em andamento. Aguarde o processamento do modelo.');
  try {
    const result = await window.RadiaExamService.uploadAndAnalyze({
      file,
      patientCpf: document.getElementById('patient-cpf').value,
      examDate: document.getElementById('exam-date').value,
      examType: document.getElementById('exam-type').value.trim(),
      bodyRegion: document.getElementById('body-region').value.trim(),
      notes: document.getElementById('doctor-notes').value.trim(),
    });
    activeExamId = result.exam.id;
    await refreshAnalysis();
    notify('Análise concluída. Revise os achados antes de emitir o laudo.');
  } catch (error) {
    if (error.exam?.id) activeExamId = error.exam.id;
    console.error('Falha na análise:', error);
    resetAiPanel('erro', error.message || 'Falha no processamento.');
    notify(error.message || 'Não foi possível analisar a imagem.');
  } finally {
    button.disabled = false;
    button.textContent = activeExamId ? 'Tentar análise novamente' : 'Enviar e analisar com IA';
  }
}

async function retryAIAnalysis() {
  if (!activeExamId) return startAIAnalysis();
  const button = document.getElementById('start-ai-analysis-btn');
  button.disabled = true;
  resetAiPanel('processando', 'Nova tentativa em andamento...');
  try {
    await window.RadiaExamService.requestAnalysis(activeExamId);
    await refreshAnalysis();
  } catch (error) {
    resetAiPanel('erro', error.message);
    notify(error.message);
  } finally {
    button.disabled = false;
  }
}

async function refreshAnalysis() {
  if (!activeExamId) return;
  currentAnalysis = await window.RadiaExamService.latestAnalysis(activeExamId);
  if (!currentAnalysis) return resetAiPanel('pendente', 'Análise ainda não registrada.');
  document.getElementById('ai-status-badge').textContent = currentAnalysis.status;
  document.getElementById('ai-model-name').textContent = [currentAnalysis.nome_modelo, currentAnalysis.versao_modelo]
    .filter(Boolean).join(' • ');
  const message = document.getElementById('ai-status-message');
  if (currentAnalysis.status === 'erro') message.textContent = currentAnalysis.erro_mensagem || 'Falha técnica na análise.';
  else if (currentAnalysis.status === 'concluido') message.textContent = `${currentAnalysis.achados.length} achado(s) preliminar(es).`;
  else message.textContent = 'Processamento em andamento.';
  window.RadiaAIViewer.renderList(document.getElementById('ai-findings-list'), currentAnalysis.achados);
  window.RadiaAIViewer.renderOverlay(document.getElementById('ai-overlay'), currentAnalysis.achados);
}

function toggleAIOverlay() {
  const visible = document.getElementById('toggle-ai-overlay')?.checked;
  document.getElementById('ai-overlay')?.classList.toggle('hidden', !visible);
}

async function finalizeExam() {
  if (!activeExamId) return notify('Envie e registre o exame antes de aprovar o laudo.');
  const reportText = document.getElementById('laudo-text').value.trim();
  if (!reportText) return notify('Digite a conclusão profissional no laudo.');
  try {
    await window.RadiaExamService.saveReview({
      examId: activeExamId,
      decision: 'aprovada',
      reportText,
      patientFeedback: document.getElementById('patient-feedback').value.trim(),
      reason: '',
    });
    notify('Laudo e revisão profissional aprovados.');
    resetExamForm();
    showSection('history');
  } catch (error) {
    console.error(error);
    notify(error.message || 'Não foi possível aprovar o laudo.');
  }
}

function showRejectBox() {
  document.getElementById('reject-box').classList.remove('hidden');
}

async function rejectExam() {
  if (!activeExamId) return notify('Envie e registre o exame antes de rejeitar a análise.');
  const reason = document.getElementById('reject-reason').value.trim();
  const reportText = document.getElementById('laudo-text').value.trim();
  if (!reason || !reportText) return notify('Informe o laudo e o motivo da rejeição.');
  try {
    await window.RadiaExamService.saveReview({
      examId: activeExamId,
      decision: 'rejeitada',
      reportText,
      patientFeedback: document.getElementById('patient-feedback').value.trim(),
      reason,
    });
    notify('Análise rejeitada e conclusão profissional registrada.');
    resetExamForm();
    showSection('history');
  } catch (error) {
    notify(error.message || 'Não foi possível registrar a rejeição.');
  }
}

function resetExamForm() {
  ['patient-name', 'patient-cpf', 'exam-type', 'body-region', 'laudo-text', 'doctor-notes', 'patient-feedback', 'reject-reason']
    .forEach(id => { const element = document.getElementById(id); if (element) element.value = ''; });
  document.getElementById('file-input').value = '';
  document.getElementById('file-name').textContent = 'Nenhum arquivo selecionado';
  document.getElementById('exam-image-stage').classList.add('hidden');
  document.getElementById('exam-workspace').classList.add('hidden');
  document.getElementById('reject-box').classList.add('hidden');
  document.getElementById('consent-checkbox').checked = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  activeExamId = null;
  currentAnalysis = null;
  document.getElementById('start-ai-analysis-btn').textContent = 'Enviar e analisar com IA';
}

async function loadHistory() {
  const body = document.getElementById('history-table-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Carregando...</td></tr>';
  try {
    let exams = await window.RadiaExamService.listExams();
    const date = document.getElementById('search-date')?.value || '';
    const type = (document.getElementById('search-type')?.value || '').toLowerCase();
    const region = (document.getElementById('search-region')?.value || '').toLowerCase();
    exams = exams.filter(exam => (!date || exam.data_exame === date)
      && (!type || exam.tipo_exame.toLowerCase().includes(type))
      && (!region || exam.regiao_corpo.toLowerCase().includes(region)));
    body.innerHTML = exams.length ? exams.map(exam => `<tr class="border-b hover:bg-slate-50">
      <td class="p-4 text-sm">${esc(formatDate(exam.data_exame))}</td>
      <td class="p-4 font-semibold">CPF final ${esc(exam.pacientes?.cpf?.slice(-4) || '—')}</td>
      <td class="p-4">${esc(exam.tipo_exame)}</td><td class="p-4">${esc(exam.regiao_corpo)}</td>
      <td class="p-4"><span class="px-2 py-1 rounded bg-slate-100">${esc(exam.status)}</span></td>
      <td class="p-4"><button onclick="viewExam('${exam.id}')" class="text-blue-600 font-semibold">Visualizar</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="p-6 text-center text-slate-400">Nenhum exame encontrado.</td></tr>';
  } catch (error) {
    console.error(error);
    body.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-red-600">Falha ao carregar os exames.</td></tr>';
  }
}

function formatDate(date) {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

async function viewExam(id) {
  try {
    currentExam = await window.RadiaExamService.examDetails(id);
    document.getElementById('modal-patient').textContent = `CPF final ${currentExam.pacientes?.cpf?.slice(-4) || '—'}`;
    document.getElementById('modal-date').textContent = formatDate(currentExam.data_exame);
    document.getElementById('modal-type-region').textContent = `${currentExam.tipo_exame} • ${currentExam.regiao_corpo}`;
    document.getElementById('modal-consent').textContent = `Termo ${CONSENT_VERSION}; consulte o registro de consentimento associado.`;
    document.getElementById('modal-laudo').textContent = currentExam.laudo?.texto_laudo || 'Sem laudo.';
    document.getElementById('modal-notes').textContent = currentExam.observacoes || 'Sem observações.';
    document.getElementById('modal-feedback').textContent = currentExam.laudo?.retorno_paciente || 'Sem feedback.';
    const media = document.getElementById('modal-media');
    media.replaceChildren();
    if (currentExam.imageUrl) {
      const stage = document.createElement('div');
      stage.className = 'relative inline-block max-w-full';
      const image = document.createElement('img');
      image.src = currentExam.imageUrl;
      image.className = 'block max-w-full max-h-[600px] object-contain';
      image.alt = 'Radiografia original do exame';
      const overlay = document.createElement('div');
      overlay.className = 'absolute inset-0 pointer-events-none';
      stage.append(image, overlay);
      media.appendChild(stage);
      image.addEventListener('load', () => window.RadiaAIViewer.renderOverlay(overlay, currentExam.analise?.achados || []));
    } else media.textContent = 'Imagem indisponível.';
    document.getElementById('modal-view').style.display = 'flex';
  } catch (error) {
    console.error(error);
    notify('Não foi possível abrir o exame.');
  }
}

function closeModal() {
  document.getElementById('modal-view').style.display = 'none';
}

function printCurrentExam() {
  if (!currentExam) return;
  const output = window.open('', '_blank');
  if (!output) return notify('Permita pop-ups para imprimir o laudo.');
  output.document.write(`<html><head><title>Laudo RadIA</title><style>body{font-family:Arial;padding:40px}.box{padding:16px;background:#f1f5f9;white-space:pre-wrap}</style></head><body><h1>RadIA — Laudo profissional</h1><p><b>Data:</b> ${esc(formatDate(currentExam.data_exame))}</p><p><b>Exame:</b> ${esc(currentExam.tipo_exame)} — ${esc(currentExam.regiao_corpo)}</p><p><b>IA:</b> resultado preliminar; sujeito a falsos positivos e falsos negativos.</p><div class="box">${esc(currentExam.laudo?.texto_laudo || 'Sem laudo')}</div></body></html>`);
  output.document.close();
  output.focus();
  setTimeout(() => output.print(), 300);
}

async function exportHistoryPDF() {
  notify('Abra um exame no histórico e use “Imprimir / Salvar como PDF”.');
}

async function loadLogs() {
  const container = document.getElementById('log-container');
  try {
    const logs = await window.RadiaExamService.listAuditLogs();
    container.innerHTML = logs.length ? logs.map(log => `<div>[${esc(new Date(log.criado_em).toLocaleString('pt-BR'))}] ${esc(log.acao)} • ${esc(log.tipo_entidade || '')}</div>`).join('') : '<div>Nenhum log disponível.</div>';
  } catch (error) {
    console.error(error);
    container.innerHTML = '<div>Não foi possível carregar os logs.</div>';
  }
}

let patientExamsCache = [];

async function renderPatientArea() {
  try {
    const [exams, notifications] = await Promise.all([
      window.RadiaExamService.listExams(),
      window.RadiaExamService.notifications(),
    ]);
    patientExamsCache = exams;
    const completed = exams.filter(exam => exam.status === 'concluido').length;
    document.getElementById('patient-kpi-total').textContent = exams.length;
    document.getElementById('patient-kpi-progress').textContent = exams.length - completed;
    document.getElementById('patient-kpi-done').textContent = completed;
    document.getElementById('patient-exam-badge').textContent = exams.length;
    document.getElementById('patient-notif-badge').textContent = notifications.filter(item => !item.lido_em).length;

    const updates = document.getElementById('patient-dashboard-updates');
    updates.innerHTML = notifications.length ? notifications.slice(0, 5).map(item => `
      <div class="rounded-xl border bg-slate-50 p-3">
        <p class="text-sm font-semibold">${esc(item.titulo)}</p>
        <p class="mt-1 text-xs text-slate-500">${esc(item.mensagem)}</p>
        <p class="mt-1 text-xs text-slate-400">${esc(new Date(item.criado_em).toLocaleString('pt-BR'))}</p>
      </div>`).join('') : '<div class="py-8 text-center text-sm text-slate-400">Nenhuma atualização disponível.</div>';
    renderPatientExams();
    renderPatientNotifications(notifications);
  } catch (error) {
    console.error('Falha ao carregar área do paciente:', error);
    notify('Não foi possível carregar a área do paciente.');
  }
}

function renderPatientExams() {
  const container = document.getElementById('patient-exams-list');
  if (!container) return;
  const search = (document.getElementById('patient-exam-search')?.value || '').toLowerCase();
  const statusLabel = document.getElementById('patient-exam-filter')?.value || '';
  const statusMap = { 'Pendente': 'pendente', 'Em análise': 'em_analise', 'Concluído': 'concluido' };
  const status = statusMap[statusLabel] || '';
  const exams = patientExamsCache.filter(exam =>
    (!search || exam.id.toLowerCase().includes(search) || exam.tipo_exame.toLowerCase().includes(search))
    && (!status || exam.status === status));
  container.innerHTML = exams.length ? exams.map(exam => `
    <div class="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
      <div><p class="font-bold">${esc(exam.tipo_exame)} • ${esc(exam.regiao_corpo)}</p><p class="mt-1 text-xs text-slate-500">${esc(formatDate(exam.data_exame))} • ${esc(exam.id)}</p></div>
      <div class="flex items-center gap-3"><span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">${esc(exam.status)}</span><button onclick="showPatientExamDetails('${exam.id}')" class="rounded-lg border px-3 py-2 text-xs font-semibold">Detalhes</button></div>
    </div>`).join('') : '<div class="p-12 text-center text-slate-400">Nenhum exame encontrado.</div>';
}

function renderPatientNotifications(notifications) {
  const container = document.getElementById('patient-notifications-list');
  if (!container) return;
  container.innerHTML = notifications.length ? notifications.map(item => `
    <div class="rounded-2xl border bg-white p-5 ${item.lido_em ? 'opacity-70' : ''}">
      <p class="font-semibold">${esc(item.titulo)}</p><p class="mt-1 text-sm text-slate-500">${esc(item.mensagem)}</p><p class="mt-2 text-xs text-slate-400">${esc(new Date(item.criado_em).toLocaleString('pt-BR'))}</p>
    </div>`).join('') : '<div class="rounded-2xl border bg-white p-10 text-center text-slate-400">Nenhuma atualização.</div>';
}

function showPatientExamDetails(id) {
  viewExam(id);
}

async function markPatientNotificationsRead() {
  try {
    await window.RadiaExamService.markNotificationsRead();
    await renderPatientArea();
  } catch (error) {
    notify('Não foi possível atualizar as notificações.');
  }
}

async function renderEnhancedQueue() {
  const container = document.getElementById('enhanced-queue-list');
  if (!container) return;
  try {
    const search = (document.getElementById('queue-search')?.value || '').toLowerCase();
    const statusLabel = document.getElementById('queue-status')?.value || '';
    const statusMap = { 'Pendente': 'pendente', 'Em análise': 'em_analise', 'Concluído': 'concluido' };
    const status = statusMap[statusLabel] || '';
    const exams = (await window.RadiaExamService.listExams()).filter(exam =>
      (!search || exam.id.toLowerCase().includes(search) || exam.tipo_exame.toLowerCase().includes(search) || String(exam.pacientes?.cpf || '').includes(search))
      && (!status || exam.status === status));
    document.getElementById('queue-badge').textContent = exams.filter(exam => exam.status !== 'concluido').length;
    container.innerHTML = exams.length ? exams.map(exam => `
      <div class="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
        <div><p class="font-bold">${esc(exam.tipo_exame)} • ${esc(exam.regiao_corpo)}</p><p class="mt-1 text-xs text-slate-500">CPF final ${esc(exam.pacientes?.cpf?.slice(-4) || '—')} • ${esc(formatDate(exam.data_exame))}</p></div>
        <div class="flex items-center gap-3"><span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">${esc(exam.status)}</span><button onclick="viewExam('${exam.id}')" class="text-sm font-semibold text-blue-600">Abrir</button></div>
      </div>`).join('') : '<div class="p-12 text-center text-slate-400">Nenhum exame na fila.</div>';
  } catch (error) {
    container.innerHTML = '<div class="p-12 text-center text-red-600">Falha ao carregar a fila.</div>';
  }
}

function openEnhancedExamModal() {
  showSection('new-exam');
}

function closeEnhancedExamModal() {
  document.getElementById('enhanced-exam-modal')?.classList.add('hidden');
}

function exportEnhancedData() {
  notify('A exportação de dados clínicos foi desativada por privacidade. Exporte apenas laudos individualmente.');
}

function resetEnhancedData() {
  notify('O RadIA não mantém exames no armazenamento local do navegador.');
}

async function updateDashboard() {
  try {
    const exams = await window.RadiaExamService.listExams();
    const today = new Date().toISOString().slice(0, 10);
    const queue = exams.filter(exam => exam.status !== 'concluido');
    document.getElementById('stats-today').textContent = exams.filter(exam => exam.data_exame === today).length;
    document.getElementById('stats-history').textContent = queue.length;
    document.getElementById('stats-pending').textContent = queue.filter(exam => exam.status === 'em_analise').length;
    document.getElementById('stats-urgent').textContent = queue.filter(exam => String(exam.prioridade || '').toLowerCase() === 'urgente').length;
    renderCharts(exams);
  } catch (error) {
    console.error('Falha ao atualizar painel:', error);
  }
}

function renderCharts(exams) {
  const byDay = {};
  exams.forEach(exam => { byDay[exam.data_exame] = (byDay[exam.data_exame] || 0) + 1; });
  if (examChart) examChart.destroy();
  examChart = new Chart(document.getElementById('examChart'), {
    type: 'bar', data: { labels: Object.keys(byDay).map(formatDate), datasets: [{ label: 'Exames', data: Object.values(byDay) }] },
  });
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('statusChart'), {
    type: 'doughnut',
    data: { labels: ['Concluídos', 'Em análise', 'Rejeitados'], datasets: [{ data: [
      exams.filter(exam => exam.status === 'concluido').length,
      exams.filter(exam => ['pendente', 'em_analise'].includes(exam.status)).length,
      exams.filter(exam => exam.status === 'rejeitado').length,
    ] }] },
  });
}

async function logout() {
  await window.radiaSupabase?.auth.signOut();
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  const date = document.getElementById('exam-date');
  if (date) date.value = new Date().toISOString().slice(0, 10);
  toggleLoginFields();
  toggleUploadButton();
  document.getElementById('toggle-ai-overlay')?.addEventListener('change', toggleAIOverlay);
  const aiButton = document.getElementById('start-ai-analysis-btn');
  aiButton?.addEventListener('click', () => activeExamId ? retryAIAnalysis() : startAIAnalysis());
});
