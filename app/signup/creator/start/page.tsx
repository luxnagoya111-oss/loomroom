// app/signup/creator/start/page.tsx
"use client";

import React, { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId } from "@/lib/auth"; // 既存概念（guest-判定）を残す
import { supabase } from "@/lib/supabaseClient";
import {
  createStoreSignup,
  createTherapistSignup,
} from "@/lib/repositories/signupRepository";

type CreatorKind = "store" | "therapist" | null;

const HAS_UNREAD = false;

type StoreForm = {
  storeName: string;
  area: string;
  contactName: string;
  contact: string;
  website: string;
  note: string;
};

type TherapistForm = {
  name: string;
  area: string;
  experience: string;
  contact: string;
  wishStore: string;
  note: string;
};

function buildLoginUrl(nextPath: string) {
  // next は相対パスのみ許可（安全）
  const next = nextPath.startsWith("/") ? nextPath : "/signup/creator/start";
  return `/login?next=${encodeURIComponent(next)}`;
}

export default function CreatorSignupStartPage() {
  const router = useRouter();

  // SSR / 初期描画時は null（まだ判定していない状態）
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  // セッション（Auth）を基準にログイン判定
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // 既存のUI判定（guest- をログイン扱いしない）を維持
      const currentUserId = getCurrentUserId();
      const guestBasedLoggedIn =
        !!currentUserId && !currentUserId.startsWith("guest-");

      // Authセッションを確認（例外が出ない getSession を使用）
      const { data, error } = await supabase.auth.getSession();
      const authLoggedIn = !!data.session?.user;

      if (!cancelled) {
        // UI意味は維持：guest判定 AND Supabase auth の両方がtrueでログイン扱い
        setIsLoggedIn(guestBasedLoggedIn && authLoggedIn);
      }

      // もし error があっても、ここでは落とさない（利用者に影響を出さない）
      if (error) {
        console.warn("[CreatorSignupStartPage] getSession error:", error);
      }
    };

    run();

    // セッションが後から入るケースもあるので、Auth状態変化を購読
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      run();
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // 「未ログインなら注意文を出す」フラグ
  const showLoginNotice = isLoggedIn === false;

  const [kind, setKind] = useState<CreatorKind>(null);
  const [completedKind, setCompletedKind] = useState<CreatorKind>(null);

  const [storeForm, setStoreForm] = useState<StoreForm>({
    storeName: "",
    area: "",
    contactName: "",
    contact: "",
    website: "",
    note: "",
  });

  const [therapistForm, setTherapistForm] = useState<TherapistForm>({
    name: "",
    area: "",
    experience: "",
    contact: "",
    wishStore: "",
    note: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!kind) return;

    setSubmitting(true);
    setError(null);

    try {
      // ★ 実運用での事故をここで吸収：申請はログイン必須にする
      // 判定がまだ (null) の場合もあるので、submit時点で session を必ず確認する
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      const sessionUser = sessionData.session?.user ?? null;

      // guest-判定も維持（UIロジックと整合）
      const currentUserId = getCurrentUserId();
      const guestBasedLoggedIn =
        !!currentUserId && !currentUserId.startsWith("guest-");

      const canSubmit = !!sessionUser && guestBasedLoggedIn;

      if (!canSubmit) {
        // ログインへ誘導（この画面に戻す）
        router.push(buildLoginUrl("/signup/creator/start"));
        return;
      }

      if (sessionError) {
        console.warn("[CreatorSignupStartPage] getSession error:", sessionError);
      }

      if (kind === "store") {
        if (!storeForm.storeName.trim()) {
          setError("店舗名を入力してください。");
          return;
        }

        // payload はフォームのみ（currentUserId 等は絶対に混ぜない）
        const payload = {
          ...storeForm,
        };

        const result = await createStoreSignup({
          name: storeForm.storeName.trim(),
          contact: storeForm.contact.trim() || null,
          payload,
        });

        // result が null の場合は「未ログイン/セッション欠落」が多いのでログイン誘導
        if (!result) {
          router.push(buildLoginUrl("/signup/creator/start"));
          return;
        }
      } else if (kind === "therapist") {
        if (!therapistForm.name.trim()) {
          setError("お名前を入力してください。");
          return;
        }

        const payload = {
          ...therapistForm,
        };

        const result = await createTherapistSignup({
          name: therapistForm.name.trim(),
          contact: therapistForm.contact.trim() || null,
          payload,
        });

        if (!result) {
          router.push(buildLoginUrl("/signup/creator/start"));
          return;
        }
      }

      setCompletedKind(kind);
      setDone(true);
    } catch (err) {
      console.error("[CreatorSignupStartPage] submit error:", err);
      setError("送信に失敗しました。通信環境をご確認ください。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader title="セラピスト / 店舗登録" />
      <main className="app-main">
        <div className="page-root">
          {done ? (
            <div className="thankyou-card">
              <h2 className="thankyou-title">送信が完了しました</h2>

              {completedKind === "store" && (
                <p className="thankyou-text">
                  ご入力いただいた内容をもとに、店舗としての掲載可否を確認させていただきます。
                  審査のうえ、必要に応じてご連絡いたします。
                  掲載やアカウント発行について少しお時間をいただく場合があります。
                </p>
              )}

              {completedKind === "therapist" && (
                <p className="thankyou-text">
                  ご入力いただいた内容は、今後のやり取りや確認のためのメモとして保存されました。
                  セラピストとしてのアカウント自体は自動で有効になりますが、
                  店舗と紐づくまでは投稿やDMなど一部の機能に制限がかかる場合があります。
                </p>
              )}

              {!completedKind && (
                <p className="thankyou-text">
                  ご入力いただいた内容を受け付けました。
                  内容を確認のうえ、必要に応じてご連絡いたします。
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="lead">
                LRoom に掲載するセラピスト / 店舗の登録フォームです。
                まずはどちらとして使いたいかを選んでください。
              </p>

              <p className="lead">
                セラピストとしての申請は、
                基本的にはアカウント自体が自動で有効になります。
                このフォームの内容は、後から店舗側が確認できる「メモ」のような位置づけです。
                店舗に正式に紐づくまでは、一部の機能に制限がかかります。
              </p>

              <p className="lead">
                店舗としての申請は、内容を確認したうえで掲載可否を判断させていただきます。
              </p>

              {showLoginNotice && (
                <p className="lead">
                  ※ ログインされていない場合、後からアカウントと申請内容をひも付けできないことがあります。
                  可能であれば先にメールアドレスでログインしてからご利用ください。
                </p>
              )}

              <div className="kind-selector">
                <button
                  type="button"
                  className={kind === "store" ? "kind-btn kind-btn-active" : "kind-btn"}
                  onClick={() => setKind("store")}
                >
                  店舗として申し込む
                </button>
                <button
                  type="button"
                  className={
                    kind === "therapist" ? "kind-btn kind-btn-active" : "kind-btn"
                  }
                  onClick={() => setKind("therapist")}
                >
                  セラピストとして申し込む
                </button>
              </div>

              {kind && (
                <form onSubmit={handleSubmit} className="form-card">
                  {kind === "store" ? (
                    <>
                      <h2 className="section-title">店舗としての申請内容</h2>

                      <div className="field">
                        <label className="label">
                          店舗名 <span className="required">必須</span>
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={storeForm.storeName}
                          onChange={(e) =>
                            setStoreForm((prev) => ({
                              ...prev,
                              storeName: e.target.value,
                            }))
                          }
                          placeholder="例）LuX nagoya"
                          required
                        />
                      </div>

                      <div className="field">
                        <label className="label">エリア</label>
                        <input
                          type="text"
                          className="input"
                          value={storeForm.area}
                          onChange={(e) =>
                            setStoreForm((prev) => ({
                              ...prev,
                              area: e.target.value,
                            }))
                          }
                          placeholder="例）名古屋 / 東海エリア など"
                        />
                      </div>

                      <div className="field">
                        <label className="label">ご担当者名</label>
                        <input
                          type="text"
                          className="input"
                          value={storeForm.contactName}
                          onChange={(e) =>
                            setStoreForm((prev) => ({
                              ...prev,
                              contactName: e.target.value,
                            }))
                          }
                          placeholder="任意"
                        />
                      </div>

                      <div className="field">
                        <label className="label">連絡先（メール / LINE など）</label>
                        <input
                          type="text"
                          className="input"
                          value={storeForm.contact}
                          onChange={(e) =>
                            setStoreForm((prev) => ({
                              ...prev,
                              contact: e.target.value,
                            }))
                          }
                          placeholder="審査結果のご連絡に使います"
                        />
                      </div>

                      <div className="field">
                        <label className="label">Webサイト / SNS</label>
                        <input
                          type="text"
                          className="input"
                          value={storeForm.website}
                          onChange={(e) =>
                            setStoreForm((prev) => ({
                              ...prev,
                              website: e.target.value,
                            }))
                          }
                          placeholder="任意（例）公式サイトやXアカウント"
                        />
                      </div>

                      <div className="field">
                        <label className="label">補足事項</label>
                        <textarea
                          className="textarea"
                          value={storeForm.note}
                          onChange={(e) =>
                            setStoreForm((prev) => ({
                              ...prev,
                              note: e.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="掲載の目的やこだわり、注意点などあればご記入ください"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="section-title">セラピストとしての申請内容</h2>

                      <div className="field">
                        <label className="label">
                          お名前 <span className="required">必須</span>
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={therapistForm.name}
                          onChange={(e) =>
                            setTherapistForm((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="表示名でも本名でも大丈夫です"
                          required
                        />
                      </div>

                      <div className="field">
                        <label className="label">活動エリア</label>
                        <input
                          type="text"
                          className="input"
                          value={therapistForm.area}
                          onChange={(e) =>
                            setTherapistForm((prev) => ({
                              ...prev,
                              area: e.target.value,
                            }))
                          }
                          placeholder="例）名古屋 / 東海エリア など"
                        />
                      </div>

                      <div className="field">
                        <label className="label">経験 / 背景</label>
                        <textarea
                          className="textarea"
                          value={therapistForm.experience}
                          onChange={(e) =>
                            setTherapistForm((prev) => ({
                              ...prev,
                              experience: e.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="未経験の方も、その旨を書いていただければ大丈夫です"
                        />
                      </div>

                      <div className="field">
                        <label className="label">所属希望の店舗（あれば）</label>
                        <input
                          type="text"
                          className="input"
                          value={therapistForm.wishStore}
                          onChange={(e) =>
                            setTherapistForm((prev) => ({
                              ...prev,
                              wishStore: e.target.value,
                            }))
                          }
                          placeholder="例）LuX nagoya のような女性向けのお店 など"
                        />
                      </div>

                      <div className="field">
                        <label className="label">連絡先（メール / LINE など）</label>
                        <input
                          type="text"
                          className="input"
                          value={therapistForm.contact}
                          onChange={(e) =>
                            setTherapistForm((prev) => ({
                              ...prev,
                              contact: e.target.value,
                            }))
                          }
                          placeholder="やり取りのための連絡先（任意）"
                        />
                      </div>

                      <div className="field">
                        <label className="label">補足事項</label>
                        <textarea
                          className="textarea"
                          value={therapistForm.note}
                          onChange={(e) =>
                            setTherapistForm((prev) => ({
                              ...prev,
                              note: e.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="大切にしたいことやNG事項などがあれば教えてください"
                        />
                      </div>
                    </>
                  )}

                  {error && <p className="error-text">{error}</p>}

                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={submitting}
                  >
                    {submitting ? "送信中..." : "この内容で申請する"}
                  </button>

                  <p className="note">
                    ※ 入力内容は、LRoom 内での運用とご連絡のためにのみ利用します。
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </main>

      <BottomNav hasUnread={HAS_UNREAD} />

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #faf7f3;
        }

        .app-main {
          flex: 1;
          padding: 12px 12px 72px;
        }

        .page-root {
          max-width: 520px;
          margin: 0 auto;
        }

        .lead {
          font-size: 12px;
          color: var(--text-sub, #666);
          line-height: 1.7;
          margin-bottom: 8px;
        }

        .kind-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin: 8px 0 12px;
        }

        .kind-btn {
          border-radius: 999px;
          padding: 9px 0;
          font-size: 13px;
          font-weight: 500;
          border: 1px solid var(--border, #ddd);
          background: #fff;
          color: var(--text-main, #333);
        }

        .kind-btn-active {
          border: none;
          background: linear-gradient(
            135deg,
            var(--accent, #d9b07c),
            var(--accent-deep, #b4895a)
          );
          color: #fff;
        }

        .form-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px 14px 18px;
          box-shadow: 0 8px 24px rgba(10, 10, 10, 0.02);
          border: 1px solid rgba(220, 210, 200, 0.7);
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 10px;
        }

        .field {
          margin-bottom: 12px;
        }

        .label {
          display: flex;
          align-items: center;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .required {
          margin-left: 6px;
          font-size: 10px;
          color: #b94a48;
          padding: 2px 6px;
          border-radius: 999px;
          background: #fdecea;
        }

        .input,
        .textarea {
          width: 100%;
          border-radius: 12px;
          border: 1px solid var(--border, #ddd);
          padding: 8px 10px;
          font-size: 13px;
          background: #fff;
        }

        .textarea {
          resize: vertical;
          min-height: 72px;
        }

        .submit-btn {
          width: 100%;
          margin-top: 4px;
          border-radius: 999px;
          border: none;
          padding: 10px 0;
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          background: linear-gradient(
            135deg,
            var(--accent, #d9b07c),
            var(--accent-deep, #b4895a)
          );
        }

        .error-text {
          font-size: 11px;
          color: #b94a48;
          margin: 4px 0 6px;
        }

        .note {
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-sub, #777);
        }

        .thankyou-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 20px 16px 18px;
          box-shadow: 0 8px 24px rgba(10, 10, 10, 0.02);
          border: 1px solid rgba(220, 210, 200, 0.7);
        }

        .thankyou-title {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .thankyou-text {
          font-size: 13px;
          color: var(--text-sub, #555);
          line-height: 1.7;
        }
      `}</style>
    </div>
  );
}