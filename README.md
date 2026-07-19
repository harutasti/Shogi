# 将棋 — ブラウザで対局 & 棋譜解析

ブラウザだけで動く将棋アプリ。サーバー不要・完全静的サイトなので GitHub Pages でそのまま公開できます。

## 機能

- **対局**: 人 vs 人(同一画面)、人 vs AI、AI vs AI 観戦。AI は入門〜上級の4段階
- **本格盤面**: CC0 の Shogi Images を同梱し、木目盤・一文字駒・成駒を画像で表示
- **ルール完全実装**: 二歩・打ち歩詰め・行き所のない駒・強制成り・王手放置の禁止・千日手
- **棋譜解析**: 対局後・棋譜読込後に全局面をAIが評価。評価値グラフと悪手(??)・疑問手(?)マークを表示
- **KIF入出力**: 将棋ウォーズ・81Dojo などのKIF形式を読み込み/書き出し(Shift_JIS自動判別)
- **共有URL**: 棋譜をURLに埋め込んでシェア(`#moves=7g7f.3c3d...`)
- **検討モード**: 棋譜の任意の局面に戻って、そこから指し直し(矢印キーでナビゲーション)

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm test         # エンジンのテスト(perft検証含む)
npm run build    # 本番ビルド (dist/)
```

## デプロイ (GitHub Pages)

初回のみ、次の2ステップの設定が必要です(以後は push だけで自動デプロイ):

1. **ワークフローを配置**: [`docs/deploy-workflow.yml`](docs/deploy-workflow.yml) の内容を
   `.github/workflows/deploy.yml` として追加してください。
   GitHub のリポジトリページで **Add file → Create new file** を開き、ファイル名に
   `.github/workflows/deploy.yml` と入力して内容を貼り付けるのが簡単です。
   (ボットの権限ではworkflowファイルを push できないため、この1ファイルだけ手動配置が必要です)
2. **Pages を有効化**: リポジトリの **Settings → Pages → Source を「GitHub Actions」** に設定。

以降は `main` または開発ブランチへの push で自動的にビルド&デプロイされ、
`https://<ユーザー名>.github.io/Shogi/` で公開されます。

## アーキテクチャ

```
src/
  engine/        # ルールエンジン(UI非依存の純粋TypeScript)
    types.ts     #   駒・指し手・局面の型定義
    position.ts  #   局面の生成・指し手の適用/巻き戻し
    movegen.ts   #   合法手生成(二歩・打ち歩詰め等の反則処理込み)
    sfen.ts      #   SFEN形式のパース/シリアライズ
    kif.ts       #   KIF形式のパース/書き出し
    usi.ts       #   USI形式の指し手(共有URL用)
    ai.ts        #   評価関数 + 反復深化αβ探索 + 静止探索
  ai/worker.ts   # AI思考用 Web Worker(UIをブロックしない)
  components/    # React コンポーネント(盤・駒台・棋譜・評価値グラフ)
  App.tsx        # 対局管理・解析・入出力のオーケストレーション
```

エンジンの合法手生成は perft(深さ4 = 719,731手)で既知の値と一致することをテストで検証しています。

## ロードマップ

- [x] v0: ルールエンジン + テスト
- [x] v1: 盤面UI・対人戦・KIF入出力・Pages自動デプロイ
- [x] v2: AI対戦(4段階)・棋譜再生
- [x] v3: 評価値グラフ付き解析・共有URL
- [ ] 将来: WASM強豪エンジン(やねうら王系)による本格解析、オンライン対戦
