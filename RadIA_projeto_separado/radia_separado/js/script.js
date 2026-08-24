/* ============================================================
   RadIA - JavaScript principal
   ------------------------------------------------------------
   Este arquivo concentra toda a lógica da aplicação:
   login, navegação, processamento simulado, histórico,
   armazenamento local, logs, notificações e gráficos.
   ============================================================ */

/* ============================================================
   ESTADO DA APLICAÇÃO
   ============================================================ */

/* Guarda os dados do médico atualmente conectado. */
let currentUser = null;

/* Recupera os exames salvos anteriormente no navegador.
   Se não houver nenhum exame, começa com um array vazio. */
let exams = JSON.parse(localStorage.getItem('radia_exams')) || [];

/* Recupera os logs salvos anteriormente no navegador. */
let logs = JSON.parse(localStorage.getItem('radia_logs')) || [];

/* Referências para os dois gráficos.
   Elas permitem destruir um gráfico antes de desenhá-lo novamente. */
let examChart = null;
let statusChart = null;


/* ============================================================
   LOGIN
   ============================================================ */

/**
 * Valida os dados digitados e libera o sistema.
 * Observação: este login é apenas uma simulação front-end.
 */
function handleLogin() {
    /* Obtém os valores dos campos de login. */
    const crm = document.getElementById('crm-input').value;
    const nome = document.getElementById('doctor-name').value;

    /* Valida se o nome foi informado. */
    if (!nome.trim()) {
        return notify('Informe o nome do médico!');
    }

    /* Valida o tamanho mínimo do CRM. */
    if (crm.length < 4) {
        return notify('CRM inválido!');
    }

    /* Cria o objeto com os dados do usuário. */
    currentUser = {
        crm: crm,
        name: nome
    };

    /* Atualiza as informações do usuário na barra lateral. */
    document.getElementById('user-name').innerText = 'Dr. ' + nome;
    document.getElementById('user-crm').innerText = 'CRM: ' + crm;
    document.getElementById('user-avatar').innerText =
        nome.substring(0, 2).toUpperCase();

    /* Esconde a tela de login. */
    document.getElementById('login-page').classList.add('hidden');

    /* Exibe a aplicação principal. */
    document.getElementById('app-shell').classList.remove('hidden');

    /* Atualiza os indicadores e abre o dashboard. */
    updateDashboard();
    showSection('dashboard');
}


/* ============================================================
   NAVEGAÇÃO
   ============================================================ */

/**
 * Mostra somente a seção solicitada.
 *
 * @param {string} id - Nome da seção sem o prefixo "sec-".
 */
function showSection(id) {
    /* Esconde todas as seções dentro do main. */
    document.querySelectorAll('main > section').forEach(section => {
        section.classList.add('hidden');
    });

    /* Exibe a seção solicitada. */
    const target = document.getElementById('sec-' + id);

    if (target) {
        target.classList.remove('hidden');
    }

    /* Atualiza os dados quando determinadas telas são abertas. */
    if (id === 'history') loadHistory();
    if (id === 'logs') loadLogs();
    if (id === 'dashboard') updateDashboard();
}


/* ============================================================
   PROCESSAMENTO DE NOVO EXAME
   ============================================================ */

/**
 * Inicia a leitura da imagem e simula o processamento da IA.
 */
function startAnalysis() {
    /* Recupera o input de arquivo e o nome do paciente. */
    const fileInput = document.getElementById('file-input');
    const patient = document.getElementById('patient-name').value;

    /* O paciente é obrigatório. */
    if (!patient.trim()) {
        return notify('Nome do paciente obrigatório!');
    }

    /* Garante que um arquivo foi realmente selecionado. */
    if (!fileInput.files || !fileInput.files[0]) {
        return notify('Selecione uma radiografia!');
    }

    /* FileReader permite visualizar a imagem localmente sem enviá-la
       para um servidor. */
    const reader = new FileReader();

    /* Quando a leitura termina, coloca a imagem no preview. */
    reader.onload = (event) => {
        document.getElementById('exam-img-preview').src = event.target.result;
    };

    /* Inicia a leitura do arquivo como Data URL. */
    reader.readAsDataURL(fileInput.files[0]);

    /* Troca a tela de upload pela tela de processamento. */
    document.getElementById('upload-box').classList.add('hidden');
    document.getElementById('ai-loading').classList.remove('hidden');

    /* Variável usada para controlar a barra de progresso simulada. */
    let prog = 0;

    /* Aumenta a barra a cada 50 milissegundos. */
    const interval = setInterval(() => {
        prog += 5;

        document.getElementById('ai-progress').style.width =
            prog + '%';

        /* Ao chegar a 100%, encerra a simulação e mostra o resultado. */
        if (prog >= 100) {
            clearInterval(interval);
            showResult();
        }
    }, 50);
}


/**
 * Mostra o resultado simulado da análise.
 * Um laudo é escolhido aleatoriamente apenas para fins de protótipo.
 */
function showResult() {
    /* Esconde o carregamento e exibe o resultado. */
    document.getElementById('ai-loading').classList.add('hidden');
    document.getElementById('ai-result').classList.remove('hidden');

    /* Possíveis laudos usados pela simulação. */
    const laudos = [
        'Sem alterações radiográficas evidentes. Não há sinais de fratura ou luxação.',
        'Achados compatíveis com fratura linear sem desvio significativo. Recomenda-se correlação clínica.',
        'Possível fissura óssea discreta observada. Sugere-se avaliação ortopédica.',
        'Redução do espaço articular com sinais sugestivos de processo degenerativo.',
        'Imagem compatível com pequena fratura cortical. Considerar imobilização conforme avaliação clínica.',
        'Alinhamento preservado, sem evidências de lesão óssea aguda.',
        'Opacidade sugestiva de processo inflamatório, recomendando investigação complementar.',
        'Sinais sugestivos de consolidação óssea em evolução após fratura prévia.'
    ];

    /* Escolhe um dos textos aleatoriamente e preenche o textarea. */
    const indice = Math.floor(Math.random() * laudos.length);
    document.getElementById('laudo-text').value = laudos[indice];
}


/* ============================================================
   APROVAÇÃO DE EXAME
   ============================================================ */

/**
 * Salva um exame aprovado no localStorage.
 *
 * @param {string} status - Status do exame.
 */
function finalizeExam(status) {
    /* Cria o objeto que representa o novo exame. */
    const newExam = {
        id: Date.now(),
        date: new Date().toLocaleString('pt-BR'),
        patient: document.getElementById('patient-name').value,
        laudo: document.getElementById('laudo-text').value,
        image: document.getElementById('exam-img-preview').src,
        status: status
    };

    /* Adiciona o exame à lista em memória. */
    exams.push(newExam);

    /* Persiste os exames no navegador. */
    localStorage.setItem('radia_exams', JSON.stringify(exams));

    /* Cria um registro de auditoria. */
    logs.push({
        time: new Date().toLocaleString('pt-BR'),
        msg: 'Exame aprovado: ' + newExam.patient
    });

    /* Persiste os logs no navegador. */
    localStorage.setItem('radia_logs', JSON.stringify(logs));

    /* Informa ao usuário que a operação terminou. */
    notify('Exame salvo com sucesso!');

    /* Limpa a tela de resultado para permitir um novo exame. */
    document.getElementById('ai-result').classList.add('hidden');
    document.getElementById('upload-box').classList.remove('hidden');

    /* Limpa o nome do paciente. */
    document.getElementById('patient-name').value = '';

    /* Volta para o histórico. */
    showSection('history');
}


/* ============================================================
   REJEIÇÃO DE EXAME
   ============================================================ */

/**
 * Exibe a caixa onde o médico informa o motivo da rejeição.
 */
function showRejectBox() {
    document.getElementById('reject-box').classList.remove('hidden');
}


/**
 * Salva um exame rejeitado e registra o motivo.
 */
function rejectExam() {
    /* Recupera o motivo informado pelo médico. */
    const motivo = document.getElementById('reject-reason').value;

    /* O motivo é obrigatório. */
    if (!motivo.trim()) {
        return notify('Informe o motivo da rejeição!');
    }

    /* Cria o exame rejeitado. */
    const newExam = {
        id: Date.now(),
        date: new Date().toLocaleString('pt-BR'),
        patient: document.getElementById('patient-name').value,
        laudo: 'REJEITADO PELO MÉDICO\n\nMotivo:\n' + motivo,
        image: document.getElementById('exam-img-preview').src,
        status: 'Rejeitado'
    };

    /* Adiciona e persiste o exame. */
    exams.push(newExam);
    localStorage.setItem('radia_exams', JSON.stringify(exams));

    /* Cria e persiste o log de rejeição. */
    logs.push({
        time: new Date().toLocaleString('pt-BR'),
        msg: 'Exame rejeitado: ' + newExam.patient + ' | Motivo: ' + motivo
    });

    localStorage.setItem('radia_logs', JSON.stringify(logs));

    /* Atualiza os indicadores e informa o usuário. */
    updateDashboard();
    notify('Diagnóstico rejeitado!');

    /* Abre o histórico. */
    showSection('history');
}


/* ============================================================
   HISTÓRICO
   ============================================================ */

/**
 * Monta dinamicamente as linhas da tabela de histórico.
 */
function loadHistory() {
    const body = document.getElementById('history-table-body');

    /* Se não houver exames, mostra uma mensagem simples. */
    if (exams.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="4" class="p-6 text-center text-slate-400">
                    Nenhum exame registrado.
                </td>
            </tr>
        `;
        return;
    }

    /* Converte cada exame em uma linha HTML.
       reverse() faz o exame mais recente aparecer primeiro. */
    body.innerHTML = exams
        .map(ex => `
            <tr class="border-b hover:bg-slate-50 transition">
                <td class="p-4 text-xs">${ex.date}</td>

                <td class="p-4 font-semibold">
                    ${ex.patient}
                </td>

                <td class="p-4 text-xs">
                    <span class="${
                        ex.status === 'Aprovado'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                    } px-2 py-1 rounded">
                        ${ex.status}
                    </span>
                </td>

                <td class="p-4">
                    <button
                        onclick="viewExam(${ex.id})"
                        class="text-blue-600 hover:text-blue-800 p-2">
                        <i class="fas fa-eye"></i> Visualizar
                    </button>
                </td>
            </tr>
        `)
        .reverse()
        .join('');
}


/**
 * Abre o modal com os dados de um exame específico.
 *
 * @param {number} id - Identificador do exame.
 */
function viewExam(id) {
    /* Procura o exame correspondente ao ID. */
    const exam = exams.find(examItem => examItem.id === id);

    /* Se não encontrou, não faz nada. */
    if (!exam) return;

    /* Preenche as informações do modal. */
    document.getElementById('modal-img').src = exam.image;
    document.getElementById('modal-patient').innerText = exam.patient;
    document.getElementById('modal-date').innerText = exam.date;
    document.getElementById('modal-laudo').innerText = exam.laudo;

    /* Exibe o modal. */
    document.getElementById('modal-view').style.display = 'flex';
}


/**
 * Fecha o modal de detalhes.
 */
function closeModal() {
    document.getElementById('modal-view').style.display = 'none';
}


/* ============================================================
   LOGS DE AUDITORIA
   ============================================================ */

/**
 * Exibe os logs armazenados na tela de auditoria.
 */
function loadLogs() {
    const container = document.getElementById('log-container');

    /* Se não houver logs, mostra uma mensagem. */
    if (logs.length === 0) {
        container.innerHTML = '<div>Nenhum log registrado.</div>';
        return;
    }

    /* Converte cada log em uma linha e mostra o mais recente primeiro. */
    container.innerHTML = logs
        .map(log => `<div>[${log.time}] ${log.msg}</div>`)
        .reverse()
        .join('');
}


/* ============================================================
   NOTIFICAÇÕES
   ============================================================ */

/**
 * Mostra uma mensagem temporária no canto inferior da tela.
 *
 * @param {string} msg - Mensagem que será exibida.
 */
function notify(msg) {
    const toast = document.getElementById('toast');

    /* Coloca a mensagem dentro do componente. */
    document.getElementById('toast-msg').innerText = msg;

    /* Faz o toast aparecer. */
    toast.classList.remove('translate-y-20', 'opacity-0');

    /* Depois de 3 segundos, esconde novamente. */
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}


/* ============================================================
   DASHBOARD
   ============================================================ */

/**
 * Atualiza os indicadores exibidos no dashboard.
 */
function updateDashboard() {
    /* Atualiza a quantidade de exames. */
    document.getElementById('stats-today').innerText = exams.length;
    document.getElementById('stats-history').innerText = exams.length;

    /* Redesenha os gráficos. */
    renderCharts();
}


/**
 * Cria ou atualiza os gráficos do dashboard.
 */
function renderCharts() {
    /* Objeto que armazenará a quantidade de exames por data. */
    const examesPorDia = {};

    /* Percorre todos os exames e agrupa pela data. */
    exams.forEach(exam => {
        const data = exam.date.split(' ')[0];
        examesPorDia[data] = (examesPorDia[data] || 0) + 1;
    });

    /* Separa as datas e quantidades em arrays para o Chart.js. */
    const labels = Object.keys(examesPorDia);
    const valores = Object.values(examesPorDia);

    /* Destrói o gráfico anterior antes de criar outro. */
    if (examChart) {
        examChart.destroy();
    }

    const ctx1 = document.getElementById('examChart');

    /* Cria o gráfico de barras. */
    if (ctx1) {
        examChart = new Chart(ctx1, {
            type: 'bar',

            data: {
                labels: labels,

                datasets: [{
                    label: 'Exames',
                    data: valores,
                    backgroundColor: '#2563eb'
                }]
            }
        });
    }

    /* Conta quantos exames foram aprovados. */
    const aprovados = exams.filter(
        exam => exam.status === 'Aprovado'
    ).length;

    /* Tudo que não for aprovado entra no grupo "Outros". */
    const outros = exams.length - aprovados;

    /* Remove o gráfico anterior antes de recriar. */
    if (statusChart) {
        statusChart.destroy();
    }

    const ctx2 = document.getElementById('statusChart');

    /* Cria o gráfico de rosca. */
    if (ctx2) {
        statusChart = new Chart(ctx2, {
            type: 'doughnut',

            data: {
                labels: ['Aprovados', 'Outros'],

                datasets: [{
                    data: [aprovados, outros],
                    backgroundColor: ['#22c55e', '#f59e0b']
                }]
            }
        });
    }
}


/* ============================================================
   LOGOUT
   ============================================================ */

/**
 * Recarrega a página, encerrando a sessão simulada.
 * Os exames e logs permanecem no localStorage.
 */
function logout() {
    location.reload();
}
