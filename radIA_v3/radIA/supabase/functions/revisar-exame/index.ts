import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { cleanError, corsHeaders, json, readNamedKey } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória." }, 401);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const userClient = createClient(supabaseUrl, readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);

    const body = await req.json();
    const decision = body?.decisao;
    if (!/^[0-9a-f-]{36}$/i.test(body?.exame_id ?? "")) return json({ error: "exame_id inválido." }, 400);
    if (!["aprovada", "rejeitada"].includes(decision)) return json({ error: "Decisão inválida." }, 400);
    if (typeof body?.texto_laudo !== "string" || !body.texto_laudo.trim()) return json({ error: "O laudo profissional é obrigatório." }, 400);
    if (body.texto_laudo.length > 20_000 || String(body.retorno_paciente ?? "").length > 5_000) return json({ error: "Texto acima do limite permitido." }, 413);
    if (decision === "rejeitada" && !String(body.motivo ?? "").trim()) return json({ error: "Informe o motivo da rejeição da análise." }, 400);

    const { data: exam, error: examError } = await userClient.from("exames")
      .select("id, radiologista_id").eq("id", body.exame_id).single();
    if (examError || !exam) return json({ error: "Exame não encontrado ou não autorizado." }, 404);
    if (exam.radiologista_id !== authData.user.id) return json({ error: "Somente o radiologista responsável pode revisar este exame." }, 403);

    const { data: analysis } = await userClient.from("analises_ia")
      .select("id").eq("exame_id", exam.id).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    const now = new Date().toISOString();
    const { error: reportError } = await admin.from("laudos").upsert({
      exame_id: exam.id,
      radiologista_id: authData.user.id,
      analise_ia_id: analysis?.id ?? null,
      texto_laudo: body.texto_laudo.trim(),
      retorno_paciente: String(body.retorno_paciente ?? "").trim() || null,
      aprovado: decision === "aprovada",
      aprovado_em: decision === "aprovada" ? now : null,
      decisao_ia: decision,
      motivo_decisao_ia: String(body.motivo ?? "").trim() || null,
      revisado_em: now,
      atualizado_em: now,
    }, { onConflict: "exame_id" });
    if (reportError) throw reportError;

    const { error: examUpdateError } = await admin.from("exames").update({
      status: decision === "aprovada" ? "concluido" : "rejeitado",
      motivo_rejeicao: decision === "rejeitada" ? String(body.motivo).trim() : null,
      atualizado_em: now,
    }).eq("id", exam.id);
    if (examUpdateError) throw examUpdateError;

    await admin.from("registros_auditoria").insert({
      usuario_responsavel_id: authData.user.id,
      acao: decision === "aprovada" ? "analise_ia_aprovada" : "analise_ia_rejeitada",
      tipo_entidade: "exame",
      entidade_id: exam.id,
      detalhes: { analise_id: analysis?.id ?? null, decisao: decision },
    });
    return json({ status: "ok", decisao: decision });
  } catch (error) {
    console.error("Falha na revisão:", cleanError(error));
    return json({ error: cleanError(error) }, 500);
  }
});
