// app/api/admin/webauthn/_store.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export function randomChallenge() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function saveChallenge(purpose: "register" | "login", challenge: string) {
  const id = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("admin_webauthn_challenges").insert([
    { id, purpose, challenge, created_at: new Date().toISOString() },
  ]);
  if (error) throw error;
  return id;
}

export async function consumeChallenge(id: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_webauthn_challenges")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  await supabaseAdmin.from("admin_webauthn_challenges").delete().eq("id", id);
  return data as any;
}