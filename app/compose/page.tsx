// app/compose/page.tsx
"use client";

import React, { useEffect, useMemo, useState, ChangeEvent, FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

import { getCurrentUserId, getCurrentUserRole, ensureViewerId } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { uploadPostImage } from "@/lib/postImageStorage";

// Supabase users テーブル上で「ゲスト用」に1行だけ作っておく想定
const GUEST_DB_USER_ID = "00000000-0000-0000-0000-000000000000";

const MAX_LENGTH = 280;
const MAX_IMAGES = 4;

// therapists テーブルの最低限の行型
type DbTherapistRowForStatus = {
  id: string;
  user_id: string;
  store_id: string | null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

type Visibility = "public" | "followers" | "private";

export default function ComposePage() {
  const searchParams = useSearchParams();
  const replyTo = searchParams?.get("replyTo") || null;

  const logicalUserId = getCurrentUserId(); // "guest-xxxxx" or UUID
  const currentRole = getCurrentUserRole(); // "user" | "therapist" | "store" | "guest"

  const hasUnread = false;

  const [viewerUuid, setViewerUuid] = useState<string | null>(null);

  // 投稿可否（セラピスト所属チェック）
  const [canPost, setCanPost] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(currentRole === "therapist");

  const [text, setText] = useState("");

  // 公開範囲（DB保存する）
  const [visibility, setVisibility] = useState<Visibility>("public");

  // 返信可否（UIのみ。DB未導入のため保存しない）
  const [canReply, setCanReply] = useState(true);

  // 画像
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);

  // viewerUuid 確定（画像アップロードのownerIdに使う）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureViewerId();
        if (cancelled) return;
        setViewerUuid(uid && isUuid(uid) ? uid : null);
      } catch {
        if (!cancelled) setViewerUuid(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ロールに応じて投稿可否を決定（現状ロジック維持）
  useEffect(() => {
    if (currentRole !== "therapist") {
      setCanPost(true);
      setCheckingStatus(false);
      return;
    }

    if (!isUuid(logicalUserId)) {
      setCanPost(false);
      setCheckingStatus(false);
      return;
    }

    let cancelled = false;

    const checkTherapistStoreLink = async () => {
      try {
        setCheckingStatus(true);

        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, store_id")
          .eq("user_id", logicalUserId)
          .maybeSingle<DbTherapistRowForStatus>();

        if (cancelled) return;

        if (error) {
          console.error("[Compose] failed to load therapist status:", error);
          setCanPost(false);
          return;
        }

        if (!data) {
          setCanPost(false);
          return;
        }

        setCanPost(!!data.store_id);
      } catch (e) {
        if (!cancelled) {
          console.error("[Compose] therapist status check exception:", e);
          setCanPost(false);
        }
      } finally {
        if (!cancelled) setCheckingStatus(false);
      }
    };

    void checkTherapistStoreLink();

    return () => {
      cancelled = true;
    };
  }, [currentRole, logicalUserId]);

  const remaining = useMemo(() => MAX_LENGTH - text.length, [text.length]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next.length <= MAX_LENGTH) setText(next);
  };

  const onPickImages = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const next = [...images, ...files].slice(0, MAX_IMAGES);
    setImages(next);

    // preview
    const urls = next.map((f) => URL.createObjectURL(f));
    setImagePreviews((prev) => {
      // 古いURLを解放
      prev.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
      return urls;
    });

    // 同じファイルを再選択できるように
    e.target.value = "";
  };

  const removeImageAt = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // revoke removed
      const removed = prev[idx];
      if (removed) {
        try {
          URL.revokeObjectURL(removed);
        } catch {}
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const body = text.trim();
    if (!body) return;

    if (!canPost) {
      alert("現在、所属店舗が無いため投稿はできません。");
      return;
    }

    // replyTo は uuid のときのみ採用（壊さない）
    const parentPostId = replyTo && isUuid(replyTo) ? replyTo : null;

    // author_id に使うIDを決める（現状維持）
    const isGuestLogical =
      typeof logicalUserId === "string" && logicalUserId.startsWith("guest-");
    const authorId = isGuestLogical ? GUEST_DB_USER_ID : logicalUserId;

    const authorKind =
      currentRole === "therapist" || currentRole === "store" || currentRole === "user"
        ? currentRole
        : "user";

    try {
      setSubmitting(true);

      // 1) 画像アップロード（あれば）
      let imagePaths: string[] = [];
      if (images.length) {
        const owner = viewerUuid && isUuid(viewerUuid) ? viewerUuid : "anon";
        for (const file of images) {
          const path = await uploadPostImage(file, { ownerId: owner });
          imagePaths.push(path);
        }
      }

      // 2) posts insert（新カラム追加後の前提）
      const { error } = await supabase.from("posts").insert([
        {
          body,
          author_id: authorId,
          author_kind: authorKind,

          // 画像
          image_urls: imagePaths.length ? imagePaths : null,

          // 公開範囲（まずは保存だけ。TLフィルタは後段で適用）
          visibility: visibility,

          // 返信
          parent_post_id: parentPostId,
        },
      ]);

      if (error) {
        console.error("Supabase insert error:", error, (error as any)?.message, (error as any)?.code);
        alert(
          (error as any)?.message ??
            "投稿の保存中にエラーが発生しました。時間をおいて再度お試しください。"
        );
        return;
      }

      alert(parentPostId ? "返信を投稿しました。" : "投稿を公開しました。");

      setText("");
      setImages([]);
      setImagePreviews((prev) => {
        prev.forEach((u) => {
          try {
            URL.revokeObjectURL(u);
          } catch {}
        });
        return [];
      });

      if (typeof window !== "undefined") window.location.href = "/";
    } catch (err: any) {
      console.error("Supabase insert unexpected error:", err);
      alert(
        err?.message ??
          "予期せぬエラーが発生しました。時間をおいて再度お試しください。"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-root">
      <AppHeader title={replyTo ? "返信を作成" : "投稿を作成"} />

      <main className="app-main compose-main">
        {replyTo && isUuid(replyTo) && (
          <div className="compose-block">
            <p className="compose-block-title">返信モード</p>
            <p className="compose-block-text">この投稿は返信として投稿されます。</p>
          </div>
        )}

        {currentRole === "therapist" && !checkingStatus && !canPost && (
          <div className="compose-block">
            <p className="compose-block-title">
              現在、所属店舗が無いため、投稿機能はご利用いただけません。
            </p>
            <p className="compose-block-text">
              店舗に所属してから、またここでの発信を再開できます。
            </p>
          </div>
        )}

        {currentRole === "therapist" && checkingStatus && (
          <div className="compose-block">
            <p className="compose-block-title">投稿可否を確認しています…</p>
            <p className="compose-block-text">
              少しだけお待ちください。通信状況によって数秒かかることがあります。
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="compose-card">
            <textarea
              className="compose-textarea"
              value={text}
              onChange={handleChange}
              placeholder="いまの気持ちや、残しておきたいことを自由に書いてください"
            />

            {/* 画像ピッカー */}
            <div className="compose-media">
              <div className="compose-media-head">
                <span className="compose-media-label">画像</span>
                <span className="compose-media-sub">
                  {images.length}/{MAX_IMAGES}
                </span>
              </div>

              <div className="compose-media-actions">
                <label className="compose-pick-btn">
                  画像を選ぶ
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onPickImages}
                    style={{ display: "none" }}
                    disabled={images.length >= MAX_IMAGES || submitting || checkingStatus}
                  />
                </label>

                {images.length > 0 && (
                  <button
                    type="button"
                    className="compose-clear-btn"
                    onClick={() => {
                      setImages([]);
                      setImagePreviews((prev) => {
                        prev.forEach((u) => {
                          try {
                            URL.revokeObjectURL(u);
                          } catch {}
                        });
                        return [];
                      });
                    }}
                    disabled={submitting || checkingStatus}
                  >
                    クリア
                  </button>
                )}
              </div>

              {imagePreviews.length > 0 && (
                <div className="compose-preview-grid">
                  {imagePreviews.map((src, idx) => (
                    <div key={idx} className="compose-preview">
                      <img src={src} alt={`preview ${idx + 1}`} />
                      <button
                        type="button"
                        className="compose-remove"
                        onClick={() => removeImageAt(idx)}
                        aria-label="画像を削除"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="compose-footer">
              <span className="compose-count">{remaining}</span>

              <button
                type="submit"
                className="compose-submit"
                disabled={!text.trim() || submitting || checkingStatus || !canPost}
              >
                {submitting ? "送信中…" : replyTo ? "返信する" : "投稿する"}
              </button>
            </div>
          </div>

          {/* 公開範囲・返信可否設定 */}
          <div className="compose-card compose-settings">
            <div className="compose-setting-row">
              <div className="compose-setting-label">公開範囲</div>
              <div className="compose-setting-control compose-visibility-toggle">
                <button
                  type="button"
                  className={
                    visibility === "public"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("public")}
                >
                  公開
                </button>

                <button
                  type="button"
                  className={
                    visibility === "followers"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("followers")}
                >
                  フォロワー
                </button>

                <button
                  type="button"
                  className={
                    visibility === "private"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("private")}
                >
                  非公開
                </button>
              </div>
            </div>

            <div className="compose-setting-row">
              <div className="compose-setting-label">返信</div>
              <div className="compose-setting-control">
                <label className="compose-checkbox-label">
                  <input
                    type="checkbox"
                    checked={canReply}
                    onChange={(e) => setCanReply(e.target.checked)}
                  />
                  <span>この投稿への返信を許可する</span>
                </label>
              </div>
            </div>

            <div className="compose-note">
              ※ 返信可否（canReply）は後のDB対応で保存します（現時点は表示のみ）。
            </div>
          </div>
        </form>
      </main>

      <BottomNav active="compose" hasUnread={hasUnread} />

      <style jsx>{`
        .compose-main {
          padding: 12px 16px 140px;
        }

        .compose-card {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 12px 12px 8px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          margin-top: 12px;
        }

        .compose-textarea {
          width: 100%;
          min-height: 120px;
          border: none;
          outline: none;
          resize: none;
          background: transparent;
          font-size: 14px;
          line-height: 1.6;
        }

        .compose-media {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .compose-media-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }

        .compose-media-label {
          font-size: 12px;
          color: var(--text-sub);
        }

        .compose-media-sub {
          font-size: 11px;
          color: var(--text-sub);
        }

        .compose-media-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .compose-pick-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 6px 12px;
          font-size: 12px;
          background: #fff;
          cursor: pointer;
        }

        .compose-clear-btn {
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          padding: 6px 12px;
          font-size: 12px;
          background: transparent;
          cursor: pointer;
          color: var(--text-sub);
        }

        .compose-preview-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        .compose-preview {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #fafafa;
        }

        .compose-preview img {
          width: 100%;
          height: 140px;
          object-fit: cover;
          display: block;
        }

        .compose-remove {
          position: absolute;
          top: 6px;
          right: 6px;
          border: none;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.55);
          color: #fff;
          cursor: pointer;
          font-size: 16px;
          line-height: 26px;
        }

        .compose-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }

        .compose-count {
          font-size: 11px;
          color: var(--text-sub);
        }

        .compose-submit {
          border-radius: 999px;
          border: none;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 500;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
          cursor: pointer;
        }

        .compose-submit:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .compose-settings {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .compose-setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .compose-setting-label {
          font-size: 13px;
          color: var(--text-sub);
          flex-shrink: 0;
        }

        .compose-setting-control {
          flex: 1;
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }

        .compose-visibility-toggle {
          gap: 6px;
        }

        .toggle-pill {
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 4px 10px;
          font-size: 12px;
          background: #fff;
          cursor: pointer;
        }

        .toggle-pill--active {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }

        .compose-checkbox-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-sub);
        }

        .compose-note {
          font-size: 11px;
          color: var(--text-sub);
          padding-top: 4px;
        }

        .compose-block {
          margin-top: 24px;
          padding: 20px 16px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
        }

        .compose-block-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .compose-block-text {
          font-size: 13px;
          color: var(--muted-foreground);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}