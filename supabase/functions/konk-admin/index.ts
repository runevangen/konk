import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const enc = new TextEncoder();
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newPin(): string {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4294000000);
  return String(a[0] % 1000000).padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("KONK_PIN_SECRET");
  if (!secret) return json({ error: "missing_secret" }, 500);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: au } = await admin.auth.getUser(token);
  if (!au?.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await admin.from("konk_profiles").select("is_admin").eq("id", au.user.id).maybeSingle();
  if (!me?.is_admin) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  if (body.action === "reset_pin") {
    const user_id = typeof body.user_id === "string" ? body.user_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(user_id)) return json({ error: "invalid_user_id" }, 400);
    const { data: target } = await admin.from("konk_profiles").select("id").eq("id", user_id).maybeSingle();
    if (!target) return json({ error: "not_found" }, 404);
    for (let i = 0; i < 8; i++) {
      const pin = newPin();
      const { error } = await admin.from("konk_profiles").update({ pin_hash: await hmac(secret, pin) }).eq("id", user_id);
      if (!error) return json({ pin });
      if (error.code !== "23505") break;
    }
    return json({ error: "reset_failed" }, 500);
  }
  return json({ error: "unknown_action" }, 400);
});
