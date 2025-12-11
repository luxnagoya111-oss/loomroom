# LoomRoom ID / URL / DM ルール（v1）

最終更新: 2025-12-05

## 1. ユーザーIDとURLの対応

仕様書「9. 内部ID体系（URLと完全連動）」をコード化したルール。:contentReference[oaicite:2]{index=2}

- 一般ユーザー
  - ID: `u_xxxxx`
  - URL: `/mypage/u_xxxxx`

- セラピスト
  - ID: `t_xxxxx`
  - URL: `/therapist/t_xxxxx`

- 店舗
  - ID: `s_xxxxx`
  - URL: `/store/s_xxxxx`

- ゲスト
  - ID: `guest-xxxxxx`（`lib/auth.getCurrentUserId()` が自動発行）
  - 専用プロフィールURLは持たない（画面上は「ゲスト」として扱う）

## 2. ロール定義

`types/user.ts` に定義：

```ts
export type Role = "guest" | "user" | "therapist" | "store";
export type UserId = string;

---

## このフェーズでやれたこと・まだ触っていないもの

### 完了（フェーズ0の範囲）

- `getCurrentUserId()` を **一元化** ＋ `guest-xxxxxx` 自動発行に統一
- `Role` / `UserId` / `DM*` 型を `@/types` 配下に固定
- `threadId` 生成／パース／相手ID取得を `lib/dmThread.ts` に集約
- ローカル版 DM ストレージ `lib/dmStorage.ts` を「現行正解」として実装
- `docs/id-rules.md` に ID・URL・threadId のルールを文章化

### まだ手を付けていない（次フェーズ以降）

- フェーズ1の `AgeGate`（18歳確認モーダル）・`getCurrentUserRole()` 実装
- プロフィール v1 完成（エリア・タグなどの整理）
- DM API 版（`app/api/messages/*` / `lib/data/messages.ts`）の整理
- TL / 投稿機能 / フォロー・ミュート・ブロック など

---

次の一手としては、  
このフェーズ0のコードを一度貼り込んでビルドが通るかだけ確認してもらえれば十分です。  

その上で、次のチャットでは **フェーズ1（AgeGate＋Role判定＋/signup プレースホルダ）** に進めます。