"use client";

import React, { useEffect, useState, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import AvatarUploader from "@/components/AvatarUploader";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/lib/supabaseClient";
import { uploadAvatar } from "@/lib/avatarStorage";

const hasUnread = true;

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
  handle: string;
  area: Area | "";
  intro: string;
  messagePolicy: string;
  snsX?: string;
  snsLine?: string;
  snsOther?: string;
  avatarDataUrl?: string;
};

// Supabase therapists テーブルの型（想定カラム名）
// 必要に応じて、実際のテーブルに合わせてリネームしてください。
type DbTherapistRow = {
  display_name: string | null;
  handle: string | null;
  area: string | null;
  intro: string | null;
  message_policy: string | null;
  sns_x: string | null;
  sns_line: string | null;
  sns_other: string | null;
  avatar_url: string | null;
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
  const therapistId = (params?.id as string) || "taki"; // URLの [id]。therapists.slug 想定
  const storageKey = `${STORAGE_PREFIX}${therapistId}`;

  const [data, setData] = useState<TherapistProfile>(() => {
    return DEFAULT_PROFILES[therapistId] || DEFAULT_PROFILES.default;
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const updateField = <K extends keyof TherapistProfile>(
    key: K,
    value: TherapistProfile[K]
  ) => {
    setData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // ① localStorage から復元（旧仕様との互換）
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

  // ② Supabase therapists から基本プロフィールを取得
  useEffect(() => {
    let cancelled = false;

    const loadTherapistFromSupabase = async () => {
      try {
        const { data: dbRow, error } = await supabase
          .from("therapists")
          .select(
            "display_name, handle, area, intro, message_policy, sns_x, sns_line, sns_other, avatar_url"
          )
          .eq("slug", therapistId) // therapists.slug が URL の [id] 想定
          .maybeSingle<DbTherapistRow>();

        if (cancelled) return;

        if (error) {
          console.error("[TherapistConsole] loadTherapist error:", error);
          return;
        }
        if (!dbRow) return;

        setData((prev) => ({
          ...prev,
          displayName: dbRow.display_name ?? prev.displayName,
          handle: dbRow.handle ?? prev.handle,
          area: (dbRow.area as Area) ?? prev.area,
          intro: dbRow.intro ?? prev.intro,
          messagePolicy: dbRow.message_policy ?? prev.messagePolicy,
          snsX: dbRow.sns_x ?? prev.snsX,
          snsLine: dbRow.sns_line ?? prev.snsLine,
          snsOther: dbRow.sns_other ?? prev.snsOther,
          avatarDataUrl: dbRow.avatar_url ?? prev.avatarDataUrl,
        }));
      } catch (e) {
        if (!cancelled) {
          console.error("[TherapistConsole] loadTherapist exception:", e);
        }
      }
    };

    loadTherapistFromSupabase();
    return () => {
      cancelled = true;
    };
  }, [therapistId]);

  // ③ Avatar 選択時：即プレビュー → Storage アップロード → therapists.avatar_url 更新
  const handleAvatarFileSelect = async (file: File) => {
    try {
      // まずはローカルプレビュー（Base64）を即反映
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          updateField("avatarDataUrl", reader.result);
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.warn("[TherapistConsole] preview read error:", e);
    }

    // Storage ＋ DB 更新
    try {
      setAvatarUploading(true);

      // Storage パスには therapistId をそのまま使う（uploadAvatar 内で users/{id}/... だが、
      // 「id」として therapistId を流用して問題はない）
      const publicUrl = await uploadAvatar(file, therapistId);

      const { error } = await supabase
        .from("therapists")
        .update({ avatar_url: publicUrl })
        .eq("slug", therapistId);

      if (error) {
        console.error(
          "[TherapistConsole] failed to update therapists.avatar_url:",
          error
        );
        alert(
          "アイコン画像をサーバーに保存できませんでした。時間をおいて再度お試しください。"
        );
        return;
      }

      // 最終的には Storage の URL を反映
      updateField("avatarDataUrl", publicUrl);
    } catch (e) {
      console.error("[TherapistConsole] handleAvatarFileSelect error:", e);
      alert("画像のアップロードに失敗しました。通信環境をご確認ください。");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    if (typeof window === "undefined") return;

    // 1) 端末ローカルに保存（旧仕様互換）
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save therapist profile (localStorage)", e);
      alert("ローカル保存に失敗しました。ストレージ容量などをご確認ください。");
    }

    // 2) therapists テーブルに保存
    try {
      setSaving(true);

      const updatePayload: Partial<DbTherapistRow> = {
        display_name: data.displayName,
        handle: data.handle,
        area: data.area || null,
        intro: data.intro,
        message_policy: data.messagePolicy,
        sns_x: data.snsX || null,
        sns_line: data.snsLine || null,
        sns_other: data.snsOther || null,
        // avatar_url はアイコン変更時に個別更新しているが、
        // data.avatarDataUrl が Storage URL になっていればここで上書きしても良い
        avatar_url: data.avatarDataUrl || null,
      };

      const { error } = await supabase
        .from("therapists")
        .update(updatePayload)
        .eq("slug", therapistId);

      if (error) {
        console.error("[TherapistConsole] failed to update therapists:", error);
        alert(
          "サーバー側のプロフィール保存に失敗しました。時間をおいて再度お試しください。"
        );
      } else {
        alert(
          "プロフィールを保存しました。（この端末と LoomRoom アカウントの両方に保存されています）"
        );
      }
    } catch (e) {
      console.error("[TherapistConsole] handleSave error:", e);
      alert(
        "サーバー側のプロフィール保存に失敗しました。通信環境をご確認ください。"
      );
    } finally {
      setSaving(false);
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
            ←
          </button>
          <div className="app-header-center">
            <div className="app-title">セラピスト用コンソール</div>
            <div className="app-header-sub">LoomRoom ID：@{therapistId}</div>
          </div>
          <div style={{ width: 30 }} />
        </header>

        {/* メイン */}
        <main className="app-main therapist-console-main">
          {/* 店舗とのつながり */}
          <section className="surface-card tc-card">
            <h2 className="tc-title">店舗とのつながり</h2>
            <p className="tc-caption">
              現在、新しい在籍リクエストは届いていません。
            </p>
          </section>

          {/* 表示情報 */}
          <section className="surface-card tc-card">
            <h2 className="tc-title">表示情報</h2>

            <div className="tc-profile-row">
              <AvatarUploader
                avatarDataUrl={data.avatarDataUrl}
                displayName={data.displayName}
                // Base64 を使ったローカル保存はもう不要なので onChange は渡さない
                onFileSelect={handleAvatarFileSelect}
              />

              <div className="tc-profile-main">
                <div className="tc-id-pill">LoomRoom ID：@{therapistId}</div>

                <div className="field">
                  <label className="field-label">表示名</label>
                  <input
                    className="field-input"
                    value={data.displayName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateField("displayName", e.target.value)
                    }
                    placeholder="例）TAKI / Hiyo / ひより など"
                  />
                </div>
                {avatarUploading && (
                  <div className="tc-caption">
                    アイコン画像を保存しています…
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label className="field-label">よくいるエリア</label>
              <select
                className="field-input"
                value={data.area}
                onChange={(e) =>
                  updateField("area", e.target.value as TherapistProfile["area"])
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

            <div className="field">
              <label className="field-label">ひとこと紹介</label>
              <textarea
                className="field-input tc-textarea"
                value={data.intro}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  updateField("intro", e.target.value)
                }
                placeholder="例）緊張しやすい方・人見知りの方でも、呼吸がしやすくなる時間をイメージしています。"
              />
            </div>
          </section>

          {/* メッセージについて */}
          <section className="surface-card tc-card">
            <h2 className="tc-title">メッセージについて</h2>

            <div className="field">
              <label className="field-label">返信のペースや考え方</label>
              <textarea
                className="field-input tc-textarea"
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

          {/* リンク */}
          <section className="surface-card tc-card">
            <h2 className="tc-title">リンク</h2>

            <div className="field">
              <label className="field-label">X（旧Twitter）URL</label>
              <input
                className="field-input"
                value={data.snsX || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsX", e.target.value)
                }
                placeholder="https://x.com/..."
              />
            </div>

            <div className="field">
              <label className="field-label">LINE（リットリンクなども可）</label>
              <input
                className="field-input"
                value={data.snsLine || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsLine", e.target.value)
                }
                placeholder="例）LINEの案内ページURL など"
              />
            </div>

            <div className="field">
              <label className="field-label">その他リンク</label>
              <input
                className="field-input"
                value={data.snsOther || ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField("snsOther", e.target.value)
                }
                placeholder="ツイキャス / プロフィールサイトなど"
              />
            </div>

            <div className="tc-caption">
              この端末だけでなく、LoomRoom アカウント側にも順次反映されます。
            </div>
          </section>
        </main>

        {/* フッター保存バー */}
        <footer className="tc-footer-bar">
          <button
            type="button"
            className="btn-primary btn-primary--full"
            disabled={!loaded || saving}
            onClick={handleSave}
          >
            {saving ? "保存中..." : loaded ? "プロフィールを保存する" : "読み込み中..."}
          </button>
        </footer>

        <BottomNav active="mypage" hasUnread={hasUnread} />

        {/* このページ専用のスタイル（差分だけ） */}
        <style jsx>{`
          .therapist-console-main {
            padding: 12px 16px 140px;
          }

          .tc-card {
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

          .tc-textarea {
            min高さ: 80px;
            line-height: 1.7;
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
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            max-width: 430px;
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
        `}</style>
      </div>
    </>
  );
};

export default TherapistConsolePage;