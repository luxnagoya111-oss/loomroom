"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

function safeNext(next: string | null) {
  if (!next) return "/admin";
  return next.startsWith("/") ? next : "/admin";
}

type OptionsResponse = {
  options: any;
  challengeId?: string;
  next?: string;
  error?: string;
};

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => safeNext(sp.get("next")), [sp]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const loginWithPasskey = async () => {
    setBusy(true);
    setMsg("");
    try {
      const optRes = await fetch("/api/admin/webauthn/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next }),
      });
      const optJson: OptionsResponse = await optRes.json();
      if (!optRes.ok) throw new Error(optJson?.error || "options failed");

      const assertion = await startAuthentication({
        optionsJSON: optJson.options,
      });

      const verRes = await fetch("/api/admin/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assertion,
          next,
          challengeId: optJson.challengeId,
        }),
      });
      const verJson = await verRes.json();
      if (!verRes.ok) throw new Error(verJson?.error || "verify failed");

      router.replace(verJson.redirectTo || next);
    } catch (e: any) {
      setMsg(e?.message || "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const registerPasskey = async () => {
    setBusy(true);
    setMsg("");
    try {
      const optRes = await fetch("/api/admin/webauthn/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const optJson: OptionsResponse = await optRes.json();
      if (!optRes.ok)
        throw new Error(optJson?.error || "register options failed");

      const attestation = await startRegistration({
        optionsJSON: optJson.options,
      });

      const verRes = await fetch("/api/admin/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attestation,
          challengeId: optJson.challengeId,
        }),
      });
      const verJson = await verRes.json();
      if (!verRes.ok) throw new Error(verJson?.error || "register verify failed");

      setMsg("Passkeyを登録しました。続けてログインしてください。");
    } catch (e: any) {
      setMsg(e?.message || "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader title="Admin Login" subtitle="LRoom" showBack={false} />
      <main className="app-main" style={{ padding: 16 }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "18px 14px 16px",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <h1 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>
              管理画面に入る
            </h1>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 13,
                opacity: 0.8,
                lineHeight: 1.7,
              }}
            >
              Passkey（端末の認証）でログインします。
            </p>

            {msg && (
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  opacity: 0.85,
                }}
              >
                {msg}
              </p>
            )}

            <button
              onClick={loginWithPasskey}
              disabled={busy}
              style={{
                width: "100%",
                borderRadius: 999,
                border: "none",
                padding: "10px 12px",
                fontSize: 14,
                fontWeight: 800,
                background: "linear-gradient(135deg, #f3c98b, #e8b362)",
                color: "#4a2b05",
                cursor: "pointer",
              }}
            >
              {busy ? "処理中…" : "Passkeyでログイン"}
            </button>

            <button
              onClick={registerPasskey}
              disabled={busy}
              style={{
                marginTop: 10,
                width: "100%",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,0.12)",
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 800,
                background: "rgba(255,255,255,0.9)",
                color: "rgba(0,0,0,0.72)",
                cursor: "pointer",
              }}
            >
              初回：Passkeyを登録（管理者のみ）
            </button>

            <p
              style={{
                marginTop: 12,
                fontSize: 11,
                opacity: 0.7,
                lineHeight: 1.6,
              }}
            >
              端末を変えた場合は、もう一度登録が必要です（端末ごとにPasskeyが保存されます）。
            </p>

            <p style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>
              next: <code>{next}</code>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}