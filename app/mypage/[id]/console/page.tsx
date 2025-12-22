// app/mypage/[id]/console/page.tsx
"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import AvatarUploader from "@/components/AvatarUploader";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { uploadAvatar } from "@/lib/avatarStorage";

type AccountType = "ゲスト" | "会員";

/**
 * 旧仕様：STORAGE_KEY 固定（端末内で1人分しか持てない）
 * 新仕様：ユーザーIDごとに分離
 * - 旧キーがあれば読み込み時に取り込み、以後は新キーで保存する（互換維持）
 */
const STORAGE_PREFIX = "loomroom_profile_v1_";
const LEGACY_STORAGE_KEY = "loomroom_profile_v1";

const hasUnread = true;

type LocalProfilePayload = {
  nickname?: string;
  area?: string;
  intro?: string;

  notifyFavPosts?: boolean;
  notifyDm?: boolean;
  notifyNews?: boolean;

  avatarDataUrl?: string;

  snsX?: string;
  snsLine?: string;
  snsOther?: string;

  isMember?: boolean;
};

type DbUserRow = {
  id: string;
  name: string | null;
  avatar_url: string | null;

  // ★ 追加カラム
  area: string | null;
  description: string | null;
};

const MyPageConsole: React.FC = () => {
  const params = useParams();
  const userId = (params?.id as string) || "user";

  // ID からゲスト or 会員を自動判定（guest- ならゲスト、それ以外は会員）
  const accountType: AccountType = userId.startsWith("guest-") ? "ゲスト" : "会員";
  const isMember = accountType === "会員";

  const STORAGE_KEY = `${STORAGE_PREFIX}${userId}`;

  const [nickname, setNickname] = useState<string>("あなた");
  const [area, setArea] = useState<string>(""); // ★自由入力
  const [intro, setIntro] = useState<string>(""); // ★UI上の intro は users.description に保存

  // SNS系リンク
  const [snsX, setSnsX] = useState<string>("");
  const [snsLine, setSnsLine] = useState<string>("");
  const [snsOther, setSnsOther] = useState<string>("");

  // 通知設定
  const [notifyFavPosts, setNotifyFavPosts] = useState<boolean>(true);
  const [notifyDm, setNotifyDm] = useState<boolean>(true);
  const [notifyNews, setNotifyNews] = useState<boolean>(false);

  // 会員: URL / ゲスト: base64
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 初回読み込み：localStorage から復元（新キー → 旧キーの順でフォールバック）
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawNew = window.localStorage.getItem(STORAGE_KEY);
      const rawLegacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      const raw = rawNew ?? rawLegacy;

      if (!raw) {
        setLoaded(true);
        return;
      }

      const data = JSON.parse(raw) as LocalProfilePayload;

      if (typeof data.nickname === "string" && data.nickname.trim().length > 0) {
        setNickname(data.nickname);
      }
      if (typeof data.area === "string") setArea(data.area);
      if (typeof data.intro === "string") setIntro(data.intro);

      if (typeof data.notifyFavPosts === "boolean") setNotifyFavPosts(data.notifyFavPosts);
      if (typeof data.notifyDm === "boolean") setNotifyDm(data.notifyDm);
      if (typeof data.notifyNews === "boolean") setNotifyNews(data.notifyNews);

      if (typeof data.avatarDataUrl === "string") setAvatarDataUrl(data.avatarDataUrl);

      if (typeof data.snsX === "string") setSnsX(data.snsX);
      if (typeof data.snsLine === "string") setSnsLine(data.snsLine);
      if (typeof data.snsOther === "string") setSnsOther(data.snsOther);
    } catch (e) {
      console.warn("[MyPageConsole] Failed to load profile from localStorage", e);
    } finally {
      setLoaded(true);
    }
  }, [STORAGE_KEY]);

  // Supabase の users から name / avatar_url / area / description を取得（会員のみ）
  useEffect(() => {
    if (!isMember) return;
    if (!userId || typeof userId !== "string") return;

    let cancelled = false;

    const loadUser = async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, name, avatar_url, area, description")
          .eq("id", userId)
          .maybeSingle<DbUserRow>();

        if (cancelled) return;

        if (error) {
          console.error("[MyPageConsole] loadUser error:", error);
          return;
        }
        if (!data) return;

        if (typeof data.name === "string" && data.name.trim().length > 0) setNickname(data.name);
        if (typeof data.avatar_url === "string" && data.avatar_url.trim().length > 0) {
          setAvatarDataUrl(data.avatar_url);
        }

        // ★ DB優先で反映（空文字も許容）
        if (typeof data.area === "string") setArea(data.area);
        if (typeof data.description === "string") setIntro(data.description);
      } catch (e) {
        if (!cancelled) console.error("[MyPageConsole] loadUser exception:", e);
      }
    };

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [userId, isMember]);

  // ===== Avatar 選択時の処理 =====
  // AvatarUploader が Promise<string> を期待する前提で「URL（またはdataURL）を返す」
  const handleAvatarFileSelect = async (file: File): Promise<string> => {
    if (!file) return "";

    // ゲスト：Supabase に書き込めないのでローカルプレビューだけ
    if (!isMember) {
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            setAvatarDataUrl(result);
            resolve(result);
          } else {
            resolve("");
          }
        };
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
    }

    // 会員：Storage にアップロード → users.avatar_url 更新
    try {
      setAvatarUploading(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const uid = userRes.user?.id;
      if (!uid) {
        throw new Error("ログイン状態が切れています。ログインし直してください。");
      }

      const publicUrl = await uploadAvatar(file, uid);

      const { error } = await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", userId);

      if (error) {
        console.error("[MyPageConsole] failed to update avatar_url:", error);
        throw new Error("アイコン画像の保存に失敗しました。時間をおいて再度お試しください。");
      }

      setAvatarDataUrl(publicUrl);
      return publicUrl;
    } catch (e) {
      console.error("[MyPageConsole] handleAvatarFileSelect error:", e);
      alert("画像のアップロードに失敗しました。通信環境をご確認ください。");
      return "";
    } finally {
      setAvatarUploading(false);
    }
  };

  // 保存処理：localStorage ＋ 会員なら users（name/area/description）を保存
  const handleSave = async () => {
    if (typeof window === "undefined") return;

    const payload: LocalProfilePayload = {
      nickname,
      area,
      intro,
      notifyFavPosts,
      notifyDm,
      notifyNews,
      avatarDataUrl,
      snsX,
      snsLine,
      snsOther,
      isMember,
    };

    // localStorage 保存（新キー）
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      // 旧キーにも上書き（互換）
      window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("[MyPageConsole] Failed to save profile (localStorage)", e);
    }

    // 会員のときは users を更新（avatar_url はファイル選択時に更新済み）
    if (isMember) {
      try {
        setSaving(true);

        const { error } = await supabase
          .from("users")
          .update({
            name: nickname?.trim() ? nickname.trim() : null,
            area: area?.trim() ? area.trim() : null,
            description: intro?.trim() ? intro.trim() : null,
          })
          .eq("id", userId);

        if (error) {
          console.error("[MyPageConsole] failed to update users:", error);
          alert("サーバー側のプロフィール保存に失敗しました。時間をおいて再度お試しください。");
        }
      } catch (e) {
        console.error("[MyPageConsole] handleSave users update error:", e);
        alert("サーバー側のプロフィール保存に失敗しました。通信環境をご確認ください。");
      } finally {
        setSaving(false);
      }
    }

    alert(
      [
        "マイページの設定を保存しました。",
        isMember
          ? "（この端末と LRoom アカウントの両方に保存されています）"
          : "（この端末の中にだけ保存されています）",
        "",
        `ID：${userId}`,
        `ニックネーム：${nickname || "未設定"}`,
        `アカウント種別：${accountType}`,
        `エリア：${area || "未設定"}`,
        `プロフィール：${intro || "（なし）"}`,
      ].join("\n")
    );
  };

  if (!loaded) {
    return (
      <div className="app-root">
        <AppHeader title="マイページ設定" subtitle="読み込み中…" />
        <main className="app-main">
          <div className="loading-text">プロフィールを読み込んでいます…</div>
        </main>
        <BottomNav active="mypage" hasUnread={hasUnread} />
      </div>
    );
  }

  return (
    <div className="app-root">
      <AppHeader title="マイページ設定"/>

      <main className="app-main">
        {/* 表示情報 */}
        <section className="surface-card">
          <h2>表示情報</h2>

          <div className="mp-profile-row">
            <AvatarUploader
              avatarUrl={avatarDataUrl}
              displayName={nickname || "U"}
              onPreview={!isMember ? (dataUrl: string) => setAvatarDataUrl(dataUrl) : undefined}
              onUploaded={isMember ? (url: string) => setAvatarDataUrl(url) : undefined}
              onFileSelect={handleAvatarFileSelect}
            />

            <div className="mp-profile-main">
              <div className="mp-id-pill">User ID：{userId}</div>

              <div className="field">
                <label className="field-label">ニックネーム</label>
                <input
                  className="field-input"
                  value={nickname}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNickname(e.target.value)}
                  placeholder="自由入力"
                />
              </div>
              <div className="mp-caption">
                LRoomの中で表示される名前です
                {avatarUploading && <span>（アイコン画像を保存しています…）</span>}
              </div>
            </div>
          </div>

          <div className="mp-sub-row">
            <div className="mp-pill mp-pill--accent">アカウント種別：{accountType}</div>
            <div className="mp-pill mp-pill--soft">
              {isMember
                ? "この端末とアカウントの両方に保存します"
                : "この端末の中だけで、静かに情報を管理します"}
            </div>
          </div>
        </section>

        {/* 基本情報 */}
        <section className="surface-card">
          <h2>基本情報</h2>

          <div className="field">
            <label className="field-label">エリア</label>
            <input
              className="field-input"
              value={area}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setArea(e.target.value)}
              placeholder="例）名古屋 / 東海エリア など"
            />
          </div>

          <div className="field">
            <label className="field-label">プロフィール</label>
            <textarea
              className="field-input mp-textarea"
              value={intro}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setIntro(e.target.value)}
              placeholder="例）人見知りですが、ゆっくり会話できる時間が好きです。"
            />
            <div className="field-note">
              {isMember
                ? "会員の場合、この内容は users.description に保存されます。"
                : "ゲストの場合、この端末内にのみ保存されます。"}
            </div>
          </div>
        </section>

        {/* SNSリンク */}
        <section className="surface-card">
          <h2>SNSリンク</h2>

          <div className="field">
            <label className="field-label">X（任意）</label>
            <input
              className="field-input"
              value={snsX}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSnsX(e.target.value)}
              placeholder="https://x.com/..."
            />
          </div>

          <div className="field">
            <label className="field-label">LINE（任意）</label>
            <input
              className="field-input"
              value={snsLine}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSnsLine(e.target.value)}
              placeholder="https://lin.ee/..."
            />
          </div>

          <div className="field">
            <label className="field-label">その他（任意）</label>
            <input
              className="field-input"
              value={snsOther}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSnsOther(e.target.value)}
              placeholder="Instagram / Misskey などのURL"
            />
          </div>
        </section>

        {/* 通知設定 */}
        <section className="surface-card">
          <h2>通知設定</h2>

          <div className="toggle-row">
            <div className="toggle-text">
              <div className="toggle-title">お気に入りの更新</div>
              <div className="mp-caption">
                お気に入りにした人の新しい投稿などを、アプリ内でさりげなくお知らせします。
              </div>
            </div>

            <button
              type="button"
              className={"toggle-switch" + (notifyFavPosts ? " is-on" : "")}
              onClick={() => setNotifyFavPosts((v) => !v)}
              aria-pressed={notifyFavPosts}
            >
              <span className="toggle-knob" />
            </button>
          </div>

          <div className="mp-divider" />

          <div className="toggle-row">
            <div className="toggle-text">
              <div className="toggle-title">DMの通知</div>
              <div className="mp-caption">大事なメッセージを見逃さないようにしたいときに。</div>
            </div>

            <button
              type="button"
              className={"toggle-switch" + (notifyDm ? " is-on" : "")}
              onClick={() => setNotifyDm((v) => !v)}
              aria-pressed={notifyDm}
            >
              <span className="toggle-knob" />
            </button>
          </div>

          <div className="mp-divider" />

          <div className="toggle-row">
            <div className="toggle-text">
              <div className="toggle-title">LRoom からのお知らせ</div>
              <div className="mp-caption">リリース情報など、大切なことだけに使う予定です。</div>
            </div>

            <button
              type="button"
              className={"toggle-switch" + (notifyNews ? " is-on" : "")}
              onClick={() => setNotifyNews((v) => !v)}
              aria-pressed={notifyNews}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </section>
      </main>

      {/* 保存バー（globals の console-footer-bar に統一） */}
      <footer className="console-footer-bar">
        <button
          type="button"
          className="btn-primary btn-primary--full"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中..." : "この内容で保存する"}
        </button>
      </footer>

      <BottomNav active="mypage" hasUnread={hasUnread} />

      {/* MyPage固有の見た目だけ残す */}
      <style jsx>{`
        .mp-profile-row {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .mp-profile-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }

        .mp-id-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--surface-soft);
          font-size: 11px;
          color: var(--text-sub);
          width: fit-content;
        }

        .mp-sub-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }

        .mp-pill {
          border-radius: 999px;
          padding: 4px 10px;
          background: var(--surface-soft);
          font-size: 11px;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .mp-pill--accent {
          background: var(--accent-soft);
          color: var(--accent);
          border-color: rgba(180, 137, 90, 0.18);
        }

        .mp-pill--soft {
          background: var(--surface-soft);
          color: var(--text-sub);
        }

        .mp-caption {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.6;
          margin-top: 2px;
        }

        .mp-textarea {
          min-height: 80px;
          line-height: 1.7;
          resize: vertical;
        }

        .mp-divider {
          height: 1px;
          background: var(--border-soft, rgba(0, 0, 0, 0.06));
          margin: 10px 0;
        }

        .loading-text {
          padding: 24px 16px;
          font-size: 13px;
          color: var(--text-sub);
        }
      `}</style>
    </div>
  );
};

export default MyPageConsole;