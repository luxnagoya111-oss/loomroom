"use client";

import React, { useState, ChangeEvent, FormEvent } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import AvatarCircle from "@/components/AvatarCircle";

type SearchFilter = "all" | "therapist" | "store";

export default function SearchPage() {
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [includeArea, setIncludeArea] = useState(true);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // TODO: 検索APIとの連携
    console.log("検索:", { keyword, filter, includeArea });
  };

  const handleChangeKeyword = (e: ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value);
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
            placeholder="セラピスト名・お店・キーワードなど"
          />
          <button type="submit" className="search-btn">
            検索
          </button>
        </form>

        <div className="search-toggle-group">
          <div className="toggle-row" onClick={() => setIncludeArea((prev) => !prev)}>
            <div className="toggle-main">
              <span className="toggle-title">エリアを含めて検索</span>
              <span className="toggle-caption">
                {includeArea
                  ? "現在の地域に近い人・お店を優先して表示します"
                  : "地域を気にせず、条件に合う人・お店をさがします"}
              </span>
            </div>
            <div className="toggle-switch">
              <div
                className="toggle-knob"
                style={{
                  transform: includeArea ? "translateX(20px)" : "translateX(0)",
                }}
              />
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

        {/* 仮の検索結果リスト */}
        <section className="search-section">
          <h2 className="search-section-title">候補</h2>
          <ul className="search-list">
            <li className="search-item">
              <AvatarCircle displayName="A" />
              <div className="search-item-main">
                <div className="search-item-name">朝陽（あさひ）</div>
                <div className="search-item-caption">LuX nagoya / セラピスト</div>
              </div>
            </li>
          </ul>
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

        .search-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .search-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.3);
        }

        .search-item-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .search-item-name {
          font-size: 14px;
          font-weight: 500;
        }

        .search-item-caption {
          font-size: 11px;
          color: var(--text-sub);
        }
      `}</style>
    </div>
  );
}