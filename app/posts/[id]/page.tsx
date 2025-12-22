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

  // ★ 追加
  image_paths: string[] | null;
};

const hasUnread = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
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

// ★ post-images のURL解決
const POST_IMAGES_BUCKET = "post-images";
function resolvePostImageUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;
  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(v);
  return data?.publicUrl ?? null;
}

type DbPostRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  author_kind: AuthorRole | null;

  // ★ 追加
  image_paths: string[] | null;
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

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params?.id;

  const [post, setPost] = useState<DetailPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const profileClickable = useMemo(
    () => !!post?.profile_path,
    [post?.profile_path]
  );

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
          .select("id, body, created_at, author_id, author_kind, image_paths")
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
          resolveAvatarUrl(roleAvatarRaw) ?? resolveAvatarUrl(userAvatarRaw);

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
          avatar_url: avatarUrl ?? null,
          profile_path: profilePath,
          image_paths: row.image_paths ?? null,
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

  const goToProfile = () => {
    if (!post?.profile_path) return;
    router.push(post.profile_path);
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

            {/* ★ 画像ギャラリー */}
            {Array.isArray(post.image_paths) && post.image_paths.length > 0 && (
              <div className="post-images">
                {post.image_paths.map((p, idx) => {
                  const url = resolvePostImageUrl(p);
                  if (!url) return null;
                  return (
                    <a
                      key={`${p}_${idx}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="post-image-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img src={url} alt="投稿画像" className="post-image" />
                    </a>
                  );
                })}
              </div>
            )}

            <div className="post-body">
              {post.body.split("\n").map((line, i) => (
                <p key={i}>{line || <span style={{ opacity: 0.3 }}>　</span>}</p>
              ))}
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

        .post-images {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin: 10px 0 6px;
        }

        .post-image-link {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.06);
          display: block;
          background: #fff;
        }

        .post-image {
          width: 100%;
          height: 180px;
          object-fit: cover;
          display: block;
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
      `}</style>
    </div>
  );
}