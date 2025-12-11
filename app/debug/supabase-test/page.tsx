"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PostRow = {
  id: string;
  body: string;
  area: string | null;
  created_at: string;
};

export default function SupabaseTestPage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("posts")
        .select("id, body, area, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        console.error("Supabase error:", error);
        const msg =
          (error as any).message ??
          JSON.stringify(error, Object.getOwnPropertyNames(error));

        setError(msg);
        setPosts([]);
      } else {
        setError(null);
        setPosts((data ?? []) as PostRow[]);
      }
      setLoading(false);
    }

    load();
  }, []);

  return (
    <main className="min-h-screen p-4">
      <h1 className="text-lg font-bold mb-4">Supabase 接続テスト</h1>

      {loading && <p>読み込み中...</p>}

      {error && (
        <p className="text-red-500 mb-4">
          エラー: {error}
        </p>
      )}

      {!loading && !error && posts.length === 0 && (
        <p>投稿がまだありません。</p>
      )}

      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((p) => (
            <div
              key={p.id}
              className="border border-gray-200 rounded-md p-3 text-sm"
            >
              <div className="text-xs text-gray-500 mb-1">
                {new Date(p.created_at).toLocaleString()} / {p.area ?? "エリアなし"}
              </div>
              <div>{p.body}</div>
            </div>
          ))}

          <pre className="mt-4 text-xs whitespace-pre-wrap bg-gray-100 p-3 rounded">
            {JSON.stringify(posts, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}