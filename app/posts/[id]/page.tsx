// app/posts/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";
import { toPublicHandleFromUserId } from "@/lib/handle";
import { ensureViewerId } from "@/lib/auth";

type AuthorRole = "therapist" | "store" | "user";

type DetailPost = {
  id: string;
  body: string;
  created_at: string;

  raw_author_id: string | null;
  raw_author_kind: AuthorRole;

  canonical_user_id: string | null;

  author_role: AuthorRole;
  author_name: string;

  author_handle: string | null;

  avatar_url: string | null;

  profile_path: string | null;

  // ★ 投稿画像（public URLに変換済み）
  image_urls: string[];

  // ★ いいね/返信
  like_count: number;
  reply_count: number;
  liked: boolean;
};

type DbPostRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  author_kind: AuthorRole | null;

  like_count: number | null;
  reply_count: number | null;

  // 正：Storage path配列
  image_paths?: string[] | null;

  // 保険（古い揺れ）
  image_urls?: string[] | null;
  imageUrls?: string[] | null;
};

type DbUserRow = {
  id: string;
  name: string | null;
  role: AuthorRole | null;
  avatar_url: string | null;
};

type DbTherapistLite = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type DbStoreLite = {
  id: string;
  owner_user_id: string | null;
  name: string | null;
  avatar_url: string | null;
};

type DbPostLikeRow = {
  post_id: string;
};

const hasUnread = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function normalizeUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * avatars bucket
 */
const AVATAR_BUCKET = "avatars";

/**
 * avatar_url が
 * - https://... ならそのまま
 * - それ以外（storage path）なら public URL に変換
 */
function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * post-images bucket
 */
const POST_IMAGES_BUCKET = "post-images";

/**
 * 投稿画像を「表示用 public URL 配列」に正規化
 * - http(s) はそのまま
 * - storage path は post-images の public URL に変換
 * - "post-images/xxx" のような値でも耐える
 * - 最大4枚
 */
function resolvePostImageUrls(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];

  for (const v of arr) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;

    // すでにURLならそのまま
    if (isProbablyHttpUrl(s)) {
      out.push(s);
      if (out.length >= 4) break;
      continue;
    }

    // "post-images/xxx/yyy.jpg" でも耐える
    const path = s.startsWith(`${POST_IMAGES_BUCKET}/`)
      ? s.slice(POST_IMAGES_BUCKET.length + 1)
      : s;

    const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path);
    const url = data?.publicUrl ?? "";

    if (url && isProbablyHttpUrl(url)) {
      out.push(url);
      if (out.length >= 4) break;
    }
  }

  return out;
}

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params?.id;

  const [viewerUuid, setViewerUuid] = useState<string | null>(null);

  const [post, setPost] = useState<DetailPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const profileClickable = useMemo(
    () => !!post?.profile_path,
    [post?.profile_path]
  );

  const viewerReady = !!viewerUuid && isUuid(viewerUuid);

  // viewerUuid（uuidのみ）確定
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

  // 投稿詳細ロード
  useEffect(() => {
    if (!postId) return;

    if (!isUuid(postId)) {
      setError("不正な投稿IDです。");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: postRow, error: postErr } = await supabase
          .from("posts")
          .select(
            "id, body, created_at, author_id, author_kind, like_count, reply_count, image_paths"
          )
          .eq("id", postId)
          .maybeSingle();

        if (cancelled) return;

        if (postErr || !postRow) {
          console.error("[postDetail.posts] error:", postErr);
          setError("投稿が見つかりませんでした。");
          setLoading(false);
          return;
        }

        const row = postRow as DbPostRow;
        const rawAuthorId = row.author_id;
        const rawKind: AuthorRole = (row.author_kind ?? "user") as AuthorRole;

        // like済み判定（ログイン時のみ）
        let liked = false;
        if (viewerUuid && isUuid(viewerUuid)) {
          const { data: likeRow, error: likeErr } = await supabase
            .from("post_likes")
            .select("post_id")
            .eq("user_id", viewerUuid)
            .eq("post_id", row.id)
            .maybeSingle<DbPostLikeRow>();

          if (likeErr) {
            console.error("[postDetail.post_likes] error:", likeErr);
          } else {
            liked = !!likeRow;
          }
        }

        // user / therapist / store 解決
        let user: DbUserRow | null = null;
        if (rawAuthorId && isUuid(rawAuthorId)) {
          const { data: userRow, error: userErr } = await supabase
            .from("users")
            .select("id, name, role, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();

          if (userErr) console.error("[postDetail.users] error:", userErr);
          if (userRow) user = userRow as DbUserRow;
        }

        let therapist: DbTherapistLite | null = null;
        let store: DbStoreLite | null = null;

        if (rawAuthorId) {
          const { data: tById } = await supabase
            .from("therapists")
            .select("id, user_id, display_name, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();
          if (tById) therapist = tById as DbTherapistLite;

          if (!therapist && isUuid(rawAuthorId)) {
            const { data: tByUser } = await supabase
              .from("therapists")
              .select("id, user_id, display_name, avatar_url")
              .eq("user_id", rawAuthorId)
              .maybeSingle();
            if (tByUser) therapist = tByUser as DbTherapistLite;
          }

          const { data: sById } = await supabase
            .from("stores")
            .select("id, owner_user_id, name, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();
          if (sById) store = sById as DbStoreLite;

          if (!store && isUuid(rawAuthorId)) {
            const { data: sByOwner } = await supabase
              .from("stores")
              .select("id, owner_user_id, name, avatar_url")
              .eq("owner_user_id", rawAuthorId)
              .maybeSingle();
            if (sByOwner) store = sByOwner as DbStoreLite;
          }
        }

        const inferredKind: AuthorRole = therapist
          ? "therapist"
          : store
          ? "store"
          : (user?.role ?? rawKind ?? "user");

        let canonicalUserId: string | null = null;
        if (inferredKind === "therapist") canonicalUserId = therapist?.user_id ?? null;
        else if (inferredKind === "store") canonicalUserId = store?.owner_user_id ?? null;
        else canonicalUserId = user?.id ?? (isUuid(rawAuthorId) ? rawAuthorId : null);

        if (!user && canonicalUserId && isUuid(canonicalUserId)) {
          const { data: userRow } = await supabase
            .from("users")
            .select("id, name, role, avatar_url")
            .eq("id", canonicalUserId)
            .maybeSingle();
          if (userRow) user = userRow as DbUserRow;
        }

        const roleName =
          inferredKind === "therapist"
            ? (therapist?.display_name ?? "").trim() || null
            : inferredKind === "store"
            ? (store?.name ?? "").trim() || null
            : null;

        const authorName =
          roleName ||
          ((user?.name ?? "").trim() || null) ||
          (inferredKind === "store"
            ? "店舗アカウント"
            : inferredKind === "therapist"
            ? "セラピスト"
            : "名無し");

        const authorHandle =
          canonicalUserId && isUuid(canonicalUserId)
            ? toPublicHandleFromUserId(canonicalUserId)
            : null;

        const roleAvatarRaw =
          inferredKind === "therapist"
            ? therapist?.avatar_url ?? null
            : inferredKind === "store"
            ? store?.avatar_url ?? null
            : null;

        const userAvatarRaw = user?.avatar_url ?? null;
        const avatarUrl =
          resolveAvatarUrl(roleAvatarRaw) ?? resolveAvatarUrl(userAvatarRaw) ?? null;

        let profilePath: string | null = null;
        if (inferredKind === "therapist") {
          profilePath = therapist?.id ? `/therapist/${therapist.id}` : null;
          if (!profilePath && canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        } else if (inferredKind === "store") {
          profilePath = store?.id ? `/store/${store.id}` : null;
          if (!profilePath && canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        } else {
          if (canonicalUserId) profilePath = `/mypage/${canonicalUserId}`;
        }

        // 画像：image_paths を正としてURL配列に変換
        const rawImages =
          (row as any).image_paths ?? (row as any).image_urls ?? (row as any).imageUrls ?? null;
        const imageUrls = resolvePostImageUrls(rawImages);

        if (cancelled) return;

        setPost({
          id: row.id,
          body: row.body ?? "",
          created_at: row.created_at,
          raw_author_id: rawAuthorId ?? null,
          raw_author_kind: rawKind,
          canonical_user_id: canonicalUserId,
          author_role: inferredKind,
          author_name: authorName,
          author_handle: authorHandle ?? null,
          avatar_url: avatarUrl,
          profile_path: profilePath,
          image_urls: imageUrls,
          like_count: row.like_count ?? 0,
          reply_count: row.reply_count ?? 0,
          liked,
        });

        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error("post detail error:", e);
        setError(e?.message ?? "読み込み中にエラーが発生しました");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, viewerUuid]);

  const goToProfile = () => {
    if (!post?.profile_path) return;
    router.push(post.profile_path);
  };

  const handleToggleLike = async () => {
    if (!post) return;
    if (!viewerUuid || !isUuid(viewerUuid)) return;

    const previousLiked = post.liked;
    const previousCount = post.like_count;

    // 楽観更新
    setPost((prev) =>
      prev
        ? {
            ...prev,
            liked: !previousLiked,
            like_count: previousCount + (!previousLiked ? 1 : -1),
          }
        : prev
    );

    try {
      if (!previousLiked) {
        const { error: likeError } = await supabase
          .from("post_likes")
          .insert([{ post_id: post.id, user_id: viewerUuid }]);
        if (likeError) throw likeError;

        const { error: updateError } = await supabase
          .from("posts")
          .update({ like_count: previousCount + 1 })
          .eq("id", post.id);
        if (updateError) throw updateError;
      } else {
        const { error: deleteError } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", viewerUuid);
        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
          .from("posts")
          .update({ like_count: Math.max(previousCount - 1, 0) })
          .eq("id", post.id);
        if (updateError) throw updateError;
      }
    } catch (e: any) {
      console.error("Supabase like toggle error:", e);

      // ロールバック
      setPost((prev) =>
        prev ? { ...prev, liked: previousLiked, like_count: previousCount } : prev
      );

      alert(
        e?.message ??
          "いいねの反映中にエラーが発生しました。時間をおいて再度お試しください。"
      );
    }
  };

  const handleReply = () => {
    // 返信機能は今後実装（Homeと同じ暫定）
    alert("返信機能はこれから実装予定です（現在はテスト用です）。");
  };

  return (
    <div className="page-root">
      <AppHeader title="投稿" />

      <main className="page-main">
        <button type="button" className="back-btn" onClick={() => router.back()}>
          ← 戻る
        </button>

        {loading && <div className="page-message">読み込み中…</div>}
        {error && <div className="page-message page-error">{error}</div>}

        {!loading && post && (
          <article className="post-detail">
            <div
              className="post-header"
              role={profileClickable ? "button" : undefined}
              tabIndex={profileClickable ? 0 : -1}
              aria-label={profileClickable ? "投稿者プロフィールを見る" : undefined}
              onClick={() => {
                if (!profileClickable) return;
                goToProfile();
              }}
              onKeyDown={(e) => {
                if (!profileClickable) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goToProfile();
                }
              }}
              style={{ cursor: profileClickable ? "pointer" : "default" }}
            >
              <AvatarCircle
                size={40}
                avatarUrl={post.avatar_url}
                displayName={post.author_name}
                alt={post.author_name}
              />

              <div className="post-author">
                <div className="post-author-name">{post.author_name}</div>
                {post.author_handle && (
                  <div className="post-author-handle">{post.author_handle}</div>
                )}
                <div className="post-time">{timeAgo(post.created_at)}</div>
              </div>
            </div>

            {/* ★ 画像ギャラリー（Homeと同じ発想：URL配列） */}
            {post.image_urls.length > 0 && (
              <div
                className={`media-grid media-grid--${post.image_urls.length}`}
                aria-label="投稿画像"
              >
                {post.image_urls.map((url, idx) => (
                  <a
                    key={`${post.id}_${idx}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="media-tile"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="投稿画像" loading="lazy" decoding="async" />
                  </a>
                ))}
              </div>
            )}

            <div className="post-body">
              {post.body.split("\n").map((line, i) => (
                <p key={i}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
              ))}
            </div>

            {/* ★ いいね/返信（Home同等） */}
            <div className="post-footer">
              <button
                type="button"
                className={`post-like-btn ${post.liked ? "liked" : ""}`}
                disabled={!viewerReady}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleToggleLike();
                }}
              >
                <span className="post-like-icon">♥</span>
                <span className="post-like-count">{post.like_count}</span>
              </button>

              <button
                type="button"
                className="post-reply-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReply();
                }}
              >
                <span className="post-reply-icon">💬</span>
                <span className="post-reply-count">{post.reply_count}</span>
              </button>

              {!viewerReady && (
                <div className="post-footer-note">
                  いいね・通報・返信はログイン後に利用できます。
                </div>
              )}
            </div>
          </article>
        )}
      </main>

      <BottomNav active="home" hasUnread={hasUnread} />

      <style jsx>{`
        .page-root {
          min-height: 100vh;
          background: var(--background, #ffffff);
          color: var(--foreground, #171717);
          display: flex;
          flex-direction: column;
        }

        .page-main {
          padding: 16px;
          padding-bottom: 64px;
        }

        .back-btn {
          border: none;
          background: transparent;
          padding: 6px 0;
          font-size: 13px;
          color: #555;
          cursor: pointer;
        }

        .post-detail {
          margin-top: 8px;
        }

        .post-header {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
          border-radius: 10px;
          padding: 6px 4px;
        }

        .post-header:focus {
          outline: 2px solid rgba(0, 0, 0, 0.18);
          outline-offset: 2px;
        }

        .post-author-name {
          font-weight: 600;
          font-size: 14px;
        }

        .post-author-handle {
          font-size: 12px;
          color: #777;
          margin-top: 2px;
        }

        .post-time {
          font-size: 12px;
          color: #777;
          margin-top: 2px;
        }

        .post-body {
          font-size: 14px;
          line-height: 1.8;
          margin-top: 10px;
        }

        .page-message {
          font-size: 13px;
          color: #777;
          padding: 10px 0;
        }

        .page-error {
          color: #b00020;
        }

        /* =========================
           画像グリッド（Homeと同等）
           ========================= */
        .media-grid {
          margin-top: 10px;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #f6f6f6;
          display: grid;
          gap: 2px;
        }

        .media-grid--1 {
          grid-template-columns: 1fr;
        }
        .media-grid--2 {
          grid-template-columns: 1fr 1fr;
        }
        .media-grid--3 {
          grid-template-columns: 1fr 1fr;
        }
        .media-grid--4 {
          grid-template-columns: 1fr 1fr;
        }

        .media-tile {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          background: #eee;
          display: block;
        }

        .media-tile img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* =========================
           フッター（いいね/返信）
           ========================= */
        .post-footer {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }

        .post-like-btn,
        .post-reply-btn {
          border: none;
          background: transparent;
          padding: 2px 4px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-sub, #777777);
          cursor: pointer;
        }

        .post-like-btn:disabled,
        .post-reply-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .post-like-btn.liked .post-like-icon {
          color: #e0245e;
        }

        .post-footer-note {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-sub, #777);
        }
      `}</style>
    </div>
  );
}