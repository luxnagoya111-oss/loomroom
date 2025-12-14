// app/compose/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  ChangeEvent,
  FormEvent,
} from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import { getCurrentUserId, getCurrentUserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

// Supabase users テーブル上で「ゲスト用」に1行だけ作っておく想定
const GUEST_DB_USER_ID = "00000000-0000-0000-0000-000000000000";

const MAX_LENGTH = 280;

// therapists テーブルの最低限の行型
type DbTherapistRowForStatus = {
  id: string;
  user_id: string;
  store_id: string | null;
};

export default function ComposePage() {
  const logicalUserId = getCurrentUserId(); // 例: "guest-xxxxx" or UUID
  const currentRole = getCurrentUserRole(); // "user" | "therapist" | "store" | "guest"

  const hasUnread = false; // DM未読は別フェーズで接続

  // 「投稿可能か」の状態をここで一元管理
  const [canPost, setCanPost] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(
    currentRole === "therapist"
  );

  const [text, setText] = useState("");
  const [area, setArea] = useState("中部");
  const [visibility, setVisibility] = useState<"public" | "limited">("public");
  const [canReply, setCanReply] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ロールに応じて投稿可否を決定
  useEffect(() => {
    // セラピスト以外（user / store / guest）は今のところ制限なし
    if (currentRole !== "therapist") {
      setCanPost(true);
      setCheckingStatus(false);
      return;
    }

    // セラピストの場合のみ、therapists.store_id を確認
    let cancelled = false;

    const checkTherapistStoreLink = async () => {
      try {
        setCheckingStatus(true);

        const { data, error } = await supabase
          .from("therapists")
          .select("id, user_id, store_id")
          .eq("user_id", logicalUserId)
          .maybeSingle<DbTherapistRowForStatus>();

        if (cancelled) return;

        if (error) {
          console.error(
            "[Compose] failed to load therapist status:",
            error
          );
          // 安全側に倒して「投稿不可」とする
          setCanPost(false);
          return;
        }

        if (!data) {
          // therapist レコードが無い場合も、所属店舗なし扱い
          setCanPost(false);
          return;
        }

        // store_id が入っているセラピストのみ投稿許可
        setCanPost(!!data.store_id);
      } catch (e) {
        if (!cancelled) {
          console.error("[Compose] therapist status check exception:", e);
          setCanPost(false);
        }
      } finally {
        if (!cancelled) {
          setCheckingStatus(false);
        }
      }
    };

    checkTherapistStoreLink();

    return () => {
      cancelled = true;
    };
  }, [currentRole, logicalUserId]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next.length <= MAX_LENGTH) {
      setText(next);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const body = text.trim();
    if (!body) return;

    // 投稿禁止ならここで止める
    // （セラピストかどうかに限らず canPost に従う）
    if (!canPost) {
      alert("現在、所属店舗が無いため投稿はできません。");
      return;
    }

    // Supabase 上の author_id に使う ID を決める
    // - ログイン済み（UUID）: そのまま author_id
    // - ゲスト（"guest-" から始まる）: GUEST_DB_USER_ID に集約
    const isGuestLogical = logicalUserId.startsWith("guest-");
    const authorId = isGuestLogical ? GUEST_DB_USER_ID : logicalUserId;

    // author_kind は role ベース（guest は user 扱い）
    const authorKind =
      currentRole === "therapist" ||
      currentRole === "store" ||
      currentRole === "user"
        ? currentRole
        : "user";

    try {
      setSubmitting(true);

      const { error } = await supabase.from("posts").insert([
        {
          body,
          area,
          author_id: authorId,
          author_kind: authorKind,
          // ここで visibility / can_reply を使うならカラム追加してから
          // visibility,
          // can_reply: canReply,
        },
      ]);

      if (error) {
        console.error(
          "Supabase insert error:",
          error,
          (error as any)?.message,
          (error as any)?.code
        );
        alert(
          (error as any)?.message ??
            "投稿の保存中にエラーが発生しました。時間をおいて再度お試しください。"
        );
        return;
      }

      alert("投稿を公開しました。ホームのタイムラインに反映されます。");
      setText("");

      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (err: any) {
      console.error("Supabase insert unexpected error:", err);
      alert(
        err?.message ??
          "予期せぬエラーが発生しました。時間をおいて再度お試しください。"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = MAX_LENGTH - text.length;

  return (
    <div className="app-root">
      <AppHeader title="投稿を作成" />

      <main className="app-main compose-main">
        {/* セラピストで、所属なしのときの案内（表示だけ） */}
        {currentRole === "therapist" && !checkingStatus && !canPost && (
          <div className="compose-block">
            <p className="compose-block-title">
              現在、所属店舗が無いため、投稿機能はご利用いただけません。
            </p>
            <p className="compose-block-text">
              店舗に所属してから、またここでの発信を再開できます。
            </p>
          </div>
        )}

        {/* ステータス判定中の軽い表示（任意） */}
        {currentRole === "therapist" && checkingStatus && (
          <div className="compose-block">
            <p className="compose-block-title">投稿可否を確認しています…</p>
            <p className="compose-block-text">
              少しだけお待ちください。通信状況によって数秒かかることがあります。
            </p>
          </div>
        )}

        {/* フォーム自体は常に描画する（Hydration対策・UI一貫性） */}
        <form onSubmit={handleSubmit}>
          {/* 投稿テキスト */}
          <div className="compose-card">
            <textarea
              className="compose-textarea"
              value={text}
              onChange={handleChange}
              placeholder="いまの気持ちや、残しておきたいことを自由に書いてください"
            />
            <div className="compose-footer">
              <span
                className={
                  remaining < 0
                    ? "compose-count compose-count--over"
                    : "compose-count"
                }
              >
                {remaining}
              </span>

              <button
                type="submit"
                className="compose-submit"
                disabled={!text.trim() || submitting || checkingStatus}
              >
                {submitting ? "送信中…" : "投稿する"}
              </button>
            </div>
          </div>

          {/* 公開範囲・返信可否設定 */}
          <div className="compose-card compose-settings">
            {/* エリア */}
            <div className="compose-setting-row">
              <div className="compose-setting-label">エリア</div>
              <div className="compose-setting-control">
                <select
                  className="compose-select"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                >
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
            </div>

            {/* 公開範囲（カラム未作成なら見た目だけ） */}
            <div className="compose-setting-row">
              <div className="compose-setting-label">公開範囲</div>
              <div className="compose-setting-control compose-visibility-toggle">
                <button
                  type="button"
                  className={
                    visibility === "public"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("public")}
                >
                  みんなに公開
                </button>

                <button
                  type="button"
                  className={
                    visibility === "limited"
                      ? "toggle-pill toggle-pill--active"
                      : "toggle-pill"
                  }
                  onClick={() => setVisibility("limited")}
                >
                  一部だけ
                </button>
              </div>
            </div>

            {/* 返信可否（カラム未作成なら見た目だけ） */}
            <div className="compose-setting-row">
              <div className="compose-setting-label">返信</div>
              <div className="compose-setting-control">
                <label className="compose-checkbox-label">
                  <input
                    type="checkbox"
                    checked={canReply}
                    onChange={(e) => setCanReply(e.target.checked)}
                  />
                  <span>この投稿への返信を許可する</span>
                </label>
              </div>
            </div>
          </div>
        </form>
      </main>

      <BottomNav active="compose" hasUnread={hasUnread} />

      <style jsx>{`
        .compose-main {
          padding: 12px 16px 140px;
        }

        .compose-card {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 12px 12px 8px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          margin-top: 12px;
        }

        .compose-textarea {
          width: 100%;
          min-height: 120px;
          border: none;
          outline: none;
          resize: none;
          background: transparent;
          font-size: 14px;
          line-height: 1.6;
        }

        .compose-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }

        .compose-count {
          font-size: 11px;
          color: var(--text-sub);
        }

        .compose-count--over {
          color: #e11d48;
        }

        .compose-submit {
          border-radius: 999px;
          border: none;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 500;
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 6px rgba(215, 185, 118, 0.45);
          cursor: pointer;
        }

        .compose-submit:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .compose-settings {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .compose-setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .compose-setting-label {
          font-size: 13px;
          color: var(--text-sub);
          flex-shrink: 0;
        }

        .compose-setting-control {
          flex: 1;
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }

        .compose-select {
          width: 140px;
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 4px 10px;
          font-size: 13px;
          background: #fff;
        }

        .compose-visibility-toggle {
          gap: 6px;
        }

        .toggle-pill {
          border-radius: 999px;
          border: 1px solid var(--border);
          padding: 4px 10px;
          font-size: 12px;
          background: #fff;
          cursor: pointer;
        }

        .toggle-pill--active {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }

        .compose-checkbox-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-sub);
        }

        .compose-block {
          margin-top: 24px;
          padding: 20px 16px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
        }

        .compose-block-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .compose-block-text {
          font-size: 13px;
          color: var(--muted-foreground);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}