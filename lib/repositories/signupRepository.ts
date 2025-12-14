// lib/repositories/signupRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { DbSignupApplicationRow, DbSignupType, DbSignupStatus } from "@/types/db";

export type CreateSignupPayload = {
  type: DbSignupType;
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
};

function preview(s: string, n = 300) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export async function createSignupApplication(
  params: CreateSignupPayload
): Promise<DbSignupApplicationRow | null> {
  const { type, name, contact = null, payload } = params;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    console.error("[signupRepository] Not authenticated", userError);
    return null;
  }

  let res: Response;
  try {
    res = await fetch("/api/signup-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicant_user_id: user.id,
        type,
        name,
        contact,
        payload,
      }),
    });
  } catch (e) {
    console.error("[signupRepository] fetch failed", e);
    return null;
  }

  const ct = res.headers.get("content-type") ?? "";
  const bodyText = await res.text().catch(() => "");

  if (!res.ok) {
    console.error(
      `[signupRepository] API error: status=${res.status} ${res.statusText} content-type=${ct} body=${preview(bodyText)}`
    );
    try {
      const j = bodyText ? JSON.parse(bodyText) : null;
      console.error(`[signupRepository] API error json=${preview(JSON.stringify(j))}`);
    } catch {}
    return null;
  }

  // OKでも JSONじゃないことがあるので守る
  try {
    const json = bodyText ? JSON.parse(bodyText) : null;
    return (json?.data ?? null) as DbSignupApplicationRow | null;
  } catch (e) {
    console.error("[signupRepository] response is not json", { ct, body: preview(bodyText) }, e);
    return null;
  }
}

export async function createStoreSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}) {
  return createSignupApplication({
    type: "store",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

export async function createTherapistSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}) {
  return createSignupApplication({
    type: "therapist",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}

export async function createUserSignup(params: {
  name: string;
  contact?: string | null;
  payload: Record<string, any>;
}) {
  return createSignupApplication({
    type: "user",
    name: params.name,
    contact: params.contact,
    payload: params.payload,
  });
}