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

/**
 * localStorage に保存する “軽い” 状態だけ保持する
 * - avatar は URL だけ保存（Base64プレビューは絶対に保存しない）
 */
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

  /** ★ 保存用（public URL） */
  avatarUrl?: string;
};

/**
 * therapist_store_requests の pending を表示するための最小型
 * - therapist は JOIN して表示する
 */
type DbTherapistStoreRequestRow = {
  id: string;
  store_id: string;
  therapist_id: string;
  status: "pending" | "approved" | "rejected" | string;
  created_at: string;
  therapist?: {
    id: string;
    display_name: string | null;
    area: string | null;
  } | null;
};

function normalizeUrl(v: string): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}

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

  /** ★ UIプレビュー専用（localStorageに保存しない） */
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  /** ★ stores.owner_user_id を保持（users.name 同期用） */
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);

  /** セラピスト管理用 */
  const [therapists, setTherapists] = useState<DbTherapistRow[]>([]);
  const [loadingTherapists, setLoadingTherapists] = useState(false);

  /** ★ 申請一覧（pending） */
  const [requests, setRequests] = useState<DbTherapistStoreRequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(
    null
  );

  /** ★ 在籍解除（モーダル + パスワード再入力） */
  const [detachOpen, setDetachOpen] = useState(false);
  const [detachTarget, setDetachTarget] = useState<{
    therapistId: string;
   displayName: string;
  } | null>(null);
  const [detachPassword, setDetachPassword] = useState("");
  const [detaching, setDetaching] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);

  // ★ closeDetachModal を useCallback で先に定義（Hookより前に関数参照が必要なため）
  const closeDetachModal = useCallback(() => {
    setDetachOpen(false);
    setDetachTarget(null);
    setDetachPassword("");
    setDetachError(null);
    setDetaching(false);
  }, []);

// ★ Escで閉じる（必ず loaded return より前）
useEffect(() => {
  if (!detachOpen) return;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeDetachModal();
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [detachOpen, closeDetachModal]);

  // ========= ① localStorage から復元（軽量ステートだけ） =========
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

  // ========= ③ localStorage への自動保存（loaded後のみ） =========
  useEffect(() => {
    if (!loaded) return;
    if (typeof window === "undefined") return;

    // Base64プレビューは絶対に保存しない
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

  // ========= ★ pending 申請取得 =========
  const loadPendingRequests = async (sid: string) => {
    setLoadingRequests(true);
    try {
      const res = await fetch(
        `/api/therapist-store-requests?storeId=${encodeURIComponent(sid)}`,
        { method: "GET", cache: "no-store" }
      );

      const json = await safeReadJson(res);

      if (!res.ok || !json || (json as any).ok !== true) {
        const contentType = res.headers.get("content-type");
        console.error(
          "[StoreConsole] loadPendingRequests failed",
          "status=",
          res.status,
          "content-type=",
          contentType,
          "json=",
          JSON.stringify(json)
        );
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
  };

  // ========= ④ セラピスト一覧 / 申請一覧の読み込み =========
  useEffect(() => {
    if (!storeId) return;

    let cancelled = false;

    const load = async () => {
      setLoadingTherapists(true);
      try {
        const [joined] = await Promise.all([listTherapistsForStore(storeId)]);
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
  }, [storeId]);

  // ========= UI前提 =========
  if (!loaded) {
    return (
      <div className="app-root">
        <AppHeader />
        <main className="app-main">
          <p>読み込み中...</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const canSave = state.storeName.trim().length > 0;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const handleToggleDmNotice = () => {
    setState((prev) => ({ ...prev, dmNotice: !prev.dmNotice }));
  };

  // ========= Avatar：Storage upload → stores.avatar_url 更新 → public URL を返す =========
  const uploadAndUpdateAvatar = async (file: File): Promise<string> => {
    if (!storeId) throw new Error("店舗IDが取得できませんでした。");

    // 5MB 制限（任意）
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("画像サイズが大きすぎます（5MB以下推奨）");
    }

    setAvatarUploading(true);
    try {
      // Storageへアップロード（publicUrl返る）
      const publicUrl = await uploadAvatar(file, storeId);

      // stores.avatar_url 更新
      const { error } = await supabase
        .from("stores")
        .update({ avatar_url: publicUrl } as any)
        .eq("id", storeId);

      if (error) {
        console.error("[StoreConsole] failed to update stores.avatar_url:", error);
        throw new Error("アイコン画像をサーバーに保存できませんでした。");
      }

      // UI state をURL正に更新（Base64は保持しない）
      setState((prev) => ({ ...prev, avatarUrl: publicUrl }));
      setAvatarPreview("");

      return publicUrl;
    } finally {
      setAvatarUploading(false);
    }
  };

  // ========= ★ stores.name → users.name 同期 =========
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

  // ========= 保存：stores テーブル更新 → 成功後に users.name も同期 =========
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

  // ========= ★ 在籍解除：モーダル制御 =========
  const openDetachModal = (t: DbTherapistRow) => {
    setDetachError(null);
    setDetachPassword("");
    setDetachTarget({
      therapistId: String(t.id),
      displayName: t.display_name || "名前未設定",
    });
    setDetachOpen(true);
  };

  // ========= ★ 在籍解除：パスワード再入力 → RPC =========
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

      closeDetachModal();
    } catch (e: any) {
      console.error("[StoreConsole] detach failed:", e);
      setDetachError(e?.message ?? "解除に失敗しました。");
      setDetaching(false);
    }
  };

  // ========= ★ 申請の承認/却下 =========
  const handleReviewRequest = async (
    requestId: string,
    decision: "approved" | "rejected"
  ) => {
    if (!storeId) return;

    try {
      setReviewingRequestId(requestId);

      const res = await fetch("/api/therapist-store-requests/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: decision === "approved" ? "approve" : "reject",
        }),
      });

      const text = await res.text();
      const json = text
        ? (() => {
            try {
              return JSON.parse(text);
            } catch {
              return null;
            }
          })()
        : null;

      if (!res.ok) {
        console.error("[review] status:", res.status, "body:", text);
        throw new Error(
          (json as any)?.error || `failed to review request (status ${res.status})`
        );
      }

      const joined = await listTherapistsForStore(storeId);
      setTherapists(joined);
      await loadPendingRequests(storeId);
    } catch (e) {
      console.error(e);
      alert("申請の処理に失敗しました");
    } finally {
      setReviewingRequestId(null);
    }
  };

  // 表示は preview優先 → 保存URL
  const avatarDisplay = avatarPreview || state.avatarUrl || "";

  return (
    <div className="app-root">
      <AppHeader />

      <main className="app-main store-main">
        <h1 className="app-title">店舗コンソール</h1>
        <p className="app-header-sub">
          LRoom 内での店舗情報を設定します。後からいつでも変更できます。
        </p>

        {/* 店舗プロフィール */}
        <section className="store-card">
          <div className="store-profile-row">
            <AvatarUploader
              avatarUrl={avatarDisplay}
              displayName={state.storeName || "S"}
              onPreview={(dataUrl) => setAvatarPreview(dataUrl)} // UIだけ
              onFileSelect={async (file) => {
                // Storage upload + stores update をここで実施してURL返す
                const url = await uploadAndUpdateAvatar(file);
                return url;
              }}
              onUploaded={(url) => {
                // 確定URLに置き換え（プレビュー解除）
                setAvatarPreview("");
                setState((prev) => ({ ...prev, avatarUrl: url }));
              }}
            />
            <div className="store-profile-main">
              <label className="field-label">店舗名</label>
              <input
                type="text"
                className="field-input"
                value={state.storeName}
                onChange={(e) => updateField("storeName", e.target.value)}
                placeholder="例）LuX nagoya"
              />

              <div className="store-sub-row">
                <div className="store-sub-pill store-sub-pill--soft">
                  種別: 女性向けリラクゼーション
                </div>
              </div>

              {avatarUploading && (
                <div className="store-sub-pill store-sub-pill--soft">
                  アイコン画像を保存しています…
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 基本情報 */}
        <section className="store-card">
          <div className="store-section-title">基本情報</div>

          <div className="field-row">
            <label className="field-label">エリア</label>
            <input
              type="text"
              className="field-input"
              value={state.area}
              onChange={(e) => updateField("area", e.target.value)}
              placeholder="例）名古屋 / 関西 / オンラインメイン など"
            />
          </div>

          <div className="field-row">
            <label className="field-label">公式サイトURL</label>
            <input
              type="url"
              className="field-input"
              value={state.websiteUrl}
              onChange={(e) => updateField("websiteUrl", e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="field-row">
            <label className="field-label">公式LINE / 予約リンク</label>
            <input
              type="url"
              className="field-input"
              value={state.lineUrl}
              onChange={(e) => updateField("lineUrl", e.target.value)}
              placeholder="https://lin.ee/..."
            />
          </div>

          <div className="field-row">
            <label className="field-label">X（旧Twitter）URL</label>
            <input
              type="url"
              className="field-input"
              value={state.xUrl}
              onChange={(e) => updateField("xUrl", e.target.value)}
              placeholder="https://x.com/..."
            />
          </div>

          <div className="field-row">
            <label className="field-label">ツイキャスURL</label>
            <input
              type="url"
              className="field-input"
              value={state.twicasUrl}
              onChange={(e) => updateField("twicasUrl", e.target.value)}
              placeholder="https://twitcasting.tv/..."
            />
          </div>

          <div className="field-row">
            <label className="field-label">プロフィール</label>
            <textarea
              className="field-textarea"
              value={state.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="お店の雰囲気や大切にしていることなど"
            />
          </div>
        </section>

        {/* 通知設定 */}
        <section className="store-card">
          <div className="store-section-title">通知設定</div>

          <div className="toggle-row" onClick={handleToggleDmNotice}>
            <div className="toggle-main">
              <div className="toggle-title">DMの通知</div>
              <div className="toggle-caption">
                セラピスト / ユーザーからのDMに関する通知を受け取ります
              </div>
            </div>

            <div className={"toggle-switch" + (state.dmNotice ? " is-on" : "")}>
              <div className="toggle-knob" />
            </div>
          </div>
        </section>

        {/* セラピスト管理 */}
        <section className="store-card therapist-card">
          <div className="store-section-title">セラピスト管理</div>
          <p className="therapist-helper">
            在籍申請が届いたセラピストを承認すると、この店舗に紐づきます。
          </p>

          {/* 1) 在籍中 */}
          <div className="therapist-block">
            <h3 className="therapist-block-title">
              現在いっしょに活動しているセラピスト
            </h3>

            {loadingTherapists && therapists.length === 0 ? (
              <p className="therapist-helper">読み込み中です…</p>
            ) : therapists.length === 0 ? (
              <p className="therapist-helper">
                まだこの店舗に紐づいているセラピストはいません。
              </p>
            ) : (
              <ul className="therapist-list">
                {therapists.map((t) => (
                  <li key={t.id} className="therapist-row">
                    <div className="therapist-row-main">
                      <span className="therapist-name">
                        {t.display_name || "名前未設定"}
                      </span>
                      <span className="therapist-meta">{t.area || "エリア未設定"}</span>
                    </div>

                    <div className="therapist-actions">
                      <span className="therapist-tag">店舗に参加中</span>

                      <button
                        type="button"
                        className="therapist-detach-btn"
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

          {/* 2) 在籍申請（pending） */}
          <div className="therapist-block">
            <h3 className="therapist-block-title">在籍申請（承認待ち）</h3>
            <p className="therapist-helper">
              セラピスト側から「在籍申請」が届いた一覧です。承認/却下できます。
            </p>

            {loadingRequests && requests.length === 0 ? (
              <p className="therapist-helper">読み込み中です…</p>
            ) : requests.length === 0 ? (
              <p className="therapist-helper">現在、承認待ちの申請はありません。</p>
            ) : (
              <ul className="therapist-list">
                {requests.map((r) => {
                  const t = r.therapist;
                  const labelName = t?.display_name || "名前未設定";
                  const labelArea = t?.area || "エリア未設定";
                  const busy = reviewingRequestId === r.id;

                  return (
                    <li key={r.id} className="therapist-row">
                      <div className="therapist-row-main">
                        <span className="therapist-name">{labelName}</span>
                        <span className="therapist-meta">{labelArea}</span>
                      </div>

                      <div className="therapist-actions">
                        <button
                          type="button"
                          className="therapist-approve-btn"
                          onClick={() => handleReviewRequest(r.id, "approved")}
                          disabled={busy}
                        >
                          {busy ? "処理中…" : "承認"}
                        </button>

                        <button
                          type="button"
                          className="therapist-reject-btn"
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

        <div className="store-save-wrap">
          <button
            type="button"
            className="store-save-btn"
            disabled={!canSave || saving}
            onClick={handleSave}
          >
            {saving ? "保存中..." : "この内容で保存する"}
          </button>
        </div>
      </main>

      {/* 在籍解除モーダル */}
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

      <BottomNav />

      <style jsx>{`
        .store-main {
          padding: 12px 16px 140px;
        }

        .store-card {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 12px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          margin-top: 12px;
        }

        .store-profile-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .store-profile-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .store-sub-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }

        .store-sub-pill {
          font-size: 11px;
        }

        .store-sub-pill--soft {
          background: var(--surface-soft);
          color: var(--text-sub);
          padding: 4px 8px;
          border-radius: 999px;
        }

        .store-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-sub);
        }

        .field-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 10px;
        }

        .field-label {
          font-size: 11px;
          color: var(--text-sub);
        }

        .field-input {
          width: 100%;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 6px 10px;
          font-size: 13px;
          background: #fff;
        }

        .field-textarea {
          width: 100%;
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 10px 12px;
          font-size: 13px;
          background: #fff;
          line-height: 1.7;
          min-height: 120px;
          resize: vertical;
        }

        .store-save-wrap {
          margin-top: 16px;
          padding-bottom: 24px;
        }

        .store-save-btn {
          width: 100%;
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }

        .store-save-btn[disabled] {
          opacity: 0.6;
          cursor: default;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 10px;
          border-radius: 12px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.04));
          cursor: pointer;
        }

        .toggle-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .toggle-title {
          font-size: 12px;
          font-weight: 600;
        }

        .toggle-caption {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.5;
        }

        .toggle-switch {
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: #e5e5e5;
          position: relative;
          transition: background 0.2s ease;
          flex-shrink: 0;
        }

        .toggle-switch.is-on {
          background: linear-gradient(135deg, #e6c87a, #d7b976);
        }

        .toggle-knob {
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #9ca3af;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform 0.2s ease, background 0.2s ease;
        }

        .toggle-switch.is-on .toggle-knob {
          transform: translateX(20px);
          background: #ffffff;
        }

        .therapist-card {
          margin-top: 16px;
        }

        .therapist-helper {
          font-size: 11px;
          line-height: 1.6;
          color: var(--text-sub);
          margin-bottom: 6px;
        }

        .therapist-block {
          margin-top: 10px;
        }

        .therapist-block + .therapist-block {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
        }

        .therapist-block-title {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .therapist-list {
          margin-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-left: 0;
          list-style: none;
        }

        .therapist-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 12px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.04));
        }

        .therapist-row-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .therapist-name {
          font-size: 13px;
          font-weight: 600;
        }

        .therapist-meta {
          font-size: 11px;
          opacity: 0.7;
        }

        .therapist-tag {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          white-space: nowrap;
        }

        .therapist-actions {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-shrink: 0;
        }

        .therapist-approve-btn {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: var(--accent, #d7b976);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }

        .therapist-reject-btn {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          cursor: pointer;
          background: #fff;
          color: var(--text-sub, #666);
        }

        .therapist-approve-btn[disabled],
        .therapist-reject-btn[disabled] {
          opacity: 0.6;
          cursor: default;
        }

        .therapist-detach-btn {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(239, 68, 68, 0.35);
          cursor: pointer;
          background: #fff;
          color: #b91c1c;
          white-space: nowrap;
        }

        .therapist-detach-btn:hover {
          background: rgba(239, 68, 68, 0.06);
        }

        /* --- modal --- */
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