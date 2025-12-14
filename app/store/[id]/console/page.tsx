"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarUploader from "@/components/AvatarUploader";
import { supabase } from "@/lib/supabaseClient";
import { uploadAvatar } from "@/lib/avatarStorage";

import type { DbStoreRow, DbTherapistRow } from "@/types/db";
import {
  listTherapistsForStore,
  listTherapistCandidates,
  attachTherapistToStore,
} from "@/lib/repositories/therapistRepository";

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
  avatarDataUrl?: string;

  area: string;
  websiteUrl: string;
  lineUrl: string;

  // 追加
  xUrl: string;
  twicas_url: string;

  dmNotice: boolean;
};

const StoreConsolePage: React.FC = () => {
  const params = useParams();
  const storeId = params?.id as string | undefined;

  const storageKey =
    typeof storeId === "string"
      ? `${STORAGE_KEY_PREFIX}${storeId}`
      : `${STORAGE_KEY_PREFIX}default`;

  const [state, setState] = useState<FormState>({
    storeName: "",
    avatarDataUrl: undefined,

    area: "",
    websiteUrl: "",
    lineUrl: "",

    xUrl: "",
    twicas_url: "",

    dmNotice: true,
  });

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // セラピスト管理用
  const [therapists, setTherapists] = useState<DbTherapistRow[]>([]);
  const [candidates, setCandidates] = useState<DbTherapistRow[]>([]);
  const [loadingTherapists, setLoadingTherapists] = useState(false);
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);

  // ① localStorage から復元（壊れてたら自動リセット）
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

  // ② Supabase の stores から店舗情報を取得
  useEffect(() => {
    if (!storeId) return;

    let cancelled = false;

    const loadStoreFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from("stores")
          .select("name, area, website_url, line_url, avatar_url, dm_notice, x_url, twicas_url")
          .eq("id", storeId)
          .maybeSingle<DbStoreRow>();

        if (cancelled) return;

        if (error) {
          console.error("[StoreConsole] loadStore error:", toPlainError(error));
          console.error("[StoreConsole] loadStore error(raw):", error);
          return;
        }
        if (!data) return;

        setState((prev) => ({
          ...prev,
          storeName: data.name ?? prev.storeName,
          area: (data as any).area ?? prev.area,
          websiteUrl: (data as any).website_url ?? prev.websiteUrl,
          lineUrl: (data as any).line_url ?? prev.lineUrl,
          avatarDataUrl: (data as any).avatar_url ?? prev.avatarDataUrl,

          // 追加
          xUrl: (data as any).x_url ?? prev.xUrl,
          twicas_url: (data as any).twicas_url ?? prev.twicas_url,

          dmNotice:
            typeof (data as any).dm_notice === "boolean"
              ? (data as any).dm_notice
              : prev.dmNotice,
        }));
      } catch (e) {
        if (!cancelled) {
          console.error("[StoreConsole] loadStore exception:", e);
        }
      }
    };

    loadStoreFromSupabase();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // ③ localStorage への自動保存
  useEffect(() => {
    if (!loaded) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.error("[StoreConsole] failed to save to localStorage:", e);
    }
  }, [loaded, state, storageKey]);

  // ④ セラピスト一覧 / 候補の読み込み
  useEffect(() => {
    if (!storeId) return;

    let cancelled = false;

    const loadTherapists = async () => {
      setLoadingTherapists(true);
      try {
        const [joined, candidateList] = await Promise.all([
          listTherapistsForStore(storeId),
          listTherapistCandidates(),
        ]);
        if (cancelled) return;
        setTherapists(joined);
        setCandidates(candidateList);
      } catch (e) {
        if (!cancelled) {
          console.error("[StoreConsole] loadTherapists error:", e);
        }
      } finally {
        if (!cancelled) {
          setLoadingTherapists(false);
        }
      }
    };

    loadTherapists();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

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

  const handleChange =
    (key: keyof FormState) =>
    (
      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
      const value = e.target.value;
      setState((prev) => ({
        ...prev,
        [key]: value as any,
      }));
    };

  const handleToggle = (key: keyof FormState) => () => {
    setState((prev) => ({
      ...prev,
      [key]: !prev[key] as any,
    }));
  };

  // Avatar 選択：プレビュー → Storage → stores.avatar_url 更新
  const handleAvatarFileSelect = async (file: File) => {
    // 即時プレビュー
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          setState((prev) => ({
            ...prev,
            avatarDataUrl: result,
          }));
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.warn("[StoreConsole] avatar preview error:", e);
    }

    if (!storeId) return;

    try {
      setAvatarUploading(true);

      const publicUrl = await uploadAvatar(file, storeId);

      const { error } = await supabase
        .from("stores")
        .update({ avatar_url: publicUrl } as any)
        .eq("id", storeId);

      if (error) {
        console.error("[StoreConsole] failed to update stores.avatar_url:", error);
        alert("アイコン画像の保存に失敗しました。時間をおいて再度お試しください。");
        return;
      }

      setState((prev) => ({
        ...prev,
        avatarDataUrl: publicUrl,
      }));
    } catch (e) {
      console.error("[StoreConsole] handleAvatarFileSelect error:", e);
      alert("画像のアップロードに失敗しました。通信環境をご確認ください。");
    } finally {
      setAvatarUploading(false);
    }
  };

  const canSave = state.storeName.trim().length > 0;

  // 保存：stores テーブル更新
  const handleSave = async () => {
    if (!storeId) {
      alert("店舗IDが取得できませんでした。URLをご確認ください。");
      return;
    }
    if (!canSave) return;

    try {
      setSaving(true);

      const payload: Partial<DbStoreRow> = {
        name: state.storeName || null,
        area: state.area || null,
        website_url: state.websiteUrl || null,
        line_url: state.lineUrl || null,
        avatar_url: state.avatarDataUrl || null,

        // 追加
        x_url: state.xUrl || null,
        twicas_url: state.twicas_url || null,

        dm_notice: state.dmNotice,
      } as any;

      const { error } = await supabase.from("stores").update(payload as any).eq("id", storeId);

      if (error) {
        console.error("[StoreConsole] failed to update stores:", error);
        alert("店舗情報の保存に失敗しました。時間をおいて再度お試しください。");
        return;
      }

      alert("店舗情報を保存しました。");
    } catch (e) {
      console.error("[StoreConsole] handleSave error:", e);
      alert("店舗情報の保存に失敗しました。通信環境をご確認ください。");
    } finally {
      setSaving(false);
    }
  };

  // 候補セラピストを紐づけ
  const handleAttachTherapist = async (therapistId: string) => {
    if (!storeId) return;
    try {
      setAttachTargetId(therapistId);
      const updated = await attachTherapistToStore(therapistId, storeId);
      if (!updated) return;

      setTherapists((prev) => [...prev, updated]);
      setCandidates((prev) => prev.filter((t) => t.id !== therapistId));
    } catch (e) {
      console.error("[StoreConsole] handleAttachTherapist error:", e);
      alert("セラピストの紐づけに失敗しました。時間をおいてお試しください。");
    } finally {
      setAttachTargetId(null);
    }
  };

  return (
    <div className="app-root">
      <AppHeader />

      <main className="app-main store-main">
        <h1 className="app-title">店舗コンソール</h1>
        <p className="app-header-sub">
          LoomRoom 内での店舗情報を設定します。後からいつでも変更できます。
        </p>

        {/* 店舗プロフィール */}
        <section className="store-card">
          <div className="store-profile-row">
            <AvatarUploader
              avatarDataUrl={state.avatarDataUrl}
              displayName={state.storeName || "S"}
              onFileSelect={handleAvatarFileSelect}
            />
            <div className="store-profile-main">
              <label className="field-label">店舗名</label>
              <input
                type="text"
                className="field-input"
                value={state.storeName}
                onChange={handleChange("storeName")}
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
            <label className="field-label">エリア（任意）</label>
            <input
              type="text"
              className="field-input"
              value={state.area}
              onChange={handleChange("area")}
              placeholder="例）名古屋 / 関西 / オンラインメイン など"
            />
          </div>

          <div className="field-row">
            <label className="field-label">公式サイトURL（任意）</label>
            <input
              type="url"
              className="field-input"
              value={state.websiteUrl}
              onChange={handleChange("websiteUrl")}
              placeholder="https://example.com"
            />
          </div>

          <div className="field-row">
            <label className="field-label">公式LINE / 予約リンク（任意）</label>
            <input
              type="url"
              className="field-input"
              value={state.lineUrl}
              onChange={handleChange("lineUrl")}
              placeholder="https://lin.ee/..."
            />
          </div>

          {/* 追加：X */}
          <div className="field-row">
            <label className="field-label">X（旧Twitter）URL（任意）</label>
            <input
              type="url"
              className="field-input"
              value={state.xUrl}
              onChange={handleChange("xUrl")}
              placeholder="https://x.com/..."
            />
          </div>

          {/* 追加：ツイキャス */}
          <div className="field-row">
            <label className="field-label">ツイキャスURL（任意）</label>
            <input
              type="url"
              className="field-input"
              value={state.twicas_url}
              onChange={handleChange("twicas_url")}
              placeholder="https://twitcasting.tv/..."
            />
          </div>
        </section>

        {/* 通知設定 */}
        <section className="store-card">
          <div className="store-section-title">通知設定</div>

          <div className="toggle-row" onClick={handleToggle("dmNotice")}>
            <div className="toggle-main">
              <div className="toggle-title">DMの通知</div>
              <div className="toggle-caption">
                セラピスト / ユーザーからのDMに関する通知を受け取ります
              </div>
            </div>

            <div
              className={
                "toggle-switch" + (state.dmNotice ? " is-on" : "")
              }
            >
              <div className="toggle-knob" />
            </div>
          </div>
        </section>

        {/* セラピスト管理 */}
        <section className="store-card therapist-card">
          <div className="store-section-title">セラピスト管理</div>
          <p className="therapist-helper">
            この店舗で一緒に活動するセラピストを選ぶことができます。
          </p>

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
                      <span className="therapist-meta">
                        {t.area || "エリア未設定"}
                      </span>
                    </div>
                    <span className="therapist-tag">店舗に参加中</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="therapist-block">
            <h3 className="therapist-block-title">仮参加中のセラピスト</h3>
            <p className="therapist-helper">
              まだどの店舗にも紐づいていないセラピストです。「この店舗に紐づける」で一緒に活動できます。
            </p>

            {loadingTherapists && candidates.length === 0 ? (
              <p className="therapist-helper">読み込み中です…</p>
            ) : candidates.length === 0 ? (
              <p className="therapist-helper">
                現在、紐づけ候補のセラピストはいません。
              </p>
            ) : (
              <ul className="therapist-list">
                {candidates.map((t) => (
                  <li key={t.id} className="therapist-row">
                    <div className="therapist-row-main">
                      <span className="therapist-name">
                        {t.display_name || "名前未設定"}
                      </span>
                      <span className="therapist-meta">
                        {t.area || "エリア未設定"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="therapist-attach-btn"
                      onClick={() => handleAttachTherapist(t.id)}
                      disabled={attachTargetId === t.id}
                    >
                      {attachTargetId === t.id ? "紐づけ中…" : "この店舗に紐づける"}
                    </button>
                  </li>
                ))}
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
          background: #e5e5e5;          /* OFF時：グレー */
          position: relative;
          transition: background 0.2s ease;
          flex-shrink: 0;
        }

        .toggle-switch.is-on {
          background: linear-gradient(
            135deg,
            #e6c87a,
            #d7b976
          );
        } 

        .toggle-knob {
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #9ca3af;          /* OFF時ノブ */
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform 0.2s ease, background 0.2s ease;
        }

        .toggle-switch.is-on .toggle-knob {
          transform: translateX(20px);
          background: #ffffff;          /* ON時ノブ */
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
          border: 1px solid rgba(0, 0, 0, 0.08));
        }

        .therapist-attach-btn {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: none;
          background: var(--accent, #d7b976);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }

        .therapist-attach-btn[disabled] {
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
};

export default StoreConsolePage;