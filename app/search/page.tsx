// app/search/page.tsx
"use client";

import React, { useMemo, useState, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";
import { supabase } from "@/lib/supabaseClient";

type SearchFilter = "all" | "therapist" | "store";

type StoreHit = {
  kind: "store";
  id: string;
  name: string;
  area: string | null;
  avatar_url: string | null;
};

type TherapistHit = {
  kind: "therapist";
  id: string;
  display_name: string;
  area: string | null;
  avatar_url: string | null;
};

type Hit = StoreHit | TherapistHit;

function normalizeKeyword(s: string) {
  return (s ?? "").trim();
}

// Supabase の ilike 用に %...% を作る（% や _ はエスケープ）
function toILikePattern(keyword: string) {
  const escaped = keyword.replace(/[%_]/g, "\\$&");
  return `%${escaped}%`;
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

      // tasks の型を Promise<Hit[]> に固定（PromiseLike 推論崩れ防止）
      const tasks: Array<Promise<Hit[]>> = [];

      if (filter === "all" || filter === "store") {
        const p: Promise<Hit[]> = (async () => {
          const { data, error } = await supabase
            .from("stores")
            .select("id, name, area, avatar_url")
            .ilike("name", pattern)
            .order("created_at", { ascending: false })
            .limit(30);

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

      if (filter === "all" || filter === "therapist") {
        const p: Promise<Hit[]> = (async () => {
          const { data, error } = await supabase
            .from("therapists")
            .select("id, display_name, area, avatar_url")
            .ilike("display_name", pattern)
            .order("created_at", { ascending: false })
            .limit(30);

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

      const parts = await Promise.all(tasks);
      const merged = parts.flat();

      // kind+id で uniq
      const uniqMap = new Map<string, Hit>();
      for (const h of merged) uniqMap.set(`${h.kind}:${h.id}`, h);

      // includeArea=true の場合は「area があるものを少し上」
      const list = Array.from(uniqMap.values()).sort((a, b) => {
        if (!includeArea) return 0;
        const aHas = (a.kind === "store" ? a.area : a.area) ? 1 : 0;
        const bHas = (b.kind === "store" ? b.area : b.area) ? 1 : 0;
        return bHas - aHas;
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
            placeholder="セラピスト名・お店の名前"
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
        </div>

        {error && <p className="err">{error}</p>}

        <section className="search-section">
          <h2 className="search-section-title">{hits.length > 0 ? `候補（${hits.length}）` : "候補"}</h2>

          {loading && hits.length === 0 ? (
            <p className="help">検索中です…</p>
          ) : hits.length === 0 ? (
            <p className="help">{canSearch ? "一致する候補がありません。" : "キーワードを入力して検索してください。"}</p>
          ) : (
            <ul className="search-list">
              {hits.map((h) => {
                const href = h.kind === "store" ? `/store/${h.id}` : `/therapist/${h.id}`;
                const name = h.kind === "store" ? h.name : h.display_name;
                const caption =
                  h.kind === "store"
                    ? `${h.area ?? "エリア未設定"} / お店`
                    : `${h.area ?? "エリア未設定"} / セラピスト`;

                return (
                  <li key={`${h.kind}:${h.id}`} className="search-item">
                    <Link href={href} className="row-link">
                      {/* ★ AvatarCircle は src が正しい */}
                      <AvatarCircle displayName={name} src={h.avatar_url} />
                      <div className="search-item-main">
                        <div className="search-item-name">{name}</div>
                        <div className="search-item-caption">{caption}</div>
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

      <BottomNav />

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