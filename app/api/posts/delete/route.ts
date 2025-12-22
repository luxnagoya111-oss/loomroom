// app/api/posts/delete/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AuthorKind = "user" | "therapist" | "store";

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const postId = body?.postId as string | undefined;
    if (!postId || typeof postId !== "string") {
      return NextResponse.json({ error: "missing_postId" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "missing_env" }, { status: 500 });
    }

    // token → user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    const viewerId = userData.user.id;

    // post 取得（service role）
    const { data: post, error: postErr } = await supabaseAdmin
      .from("posts")
      .select("id, author_id, author_kind, reply_to_id")
      .eq("id", postId)
      .maybeSingle();

    if (postErr) {
      console.error("[api/posts/delete] fetch post error:", postErr);
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const authorId = (post as any).author_id as string | null;
    const authorKind = (post as any).author_kind as AuthorKind | null;

    // ===== 所有者判定 =====
    let canDelete = false;

    // 1) users 投稿（または揺れ）：author_id が viewer uuid と一致
    if (authorId && authorId === viewerId) canDelete = true;

    // 2) therapist 投稿：author_id が therapists.id で、therapists.user_id が viewer uuid
    if (!canDelete && authorKind === "therapist" && authorId) {
      const { data: th, error: thErr } = await supabaseAdmin
        .from("therapists")
        .select("id, user_id")
        .eq("id", authorId)
        .maybeSingle();

      if (thErr) {
        console.error("[api/posts/delete] therapist check error:", thErr);
      } else if (th && (th as any).user_id === viewerId) {
        canDelete = true;
      }
    }

    // 3) store 投稿：author_id が stores.id で、stores.owner_user_id が viewer uuid
    if (!canDelete && authorKind === "store" && authorId) {
      const { data: st, error: stErr } = await supabaseAdmin
        .from("stores")
        .select("id, owner_user_id")
        .eq("id", authorId)
        .maybeSingle();

      if (stErr) {
        console.error("[api/posts/delete] store check error:", stErr);
      } else if (st && (st as any).owner_user_id === viewerId) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // ===== 付随データ削除 =====
    // 返信（子）もまとめて消す（必要なければこのブロックは削ってOK）
    const { error: delRepliesErr } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("reply_to_id", postId);

    if (delRepliesErr) {
      console.error("[api/posts/delete] delete replies error:", delRepliesErr);
      // 返信削除失敗でも親を消すかは好み。ここでは止めずに継続。
    }

    // like も消す
    const { error: delLikesErr } = await supabaseAdmin
      .from("post_likes")
      .delete()
      .eq("post_id", postId);

    if (delLikesErr) {
      console.error("[api/posts/delete] delete likes error:", delLikesErr);
      // これも止めずに継続
    }

    // 親投稿削除
    const { error: delPostErr } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("id", postId);

    if (delPostErr) {
      console.error("[api/posts/delete] delete post error:", delPostErr);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/posts/delete] unexpected:", e);
    return NextResponse.json({ error: e?.message ?? "unknown_error" }, { status: 500 });
  }
}