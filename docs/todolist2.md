前提（今ここ）
- Next.js プロジェクト（LRoom）はローカルで動いている
- TL / 投稿 / DM / フォロー / ミュート / ブロック / 通報 / signup など一通り UI はできている
- Supabase プロジェクト作成済み（URL / Publishable key を .env.local 済み）
- supabaseClient.ts も作成済み
- まだ DB テーブルはない／ローカルストレージで動いている
- ここから「全部サーバー保存＋本番運用前提」に持っていくロードマップです。

ロール定義（“完成”をはっきりさせる）
- このロードマップで目指す「完成」は：
- - 主要データ（ユーザー／店舗／セラピスト／投稿／DM／フォロー等）が Supabase に保存される
- - 3ロール（user / therapist / store）がそれぞれログインして、自分の情報・投稿・DM を扱える
- - 安全系（通報・ブロック・ミュート）が最低限サーバー側でも機能する
- - LRoom を Vercel + Supabase で本番ドメイン（仮）にデプロイして、テストユーザーに配れる状態
- ここまでを「v1完成」とします。

1. フェーズ1：DB設計とテーブル作成（完了）
- まずは 土台のDBを固めるフェーズ。
- ここができると後は画面を Supabase に差し替える作業になります。
- 1-1. コアテーブル作成
- - Supabase の Table Editor で作るテーブル：
- - users
- - LRoom 上のアカウント（一般ユーザー／セラピスト／店舗）
- - profiles（任意：usersを分割したい場合）
- - 表示名・アイコン・エリアなど
- - stores
- - 店舗アカウント詳細（店名・エリア・説明文など）
- - therapists
- - セラピストアカウント詳細（紐づく store / 自己紹介等）
- 1-2. SNSデータ用テーブル
- - posts
- - TL投稿（本文・エリア・種別：user / therapist / store）
- - post_likes
- - いいね（誰がどの投稿にいいねしたか）
- - post_reports
- - 通報（誰がどの投稿をどの理由で通報したか）
- - relations
- - follow / mute / block（自分→相手の関係）
- 1-3. DM用テーブル
- - dm_threads
- - スレッド単位：userA / userB / lastMessage / lastMessageAt / unreadForA/B
- - dm_messages
- - 各メッセージ：threadId / fromUserId / text / createdAt / readフラグ
- 1-4. signup / 審査用テーブル
- - signup_applications
- - 店舗・セラピストの申請内容（今の /signup 系のフォームの保存先）
- - store_reviews（任意）
- - LoomRoom内での店舗レビューやステータス管理用
- 1-5. RLS（Row Level Security）のON
- - 各テーブルで RLS を有効化し、最低限のポリシーだけ用意：
- - users / profiles：
- - 自分の行は自分だけ更新可
- - 読み取りは基本公開
- - posts：
- - insert：ログインユーザーのみ
- - update/delete：投稿者のみ
- - select：公開
- - dm_* / relations：
- - 当事者のみ読める／書ける
- - （ポリシーの文章は後で一緒に作れば良い）

2. フェーズ2：アプリ側共通レイヤーづくり（完了）
- 直接ページから Supabase を叩かず、「共通関数」を一旦挟む構造にしておくと、後からの拡張が楽になります。
- 2-1. 型定義の整理
- - types/db.ts
- - UserRow, PostRow, DMThreadRow, DMMessageRow, RelationRow …
- - 既にある types/dm.ts, types/user.ts との整合性を取る
- 2-2. Repositoryレイヤー
- - lib/repositories/ 以下にファイルを切るイメージ：
- - userRepository.ts
- - getUserById(userId)
- - createUserFromSignup(...) など
- - postRepository.ts
- - createPost(...)
- - fetchTimelinePostsForUser(currentUserId, filters)
- - dmRepository.ts
- - getThreadsForUser(currentUserId)
- - sendMessage(threadId, fromUserId, text)
- - relationRepository.ts
- - follow(targetId) / mute(targetId) / block(targetId) …
- - 全部 Supabase のクエリはこのレイヤーに集約。

3. フェーズ3：投稿（TL）を Supabase に移行
- まずは一番分かりやすい「投稿／タイムライン」から Supabase 化。
- 3-1. 投稿作成（/compose）をSupabase保存に
- - いま：localStorage に保存
- - 変更後：
- - postRepository.createPost() を呼ぶ
- - 成功したら TL キャッシュ（localStorage）を更新 or 削除
- - エラー時のメッセージ（Toast程度）を表示
- 3-2. ホームTL（/）を Supabase 取得に
- - いま：loadTimelinePosts() が localStorage 版
- - 変更後：
- - fetchTimelinePostsForUser(currentUserId, filters) で Supabase から取得
- - もともとの Post 型に map する関数を用意
- - ローディング中表示・エラー表示を軽く追加
- 3-3. フィルタ・いいね・通報の Supabase 対応
- - いいね：
- - クリック → post_likes insert / delete
- - カウントは view で count() するか、posts.like_count を更新するか検討
- - 通報：
- - クリック → post_reports に1行追加
- - 将来、管理画面で一覧できるようにする前提

4. フェーズ4：フォロー / ミュート / ブロックのサーバー化
- 4-1. relations テーブルとの接続
- - プロフィール画面の「フォロー / ミュート / ブロック」ボタン：
- - Supabase に insert/delete
- - Relation の type は "follow" | "mute" | "block"
- 4-2. TL側フィルタを Supabase ベースで
- - TL取得時のクエリで：
- - 自分が mute / block している相手の post を除外
- - DM一覧も、block 相手のスレッドは表示しないようにする

フェーズ4.5：ログイン＆アカウント基盤
- 目的： 「会員 = uuid / ゲスト = guest-xxxx」を確定させて、
- relations・DM などサーバー機能の前提を固める。
- Supabase Auth 導入
- メール＋パスワード（もしくはメールリンク）でログイン。
- プロバイダ連携（X / Google）は後回し。
- users テーブルと Auth uid の統一
- users.id = auth.uid()（UUID）を正解にする。
- ログイン完了時：
- users に該当行が無ければ insert（role = "user"）
- あれば更新（名前など）
- → Next.js 側の API か Supabase Trigger のどちらか1か所で upsert ロジックを持つ。
- getCurrentUserId() の整理
- ログイン済み：supabase.auth.getUser() の user.id（uuid）を返す。
- 未ログイン：これまで通り guest-xxxx を返す。
- これにより：
- relations / DM / reports は「uuidユーザーのみ有効」
- ゲストは「読むだけ / TL投稿だけ（必要なら）」に切り分け。
- ログイン UI / 導線
- /login ページを作成：
- シンプルな「メール / パスワード」＋新規登録フォーム。
- BottomNav：
- 「マイページ」タップ時：
- currentUserId が guest- 系 → /login へ
- uuid → /mypage/[id] へ
- ログアウト：
- supabase.auth.signOut() をラップした logout() 関数を1か所に定義。

5. フェーズ5：DM（メッセージ）のサーバー化
- 目的： いまのローカル DM を、Supabase 上の正式 DM に移行。
- スレッド一覧 /messages
- dm_threads テーブルから
- userAId = currentUserId OR userBId = currentUserId の行を取得。
- lastMessage, lastMessageAt, unreadForA/B をそのまま UI に表示。
- relations の block 状態を見て、ブロック相手のスレッドは非表示。
- スレッド詳細 /messages/[threadId]
- dm_messages から threadId ごとのメッセージ一覧を取得。
- 送信時：
- dm_messages に insert。
- 同時に dm_threads の lastMessage, lastMessageAt, unreadForA/B を更新する関数を1つ用意。
- 未読管理
- スレッド閲覧時：
- 自分側の unreadForA or unreadForB を 0 に更新。
- 将来：Supabase Realtime を入れる余地を残しつつ、まずはリロードベースで実装。

6. フェーズ6：プロフィール / signup / アカウント種別
- 目的： 「誰がどんな立場で LoomRoom を使っているか」をサーバー側に正しく保存。
- プロフィール編集（MyPage / store / therapist）
- 現状：localStorage or ダミー。
- 変更後：
- users / stores / therapists テーブルを update。
- アイコン画像：
- 将来：Supabase Storage に保存し、avatar_url だけ DB に置く。
- signup フロー
- /signup/user：
- 一般ユーザーの登録希望内容を signup_applications に保存。
- /signup/creator/start → store / therapist 選択：
- それぞれの入力内容も同じく signup_applications に保存。
- 管理画面 /admin/stores などから審査：
- 承認 → users の role を therapist or store に変更し、
- therapists / stores 本テーブルにレコードを作成。
- アカウント種別ルール（確認用）
- Auth のアカウントは全員 users 行を必ず持つ。
- users.role で "user" | "therapist" | "store" を区別。
- ゲストは role を持たず、あくまで guest-xxxx の一時ID扱い。

7. フェーズ7：安全設計（サーバー側）
- 目的： 通報・ブロック・RLS を「運用に耐える形」に整える。
- 通報系テーブルと RLS
- 必要に応じて：
- post_reports（投稿通報）
- user_reports（ユーザー通報）
- dm_reports（DM通報）
- RLS 方針：
- insert：auth.uid() 本人のみ。
- select：管理者ロールのみ（もしくは専用 RPC）。
- 管理画面（将来 /admin）
- 通報一覧・違反疑い投稿の一覧。
- ブロック状態の確認。
- LoomRoom v1 では「最低限のデータが溜まる状態」を作っておき、
- LuX 管理者向け UI はフェーズ2以降でも可。

8. フェーズ8：本番運用準備 
- 目的： “localhost のおもちゃ” から “ちゃんと運営できる本番” へ。
- Vercel 本番プロジェクト
- lroom 本番環境を作成。
- Supabase の URL / KEY を本番用環境変数に設定。
- Supabase 環境
- まずは今のプロジェクトを「prod兼dev」として使っても良い。
- 将来必要になれば dev / prod を分離。
- ドメイン
- lroom.app 等のドメインを取得（任意）。
- Vercel にカスタムドメインとして設定。
- 3端末QA
- 一般ユーザー用スマホ
- セラピスト用スマホ
- 店舗用スマホ
- で実際に：
- signup → プロフィール編集
- 投稿 → TL表示 
- フォロー／ミュート／ブロック 
- DM送受信 
- 通報 
- を一通り踏んで、致命的なバグを潰す。

9. フェーズ9：v1リリース & 運用
- 目的： リリース後にちゃんと回せるようにする。
- ログ・モニタリング
- Supabase のクエリエラー / RLSエラーが出ていないかを定期チェック
- まずは「手動でログ見る」レベルで十分。
- 運用ルール
- アカウント申請（signup）の審査フロー。
- 通報が来たときの対応プロセス（凍結 / 注意 / 放置の基準）。 
- 必要に応じたデータエクスポート（念のためのバックアップ）。


A-1. users（全アカウント共通）完了
列名	     型	　　         必須	   デフォルト	　　　　　説明
id	　　     uuid	         ○	　　  gen_random_uuid()	    ユーザーID（PK）
name	     text	         ○	　　  なし	　　　　　　　    表示名（ニックネーム）
role	     text	         ○	　   'user'	　　　　　　     user / therapist / store のどれか
avatar_url	 text	         ×	      なし	　　　　　       アイコン画像URL（あとでStorageと連携）
created_at	 timestamptz	○	      now()	               作成日時


A-2. posts（タイムライン投稿）完了
列名	       型	          必須	   デフォルト	        説明
id	           uuid	          ○	      gen_random_uuid()	   投稿ID（PK）
author_id	   uuid	          ○	      なし	                投稿者の users.id
author_kind	   text	          ○	      'user'	           投稿者種別 user / therapist / store
body	       text	          ○	      なし	                投稿本文
area	       text	          ×	      なし	                エリア（関東／中部 など文字列）
created_at	   timestamptz	  ○	      now()	               投稿日時
like_count	   int4	          ○	       0	               いいね数（シンプル運用用）
reply_count	   int4	          ○	       0	               返信数（将来用）

B. TL／フォロー／DMサーバー化のときに作るテーブル
B-1. post_likes（誰がどの投稿にいいねしたか）
列名	       型	          必須	   デフォルト	         説明
id	           uuid	           ○	  gen_random_uuid()	   PK
post_id	       uuid	           ○	  なし	               posts.id
user_id	       uuid	           ○	  なし	               users.id（いいねした人）
created_at	   timestamptz	   ○	  now()	               いいねした時間
※ 将来的には post_id + user_id をユニーク制約にして二重いいね防止。

B-2. relations（フォロー／ミュート／ブロック）
列名	     型	            必須	 デフォルト       	  説明
id	         uuid	        ○	    gen_random_uuid()	PK
user_id	     uuid	        ○	    なし	            関係を持つ側（自分）
target_id    uuid	        ○	    なし	            相手ユーザーID
type	     text	        ○	    なし	            "follow" / "mute" / "block"
created_at	 timestamptz	○	    now()	            設定日時

B-3. dm_threads（DMスレッド一覧）
列名	        型	         必須	 デフォルト	          説明
thread_id	    uuid	     ○	    gen_random_uuid()	スレッドID（PK）
user_a_id	    uuid	     ○	    なし	            一方のユーザーID
user_b_id	    uuid	     ○	    なし	            もう一方のユーザーID
last_message	text	     ×	    なし	            最後のメッセージ内容（プレビュー用）
last_message_at	timestamptz	 ×	    なし	            最後のメッセージ日時
unread_for_a	int4	     ○	    0	                A側未読数
unread_for_b	int4	     ○	    0	                B側未読数
created_at	    timestamptz	 ○	    now()	            スレッド作成日時

B-4. dm_messages（DM1件1件）
列名	         型	         必須	デフォルト	          説明
id	            uuid	     ○	   gen_random_uuid()	メッセージID（PK）
thread_id	    uuid	     ○	   なし	                dm_threads.thread_id
from_user_id	uuid	     ○	   なし	                送信者ユーザーID
text	        text	     ○	   なし	                メッセージ本文
created_at	    timestamptz	 ○	   now()	            送信日時
is_read	        bool	     ○	   false	            既読フラグ（簡易）

C. signup／店舗／セラピスト／通報まわり
C-1. stores（店舗プロフィール）
列名	         型	          必須	デフォルト	          説明
id	            uuid	      ○	    gen_random_uuid()	店舗ID（PK）
owner_user_id	uuid	      ○	    なし	            この店舗を管理する users.id
name	        text	      ○	    なし	            店名
area	        text	      ×	    なし	            エリア
description	    text	      ×	    なし	            紹介文
created_at	    timestamptz	  ○	    now()	            作成日時
website_url　　　text          ×	     なし
x_url　　　　　 　text         ×	     なし
twicas_url　　　 text         ×	     なし
line_url　　　 　text         ×	     なし
description     text         ×
dm_notice       bool         ×
avatar_url      text         ×

C-2. therapists（セラピストプロフィール）
列名	         型	          必須	   デフォルト	        説明
id	             uuid	      ○	      gen_random_uuid()	  セラピストID（PK）
user_id	         uuid	      ○	      なし	              本人の users.id
store_id	     uuid	      ×	      なし	              所属店舗ID（任意）
display_name	 text	      ○	      なし	              表示名（LoomRoom内用）
area	         text	      ×  	  なし	              エリア
profile	         text	      ×	      なし	              紹介文
dm_notice        bool	      ×	
created_at	     timestamptz  ○	      now()	              作成日時

C-3. signup_applications（店舗・セラピスト申請）
列名	      型	       必須	  デフォルト	        説明
id	          uuid	        ○	 gen_random_uuid()	  申請ID
type	      text	        ○	 なし	              "store" / "therapist" / "user"
status	      text	        ○	 'pending'	          pending / approved / rejected
name	      text	        ○	 なし	              申請者名 or 店名
contact	      text	        ×	 なし	              連絡先（メールやX IDなど）
payload	      jsonb	        ×	 なし	              フォームの中身を丸ごと入れる用
created_at	  timestamptz	○	 now()	              申請日時
reviewed_at	  timestamptz	×	 なし	              審査日時

C-4. reports（投稿通報）
列名	       型	          必須	   デフォルト	          説明
id	           uuid	           ○	  gen_random_uuid()	    通報ID（PK）
target_type	   text	           ○	  なし	                post / user / store / therapist
target_id	   uuid	           ○	  なし	                通報対象のID（posts.id / users.id / stores.id / therapists.id） 
reporter_id	   uuid	           ○	  なし	                通報したユーザーの users.id
reason	       text	           ×	  なし	                通報理由（任意）
created_at	   timestamptz	   ○	  now()	                通報日時
