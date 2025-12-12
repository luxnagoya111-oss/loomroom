import { NextRequest } from "next/server";

export function requireAdminKey(req: NextRequest) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    throw new Error("ADMIN_API_KEY is not set");
  }

  const got = req.headers.get("x-admin-key");
  if (!got || got !== expected) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
}