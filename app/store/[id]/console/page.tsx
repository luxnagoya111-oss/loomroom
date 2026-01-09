// app/store/[id]/console/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarUploader from "@/components/AvatarUploader";
import { supabase } from "@/lib/supabaseClient";
import { uploadAvatar } from "@/lib/avatarStorage";

import type { DbStoreRow, DbTherapistRow } from "@/types/db";
import { listTherapistsForStore } from "@/lib/repositories/therapistRepository";

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function toPlainError(error: any) {
  return {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    status: error?.status,
  };
}

const STORAGE_KEY_PREFIX = "loomroom_store_console_";

type FormState = {
  storeName: string;
  area: string;
  websiteUrl: string;
  lineUrl: string;
  xUrl: string;
  twicasUrl: string;
  description: string;
  dmNotice: boolean;
  avatarUrl?: string;
};

type TherapistMini = {
  id: string;
  display_name: string | null;
  area: string | null;
};

type DbTherapistStoreRequestRow = {
  id: string;
  store_id: string;
  therapist_id: string;
  status: "pending" | "approved" | "rejected" | string;
  created_at: string;

  therapist?: TherapistMini | TherapistMini[] | null;
};

function normalizeUrl(v: string): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}

function pickTherapistOne(
  t: DbTherapistStoreRequestRow["therapist"]
): TherapistMini | null {
  if (!t) return null;
  return Array.isArray(t) ? (t[0] ?? null) : t;
}

/**
 * ブラウザ側の Supabase session から access_token を取得
 * - store console の API は cookie 依存にすると環境で揺れるため、Bearer を明示して安定化
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Authorization: Bearer を付けた fetch
 * - Content-Type は「呼び出し側で必要な時だけ」付ける（副作用を避ける）
 */
async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const token = await getAccessToken();

  const headers = new Headers(init?.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}

const hasUnread = true;

const StoreConsolePage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const storeId = params?.id || "";

  const storageKey = useMemo(
    () => `${STORAGE_KEY_PREFIX}${storeId || "default"}`,
    [storeId]
  );

  const [state, setState] = useState<FormState>({
    storeName: "",
    area: "",
    websiteUrl: "",
    lineUrl: "",
    xUrl: "",
    twicasUrl: "",
    description: "",
    dmNotice: true,
    avatarUrl: "",
  });

  const [avatarPreview, setAvatarPreview] = useState<string>("");

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);

  const [therapists, setTherapists] = useState<DbTherapistRow[]>([]);
  const [loadingTherapists, setLoadingTherapists] = useState(false);

  const [requests, setRequests] = useState<DbTherapistStoreRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(
    null
  );

  const [detachOpen, setDetachOpen] = useState(false);
  const [detachTarget, setDetachTarget] = useState<{
    therapistId: string;
    displayName: string;
  } | null>(null);
  const [detachPassword, setDetachPassword] = useState("");
  const [detaching, setDetaching] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);

  const closeDetachModal = useCallback(() => {
    setDetachOpen(false);
    setDetachTarget(null);
    setDetachPassword("");
    setDetachError(null);
    setDetaching(false);
  }, []);

  useEffect(() => {
    if (!detachOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetachModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detachOpen, closeDetachModal]);

  // ========= ① localStorage から復元 =========
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setLoaded(true);
        return;
      }

      try {
        const data = JSON.parse(raw) as Partial<FormState>;
        setState((prev) => ({
          ...prev,
          ...data,
          dmNotice:
            typeof (data as any)?.dmNotice === "boolean"
              ? (data as any).dmNotice
              : prev.dmNotice,
          description:
            typeof (data as any)?.description === "string"
              ? (data as any).description
              : prev.description,
          avatarUrl:
            typeof (data as any)?.avatarUrl === "string"
              ? (data as any).avatarUrl
              : prev.avatarUrl,
        }));
      } catch (parseErr) {
        console.warn("[StoreConsole] localStorage parse failed. reset:", parseErr);
        window.localStorage.removeItem(storageKey);
      } finally {
        setLoaded(true);
      }
    } catch (e) {
      console.error("[StoreConsole] localStorage read error:", e);
      setLoaded(true);
    }
  }, [storageKey]);

  // ========= ② Supabase の stores から店舗情報を取得 =========
  useEffect(() => {
    if (!storeId) return;

    let cancelled = false;

    const loadStoreFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from("stores")
          .select(
            "id, owner_user_id, name, area, website_url, line_url, avatar_url, dm_notice, x_url, twicas_url, description"
          )
          .eq("id", storeId)
          .maybeSingle<DbStoreRow>();

        if (cancelled) return;

        if (error) {
          console.error("[StoreConsole] loadStore error:", toPlainError(error));
          console.error("[StoreConsole] loadStore error(raw):", error);
          return;
        }
        if (!data) return;

        setOwnerUserId(((data as any).owner_user_id as string) ?? null);

        setState((prev) => ({
          ...prev,
          storeName: (data as any).name ?? prev.storeName,
          area: (data as any).area ?? prev.area,
          websiteUrl: (data as any).website_url ?? prev.websiteUrl,
          lineUrl: (data as any).line_url ?? prev.lineUrl,
          avatarUrl: (data as any).avatar_url ?? prev.avatarUrl,
          xUrl: (data as any).x_url ?? prev.xUrl,
          twicasUrl: (data as any).twicas_url ?? prev.twicasUrl,
          description: (data as any).description ?? prev.description,
          dmNotice:
            typeof (data as any).dm_notice === "boolean"
              ? (data as any).dm_notice
              : prev.dmNotice,
        }));
      } catch (e) {
        if (!cancelled) console.error("[StoreConsole] loadStore exception:", e);
      }
    };

    loadStoreFromSupabase();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // ========= ③ localStorage への自動保存 =========
  useEffect(() => {
    if (!loaded) return;
    if (typeof window === "undefined") return;

    const payload: FormState = {
      ...state,
      avatarUrl: state.avatarUrl || "",
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (e) {
      console.error("[StoreConsole] failed to save to localStorage:", e);
    }
  }, [loaded, state, storageKey]);

  // ========= ★ pending 申請取得（API経由 / Bearer付き） =========
  const loadPendingRequests = useCallback(async (sid: string) => {
    setLoadingRequests(true);
    try {
      const res = await authedFetch(
        `/api/therapist-store-requests?storeId=${encodeURIComponent(sid)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const json = await safeReadJson(res);

      if (!res.ok || !json || (json as any).ok !== true) {
        console.error("[StoreConsole] loadPendingRequests failed", {
          status: res.status,
          json,
        });

        // 401 の場合：セッションが無い / 失効
        if (res.status === 401) {
          // alert("ログインが必要です。再度ログインしてください。");
        }

        setRequests([]);
        return;
      }

      setRequests(((json as any).data ?? []) as DbTherapistStoreRequestRow[]);
    } catch (e) {
      console.error("[StoreConsole] loadPendingRequests exception:", e);
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // ========= ④ セラピスト一覧 / 申請一覧の読み込み =========
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;

    const load = async () => {
      setLoadingTherapists(true);
      try {
        const joined = await listTherapistsForStore(storeId);
        if (cancelled) return;
        setTherapists(joined);

        await loadPendingRequests(storeId);
      } catch (e) {
        if (!cancelled) console.error("[StoreConsole] load error:", e);
      } finally {
        if (!cancelled) setLoadingTherapists(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [storeId, loadPendingRequests]);

  const canSave = state.storeName.trim().length > 0;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const handleToggleDmNotice = () => {
    setState((prev) => ({ ...prev, dmNotice: !prev.dmNotice }));
  };

  const uploadAndUpdateAvatar = async (file: File): Promise<string> => {
    if (!storeId) throw new Error("店舗IDが取得できませんでした。");

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("画像サイズが大きすぎます（5MB以下推奨）");
    }

    setAvatarUploading(true);
    try {
      const publicUrl = await uploadAvatar(file, storeId);

      const { error } = await supabase
        .from("stores")
        .update({ avatar_url: publicUrl } as any)
        .eq("id", storeId);

      if (error) {
        console.error("[StoreConsole] failed to update stores.avatar_url:", error);
        throw new Error("アイコン画像をサーバーに保存できませんでした。");
      }

      setState((prev) => ({ ...prev, avatarUrl: publicUrl }));
      setAvatarPreview("");

      return publicUrl;
    } finally {
      setAvatarUploading(false);
    }
  };

  const syncOwnerUserNameIfPossible = async (newName: string) => {
    const name = (newName ?? "").trim();
    if (!name) return;
    if (!ownerUserId) return;

    try {
      const { error } = await supabase.from("users").update({ name }).eq("id", ownerUserId);
      if (error) console.error("[StoreConsole] users.name sync failed:", error);
    } catch (e) {
      console.error("[StoreConsole] users.name sync exception:", e);
    }
  };

  const handleSave = async () => {
    if (!storeId) {
      alert("店舗IDが取得できませんでした。URLをご確認ください。");
      return;
    }
    if (!canSave) return;

    try {
      setSaving(true);

      const payload: Partial<DbStoreRow> = {
        name: state.storeName.trim() || null,
        area: state.area.trim() || null,
        website_url: state.websiteUrl.trim() ? normalizeUrl(state.websiteUrl) : null,
        line_url: state.lineUrl.trim() ? normalizeUrl(state.lineUrl) : null,
        avatar_url: state.avatarUrl?.trim() ? state.avatarUrl.trim() : null,
        x_url: state.xUrl.trim() ? normalizeUrl(state.xUrl) : null,
        twicas_url: state.twicasUrl.trim() ? normalizeUrl(state.twicasUrl) : null,
        description: state.description.trim() || null,
        dm_notice: !!state.dmNotice,
      } as any;

      const { error } = await supabase.from("stores").update(payload as any).eq("id", storeId);

      if (error) {
        console.error("[StoreConsole] failed to update stores:", error);
        alert("店舗情報の保存に失敗しました。時間をおいて再度お試しください。");
        return;
      }

      await syncOwnerUserNameIfPossible(state.storeName);

      alert("店舗情報を保存しました。");
    } catch (e) {
      console.error("[StoreConsole] handleSave error:", e);
      alert("店舗情報の保存に失敗しました。通信環境をご確認ください。");
    } finally {
      setSaving(false);
    }
  };

  const openDetachModal = (t: DbTherapistRow) => {
    setDetachError(null);
    setDetachPassword("");
    setDetachTarget({
      therapistId: String(t.id),
      displayName: t.display_name || "名前未設定",
    });
    setDetachOpen(true);
  };

  const confirmDetach = async () => {
    if (!storeId) return;
    if (!detachTarget) return;

    if (!detachPassword.trim()) {
      setDetachError("パスワードを入力してください。");
      return;
    }

    setDetaching(true);
    setDetachError(null);

    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const email = userRes.user?.email;
      if (!email) {
        throw new Error("メール情報が取得できませんでした。再ログインしてからお試しください。");
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: detachPassword,
      });
      if (signInErr) throw new Error("パスワードが正しくありません。");

      const { error: rpcErr } = await supabase.rpc("rpc_detach_therapist_from_store", {
        p_therapist_id: detachTarget.therapistId,
      });
      if (rpcErr) throw rpcErr;

      const joined = await listTherapistsForStore(storeId);
      setTherapists(joined);

      await loadPendingRequests(storeId);

      closeDetachModal();
    } catch (e: any) {
      console.error("[StoreConsole] detach failed:", e);
      setDetachError(e?.message ?? "解除に失敗しました。");
      setDetaching(false);
    }
  };

  const handleReviewRequest = async (requestId: string, decision: "approved" | "rejected") => {
    if (!storeId) return;

    try {
      setReviewingRequestId(requestId);

      const res = await authedFetch("/api/therapist-store-requests/review", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: decision === "approved" ? "approve" : "reject",
        }),
      });

      const json = await safeReadJson(res);

      if (!res.ok || !json || (json as any).ok !== true) {
        console.error("[review] failed", { status: res.status, json });
        const msg = (json as any)?.error || `failed to review request (status ${res.status})`;
        throw new Error(msg);
      }

      const joined = await listTherapistsForStore(storeId);
      setTherapists(joined);

      await loadPendingRequests(storeId);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "申請の処理に失敗しました");
    } finally {
      setReviewingRequestId(null);
    }
  };

  const avatarDisplay = avatarPreview || state.avatarUrl || "";

  return (
    <div className="app-root">
      <AppHeader
        title="店舗コンソール"
      />

      <main className="app-main store-console-main">
        {/* プロフィール（共通：surface-card + field） */}
        <section className="surface-card sc-card">
          <h2 className="sc-title">表示情報</h2>

          <div className="sc-profile-row">
            <AvatarUploader
              avatarUrl={avatarDisplay}
              displayName={state.storeName || "S"}
              onPreview={(dataUrl) => setAvatarPreview(dataUrl)}
              onFileSelect={async (file) => {
                const url = await uploadAndUpdateAvatar(file);
                return url;
              }}
              onUploaded={(url) => {
                setAvatarPreview("");
                setState((prev) => ({ ...prev, avatarUrl: url }));
              }}
            />

            <div className="sc-profile-main">
              <div className="sc-id-pill">Store ID：{storeId || "-"}</div>

              <div className="field">
                <label className="field-label">店舗名</label>
                <input
                  type="text"
                  className="field-input"
                  value={state.storeName}
                  onChange={(e) => updateField("storeName", e.target.value)}
                  placeholder="例）LuX nagoya"
                />
              </div>

              <div className="sc-sub-row">
                <div className="sc-sub-pill sc-sub-pill--soft">種別: 女性向けリラクゼーション</div>
              </div>

              {avatarUploading && (
                <div className="sc-sub-pill sc-sub-pill--soft">アイコン画像を保存しています…</div>
              )}
            </div>
          </div>
        </section>

        {/* 基本情報（共通：surface-card + field） */}
        <section className="surface-card sc-card">
          <h2 className="sc-title">基本情報</h2>

          <div className="field">
            <label className="field-label">エリア</label>
            <input
              type="text"
              className="field-input"
              value={state.area}
              onChange={(e) => updateField("area", e.target.value)}
              placeholder="例）名古屋 / 関西 / オンラインメイン など"
            />
          </div>

          <div className="field">
            <label className="field-label">公式サイトURL</label>
            <input
              type="url"
              className="field-input"
              value={state.websiteUrl}
              onChange={(e) => updateField("websiteUrl", e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="field">
            <label className="field-label">公式LINE / 予約リンク</label>
            <input
              type="url"
              className="field-input"
              value={state.lineUrl}
              onChange={(e) => updateField("lineUrl", e.target.value)}
              placeholder="https://lin.ee/..."
            />
          </div>

          <div className="field">
            <label className="field-label">X（旧Twitter）URL</label>
            <input
              type="url"
              className="field-input"
              value={state.xUrl}
              onChange={(e) => updateField("xUrl", e.target.value)}
              placeholder="https://x.com/..."
            />
          </div>

          <div className="field">
            <label className="field-label">ツイキャスURL</label>
            <input
              type="url"
              className="field-input"
              value={state.twicasUrl}
              onChange={(e) => updateField("twicasUrl", e.target.value)}
              placeholder="https://twitcasting.tv/..."
            />
          </div>

          <div className="field">
            <label className="field-label">プロフィール</label>
            <textarea
              className="field-input sc-textarea"
              value={state.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="お店の雰囲気や大切にしていることなど"
            />
          </div>
        </section>

        {/* 通知（共通：toggle-row/toggle-switch） */}
        <section className="surface-card sc-card">
          <h2 className="sc-title">通知設定</h2>

          <div className="toggle-row">
            <div className="toggle-text">
              <div className="toggle-title">DMの通知</div>
              <div className="sc-caption">
                セラピスト / ユーザーからのDMに関する通知を受け取ります
              </div>
            </div>

            <button
              type="button"
              className={"toggle-switch" + (state.dmNotice ? " is-on" : "")}
              onClick={handleToggleDmNotice}
              aria-pressed={state.dmNotice}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </section>

        {/* セラピスト管理（固有機能：見た目だけ surface-card に寄せる） */}
        <section className="surface-card sc-card">
          <h2 className="sc-title">セラピスト管理</h2>
          <p className="sc-caption">
            在籍申請が届いたセラピストを承認すると、この店舗に紐づきます。
          </p>

          <div className="sc-block">
            <h3 className="sc-block-title">現在いっしょに活動しているセラピスト</h3>

            {loadingTherapists && therapists.length === 0 ? (
              <p className="sc-caption">読み込み中です…</p>
            ) : therapists.length === 0 ? (
              <p className="sc-caption">まだこの店舗に紐づいているセラピストはいません。</p>
            ) : (
              <ul className="sc-list">
                {therapists.map((t) => (
                  <li key={t.id} className="sc-row">
                    <div className="sc-row-main">
                      <span className="sc-name">{t.display_name || "名前未設定"}</span>
                      <span className="sc-meta">{t.area || "エリア未設定"}</span>
                    </div>

                    <div className="sc-actions">
                      <span className="sc-tag">店舗に参加中</span>
                      <button
                        type="button"
                        className="sc-btn-danger-outline"
                        onClick={() => openDetachModal(t)}
                      >
                        在籍解除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sc-block sc-block--split">
            <h3 className="sc-block-title">在籍申請（承認待ち）</h3>
            <p className="sc-caption">
              セラピスト側から「在籍申請」が届いた一覧です。承認/却下できます。
            </p>

            {loadingRequests && requests.length === 0 ? (
              <p className="sc-caption">読み込み中です…</p>
            ) : requests.length === 0 ? (
              <p className="sc-caption">現在、承認待ちの申請はありません。</p>
            ) : (
              <ul className="sc-list">
                {requests.map((r) => {
                  const t = pickTherapistOne(r.therapist);
                  const labelName = t?.display_name || "名前未設定";
                  const labelArea = t?.area || "エリア未設定";
                  const busy = reviewingRequestId === r.id;

                  return (
                    <li key={r.id} className="sc-row">
                      <div className="sc-row-main">
                        <span className="sc-name">{labelName}</span>
                        <span className="sc-meta">{labelArea}</span>
                      </div>

                      <div className="sc-actions">
                        <button
                          type="button"
                          className="sc-btn-primary"
                          onClick={() => handleReviewRequest(r.id, "approved")}
                          disabled={busy}
                        >
                          {busy ? "処理中…" : "承認"}
                        </button>

                        <button
                          type="button"
                          className="sc-btn-outline"
                          onClick={() => handleReviewRequest(r.id, "rejected")}
                          disabled={busy}
                        >
                          {busy ? "処理中…" : "却下"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* 保存バー（共通：btn-primary を使用。footer固定バーはグローバルCSS側に寄せるため className を統一） */}
      <footer className="console-footer-bar">
        <button
          type="button"
          className="btn-primary btn-primary--full"
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? "保存中..." : "この内容で保存する"}
        </button>
      </footer>

      {/* モーダル（固有：維持） */}
      {detachOpen && detachTarget && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetachModal();
          }}
        >
          <div className="modal-card">
            <div className="modal-title">在籍解除の確認</div>
            <p className="modal-text">
              {detachTarget.displayName} を在籍解除します。
              <br />
              誤操作防止のため、ログイン時のパスワードを入力してください。
            </p>

            <input
              type="password"
              className="modal-input"
              placeholder="パスワード"
              value={detachPassword}
              onChange={(e) => setDetachPassword(e.target.value)}
              autoFocus
            />

            {detachError && <div className="modal-error">{detachError}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel"
                onClick={closeDetachModal}
                disabled={detaching}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="modal-danger"
                onClick={confirmDetach}
                disabled={detaching}
              >
                {detaching ? "解除中…" : "解除する"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="mypage" hasUnread={hasUnread} />

      <style jsx>{`
        /* ★ グローバルCSSに移した「共通UI」部分はここから削除済み
           - .store-console-main の padding は app-main で担保されるため不要
           - .sc-footer-bar / toggle / btn-primary 等は削除
        */

        /* ===== Store Console 固有 ===== */
        .sc-card {
          margin-top: 12px;
        }

        .sc-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-sub);
        }

        .sc-profile-row {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .sc-profile-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sc-id-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--surface-soft);
          font-size: 11px;
          color: var(--text-sub);
          width: fit-content;
        }

        .sc-sub-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 2px;
        }

        .sc-sub-pill {
          font-size: 11px;
        }

        .sc-sub-pill--soft {
          background: var(--surface-soft);
          color: var(--text-sub);
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .sc-textarea {
          min-height: 120px;
          line-height: 1.7;
          resize: vertical;
        }

        .sc-caption {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.6;
          margin-top: 4px;
        }

        /* ===== セラピスト管理：固有 ===== */
        .sc-block {
          margin-top: 10px;
        }
        .sc-block--split {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
        }
        .sc-block-title {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .sc-list {
          margin-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-left: 0;
          list-style: none;
        }
        .sc-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 12px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.04));
        }
        .sc-row-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .sc-name {
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sc-meta {
          font-size: 11px;
          opacity: 0.7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sc-actions {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-shrink: 0;
        }
        .sc-tag {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          white-space: nowrap;
        }
        .sc-btn-primary {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: var(--accent, #d7b976);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }
        .sc-btn-outline {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          cursor: pointer;
          background: #fff;
          color: var(--text-sub, #666);
        }
        .sc-btn-danger-outline {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(239, 68, 68, 0.35);
          cursor: pointer;
          background: #fff;
          color: #b91c1c;
          white-space: nowrap;
        }
        .sc-btn-danger-outline:hover {
          background: rgba(239, 68, 68, 0.06);
        }
        .sc-btn-primary[disabled],
        .sc-btn-outline[disabled] {
          opacity: 0.6;
          cursor: default;
        }

        /* ===== モーダル（固有：維持） ===== */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.42);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          z-index: 9999;
        }
        .modal-card {
          width: 100%;
          max-width: 420px;
          border-radius: 16px;
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
          padding: 12px;
        }
        .modal-title {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .modal-text {
          font-size: 12px;
          line-height: 1.7;
          color: var(--text-sub);
          margin: 0 0 10px;
        }
        .modal-input {
          width: 100%;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 8px 12px;
          font-size: 13px;
          background: #fff;
        }
        .modal-error {
          margin-top: 8px;
          font-size: 12px;
          color: #b91c1c;
        }
        .modal-actions {
          margin-top: 12px;
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .modal-cancel {
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          background: #fff;
          cursor: pointer;
        }
        .modal-danger {
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 999px;
          border: none;
          background: #ef4444;
          color: #fff;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);
        }
        .modal-cancel[disabled],
        .modal-danger[disabled] {
          opacity: 0.6;
          cursor: default;
        }
      `}</style>
    </div>
  );
};

export default StoreConsolePage;