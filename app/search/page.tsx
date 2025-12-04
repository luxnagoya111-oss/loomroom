"use client";

import React, { useState, ChangeEvent, useMemo } from "react";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest"; 

type Area =
  | ""
  | "北海道"
  | "東北"
  | "関東"
  | "中部"
  | "近畿"
  | "中国"
  | "四国"
  | "九州"
  | "沖縄";

type SearchMode = "therapist" | "post";

type TherapistLike = {
  id: string;
  name: string;
  kind: "therapist" | "store";
  area: Area;
  tags: string[];
  intro: string;
};

type PostLike = {
  id: string;
  authorName: string;
  authorKind: "therapist" | "store" | "user";
  area: Area;
  body: string;
  timeAgo: string;
};

// ★ まずは強制的に true（確認用）
const hasUnread = true;

const AREA_LABELS: Area[] = [
  "",
  "北海道",
  "東北",
  "関東",
  "中部",
  "近畿",
  "中国",
  "四国",
  "九州",
  "沖縄",
];

// デモ用ダミーデータ
const DEMO_THERAPISTS: TherapistLike[] = [
  {
    id: "t1",
    name: "TAKI",
    kind: "therapist",
    area: "中部",
    tags: ["やさしい", "ゆっくり過ごす", "初心者歓迎"],
    intro: "はじめてでも、緊張しすぎない時間を大事にしています。",
  },
  {
    id: "t2",
    name: "LoomRoom nagoya",
    kind: "store",
    area: "中部",
    tags: ["店舗アカウント", "お知らせ"],
    intro: "名古屋エリアのセラピスト・店舗の情報をまとめて案内します。",
  },
  {
    id: "t3",
    name: "hiyori",
    kind: "therapist",
    area: "関東",
    tags: ["会話中心", "聞き上手"],
    intro: "安心して話せる相手がほしいときに。",
  },
];

const DEMO_POSTS: PostLike[] = [
  {
    id: "p1",
    authorName: "TAKI",
    authorKind: "therapist",
    area: "中部",
    body: "今日は少しだけ寒いですね。あたたかい飲み物を用意して、お話だけでも大丈夫です。",
    timeAgo: "1時間前",
  },
  {
    id: "p2",
    authorName: "LoomRoom nagoya",
    authorKind: "store",
    area: "中部",
    body: "LoomRoomのテストエリアです。アプリの世界観づくりのための投稿。",
    timeAgo: "3時間前",
  },
  {
    id: "p3",
    authorName: "ゆっくりさん",
    authorKind: "user",
    area: "関東",
    body: "はじめてセラピストさんと会ってきました。思っていたよりずっと、静かで穏やかな時間でした。",
    timeAgo: "昨日",
  },
];

// 認証バッジ（セラピスト ✦ / 店舗 🏛）
const renderGoldBadge = (kind: "therapist" | "store") => {
  if (kind === "therapist") {
    return <span className="badge-gold">✦</span>;
  }
  return <span className="badge-gold">🏛</span>;
};

const SearchPage: React.FC = () => {
  const [mode, setMode] = useState<SearchMode>("therapist");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<Area>("");

  const handleQueryChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const filteredTherapists = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEMO_THERAPISTS.filter((t) => {
      if (area && t.area !== area) return false;
      if (!q) return true;
      const text =
        (t.name + " " + t.intro + " " + t.tags.join(" ")).toLowerCase();
      return text.includes(q);
    });
  }, [query, area]);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEMO_POSTS.filter((p) => {
      if (area && p.area !== area) return false;
      if (!q) return true;
      const text = (p.authorName + " " + p.body).toLowerCase();
      return text.includes(q);
    });
  }, [query, area]);

  return (
    <div className="app-shell">
      {/* ヘッダー */}
      <header className="app-header">
        <div style={{ width: 30 }} />
        <div className="app-header-center">
          <div className="app-title">さがす</div>
        </div>
        <div style={{ width: 30 }} />
      </header>

      {/* メイン */}
      <main className="app-main search-main">
        {/* 検索ボックス */}
        <section className="search-section">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="セラピスト名・店舗名・キーワード"
              value={query}
              onChange={handleQueryChange}
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setQuery("")}
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* タブ切り替え */}
        <section className="search-section">
          <div className="tab-toggle">
            <button
              type="button"
              className={
                "tab-toggle-item" + (mode === "therapist" ? " is-active" : "")
              }
              onClick={() => setMode("therapist")}
            >
              セラピスト
            </button>
            <button
              type="button"
              className={
                "tab-toggle-item" + (mode === "post" ? " is-active" : "")
              }
              onClick={() => setMode("post")}
            >
              投稿
            </button>
          </div>
        </section>

        {/* エリアチップ */}
        <section className="search-section">
          <div className="area-scroll">
            {AREA_LABELS.map((label) => {
              if (label === "") {
                return (
                  <button
                    key="all"
                    type="button"
                    className={
                      "area-chip" + (area === "" ? " area-chip--active" : "")
                    }
                    onClick={() => setArea("")}
                  >
                    すべて
                  </button>
                );
              }
              return (
                <button
                  key={label}
                  type="button"
                  className={
                    "area-chip" + (area === label ? " area-chip--active" : "")
                  }
                  onClick={() => setArea(label)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* リスト */}
        <section className="search-section">
          {mode === "therapist" ? (
            <div className="result-list">
              {filteredTherapists.length === 0 && (
                <div className="empty-hint">
                  条件に合うセラピスト・店舗がまだありません。
                  <br />
                  キーワードやエリアを少し変えて試してみてください。
                </div>
              )}

              {filteredTherapists.map((t) => (
                <article key={t.id} className="result-card">
                  <div className="result-top-row">
                    <div className="result-avatar">
                      {t.kind === "store" ? "🏬" : "🧑‍🦱"}
                    </div>
                    <div className="result-main-text">
                      <div className="result-name-row">
                        <span className="result-name">{t.name}</span>
                        {renderGoldBadge(t.kind)}
                      </div>
                      <div className="result-meta">
                        {t.area && <span>{t.area}</span>}
                      </div>
                    </div>
                  </div>
                  <p className="result-intro">{t.intro}</p>
                  {t.tags?.length > 0 && (
                    <div className="tag-row">
                      {t.tags.map((tag) => (
                        <span key={tag} className="tag-chip">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="result-footer">
                    <button
                      type="button"
                      className="result-link-btn"
                      onClick={() =>
                        alert("（デモ）プロフィール詳細はまだ未実装です。")
                      }
                    >
                      プロフィールを見る
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="result-list">
              {filteredPosts.length === 0 && (
                <div className="empty-hint">
                  条件に合う投稿がまだありません。
                  <br />
                  キーワードやエリアを少し変えて試してみてください。
                </div>
              )}

              {filteredPosts.map((p) => (
                <article key={p.id} className="result-card result-card--post">
                  <div className="result-top-row">
                    <div className="result-avatar">
                      {p.authorKind === "therapist"
                        ? "🧑‍🦱"
                        : p.authorKind === "store"
                        ? "🏬"
                        : "🙂"}
                    </div>
                    <div className="result-main-text">
                      <div className="result-name-row">
                        <span className="result-name">{p.authorName}</span>
                        {p.authorKind !== "user" &&
                          renderGoldBadge(
                            p.authorKind === "therapist" ? "therapist" : "store"
                          )}
                      </div>
                      <div className="result-meta">
                        {p.area && <span>{p.area}</span>}
                        <span>{p.timeAgo}</span>
                      </div>
                    </div>
                  </div>
                  <p className="result-intro">{p.body}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 下ナビ：さがすをアクティブ */}
      <nav className="bottom-nav">
        <button
          type="button"
          className="nav-item"
          onClick={() => (window.location.href = "/")}
        >
          <span className="nav-icon">🏠</span>
          ホーム
        </button>

        <button
          type="button"
          className="nav-item is-active"
          onClick={() => (window.location.href = "/search")}
        >
          <span className="nav-icon">🔍</span>
          さがす
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => (window.location.href = "/compose")}
        >
          <span className="nav-icon">➕</span>
          投稿
        </button>

          <button
            type="button"
            className="nav-item"
            onClick={() => (window.location.href = "/messages")}
          >
            <span className="nav-icon">💌</span>
            メッセージ
          </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => (window.location.href = "/notifications")}
        >
          <span className="nav-icon-wrap">
            <span className="nav-icon">🔔</span>
            {hasUnread && <span className="nav-badge-dot" />}
          </span>
          通知
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => 
           (window.location.href = `/mypage/${CURRENT_USER_ID}/console`)
          }
        >
          <span className="nav-icon">👤</span>
          マイ
        </button>
      </nav>
    </div>
  );
};

export default SearchPage;