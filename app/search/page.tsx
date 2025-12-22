// app/search/page.tsx
"use client";

import React, { useMemo, useState, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import { supabase } from "@/lib/supabaseClient";

type SearchFilter = "all" | "therapist" | "store" | "user" | "post";

/** ---------- Hit types ---------- */
type StoreHit = {
  kind: "store";
  id: string;
  name: string;
  area: string | null;
  avatar_url: string | null; // raw (http or storage path)
};

type TherapistHit = {
  kind: "therapist";
  id: string;
  display_name: string;
  area: string | null;
  avatar_url: string | null; // raw (http or storage path)
};

type UserHit = {
  kind: "user";
  id: string;
  name: string;
  role: string; // text NOT NULL
  area: string | null;
  avatar_url: string | null; // raw (http or storage path)
};

type PostAuthorKind = "user" | "therapist" | "store" | string;

type PostHit = {
  kind: "post";
  id: string;
  body: string;
  created_at: string;
  like_count: number;
  reply_count: number;

  author_id: string;
  author_kind: PostAuthorKind;

  // resolved for display
  author_name: string;
  author_avatar_url: string | null;
};

type Hit = StoreHit | TherapistHit | UserHit | PostHit;

/** ---------- helpers ---------- */
function normalizeKeyword(s: string) {
  return (s ?? "").trim();
}

// Supabase の ilike 用に %...% を作る（% や _ はエスケープ）
function toILikePattern(keyword: string) {
  const escaped = keyword.replace(/[%_]/g, "\\$&");
  return `%${escaped}%`;
}

function normalizeAvatarUrl(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function isProbablyHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * ★ avatars bucket
 */
const AVATAR_BUCKET = "avatars";

/**
 * avatar_url が
 * - https://... ならそのまま
 * - それ以外（storage path）なら public URL に変換
 */
function resolveAvatarUrl(raw: string | null | undefined): string | null {
  const v = normalizeAvatarUrl(raw);
  if (!v) return null;
  if (isProbablyHttpUrl(v)) return v;

  // "avatars/xxx.png" のような場合にも対応（先頭の "avatars/" を外す）
  const path = v.startsWith(`${AVATAR_BUCKET}/`)
    ? v.slice(AVATAR_BUCKET.length + 1)
    : v;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * UUID っぽいか（完全一致でなくても “id検索” を併用する判断材料）
 */
function looksLikeUuidish(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  // 8-4-4-4-12 を想定（完全一致）
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t))
    return true;
  // ハイフンなし（短縮含む）も "uuid-ish" として扱う
  if (/^[0-9a-f]{6,32}$/i.test(t)) return true;
  return false;
}

function snippet(text: string, max = 80): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

/**
 * posts の author をまとめて解決する（N+1回避）
 */
async function resolvePostAuthors(
  rows: Array<{
    author_id: any;
    author_kind: any;
  }>
): Promise<
  Map<
    string,
    {
      author_name: string;
      author_avatar_url: string | null;
    }
  >
> {
  const keysUser = new Set<string>();
  const keysTherapist = new Set<string>();
  const keysStore = new Set<string>();

  for (const r of rows) {
    const id = String(r.author_id || "");
    const kind = String(r.author_kind || "");
    if (!id) continue;
    if (kind === "user") keysUser.add(id);
    else if (kind === "therapist") keysTherapist.add(id);
    else if (kind === "store") keysStore.add(id);
  }

  // 並列で取得
  const tasks: Array<Promise<void>> = [];
  const out = new Map<
    string,
    { author_name: string; author_avatar_url: string | null }
  >();

  if (keysUser.size > 0) {
    tasks.push(
      (async () => {
        const ids = Array.from(keysUser);
        const { data, error } = await supabase
          .from("users")
          .select("id, name, avatar_url")
          .in("id", ids);
        if (error) throw error;
        for (const u of (data ?? []) as any[]) {
          const id = String(u.id);
          out.set(`user:${id}`, {
            author_name: String(u.name ?? "User"),
            author_avatar_url: u.avatar_url ?? null,
          });
        }
      })()
    );
  }

  if (keysTherapist.size > 0) {
    tasks.push(
      (async () => {
        const ids = Array.from(keysTherapist);
        const { data, error } = await supabase
          .from("therapists")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        if (error) throw error;
        for (const t of (data ?? []) as any[]) {
          const id = String(t.id);
          out.set(`therapist:${id}`, {
            author_name: String(t.display_name ?? "Therapist"),
            author_avatar_url: t.avatar_url ?? null,
          });
        }
      })()
    );
  }

  if (keysStore.size > 0) {
    tasks.push(
      (async () => {
        const ids = Array.from(keysStore);
        const { data, error } = await supabase
          .from("stores")
          .select("id, name, avatar_url")
          .in("id", ids);
        if (error) throw error;
        for (const s of (data ?? []) as any[]) {
          const id = String(s.id);
          out.set(`store:${id}`, {
            author_name: String(s.name ?? "Store"),
            author_avatar_url: s.avatar_url ?? null,
          });
        }
      })()
    );
  }

  await Promise.all(tasks);
  return out;
}

export default function SearchPage() {
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [includeArea, setIncludeArea] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);

  const handleChangeKeyword = (e: ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value);
  };

  const canSearch = useMemo(() => normalizeKeyword(keyword).length > 0, [keyword]);

  const runSearch = async () => {
    const k = normalizeKeyword(keyword);
    if (!k) {
      setHits([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pattern = toILikePattern(k);
      const uuidish = looksLikeUuidish(k);

      // tasks の型を Promise<Hit[]> に固定（推論崩れ防止）
      const tasks: Array<Promise<Hit[]>> = [];

      // -------- stores --------
      if (filter === "all" || filter === "store") {
        const p: Promise<Hit[]> = (async () => {
          // name 部分一致 + id も軽く拾う
          // ※ Supabase query builder で OR を組む
          let q = supabase
            .from("stores")
            .select("id, name, area, avatar_url")
            .limit(30);

          if (uuidish) {
            q = q.or(`id::text.ilike.${pattern},name.ilike.${pattern}`);
          } else {
            q = q.ilike("name", pattern);
          }

          const { data, error } = await q.order("name", { ascending: true });
          if (error) throw error;

          const rows = (data ?? []) as any[];
          const list: StoreHit[] = rows
            .filter((r) => r?.id && r?.name)
            .map((r) => ({
              kind: "store" as const,
              id: String(r.id),
              name: String(r.name),
              area: r.area ?? null,
              avatar_url: r.avatar_url ?? null,
            }));

          return list;
        })();

        tasks.push(p);
      }

      // -------- therapists --------
      if (filter === "all" || filter === "therapist") {
        const p: Promise<Hit[]> = (async () => {
          let q = supabase
            .from("therapists")
            .select("id, display_name, area, avatar_url")
            .limit(30);

          if (uuidish) {
            q = q.or(`id::text.ilike.${pattern},display_name.ilike.${pattern}`);
          } else {
            q = q.ilike("display_name", pattern);
          }

          const { data, error } = await q.order("display_name", { ascending: true });
          if (error) throw error;

          const rows = (data ?? []) as any[];
          const list: TherapistHit[] = rows
            .filter((r) => r?.id)
            .map((r) => ({
              kind: "therapist" as const,
              id: String(r.id),
              display_name: String(r.display_name ?? ""),
              area: r.area ?? null,
              avatar_url: r.avatar_url ?? null,
            }))
            .filter((x) => x.display_name.trim().length > 0);

          return list;
        })();

        tasks.push(p);
      }

      // -------- users --------
      if (filter === "all" || filter === "user") {
        const p: Promise<Hit[]> = (async () => {
          let q = supabase
            .from("users")
            .select("id, name, role, area, avatar_url")
            .limit(30);

          if (uuidish) {
            q = q.or(`id::text.ilike.${pattern},name.ilike.${pattern}`);
          } else {
            q = q.ilike("name", pattern);
          }

          const { data, error } = await q.order("name", { ascending: true });
          if (error) throw error;

          const rows = (data ?? []) as any[];
          const list: UserHit[] = rows
            .filter((r) => r?.id && r?.name)
            .map((r) => ({
              kind: "user" as const,
              id: String(r.id),
              name: String(r.name),
              role: String(r.role ?? "user"),
              area: r.area ?? null,
              avatar_url: r.avatar_url ?? null,
            }));

          return list;
        })();

        tasks.push(p);
      }

      // -------- posts --------
      if (filter === "all" || filter === "post") {
        const p: Promise<Hit[]> = (async () => {
          // posts は RLS off なのでOK
          // body 部分一致 + id/author_id も軽く拾う
          let q = supabase
            .from("posts")
            .select("id, author_id, author_kind, body, created_at, like_count, reply_count")
            .limit(30);

          if (uuidish) {
            q = q.or(
              `id::text.ilike.${pattern},author_id::text.ilike.${pattern},body.ilike.${pattern}`
            );
          } else {
            q = q.ilike("body", pattern);
          }

          const { data, error } = await q.order("created_at", { ascending: false });
          if (error) throw error;

          const rows = (data ?? []) as any[];
          if (rows.length === 0) return [];

          // author をまとめて解決
          const authorMap = await resolvePostAuthors(rows);

          const list: PostHit[] = rows
            .filter((r) => r?.id && r?.body)
            .map((r) => {
              const authorId = String(r.author_id ?? "");
              const authorKind = String(r.author_kind ?? "");
              const key = `${authorKind}:${authorId}`;
              const resolved = authorMap.get(key);

              return {
                kind: "post" as const,
                id: String(r.id),
                body: String(r.body ?? ""),
                created_at: String(r.created_at ?? ""),
                like_count: Number(r.like_count ?? 0),
                reply_count: Number(r.reply_count ?? 0),
                author_id: authorId,
                author_kind: authorKind,
                author_name: resolved?.author_name ?? `${authorKind || "author"}`,
                author_avatar_url: resolved?.author_avatar_url ?? null,
              };
            });

          return list;
        })();

        tasks.push(p);
      }

      const parts = await Promise.all(tasks);
      const merged = parts.flat();

      // kind+id で uniq
      const uniqMap = new Map<string, Hit>();
      for (const h of merged) uniqMap.set(`${h.kind}:${h.id}`, h);

      const list = Array.from(uniqMap.values()).sort((a, b) => {
        // 投稿は上に（新しい順を維持）
        if (a.kind === "post" && b.kind !== "post") return -1;
        if (a.kind !== "post" && b.kind === "post") return 1;

        // includeArea=true の場合は「area があるものを少し上」
        if (includeArea) {
          const aArea =
            a.kind === "store"
              ? a.area
              : a.kind === "therapist"
              ? a.area
              : a.kind === "user"
              ? a.area
              : null;
          const bArea =
            b.kind === "store"
              ? b.area
              : b.kind === "therapist"
              ? b.area
              : b.kind === "user"
              ? b.area
              : null;

          const aHas = (aArea ?? "").trim().length ? 1 : 0;
          const bHas = (bArea ?? "").trim().length ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas;
        }

        // 同種は名前で軽く整列（投稿以外）
        const aName =
          a.kind === "store"
            ? a.name
            : a.kind === "therapist"
            ? a.display_name
            : a.kind === "user"
            ? a.name
            : a.kind === "post"
            ? a.created_at
            : "";
        const bName =
          b.kind === "store"
            ? b.name
            : b.kind === "therapist"
            ? b.display_name
            : b.kind === "user"
            ? b.name
            : b.kind === "post"
            ? b.created_at
            : "";

        // 投稿は created_at desc
        if (a.kind === "post" && b.kind === "post") {
          return String(bName).localeCompare(String(aName));
        }
        return String(aName).localeCompare(String(bName));
      });

      setHits(list);
    } catch (e: any) {
      console.error("[SearchPage] search failed:", e);
      setError(e?.message ?? "検索に失敗しました。");
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await runSearch();
  };

  return (
    <div className="app-root">
      <AppHeader />

      <main className="app-main search-main">
        <h1 className="app-title">さがす</h1>

        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="text"
            className="search-input"
            value={keyword}
            onChange={handleChangeKeyword}
            placeholder="名前 / 投稿内容 / ID"
          />
          <button type="submit" className="search-btn" disabled={!canSearch || loading}>
            {loading ? "検索中…" : "検索"}
          </button>
        </form>

        <div className="search-toggle-group">
          <div className="toggle-row" onClick={() => setIncludeArea((prev) => !prev)}>
            <div className="toggle-main">
              <span className="toggle-title">エリアを含めて表示</span>
              <span className="toggle-caption">
                {includeArea ? "エリア情報がある候補を少し優先します" : "エリアに関係なく表示します"}
              </span>
            </div>
            <div className={"toggle-switch" + (includeArea ? " is-on" : "")}>
              <div className="toggle-knob" />
            </div>
          </div>
        </div>

        <div className="search-chips">
          <button
            type="button"
            className={filter === "all" ? "chip chip--active" : "chip"}
            onClick={() => setFilter("all")}
          >
            すべて
          </button>
          <button
            type="button"
            className={filter === "therapist" ? "chip chip--active" : "chip"}
            onClick={() => setFilter("therapist")}
          >
            セラピスト
          </button>
          <button
            type="button"
            className={filter === "store" ? "chip chip--active" : "chip"}
            onClick={() => setFilter("store")}
          >
            お店
          </button>
          <button
            type="button"
            className={filter === "user" ? "chip chip--active" : "chip"}
            onClick={() => setFilter("user")}
          >
            ユーザー
          </button>
          <button
            type="button"
            className={filter === "post" ? "chip chip--active" : "chip"}
            onClick={() => setFilter("post")}
          >
            投稿
          </button>
        </div>

        {error && <p className="err">{error}</p>}

        <section className="search-section">
          <h2 className="search-section-title">
            {hits.length > 0 ? `候補（${hits.length}）` : "候補"}
          </h2>

          {loading && hits.length === 0 ? (
            <p className="help">検索中です…</p>
          ) : hits.length === 0 ? (
            <p className="help">
              {canSearch ? "一致する候補がありません。" : "キーワードを入力して検索してください。"}
            </p>
          ) : (
            <ul className="search-list">
              {hits.map((h) => {
                // link / label
                const href =
                  h.kind === "store"
                    ? `/store/${h.id}`
                    : h.kind === "therapist"
                    ? `/therapist/${h.id}`
                    : h.kind === "user"
                    ? `/mypage/${h.id}`
                    : `/posts/${h.id}`;

                const name =
                  h.kind === "store"
                    ? h.name
                    : h.kind === "therapist"
                    ? h.display_name
                    : h.kind === "user"
                    ? h.name
                    : `投稿: ${h.author_name}`;

                const caption =
                  h.kind === "store"
                    ? `${h.area ?? "エリア未設定"} / お店`
                    : h.kind === "therapist"
                    ? `${h.area ?? "エリア未設定"} / セラピスト`
                    : h.kind === "user"
                    ? `${h.area ?? "エリア未設定"} / ${h.role}`
                    : `${snippet(h.body, 70)}`;

                const rawAvatar =
                  h.kind === "post" ? h.author_avatar_url : h.avatar_url;
                const avatarUrl = resolveAvatarUrl(rawAvatar);

                return (
                  <li key={`${h.kind}:${h.id}`} className="search-item">
                    <Link href={href} className="row-link">
                      <AvatarCircle
                        size={40}
                        avatarUrl={avatarUrl}
                        displayName={name}
                        alt={name}
                      />
                      <div className="search-item-main">
                        <div className="search-item-name">{name}</div>
                        <div className="search-item-caption">{caption}</div>

                        {h.kind === "post" ? (
                          <div className="post-meta">
                            <span className="post-kind">
                              {h.author_kind || "author"}
                            </span>
                            <span className="dot">·</span>
                            <span className="post-id">
                              {String(h.id).replace(/-/g, "").slice(0, 8)}
                            </span>
                            <span className="dot">·</span>
                            <span className="post-reply">
                              💬 {h.reply_count}
                            </span>
                            <span className="dot">·</span>
                            <span className="post-like">
                              ♥ {h.like_count}
                            </span>
                          </div>
                        ) : (
                          <div className="id-meta">
                            ID: {String(h.id).replace(/-/g, "").slice(0, 8)}
                          </div>
                        )}
                      </div>
                      <div className="chev">›</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <BottomNav active="search" hasUnread={false} />

      <style jsx>{`
        .search-main {
          padding: 12px 16px 140px;
        }

        .search-form {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .search-input {
          flex: 1;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 8px 12px;
          font-size: 14px;
          background: #fff;
        }

        .search-btn {
          border-radius: 999px;
          background: var(--accent);
          color: #fff;
          border: none;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }
        .search-btn[disabled] {
          opacity: 0.6;
          cursor: default;
        }

        .search-toggle-group {
          margin-top: 16px;
        }

        .search-chips {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .chip {
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 12px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          color: var(--text-sub);
          cursor: pointer;
        }

        .chip--active {
          background: var(--accent-soft);
          color: var(--text-main);
          border-color: var(--accent);
        }

        .search-section {
          margin-top: 20px;
        }

        .search-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-sub);
        }

        .help {
          font-size: 12px;
          color: var(--text-sub);
          line-height: 1.6;
          margin-top: 10px;
        }

        .err {
          margin-top: 10px;
          font-size: 12px;
          color: #b91c1c;
        }

        .search-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .search-item {
          border-bottom: 1px solid rgba(148, 163, 184, 0.3);
        }

        .row-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          text-decoration: none;
          color: inherit;
        }

        .search-item-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }

        .search-item-name {
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .search-item-caption {
          font-size: 11px;
          color: var(--text-sub);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .id-meta {
          margin-top: 2px;
          font-size: 10px;
          color: var(--text-sub);
          opacity: 0.85;
        }

        .post-meta {
          margin-top: 2px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: var(--text-sub);
          opacity: 0.9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .post-kind {
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.7);
        }

        .dot {
          opacity: 0.7;
        }

        .chev {
          color: var(--text-sub);
          font-size: 18px;
          padding-left: 6px;
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
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 0;
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
      `}</style>
    </div>
  );
}