// app/mypage/[id]/console/page.tsx
"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import AvatarUploader from "@/components/AvatarUploader";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { uploadAvatar } from "@/lib/avatarStorage";

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

type AccountType = "ゲスト" | "会員";

const STORAGE_KEY = "loomroom_profile_v1";
const hasUnread = true;

const MyPageConsole: React.FC = () => {
  const params = useParams();
  const userId = (params?.id as string) || "user";

  // ID からゲスト or 会員を自動判定（guest- ならゲスト、それ以外は会員）
  const accountType: AccountType = userId.startsWith("guest-")
    ? "ゲスト"
    : "会員";

  const [nickname, setNickname] = useState<string>("あなた");
  const [area, setArea] = useState<Area>("");
  const [intro, setIntro] = useState<string>("");

  // 「メッセージについて」
  const [messagePolicy, setMessagePolicy] = useState<string>(
    "通知にすぐ気づけないこともあるので、ゆっくりペースでやりとりできたら嬉しいです。"
  );

  // SNS系リンク
  const [snsX, setSnsX] = useState<string>("");
  const [snsLine, setSnsLine] = useState<string>("");
  const [snsOther, setSnsOther] = useState<string>("");

  // 通知設定
  const [notifyFavPosts, setNotifyFavPosts] = useState<boolean>(true);
  const [notifyDm, setNotifyDm] = useState<boolean>(true);
  const [notifyNews, setNotifyNews] = useState<boolean>(false);

  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 初回読み込み：localStorage から復元（accountType は ID から自動なので読み込まない）
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
        messagePolicy?: string;
        snsX?: string;
        snsLine?: string;
        snsOther?: string;
        isMember?: boolean;
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

      if (typeof data.messagePolicy === "string") {
        setMessagePolicy(data.messagePolicy);
      }
      if (typeof data.snsX === "string") setSnsX(data.snsX);
      if (typeof data.snsLine === "string") setSnsLine(data.snsLine);
      if (typeof data.snsOther === "string") setSnsOther(data.snsOther);
    } catch (e) {
      console.warn("Failed to load LoomRoom profile", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Supabase の users から name / avatar_url を取得（会員のみ）
  useEffect(() => {
    if (accountType === "ゲスト") return;
    if (!userId || typeof userId !== "string") return;

    let cancelled = false;

    const loadUser = async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("name, avatar_url")
          .eq("id", userId)
          .maybeSingle<{ name: string | null; avatar_url: string | null }>();

        if (cancelled) return;

        if (error) {
          console.error("[MyPageConsole] loadUser error:", error);
          return;
        }
        if (!data) return;

        if (data.name) {
          setNickname(data.name);
        }
        if (data.avatar_url) {
          setAvatarDataUrl(data.avatar_url);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[MyPageConsole] loadUser exception:", e);
        }
      }
    };

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [userId, accountType]);

  // Avatar 選択時の処理
  const handleAvatarFileSelect = async (file: File) => {
    // ゲスト：Supabase に書き込めないのでローカルプレビューだけ
    if (accountType === "ゲスト") {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setAvatarDataUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    // 会員：Storage にアップロード → users.avatar_url 更新
    try {
      setAvatarUploading(true);
      const publicUrl = await uploadAvatar(file, userId);

      // DB に保存
      const { error } = await supabase
        .from("users")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (error) {
        console.error("[MyPageConsole] failed to update avatar_url:", error);
        alert(
          "アイコン画像の保存に失敗しました。時間をおいて再度お試しください。"
        );
        return;
      }

      setAvatarDataUrl(publicUrl);
    } catch (e) {
      console.error("[MyPageConsole] handleAvatarFileSelect error:", e);
      alert("画像のアップロードに失敗しました。通信環境をご確認ください。");
    } finally {
      setAvatarUploading(false);
    }
  };

  // 保存処理：localStorage ＋ 会員なら users.name をサーバー側にも保存
  const handleSave = async () => {
    if (typeof window === "undefined") return;

    const isMember = accountType === "会員";

    const payload = {
      nickname,
      area,
      intro,
      notifyFavPosts,
      notifyDm,
      notifyNews,
      avatarDataUrl,
      messagePolicy,
      snsX,
      snsLine,
      snsOther,
      isMember,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to save LoomRoom profile (localStorage)", e);
    }

    // 会員のときは users.name を更新（avatar_url はファイル選択時に更新済み）
    if (isMember) {
      try {
        setSaving(true);
        const { error } = await supabase
          .from("users")
          .update({
            name: nickname || null,
          })
          .eq("id", userId);

        if (error) {
          console.error("[MyPageConsole] failed to update users.name:", error);
          alert(
            "サーバー側のプロフィール保存に失敗しました。時間をおいて再度お試しください。"
          );
        }
      } catch (e) {
        console.error("[MyPageConsole] handleSave users update error:", e);
        alert(
          "サーバー側のプロフィール保存に失敗しました。通信環境をご確認ください。"
        );
      } finally {
        setSaving(false);
      }
    }

    alert(
      [
        "マイページの設定を保存しました。",
        isMember
          ? "（この端末と LoomRoom アカウントの両方に保存されています）"
          : "（この端末の中にだけ保存されています）",
        "",
        `ID：${userId}`,
        `ニックネーム：${nickname || "未設定"}`,
        `アカウント種別：${accountType}`,
        `エリア：${area || "未設定"}`,
        `ひとこと：${intro || "（なし）"}`,
      ].join("\n")
    );
  };

  if (!loaded) {
    return (
      <div className="app-shell">
        <AppHeader title="マイページ設定" subtitle="読み込み中…" />
        <main className="app-main mypage-main">
          <div className="loading-text">プロフィールを読み込んでいます…</div>
        </main>
        <BottomNav active="mypage" hasUnread={hasUnread} />
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        {/* ヘッダー（ベースそのまま） */}
        <AppHeader title="マイページ設定" subtitle={`ID: ${userId}`} />

        <main className="app-main mypage-main">
          {/* プロフィールカード（ベース崩さず） */}
          <section className="surface-card mypage-card profile-card">
            <div className="profile-top-row">
              <AvatarUploader
                avatarDataUrl={avatarDataUrl}
                displayName={nickname || "U"}
                // ゲスト：従来通り Base64 を localStorage 用に使う
                onChange={
                  accountType === "ゲスト"
                    ? (dataUrl: string) => setAvatarDataUrl(dataUrl)
                    : undefined
                }
                // 会員/ゲスト 両方で File を受け取る（ゲストはローカルプレビューのみ）
                onFileSelect={handleAvatarFileSelect}
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
                {avatarUploading && (
                  <div className="profile-id-hint">
                    アイコン画像を保存しています…
                  </div>
                )}
              </div>
            </div>

            <div className="profile-sub-row">
              <div className="pill pill--accent profile-sub-pill">
                アカウント種別：{accountType}
              </div>
              <div className="pill profile-sub-pill profile-sub-pill--soft">
                この端末の中だけで、静かに情報を管理します
              </div>
            </div>
          </section>

          {/* 基本情報 */}
          <section className="surface-card mypage-card">
            <h2 className="mypage-section-title">基本情報</h2>

            <div className="field">
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

            <div className="field">
              <label className="field-label">エリア</label>
              <select
                className="field-input"
                value={area}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setArea(e.target.value as Area)
                }
              >
                <option value="">選択しない</option>
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

            <div className="field">
              <label className="field-label">ひとこと</label>
              <textarea
                className="field-input"
                value={intro}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setIntro(e.target.value)
                }
                placeholder="例）人見知りですが、ゆっくり会話できる時間が好きです。"
              />
            </div>
          </section>

          {/* メッセージについて */}
          <section className="surface-card mypage-card">
            <h2 className="mypage-section-title">メッセージについて</h2>
            <div className="field">
              <label className="field-label">
                やりとりのペースや、おねがいごと
              </label>
              <textarea
                className="field-input"
                value={messagePolicy}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setMessagePolicy(e.target.value)
                }
                placeholder="例）通知にすぐ気づけないこともあるので、ゆっくりペースでやりとりできたら嬉しいです。"
              />
              <div className="field-note">
                公開マイページの「メッセージについて」にそのまま表示されます。
              </div>
            </div>
          </section>

          {/* SNSリンク */}
          <section className="surface-card mypage-card">
            <h2 className="mypage-section-title">SNSリンク</h2>
            <div className="field">
              <label className="field-label">X（任意）</label>
              <input
                className="field-input"
                value={snsX}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSnsX(e.target.value)
                }
                placeholder="https://x.com/..."
              />
            </div>
            <div className="field">
              <label className="field-label">LINE（任意）</label>
              <input
                className="field-input"
                value={snsLine}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSnsLine(e.target.value)
                }
                placeholder="https://lin.ee/..."
              />
            </div>
            <div className="field">
              <label className="field-label">その他（任意）</label>
              <input
                className="field-input"
                value={snsOther}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSnsOther(e.target.value)
                }
                placeholder="Instagram / Misskey などのURL"
              />
            </div>
          </section>

          {/* 通知設定 */}
          <section className="surface-card mypage-card">
            <h2 className="mypage-section-title">通知設定</h2>

            <button
              type="button"
              className={"toggle-row" + (notifyFavPosts ? " toggle-row--on" : "")}
              onClick={() => setNotifyFavPosts((v) => !v)}
            >
              <div className="toggle-main">
                <div className="toggle-title">お気に入りの更新</div>
                <div className="toggle-caption">
                  お気に入りにした人の新しい投稿などを、アプリ内でさりげなくお知らせします。
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
                <div className="toggle-title">DMの通知</div>
                <div className="toggle-caption">
                  大事なメッセージを見逃さないようにしたいときに。
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

          {/* 保存ボタン */}
          <section className="mypage-save-section">
            <button
              type="button"
              className="primary-button primary-button--full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中..." : "この内容で保存する"}
            </button>
          </section>
        </main>

        <BottomNav active="mypage" hasUnread={hasUnread} />
      </div>

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          max-width: 480px;
          margin: 0 auto;
          background: var(--background);
          color: var(--text-main);
          display: flex;
          flex-direction: column;
        }

        .app-main {
          flex: 1;
          padding-bottom: 80px;
        }

        .mypage-main {
          padding: 12px 16px 140px;
        }

        .mypage-card {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 12px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          margin-top: 12px;
        }

        .profile-card {
          padding-top: 16px;
        }

        .profile-top-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .profile-main-text {
          flex: 1;
        }

        .profile-nickname-input {
          width: 100%;
          border: none;
          border-bottom: 1px solid var(--border);
          padding: 4px 2px;
          font-size: 16px;
          font-weight: 600;
          background: transparent;
        }

        .profile-nickname-input::placeholder {
          color: var(--text-sub);
        }

        .profile-id-hint {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 4px;
        }

        .profile-sub-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }

        .profile-sub-pill {
          font-size: 11px;
        }

        .profile-sub-pill--soft {
          background: var(--surface-soft);
          color: var(--text-sub);
        }

        .pill {
          border-radius: 999px;
          padding: 4px 10px;
          background: var(--surface-soft);
          font-size: 11px;
        }

        .pill--accent {
          background: var(--accent-soft);
          color: var(--accent);
        }

        .mypage-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-sub);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 8px;
        }

        .field-label {
          font-size: 11px;
          color: var(--text-sub);
        }

        .field-input {
          width: 100%;
          border-radius: 12px;
          border: 1px solid var(--border);
          padding: 6px 10px;
          font-size: 13px;
          background: #fff;
        }

        textarea.field-input {
          min-height: 70px;
          resize: vertical;
        }

        .field-note {
          font-size: 11px;
          color: var(--text-sub);
          margin-top: 4px;
        }

        .toggle-row {
          margin-top: 8px;
          border-radius: 12px;
          border: 1px solid var(--border);
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fff;
        }

        .toggle-row--on {
          border-color: var(--accent);
          background: var(--accent-soft);
        }

        .toggle-main {
          flex: 1;
          padding-right: 8px;
        }

        .toggle-title {
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 2px;
        }

        .toggle-caption {
          font-size: 11px;
          color: var(--text-sub);
        }

        .toggle-switch {
          width: 38px;
          height: 22px;
          border-radius: 999px;
          background: var(--border);
          display: flex;
          align-items: center;
          padding: 2px;
        }

        .toggle-row--on .toggle-switch {
          background: var(--accent);
        }

        .toggle-knob {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #fff;
          margin-left: 0;
          transition: margin 0.15s ease;
        }

        .toggle-row--on .toggle-knob {
          margin-left: 16px;
        }

        .mypage-save-section {
          margin: 18px 0 80px;
        }

        .primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: none;
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 6px 16px rgba(180, 137, 90, 0.35);
        }

        .primary-button--full {
          width: 100%;
        }

        .loading-text {
          padding: 24px 16px;
          font-size: 13px;
          color: var(--text-sub);
        }
      `}</style>
    </>
  );
};

export default MyPageConsole;