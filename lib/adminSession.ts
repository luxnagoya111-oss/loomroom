// lib/adminSession.ts
import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function createAdminSession(adminEmail: string) {
  const id = crypto.randomUUID();

  await supabaseAdmin.from("admin_sessions").insert([
    {
      id,
      admin_email: adminEmail,
      created_at: new Date().toISOString(),
    },
  ]);

  const cookieStore = await cookies(); // ★ await する

  cookieStore.set("admin_session", id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });

  return id;
}

export async function clearAdminSession() {
  const cookieStore = await cookies(); // ★ await する
  const sid = cookieStore.get("admin_session")?.value;

  if (sid) {
    await supabaseAdmin.from("admin_sessions").delete().eq("id", sid);
  }

  cookieStore.set("admin_session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}