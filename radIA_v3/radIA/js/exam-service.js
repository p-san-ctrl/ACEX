(function () {
  'use strict';

  const BUCKET = 'medical-images';
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

  function client() {
    if (!window.radiaSupabase) throw new Error('Supabase não configurado.');
    return window.radiaSupabase;
  }

  function assertFile(file) {
    if (!file) throw new Error('Selecione uma radiografia.');
    if (!ALLOWED_TYPES.has(file.type)) throw new Error('A análise aceita somente imagens PNG ou JPEG.');
    if (file.size > MAX_FILE_SIZE) throw new Error('A imagem deve ter no máximo 10 MB.');
  }

  function extension(file) {
    return file.type === 'image/png' ? 'png' : 'jpg';
  }

  function unwrapFunctionError(error, fallback) {
    const message = error?.context?.body?.error || error?.message;
    return new Error(message || fallback);
  }

  async function uploadExam({ file, patientCpf, examDate, examType, bodyRegion, notes = '' }) {
    assertFile(file);
    const supabase = client();
    const cpf = String(patientCpf || '').replace(/\D/g, '');
    if (cpf.length !== 11) throw new Error('Informe um CPF válido com 11 dígitos.');

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) throw new Error('Sua sessão expirou. Entre novamente.');

    const { data: patient, error: patientError } = await supabase
      .from('pacientes')
      .select('id')
      .eq('cpf', cpf)
      .maybeSingle();
    if (patientError) throw patientError;
    if (!patient) throw new Error('Paciente não encontrado para o CPF informado.');

    const { data: exam, error: examError } = await supabase
      .from('exames')
      .insert({
        paciente_id: patient.id,
        radiologista_id: user.id,
        data_exame: examDate,
        tipo_exame: examType,
        regiao_corpo: bodyRegion,
        status: 'em_analise',
        observacoes: notes || null,
      })
      .select('id, paciente_id, radiologista_id, data_exame, tipo_exame, regiao_corpo, status')
      .single();
    if (examError || !exam) throw examError || new Error('Não foi possível registrar o exame.');

    const objectPath = `${user.id}/${exam.id}/${crypto.randomUUID()}.${extension(file)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
      contentType: file.type,
      cacheControl: '0',
      upsert: false,
    });
    if (uploadError) {
      await supabase.from('exames').update({
        status: 'rejeitado', motivo_rejeicao: 'Falha técnica durante o upload da imagem.',
      }).eq('id', exam.id);
      throw uploadError;
    }

    const { data: examFile, error: fileError } = await supabase
      .from('arquivos_exame')
      .insert({
        exame_id: exam.id,
        caminho_armazenamento: objectPath,
        nome_original: file.name,
        tipo_mime: file.type,
        tamanho_arquivo: file.size,
      })
      .select('id, caminho_armazenamento')
      .single();
    if (fileError || !examFile) {
      await supabase.storage.from(BUCKET).remove([objectPath]);
      throw fileError || new Error('Não foi possível registrar o arquivo.');
    }

    return { ...exam, arquivo: examFile };
  }

  async function requestAnalysis(examId) {
    const { data, error } = await client().functions.invoke('analisar-exame', {
      body: { exame_id: examId },
    });
    if (error) throw unwrapFunctionError(error, 'Não foi possível iniciar a análise de IA.');
    return data;
  }

  async function uploadAndAnalyze(payload) {
    const exam = await uploadExam(payload);
    try {
      const request = await requestAnalysis(exam.id);
      return { exam, request };
    } catch (error) {
      error.exam = exam;
      throw error;
    }
  }

  async function latestAnalysis(examId) {
    const { data: analysis, error } = await client()
      .from('analises_ia')
      .select('id, exame_id, nome_modelo, versao_modelo, status, erro_mensagem, resposta_bruta, iniciado_em, concluido_em, criado_em')
      .eq('exame_id', examId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) return null;

    const { data: findings, error: findingsError } = await client()
      .from('achados_ia')
      .select('id, rotulo, confianca, anotacao, criado_em')
      .eq('analise_id', analysis.id)
      .order('confianca', { ascending: false });
    if (findingsError) throw findingsError;
    return { ...analysis, achados: findings || [] };
  }

  async function listExams() {
    const { data, error } = await client()
      .from('exames')
      .select('id, paciente_id, data_exame, tipo_exame, regiao_corpo, status, prioridade, observacoes, motivo_rejeicao, criado_em, atualizado_em, pacientes(cpf)')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function examDetails(examId) {
    const supabase = client();
    const { data: exam, error } = await supabase.from('exames')
      .select('id, paciente_id, data_exame, tipo_exame, regiao_corpo, status, prioridade, observacoes, motivo_rejeicao, criado_em, pacientes(cpf)')
      .eq('id', examId).single();
    if (error) throw error;

    const [{ data: file }, { data: report }, analysis] = await Promise.all([
      supabase.from('arquivos_exame').select('*').eq('exame_id', examId).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('laudos').select('*').eq('exame_id', examId).maybeSingle(),
      latestAnalysis(examId),
    ]);
    let imageUrl = null;
    if (file?.caminho_armazenamento) {
      const { data: signed, error: signedError } = await supabase.storage.from(BUCKET)
        .createSignedUrl(file.caminho_armazenamento, 300);
      if (signedError) throw signedError;
      imageUrl = signed.signedUrl;
    }
    return { ...exam, arquivo: file, laudo: report, analise: analysis, imageUrl };
  }

  async function saveReview({ examId, decision, reportText, patientFeedback, reason }) {
    const { data, error } = await client().functions.invoke('revisar-exame', {
      body: {
        exame_id: examId,
        decisao: decision,
        texto_laudo: reportText,
        retorno_paciente: patientFeedback,
        motivo: reason,
      },
    });
    if (error) throw unwrapFunctionError(error, 'Não foi possível salvar a revisão profissional.');
    return data;
  }

  async function listAuditLogs() {
    const { data, error } = await client().from('registros_auditoria')
      .select('id, acao, tipo_entidade, entidade_id, detalhes, criado_em')
      .order('criado_em', { ascending: false }).limit(100);
    if (error) throw error;
    return data || [];
  }

  async function patientFeedback() {
    const { data, error } = await client().from('laudos')
      .select('id, retorno_paciente, aprovado, aprovado_em, exames(data_exame, tipo_exame, regiao_corpo, status)')
      .not('retorno_paciente', 'is', null)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function notifications() {
    const { data, error } = await client().from('notificacoes')
      .select('id, exame_id, titulo, mensagem, lido_em, criado_em')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function markNotificationsRead() {
    const { error } = await client().from('notificacoes')
      .update({ lido_em: new Date().toISOString() })
      .is('lido_em', null);
    if (error) throw error;
  }

  window.RadiaExamService = {
    MAX_FILE_SIZE,
    assertFile,
    uploadAndAnalyze,
    requestAnalysis,
    latestAnalysis,
    listExams,
    examDetails,
    saveReview,
    listAuditLogs,
    patientFeedback,
    notifications,
    markNotificationsRead,
  };
})();
