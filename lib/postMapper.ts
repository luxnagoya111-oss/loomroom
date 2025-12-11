import type { Post } from "@/types/post";
import { timeAgo } from "@/lib/timeAgo";

export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  role: string;
  area: string;
  body: string;
  timeAgo: string;
  canReply: boolean;
};

export function mapToFeedPost(post: Post, profileName?: string): FeedPost {
  return {
    id: post.id,
    authorId: post.userId,
    authorName: profileName ?? "名無し",
    role: post.role,
    area: post.area,
    body: post.body,
    timeAgo: timeAgo(post.createdAt),
    canReply: post.canReply,
  };
}