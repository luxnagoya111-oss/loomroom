// app/mypage/[id]/therapist/console/page.tsx（想定）
"use client";

import React, {
  useEffect,
  useState,
  ChangeEvent,
} from "react";
import { useParams } from "next/navigation";
import AvatarUploader from "@/components/AvatarUploader"; // 共通アバターコンポーネント

// 今は未使用だけど残しておく（将来ログインIDと紐付ける用）
const CURRENT_USER_ID = "guest";

type Area =
  | "北海道"
  | "東北"
  | "関東"
  | "中部"
  | "近畿"
  | "中国"
  | "四国"
  | "九州"
  | "沖縄";

type TherapistProfile = {
  displayName: string;
  handle: string;          // 内部的には保持しておく（将来用）
  area: Area | "";
  intro: string;
  messagePolicy: string;
  snsX?: string;
  snsLine?: string;
  snsOther?: string;
  /** アイコン画像（data URL） */
  avatarDataUrl?: string;
};

const STORAGE_PREFIX = "loomroom_therapist_profile_";

const DEFAULT_PROFILES: Record<string, TherapistProfile> = {
  taki: {
    displayName: "TAKI",
    handle: "@taki_lux",
    area: "中部",
    intro:
      "「大丈夫かな」と力が入りすぎてしまう方が、少しずつ呼吸をゆるめられる時間をイメージしています。",
    messagePolicy:
      "返信はできるだけ当日中を心がけていますが、遅くなることもあります。ゆっくりお待ちいただけたら嬉しいです。",
    snsX: "https://x.com/taki_lux",
    snsLine: "",
    snsOther: "",
  },
  default: {
    displayName: "セラピスト",
    handle: "@loomroom_therapist",
    area: "中部",
    intro:
      "落ち着いた会話と、静かに安心できる時間を大切にしています。はじめての方も、そのままの言葉で大丈夫です。",
    messagePolicy:
      "メッセージはなるべく早くお返事しますが、少しお時間をいただくこともあります。",
    snsX: "",
    snsLine: "",
    snsOther: "",
  },
};

const TherapistConsolePage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const therapistId = (params?.id as string) || "taki";
  const storageKey = `${STORAGE_PREFIX}${therapistId}`;

  const [data, setData] = useState<TherapistProfile>(() => {
    return DEFAULT_PROFILES[therapistId] || DEFAULT_PROFILES.default;
  });
  const [loaded, setLoaded] = useState(false);

  // 既存データを読み込み（アイコンも含めて復元）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as TherapistProfile;
        setData((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch (e) {
      console.warn("Failed to load therapist console data", e);
    } finally {
      setLoaded(true);
    }
  }, [storageKey]);

  const updateField = <K extends keyof TherapistProfile>(
    key: K,
    value: TherapistProfile[K]
  ) => {
    setData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
      alert("プロフィールを保存しました（この端末の中に保存されます）。");
    } catch (e) {
      console.warn("Failed to save therapist profile", e);
      alert("保存に失敗しました。ストレージ容量などをご確認ください。");
    }
  };

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー */}
        <header className="app-header">
          <button
            type="button"
            className="header-icon-btn"
            onClick={() => history.back()}
          >
            ◀
          </button>
          <div className="app-header-center">
            <div className="app-title">セラピスト用コンソール</div>
            <div className="app-header-sub">LoomRoom ID：@{therapistId}</div>
          </div>
          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main therapist-console-main">
          {/* ★ 店舗とのつながり（在籍リクエスト表示エリア） */}
          <section className="tc-card">
            <h2 className="tc-title">店舗とのつながり</h2>
            {/* 今はまだダミー文。後でリクエスト一覧に差し替える */}
            <p className="tc-caption">
              現在、新しい在籍リクエストは届いていません。
            </p>
          </section>

          {/* プロフィール上部：アイコン＋表示名 */}
          <section className="tc-card">
            <h2 className="tc-title">表示情報</h2>

            <div className="tc-profile-row">
              {/* 共通 AvatarUploader を使用 */}
              <AvatarUploader
                avatarDataUrl={data.avatarDataUrl}
                displayName={data.displayName}
                onChange={(dataUrl: string) =>
                  updateField("avatarDataUrl", dataUrl)
                }
              />

              <div className="tc-profile-main">
                {/* LoomRoom ID 表示（編集不可） */}
                <div className="tc-id-pill">
                  LoomRoom ID：@{therapistId}
                </div>

                <div className="tc-field-block">
                  <label className="tc-label">表示名</label>
                  <input
                    className="tc-input"
                    value={data.displayName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateField("displayName", e.target.value)
                    }
                    placeholder="例）TAKI / Hiyo / ひより など"
                  />
                </div>
              </div>
            </div>

            <div className="tc-field-block">
              <label className="tc-label">よくいるエリア</label>
              <select
                className="tc-select"
                value={data.area}
                onChange={(e) =>
                  updateField(
                    "area",
                    e.target.value as TherapistProfile["area"]
                  )
                }
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
            </div>

            <div className="tc-field-block">
              <label className="tc-label">ひとこと紹介</label>
              <textarea
                className="tc-textarea"
                value={data.intro}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  updateField("intro", e.target.value)
                }
                placeholder="例）緊張しやすい方・人見知りの方でも、呼吸がしやすくなる時間をイメージしています。"
              />
            </div>
          </section>

          <section className="tc-card">
            <h2 className="tc-title">メッセージについて</h2>

            <div className="tc-field-block">
              <label className="tc-label">返信のペースや考え方</label>
              <textarea
                className="tc-textarea"
                value={data.messagePolicy}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  updateField("messagePolicy", e.target.value)
                }
                placeholder="例）できるだけ当日中にお返事しますが、夜遅い時間は翌日になることがあります。ゆっくりお待ちいただけたら嬉しいです。"
              />
              <div className="tc-caption">
                DMの雰囲気やペースについて、安心してもらうための説明に使います。
              </div>
            </div>
          </section>

          <section className="tc-card">
            <h2 className="tc-title">リンク</h2>

            <div className="tc-field-block">
              <label className="tc-label">X（旧Twitter）URL</label>
              <input
                className="tc-input"
                value={data.snsX || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsX", e.target.value)
                }
                placeholder="https://x.com/..."
              />
            </div>

            <div className="tc-field-block">
              <label className="tc-label">LINE（リットリンクなども可）</label>
              <input
                className="tc-input"
                value={data.snsLine || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsLine", e.target.value)
                }
                placeholder="例）LINEの案内ページURL など"
              />
            </div>

            <div className="tc-field-block">
              <label className="tc-label">その他リンク</label>
              <input
                className="tc-input"
                value={data.snsOther || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsOther", e.target.value)
                }
                placeholder="ツイキャス / プロフィールサイトなど"
              />
            </div>

            <div className="tc-caption">
              ※ 現時点では、この端末の中だけで保存されます（本番ではサーバー保存予定）。
            </div>
          </section>
        </main>

        {/* フッター保存バー */}
        <footer className="tc-footer-bar">
          <button
            type="button"
            className="tc-save-btn"
            disabled={!loaded}
            onClick={handleSave}
          >
            {loaded ? "プロフィールを保存する" : "読み込み中..."}
          </button>
        </footer>

        {/* このページ専用のスタイル */}
        <style jsx>{`
          .therapist-console-main {
            padding: 12px 16px 140px;
          }

          .tc-card {
            background: var(--surface);
            border-radius: 16px;
            border: 1px solid var(--border);
            padding: 14px 14px 12px;
            margin-bottom: 12px;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
          }

          .tc-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-sub);
          }

          .tc-profile-row {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 8px;
          }

          .tc-profile-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .tc-id-pill {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--surface-soft);
            font-size: 11px;
            color: var(--text-sub);
          }

          .tc-field-block {
            margin-bottom: 10px;
          }

          .tc-label {
            font-size: 12px;
            margin-bottom: 4px;
            display: block;
            color: var(--text-main);
          }

          .tc-input {
            width: 100%;
            border-radius: 10px;
            border: 1px solid var(--border);
            padding: 7px 10px;
            font-size: 13px;
            background: var(--surface-soft);
          }

          .tc-select {
            width: 100%;
            border-radius: 999px;
            border: 1px solid var(--border);
            padding: 6px 10px;
            font-size: 13px;
            background: var(--surface-soft);
            color: var(--text-main);
          }

          .tc-textarea {
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

          .tc-caption {
            font-size: 11px;
            color: var(--text-sub);
            margin-top: 4px;
          }

          .tc-footer-bar {
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

          .tc-save-btn {
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

          .tc-save-btn[disabled] {
            opacity: 0.6;
            cursor: default;
          }
        `}</style>
      </div>
    </>
  );
};

export default TherapistConsolePage;