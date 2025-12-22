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
import { resolvePostImageUrl } from "@/lib/postImageStorage";
import { ensureViewerId } from "@/lib/auth";

type AuthorRole = "therapist" | "store" | "user";
type Visibility = "public" | "followers" | "private";

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

  // new
  image_urls: string[] | null;
  visibility: Visibility | null;
};

type ReplyItem = {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
  authorHandle: string | null;
  avatarUrl: string | null;
  profilePath: string | null;
  imageUrls: string[] | null;
};

const hasUnread = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

function normalizeVisibility(v: any): Visibility | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (s === "public" || s === "followers" || s === "private") return s;
  return null;
}

function normalizeAvatarUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

const AVATAR_BUCKET = "avatars";

function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeAvatarUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

type DbPostRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  author_kind: AuthorRole | null;

  image_urls?: string[] | null;
  visibility?: string | null;
  parent_post_id?: string | null;
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

async function resolveAuthor(rawAuthorId: string | null, rawKind: AuthorRole) {
  // users
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

  // therapist/store
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
    canonicalUserId && isUuid(canonicalUserId) ? toPublicHandleFromUserId(canonicalUserId) : null;

  const roleAvatarRaw =
    inferredKind === "therapist"
      ? therapist?.avatar_url ?? null
      : inferredKind === "store"
      ? store?.avatar_url ?? null
      : null;

  const userAvatarRaw = user?.avatar_url ?? null;

  const avatarUrl = resolveAvatarUrl(roleAvatarRaw) ?? resolveAvatarUrl(userAvatarRaw);

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

  return {
    inferredKind,
    canonicalUserId,
    authorName,
    authorHandle,
    avatarUrl,
    profilePath,
  };
}

function visibilityLabel(v: Visibility | null): string | null {
  if (!v || v === "public") return null;
  if (v === "followers") return "フォロワー";
  if (v === "private") return "非公開";
  return null;
}

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params?.id;

  const [post, setPost] = useState<DetailPost | null>(null);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewerUuid, setViewerUuid] = useState<string | null>(null);

  const profileClickable = useMemo(() => !!post?.profile_path, [post?.profile_path]);

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

        // 1) 投稿本体
        const { data: postRow, error: postErr } = await supabase
          .from("posts")
          .select("id, body, created_at, author_id, author_kind, image_urls, visibility")
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

        const author = await resolveAuthor(rawAuthorId ?? null, rawKind);

        if (cancelled) return;

        setPost({
          id: row.id,
          body: row.body ?? "",
          created_at: row.created_at,
          raw_author_id: rawAuthorId ?? null,
          raw_author_kind: rawKind,
          canonical_user_id: author.canonicalUserId,
          author_role: author.inferredKind,
          author_name: author.authorName,
          author_handle: author.authorHandle ?? null,
          avatar_url: author.avatarUrl ?? null,
          profile_path: author.profilePath,
          image_urls: row.image_urls ?? null,
          visibility: normalizeVisibility(row.visibility),
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
  }, [postId]);

  // 返信一覧
  useEffect(() => {
    if (!postId || !isUuid(postId)) return;

    let cancelled = false;

    (async () => {
      setLoadingReplies(true);
      try {
        const { data, error } = await supabase
          .from("posts")
          .select("id, body, created_at, author_id, author_kind, image_urls")
          .eq("parent_post_id", postId)
          .order("created_at", { ascending: true })
          .limit(200);

        if (cancelled) return;

        if (error) {
          console.error("[postDetail.replies] error:", error);
          setReplies([]);
          return;
        }

        const rows = (data ?? []) as DbPostRow[];
        if (!rows.length) {
          setReplies([]);
          return;
        }

        // 返信作者の解決（シンプルに逐次。必要なら後でバッチ最適化）
        const items: ReplyItem[] = [];
        for (const r of rows) {
          const rawAuthorId = r.author_id ?? null;
          const rawKind: AuthorRole = (r.author_kind ?? "user") as AuthorRole;

          const author = await resolveAuthor(rawAuthorId, rawKind);

          items.push({
            id: r.id,
            body: r.body ?? "",
            created_at: r.created_at,
            authorName: author.authorName,
            authorHandle: author.authorHandle ?? null,
            avatarUrl: author.avatarUrl ?? null,
            profilePath: author.profilePath,
            imageUrls: r.image_urls ?? null,
          });
        }

        if (cancelled) return;
        setReplies(items);
      } finally {
        if (!cancelled) setLoadingReplies(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const goToProfile = () => {
    if (!post?.profile_path) return;
    router.push(post.profile_path);
  };

  const visLabel = visibilityLabel(post?.visibility ?? null);

  const resolvedImages =
    (post?.image_urls ?? [])
      .map((raw) => resolvePostImageUrl(raw))
      .filter((u): u is string => !!u) ?? [];

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
          <>
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
                  <div className="post-author-name">
                    {post.author_name}
                    {visLabel && <span className="vis-badge">{visLabel}</span>}
                  </div>

                  {post.author_handle && (
                    <div className="post-author-handle">{post.author_handle}</div>
                  )}

                  <div className="post-time">{timeAgo(post.created_at)}</div>
                </div>
              </div>

              <div className="post-body">
                {post.body.split("\n").map((line, i) => (
                  <p key={i}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
                ))}
              </div>

              {resolvedImages.length > 0 && (
                <div className="post-images">
                  {resolvedImages.map((src, idx) => (
                    <img key={idx} src={src} alt={`post image ${idx + 1}`} />
                  ))}
                </div>
              )}

              <div className="post-actions">
                <button
                  type="button"
                  className="reply-cta"
                  onClick={() => router.push(`/compose?replyTo=${post.id}`)}
                >
                  返信する
                </button>

                {!viewerUuid && (
                  <div className="hint">返信はログイン後に利用できます（投稿は保存されます）。</div>
                )}
              </div>
            </article>

            <section className="replies">
              <div className="replies-head">
                <div className="replies-title">返信</div>
                {loadingReplies && <div className="replies-sub">読み込み中…</div>}
                {!loadingReplies && <div className="replies-sub">{replies.length} 件</div>}
              </div>

              {replies.length === 0 && !loadingReplies && (
                <div className="page-message">まだ返信はありません。</div>
              )}

              {replies.map((r) => {
                const imgs =
                  (r.imageUrls ?? [])
                    .map((raw) => resolvePostImageUrl(raw))
                    .filter((u): u is string => !!u) ?? [];
                const clickable = !!r.profilePath;

                return (
                  <div key={r.id} className="reply-item">
                    <div
                      className="reply-head"
                      onClick={() => {
                        if (clickable) router.push(r.profilePath!);
                      }}
                      style={{ cursor: clickable ? "pointer" : "default" }}
                    >
                      <AvatarCircle size={32} avatarUrl={r.avatarUrl} displayName={r.authorName} alt={r.authorName} />
                      <div className="reply-meta">
                        <div className="reply-name">{r.authorName}</div>
                        {r.authorHandle && <div className="reply-handle">{r.authorHandle}</div>}
                        <div className="reply-time">{timeAgo(r.created_at)}</div>
                      </div>
                    </div>

                    <div className="reply-body">
                      {r.body.split("\n").map((line, i) => (
                        <p key={i}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
                      ))}
                    </div>

                    {imgs.length > 0 && (
                      <div className="reply-images">
                        {imgs.map((src, idx) => (
                          <img key={idx} src={src} alt={`reply image ${idx + 1}`} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </>
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
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vis-badge {
          font-size: 11px;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);
          padding: 2px 8px;
          border-radius: 999px;
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

        .post-images {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }

        .post-images img {
          width: 100%;
          height: 170px;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #fafafa;
          display: block;
        }

        .post-actions {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .reply-cta {
          border: none;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 600;
          background: var(--accent);
          color: #fff;
          cursor: pointer;
        }

        .hint {
          font-size: 11px;
          color: #777;
        }

        .replies {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .replies-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .replies-title {
          font-size: 14px;
          font-weight: 700;
        }

        .replies-sub {
          font-size: 12px;
          color: #777;
        }

        .reply-item {
          padding: 10px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        }

        .reply-head {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .reply-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .reply-name {
          font-size: 13px;
          font-weight: 600;
        }

        .reply-handle {
          font-size: 11px;
          color: #777;
        }

        .reply-time {
          font-size: 11px;
          color: #777;
        }

        .reply-body {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.7;
        }

        .reply-images {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 8px;
        }

        .reply-images img {
          width: 100%;
          height: 140px;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: #fafafa;
          display: block;
        }

        .page-message {
          font-size: 13px;
          color: #777;
          padding: 10px 0;
        }

        .page-error {
          color: #b00020;
        }
      `}</style>
    </div>
  );
}