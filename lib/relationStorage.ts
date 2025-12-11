// lib/relationStorage.ts
// フォロー / ミュート / ブロックのローカルストレージ管理
//
// - 仕様書 5. ユーザー関係（フォロー / ミュート / ブロック）に対応
// - 1ユーザー視点で「自分 → 相手」の関係のみを保存する
// - 将来 API / DB 化する際も、この型と関数名をベースにできるようにしておく

import type { UserId } from "@/types/user";

export type RelationType = "follow" | "mute" | "block";

export type Relation = {
  userId: UserId;      // 自分
  targetId: UserId;    // 相手
  type: RelationType;  // 種別
  createdAt: string;   // ISO
};

export type RelationFlags = {
  following: boolean;
  muted: boolean;
  blocked: boolean;
};

const STORAGE_KEY = "loomroom_relations_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function loadAllRelations(): Relation[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 型までは厳密チェックしない（将来のマイグレーション用余白）
    return parsed as Relation[];
  } catch {
    return [];
  }
}

function saveAllRelations(relations: Relation[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(relations));
  } catch {
    // quota exceeded 等は握りつぶす（UIだけの機能なので致命的ではない）
  }
}

/**
 * あるユーザー視点での「自分 → 相手」の状態（フォロー / ミュート / ブロック）を返す
 */
export function getRelationFlags(
  userId: UserId | null | undefined,
  targetId: UserId | null | undefined,
  all?: Relation[]
): RelationFlags {
  if (!userId || !targetId || userId === targetId) {
    return { following: false, muted: false, blocked: false };
  }
  const list = (all ?? loadAllRelations()).filter(
    (r) => r.userId === userId && r.targetId === targetId
  );
  return {
    following: list.some((r) => r.type === "follow"),
    muted: list.some((r) => r.type === "mute"),
    blocked: list.some((r) => r.type === "block"),
  };
}

/**
 * 単一の関係種別を ON/OFF する
 *
 * - block を ON にする場合は、同じ相手への follow / mute を自動的に解除する
 * - block を OFF にする場合は、その block のみ削除する
 * - follow / mute を ON にする場合は、相手への block を自動的に解除する
 */
export function setRelation(
  userId: UserId | null | undefined,
  targetId: UserId | null | undefined,
  type: RelationType,
  enabled: boolean
): RelationFlags {
  if (!userId || !targetId || userId === targetId || !isBrowser()) {
    return { following: false, muted: false, blocked: false };
  }

  let all = loadAllRelations();

  if (!enabled) {
    // 該当関係のみ削除
    all = all.filter(
      (r) =>
        !(
          r.userId === userId &&
          r.targetId === targetId &&
          r.type === type
        )
    );
  } else {
    const now = new Date().toISOString();

    if (type === "block") {
      // ブロックする場合：同じ相手への follow / mute / block を全て削除 → block だけ追加
      all = all.filter(
        (r) =>
          !(
            r.userId === userId &&
            r.targetId === targetId &&
            (r.type === "follow" || r.type === "mute" || r.type === "block")
          )
      );
      all.push({ userId, targetId, type: "block", createdAt: now });
    } else {
      // follow / mute は対象 type + block の既存レコードを消してから追加
      all = all.filter(
        (r) =>
          !(
            r.userId === userId &&
            r.targetId === targetId &&
            (r.type === type || r.type === "block")
          )
      );
      all.push({ userId, targetId, type, createdAt: now });
    }
  }

  saveAllRelations(all);
  return getRelationFlags(userId, targetId, all);
}

/**
 * TL用のフィルタ：閲覧者から見て「この投稿者の投稿を隠すべきか？」
 *
 * - muted または blocked の場合 → true
 * - 自分自身の投稿は常に表示（自分→自分の関係は UI 上作らない前提）
 */
export function shouldHideFromTimeline(
  viewerId: UserId | null | undefined,
  authorId: UserId | null | undefined
): boolean {
  if (!viewerId || !authorId || viewerId === authorId) return false;
  const flags = getRelationFlags(viewerId, authorId);
  return flags.muted || flags.blocked;
}