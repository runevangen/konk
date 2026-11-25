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
  do crypto.getRandomValues(a); while (a[0] >= 4294000000); // unngå modulo-skjevhet
  return String(a[0] % 1000000).padStart(6, "0");
}

/** Avviser åpenbart gjettbare koder: samme siffer (111111) og rene rekker (123456, 654321). */
function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const up = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const down = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  return up || down;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("KONK_PIN_SECRET");
  if (!secret) return json({ error: "missing_secret" }, 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });

  const signIn = async (userId: string) => {
    const { data: u, error: ue } = await admin.auth.admin.getUserById(userId);
    if (ue || !u.user?.email) return null;
    const { data, error } = await anon.auth.signInWithPassword({ email: u.user.email, password: await hmac(secret, userId) });
    if (error || !data.session) return null;
    return data.session;
  };

  if (body.action === "register") {
    const display_name = typeof body.display_name === "string" ? body.display_name.trim() : "";
    const office_id = Number(body.office_id);
    const anonymous = body.anonymous === true;
    if (display_name.length < 1 || display_name.length > 40) return json({ error: "invalid_display_name" }, 400);
    if (!Number.isInteger(office_id)) return json({ error: "invalid_office" }, 400);
    const { data: office } = await admin.from("konk_offices").select("id").eq("id", office_id).maybeSingle();
    if (!office) return json({ error: "invalid_office" }, 400);

    const nameKey = display_name.toLowerCase();
    const { data: taken } = await admin.from("konk_profiles").select("id").eq("name_key", nameKey).maybeSingle();
    if (taken) return json({ error: "name_taken" }, 409);

    const userId = crypto.randomUUID();
    const { error: ce } = await admin.auth.admin.createUser({
      id: userId, email: `${userId}@konk.invalid`, password: await hmac(secret, userId), email_confirm: true,
    } as never);
    if (ce) return json({ error: "create_failed" }, 500);

    const pin = newPin();
    const { error: ie } = await admin.from("konk_profiles").insert({
      id: userId, display_name, office_id, anonymous, pin_hash: await hmac(secret, `${userId}:${pin}`),
    });
    if (ie) {
      await admin.auth.admin.deleteUser(userId);
      return ie.code === "23505" ? json({ error: "name_taken" }, 409) : json({ error: "create_failed" }, 500);
    }
    const session = await signIn(userId);
    if (!session) return json({ error: "signin_failed" }, 500);
    return json({ pin, session });
  }

  if (body.action === "login") {
    const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
    const name = typeof body.display_name === "string" ? body.display_name.trim().toLowerCase().slice(0, 40) : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    const since = new Date(Date.now() - 60_000).toISOString();

    // maks 5 feil per minutt per IP, og maks 5 per minutt per navn
    const { data: byIp, error: e1 } = await admin.from("konk_login_attempts").select("id")
      .eq("ip", ip).gte("created_at", since).limit(5);
    const { data: byName, error: e2 } = name
      ? await admin.from("konk_login_attempts").select("id").eq("login_name", name).gte("created_at", since).limit(5)
      : { data: [], error: null };
    if (e1 || e2) return json({ error: "rate_check_failed" }, 500);
    if ((byIp?.length ?? 0) >= 5 || (byName?.length ?? 0) >= 5) return json({ error: "too_many_attempts" }, 429);

    let userId: string | null = null;
    if (name && /^\d{6}$/.test(pin)) {
      const { data } = await admin.from("konk_profiles").select("id, pin_hash").eq("name_key", name).maybeSingle();
      if (data && data.pin_hash && data.pin_hash === (await hmac(secret, `${data.id}:${pin}`))) userId = data.id;
    }
    const session = userId ? await signIn(userId) : null;
    if (!session) {
      await admin.from("konk_login_attempts").insert({ ip, login_name: name || null });
      await admin.from("konk_login_attempts").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
      return json({ error: "invalid_pin" }, 401);
    }
    return json({ session });
  }

  if (body.action === "change_pin") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: au } = await admin.auth.getUser(token);
    if (!au?.user) return json({ error: "unauthorized" }, 401);
    const oldPin = typeof body.old_pin === "string" ? body.old_pin.trim() : "";
    const newPin = typeof body.new_pin === "string" ? body.new_pin.trim() : "";
    if (!/^\d{6}$/.test(newPin) || isWeakPin(newPin)) return json({ error: "weak_pin" }, 400);

    const { data: me } = await admin.from("konk_profiles").select("id, name_key, pin_hash").eq("id", au.user.id).maybeSingle();
    if (!me) return json({ error: "not_found" }, 404);

    const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: byIp, error: e1 } = await admin.from("konk_login_attempts").select("id").eq("ip", ip).gte("created_at", since).limit(5);
    const { data: byName, error: e2 } = await admin.from("konk_login_attempts").select("id").eq("login_name", me.name_key).gte("created_at", since).limit(5);
    if (e1 || e2) return json({ error: "rate_check_failed" }, 500);
    if ((byIp?.length ?? 0) >= 5 || (byName?.length ?? 0) >= 5) return json({ error: "too_many_attempts" }, 429);

    const okOld = /^\d{6}$/.test(oldPin) && !!me.pin_hash && me.pin_hash === (await hmac(secret, `${me.id}:${oldPin}`));
    if (!okOld) {
      await admin.from("konk_login_attempts").insert({ ip, login_name: me.name_key });
      return json({ error: "invalid_pin" }, 401);
    }
    if (oldPin === newPin) return json({ error: "same_pin" }, 400);

    const { error: ue } = await admin.from("konk_profiles").update({ pin_hash: await hmac(secret, `${me.id}:${newPin}`) }).eq("id", me.id);
    if (ue) return json({ error: "update_failed" }, 500);
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
