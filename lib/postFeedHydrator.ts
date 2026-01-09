// lib/postFeedHydrator.ts
import { supabase } from "@/lib/supabaseClient";
import { toPublicHandleFromUserId } from "@/lib/handle";
import { timeAgo } from "@/lib/timeAgo";
import { resolveAvatarUrl, pickRawPostImages, resolvePostImageUrls } from "@/lib/postMedia";
import type { UserId } from "@/types/user";
import type { AuthorKind, DbPostRow } from "@/lib/repositories/postRepository";
import { fetchLikedPostIdsForUser } from "@/lib/repositories/postRepository";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string | null | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

export type UiPost = {
  id: string;

  // relations(mute/block) 判定用 canonical users.id
  authorId: string;

  authorKind: AuthorKind;
  authorName: string;
  authorHandle: string | null;

  avatarUrl: string | null;
  profilePath: string | null;

  body: string;
  createdAt: string;
  timeAgoText: string;

  imageUrls: string[];

  likeCount: number;
  liked: boolean;

  replyCount: number;
};

type DbUserRow = {
  id: string;
  name: string | null;
  role: AuthorKind | null;
  avatar_url: string | null;
};

type DbTherapistLite = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type DbStoreLite = {
  id: string;
  owner_user_id: string | null;
  name: string | null;
  avatar_url: string | null;
};

export async function hydratePosts(params: {
  rows: DbPostRow[];
  viewerUuid: UserId | null; // uuidのみ or null
}): Promise<UiPost[]> {
  const { rows, viewerUuid } = params;
  const rowsWithAuthor = rows.filter((r) => !!r.author_id);

  if (!rowsWithAuthor.length) return [];

  const authorIds = Array.from(
    new Set(rowsWithAuthor.map((r) => r.author_id).filter((v): v is string => !!v))
  );

  const therapistByUserId = new Map<string, DbTherapistLite>();
  const therapistById = new Map<string, DbTherapistLite>();
  const storeByOwnerId = new Map<string, DbStoreLite>();
  const storeById = new Map<string, DbStoreLite>();

  // therapists / stores を user_id/owner_user_id と id の両方で引けるように
  if (authorIds.length) {
    const { data: tByUser } = await supabase
      .from("therapists")
      .select("id, user_id, display_name, avatar_url")
      .in("user_id", authorIds);

    (tByUser ?? []).forEach((t: any) => {
      const r = t as DbTherapistLite;
      if (r.user_id) therapistByUserId.set(r.user_id, r);
      therapistById.set(r.id, r);
    });

    const { data: tById } = await supabase
      .from("therapists")
      .select("id, user_id, display_name, avatar_url")
      .in("id", authorIds);

    (tById ?? []).forEach((t: any) => {
      const r = t as DbTherapistLite;
      if (r.user_id) therapistByUserId.set(r.user_id, r);
      therapistById.set(r.id, r);
    });

    const { data: sByOwner } = await supabase
      .from("stores")
      .select("id, owner_user_id, name, avatar_url")
      .in("owner_user_id", authorIds);

    (sByOwner ?? []).forEach((s: any) => {
      const r = s as DbStoreLite;
      if (r.owner_user_id) storeByOwnerId.set(r.owner_user_id, r);
      storeById.set(r.id, r);
    });

    const { data: sById } = await supabase
      .from("stores")
      .select("id, owner_user_id, name, avatar_url")
      .in("id", authorIds);

    (sById ?? []).forEach((s: any) => {
      const r = s as DbStoreLite;
      if (r.owner_user_id) storeByOwnerId.set(r.owner_user_id, r);
      storeById.set(r.id, r);
    });
  }

  // users は uuid だけまとめて取る
  const resolvedUserIds = new Set<string>();
  authorIds.forEach((id) => {
    if (isUuid(id)) resolvedUserIds.add(id);
  });
  therapistById.forEach((t) => {
    if (t.user_id && isUuid(t.user_id)) resolvedUserIds.add(t.user_id);
  });
  storeById.forEach((s) => {
    if (s.owner_user_id && isUuid(s.owner_user_id)) resolvedUserIds.add(s.owner_user_id);
  });

  const userMap = new Map<string, DbUserRow>();
  const userIdsToFetch = Array.from(resolvedUserIds);
  if (userIdsToFetch.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, name, role, avatar_url")
      .in("id", userIdsToFetch);

    (users ?? []).forEach((u: any) => userMap.set(u.id, u as DbUserRow));
  }

  // liked は viewerUuid があるときだけ
  let likedSet = new Set<string>();
  if (viewerUuid && isUuid(viewerUuid)) {
    likedSet = await fetchLikedPostIdsForUser(viewerUuid);
  }

  return rowsWithAuthor.map((row) => {
    const rawAuthorId = row.author_id!;

    const inferredKind: AuthorKind =
      row.author_kind === "therapist" ||
      therapistByUserId.has(rawAuthorId) ||
      therapistById.has(rawAuthorId)
        ? "therapist"
        : row.author_kind === "store" || storeByOwnerId.has(rawAuthorId) || storeById.has(rawAuthorId)
        ? "store"
        : "user";

    const therapist =
      inferredKind === "therapist"
        ? therapistById.get(rawAuthorId) ?? therapistByUserId.get(rawAuthorId) ?? null
        : null;

    const store =
      inferredKind === "store"
        ? storeById.get(rawAuthorId) ?? storeByOwnerId.get(rawAuthorId) ?? null
        : null;

    // canonical user id（mute/block判定用）
    let canonicalUserId = rawAuthorId;
    if (inferredKind === "therapist" && therapist?.user_id) canonicalUserId = therapist.user_id;
    if (inferredKind === "store" && store?.owner_user_id) canonicalUserId = store.owner_user_id;

    const user = isUuid(canonicalUserId) ? userMap.get(canonicalUserId) ?? null : null;

    const roleName =
      inferredKind === "therapist"
        ? (therapist?.display_name ?? "").trim() || null
        : inferredKind === "store"
        ? (store?.name ?? "").trim() || null
        : null;

    const authorName =
      roleName ||
      ((user?.name ?? "").trim() || null) ||
      (inferredKind === "store" ? "店舗アカウント" : inferredKind === "therapist" ? "セラピスト" : "名無し");

    const authorHandle =
      isUuid(canonicalUserId) ? toPublicHandleFromUserId(canonicalUserId) : null;

    let profilePath: string | null = null;
    if (inferredKind === "therapist") {
      profilePath = therapist?.id ? `/therapist/${therapist.id}` : isUuid(canonicalUserId) ? `/mypage/${canonicalUserId}` : null;
    } else if (inferredKind === "store") {
      profilePath = store?.id ? `/store/${store.id}` : isUuid(canonicalUserId) ? `/mypage/${canonicalUserId}` : null;
    } else {
      profilePath = isUuid(canonicalUserId) ? `/mypage/${canonicalUserId}` : null;
    }

    const roleAvatarRaw =
      inferredKind === "therapist"
        ? therapist?.avatar_url ?? null
        : inferredKind === "store"
        ? store?.avatar_url ?? null
        : null;

    const userAvatarRaw = user?.avatar_url ?? null;

    const avatarUrl =
      resolveAvatarUrl(roleAvatarRaw) ?? resolveAvatarUrl(userAvatarRaw) ?? null;

    const rawImages = pickRawPostImages(row as any);
    const imageUrls = resolvePostImageUrls(rawImages);

    const likeCount = row.like_count ?? 0;
    const liked = likedSet.has(row.id);

    return {
      id: row.id,
      authorId: isUuid(canonicalUserId) ? canonicalUserId : rawAuthorId,
      authorKind: inferredKind,
      authorName,
      authorHandle,
      avatarUrl,
      profilePath,
      body: row.body ?? "",
      createdAt: row.created_at,
      timeAgoText: timeAgo(row.created_at),
      imageUrls,
      likeCount,
      liked,
      replyCount: row.reply_count ?? 0,
    };
  });
}