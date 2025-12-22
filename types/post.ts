// types/post.ts
// LRoom 内の1件の投稿データ定義

import type { Role, UserId } from "@/types/user";

export type PostId = string;
export type PostVisibility = "public" | "limited";

export type Post = {
  id: PostId;
  userId: UserId;          // 投稿者ID（guest-xxx / u_xxx / t_xxx / s_xxx）
  role: Role;              // "guest" | "user" | "therapist" | "store"
  area: string;            // とりあえず string。後で "中部" などに正規化してもOK
  body: string;
  visibility: PostVisibility;
  canReply: boolean;
  createdAt: string;       // ISO文字列
};