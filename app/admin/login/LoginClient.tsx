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
  // server に送る前に「実物」を軽く要約（console用）
  try {
    const id = a?.id;
    const rawId = a?.rawId;

    const cd = a?.response?.clientDataJSON;
    const ad = a?.response?.authenticatorData;
    const sig = a?.response?.signature;
    const uh = a?.response?.userHandle;

    const toLen = (v: any) =>
      typeof v === "string"
        ? v.length
        : v?.byteLength ??
          v?.buffer?.byteLength ??
          (Array.isArray(v?.data) ? v.data.length : null);

    return {
      id,
      rawId,
      clientDataJSON_type: typeof cd,
      authenticatorData_type: typeof ad,
      signature_type: typeof sig,
      userHandle_type: typeof uh,
      clientDataJSON_len: toLen(cd),
      authenticatorData_len: toLen(ad),
      signature_len: toLen(sig),
      userHandle_len: toLen(uh),
      hasResponse: !!a?.response,
    };
  } catch (e: any) {
    return { summarizeError: e?.message || String(e) };
  }
}

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => safeNext(sp.get("next")), [sp]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const loginWithPasskey = async () => {
    console.log("[ADMIN LOGIN] loginWithPasskey ACTIVE", new Date().toISOString());

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
      console.log("[ADMIN LOGIN] login/options status", optRes.status, optJson);

      if (!optRes.ok) throw new Error(optJson?.error || "options failed");
      if (!optJson?.options) throw new Error("options is missing");

      const assertion = await startAuthentication({
        optionsJSON: optJson.options,
      });

      console.log("[ADMIN LOGIN] assertion summary", summarizeAssertion(assertion));

      const payload = {
        assertion,
        next,
        challengeId: optJson.challengeId,
      };

      console.log("[ADMIN LOGIN] verify payload keys", {
        hasAssertion: !!payload.assertion,
        challengeId: payload.challengeId,
        next: payload.next,
      });

      const verRes = await fetch("/api/admin/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const verJson = (await safeReadJson(verRes)) ?? {};
      console.log("[ADMIN LOGIN] login/verify status", verRes.status, verJson);

      if (!verRes.ok) throw new Error(verJson?.error || "verify failed");

      router.replace(verJson.redirectTo || next);
    } catch (e: any) {
      console.error("[ADMIN LOGIN] error", e);
      setMsg(e?.message || "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const registerPasskey = async () => {
    console.log("[ADMIN LOGIN] registerPasskey ACTIVE", new Date().toISOString());

    setBusy(true);
    setMsg("");
    try {
      const optRes = await fetch("/api/admin/webauthn/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const optJson: OptionsResponse = (await safeReadJson(optRes)) ?? {};
      console.log("[ADMIN LOGIN] register/options status", optRes.status, optJson);

      if (!optRes.ok) throw new Error(optJson?.error || "register options failed");
      if (!optJson?.options) throw new Error("options is missing");

      const attestation = await startRegistration({
        optionsJSON: optJson.options,
      });

      console.log("[ADMIN LOGIN] attestation (has)", {
        id: attestation?.id,
        rawId: attestation?.rawId,
        hasResponse: !!attestation?.response,
        clientDataJSON_type: typeof attestation?.response?.clientDataJSON,
        attestationObject_type: typeof attestation?.response?.attestationObject,
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
      console.log("[ADMIN LOGIN] register/verify status", verRes.status, verJson);

      if (!verRes.ok) throw new Error(verJson?.error || "register verify failed");

      setMsg("Passkeyを登録しました。続けてログインしてください。");
    } catch (e: any) {
      console.error("[ADMIN LOGIN] register error", e);
      setMsg(e?.message || "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell">
      {/* admin/layout.tsx と同じ AppHeader を利用 */}
      <AppHeader title="管理ログイン" subtitle="Admin Console" showBack={true} />

      <div className="admin-body">
        <main className="admin-main">
          <div className="admin-main-inner">
            <div className="login-wrap">
              <div className="login-card">
                <div className="login-head">
                  <div className="login-title">管理画面に入る</div>
                  <div className="login-sub">Passkey（端末の認証）でログインします。</div>
                </div>

                {msg && (
                  <div className="login-msg" role="status" aria-live="polite">
                    {msg}
                  </div>
                )}

                <button onClick={loginWithPasskey} disabled={busy} className="btn-primary">
                  {busy ? "処理中…" : "Passkeyでログイン"}
                </button>

                <button onClick={registerPasskey} disabled={busy} className="btn-secondary">
                  初回：Passkeyを登録（管理者のみ）
                </button>

                <div className="login-note">
                  端末を変えた場合は、もう一度登録が必要です（端末ごとにPasskeyが保存されます）。
                </div>

                <div className="login-next">
                  next: <code>{next}</code>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        /* ===== layout.tsx と同じ骨格（必要最小限だけ複製） ===== */
        .admin-shell {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text-main);
          display: flex;
          flex-direction: column;
        }

        .admin-body {
          flex: 1;
          display: flex;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          gap: 14px;
          padding: 12px 12px 20px;
        }

        .admin-main {
          flex: 1;
          min-width: 0;
        }

        .admin-main-inner {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
          padding: 14px;
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ===== Login UI ===== */
        .login-wrap {
          width: 100%;
          max-width: 560px;
        }

        .login-card {
          border-radius: 16px;
          border: 1px solid var(--border, rgba(220, 210, 200, 0.9));
          background: var(--surface-soft, rgba(255, 255, 255, 0.92));
          box-shadow: 0 10px 26px rgba(15, 23, 42, 0.05);
          padding: 18px 14px 14px;
        }

        .login-head {
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.06));
          margin-bottom: 12px;
        }

        .login-title {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .login-sub {
          margin-top: 6px;
          font-size: 12px;
          color: var(--text-sub, #6b7280);
          line-height: 1.7;
        }

        .login-msg {
          margin: 10px 0 12px;
          font-size: 12px;
          line-height: 1.7;
          color: rgba(0, 0, 0, 0.78);
          white-space: pre-wrap;
          border: 1px solid rgba(215, 185, 118, 0.35);
          background: rgba(215, 185, 118, 0.08);
          border-radius: 12px;
          padding: 10px 10px;
        }

        .btn-primary {
          width: 100%;
          border-radius: 999px;
          border: none;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 800;
          background: linear-gradient(135deg, #f3c98b, #e8b362);
          color: #4a2b05;
          cursor: pointer;
          transition: transform 0.08s ease, box-shadow 0.08s ease, filter 0.08s ease;
        }
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(10, 10, 10, 0.05);
          filter: saturate(1.02);
        }
        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .btn-secondary {
          margin-top: 10px;
          width: 100%;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 800;
          background: rgba(255, 255, 255, 0.9);
          color: rgba(0, 0, 0, 0.72);
          cursor: pointer;
          transition: transform 0.08s ease, border-color 0.08s ease;
        }
        .btn-secondary:hover {
          transform: translateY(-1px);
          border-color: rgba(215, 185, 118, 0.55);
        }
        .btn-secondary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .login-note {
          margin-top: 12px;
          font-size: 11px;
          color: var(--text-sub, #6b7280);
          line-height: 1.6;
        }

        .login-next {
          margin-top: 10px;
          font-size: 11px;
          color: rgba(0, 0, 0, 0.55);
        }

        code {
          background: rgba(0, 0, 0, 0.04);
          padding: 2px 6px;
          border-radius: 8px;
        }

        @media (max-width: 860px) {
          .admin-body {
            padding: 10px 10px 16px;
          }
          .admin-main-inner {
            min-height: auto;
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
}