// app/posts/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/timeAgo";
import { getCurrentUserId } from "@/lib/auth";

type Params = {
  id: string;
};

type AuthorRole = "therapist" | "store" | "user";

type DetailPost = {
  id: string;
  body: string;
  area: string | null;
  created_at: string;
  author_name: string;
  author_role: AuthorRole;
};

const hasUnread = true;

export default function PostDetailPage({ params }: { params: Params }) {
  const router = useRouter();
  const [post, setPost] = useState<DetailPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // BottomNav 用 currentUserId 初期化
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = getCurrentUserId();
    setCurrentUserId(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) posts から1件
        const { data, error } = await supabase
          .from("posts")
          .select("id, body, area, created_at, author_id, author_kind")
          .eq("id", params.id)
          .maybeSingle();

        if (error) {
          console.error("post detail error:", error);
          setError(error.message ?? "投稿の取得に失敗しました");
          setLoading(false);
          return;
        }
        if (!data) {
          setError("この投稿は見つかりませんでした。");
          setLoading(false);
          return;
        }

        const row = data as any;

        // 2) users で名前を取得（あれば）
        let authorName = "名無し";
        let authorRole: AuthorRole = (row.author_kind as AuthorRole) ?? "user";

        if (row.author_id) {
          const { data: user, error: userErr } = await supabase
            .from("users")
            .select("name, role")
            .eq("id", row.author_id)
            .maybeSingle();

          if (!userErr && user) {
            authorName = user.name ?? authorName;
            if (user.role) {
              authorRole = (user.role as AuthorRole) ?? authorRole;
            }
          }
        }

        setPost({
          id: row.id,
          body: row.body ?? "",
          area: row.area,
          created_at: row.created_at,
          author_name: authorName,
          author_role: authorRole,
        });
        setLoading(false);
      } catch (e: any) {
        console.error("post detail unexpected error:", e);
        setError(e?.message ?? "不明なエラーが発生しました");
        setLoading(false);
      }
    };

    load();
  }, [params.id]);

  return (
    <div className="page-root">
      <AppHeader title="投稿の詳細" />
      <main className="page-main">
        {loading && <p className="detail-message">読み込み中です…</p>}
        {error && (
          <p className="detail-message detail-error">{error}</p>
        )}

        {post && !loading && !error && (
          <article className="detail-card">
            <header className="detail-header">
              <div className="detail-author">
                <span className="detail-author-name">
                  {post.author_name}
                </span>
                {post.author_role === "therapist" && (
                  <span className="badge-gold">✦</span>
                )}
                {post.author_role === "store" && (
                  <span className="badge-gold">🏛</span>
                )}
              </div>
              <div className="detail-meta">
                {post.area && (
                  <>
                    <span className="detail-area">{post.area}</span>
                    <span className="post-dot">・</span>
                  </>
                )}
                <span className="detail-time">
                  {timeAgo(post.created_at)}
                </span>
              </div>
            </header>

            <div className="detail-body">
              {post.body.split("\n").map((line, idx) => (
                <p key={idx}>
                  {line || <span style={{ opacity: 0.3 }}>　</span>}
                </p>
              ))}
            </div>

            <button
              type="button"
              className="detail-back-btn"
              onClick={() => router.back()}
            >
              タイムラインに戻る
            </button>
          </article>
        )}
      </main>

      <BottomNav
        active="home"
        hasUnread={hasUnread}
      />

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

        .detail-message {
          font-size: 13px;
          color: var(--text-sub, #777);
        }

        .detail-error {
          color: #b00020;
        }

        .detail-card {
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          padding: 14px 16px;
          background: #fff;
        }

        .detail-header {
          margin-bottom: 8px;
        }

        .detail-author {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .detail-author-name {
          font-weight: 600;
          font-size: 14px;
        }

        .detail-meta {
          font-size: 11px;
          color: var(--text-sub, #777);
          margin-top: 2px;
        }

        .detail-body {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 8px;
          margin-bottom: 12px;
        }

        .detail-back-btn {
          font-size: 13px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fafafa;
        }
      `}</style>
    </div>
  );
}