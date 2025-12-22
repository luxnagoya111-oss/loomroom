// lib/repositories/searchRepository.ts
import { supabase } from "@/lib/supabaseClient";

export type TherapistHit = {
  id: string;
  kind: "therapist";
  name: string;
  avatar_url: string | null;
};

export async function searchTherapists(
  keyword: string
): Promise<TherapistHit[]> {
  const { data, error } = await supabase
    .from("therapists")
    .select("id, display_name, avatar_url")
    .ilike("display_name", `%${keyword}%`)
    .limit(20);

  if (error) throw error;

  return (
    data?.map((r) => ({
      id: r.id,
      kind: "therapist",
      name: r.display_name ?? "",
      avatar_url: r.avatar_url,
    })) ?? []
  );
}