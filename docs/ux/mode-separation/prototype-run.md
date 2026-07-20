# PROTOTYPE-001 実行記録

- 実行日: 2026-07-21
- 対象Issue: <https://github.com/harutasti/Shogi/issues/11>
- 親仮説: <https://github.com/harutasti/Shogi/issues/9>
- 操作者: Codex Computer Use
- 環境: Desktop Chrome、Chrome DevTools Responsive 400 × 625
- 結果: 3案 × 5シナリオ × 2環境 = 30 / 30 Pass

## プロトタイプURL

通常のプロダクト表示は変更しない。開発サーバーまたはデプロイ先のURLへ次のクエリを追加する。

- A モード切替: `?prototype=mode-separation&variant=A`
- B 展開式解析: `?prototype=mode-separation&variant=B`
- D 情報階層改善: `?prototype=mode-separation&variant=D`

3案のタブを切り替えても、対局状態、棋譜、現在手数、解析結果は保持される。

## 実行方法

`scenarios.csv`のUX-01〜UX-05を案・環境ごとに同じ順番で実行した。盤上操作は７七→７六、AI応手は比較を安定させるため３三→３四に固定した。KIF解析は共通の5手棋譜を読み込み、3手目を選択してから解析した。

各シナリオは成功条件に到達するまでを単一のComputer Use呼び出しとして測り、クリック、意図的スクロール、キー、誤操作、復帰操作を記録した。完全な行データは`prototype-results.csv`を正本とする。

## 集計

| 環境 | 案 | 完了 | クリック | スクロール | 自動操作経過秒 |
|---|---|---:|---:|---:|---:|
| Desktop | A | 5 / 5 | 11 | 0 | 8.077 |
| Desktop | B | 5 / 5 | 12 | 0 | 7.997 |
| Desktop | D | 5 / 5 | 9 | 0 | 6.337 |
| 400 × 625 | A | 5 / 5 | 11 | 7 | 24.962 |
| 400 × 625 | B | 5 / 5 | 12 | 5 | 21.533 |
| 400 × 625 | D | 5 / 5 | 9 | 4 | 17.701 |

400px幅の解析到達シナリオUX-03・UX-04の合計スクロールは、BASE 3、A 3、B 1、D 2だった。

## 証跡

| 案 | Desktop | 400 × 625 |
|---|---|---|
| A | `evidence/PROTOTYPE-001/desktop-A-mode-analysis.png` | `evidence/PROTOTYPE-001/mobile-A-mode-analysis.png` |
| B | `evidence/PROTOTYPE-001/desktop-B-sheet-analysis.png` | `evidence/PROTOTYPE-001/mobile-B-sheet-analysis.png` |
| D | `evidence/PROTOTYPE-001/desktop-D-hierarchy-analysis.png` | `evidence/PROTOTYPE-001/mobile-D-analysis.png` |

## 観察上の限界

- 操作者はラベルと正解経路を既知であり、初見の発見性は測定していない。
- 経過秒にはComputer Use基盤の待機時間が含まれる。
- 低忠実度プロトタイプのため、通信失敗、長時間解析、履歴復元などの異常系は対象外である。
- 画面上のフォーカス、キーボード操作、Reduced Motion等の実装は確認したが、スクリーンリーダー実機テストは未実施である。
