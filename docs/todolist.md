0. フェーズ0：共通ルールの固定・整理（忘れないための土台）
- 目的：「これが正解」というルールをコードで固定するフェーズ。
- ID体系をコードで統一
-  lib/auth.ts
- getCurrentUserId() を 1か所で定義（今もうあるやつを「正」とする）。
- ゲスト時は guest-xxxxx 形式（contactページでやってるのと同じロジック）に揃える。
-  @/types/user.ts 的なファイルを作って：
- export type Role = "guest" | "user" | "therapist" | "store";
- export type UserId = string;（後で u_, t_, s_ に寄せる土台）
-  「IDとURLの対応」をコメントで明文化した小さい doc を置く（docs/id-rules.md など）
- DMの threadId ルールを1か所に集約（もうあるやつを「公式」に）
-  lib/dmThread.ts を“ソース・オブ・トゥルース”として整理
- makeThreadId(userA: string, userB: string)
- parseThreadId(threadId: string): [string, string]
- getPartnerIdFromThread(thread: DMThread, currentUserId: string)
-  コメントで仕様書の「6.1.2 threadId ルール」をそのまま書いておく。
- DMストレージの“現行正解”を固定
-  lib/dmStorage.ts を読み直して、以下が揃っているか確認＆コメント追記：
- loadThreads()
- loadMessagesForThread(threadId)
- appendMessageToThread(threadId, fromUserId, text)
- markThreadAsRead(threadId, userId)
-  API版（/app/api/messages〜）には一切触れないでおく
- → コメントで「将来サーバー実装用」と明記。

1. フェーズ1：アカウント / ロール / 18歳確認の土台
- 18歳確認モーダル（ログイン前）
-  components/AgeGate.tsx 作成：
- localStorage loomroom_age_confirmed_v1 = "yes" を見て表示/非表示。
- 「はい（18歳以上です）」→ yes 保存
- 「いいえ」→ window.location.href = "https://www.google.com" とかで退避。
-  app/layout.tsx で <AgeGate /> を全ページにかぶせる。
- ユーザー種別（role）の基礎
-  lib/auth.ts に getCurrentUserRole() 追加（暫定でこう運用）：
- guest- から始まるID → "guest"
- u_ から始まるID → "user"
- t_ → "therapist"
- s_ → "store"
- まだID発行してない間は "guest" 扱い。
-  将来 /signup 系で u_/t_/s_ を発行する想定コメントだけ入れておく。
- まだのページがあればプレースホルダーだけ作る
-  /signup（一般ユーザー仮ページ）
-  /signup/creator（店舗・セラピスト用の入口だけ）
- → 中身は「準備中」でOK。とりあえず URL だけ確保。

2. フェーズ2：プロフィール周りを v1 完成まで持っていく
- もうかなり進んでるところの仕上げ。
- 一般ユーザーの公開マイページ（今の /mypage/[id]）
-  仕様7.1の項目が全て表示されているかチェック：
- ニックネーム = displayName（OKっぽい）
- アイコン = AvatarUploader+localStorage（OK）
- エリア
- 一言プロフィール（intro）
- メッセージポリシー
- 任意タグ（これはまだなら後回しでもいい）
-  dm-inline-btn の ✉ → makeThreadId(currentUserId, userId) でリンク（もうやったやつの確認）
- セラピスト公開ページ /therapist/[id]
-  ファイルを一度全部貼って、「必要項目」が揃ってるか最終調整：
- 活動名
- エリア
- プロフィール文章
- 雰囲気タグ（MATCH AIタグ流用は「後フェーズでもOK」）
- 過ごし方タグ
- 紹介文
-  ✉ ボタン → makeThreadId(currentUserId, therapistId) でリンク済みか確認。
- 店舗ページ /store/[id]（今のやつ）
-  仕様 7.3 の項目が揃ってるか最終調整：
- 店舗名（storeName）
- ロゴ（storeAvatar）
- エリア（areaLabel）
- 店舗情報（「お店について」カード）
- 所属セラピスト一覧（在籍カード）
-  在籍セラピストのIDを t_xxxx 形式に寄せていく準備（今は何でもOKだけど将来のためコメント追加）。

3. フェーズ3：DM機能 v1 を仕様書どおりに締める
- 今のローカルDMを「6.1の仕様」にフィットさせるフェーズ。
- スレ生成タイミング（仮スレ→初回メッセージで本作成）
-  /messages/[id]/page.tsx：
- ページ表示時点で loadMessagesForThread(threadId) した結果が 0件なら
- → loadThreads() にもまだ entryを作らないようにする（現状OKっぽいか確認）。
-  appendMessageToThread() 側：
- 初回メッセージ送信時に、
- threads の方に lastMessage, lastMessageAt 付きで新規作成。
- 2回目以降は更新だけ。
-  /messages/page.tsx：
- loadThreads() の結果に 1件以上 message があるものだけ出る状態か確認。
- もし thread だけあってmessages 0件がありうるコードならフィルタを入れる。
- メッセージ送信後の一覧更新ルール
-  appendMessageToThread() で毎回：
- 該当threadの lastMessage / lastMessageAt を更新。
-  /messages/page.tsx 側で：
- loadThreads() 結果を lastMessageAt 降順で sort（もうやってるので確認）。
- 未読管理（ローカル版）
-  現状の markThreadAsRead() + isUnread() ロジックを確認：
- loomroom_dm_lastRead_${threadId}_${userId} のタイムスタンプ基準。
- 詳細画面を開いたときに markThreadAsRead(threadId, currentUserId) 呼んでいるか → OK。
-  /messages/page.tsx：
- isUnread() の結果を unreadCount: 0 | 1 にしてバッジ表示（今の仕様通りでOK）。
- DM遷移ルールの徹底（あらゆる✉を統一）
-  /mypage/[id] の ✉ → /messages/{makeThreadId(currentUserId, userId)}
-  /therapist/[id] の ✉ → 同上
-  /store/[id] の ✉ → 同上
- → ここは「IDだけ」渡す形を廃止して、必ず threadId で渡す。

4. フェーズ4：タイムライン / 投稿機能 v1
- ここから「SNSらしさ」を出すところ。ざっくり v1 を決める。
- 投稿データ構造の決定
-  @/types/post.ts 的なファイル：
- export type PostId = string;
- export type Post = {
-   id: PostId;
-   userId: string;      // 投稿者ID（u_ / t_ / s_）
-   role: "user" | "therapist" | "store";
-   area: Area;          // 投稿時点のエリア
-   body: string;
-   createdAt: string;   // ISO
- };
-  とりあえず localStorage or lib/postStorage.ts で実装する前提にしておく（後でAPI化）。
- 投稿作成UI
-  /post or ホーム画面上部に「投稿モーダル」：
- テキストエリア
- エリア選択
- 投稿ボタン（無所属セラピストの場合は後述の制限）。
- タイムライン表示
-  / ホーム：「みんなの投稿」TL
- 全投稿を createdAt 降順で表示。
- エリアフィルタ / ロールフィルタ UI（仕様4）を上部に設置。
-  /home など：「フォローのみ」TL
- following リスト（仮にlocalStorage）を作る。
- post.userId が自分 + follow先のものだけ表示。

5. フェーズ5：フォロー / ミュート / ブロック
- 最低限のデータ構造とUIだけ先に作る。ロジックはあとから強化でOK。
- データ構造（localStorage / future DB）
-  lib/relationStorage.ts 的なもの：
- export type Relation = {
-   userId: string;           // 自分
-   targetId: string;         // 相手
-   type: "follow" | "mute" | "block";
-   createdAt: string;
- };
-  とりあえず「自分の follow/mute/block リスト」をlocalStorageで管理。
- UI
-  各プロフィールページに3ボタン（or メニュー）：
- フォロー / フォロー解除
- ミュート / ミュート解除
- ブロック / ブロック解除（警告モーダル付き）
-  TL側フィルタ：
- ミュートされた相手 → TL非表示
- ブロックされた相手 → TL/DMともに出ない

6. フェーズ6：ロール別制御（誰が誰にDMできるか / 投稿できるか）
- 仕様の「6」「13」をコードに落とし込むフェーズ。
- DM送受信のルール
-  lib/dmPolicy.ts を作る：
- export function canSendDm(fromRole: Role, toRole: Role, isReply: boolean): boolean;
- 一般 → セラピスト：true
- セラピスト → 一般：返信のみ true（＝セラピストが自分から最初の一通は送れない）
- 一般 → 一般：false
-  /messages/[id] の送信ボタン押下前に canSendDmでチェックし、NGならアラート＆送信しない。
- 無所属セラピスト制限（12）
-  セラピストの状態をどこに持つか一旦決める（localStorage / 仮データ）：
- status: "active" | "unaffiliated"
-  canSendPost(role, status) 的な関数を作り：
- 無所属セラピスト（status="unaffiliated"） → 投稿不可、DM返信も不可。
-  UI側：
- 無所属時は「投稿ボタン」「DM返信テキストエリア」ごと非表示。
- DM画面では「現在、所属店舗が無いため、ご返信ができません。」の固定文だけ出す。

7. フェーズ7：店舗審査 & signup フローの下地
- ここは本格リリース前のフェーズだと思っていい。ざっくりやることだけ先に決めておく。
- 店舗審査フォーム（管理者側だけでOK）
-  /admin/stores 的なページで「店舗申請一覧」を仮表示（今は手動でもOK）。
-  審査結果を status: "pending" | "approved" | "rejected" で保存する想定。
- signup フローの骨組み
-  /signup：
- ニックネーム・生年月日・エリア入力 → u_xxxx 発行 → /mypage/u_xxxx にリダイレクト（今はlocalStorageでもOK）
-  /signup/creator：
- 「店舗として登録したい」「セラピストとして登録したい」を選ばせるところまで。
- このあたりは後ろに回してもいいから、「やるならここ」という位置づけでOK。

8. フェーズ8：安全設計・規約・通報機能
- 利用規約ページ（もうあるやつ）
-  今の /terms を「正式版」っぽくブラッシュアップするのは後でも良いけど、
-  仕様の要点（18歳以上 / 禁止事項 / 免責 / 管轄）をすでに入れてあるので とりあえずOK。
- プライバシーポリシー / ガイドライン
-  /privacy /guideline ページをシンプルに用意。
-  プロフィールや投稿画面のどこかからリンク。
- 通報機能（最低限）
-  各ポストとプロフィールに「・・・」メニューから「通報」ボタンを付ける。
-  クリックしたら console.log("report:", targetType, targetId) 程度の仮処理 → 後でAPIに接続。

9. フェーズ9：サーバー保存 / API実装（完全版へのステップ）
- ここはプロト完成後に一気にやる領域。
-  /app/api/messages/* を dmStorage からDBベースに置き換える。
-  /app/api/posts/* を作り、TLをAPI経由に。
-  /app/api/users/* でプロフィール／フォロー情報を保存。
-  ローカルストレージを徐々に「キャッシュ扱い」に変えていく。




最初に「絶対やるべき優先セット」
- 「今週やるべきセット」だけ抽出するとこんな感じ：
- フェーズ0
- lib/dmThread.ts / lib/dmStorage.ts / lib/auth.ts を
- “正解版”としてコメント整備＋軽くリファクタ。
- フェーズ2
- /mypage/[id] /therapist/[id] /store/[id] を
- 仕様7系チェックして不足があれば埋める。
- すべての ✉ を makeThreadId(currentUserId, targetId) ベースに統一。
- フェーズ3
- DM周り（スレ生成・lastMessage更新・未読）の挙動を
- 一度全部テストして「OKな状態」まで持っていく。
- ここまで行けると、
- 「プロト版 LoomRoom としての DM + プロフィール + 店舗紐付け」は一旦完成ライン。
- そのあと TL / 投稿 / フォロー に進んでも、土台がブレにくくなる。