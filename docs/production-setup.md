# LoomRoom 本番環境セットアップ手順
- このドキュメントは、LoomRoom を「localhost のお試し環境」から  
- 「Vercel + Supabase 上で本番運用する」ための手順とルールをまとめたものです。

## 1. 必要な外部サービス
- GitHub リポジトリ（LoomRoom 本体）
- Vercel アカウント
  - GitHub 連携済みであること
- Supabase プロジェクト（既に開発で使用中のもの）
  - 当面は **dev 兼 prod として 1プロジェクト** を使う前提
将来的に dev / prod を分けたくなった場合は、このドキュメントに追記する。


## 2. 環境変数（Environment Variables）
- LoomRoom のコードは、Supabase 接続情報を **1箇所（`lib/supabaseClient.ts`）** から読み込む。
```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);