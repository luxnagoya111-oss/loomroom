// app/therapist/[id]/console/page.tsx
"use client";

import React, { useEffect, useState, ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AvatarUploader from "@/components/AvatarUploader";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { uploadAvatar } from "@/lib/avatarStorage";

const hasUnread = true;

type Area =
  | "北海道"
  | "東北"
  | "関東"
  | "中部"
  | "近畿"
  | "中国"
  | "四国"
  | "九州"
  | "沖縄";

type TherapistProfile = {
  displayName: string;
  area: Area | "";
  intro: string; // UI上は intro のまま。DBには profile として保存する
  snsX?: string;
  snsLine?: string;
  snsOther?: string;
  avatarDataUrl?: string;
  dmNotice: boolean;
};

// DB: therapists テーブル
type DbTherapistRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  area: string | null;
  profile: string | null;
  avatar_url: string | null;
  sns_x: string | null;
  sns_line: string | null;
  sns_other: string | null;
  dm_notice: boolean | null;
  store_id?: string | null;
};

type DbStoreLite = {
  id: string;
  name: string | null;
  avatar_url: string | null;
};

type DbTherapistStoreRequestRow = {
  id: string;
  store_id: string;
  therapist_id: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | string;
  created_at: string;
  store?: DbStoreLite | null;
};

const STORAGE_PREFIX = "loomroom_therapist_profile_";

const DEFAULT_PROFILE: TherapistProfile = {
  displayName: "",
  area: "",
  intro: "",
  snsX: "",
  snsLine: "",
  snsOther: "",
  dmNotice: true,
};

type ModalMode = "cancel_request" | "detach" | null;

const TherapistConsolePage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const therapistId = (params?.id as string) || ""; // URLの [id] = therapists.id(uuid)
  const storageKey = `${STORAGE_PREFIX}${therapistId}`;

  const [data, setData] = useState<TherapistProfile>(() => DEFAULT_PROFILE);

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ★追加：therapists.user_id を保持（保存時に users.name 更新に使う）
  const [therapistUserId, setTherapistUserId] = useState<string | null>(null);

  // ===== 店舗とのつながり =====
  const [loadingLink, setLoadingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // therapists.store_id
  const [linkedStoreId, setLinkedStoreId] = useState<string | null>(null);
  const [linkedStore, setLinkedStore] = useState<DbStoreLite | null>(null);

  // therapist_store_requests（pending）
  const [pendingRequest, setPendingRequest] =
    useState<DbTherapistStoreRequestRow | null>(null);

  // ===== パスワード必須モーダル（キャンセル/解除 共通）=====
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalPassword, setModalPassword] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const updateField = <K extends keyof TherapistProfile>(
    key: K,
    value: TherapistProfile[K]
  ) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  // ① localStorage 復元（互換）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TherapistProfile>;
        setData((prev) => ({
          ...prev,
          ...parsed,
          dmNotice:
            typeof parsed.dmNotice === "boolean" ? parsed.dmNotice : prev.dmNotice,
        }));
      }
    } catch (e) {
      console.warn("Failed to load therapist console data", e);
    } finally {
      setLoaded(true);
    }
  }, [storageKey]);

  // ② Supabase therapists から取得（★ id）
  useEffect(() => {
    if (!therapistId) return;

    let cancelled = false;

    const loadTherapistFromSupabase = async () => {
      try {
        const { data: dbRow, error } = await supabase
          .from("therapists")
          .select(
            "id, user_id, display_name, area, profile, avatar_url, sns_x, sns_line, sns_other, dm_notice, store_id"
          )
          .eq("id", therapistId)
          .maybeSingle<DbTherapistRow>();

        if (cancelled) return;

        if (error) {
          console.error("[TherapistConsole] loadTherapist error:", {
            message: (error as any)?.message,
            code: (error as any)?.code,
            details: (error as any)?.details,
            hint: (error as any)?.hint,
          });
          return;
        }
        if (!dbRow) return;

        // ★ user_id を保持
        setTherapistUserId(dbRow.user_id ?? null);

        setData((prev) => ({
          ...prev,
          displayName: dbRow.display_name ?? prev.displayName,
          area: (dbRow.area as Area) ?? prev.area,
          intro: dbRow.profile ?? prev.intro,
          snsX: dbRow.sns_x ?? prev.snsX,
          snsLine: dbRow.sns_line ?? prev.snsLine,
          snsOther: dbRow.sns_other ?? prev.snsOther,
          avatarDataUrl: dbRow.avatar_url ?? prev.avatarDataUrl,
          dmNotice:
            typeof dbRow.dm_notice === "boolean" ? dbRow.dm_notice : prev.dmNotice,
        }));

        setLinkedStoreId((dbRow as any).store_id ?? null);
      } catch (e) {
        if (!cancelled) console.error("[TherapistConsole] loadTherapist exception:", e);
      }
    };

    loadTherapistFromSupabase();
    return () => {
      cancelled = true;
    };
  }, [therapistId]);

  // ③ 店舗とのつながり：取得
  const loadConnectionState = async (tid: string) => {
    setLoadingLink(true);
    setLinkError(null);

    try {
      const { data: tRow, error: tErr } = await supabase
        .from("therapists")
        .select("id, store_id")
        .eq("id", tid)
        .maybeSingle<{ id: string; store_id: string | null }>();

      if (tErr) throw tErr;

      const storeId = tRow?.store_id ?? null;
      setLinkedStoreId(storeId);

      if (storeId) {
        const { data: sRow, error: sErr } = await supabase
          .from("stores")
          .select("id, name, avatar_url")
          .eq("id", storeId)
          .maybeSingle<DbStoreLite>();

        if (sErr) throw sErr;

        setLinkedStore(sRow ?? null);
        setPendingRequest(null);
        return;
      }

      const { data: reqRow, error: rErr } = await supabase
        .from("therapist_store_requests")
        .select(
          "id, store_id, therapist_id, status, created_at, store:stores(id, name, avatar_url)"
        )
        .eq("therapist_id", tid)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<DbTherapistStoreRequestRow>();

      if (rErr) throw rErr;

      setPendingRequest(reqRow ?? null);
      setLinkedStore(null);
    } catch (e: any) {
      console.error("[TherapistConsole] loadConnectionState failed:", e);
      setLinkError(e?.message ?? "店舗とのつながり情報の取得に失敗しました。");
      setLinkedStore(null);
      setPendingRequest(null);
      setLinkedStoreId(null);
    } finally {
      setLoadingLink(false);
    }
  };

  useEffect(() => {
    if (!therapistId) return;
    let cancelled = false;

    (async () => {
      await loadConnectionState(therapistId);
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [therapistId]);

  // ④ Avatar：Storage → therapists.avatar_url 更新
  const handleAvatarFileSelect = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") updateField("avatarDataUrl", reader.result);
      };
      reader.readAsDataURL(file);
    } catch {}

    try {
      setAvatarUploading(true);

      const publicUrl = await uploadAvatar(file, therapistId);

      const { error } = await supabase
        .from("therapists")
        .update({ avatar_url: publicUrl })
        .eq("id", therapistId);

      if (error) {
        console.error("[TherapistConsole] failed to update therapists.avatar_url:", error);
        alert("アイコン画像をサーバーに保存できませんでした。");
        return;
      }

      updateField("avatarDataUrl", publicUrl);
    } catch (e) {
      console.error("[TherapistConsole] handleAvatarFileSelect error:", e);
      alert("画像のアップロードに失敗しました。");
    } finally {
      setAvatarUploading(false);
    }
  };

  // ★ 正規化ルール：displayName 更新時に users.name も上書き
  const syncUserNameIfPossible = async (nextDisplayName: string) => {
    const name = (nextDisplayName ?? "").trim();
    if (!name) return;

    if (!therapistUserId) {
      // user_id がまだ取れてない場合は何もしない（保存自体は続行）
      console.warn("[TherapistConsole] therapistUserId is missing; skip users.name sync");
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({ name })
      .eq("id", therapistUserId);

    if (error) {
      console.error("[TherapistConsole] failed to update users.name:", {
        message: (error as any)?.message,
        code: (error as any)?.code,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      });
      throw error;
    }
  };

  const handleSave = async () => {
    if (typeof window === "undefined") return;

    // 1) localStorage 保存（互換）
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save therapist profile (localStorage)", e);
      alert("ローカル保存に失敗しました。");
    }

    // 2) Supabase 保存
    try {
      setSaving(true);

      // 2-A) users.name 同期（失敗したら保存全体を止める方針）
      await syncUserNameIfPossible(data.displayName);

      // 2-B) therapists 更新（display_name も互換として同期）
      const updatePayload: Partial<DbTherapistRow> = {
        display_name: (data.displayName || "").trim() || null,
        area: data.area || null,
        profile: data.intro || null,
        sns_x: data.snsX || null,
        sns_line: data.snsLine || null,
        sns_other: data.snsOther || null,
        avatar_url: data.avatarDataUrl || null,
        dm_notice: !!data.dmNotice,
      };

      const { data: updated, error } = await supabase
        .from("therapists")
        .update(updatePayload)
        .eq("id", therapistId)
        .select("id")
        .maybeSingle();

      if (error || !updated) {
        console.error("[TherapistConsole] failed to update therapists:", {
          message: (error as any)?.message,
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });
        alert("サーバー側のプロフィール保存に失敗しました。");
        return;
      }

      alert("プロフィールを保存しました。");
    } catch (e: any) {
      console.error("[TherapistConsole] handleSave error:", e);
      alert(e?.message ?? "サーバー側の保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  // ====== パスワード必須モーダル（共通）======
  const openModal = (mode: ModalMode) => {
    setModalMode(mode);
    setModalPassword("");
    setModalError(null);
    setModalBusy(false);
  };
  const closeModal = () => {
    setModalMode(null);
    setModalPassword("");
    setModalError(null);
    setModalBusy(false);
  };

  const reauthWithPassword = async (password: string) => {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const email = userRes.user?.email;
    if (!email) {
      throw new Error("メール情報が取得できませんでした。再ログインしてからお試しください。");
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      throw new Error("パスワードが正しくありません。");
    }
  };

  const doCancelRequest = async () => {
    if (!therapistId) return;
    if (!pendingRequest?.id) return;

    setModalBusy(true);
    setModalError(null);

    try {
      if (!modalPassword.trim()) {
        setModalError("パスワードを入力してください。");
        setModalBusy(false);
        return;
      }

      await reauthWithPassword(modalPassword);

      const { error: rpcErr } = await supabase.rpc(
        "rpc_cancel_therapist_store_request",
        { p_request_id: pendingRequest.id }
      );
      if (rpcErr) throw rpcErr;

      setPendingRequest(null);
      setLinkedStore(null);

      closeModal();
      await loadConnectionState(therapistId);
    } catch (e: any) {
      console.error("[TherapistConsole] cancel request failed:", e);
      setModalError(e?.message ?? "申請のキャンセルに失敗しました。");
      setModalBusy(false);
    }
  };

  // ※ detach はあなたのRPC設計（store_id=null）に合わせて差し替える想定。
  // 現状コードは pendingRequest 前提になっているので、今回は既存挙動を崩さず残します。
  const doDetach = async () => {
    if (!therapistId) return;

    setModalBusy(true);
    setModalError(null);

    try {
      if (!modalPassword.trim()) {
        setModalError("パスワードを入力してください。");
        setModalBusy(false);
        return;
      }

      await reauthWithPassword(modalPassword);

      if (!pendingRequest?.id) {
        throw new Error("申請情報が取得できませんでした。");
      }

      const { error: rpcErr } = await supabase.rpc(
        "rpc_cancel_therapist_store_request",
        { p_request_id: pendingRequest.id }
      );
      if (rpcErr) throw rpcErr;

      setPendingRequest(null);
      setLinkedStore(null);

      closeModal();
      await loadConnectionState(therapistId);
    } catch (e: any) {
      console.error("[TherapistConsole] detach failed:", e);
      setModalError(e?.message ?? "在籍解除に失敗しました。");
      setModalBusy(false);
    }
  };

  const pendingStore = pendingRequest?.store ?? null;

  return (
    <>
      <div className="app-shell">
        <header className="app-header">
          <button type="button" className="header-icon-btn" onClick={() => history.back()}>
            ←
          </button>
          <div className="app-header-center">
            <div className="app-title">セラピスト用コンソール</div>
            <div className="app-header-sub">Therapist ID：{therapistId}</div>
          </div>
          <div style={{ width: 30 }} />
        </header>

        <main className="app-main therapist-console-main">
          {/* 店舗とのつながり */}
          <section className="surface-card tc-card">
            <div className="tc-head-row">
              <h2 className="tc-title">店舗とのつながり</h2>
              {loadingLink && <span className="tc-badge">読み込み中…</span>}
            </div>

            {linkError && <p className="tc-caption">{linkError}</p>}

            {!!linkedStoreId && linkedStore && (
              <div className="tc-link-card">
                <Link href={`/store/${linkedStore.id}`} className="tc-link-left">
                  <div
                    className="tc-link-avatar"
                    style={
                      linkedStore.avatar_url
                        ? {
                            backgroundImage: `url(${linkedStore.avatar_url})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    {!linkedStore.avatar_url && (
                      <span className="tc-link-avatar-text">
                        {(linkedStore.name || "S").trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="tc-link-meta">
                    <div className="tc-link-name">{linkedStore.name || "店舗名未設定"}</div>
                    <div className="tc-link-sub">
                      <span className="tc-pill is-approved">在籍中</span>
                      <span className="tc-link-hint">タップで店舗プロフィールへ</span>
                    </div>
                  </div>
                </Link>

                <div className="tc-link-right">
                  <button
                    type="button"
                    className="tc-btn-danger-outline"
                    onClick={() => openModal("detach")}
                    disabled={loadingLink}
                  >
                    在籍解除
                  </button>
                </div>
              </div>
            )}

            {!linkedStoreId && pendingRequest && pendingStore && (
              <div className="tc-link-card">
                <Link href={`/store/${pendingStore.id}`} className="tc-link-left">
                  <div
                    className="tc-link-avatar"
                    style={
                      pendingStore.avatar_url
                        ? {
                            backgroundImage: `url(${pendingStore.avatar_url})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    {!pendingStore.avatar_url && (
                      <span className="tc-link-avatar-text">
                        {(pendingStore.name || "S").trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="tc-link-meta">
                    <div className="tc-link-name">{pendingStore.name || "店舗名未設定"}</div>
                    <div className="tc-link-sub">
                      <span className="tc-pill is-pending">申請中</span>
                      <span className="tc-link-hint">承認されると在籍になります</span>
                    </div>
                  </div>
                </Link>

                <div className="tc-link-right">
                  <button
                    type="button"
                    className="tc-btn-outline"
                    onClick={() => openModal("cancel_request")}
                    disabled={loadingLink}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {!linkedStoreId && !pendingRequest && !loadingLink && (
              <p className="tc-caption">現在、新しい在籍リクエストは届いていません。</p>
            )}

            {!!linkedStoreId && !linkedStore && !loadingLink && (
              <p className="tc-caption">在籍情報を確認しています…</p>
            )}
          </section>

          {/* 表示情報 */}
          <section className="surface-card tc-card">
            <h2 className="tc-title">表示情報</h2>

            <div className="tc-profile-row">
              <AvatarUploader
                avatarDataUrl={data.avatarDataUrl}
                displayName={data.displayName || "T"}
                onFileSelect={handleAvatarFileSelect}
              />

              <div className="tc-profile-main">
                <div className="tc-id-pill">Therapist ID：{therapistId}</div>

                <div className="field">
                  <label className="field-label">表示名</label>
                  <input
                    className="field-input"
                    value={data.displayName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateField("displayName", e.target.value)
                    }
                    placeholder="例）TAKI / Hiyo / ひより など"
                  />
                </div>

                {avatarUploading && (
                  <div className="tc-caption">アイコン画像を保存しています…</div>
                )}
              </div>
            </div>

            <div className="field">
              <label className="field-label">よくいるエリア</label>
              <select
                className="field-input"
                value={data.area}
                onChange={(e) => updateField("area", e.target.value as Area)}
              >
                <option value="">未設定</option>
                <option value="北海道">北海道</option>
                <option value="東北">東北</option>
                <option value="関東">関東</option>
                <option value="中部">中部</option>
                <option value="近畿">近畿</option>
                <option value="中国">中国</option>
                <option value="四国">四国</option>
                <option value="九州">九州</option>
                <option value="沖縄">沖縄</option>
              </select>
            </div>

            <div className="field">
              <label className="field-label">ひとこと紹介</label>
              <textarea
                className="field-input tc-textarea"
                value={data.intro}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  updateField("intro", e.target.value)
                }
                placeholder="例）緊張しやすい方でも、呼吸がしやすくなる時間をイメージしています。"
              />
            </div>
          </section>

          {/* DM通知 */}
          <section className="surface-card tc-card">
            <h2 className="tc-title">DM通知</h2>
            <div className="dm-toggle-row">
              <div className="dm-toggle-text">
                <div className="dm-toggle-title">DM通知を受け取る</div>
                <div className="tc-caption">
                  ONにすると、新しいDMが届いたときに通知対象になります。
                </div>
              </div>

              <button
                type="button"
                className={"dm-switch" + (data.dmNotice ? " is-on" : " is-off")}
                onClick={() => updateField("dmNotice", !data.dmNotice)}
                aria-pressed={data.dmNotice}
              >
                <span className="dm-knob" />
              </button>
            </div>
          </section>

          {/* リンク */}
          <section className="surface-card tc-card">
            <h2 className="tc-title">リンク</h2>

            <div className="field">
              <label className="field-label">X（旧Twitter）URL</label>
              <input
                className="field-input"
                value={data.snsX || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsX", e.target.value)
                }
                placeholder="https://x.com/..."
              />
            </div>

            <div className="field">
              <label className="field-label">LINE（リットリンクなども可）</label>
              <input
                className="field-input"
                value={data.snsLine || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsLine", e.target.value)
                }
                placeholder="例）LINEの案内ページURL など"
              />
            </div>

            <div className="field">
              <label className="field-label">その他リンク</label>
              <input
                className="field-input"
                value={data.snsOther || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsOther", e.target.value)
                }
                placeholder="ツイキャス / プロフィールサイトなど"
              />
            </div>
          </section>
        </main>

        <footer className="tc-footer-bar">
          <button
            type="button"
            className="btn-primary btn-primary--full"
            disabled={!loaded || saving || !therapistId}
            onClick={handleSave}
          >
            {saving ? "保存中..." : loaded ? "プロフィールを保存する" : "読み込み中..."}
          </button>
        </footer>

        <BottomNav active="mypage" hasUnread={hasUnread} />
      </div>

      {/* ===== パスワード必須モーダル ===== */}
      {modalMode && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title">
              {modalMode === "cancel_request" ? "申請キャンセルの確認" : "在籍解除の確認"}
            </div>

            <p className="modal-text">
              {modalMode === "cancel_request"
                ? "承認される前の在籍申請をキャンセルします。"
                : "在籍を解除します。"}
              <br />
              誤操作防止のため、ログイン時のパスワードを入力してください。
            </p>

            <input
              type="password"
              className="modal-input"
              placeholder="パスワード"
              value={modalPassword}
              onChange={(e) => setModalPassword(e.target.value)}
              autoFocus
            />

            {modalError && <div className="modal-error">{modalError}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel"
                onClick={closeModal}
                disabled={modalBusy}
              >
                キャンセル
              </button>

              <button
                type="button"
                className="modal-danger"
                onClick={async () => {
                  if (modalMode === "cancel_request") await doCancelRequest();
                  if (modalMode === "detach") await doDetach();
                }}
                disabled={modalBusy}
              >
                {modalBusy
                  ? "処理中…"
                  : modalMode === "cancel_request"
                  ? "キャンセルする"
                  : "解除する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* styles は既存のまま */}
      <style jsx>{`
        .therapist-console-main {
          padding: 12px 16px 140px;
        }
        .tc-card {
          margin-top: 12px;
        }
        .tc-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-sub);
        }
        .tc-profile-row {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .tc-profile-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tc-id-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--surface-soft);
          font-size: 11px;
          color: var(--text-sub);
        }
        .tc-textarea {
          min-height: 80px;
          line-height: 1.7;
          resize: vertical;
        }
        .tc-caption {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 4px;
          line-height: 1.6;
        }
        .tc-footer-bar {
          position: fixed;
          bottom: 58px;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 430px;
          padding: 8px 16px;
          background: linear-gradient(
            to top,
            rgba(247, 247, 250, 0.98),
            rgba(247, 247, 250, 0.88)
          );
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: center;
          z-index: 25;
        }

        .dm-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .dm-toggle-text {
          flex: 1;
        }
        .dm-toggle-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 2px;
        }
        .dm-switch {
          width: 48px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          position: relative;
          padding: 0;
        }
        .dm-switch.is-on {
          background: linear-gradient(135deg, #d9b07c, #b4895a);
        }
        .dm-switch.is-off {
          background: #d1d5db;
        }
        .dm-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #fff;
          transition: transform 0.15s ease;
        }
        .dm-switch.is-on .dm-knob {
          transform: translateX(20px);
        }

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

        :global(.no-link-style) {
          color: inherit;
          text-decoration: none;
        }

        .tc-head-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .tc-badge {
          font-size: 11px;
          color: var(--text-sub);
          padding: 3px 8px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.08));
          border-radius: 999px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          white-space: nowrap;
        }
        .tc-link-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 10px;
          border-radius: 14px;
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          margin-top: 8px;
        }
        .tc-link-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          text-decoration: none;
          color: inherit;
          flex: 1;
        }
        .tc-link-avatar {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.08));
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
        }
        .tc-link-avatar-text {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-sub);
        }
        .tc-link-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .tc-link-name {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tc-link-sub {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .tc-link-hint {
          font-size: 11px;
          color: var(--text-sub);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tc-pill {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          white-space: nowrap;
        }
        .tc-pill.is-approved {
          background: rgba(215, 185, 118, 0.18);
        }
        .tc-pill.is-pending {
          background: rgba(148, 163, 184, 0.18);
        }
        .tc-link-right {
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }
        .tc-btn-outline {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          background: #fff;
          color: var(--text-sub);
          cursor: pointer;
          white-space: nowrap;
        }
        .tc-btn-danger-outline {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(239, 68, 68, 0.35);
          background: #fff;
          color: #b91c1c;
          cursor: pointer;
          white-space: nowrap;
        }
        .tc-btn-outline:active,
        .tc-btn-danger-outline:active {
          transform: translateY(1px);
        }
      `}</style>
    </>
  );
};

export default TherapistConsolePage;