import { withSupabase } from "npm:@supabase/server@1";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

async function hmacDigest(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(withSupabase({ auth: "none" }, async (request, context) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { accepted: false, reason: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  let hmacSecret = Deno.env.get("RATE_LIMIT_HMAC_SECRET") || "";
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!hmacSecret && secretKeysJson) {
    try {
      const secretKeys = JSON.parse(secretKeysJson) as Record<string, unknown>;
      if (typeof secretKeys.default === "string") hmacSecret = secretKeys.default;
    } catch {
      return json(500, { accepted: false, reason: "server_not_configured" });
    }
  }
  // 舊專案相容；新專案優先使用 SUPABASE_SECRET_KEYS['default']。
  if (!hmacSecret) hmacSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !hmacSecret) return json(500, { accepted: false, reason: "server_not_configured" });

  let payload: { activityId?: unknown; content?: unknown; sessionId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json(400, { accepted: false, reason: "invalid_json" });
  }

  const activityId = typeof payload.activityId === "string" ? payload.activityId : "";
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(activityId) || !uuidPattern.test(sessionId)) {
    return json(400, { accepted: false, reason: "invalid_request" });
  }
  if (!content) return json(400, { accepted: false, reason: "empty" });
  if ([...content].length > 120) return json(400, { accepted: false, reason: "too_long" });

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const sourceIp = forwardedFor || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || `session:${sessionId}`;
  const [sessionDigest, ipDigest] = await Promise.all([
    hmacDigest(`session:${sessionId}`, hmacSecret),
    hmacDigest(`ip:${sourceIp}`, hmacSecret),
  ]);

  const { data, error } = await context.supabaseAdmin.rpc("accept_public_response", {
    p_activity_id: activityId,
    p_content: content,
    p_session_digest: sessionDigest,
    p_ip_digest: ipDigest,
  });

  if (error) {
    console.error("accept_public_response failed", error.message);
    return json(500, { accepted: false, reason: "submission_failed" });
  }

  const result = data as { accepted?: boolean; reason?: string; status?: string };
  return json(result.accepted ? 200 : result.reason === "not_found" ? 404 : 400, result);
}));
