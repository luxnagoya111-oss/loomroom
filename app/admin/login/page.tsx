// app/admin/login/page.tsx
import React, { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading...</div>}>
      <LoginClient />
    </Suspense>
  );
}