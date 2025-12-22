// app/compose/page.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  ChangeEvent,
  FormEvent,
  Suspense,
} from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserRole, ensureViewerId } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

// 静的プリレンダーを避ける（CSR要素が多いページなので安全）
export const dynamic = "force-dynamic";

const MAX_LENGTH = 280;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB/枚（安全側の上限。必要なら調整）

type AuthorRole = "therapist" | "store" | "user";

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

const POST_IMAGES_BUCKET = "post-images";

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

function extFromFile(file: File): string {
  const name = (file.name || "").toLowerCase();
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m?.[1]) return m[1];
  // contentType fallback
  const t = (file.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  return "bin";
}

function sanitizeFileNamePart(s: string): string {
  return (s || "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60);
}

async function uploadImagesOrThrow(
  viewerUuid: string,
  images: SelectedImage[]
): Promise<string[]> {
  // upload paths (bucket内path) を返す
  const uploaded: string[] = [];

  try {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const ext = extFromFile(img.file);
      const base = sanitizeFileNamePart(img.file.name.replace(/\.[^/.]+$/, ""));
      const ts = Date.now();
      const path = `${viewerUuid}/${ts}_${i}_${base}.${ext}`;

      const { error } = await supabase.storage
        .from(POST_IMAGES_BUCKET)
        .upload(path, img.file, {
          cacheControl: "3600",
          upsert: false,
          contentType: img.file.type || undefined,
        });

      if (error) {
        console.error("[post-images.upload] error:", error);
        throw new Error(
          (error as any)?.message ?? "画像アップロードに失敗しました"
        );
      }

      uploaded.push(path);
    }

    return uploaded;
  } catch (e) {
    // 途中まで上がったものは削除（ベストエフォート）
    if (uploaded.length) {
      await Promise.all(
        uploaded.map((p) =>
          supabase.storage.from(POST_IMAGES_BUCKET).remove([p])
        )
      ).catch(() => {});
    }
    throw e;
  }
}

function ComposeInner() {
  const hasUnread = false;

  // role はUI用（投稿のauthor_kindにも使う）
  const currentRole = getCurrentUserRole(); // "user" | "therapist" | "store" | "guest"

  const [viewerUuid, setViewerUuid] = useState<string | null>(null);
  const viewerReady = useMemo(() => !!viewerUuid && isUuid(viewerUuid), [viewerUuid]);

  // 「投稿可能か」の状態をここで一元管理
  const [canPost, setCanPost] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(false);

  const [text, setText] = useState("");
  const remaining = MAX_LENGTH - text.length;

  // まだDBカラムを作っていない前提：UIだけ残す（将来反映）
  const [visibility, setVisibility] = useState<"public" | "limited">("public");
  const [canReply, setCanReply] = useState(true);

  // 画像
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<SelectedImage[]>([]);

  const [submitting, setSubmitting] = useState(false);

  // 1) ログインuuidを確定（未ログインなら null）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const uid = await ensureViewerId(); // uuid or null
        if (cancelled) return;
        setViewerUuid(uid);
      } catch (e) {
        if (cancelled) return;
        setViewerUuid(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) ロールに応じて投稿可否（セラピストのみ store_id を確認）
  useEffect(() => {
    // 未ログインは投稿不可（要件）
    if (!viewerReady) {
      setCanPost(false);
      setCheckingStatus(false);
      return;
    }

    // therapist 以外は今のところ制限なし（ログイン済み前提）
    if (currentRole !== "therapist") {
      setCanPost(true);
      setCheckingStatus(false);
      return;
    }

    // セラピストのみ所属チェック
    let cancelled = false;

    const checkTherapistStoreLink = async () => {
      try {
        setCheckingStatus(true);

        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, store_id")
          .eq("user_id", viewerUuid)
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
  }, [currentRole, viewerReady, viewerUuid]);

  // 画像のプレビューURLは解除する
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickImages = () => {
    if (!viewerReady) {
      alert("画像投稿はログイン後に利用できます。");
      return;
    }
    fileInputRef.current?.click();
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 同じファイルを再選択できるようにクリア

    if (!files.length) return;

    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) {
      alert(`画像は最大${MAX_IMAGES}枚までです。`);
      return;
    }

    const accepted: SelectedImage[] = [];
    for (const f of files.slice(0, remainingSlots)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_IMAGE_BYTES) {
        alert(`画像サイズが大きすぎます（最大 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB）。`);
        continue;
      }
      const previewUrl = URL.createObjectURL(f);
      accepted.push({
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        file: f,
        previewUrl,
      });
    }

    if (!accepted.length) return;
    setImages((prev) => [...prev, ...accepted]);
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const handleChangeText = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next.length <= MAX_LENGTH) setText(next);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const body = text.trim();
    if (!body) return;

    if (!viewerReady) {
      alert("投稿はログイン後に利用できます。");
      return;
    }

    if (!canPost) {
      alert("現在、投稿はできません（所属状態をご確認ください）。");
      return;
    }

    // author_kind は role ベース（ログイン前提）
    const authorKind: AuthorRole =
      currentRole === "therapist" || currentRole === "store" || currentRole === "user"
        ? (currentRole as AuthorRole)
        : "user";

    try {
      setSubmitting(true);

      // 1) 画像があるなら Storage upload
      let imagePaths: string[] = [];
      if (images.length) {
        imagePaths = await uploadImagesOrThrow(viewerUuid!, images);
      }

      // 2) posts insert
      const { error } = await supabase.from("posts").insert([
        {
          body,
          author_id: viewerUuid, // ログインユーザーのみ
          author_kind: authorKind,
          image_paths: imagePaths.length ? imagePaths : null,
          // NOTE:
          // visibility / can_reply をDBに入れるなら、posts側にカラム追加後にここを復帰
          // visibility,
          // can_reply: canReply,
        },
      ]);

      if (error) {
        console.error("Supabase insert error:", error);
        alert(
          (error as any)?.message ??
            "投稿の保存中にエラーが発生しました。時間をおいて再度お試しください。"
        );
        return;
      }

      alert("投稿を公開しました。ホームのタイムラインに反映されます。");

      // reset
      setText("");
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setImages([]);

      if (typeof window !== "undefined") window.location.href = "/";
    } catch (err: any) {
      console.error("Compose submit error:", err);
      alert(err?.message ?? "投稿中にエラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const disabled =
    submitting || checkingStatus || !viewerReady || !canPost;

  return (
    <div className="app-root">
      <AppHeader title="投稿を作成" />

      <main className="app-main compose-main">
        {/* 未ログイン案内（要件） */}
        {!viewerReady && (
          <div className="compose-block">
            <p className="compose-block-title">画像投稿・投稿機能はログイン後に利用できます。</p>
            <p className="compose-block-text">
              まずはログインしてください。
            </p>
          </div>
        )}

        {/* セラピストで、所属なしのときの案内 */}
        {viewerReady && currentRole === "therapist" && !checkingStatus && !canPost && (
          <div className="compose-block">
            <p className="compose-block-title">
              現在、所属店舗が無いため、投稿機能はご利用いただけません。
            </p>
            <p className="compose-block-text">
              店舗に所属してから、またここでの発信を再開できます。
            </p>
          </div>
        )}

        {/* ステータス判定中 */}
        {viewerReady && currentRole === "therapist" && checkingStatus && (
          <div className="compose-block">
            <p className="compose-block-title">投稿可否を確認しています…</p>
            <p className="compose-block-text">
              通信状況によって数秒かかることがあります。
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 投稿テキスト */}
          <div className="compose-card">
            <textarea
              className="compose-textarea"
              value={text}
              onChange={handleChangeText}
              placeholder="いまの気持ちや、残しておきたいことを自由に書いてください"
              disabled={!viewerReady}
            />

            {/* 画像ピッカー */}
            <div className="compose-images">
              <div className="compose-images-head">
                <div className="compose-images-title">
                  画像（最大{MAX_IMAGES}枚）
                </div>

                <button
                  type="button"
                  className="compose-image-add"
                  onClick={pickImages}
                  disabled={!viewerReady || images.length >= MAX_IMAGES}
                >
                  ＋ 画像を追加
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onPickFiles}
                  style={{ display: "none" }}
                />
              </div>

              {images.length > 0 && (
                <div className="compose-image-grid">
                  {images.map((img) => (
                    <div key={img.id} className="compose-image-item">
                      <img
                        src={img.previewUrl}
                        alt="選択した画像"
                        className="compose-image-thumb"
                      />
                      <button
                        type="button"
                        className="compose-image-remove"
                        onClick={() => removeImage(img.id)}
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
                disabled={!text.trim() || disabled}
              >
                {submitting ? "送信中…" : "投稿する"}
              </button>
            </div>

            {!viewerReady && (
              <div className="compose-hint">投稿はログイン後に利用できます。</div>
            )}
          </div>

          {/* 公開範囲・返信可否設定（現状はUIのみ） */}
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
                  みんなに公開
                </button>

                <button
                  type="button"
                  className={
                    visibility === "limited"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("limited")}
                >
                  一部だけ
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
              ※ 公開範囲・返信設定は、次フェーズでDBに反映します（今はUIのみ）。
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
          padding: 12px 12px 10px;
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

        .compose-images {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .compose-images-head {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .compose-images-title {
          font-size: 12px;
          color: var(--text-sub);
          flex: 1;
        }

        .compose-image-add {
          border-radius: 999px;
          border: 1px solid var(--border);
          background: #fff;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
        }

        .compose-image-add:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .compose-image-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 10px;
        }

        .compose-image-item {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: #fff;
          aspect-ratio: 1 / 1;
        }

        .compose-image-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .compose-image-remove {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: none;
          background: rgba(0, 0, 0, 0.55);
          color: #fff;
          cursor: pointer;
          line-height: 22px;
          font-size: 14px;
        }

        .compose-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
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

        .compose-hint {
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-sub);
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
          padding-top: 6px;
        }

        .compose-block {
          margin-top: 12px;
          padding: 18px 16px;
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

export default function ComposePage() {
  // AppHeader / BottomNav 内部に useSearchParams が居てもビルドで落ちないように、ページ直下で Suspense
  return (
    <Suspense fallback={<div style={{ padding: 16, fontSize: 13 }}>読み込み中…</div>}>
      <ComposeInner />
    </Suspense>
  );
}