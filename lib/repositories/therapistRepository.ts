// lib/repositories/therapistRepository.ts
import { supabase } from "@/lib/supabaseClient";
import type { UserId } from "@/types/user";
import type { DbTherapistRow, DbStoreRow } from "@/types/db";

/**
 * therapist 1件取得（id 指定）
 */
export async function getTherapistById(
  id: string
): Promise<DbTherapistRow | null> {
  const { data, error } = await supabase
    .from("therapists")
    .select(
      "id, user_id, store_id, display_name, area, profile, avatar_url, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "[therapistRepository.getTherapistById] Supabase error:",
      error
    );
    return null;
  }

  return data as DbTherapistRow | null;
}

/**
 * user_id から therapist を取得（MYPAGE 用など）
 */
export async function getTherapistByUserId(
  userId: UserId
): Promise<DbTherapistRow | null> {
  const { data, error } = await supabase
    .from("therapists")
    .select(
      "id, user_id, store_id, display_name, area, profile, avatar_url, created_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(
      "[therapistRepository.getTherapistByUserId] Supabase error:",
      error
    );
    return null;
  }

  return data as DbTherapistRow | null;
}

/**
 * セラピストに紐づく store を取得
 */
export async function getStoreForTherapist(
  therapist: DbTherapistRow
): Promise<DbStoreRow | null> {
  if (!therapist.store_id) return null;

  const { data, error } = await supabase
    .from("stores")
    .select(
      [
        "id",
        "owner_user_id",
        "name",
        "catch_copy",
        "area",
        "visit_type",
        "website_url",
        "line_url",
        "intro",
        "avatar_url",
        "reserve_notice",
        "dm_notice",
        "review_notice",
        "created_at",
      ].join(", ")
    )
    .eq("id", therapist.store_id)
    .maybeSingle();

  if (error) {
    console.error(
      "[therapistRepository.getStoreForTherapist] Supabase error:",
      error
    );
    return null;
  }

  return data as DbStoreRow | null;
}

/**
 * セラピストプロフィール更新
 * - display_name / area / profile の一部更新を想定
 */
export async function updateTherapistProfile(
  id: string,
  values: Partial<Pick<DbTherapistRow, "display_name" | "area" | "profile">>
): Promise<DbTherapistRow | null> {
  const { data, error } = await supabase
    .from("therapists")
    .update(values)
    .eq("id", id)
    .select(
      "id, user_id, store_id, display_name, area, profile, avatar_url, created_at"
    )
    .maybeSingle();

  if (error) {
    console.error(
      "[therapistRepository.updateTherapistProfile] Supabase error:",
      error
    );
    return null;
  }

  return data as DbTherapistRow | null;
}

/**
 * 指定店舗に属しているセラピスト一覧
 * - 店舗コンソールの「在籍セラピスト一覧」用
 */
export async function listTherapistsForStore(
  storeId: string
): Promise<DbTherapistRow[]> {
  const { data, error } = await supabase
    .from("therapists")
    .select(
      "id, user_id, store_id, display_name, area, profile, avatar_url, created_at"
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      "[therapistRepository.listTherapistsForStore] Supabase error:",
      error
    );
    return [];
  }

  return (data ?? []) as DbTherapistRow[];
}

/**
 * 「店舗にまだ紐づいていない」セラピスト候補一覧
 * - store_id IS NULL を候補定義として利用
 * - 将来的に users.role='therapist' JOIN に変える余地あり
 */
export async function listTherapistCandidates(): Promise<DbTherapistRow[]> {
  const { data, error } = await supabase
    .from("therapists")
    .select(
      "id, user_id, store_id, display_name, area, profile, avatar_url, created_at"
    )
    .is("store_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      "[therapistRepository.listTherapistCandidates] Supabase error:",
      error
    );
    return [];
  }

  return (data ?? []) as DbTherapistRow[];
}

/**
 * セラピストを店舗に紐づける
 * - therapists.store_id を更新するだけのシンプル版
 * - 店舗コンソールの「この店舗に紐づける」ボタンから使用
 */
export async function attachTherapistToStore(
  therapistId: string,
  storeId: string
): Promise<DbTherapistRow | null> {
  const { data, error } = await supabase
    .from("therapists")
    .update({ store_id: storeId })
    .eq("id", therapistId)
    .select(
      "id, user_id, store_id, display_name, area, profile, avatar_url, created_at"
    )
    .maybeSingle();

  if (error) {
    console.error(
      "[therapistRepository.attachTherapistToStore] Supabase error:",
      error
    );
    return null;
  }

  return data as DbTherapistRow | null;
}

// ★追加：users.name も同期して更新する版
export async function updateTherapistProfileAndUserName(args: {
  therapistId: string; // therapists.id
  userId: UserId;      // users.id (= auth.uid)
  values: Partial<Pick<DbTherapistRow, "display_name" | "area" | "profile">>;
}): Promise<DbTherapistRow | null> {
  const { therapistId, userId, values } = args;

  // display_name が入ってる時だけ users.name を同期
  const nextName =
    typeof values.display_name === "string" ? values.display_name.trim() : null;

  if (nextName && nextName.length > 0) {
    const { error: userErr } = await supabase
      .from("users")
      .update({ name: nextName })
      .eq("id", userId);

    if (userErr) {
      console.error(
        "[therapistRepository.updateTherapistProfileAndUserName] users update error:",
        userErr
      );
      return null;
    }
  }

  // therapists 側も更新（display_name/area/profile）
  const { data, error: thErr } = await supabase
    .from("therapists")
    .update(values)
    .eq("id", therapistId)
    .select("id, user_id, store_id, display_name, area, profile, avatar_url, created_at")
    .maybeSingle();

  if (thErr) {
    console.error(
      "[therapistRepository.updateTherapistProfileAndUserName] therapists update error:",
      thErr
    );
    return null;
  }

  return data as DbTherapistRow | null;
}