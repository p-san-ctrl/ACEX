// REQ-LGPD: identifica a versão do termo de consentimento registrada com cada exame.
// NOTA: em produção, a versão deve ser controlada no backend para garantir integridade e rastreabilidade.
const CONSENT_VERSION = 'LGPD-2026.08';
let currentUser = null;
window.radiaCurrentUser = null;
let currentExam = null;
// REQ-HISTÓRICO: protótipo usa localStorage para persistir exames.
// IMPORTANTE: localStorage NÃO é adequado para dados médicos em produção; usar backend + banco seguro.
let exams = JSON.parse(localStorage.getItem('radia_exams') || '[]');
let logs = JSON.parse(localStorage.getItem('radia_logs') || '[]');
// FLUXO PACIENTE: feedback do radiologista fica associado ao exame e só é exibido ao paciente.

let examChart = null, statusChart = null;

function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function notify(msg) {
  const toast=document.getElementById('toast');
  document.getElementById('toast-msg').innerText=msg;
  toast.classList.remove('translate-y-20','opacity-0');
  setTimeout(()=>toast.classList.add('translate-y-20','opacity-0'),3000);
}
function toggleLoginFields() {
  const patient=document.getElementById('user-type').value==='paciente';
  document.getElementById('patient-login').classList.toggle('hidden',!patient);
  document.getElementById('professional-login').classList.toggle('hidden',patient);
}
// REQ-AUTENTICAÇÃO: login real usando Supabase Auth.
// O Supabase Auth autentica por e-mail + senha. Para manter a interface atual,
// pacientes entram com CPF + convênio + senha e radiologistas com CRM + senha;
// uma função SQL segura converte CPF/CRM em e-mail antes do signInWithPassword.
async function handleLogin() {
  if (!window.radiaSupabase) {
    return notify('Supabase não está configurado. Preencha a URL e a chave no arquivo js/supabase-client.js.');
  }

  const accessType = document.getElementById('user-type').value;
  const isPatientAccess = accessType === 'paciente';
  const credentialInput = document.getElementById(isPatientAccess ? 'cpf-input' : 'crm-input');
  const credentialRaw = credentialInput?.value.trim() || '';
  const password = document.getElementById(isPatientAccess ? 'patient-password-input' : 'password-input')?.value || '';
  const insurance = document.getElementById('insurance-input')?.value.trim() || '';

  // Bloqueia campos obrigatórios antes de qualquer chamada ao Supabase.
  if (!credentialRaw) {
    return notify(isPatientAccess ? 'Informe o CPF.' : 'Informe o CRM.');
  }

  if (!password) {
    return notify('Informe a senha.');
  }

  if (password.length < 6) {
    return notify('A senha deve ter pelo menos 6 caracteres.');
  }

  if (isPatientAccess && !credentialRaw.includes('@') && !insurance) {
    return notify('Informe o convênio.');
  }

  let email = credentialRaw.toLowerCase();
  const adminLogin = credentialRaw.includes('@');

  try {
    // Administrador: pode usar o e-mail nas duas versões de acesso.
    // Usuário comum: o CPF/CRM é convertido em e-mail pela função SQL.
    if (!adminLogin) {
      const identifier = credentialRaw.replace(/\D/g, '');
      const functionType = isPatientAccess ? 'paciente' : 'radiologista';

      if (isPatientAccess && identifier.length !== 11) {
        return notify('Informe um CPF válido com 11 dígitos.');
      }

      if (!isPatientAccess && identifier.length < 4) {
        return notify('Informe um CRM válido.');
      }

      const { data: lookup, error: lookupError } = await window.radiaSupabase
        .rpc('obter_email_login', {
          p_tipo: functionType,
          p_identificador: identifier
        });

      if (lookupError) {
        console.error('Erro ao localizar usuário:', lookupError);
        return notify('Não foi possível consultar o cadastro no banco. Verifique se o SQL de login foi executado.');
      }

      email = lookup || '';
      if (!email) {
        return notify(isPatientAccess
          ? 'CPF não encontrado no cadastro.'
          : 'CRM não encontrado no cadastro.');
      }
    }

    const { data, error } = await window.radiaSupabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Erro no login:', error);
      return notify('Usuário ou senha inválidos.');
    }

    // Descobre o papel real do usuário no banco.
    const { data: perfil, error: perfilError } = await window.radiaSupabase
      .from('perfis')
      .select('id, tipo, nome_completo, telefone')
      .eq('id', data.user.id)
      .single();

    if (perfilError || !perfil) {
      await window.radiaSupabase.auth.signOut();
      console.error('Erro ao carregar perfil:', perfilError);
      return notify('Usuário autenticado, mas o perfil não foi encontrado no banco.');
    }

    // O administrador pode escolher qualquer uma das duas interfaces.
    if (perfil.tipo !== 'administrador' && perfil.tipo !== accessType) {
      await window.radiaSupabase.auth.signOut();
      return notify(`Este usuário é cadastrado como ${perfil.tipo} e não pode entrar como ${accessType}.`);
    }

    // Para paciente comum, confere o convênio informado com o cadastro.
    if (perfil.tipo === 'paciente') {
      const { data: paciente, error: pacienteError } = await window.radiaSupabase
        .from('pacientes')
        .select('cpf, convenio')
        .eq('id', data.user.id)
        .single();

      if (pacienteError || !paciente) {
        await window.radiaSupabase.auth.signOut();
        return notify('Cadastro de paciente não encontrado.');
      }

      if (paciente.convenio?.trim().toLowerCase() !== insurance.toLowerCase()) {
        await window.radiaSupabase.auth.signOut();
        return notify('O convênio informado não corresponde ao cadastro.');
      }
    }

    currentUser = {
      type: accessType,
      actualRole: perfil.tipo,
      name: perfil.nome_completo || (isPatientAccess ? 'Paciente' : 'Radiologista'),
      identifier: adminLogin ? data.user.email : credentialRaw,
      id: data.user.id,
      email: data.user.email
    };
    window.radiaCurrentUser = currentUser;

    document.getElementById('user-name').innerText = currentUser.name;
    document.getElementById('user-role').innerText = currentUser.actualRole === 'administrador'
      ? `${currentUser.type} • administrador • ${currentUser.identifier}`
      : currentUser.type + ' • ' + currentUser.identifier;
    document.getElementById('user-avatar').innerText = currentUser.name.slice(0, 2).toUpperCase();
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('nav-patient').classList.toggle('hidden', currentUser.type !== 'paciente');
    document.getElementById('nav-radiologist').classList.toggle('hidden', currentUser.type !== 'radiologista');
    addLog('Login realizado: ' + currentUser.type + (currentUser.actualRole === 'administrador' ? ' (administrador)' : ''));

    if (currentUser.type === 'paciente') {
      showSection('patient-consent');
    } else {
      updateDashboard();
      showSection('dashboard');
    }
  } catch (error) {
    console.error('Erro inesperado no login:', error);
    return notify('Não foi possível concluir o login. Tente novamente.');
  }
}

function showSection(id) {
  if(currentUser?.type==='paciente' && !['patient-consent','patient-feedback'].includes(id)) return;
  if(currentUser?.type==='radiologista' && ['patient-consent','patient-feedback'].includes(id)) return;
  document.querySelectorAll('main > section').forEach(s=>s.classList.add('hidden'));
  const target=document.getElementById('sec-'+id);
  if(target) target.classList.remove('hidden');
  if(id==='history') loadHistory();
  if(id==='logs') loadLogs();
  if(id==='dashboard') updateDashboard();
  if(id==='patient-feedback') loadPatientFeedback();
}
function loadPatientFeedback(){
  const box=document.getElementById('patient-feedback-list');
  const items=exams.filter(e=>e.patientCpf===currentUser?.identifier && e.feedback);
  if(!items.length){ box.innerHTML='<div class="bg-white p-6 rounded-xl border text-slate-500">Nenhum feedback foi disponibilizado pelo radiologista até o momento.</div>'; return; }
  box.innerHTML=items.slice().reverse().map(e=>`<div class="bg-white p-6 rounded-xl border shadow-sm"><div class="flex justify-between gap-4"><div><p class="font-bold">${esc(e.type)} • ${esc(e.region)}</p><p class="text-xs text-slate-500 mt-1">Exame em ${esc(formatDate(e.date))}</p></div><span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Feedback disponível</span></div><p class="mt-4 whitespace-pre-wrap text-slate-700">${esc(e.feedback)}</p></div>`).join('');
}
function toggleUploadButton() {
  document.getElementById('select-file-btn').disabled=!document.getElementById('consent-checkbox').checked;
}
function openConsentDetails(){ document.getElementById('consent-modal').classList.remove('hidden'); document.getElementById('consent-modal').classList.add('flex'); }
function closeConsentDetails(){ document.getElementById('consent-modal').classList.add('hidden'); document.getElementById('consent-modal').classList.remove('flex'); }

// REQ-UPLOAD + REQ-LGPD: impede o envio do exame antes da manifestação de consentimento.
// Formatos previstos pelo documento: DICOM, PNG, JPG e PDF.
function prepareExamFile() {
  const input=document.getElementById('file-input');
  if(!input.files[0]) return;
  if(!document.getElementById('consent-checkbox').checked) return notify('O consentimento do paciente é obrigatório antes do envio.');
  const file=input.files[0], ext=file.name.toLowerCase().split('.').pop();
  const allowed=['dcm','dicom','png','jpg','jpeg','pdf'];
  if(!allowed.includes(ext)) return notify('Formato não permitido.');
  const patient=document.getElementById('patient-name').value.trim();
  const type=document.getElementById('exam-type').value.trim();
  const region=document.getElementById('body-region').value.trim();
  if(!patient || !type || !region) {
    input.value='';
    return notify('Preencha paciente, tipo e região antes de selecionar o exame.');
  }
  document.getElementById('file-name').innerText=file.name;
  const date=document.getElementById('exam-date').value || new Date().toISOString().slice(0,10);
  document.getElementById('exam-date').value=date;
  renderPreview(file,ext);
  document.getElementById('upload-box').classList.add('opacity-80');
  document.getElementById('exam-workspace').classList.remove('hidden');
  addLog('Exame recebido com consentimento registrado: '+patient+' | '+file.name);
}
function renderPreview(file,ext) {
  ['exam-img-preview','pdf-preview','dicom-preview'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  if(['png','jpg','jpeg'].includes(ext)) {
    const reader=new FileReader();
    reader.onload=e=>{document.getElementById('exam-img-preview').src=e.target.result;document.getElementById('exam-img-preview').classList.remove('hidden');};
    reader.readAsDataURL(file);
  } else if(ext==='pdf') {
    document.getElementById('pdf-preview').src=URL.createObjectURL(file);
    document.getElementById('pdf-preview').classList.remove('hidden');
  } else document.getElementById('dicom-preview').classList.remove('hidden');
}
// REQ-LAUDO: registra revisão/aprovação manual do profissional enquanto a IA permanece desativada.
// REQ-LGPD: grava evidência do consentimento (versão, finalidade e data/hora).
function collectExam(status, reason='') {
  const file=document.getElementById('file-input').files[0];
  const consent=document.getElementById('consent-checkbox').checked;
  if(!consent) return notify('Não é possível registrar o exame sem consentimento.');
  if(!file) return notify('Selecione o exame.');
  const exam={
    id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date:document.getElementById('exam-date').value,
    patient:document.getElementById('patient-name').value.trim(),
    patientCpf:document.getElementById('patient-cpf')?.value.replace(/\D/g,'') || '',
    type:document.getElementById('exam-type').value.trim(),
    region:document.getElementById('body-region').value.trim(),
    fileName:file.name,
    fileType:file.name.toLowerCase().split('.').pop(),
    image:document.getElementById('exam-img-preview').src || '',
    laudo:document.getElementById('laudo-text').value.trim(),
    notes:document.getElementById('doctor-notes').value.trim(),
    feedback:document.getElementById('patient-feedback').value.trim(),
    status,
    rejectionReason:reason,
    consent:{accepted:true, version:CONSENT_VERSION, timestamp:new Date().toISOString(), purpose:'Atendimento médico e compartilhamento da imagem com o profissional responsável'},
    reviewedBy:currentUser ? currentUser.identifier : '',
    createdAt:new Date().toISOString()
  };
  exams.push(exam); saveData();
  addLog((status==='Aprovado'?'Laudo aprovado':'Exame rejeitado')+': '+exam.patient);
  notify(status==='Aprovado'?'Laudo aprovado e exame registrado.':'Exame rejeitado e registrado.');
  resetExamForm(); showSection('history');
}
function finalizeExam(status){ collectExam(status); }
function showRejectBox(){ document.getElementById('reject-box').classList.remove('hidden'); }
function rejectExam(){
  const reason=document.getElementById('reject-reason').value.trim();
  if(!reason) return notify('Informe o motivo da rejeição.');
  collectExam('Rejeitado',reason);
}
function saveData(){
  localStorage.setItem('radia_exams',JSON.stringify(exams));
  localStorage.setItem('radia_logs',JSON.stringify(logs));
}
// REQ-AUDITORIA/SEGURANÇA: protótipo registra eventos relevantes. Em produção, os logs devem ser protegidos contra alteração.
function addLog(msg){
  logs.push({time:new Date().toLocaleString('pt-BR'),msg});
  saveData();
}
function resetExamForm(){
  ['patient-name','patient-cpf','exam-type','body-region','laudo-text','doctor-notes','patient-feedback','reject-reason'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('file-input').value='';
  document.getElementById('file-name').innerText='Nenhum arquivo selecionado';
  document.getElementById('consent-checkbox').checked=false;
  toggleUploadButton();
  document.getElementById('exam-workspace').classList.add('hidden');
  document.getElementById('upload-box').classList.remove('opacity-80');
  document.getElementById('reject-box').classList.add('hidden');
}
// REQ-HISTÓRICO/BUSCA: permite filtrar exames por paciente, data, tipo e região corporal.
function loadHistory(){
  const body=document.getElementById('history-table-body');
  const n=(document.getElementById('search-name')?.value||'').toLowerCase();
  const d=document.getElementById('search-date')?.value||'';
  const t=(document.getElementById('search-type')?.value||'').toLowerCase();
  const r=(document.getElementById('search-region')?.value||'').toLowerCase();
  const filtered=exams.filter(e=>
    (!n||e.patient.toLowerCase().includes(n)) &&
    (!d||e.date===d) &&
    (!t||e.type.toLowerCase().includes(t)) &&
    (!r||e.region.toLowerCase().includes(r))
  );
  if(!filtered.length){body.innerHTML='<tr><td colspan="6" class="p-6 text-center text-slate-400">Nenhum exame encontrado.</td></tr>';return;}
  body.innerHTML=filtered.slice().reverse().map(e=>`
    <tr class="border-b hover:bg-slate-50">
      <td class="p-4 text-sm">${esc(formatDate(e.date))}</td><td class="p-4 font-semibold">${esc(e.patient)}</td>
      <td class="p-4">${esc(e.type)}</td><td class="p-4">${esc(e.region)}</td>
      <td class="p-4"><span class="px-2 py-1 rounded ${e.status==='Aprovado'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${esc(e.status)}</span></td>
      <td class="p-4"><button onclick="viewExam('${e.id}')" class="text-blue-600 font-semibold">Visualizar</button></td>
    </tr>`).join('');
}
function formatDate(d){ if(!d) return ''; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }
function viewExam(id){
  const exam=exams.find(e=>e.id===id); if(!exam)return;
  currentExam=exam;
  document.getElementById('modal-patient').innerText=exam.patient;
  document.getElementById('modal-date').innerText=formatDate(exam.date);
  document.getElementById('modal-type-region').innerText=exam.type+' • '+exam.region;
  document.getElementById('modal-consent').innerText=`Registrado em ${new Date(exam.consent.timestamp).toLocaleString('pt-BR')} — termo ${exam.consent.version}.`;
  document.getElementById('modal-laudo').innerText=exam.laudo || 'Sem laudo informado.';
  document.getElementById('modal-notes').innerText=exam.notes || 'Sem observações.';
  document.getElementById('modal-feedback').innerText=exam.feedback || 'Nenhum feedback disponibilizado ao paciente.';
  const media=document.getElementById('modal-media'); media.innerHTML='';
  if(exam.image){const img=document.createElement('img');img.src=exam.image;img.className='max-w-full max-h-[600px] object-contain';media.appendChild(img);}
  else {media.innerHTML='<div class="text-center text-slate-500"><i class="fas fa-file-medical text-5xl mb-3"></i><p>Arquivo '+esc(exam.fileName)+' armazenado no registro.</p><p class="text-xs mt-2">A visualização DICOM/PDF depende do visualizador do ambiente.</p></div>';}
  document.getElementById('modal-view').style.display='flex';
}
function closeModal(){document.getElementById('modal-view').style.display='none';}
function printCurrentExam(){
  if(!currentExam)return;
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Laudo — ${esc(currentExam.patient)}</title><style>body{font-family:Arial;padding:40px}h1{font-size:22px}.meta{color:#666;font-size:12px;text-transform:uppercase;margin-top:20px}.box{padding:16px;background:#f1f5f9;border-radius:8px;white-space:pre-wrap}</style></head><body><h1>RadIA — Resultado do Exame</h1><p><b>Paciente:</b> ${esc(currentExam.patient)}</p><p><b>Data:</b> ${esc(formatDate(currentExam.date))}</p><p><b>Exame:</b> ${esc(currentExam.type)} — ${esc(currentExam.region)}</p><p class="meta">Laudo</p><div class="box">${esc(currentExam.laudo||'Sem laudo')}</div><p class="meta">Observações</p><div class="box">${esc(currentExam.notes||'Sem observações')}</div><p class="meta">Consentimento</p><p>Termo ${esc(currentExam.consent.version)} registrado em ${esc(new Date(currentExam.consent.timestamp).toLocaleString('pt-BR'))}.</p></body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}
// REQ-EXPORTAÇÃO: usa a impressão do navegador para permitir 'Salvar como PDF'.
// Em produção, recomenda-se geração de PDF no backend para padronização e rastreabilidade.
function exportHistoryPDF(){ const first=exams[exams.length-1]; if(!first)return notify('Não há exames para exportar.'); viewExam(first.id); setTimeout(printCurrentExam,400); }
function loadLogs(){
  document.getElementById('log-container').innerHTML=logs.length?logs.slice().reverse().map(l=>`<div>[${esc(l.time)}] ${esc(l.msg)}</div>`).join(''):'<div>Nenhum log registrado.</div>';
}
// REQ-USABILIDADE: indicadores resumem exames e pendências para o profissional.
function updateDashboard(){
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('stats-today').innerText=exams.filter(e=>e.date===today).length;
  document.getElementById('stats-history').innerText=exams.length;
  document.getElementById('stats-pending').innerText=exams.filter(e=>e.status!=='Aprovado').length;
  renderCharts();
}
function renderCharts(){
  const byDay={}; exams.forEach(e=>byDay[e.date]=(byDay[e.date]||0)+1);
  if(examChart)examChart.destroy();
  examChart=new Chart(document.getElementById('examChart'),{type:'bar',data:{labels:Object.keys(byDay).map(formatDate),datasets:[{label:'Exames',data:Object.values(byDay)}]}});
  if(statusChart)statusChart.destroy();
  statusChart=new Chart(document.getElementById('statusChart'),{type:'doughnut',data:{labels:['Aprovados','Rejeitados'],datasets:[{data:[exams.filter(e=>e.status==='Aprovado').length,exams.filter(e=>e.status==='Rejeitado').length]}]}});
}
async function logout(){
  if (window.radiaSupabase) {
    await window.radiaSupabase.auth.signOut();
  }
  location.reload();
}
document.getElementById('exam-date').value=new Date().toISOString().slice(0,10);
toggleLoginFields();
