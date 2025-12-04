"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ★ ここに置く（import の下 / コンポーネントの上）
const CURRENT_USER_ID = "guest";

const STORE_STORAGE_PREFIX = "loomroom_store_profile_";
const THERAPIST_STORAGE_PREFIX = "loomroom_therapist_profile_";

type StoreLocalProfile = {
  therapistIdsText?: string;
};

type TherapistLocalProfile = {
  displayName?: string;
  avatarDataUrl?: string;
};

// 店舗IDごとのエリアラベル（必要に応じて増やせる）
const AREA_LABEL_MAP: Record<string, string> = {
  lux: "中部（名古屋・東海エリア）",
  tokyo: "関東（東京近郊）",
  osaka: "近畿（大阪・京都など）",
};

const StoreProfilePage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const storeId = (params?.id as string) || "store";

  const storeName =
    storeId === "lux"
      ? "LuX nagoya"
      : storeId === "loomroom"
      ? "LoomRoom"
      : "LoomRoom 提携サロン";

  const areaLabel = AREA_LABEL_MAP[storeId] || "全国（オンライン案内中心）";

  // 在籍セラピスト表示用
  const [therapists, setTherapists] = useState<
    { id: string; displayName: string; avatarDataUrl?: string }[]
  >([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storeKey = `${STORE_STORAGE_PREFIX}${storeId}`;
      const rawStore = window.localStorage.getItem(storeKey);

      let therapistIds: string[] = [];

      if (rawStore) {
        const storeProfile = JSON.parse(rawStore) as StoreLocalProfile;
        const rawText = storeProfile.therapistIdsText || "";
        therapistIds = rawText
          .split(/\r?\n|,|、|\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const result: {
        id: string;
        displayName: string;
        avatarDataUrl?: string;
      }[] = [];

      therapistIds.forEach((id) => {
        const tKey = `${THERAPIST_STORAGE_PREFIX}${id}`;
        const rawTherapist = window.localStorage.getItem(tKey);

        if (rawTherapist) {
          try {
            const t = JSON.parse(rawTherapist) as TherapistLocalProfile;
            result.push({
              id,
              displayName: t.displayName || id,
              avatarDataUrl: t.avatarDataUrl,
            });
          } catch {
            result.push({
              id,
              displayName: id,
            });
          }
        } else {
          // セラピスト側でまだ設定されていない場合はIDだけ表示
          result.push({
            id,
            displayName: id,
          });
        }
      });

      setTherapists(result);
    } catch (e) {
      console.warn("Failed to load store memberships", e);
    }
  }, [storeId]);

  return (
    <div className="app-shell">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="app-header-left">
          <div className="logo-circle" />
          <div className="app-title">{storeName}</div>
        </div>
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => history.back()}
        >
          ◀
        </button>
      </header>

      {/* メイン */}
      <main className="app-main">
        {/* 概要カード */}
        <section className="store-card">
          <div className="store-title-row">
            <h1 className="store-name">{storeName}</h1>
            <span className="badge-gold">🏛</span>
          </div>
          <div className="store-meta">
            <span className="store-meta-item">アカウント種別：店舗</span>
            <span className="store-meta-item">対応エリア：{areaLabel}</span>
          </div>
          <p className="store-lead">
            LoomRoom の中で、この店舗とゆるやかに繋がるためのプロフィールです。
            予約や詳細なご案内は、各店舗が案内している公式窓口をご利用ください。
          </p>
        </section>

        {/* お店について */}
        <section className="store-card">
          <h2 className="store-section-title">お店について</h2>
          <p className="store-text">
            落ち着いた雰囲気の中で、ゆっくりと自分のペースで過ごしていただくことを
            大切にしているお店です。「はじめてで不安」「少し距離を取りながら様子を見たい」
            という方も、無理のない形で関われるようにしています。
          </p>
          <p className="store-text">
            LoomRoom 上では、このお店に所属するセラピストの投稿や、
            ゆるいお知らせを中心に発信していきます。
          </p>
        </section>

        {/* 在籍セラピスト一覧 */}
        <section className="store-card">
          <h2 className="store-section-title">在籍セラピスト</h2>

          {therapists.length === 0 ? (
            <p className="store-caption">
              まだ LoomRoom 上では在籍セラピストが登録されていません。
            </p>
          ) : (
            <ul className="therapist-list">
              {therapists.map((t) => (
                <li key={t.id} className="therapist-item">
                  <div className="therapist-item-avatar">
                    {t.avatarDataUrl ? (
                      <img src={t.avatarDataUrl} alt={t.displayName} />
                    ) : (
                      <span>
                        {t.displayName
                          ? t.displayName.charAt(0)
                          : t.id.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="therapist-item-main">
                    <div className="therapist-item-name">{t.displayName}</div>
                    <div className="therapist-item-id">@{t.id}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 公式リンク */}
        <section className="store-card">
          <h2 className="store-section-title">公式リンク</h2>

          <div className="store-links">
            <a
              href="https://www.luxnagoya.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="store-link-btn"
            >
              公式サイトを見る
            </a>

            <a
              href="https://x.com/LuX_nagoya_1"
              target="_blank"
              rel="noopener noreferrer"
              className="store-link-btn store-link-btn--ghost"
            >
              X（旧Twitter）
            </a>

            <a
              href="https://twitcasting.tv/"
              target="_blank"
              rel="noopener noreferrer"
              className="store-link-btn store-link-btn--ghost"
            >
              ツイキャス
            </a>

            <a
              href="https://line.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="store-link-btn store-link-btn--ghost"
            >
              公式LINE
            </a>
          </div>

          <p className="store-caption">
            ※ 上記リンクは LoomRoom 外のサービスです。
            各サービスごとの利用規約・ポリシーをご確認のうえご利用ください。
          </p>
        </section>

        {/* LoomRoom 上でのお願い */}
        <section className="store-card">
          <h2 className="store-section-title">LoomRoom 上でのお願い</h2>
          <ul className="store-list">
            <li>やりとりは、無理のない範囲で大丈夫です。</li>
            <li>
              不安なこと・迷っていることは、短い一言からでも送って大丈夫です。
            </li>
            <li>攻撃的な内容や、強い勧誘行為などはお控えください。</li>
          </ul>

          <div className="store-terms-links">
            <a href="/terms" className="store-terms-link">
              LoomRoom利用規約
            </a>
            <span className="store-terms-separator">／</span>
            <a href="/privacy" className="store-terms-link">
              プライバシーポリシー
            </a>
          </div>

          <p className="store-caption">
            具体的な料金や予約の詳細については、
            公式サイトや各セラピストの案内をご確認ください。
          </p>
        </section>
      </main>

      {/* 下ナビ */}
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

      {/* ページ専用スタイル */}
      <style jsx>{`
        .store-card {
          background: var(--surface);
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 14px 14px 12px;
          margin-bottom: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
        }

        .store-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }

        .store-name {
          font-size: 18px;
          font-weight: 600;
        }

        .store-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          font-size: 11px;
          color: var(--text-sub);
          margin-bottom: 8px;
        }

        .store-meta-item {
          padding: 3px 8px;
          border-radius: 999px;
          background: var(--surface-soft);
        }

        .store-lead {
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-main);
        }

        .store-section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-sub);
          margin-bottom: 6px;
        }

        .store-text {
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-main);
          margin-bottom: 6px;
        }

        .store-links {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 6px 0 4px;
        }

        .store-link-btn {
          width: 100%;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 500;
          border: none;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
        }

        .store-link-btn--ghost {
          background: var(--surface-soft);
          color: var(--text-main);
          border: 1px solid var(--border);
          box-shadow: none;
        }

        .store-caption {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 4px;
          line-height: 1.6;
        }

        .store-list {
          list-style: disc;
          padding-left: 18px;
          margin: 2px 0 6px;
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-main);
        }

        .store-terms-links {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
          margin: 4px 0;
        }

        .store-terms-link {
          font-size: 12px;
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .store-terms-separator {
          font-size: 12px;
          color: var(--text-sub);
        }

        /* 在籍セラピスト一覧 */
        .therapist-list {
          list-style: none;
          padding: 0;
          margin: 4px 0 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .therapist-item {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .therapist-item-avatar {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background: var(--surface-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: 18px;
        }

        .therapist-item-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .therapist-item-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .therapist-item-name {
          font-size: 13px;
          font-weight: 500;
        }

        .therapist-item-id {
          font-size: 11px;
          color: var(--text-sub);
        }
      `}</style>
    </div>
  );
};

export default StoreProfilePage;