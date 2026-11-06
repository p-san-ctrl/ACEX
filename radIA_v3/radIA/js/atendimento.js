(function atendimentoModule() {
  'use strict';

  const PRIORITY_WEIGHT = { urgente: 0, prioritario: 1, prioritária: 1, normal: 2 };
  const STATUS_LABEL = {
    pendente: 'Na fila',
    em_analise: 'Em análise',
    concluido: 'Aprovado',
    rejeitado: 'Rejeitado',
  };
  const STATUS_FILTER = {
    'Na fila': 'pendente',
    'Em análise': 'em_analise',
    Rejeitado: 'rejeitado',
  };
  const FLOW_STEPS = ['Recebido', 'Na fila', 'Em análise', 'Laudo liberado'];
  const element = (id) => document.getElementById(id);
  let activeExam = null;

  function service() {
    if (!window.RadiaExamService) throw new Error('Serviço de exames indisponível.');
    return window.RadiaExamService;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
  }

  function normalizePriority(priority) {
    return String(priority || 'normal').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function priorityLabel(priority) {
    const normalized = normalizePriority(priority);
    if (normalized === 'urgente') return 'Urgente';
    if (normalized === 'prioritario') return 'Prioritário';
    return 'Normal';
  }

  function priorityBadge(priority) {
    const label = priorityLabel(priority);
    const classes = label === 'Urgente'
      ? 'bg-rose-100 text-rose-700'
      : label === 'Prioritário'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';
    return `<span class="${classes} rounded-full px-2.5 py-1 text-xs font-bold">${label}</span>`;
  }

  function statusLabel(status) {
    return STATUS_LABEL[status] || status || 'Pendente';
  }

  function statusBadge(status) {
    const label = statusLabel(status);
    const classes = status === 'concluido'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'em_analise'
        ? 'bg-blue-100 text-blue-700'
        : status === 'rejeitado'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-700';
    return `<span class="${classes} rounded-full px-2.5 py-1 text-xs font-bold">${escapeHtml(label)}</span>`;
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
  }

  function arrivalTime(exam) {
    return exam.criado_em || exam.data_exame || '';
  }

  function queueExams(exams) {
    return exams
      .filter((exam) => exam.status !== 'concluido')
      .sort((first, second) => {
        const priority = (PRIORITY_WEIGHT[normalizePriority(first.prioridade)] ?? 3)
          - (PRIORITY_WEIGHT[normalizePriority(second.prioridade)] ?? 3);
        return priority || new Date(arrivalTime(first)) - new Date(arrivalTime(second));
      });
  }

  function setText(id, value) {
    const target = element(id);
    if (target) target.textContent = String(value);
  }

  function notifyUser(message) {
    if (typeof window.notify === 'function') window.notify(message);
    else console.info(message);
  }

  function matchesFilters(exam) {
    const search = (element('queue-search')?.value || '').trim().toLowerCase();
    const priority = element('queue-priority')?.value || '';
    const status = STATUS_FILTER[element('queue-status')?.value || ''] || '';
    const searchable = [exam.id, exam.tipo_exame, exam.regiao_corpo, exam.pacientes?.cpf].join(' ').toLowerCase();
    return (!search || searchable.includes(search))
      && (!priority || priorityLabel(exam.prioridade) === priority)
      && (!status || exam.status === status);
  }

  window.renderEnhancedQueue = async function renderEnhancedQueue() {
    const output = element('enhanced-queue-list');
    if (!output) return;
    output.innerHTML = '<div class="radia-card py-12 text-center text-slate-400">Carregando fila...</div>';

    try {
      const fullQueue = queueExams(await service().listExams());
      const visible = fullQueue.filter(matchesFilters);
      const waiting = fullQueue.filter((exam) => exam.status !== 'em_analise');
      const active = fullQueue.filter((exam) => exam.status === 'em_analise');
      setText('queue-total', waiting.length);
      setText('queue-urgent', waiting.filter((exam) => priorityLabel(exam.prioridade) === 'Urgente').length);
      setText('queue-active', active.length);
      setText('queue-badge', fullQueue.length);

      output.innerHTML = visible.map((exam) => {
        const position = fullQueue.findIndex((item) => item.id === exam.id) + 1;
        const urgentClass = priorityLabel(exam.prioridade) === 'Urgente' ? 'queue-card-urgent' : '';
        const cpfFinal = exam.pacientes?.cpf?.slice(-4) || '—';
        const action = exam.status === 'rejeitado' ? 'Revisar' : 'Atender';
        return `<article class="queue-card ${urgentClass}">
          <div class="queue-position" aria-label="Posição ${position} na fila">${position}º</div>
          <div class="queue-card-body">
            <div class="mb-2 flex flex-wrap items-center gap-2">${priorityBadge(exam.prioridade)}${statusBadge(exam.status)}</div>
            <h3 class="text-lg font-bold">${escapeHtml(exam.tipo_exame)} — ${escapeHtml(exam.regiao_corpo)}</h3>
            <p class="mt-1 text-xs text-slate-500">CPF final ${escapeHtml(cpfFinal)} • chegada ${escapeHtml(formatDateTime(arrivalTime(exam)))}</p>
            ${exam.observacoes ? `<p class="mt-2 text-xs text-slate-500">${escapeHtml(exam.observacoes)}</p>` : ''}
          </div>
          <div class="queue-card-actions"><button type="button" class="radia-btn" onclick="startAttendance('${escapeHtml(exam.id)}')"><i class="fas fa-stethoscope mr-2"></i>${action}</button></div>
        </article>`;
      }).join('') || '<div class="radia-card py-12 text-center text-slate-400">Nenhum paciente encontrado na fila.</div>';
    } catch (error) {
      console.error('Falha ao carregar a fila:', error);
      output.innerHTML = '<div class="radia-card py-12 text-center text-red-600">Não foi possível carregar a fila de atendimento.</div>';
    }
  };

  function renderFlow(exam) {
    const flow = element('attendance-flow');
    if (!flow) return;
    const currentIndex = exam.status === 'concluido' ? 3 : exam.status === 'em_analise' ? 2 : 1;
    flow.innerHTML = FLOW_STEPS.map((step, index) => {
      const complete = index < currentIndex || exam.status === 'concluido';
      const current = index === currentIndex && exam.status !== 'concluido';
      return `<div class="flow-step ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}"><span>${complete ? '<i class="fas fa-check"></i>' : index + 1}</span><small>${step}</small></div>`;
    }).join('');
  }

  function renderTimeline(exam) {
    const items = [{ event: 'Exame recebido e registrado', date: exam.criado_em || exam.data_exame }];
    if (exam.analise) {
      items.push({
        event: exam.analise.status === 'concluido' ? 'Análise preliminar por IA concluída' : `Análise por IA: ${exam.analise.status}`,
        date: exam.analise.concluido_em || exam.analise.iniciado_em || exam.analise.criado_em,
      });
    }
    if (exam.laudo?.revisado_em) items.push({ event: 'Revisão profissional registrada', date: exam.laudo.revisado_em });
    if (exam.status === 'rejeitado') items.push({ event: `Atendimento devolvido para revisão: ${exam.motivo_rejeicao || 'motivo registrado'}`, date: exam.atualizado_em });
    if (exam.status === 'concluido') items.push({ event: 'Laudo aprovado e liberado ao paciente', date: exam.atualizado_em });

    element('attendance-timeline').innerHTML = items.reverse().map((item) => `<div class="timeline-item"><span></span><div><p class="text-sm font-semibold">${escapeHtml(item.event)}</p><p class="mt-1 text-xs text-slate-400">${escapeHtml(formatDateTime(item.date))}</p></div></div>`).join('');
  }

  function renderPrivateImage(exam) {
    const stage = element('attendance-image-stage');
    stage.replaceChildren();
    if (!exam.imageUrl) {
      stage.innerHTML = '<div class="text-center"><i class="fas fa-x-ray mb-4 text-6xl text-blue-400"></i><p class="font-semibold">Imagem indisponível</p><p class="mt-2 text-sm text-slate-400">Não foi possível obter uma URL temporária para este arquivo.</p></div>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'relative inline-block max-w-full';
    const image = document.createElement('img');
    image.src = exam.imageUrl;
    image.alt = 'Radiografia do atendimento';
    image.className = 'block max-h-[560px] max-w-full object-contain';
    const overlay = document.createElement('div');
    overlay.className = 'pointer-events-none absolute inset-0';
    wrapper.append(image, overlay);
    stage.appendChild(wrapper);
    image.addEventListener('load', () => window.RadiaAIViewer?.renderOverlay(overlay, exam.analise?.achados || []));
  }

  window.startAttendance = async function startAttendance(examId) {
    activeExam = null;
    element('attendance-modal').classList.remove('hidden');
    element('attendance-modal').classList.add('flex');
    setText('attendance-patient', 'Carregando atendimento...');
    setText('attendance-meta', 'Buscando dados privados do exame');
    element('attendance-image-stage').innerHTML = '<div class="text-center text-slate-400"><i class="fas fa-spinner fa-spin mb-3 text-3xl"></i><p>Carregando imagem e análise...</p></div>';

    try {
      const exam = await service().examDetails(examId);
      activeExam = exam;
      const cpfFinal = exam.pacientes?.cpf?.slice(-4) || '—';
      setText('attendance-patient', `${exam.tipo_exame} — CPF final ${cpfFinal}`);
      element('attendance-meta').innerHTML = `${escapeHtml(exam.regiao_corpo)} • ${priorityBadge(exam.prioridade)} • ${statusBadge(exam.status)}`;
      element('attendance-report').value = exam.laudo?.texto_laudo || '';
      element('attendance-feedback').value = exam.laudo?.retorno_paciente || '';
      element('attendance-reason').value = '';
      element('attendance-reviewed').checked = false;
      renderFlow(exam);
      renderTimeline(exam);
      renderPrivateImage(exam);
    } catch (error) {
      console.error('Falha ao abrir atendimento:', error);
      closeAttendanceModal();
      notifyUser(error.message || 'Não foi possível abrir o atendimento.');
    }
  };

  window.closeAttendanceModal = function closeAttendanceModal() {
    element('attendance-modal')?.classList.add('hidden');
    element('attendance-modal')?.classList.remove('flex');
    activeExam = null;
  };

  async function saveDecision(decision) {
    if (!activeExam) return;
    const reportText = element('attendance-report').value.trim();
    const feedback = element('attendance-feedback').value.trim();
    const reason = element('attendance-reason').value.trim();

    if (!reportText) {
      element('attendance-report').focus();
      return notifyUser('Informe o laudo antes de concluir o atendimento.');
    }
    if (decision === 'aprovada' && !element('attendance-reviewed').checked) {
      element('attendance-reviewed').focus();
      return notifyUser('Confirme a revisão do exame e do laudo.');
    }
    if (decision === 'rejeitada' && !reason) {
      element('attendance-reason').focus();
      return notifyUser('Informe a justificativa para devolver o atendimento à fila.');
    }

    try {
      await service().saveReview({
        examId: activeExam.id,
        decision,
        reportText,
        patientFeedback: feedback,
        reason,
      });
      const message = decision === 'aprovada'
        ? 'Laudo aprovado e liberado ao paciente.'
        : 'Atendimento devolvido para revisão.';
      closeAttendanceModal();
      await Promise.allSettled([
        window.renderEnhancedQueue(),
        typeof window.updateDashboard === 'function' ? window.updateDashboard() : Promise.resolve(),
        typeof window.loadHistory === 'function' ? window.loadHistory() : Promise.resolve(),
        typeof window.loadLogs === 'function' ? window.loadLogs() : Promise.resolve(),
      ]);
      notifyUser(message);
    } catch (error) {
      console.error('Falha ao salvar revisão:', error);
      notifyUser(error.message || 'Não foi possível salvar a revisão profissional.');
    }
  }

  window.approveAttendance = function approveAttendance() {
    return saveDecision('aprovada');
  };

  window.returnAttendanceToQueue = function returnAttendanceToQueue() {
    return saveDecision('rejeitada');
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAttendanceModal();
  });

  document.addEventListener('DOMContentLoaded', () => {
    element('attendance-modal')?.addEventListener('click', (event) => {
      if (event.target === element('attendance-modal')) closeAttendanceModal();
    });
  });
})();
