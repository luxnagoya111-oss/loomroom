// types/db.ts
// Supabase の各テーブルに対応する「生の行型」をまとめたファイル
// - ページ側は基本的にこの型を経由して DB 行を扱う
// - ビジネスロジック用の型（Post, DMThreadForUser など）は従来どおり types/* に置く

import type { Role, UserId } from "@/types/user";

// Supabase users.role は "user" | "therapist" | "store" 想定（guest は DB に保存しない）
export type DbUserRole = Exclude<Role, "guest">;

// ------------------------------
// users テーブル  A-1
// ------------------------------
export type DbUserRow = {
  id: UserId;          // uuid PK
  name: string;        // NOT NULL
  role: DbUserRole;    // 'user' | 'therapist' | 'store'
  avatar_url: string | null;
  created_at: string;  // timestamptz (ISO文字列)
};

// stores
export type DbStoreRow = {
  id: string;
  owner_user_id: UserId | null;
  name: string | null;
  catch_copy: string | null;
  area: string | null;
  description: string | null;        // ★ 追加
  visit_type: "online" | "offline" | null;
  website_url: string | null;
  line_url: string | null;
  intro: string | null;
  avatar_url: string | null;
  reserve_notice: boolean | null;
  dm_notice: boolean | null;
  review_notice: boolean | null;
  created_at: string;
};

// therapists
export type DbTherapistRow = {
  id: string;
  user_id: UserId;
  store_id: string | null;
  display_name: string | null;
  area: string | null;
  profile: string | null;
  avatar_url?: string | null;
  created_at: string;
};

// ------------------------------
// posts テーブル  A-2
// ------------------------------
export type DbPostRow = {
  id: string;
  author_id: UserId;      // 投稿者の users.id（※guest を許可したいなら UserId | null に変更）
  author_kind: DbUserRole; // "user" | "therapist" | "store"
  body: string;
  area: string | null;
  created_at: string;
  like_count: number;     // DEFAULT 0
  reply_count: number;    // DEFAULT 0
};

// ------------------------------
// post_likes テーブル  B-1
// ------------------------------
export type DbPostLikeRow = {
  id: string;        // uuid PK
  post_id: string;   // posts.id
  user_id: UserId;   // users.id
  created_at: string;
};

// ------------------------------
// relations テーブル（フォロー / ミュート / ブロック） B-2
// ------------------------------
export type DbRelationType = "follow" | "mute" | "block";

export type DbRelationRow = {
  id: string;
  user_id: UserId;      // 関係を持つ側（自分）
  target_id: UserId;    // 相手ユーザーID
  type: DbRelationType; // "follow" / "mute" / "block"
  created_at: string;
};

// ------------------------------
// DM 用テーブル  B-3 / B-4
// ------------------------------
export type DbDmThreadRow = {
  thread_id: string;     // = スレッドID（PK）
  user_a_id: UserId;
  user_b_id: UserId;
  last_message: string | null;
  last_message_at: string | null;
  unread_for_a: number;  // DEFAULT 0
  unread_for_b: number;  // DEFAULT 0
  created_at: string;
};

export type DbDmMessageRow = {
  id: string;            // uuid PK
  thread_id: string;     // dm_threads.thread_id
  from_user_id: UserId;
  text: string;
  created_at: string;
  is_read: boolean;      // DEFAULT false
};

// ------------------------------
// signup_applications テーブル  C-3
// ------------------------------
export type DbSignupType = "store" | "therapist" | "user";
export type DbSignupStatus = "pending" | "approved" | "rejected";

export type DbSignupApplicationRow = {
  id: string;

  applicant_user_id: string; // ★必須（auth.uid / uuid文字列）

  type: DbSignupType;        // "store" / "therapist" / "user"
  status: DbSignupStatus;    // pending / approved / rejected
  name: string;              // 申請者名 or 店名
  contact: string | null;    // 任意の連絡先
  payload: Record<string, any> | null; // フォームの中身
  created_at: string;
  reviewed_at: string | null;
};

// reports テーブル（通報）  C-4
export type DbReportTargetType = "post" | "user" | "store" | "therapist";

export type DbReportRow = {
  id: string;
  target_type: DbReportTargetType;
  target_id: string;     // posts.id / users.id / stores.id / therapists.id
  reporter_id: UserId;   // 通報したユーザー
  reason: string | null;
  created_at: string;
};

// 互換用：旧 postRepository 向けの別名
export type DbPostReportRow = DbReportRow;