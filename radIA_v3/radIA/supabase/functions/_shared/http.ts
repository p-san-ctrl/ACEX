export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function readNamedKey(variable: string, fallback: string): string {
  const direct = Deno.env.get(fallback);
  if (direct) return direct;

  const serialized = Deno.env.get(variable);
  if (!serialized) throw new Error(`Secret obrigatório ausente: ${variable}`);
  const parsed = JSON.parse(serialized) as Record<string, string>;
  if (!parsed.default) throw new Error(`Chave default ausente em ${variable}`);
  return parsed.default;
}

export function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
