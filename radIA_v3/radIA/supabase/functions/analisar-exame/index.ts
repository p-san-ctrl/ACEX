import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { cleanError, corsHeaders, json, readNamedKey } from "../_shared/http.ts";

type BoundingBox = { x: number; y: number; width: number; height: number; normalized: true };
type Finding = { label: string; confidence: number; bbox: BoundingBox };

const ALLOWED_LABELS = new Set([
  "boneanomaly", "bonelesion", "foreignbody", "fracture", "metal",
  "periostealreaction", "pronatorsign", "softtissue", "text",
]);

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeFinding(input: unknown): Finding | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const bbox = value.bbox as Record<string, unknown> | undefined;
  const label = String(value.label ?? "").toLowerCase();
  const confidence = Number(value.confidence);
  if (!ALLOWED_LABELS.has(label) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !bbox) return null;

  const x = Number(bbox.x);
  const y = Number(bbox.y);
  const width = Number(bbox.width);
  const height = Number(bbox.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) return null;

  return { label, confidence, bbox: { x, y, width, height, normalized: true } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

  let analysisId: string | null = null;
  let examId: string | null = null;

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);

    const body = await req.json();
    examId = body?.exame_id;
    if (!validUuid(examId)) return json({ error: "exame_id inválido." }, 400);

    const { data: exam, error: examError } = await userClient
      .from("exames")
      .select("id, radiologista_id, tipo_exame, regiao_corpo")
      .eq("id", examId)
      .single();
    if (examError || !exam) return json({ error: "Exame não encontrado ou não autorizado." }, 404);
    if (exam.radiologista_id !== authData.user.id) return json({ error: "Somente o radiologista responsável pode solicitar a análise." }, 403);

    const { data: file, error: fileError } = await userClient
      .from("arquivos_exame")
      .select("id, caminho_armazenamento, tipo_mime, tamanho_arquivo")
      .eq("exame_id", examId)
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();
    if (fileError || !file) return json({ error: "Arquivo do exame não encontrado." }, 404);
    if (!["image/jpeg", "image/png"].includes(file.tipo_mime)) return json({ error: "O modelo aceita somente PNG ou JPEG." }, 415);
    if (Number(file.tamanho_arquivo) > 10 * 1024 * 1024) return json({ error: "O arquivo excede 10 MB." }, 413);

    const { data: previous } = await admin
      .from("analises_ia")
      .select("id, status, erro_mensagem")
      .eq("arquivo_exame_id", file.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previous?.status === "concluida" || previous?.status === "concluido") {
      return json({ analise_id: previous.id, status: "concluida", reutilizada: true });
    }
    if (previous && ["pendente", "processando"].includes(previous.status)) {
      return json({ analise_id: previous.id, status: previous.status, reutilizada: true }, 202);
    }

    if (previous?.status === "erro") {
      analysisId = previous.id;
      const { error } = await admin.from("analises_ia").update({
        status: "processando", erro_mensagem: null, iniciado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
      }).eq("id", analysisId);
      if (error) throw error;
    } else {
      const { data: created, error } = await admin.from("analises_ia").insert({
        exame_id: examId,
        arquivo_exame_id: file.id,
        solicitado_por: authData.user.id,
        nome_modelo: "YOLOv8 GRAZPEDWRI-DX",
        versao_modelo: "RuiyangJu/Bone_Fracture_Detection_YOLOv8@9f0a38c",
        status: "processando",
        iniciado_em: new Date().toISOString(),
      }).select("id").single();
      if (error || !created) throw error ?? new Error("Falha ao criar a análise.");
      analysisId = created.id;
    }

    const { data: image, error: downloadError } = await admin.storage
      .from("medical-images")
      .download(file.caminho_armazenamento);
    if (downloadError || !image) throw downloadError ?? new Error("Falha ao ler a imagem privada.");

    const inferenceUrl = Deno.env.get("AI_INFERENCE_URL");
    if (!inferenceUrl) throw new Error("AI_INFERENCE_URL não configurada.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    const inferenceHeaders: Record<string, string> = { "Content-Type": file.tipo_mime };
    const inferenceToken = Deno.env.get("AI_INFERENCE_TOKEN");
    if (inferenceToken) inferenceHeaders.Authorization = `Bearer ${inferenceToken}`;

    let inferenceResponse: Response;
    try {
      inferenceResponse = await fetch(`${inferenceUrl.replace(/\/$/, "")}/predict`, {
        method: "POST", headers: inferenceHeaders, body: await image.arrayBuffer(), signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!inferenceResponse.ok) throw new Error(`Serviço de IA indisponível (HTTP ${inferenceResponse.status}).`);

    const inference = await inferenceResponse.json() as Record<string, unknown>;
    const findings = Array.isArray(inference.findings)
      ? inference.findings.map(normalizeFinding).filter((item): item is Finding => item !== null)
      : [];

    if (findings.length) {
      const { error } = await admin.from("achados_ia").insert(findings.map((finding) => ({
        analise_id: analysisId,
        rotulo: finding.label,
        confianca: finding.confidence,
        anotacao: { type: "bbox", ...finding.bbox },
      })));
      if (error) throw error;
    }

    const finishedAt = new Date().toISOString();
    const { error: finishError } = await admin.from("analises_ia").update({
      status: "concluido",
      concluido_em: finishedAt,
      atualizado_em: finishedAt,
      resposta_bruta: {
        image: inference.image ?? null,
        inference_ms: inference.inference_ms ?? null,
        threshold: inference.threshold ?? null,
        finding_count: findings.length,
      },
    }).eq("id", analysisId);
    if (finishError) throw finishError;

    await admin.from("registros_auditoria").insert({
      usuario_responsavel_id: authData.user.id,
      acao: "analise_ia_concluida",
      tipo_entidade: "exame",
      entidade_id: examId,
      detalhes: { analise_id: analysisId, arquivo_id: file.id, achados: findings.length },
    });

    return json({ analise_id: analysisId, status: "concluido", achados: findings.length });
  } catch (error) {
    const message = cleanError(error);
    if (analysisId) {
      await admin.from("analises_ia").update({
        status: "erro", erro_mensagem: message, concluido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
      }).eq("id", analysisId);
    }
    if (examId) {
      await admin.from("registros_auditoria").insert({
        acao: "analise_ia_erro", tipo_entidade: "exame", entidade_id: examId, detalhes: { analise_id: analysisId, erro: message },
      });
    }
    console.error("Falha na análise:", message);
    return json({ error: message, analise_id: analysisId }, 502);
  }
});
