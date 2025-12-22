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

  // posts.author_id は users.id / therapists.id / stores.id の可能性がある
  raw_author_id: string | null;
  raw_author_kind: AuthorRole;

  // relations/filter等に合わせた users.id（uuid）へ正規化した author
  canonical_user_id: string | null;

  author_role: AuthorRole;
  author_name: string;

  // ★ 追加：@xxxxxx 表示用
  author_handle: string | null;

  avatar_url: string | null;

  // プロフィール先
  profile_path: string | null;
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

type DbPostRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string | null;
  author_kind: AuthorRole | null;
};

type DbUserRow = {
  id: string;
  name: string | null;
  role: AuthorRole | null;
  avatar_url: string | null;
};

type DbTherapistLite = {
  id: string; // therapists.id
  user_id: string | null; // users.id
  display_name: string | null;
  avatar_url: string | null;
};

type DbStoreLite = {
  id: string; // stores.id
  owner_user_id: string | null; // users.id
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

        // 1) 投稿本体
        const { data: postRow, error: postErr } = await supabase
          .from("posts")
          .select("id, body, created_at, author_id, author_kind")
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

        // 2) まず users を引けるなら引く（posts.author_id が users.id の場合）
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

        // 3) therapist/store を「id経由」「user_id/owner_user_id経由」で両方拾う
        let therapist: DbTherapistLite | null = null;
        let store: DbStoreLite | null = null;

        if (rawAuthorId) {
          // therapists by id
          const { data: tById } = await supabase
            .from("therapists")
            .select("id, user_id, display_name, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();

          if (tById) therapist = tById as DbTherapistLite;

          // therapists by user_id（rawAuthorId が users.id の場合）
          if (!therapist && isUuid(rawAuthorId)) {
            const { data: tByUser } = await supabase
              .from("therapists")
              .select("id, user_id, display_name, avatar_url")
              .eq("user_id", rawAuthorId)
              .maybeSingle();
            if (tByUser) therapist = tByUser as DbTherapistLite;
          }

          // stores by id
          const { data: sById } = await supabase
            .from("stores")
            .select("id, owner_user_id, name, avatar_url")
            .eq("id", rawAuthorId)
            .maybeSingle();

          if (sById) store = sById as DbStoreLite;

          // stores by owner_user_id（rawAuthorId が users.id の場合）
          if (!store && isUuid(rawAuthorId)) {
            const { data: sByOwner } = await supabase
              .from("stores")
              .select("id, owner_user_id, name, avatar_url")
              .eq("owner_user_id", rawAuthorId)
              .maybeSingle();
            if (sByOwner) store = sByOwner as DbStoreLite;
          }
        }

        // 4) author_kind が空/不整合でも、拾えたロールで補正
        const inferredKind: AuthorRole = therapist
          ? "therapist"
          : store
          ? "store"
          : (user?.role ?? rawKind ?? "user");

        // 5) canonical users.id を確定（mute/block の前提）
        let canonicalUserId: string | null = null;
        if (inferredKind === "therapist") canonicalUserId = therapist?.user_id ?? null;
        else if (inferredKind === "store") canonicalUserId = store?.owner_user_id ?? null;
        else canonicalUserId = user?.id ?? (isUuid(rawAuthorId) ? rawAuthorId : null);

        // canonicalUserId が取れたなら users を再取得して情報を確実化
        if (!user && canonicalUserId && isUuid(canonicalUserId)) {
          const { data: userRow } = await supabase
            .from("users")
            .select("id, name, role, avatar_url")
            .eq("id", canonicalUserId)
            .maybeSingle();
          if (userRow) user = userRow as DbUserRow;
        }

        // 6) author 表示名
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

        // ★ 追加：@handle（canonical users.id から @6桁）
        const authorHandle =
          canonicalUserId && isUuid(canonicalUserId)
            ? toPublicHandleFromUserId(canonicalUserId)
            : null;

        // 7) avatar（role優先 → users）
        const roleAvatarRaw =
          inferredKind === "therapist"
            ? therapist?.avatar_url ?? null
            : inferredKind === "store"
            ? store?.avatar_url ?? null
            : null;

        const userAvatarRaw = user?.avatar_url ?? null;

        const avatarUrl =
          resolveAvatarUrl(roleAvatarRaw) ?? resolveAvatarUrl(userAvatarRaw);

        // 8) profile path（role id を優先）
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

                {/* ★ 追加：名前の下に @xxxxxx（その下に timeAgo） */}
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
      `}</style>
    </div>
  );
}