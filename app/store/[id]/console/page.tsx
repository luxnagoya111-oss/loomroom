"use client";

import React, {
  useState,
  useEffect,
  ChangeEvent,
  FormEvent,
} from "react";
import { useParams } from "next/navigation";

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

type MembershipStatus = "pending" | "approved" | "rejected" | "left";

type TherapistMember = {
  therapistId: string;
  status: MembershipStatus;
};

type StoreProfile = {
  storeName: string;
  area: Area;
  intro: string;
  siteUrl: string;
  lineUrl: string;
  xUrl: string;
  twitcastUrl: string;
  otherUrl: string;
  termsUrl: string;
  acceptDm: boolean;

  // 在籍セラピストリスト（新仕様）
  members: TherapistMember[];

  // ★ 後方互換用：旧テキスト保存が残っている可能性
  therapistIdsText?: string;
};

const DEFAULT_PROFILE: StoreProfile = {
  storeName: "",
  area: "",
  intro: "",
  siteUrl: "",
  lineUrl: "",
  xUrl: "",
  twitcastUrl: "",
  otherUrl: "",
  termsUrl: "",
  acceptDm: true,
  members: [],
  therapistIdsText: "",
};

// ステータスの表示ラベル
const STATUS_LABEL: Record<MembershipStatus, string> = {
  pending: "未承認",
  approved: "承認",
  rejected: "拒否",
  left: "脱退",
};

export default function StoreConsolePage() {
  const params = useParams<{ id: string }>();
  const storeId = params?.id || "store";

  const storageKey = `loomroom_store_profile_${storeId}`;

  const [profile, setProfile] = useState<StoreProfile>(DEFAULT_PROFILE);
  const [loaded, setLoaded] = useState(false);

  // 在籍セラピスト 追加用の一時ID
  const [newTherapistId, setNewTherapistId] = useState("");

  // 初回ロードで localStorage から復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setLoaded(true);
        return;
      }
      const data = JSON.parse(raw) as Partial<StoreProfile>;

      // --- 後方互換：旧 therapistIdsText がある場合は members に変換 ---
      let members: TherapistMember[] = Array.isArray(data.members)
        ? data.members
        : [];

      if ((!members || members.length === 0) && data.therapistIdsText) {
        const ids = data.therapistIdsText
          .split(/\r?\n|,|、|\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        members = ids.map((id) => ({
          therapistId: id,
          status: "approved",
        }));
      }

      setProfile({
        ...DEFAULT_PROFILE,
        ...data,
        members,
      });
    } catch (e) {
      console.warn("Failed to load store profile from localStorage", e);
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const handleChange =
    (field: keyof StoreProfile) =>
    (
      e: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      const value =
        field === "acceptDm"
          ? (e as ChangeEvent<HTMLInputElement>).target.checked
          : e.target.value;
      setProfile((prev) => ({
        ...prev,
        [field]: value as any,
      }));
    };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (typeof window === "undefined") return;

    try {
      const payload: StoreProfile = {
        ...profile,
        therapistIdsText: "", // 旧フィールドは空で保存
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      alert(
        [
          "店舗プロフィールを保存しました（この端末の中に保存されます）。",
          "",
          `店舗名：${profile.storeName || "未設定"}`,
          `エリア：${profile.area || "未設定"}`,
          `在籍セラピスト数：${profile.members.length}名`,
        ].join("\n")
      );
    } catch (err) {
      console.warn("Failed to save store profile", err);
      alert("保存に失敗しました。ストレージ容量などをご確認ください。");
    }
  };

  // ✅ 在籍セラピストIDを1件追加（＝確認依頼を送るボタン）
  const handleSendInvite = () => {
    const raw = newTherapistId.trim();
    if (!raw) {
      alert("在籍セラピストIDを入力してください。");
      return;
    }

    // IDとして扱うので空白は削除
    const therapistId = raw.replace(/\s+/g, "");

    // 重複チェック
    const exists = profile.members.some(
      (m) => m.therapistId.toLowerCase() === therapistId.toLowerCase()
    );
    if (exists) {
      alert("このIDはすでに在籍リストに登録されています。");
      return;
    }

    // ここで本当は「セラピスト側へ確認の案内送信」を実装予定
    // （今はローカルだけなので、リストに追加するだけ）
    setProfile((prev) => ({
      ...prev,
      members: [
        ...prev.members,
        {
          therapistId,
          status: "pending", // 追加時は「未承認」スタート
        },
      ],
    }));
    setNewTherapistId("");

    alert(
      [
        "在籍確認の依頼を作成しました。",
        "※ 現時点ではこの端末の中だけの管理です。",
        "　セラピスト側コンソールと連携すると「承認」状態に更新できるようにします。",
      ].join("\n")
    );
  };

  // ステータス変更
  const handleChangeStatus = (index: number, status: MembershipStatus) => {
    setProfile((prev) => {
      const next = [...prev.members];
      if (!next[index]) return prev;
      next[index] = { ...next[index], status };
      return { ...prev, members: next };
    });
  };

  // 削除
  const handleRemoveMember = (index: number) => {
    if (!window.confirm("この在籍IDをリストから削除しますか？")) return;

    setProfile((prev) => {
      const next = [...prev.members];
      next.splice(index, 1);
      return { ...prev, members: next };
    });
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
            <div className="app-title">店舗プロフィール設定</div>
            <div className="app-header-sub">ストアID：{storeId}</div>
          </div>

          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main store-console-main">
          <form onSubmit={handleSubmit}>
            {/* 基本情報 */}
            <section className="store-card">
              <h2 className="store-section-title">基本情報</h2>

              <div className="field-block">
                <label className="field-label">店舗名</label>
                <input
                  className="field-input"
                  value={profile.storeName}
                  onChange={handleChange("storeName")}
                  placeholder="例）LuX nagoya / LoomRoom nagoya"
                />
              </div>

              <div className="field-block">
                <label className="field-label">拠点エリア</label>
                <select
                  className="field-select"
                  value={profile.area}
                  onChange={handleChange("area")}
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
                  プロフィールや検索で表示する、お店のメインエリアです。
                </div>
              </div>

              <div className="field-block">
                <label className="field-label">店舗紹介 / コンセプト</label>
                <textarea
                  className="field-textarea"
                  value={profile.intro}
                  onChange={handleChange("intro")}
                  placeholder="例）女性が自分のペースで安心して過ごせる時間を、大切にしています。"
                />
                <div className="field-caption">
                  プロフィールページにそのまま表示される文章です。
                </div>
              </div>
            </section>

            {/* リンク */}
            <section className="store-card">
              <h2 className="store-section-title">リンク・連絡方法</h2>

              <div className="field-block">
                <label className="field-label">公式サイトURL</label>
                <input
                  className="field-input"
                  value={profile.siteUrl}
                  onChange={handleChange("siteUrl")}
                  placeholder="https://example.com"
                />
              </div>

              <div className="field-block">
                <label className="field-label">公式LINE URL</label>
                <input
                  className="field-input"
                  value={profile.lineUrl}
                  onChange={handleChange("lineUrl")}
                  placeholder="https://lin.ee/xxxxx など"
                />
              </div>

              <div className="field-block">
                <label className="field-label">X（旧Twitter）URL</label>
                <input
                  className="field-input"
                  value={profile.xUrl}
                  onChange={handleChange("xUrl")}
                  placeholder="https://x.com/xxxxx"
                />
              </div>

              <div className="field-block">
                <label className="field-label">ツイキャスURL</label>
                <input
                  className="field-input"
                  value={profile.twitcastUrl}
                  onChange={handleChange("twitcastUrl")}
                  placeholder="https://twitcasting.tv/xxxxx"
                />
              </div>

              <div className="field-block">
                <label className="field-label">その他リンク</label>
                <input
                  className="field-input"
                  value={profile.otherUrl}
                  onChange={handleChange("otherUrl")}
                  placeholder="lit.link / プロフカードなど"
                />
              </div>
            </section>

            {/* 利用規約・ポリシー */}
            <section className="store-card">
              <h2 className="store-section-title">ルール・ポリシー</h2>

              <div className="field-block">
                <label className="field-label">店舗利用規約ページURL</label>
                <input
                  className="field-input"
                  value={profile.termsUrl}
                  onChange={handleChange("termsUrl")}
                  placeholder="https://example.com/terms"
                />
                <div className="field-caption">
                  LoomRoomから店舗ページに飛んだときに、ここへのリンクも表示する想定です。
                </div>
              </div>

              <div
                className="toggle-row"
                onClick={() =>
                  setProfile((prev) => ({
                    ...prev,
                    acceptDm: !prev.acceptDm,
                  }))
                }
              >
                <div className="toggle-main">
                  <div className="toggle-title">
                    LoomRoom内でメッセージ受付中にする
                  </div>
                  <div className="toggle-caption">
                    オフにすると、この店舗への新規メッセージ受付を「一時停止中」にできます。
                  </div>
                </div>
                <div
                  className={
                    "toggle-switch" +
                    (profile.acceptDm ? " toggle-switch--on" : "")
                  }
                >
                  <div className="toggle-knob" />
                </div>
              </div>
            </section>

            {/* 在籍セラピスト管理 */}
            <section className="store-card">
              <h2 className="store-section-title">在籍セラピスト</h2>

              <div className="field-block">
                <label className="field-label">
                  在籍にしたいセラピストのID
                </label>
                <div className="member-input-row">
                  <input
                    className="field-input"
                    value={newTherapistId}
                    onChange={(e) => setNewTherapistId(e.target.value)}
                    placeholder="例）taki / hiyori など"
                  />
                  <button
                    type="button"
                    className="member-add-btn"
                    onClick={handleSendInvite}
                  >
                    確認依頼を送る
                  </button>
                </div>
                <div className="field-caption">
                  ※ ID はセラピストのマイページURL
                  <code>/therapist/●●</code> の <code>●●</code> と揃える想定です。
                </div>
              </div>

              {profile.members.length === 0 ? (
                <div className="member-empty">
                  まだ在籍セラピストは登録されていません。
                  必要に応じてIDを追加してください。
                </div>
              ) : (
                <ul className="member-list">
                  {profile.members.map((m, index) => (
                    <li key={m.therapistId + index} className="member-item">
                      <div className="member-main">
                        <div className="member-id">@{m.therapistId}</div>
                        <div className="member-status-row">
                          <label className="member-status-label">
                            ステータス
                          </label>
                          <select
                            className="member-status-select"
                            value={m.status}
                            onChange={(e) =>
                              handleChangeStatus(
                                index,
                                e.target.value as MembershipStatus
                              )
                            }
                          >
                            <option value="pending">
                              {STATUS_LABEL["pending"]}
                            </option>
                            <option value="approved">
                              {STATUS_LABEL["approved"]}
                            </option>
                            <option value="rejected">
                              {STATUS_LABEL["rejected"]}
                            </option>
                            <option value="left">
                              {STATUS_LABEL["left"]}
                            </option>
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="member-remove-btn"
                        onClick={() => handleRemoveMember(index)}
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* フッター：保存ボタン */}
            <footer className="store-console-footer">
              <button
                type="submit"
                className="store-save-btn"
                disabled={!loaded}
              >
                {loaded ? "この内容で保存する" : "読み込み中..."}
              </button>
            </footer>
          </form>
        </main>

        {/* 下ナビ（とりあえず通常どおり） */}
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
      </div>

      {/* このページ専用の軽いスタイル（カード＆トグルなど） */}
      <style jsx>{`
        .store-console-main {
          padding-bottom: 140px;
        }

        .store-card {
          background: var(--surface);
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 14px 14px 12px;
          margin-bottom: 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.03);
        }

        .store-section-title {
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

        .field-input,
        .field-select {
          width: 100%;
          border-radius: 10px;
          border: 1px solid var(--border);
          padding: 7px 10px;
          font-size: 13px;
          background: var(--surface-soft);
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

        .store-console-footer {
          position: fixed;
          bottom: 58px;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 430px;
          padding: 8px 12px;
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

        .store-save-btn {
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

        .store-save-btn[disabled] {
          opacity: 0.6;
          cursor: default;
        }

        /* トグル（MyPageのものと似た感じに） */
        .toggle-row {
          width: 100%;
          margin-top: 8px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface-soft);
          padding: 10px 12px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          cursor: pointer;
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
          margin-top: 2px;
          transition: background 0.2s ease;
        }

        .toggle-switch--on {
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

        .toggle-switch--on .toggle-knob {
          transform: translateX(20px);
        }

        .app-header-sub {
          font-size: 11px;
          color: var(--text-sub);
        }

        /* 在籍セラピスト管理 */
        .member-input-row {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 2px;
        }

        .member-add-btn {
          flex-shrink: 0;
          border-radius: 999px;
          border: none;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          background: var(--accent);
          color: #fff;
          cursor: pointer;
          white-space: nowrap;
        }

        .member-empty {
          font-size: 12px;
          color: var(--text-sub);
          margin-top: 8px;
        }

        .member-list {
          margin-top: 8px;
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .member-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 10px;
          background: var(--surface-soft);
        }

        .member-main {
          flex: 1;
        }

        .member-id {
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .member-status-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .member-status-label {
          font-size: 11px;
          color: var(--text-sub);
        }

        .member-status-select {
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 4px 8px;
          font-size: 12px;
          background: #fff;
        }

        .member-remove-btn {
          border-radius: 999px;
          border: none;
          padding: 4px 8px;
          font-size: 11px;
          cursor: pointer;
          background: #f4d7da;
          color: #8c2a3a;
          align-self: center;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}