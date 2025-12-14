import { NextRequest } from "next/server";

export function requireAdminKey(req: NextRequest) {
  const key = req.headers.get("x-admin-key");
  const expected = process.env.NEXT_PUBLIC_ADMIN_KEY;

  if (!expected) {
    throw Object.assign(new Error("ADMIN KEY is not set"), { status: 500 });
  }

  if (key !== expected) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
}