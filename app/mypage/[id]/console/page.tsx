// app/mypage/[id]/console/page.tsx
"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import AvatarUploader from "@/components/AvatarUploader"; // ★ 共通アバター

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

const STORAGE_KEY = "loomroom_profile_v1";
const hasUnread = true;

const MyPageConsole: React.FC = () => {
  const params = useParams();
  const userId = (params?.id as string) || "user";

  const [nickname, setNickname] = useState<string>("あなた");
  const [area, setArea] = useState<Area>("");
  const [intro, setIntro] = useState<string>("");
  const [notifyFavPosts, setNotifyFavPosts] = useState<boolean>(true);
  const [notifyDm, setNotifyDm] = useState<boolean>(true);
  const [notifyNews, setNotifyNews] = useState<boolean>(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(
    undefined
  ); // ★ 追加：ユーザーアイコン
  const [loaded, setLoaded] = useState(false);

  // 初回読み込み時に localStorage から復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setLoaded(true);
        return;
      }
      const data = JSON.parse(raw) as {
        nickname?: string;
        area?: Area;
        intro?: string;
        notifyFavPosts?: boolean;
        notifyDm?: boolean;
        notifyNews?: boolean;
        avatarDataUrl?: string;
      };

      if (data.nickname) setNickname(data.nickname);
      if (data.area) setArea(data.area);
      if (typeof data.intro === "string") setIntro(data.intro);
      if (typeof data.notifyFavPosts === "boolean")
        setNotifyFavPosts(data.notifyFavPosts);
      if (typeof data.notifyDm === "boolean") setNotifyDm(data.notifyDm);
      if (typeof data.notifyNews === "boolean") setNotifyNews(data.notifyNews);
      if (typeof data.avatarDataUrl === "string")
        setAvatarDataUrl(data.avatarDataUrl);
    } catch (e) {
      console.warn("Failed to load LoomRoom profile from localStorage", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  const handleSave = () => {
    if (typeof window !== "undefined") {
      const payload = {
        nickname,
        area,
        intro,
        notifyFavPosts,
        notifyDm,
        notifyNews,
        avatarDataUrl, // ★ 追加：保存
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn("Failed to save LoomRoom profile to localStorage", e);
      }
    }

    alert(
      [
        "マイページの設定を保存しました（この端末の中に保存されます）。",
        "",
        `ID：${userId}`,
        `ニックネーム：${nickname || "未設定"}`,
        `エリア：${area || "未設定"}`,
        `ひとこと：${intro || "（なし）"}`,
      ].join("\n")
    );
  };

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <header className="app-header">
          <div style={{ width: 30 }} />
          <div className="app-header-center">
            <div className="app-title">マイページ設定</div>
            <div className="app-header-sub">@{userId}</div>
          </div>
          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main mypage-main">
          {/* プロフィールカード */}
          <section className="mypage-card profile-card">
            <div className="profile-top-row">
              {/* ★ AvatarUploader に差し替え */}
              <AvatarUploader
                avatarDataUrl={avatarDataUrl}
                displayName={nickname || "U"}
                onChange={(dataUrl: string) => setAvatarDataUrl(dataUrl)}
              />

              <div className="profile-main-text">
                <input
                  className="profile-nickname-input"
                  value={nickname}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNickname(e.target.value)
                  }
                  placeholder="ニックネームを入力"
                />
                <div className="profile-id-hint">
                  LoomRoomの中で表示される名前です
                </div>
              </div>
            </div>

            <div className="profile-sub-row">
              <div className="profile-sub-pill">アカウント種別：ゲスト</div>
              <div className="profile-sub-pill profile-sub-pill--soft">
                この端末の中だけで、静かに情報を管理します
              </div>
            </div>
          </section>

          {/* 基本情報 */}
          <section className="mypage-card">
            <h2 className="mypage-section-title">基本情報</h2>

            <div className="field-block">
              <label className="field-label">ニックネーム</label>
              <input
                className="field-input"
                value={nickname}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setNickname(e.target.value)
                }
                placeholder="例）momo / ゆっくりさん など"
              />
            </div>

            <div className="field-block">
              <label className="field-label">よく使うエリア</label>
              <select
                className="field-select"
                value={area}
                onChange={(e) => setArea(e.target.value as Area)}
              >
                <option value="">未設定</option>
                <option value="北海道">北海道</option>
                <option value="東北">東北</option>
                <option value="関東">関東</option>
                <option value="中部">中部</option>
                <option value="近畿">近畿</option>
                <option value="中国">中国</option>
                <option value="四国">四国</option>
                <option value="九州">九州</option>
                <option value="沖縄">沖縄</option>
              </select>
              <div className="field-caption">
                投稿や検索でエリアを使うときの、基準にする地域です。
              </div>
            </div>

            <div className="field-block">
              <label className="field-label">ひとこと</label>
              <textarea
                className="field-textarea"
                value={intro}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setIntro(e.target.value)
                }
                placeholder="例）人見知りですが、ゆっくり会話できる時間が好きです。"
              />
            </div>
          </section>

          {/* 通知設定 */}
          <section className="mypage-card">
            <h2 className="mypage-section-title">通知設定</h2>

            <button
              type="button"
              className={
                "toggle-row" + (notifyFavPosts ? " toggle-row--on" : "")
              }
              onClick={() => setNotifyFavPosts((v) => !v)}
            >
              <div className="toggle-main">
                <div className="toggle-title">フォロー中のセラピスト投稿</div>
                <div className="toggle-caption">
                  新しい投稿があったときにお知らせする予定です。
                </div>
              </div>
              <div className="toggle-switch">
                <div className="toggle-knob" />
              </div>
            </button>

            <button
              type="button"
              className={"toggle-row" + (notifyDm ? " toggle-row--on" : "")}
              onClick={() => setNotifyDm((v) => !v)}
            >
              <div className="toggle-main">
                <div className="toggle-title">DMの新しいメッセージ</div>
                <div className="toggle-caption">
                  セラピストや店舗アカウントからの返信通知を想定しています。
                </div>
              </div>
              <div className="toggle-switch">
                <div className="toggle-knob" />
              </div>
            </button>

            <button
              type="button"
              className={"toggle-row" + (notifyNews ? " toggle-row--on" : "")}
              onClick={() => setNotifyNews((v) => !v)}
            >
              <div className="toggle-main">
                <div className="toggle-title">LoomRoom からのお知らせ</div>
                <div className="toggle-caption">
                  リリース情報など、大切なことだけに使う予定です。
                </div>
              </div>
              <div className="toggle-switch">
                <div className="toggle-knob" />
              </div>
            </button>
          </section>

          {/* アカウント系説明 */}
          <section className="mypage-card">
            <h2 className="mypage-section-title">アカウント</h2>

            <div className="link-row-disabled">
              現在はこの端末だけで情報を管理しています（ログイン機能は未実装）
            </div>
            <div className="link-row-disabled">
              アカウントの削除・お問い合わせは、正式リリース時に案内予定です
            </div>
          </section>
        </main>

        {/* 下フッター保存ボタン */}
        <footer className="mypage-footer-bar">
          <button
            type="button"
            className="mypage-save-btn"
            onClick={handleSave}
            disabled={!loaded}
          >
            {loaded ? "変更を保存する" : "読み込み中..."}
          </button>
        </footer>

        {/* 下ナビ：マイをアクティブ */}
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
            className="nav-item"
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
            className="nav-item is-active"
            onClick={() =>
              (window.location.href = `/mypage/${CURRENT_USER_ID}/console`)
            }
          >
            <span className="nav-icon">👤</span>
            マイ
          </button>
        </nav>
      </div>

      {/* このページ専用のスタイル */}
      <style jsx>{`
        .mypage-main {
          padding: 12px 16px 140px;
        }

        .mypage-card {
          background: var(--surface);
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 14px 14px 12px;
          margin-bottom: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
        }

        .profile-card {
          padding-top: 16px;
        }

        .profile-top-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        /* .profile-avatar はもう未使用だけど残しておいてOK
        .profile-avatar {
          width: 52px;
          height: 52px;
          border-radius: 999px;
          background: #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
        }
        */

        .profile-main-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .profile-nickname-input {
          width: 100%;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 6px 12px;
          font-size: 14px;
          background: var(--surface-soft);
        }

        .profile-id-hint {
          font-size: 11px;
          color: var(--text-sub);
        }

        .profile-sub-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }

        .profile-sub-pill {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: var(--accent);
        }

        .profile-sub-pill--soft {
          background: var(--surface-soft);
          color: var(--text-sub);
        }

        .mypage-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-sub);
        }

        .field-block {
          margin-bottom: 10px;
        }

        .field-label {
          font-size: 12px;
          margin-bottom: 4px;
          display: block;
          color: var(--text-main);
        }

        .field-input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid var(--border);
          padding: 7px 10px;
          font-size: 13px;
          background: var(--surface-soft);
        }

        .field-select {
          width: 100%;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 6px 10px;
          font-size: 13px;
          background: var(--surface-soft);
          color: var(--text-main);
        }

        .field-textarea {
          width: 100%;
          min-height: 80px;
          border-radius: 10px;
          border: 1px solid var(--border);
          padding: 8px 10px;
          font-size: 13px;
          line-height: 1.7;
          background: var(--surface-soft);
          resize: vertical;
        }

        .field-caption {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 4px;
        }

        .toggle-row {
          width: 100%;
          margin-top: 6px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          padding: 10px 12px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          cursor: pointer;
        }

        .toggle-row--on {
          border-color: var(--accent);
          background: var(--accent-soft);
        }

        .toggle-main {
          flex: 1;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .toggle-title {
          font-size: 13px;
          font-weight: 500;
          line-height: 1.3;
        }

        .toggle-caption {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.4;
        }

        .toggle-switch {
          width: 40px;
          height: 20px;
          border-radius: 999px;
          background: #c8cad3;
          position: relative;
          transition: background 0.2s ease;
          margin-top: 2px;
        }

        .toggle-row--on .toggle-switch {
          background: var(--accent);
        }

        .toggle-knob {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ffffff;
          position: absolute;
          top: 1px;
          left: 1px;
          transition: transform 0.2s ease;
        }

        .toggle-row--on .toggle-knob {
          transform: translateX(20px);
        }

        .link-row-disabled {
          font-size: 12px;
          color: var(--text-sub);
          padding: 6px 2px;
          border-top: 1px dashed var(--border);
        }

        .mypage-footer-bar {
          position: fixed;
          bottom: 58px;
          left: 0;
          width: 100vw;
          max-width: 100vw;
          padding: 8px 16px;
          background: linear-gradient(
            to top,
            rgba(247, 247, 250, 0.98),
            rgba(247, 247, 250, 0.88)
          );
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: center;
          z-index: 25;
        }

        .mypage-card .mypage-section-title,
        .mypage-card .toggle-title {
          color: var(--text-main) !重要;
        }

        .mypage-save-btn {
          width: 100%;
          border-radius: 999px;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }

        .mypage-save-btn[disabled] {
          opacity: 0.6;
          cursor: default;
        }
      `}</style>
    </>
  );
};

export default MyPageConsole;