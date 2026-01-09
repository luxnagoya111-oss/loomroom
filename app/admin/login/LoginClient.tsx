// app/admin/login/LoginClient.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
      <div className="admin-login-center">
        <div className="login-wrap">
          {/* admin-card をベースに、login専用の微調整だけ当てる */}
          <div className="admin-card login-card">
            <div className="login-head">
              <div className="login-title">管理画面に入る</div>
              <div className="login-sub">Passkey（端末の認証）でログインします。</div>
            </div>

            {msg && (
              <div className="login-msg" role="status" aria-live="polite">
                {msg}
              </div>
            )}

            <button onClick={loginWithPasskey} disabled={busy} className="btn-primary login-btn">
              {busy ? "処理中…" : "Passkeyでログイン"}
            </button>

            <button
              onClick={registerPasskey}
              disabled={busy}
              className="admin-btn-outline login-btn"
            >
              初回：Passkeyを登録（管理者のみ）
            </button>

            <div className="login-note">
              端末を変えた場合は、もう一度登録が必要です（端末ごとにPasskeyが保存されます）。
            </div>

            <div className="login-next">
              next: <code className="login-code">{next}</code>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        /* このページ固有：中央寄せだけ（admin-main-inner は撤去） */
        .admin-login-center {
          min-height: calc(100vh - 32px);
          display: flex;
          align-items: flex-start; 
          justify-content: center;
          padding-top: 24px; 
        }

        .login-wrap {
          width: 100%;
          max-width: 560px;
        }

        /* admin-card をベースにしつつ、loginの質感だけ寄せる */
        .login-card {
          background: var(--surface-soft);
          box-shadow: 0 10px 26px rgba(15, 23, 42, 0.05);
          padding: 18px 14px 14px;
        }

        .login-head {
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
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
          color: var(--text-sub);
          line-height: 1.7;
        }

        .login-msg {
          margin: 10px 0 12px;
          font-size: 12px;
          line-height: 1.7;
          white-space: pre-wrap;
          color: rgba(0, 0, 0, 0.78);
          border: 1px solid rgba(215, 185, 118, 0.35);
          background: rgba(215, 185, 118, 0.08);
          border-radius: 12px;
          padding: 10px 10px;
        }

        /* ボタン幅だけこのページで指定（見た目/挙動はGlobalの正に従う） */
        .login-btn {
          width: 100%;
        }
        .admin-btn-outline.login-btn {
          margin-top: 10px; /* 余白はボタン自身に持たせたくないが、ここは単発なので最小許容 */
        }

        .login-note {
          margin-top: 12px;
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.6;
        }

        .login-next {
          margin-top: 10px;
          font-size: 11px;
          color: rgba(0, 0, 0, 0.55);
        }

        .login-code {
          background: rgba(0, 0, 0, 0.04);
          padding: 2px 6px;
          border-radius: 8px;
        }

        @media (max-width: 860px) {
          .admin-login-center {
            min-height: auto;
            padding: 12px 0 16px;
          }
          .login-card {
            padding: 14px 12px 12px;
          }
        }
      `}</style>
    </div>
  );
}