// app/admin/login/LoginClient.tsx
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
  redirectTo?: string;
};

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function summarizeAssertion(a: any) {
  try {
    const toLen = (v: any) =>
      typeof v === "string"
        ? v.length
        : v?.byteLength ??
          v?.buffer?.byteLength ??
          (Array.isArray(v?.data) ? v.data.length : null);

    return {
      id: a?.id,
      rawId: a?.rawId,
      clientDataJSON_len: toLen(a?.response?.clientDataJSON),
      authenticatorData_len: toLen(a?.response?.authenticatorData),
      signature_len: toLen(a?.response?.signature),
      userHandle_len: toLen(a?.response?.userHandle),
    };
  } catch (e: any) {
    return { summarizeError: e?.message };
  }
}

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
        cache: "no-store",
        body: JSON.stringify({ next }),
      });

      const optJson: OptionsResponse = (await safeReadJson(optRes)) ?? {};
      if (!optRes.ok || !optJson?.options) {
        throw new Error(optJson?.error || "options failed");
      }

      const assertion = await startAuthentication({
        optionsJSON: optJson.options,
      });

      console.log("[ADMIN LOGIN] assertion", summarizeAssertion(assertion));

      const verRes = await fetch("/api/admin/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          assertion,
          challengeId: optJson.challengeId,
          next,
        }),
      });

      const verJson = (await safeReadJson(verRes)) ?? {};
      if (!verRes.ok) throw new Error(verJson?.error || "verify failed");

      router.replace(verJson.redirectTo || next);
    } catch (e: any) {
      console.error(e);
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
        cache: "no-store",
      });

      const optJson: OptionsResponse = (await safeReadJson(optRes)) ?? {};
      if (!optRes.ok || !optJson?.options) {
        throw new Error(optJson?.error || "register options failed");
      }

      const attestation = await startRegistration({
        optionsJSON: optJson.options,
      });

      const verRes = await fetch("/api/admin/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          attestation,
          challengeId: optJson.challengeId,
        }),
      });

      const verJson = (await safeReadJson(verRes)) ?? {};
      if (!verRes.ok) throw new Error(verJson?.error || "register verify failed");

      setMsg("Passkeyを登録しました。続けてログインしてください。");
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell">
      <AppHeader title="管理ログイン" subtitle="Admin Console" showBack />

      <div className="admin-page-head">
        <div>
          <h1 className="admin-page-title">管理画面に入る</h1>
          <p className="admin-page-lead">
            Passkey（端末の認証）で管理画面にログインします。
          </p>
        </div>
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          {msg && (
            <div className="admin-meta-val" style={{ marginBottom: 10 }}>
              {msg}
            </div>
          )}

          <button
            className="admin-btn-outline"
            onClick={loginWithPasskey}
            disabled={busy}
          >
            {busy ? "処理中…" : "Passkeyでログイン"}
          </button>

          <button
            className="admin-btn-outline"
            onClick={registerPasskey}
            disabled={busy}
          >
            初回：Passkeyを登録（管理者のみ）
          </button>

          <div className="admin-meta" style={{ marginTop: 10 }}>
            <div className="admin-meta-row">
              <div className="admin-meta-key">注意</div>
              <div className="admin-meta-val">
                端末を変更した場合は再登録が必要です。
              </div>
            </div>
            <div className="admin-meta-row">
              <div className="admin-meta-key">next</div>
              <div className="admin-meta-val">
                <code>{next}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}