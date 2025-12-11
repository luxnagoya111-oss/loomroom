// lib/postStorage.ts
// ローカルストレージ版 投稿ストレージ（タイムライン v1 用）

import type { Post, PostId, PostVisibility } from "@/types/post";
import type { Role, UserId } from "@/types/user";

const POSTS_KEY = "loomroom_posts_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function generatePostId(): PostId {
  // とりあえず 時刻 + ランダム を使ったシンプルなID
  return `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * すべての投稿を取得
 */
export function loadAllPosts(): Post[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(POSTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Post[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * 全投稿の保存（内部用）
 */
function saveAllPosts(list: Post[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(POSTS_KEY, JSON.stringify(list));
}

/**
 * 1件の投稿を先頭に追加
 */
export function addPost(post: Post): void {
  const list = loadAllPosts();
  list.unshift(post); // 新しいものを先頭に
  saveAllPosts(list);
}

/**
 * 新規投稿を生成して保存するヘルパー
 */
export type CreatePostInput = {
  userId: UserId;
  role: Role;
  body: string;
  area?: string;
  visibility?: PostVisibility;
  canReply?: boolean;
};

export function createPost(input: CreatePostInput): Post {
  const nowIso = new Date().toISOString();

  const post: Post = {
    id: generatePostId(),
    userId: input.userId,
    role: input.role,
    body: input.body,
    area: input.area ?? "未設定",
    visibility: input.visibility ?? "public",
    canReply: input.canReply ?? true,
    createdAt: nowIso,
  };

  addPost(post);
  return post;
}

/**
 * タイムライン用：条件でフィルタして、新しい順に並べる
 *
 * - areaFilter: "all" のときはエリア無視
 * - roleFilter: "all" のときはロール無視
 */
export function loadTimelinePosts(options?: {
  areaFilter?: string | "all";
  roleFilter?: Role | "all";
}): Post[] {
  const { areaFilter = "all", roleFilter = "all" } = options || {};
  const all = loadAllPosts();

  const filtered = all.filter((p) => {
    if (areaFilter !== "all" && p.area !== areaFilter) return false;
    if (roleFilter !== "all" && p.role !== roleFilter) return false;
    return true;
  });

  return filtered.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}