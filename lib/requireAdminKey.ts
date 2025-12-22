import { NextRequest, NextResponse } from "next/server";

export function requireAdminKey(req: NextRequest): { ok: true } | { ok: false; res: NextResponse } {
  const expected = process.env.NEXT_PUBLIC_ADMIN_KEY || "";
  const got = req.headers.get("x-admin-key") || "";

  if (!expected || got !== expected) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true };
}