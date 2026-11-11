# 誕生日オセロ v3 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タップですぐ置く打ち方にし、盤面が埋まったら盤面が広がるサドンデス(12×12 → 14×14・移動2倍 → 判定)を加える。

**Architecture:** ルール(js/rules.js)は純粋な処理のまま、盤面の大きさを `board.length` から求める形にし、段階(`state.stage`)と盤面の拡張を `finishTurn` に入れる。画面は、広がる前の手の演出を「広がる前の大きさに切り抜いた状態」で見せ、そのあとでポップアップと拡張の演出を出す。

**Tech Stack:** HTML / CSS / JavaScript(ES モジュール、ビルドなし、依存なし)、Node.js v23(`node --test`)、ヘッドレス Chrome(tools/smoke.mjs)。

**Spec:** `docs/superpowers/specs/2026-11-11-birthday-othello-v3-design.md`(書いていない点は v2 → v1 の仕様のまま)

**作業ブランチ:** `feature/polish`(HEAD 014f89c)。2d97ce9 の「選ぶ効果の予告 → 決定」と 014f89c の dest+line-on の見た目は、Task 3 で取り除く。507f4fe(ページめくり最大2回)、5ec1c9b(演出中の手番と重さ)、e747360(近い順のテスト)は残す。

## Global Constraints

- フレームワーク・ビルド・npm の依存パッケージを使わない。
- js/rules.js・js/dates.js・js/events.js・js/holidays.js は DOM に触れない。DOM に触れるのは js/ui.js と js/main.js だけ。
- 入力された名前は textContent でのみ表示する。画面の文字は日本語。
- スマートフォン(幅320px・390px)で左右16pxの余白、横スクロールなし。14×14 の盤面でも同じ。
- `prefers-reduced-motion: reduce` のときは演出の待ちをなくす(`wait()` を使い、`sleep()` は使わない。例外は既存の celebrate の花火で、これは reduced motion では出さない)。
- 日付が動く演出は約1.5秒、ページめくりは1手で最大2回(既存のまま)。
- スモークテストは `lsof -i :9333` が空であることを確かめてから `caffeinate -i npm run smoke`。途中で止めない。既存の check は、取り除く機能(予告、列の選択、選ぶ効果の予告 → 決定、dest/line-on)に結びついたものを、この計画が指定する形に置き換える以外は、弱めない・消さない。
- コミットは Task ごと(大きければ小分けでよい)。メッセージの最後に、実際に作業したモデル名の `Co-Authored-By:` 行を付ける。tools/screenshots/ はコミットしない。

## Review Focus

1. **選ぶ効果(固定・奪う)で、盤面が埋まったまま確定する** → その確定で盤面が広がる(applyChoice → finishTurn)。画面では、確定の演出を広がる前の盤面で見せてから、ポップアップと拡張。Task 1 の単体テストと、Task 4 の `choose()` の実装で扱う。
2. **調整パネルを出したまま、別の空きマスをタップする / 石のあるマスをタップする / 設定に戻る** → 別の空きマスならそのマスの処理(調整が要れば切り替え、要らなければすぐ置く)、石のあるマスは無視、中断後の新しい対戦にパネルや選んだマスの印が残らない。Task 3 のスモークテストで確かめる。
3. **14×14 の盤面を幅320pxのスマートフォンで見る** → 横スクロールなし、日付と数字が読める。Task 4 のスモークテスト(配置の確認とスクリーンショット)で確かめる。
4. **サドンデスで、相手の手(様子見の代償・うそ)で自分の誕生日を通り越す** → 誕生日の人の勝ち、結果の文がその人の名前になる。Task 1 の単体テストと Task 4 の結果文で扱う。
5. **段階2で、移動が範囲を大きく超える(例: 40マス分で残り3マス)** → 端で止まり、跳ね返りの演出も「跳ね返り!」も出ず、演出が長引かない。Task 4 のスモークテストで確かめる。

---

## ファイル構成

| ファイル | 変更 |
|---|---|
| `js/rules.js` | 盤面の大きさを可変に(`sideOf`)。`expandBoard`・`cropBoard`。`state.stage`。列の選択をなくす。段階1・2の通過勝ち、段階2の2倍。`lastMove.flipWeights`・`lastMove.stage` |
| `tests/rules.test.js` | 上の単体テスト |
| `tools/balance.mjs` | 列の部分集合をなくし、終わり方の4分類で合否を出す |
| `js/dates.js` / `tests/dates.test.js` | `boardDates(currentDay, count = 64)` |
| `js/ui.js` / `js/main.js` | タップですぐ置く、調整パネル、可変の盤面、段階のポップアップ・札、拡張の演出、結果の文 |
| `index.html` / `css/style.css` | 調整パネル、札、盤面の列数、文字の大きさ、拡張の演出、ルールの文言、不要になった見た目の削除 |
| `tools/smoke.mjs` | 打ち方の変更に合わせた置き換えと、サドンデスのシナリオ |
| `README.md` | v3 の仕様へのリンク |

---

### Task 1: ルール v3(js/rules.js)

**Files:**
- Modify: `js/rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Produces:
  - `SIZE = 8`(開始時の大きさ)
  - `sideOf(board) → number`(`Math.round(Math.sqrt(board.length))`)
  - `expandBoard(board, rings) → board`(石を `(r + rings, c + rings)` へ移す。色・flips・fixed はそのまま。元の配列は変えない)
  - `cropBoard(board, size) → board`(中央の size×size を切り抜く。`cropBoard(expandBoard(b, 2), 8)` が b と等しい)
  - `newGame(match)` の戻り値に `stage: 0`
  - `flipLines` / `computeFlips` / `canFlipAnywhere`: 大きさは `sideOf(board)`、ループは `board.length`
  - `previewMove(state, idx, { adjust } = {}) → { idx, flips, flipWeights, base, needsAdjust, adjust, days, dir, stall, raw, toP, bounced, win, event }`。`lines` と `chosen` はなくす。`flipWeights[i]` は `flips[i]` の打つ前の重さ
  - `playMove(state, idx, { adjust } = {})`。`lastMove = { color, idx, stage, flips, flipWeights, base, days, dir, stall, fromP, toP, event, fizzled }`(+ `warpTo`)。`lines` はなくす。`stage` は打ったときの段階
  - 勝ちの `result`: 段階0は `{ winner, reason: 'birthday' }`、段階1・2は `{ winner, reason: 'pass', exact }`(`exact` は `raw === toP`、つまり端にぴったり届いた)
  - 盤面が埋まったときの `finishTurn`: 段階0 → `expandBoard(board, 2)`・`stage = 1`、段階1 → `expandBoard(board, 1)`・`stage = 2`、段階2 → `phase = 'over'`・`result = judgeFull(state)`。広げたあとは通常どおり手番を進める(もう一手なら同じ人)。`p`・`pending`・`events` はそのまま
  - `judgeFull` は今のまま(`reason: 'full'`)

移動の計算(previewMove):
```js
const { days: baseDays, dir, stall } = moveDays(base, pending, color, adjust, penalty);
const days = baseDays * (state.stage === 2 ? 2 : 1);
const raw = state.p + dir * days;
let toP, win, bounced;
if (state.stage === 0) {
  toP = reflect(raw, N); bounced = raw < 0 || raw > N;
  win = toP === 0 ? 'B' : toP === N ? 'W' : null;
} else {
  toP = Math.max(0, Math.min(N, raw)); bounced = false;
  win = raw <= 0 ? 'B' : raw >= N ? 'W' : null;
}
```

- [ ] **Step 1: テストを書き換える・足す**(既存の `at(r, c)` は8マス用のまま。12・14マス用に `const at12 = (r, c) => r * 12 + c; const at14 = (r, c) => r * 14 + c;`。`stateWith` に `stage = 0` を足し、`state.stage = stage` を入れる。12行・14行の rows はそのまま `boardFrom` で作れる)

  消す: `previewMove: 選んだ列だけを返す`、`previewMove: 列を1つも選ばなければ…`。

  書き換え:
  - `previewMove: 挟んだ列はすべて返す`: TWO_LINES の (3,5) で `flips` が `[at(3,4), at(4,5)]`、`base` 2、`toP` 8、`'chosen' in pv` と `'lines' in pv` が false。
  - `playMove: 予告と同じ結果になり、挟んだ列はすべて返る`: TWO_LINES の (3,5) で `next.p === pv.toP`、(3,4) と (4,5) が 'B'、`next.lastMove.lines === undefined`、`turn` が 'W'、元の盤面は変わらない。
  - `playMove: 段階0で最後の空きマスを埋めたら、周りに2周広がって段階1になる`(今の「最後の空きマスを埋めたら、残りマス数で判定する」の盤面): `phase` 'play'、`stage` 1、`board.length` 144、`board[at12(2, 2)]` が黒の石(置いた石)、`board[at12(0, 0)]` と `board[at12(11, 11)]` が null、`p` が 8 のまま、`turn` 'W'、`result` null。
  - `イベント: 植えるで最後の空きマスが埋まったら段階1に広がる`: 今のテストの盤面で `applyChoice` 後に `stage` 1、`phase` 'play'、`board.length` 144。

  追加:
  - `sideOf: 64・144・196 マスの盤面は 8・12・14`
  - `expandBoard: 石は (r+rings, c+rings) へ移り、色・重さ・固定はそのまま`: 8×8 の (0,0) に `{color:'W', flips:2, fixed:true}`、(7,7) に黒。2周広げると 144 マスで (2,2)・(9,9) に同じ石、ほかは null。元の盤面は変わらない。12マスを1周広げると 196 マスで (1,1) ずれる。
  - `cropBoard: 広げた盤面の中央を切り抜くと元に戻る`
  - `newGame: 段階は0`
  - `flipLines: 12マスの盤面では8マスより長い列を返せる`: 12マスの0行目 `'BWWWWWWWWWW.'` で (0,11) に黒 → 10枚。`canFlipAnywhere` も true。
  - `段階1: 誕生日を通り越したら勝ちで、跳ね返らない`: stage 1、N 20、p 3、`rowsWith('.WWWWWB.')`(8×8 の盤面でよい。段階は数値として効く)で `at(3, 0)` に黒 → 5枚、`raw` −2、`toP` 0、`bounced` false、`result` `{ winner: 'B', reason: 'pass', exact: false }`、`phase` 'over'。
  - `段階1: ぴったり届いても勝ち(exact)`: stage 1、p 2、`rowsWith('.WWB....')` で `at(3, 0)` → `{ winner: 'B', reason: 'pass', exact: true }`。
  - `段階1: 相手の手(様子見の代償)で通り越しても誕生日の人の勝ち`: stage 1、p 1、白の番、`rowsWith('.BW.....')`、`at(7, 7)` に白 → `stall` true、`result.winner` 'B'、`reason` 'pass'。
  - `段階2: 移動は最後に2倍(+3 のあと)`: stage 2、p 10、`pending.B.plus3`、`rowsWith('.WB.....')` で `at(3, 0)` → `days` 8、`toP` 2。
  - `段階2: 様子見の代償も2倍`: stage 2、p 10、`rowsWith('.WB.....')`、`at(7, 7)` に黒 → `stall` true、`days` 2、`toP` 12。
  - `段階1: イベントは今までどおり止まったマスで発動する`: stage 1、p 10、CENTER4、`events: {9: ev('plus3')}`、(2,3) → `pending.B.plus3` true。
  - `段階1で盤面が埋まったら1周広がって段階2になる`: 12行すべて 'B' で (0,0) だけ空き、stage 1、p 8 → (0,0) に黒 → `stage` 2、`board.length` 196、`board[at14(1, 1)]` が石、`phase` 'play'。
  - `段階2で盤面が埋まったら判定で終局`: 14行すべて 'B' で (0,0) だけ空き、stage 2、N 20、p 8 → `phase` 'over'、`result` `{ winner: 'B', reason: 'full' }`。
  - `盤面を埋めた手がもう一手なら、広がったあとも同じ人の番`: 段階0の満杯直前の盤面で、黒の手がイベント `extraTurn` に止まる(下の注を参照) → `stage` 1、`turn` 'B'。
  - `固定・奪うで、埋まった盤面のまま確定したら広がる`: 段階0で盤面を埋める手がイベント `steal` に止まる → `phase` 'choose'、`stage` 0(まだ広がらない)→ `applyChoice` 後に `stage` 1、`board.length` 144、`turn` 'W'。
  - `flipWeights: 打つ前の重さを記録する(重さリセットでも変わらない)`: p 10、`rowsWith('.WWB....')`、`at(3, 1)` の flips を 2 → `at(3, 0)` に黒 → `lastMove.flips` `[at(3,1), at(3,2)]`、`flipWeights` `[3, 1]`、`p` 6。同じ盤面に `events: {6: ev('resetWeights')}` を足すと、盤面の石の flips はすべて0、`flipWeights` は `[3, 1]` のまま。
  - `lastMove.stage は打ったときの段階`: 段階0の満杯直前で埋める手 → `next.stage` 1、`next.lastMove.stage` 0。

  注(満杯直前の盤面): 「イベントに止まる」テスト(もう一手・奪う)は `FULL_BUT_ONE = ['.WBBBBBB', ...Array(6).fill('BBBBBBBB'), 'BBBBBBBW']` を使う。p 10 で `at(0, 0)` に黒を置くと (0,1) だけを返して p 9 になり、盤面が埋まる。白の石 (7,7) は残るので、奪うの対象がある。イベントは `events: {9: ev(...)}` に置く。奪うのテストでは `applyChoice(mid, at(7, 7))` で確定する。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npm test`
  Expected: 追加・書き換えたテストが FAIL(`sideOf` などが未定義、`stage` が undefined、列の選択に関するアサーションの失敗)

- [ ] **Step 3: js/rules.js を実装する**(上の Interfaces と計算のとおり。ファイル先頭の方向番号のコメントは「返す列の選択で使う」を消す。`previewMove` の `options.lines` の処理を消す)

- [ ] **Step 4: 通ることを確かめる**

  Run: `npm test`
  Expected: すべて PASS。この時点では画面(ui.js・main.js)が `preview.lines` などを参照しているので、スモークテストは Task 3 まで実行しない。

- [ ] **Step 5: コミット**

```bash
git add js/rules.js tests/rules.test.js
git commit -m "Rules v3: flip all lines, sudden-death stages with board expansion"
```

---

### Task 2: バランス確認 v3(tools/balance.mjs)

**Files:**
- Modify: `tools/balance.mjs`、`package.json` は変えない(`npm run balance` のまま)

**Interfaces:**
- Consumes: Task 1 の `previewMove` / `playMove` / `state.stage` / `result.reason`('birthday'・'pass'・'full')

変更:
- `nonEmptySubsets` を消す。`candidates(state)` は、すべての空きマス(`state.board.length` までのループ)× 調整(調整の効果があれば −3〜+3、なければ 0)。要素は `{ idx, adjust }`。
- `carefulMove`: 安全確認(`opponentCanWin`)は、点数の高い順に最大 `SAFETY_CHECKS = 30` 手まで。すべて危なければ最善手。
- 1局の手数の上限 `MAX_MOVES = 600`。上限で終わらなかった対局は「未決着」として数える。
- 集計: 段階0のぴったり(`reason === 'birthday'`)、段階1(`reason === 'pass' && state.stage === 1`)、段階2(`reason === 'pass' && state.stage === 2`)、最後の判定(`reason === 'full'`)、未決着。
- 出力(1行目は今と同じ形式の対局数と秒数):
  ```
  終わり方: 通常のぴったり 68%  サドンデス 25%  サドンデス×2 6%  最後の判定 1%  未決着 0
  平均手数: 41.2  先手の勝率: 49%  1試合のイベント: 2.1
  ```
- 合格: 未決着が0、かつ最後の判定の割合が 10% 以下 → `OK: バランスは想定の範囲内です`。それ以外は `NG: ...`(理由を書く)で exit 1。今の 60〜90% の範囲の判定は消す(数字は表示する)。

- [ ] **Step 1: 実装する**(上のとおり)
- [ ] **Step 2: 実行して確かめる**

  Run: `caffeinate -i npm run balance`
  Expected: `OK: バランスは想定の範囲内です`。かかった秒数を記録する。200局で5分を超えるなら、既定の対局数を100にして、その理由をコミットメッセージに書く。NG のときは直さずに、数字を添えて報告する(ルールの判断はユーザーに戻すため)。

- [ ] **Step 3: 引数の確認**

  Run: `node tools/balance.mjs 0; echo $?` と `node tools/balance.mjs 20`
  Expected: 前者は `NG: 対局数は正の整数…` で 1、後者は20局の結果が出る。

- [ ] **Step 4: コミット**

```bash
git add tools/balance.mjs
git commit -m "Balance v3: report how games end across sudden-death stages"
```

---

### Task 3: 画面(タップですぐ置く・調整パネル)

**Files:**
- Modify: `js/main.js`、`js/ui.js`、`index.html`、`css/style.css`、`tools/smoke.mjs`

**Interfaces:**
- Consumes: Task 1 の `previewMove(state, idx, { adjust })`(`needsAdjust`、`days`、`toP`、`win`、`flips`)、`lastMove.flipWeights`
- Produces(Task 4 が使う):
  - `renderGame(state, { shownP = state.p, pickIdx = null, turnOverride = null, shownWeights = null } = {})`
    - `pickIdx`: 調整を選んでいる空きマス(`.cell.picked` を付け、調整パネルを出す)
    - `turnOverride`: 演出中に手番の表示・名札の光りに使う色。これが null でないときは演出中として扱い、`phase === 'over'` でも「対戦終了」を出さず、名札も光らせる
    - `shownWeights`: `Map(idx → 表示する重さ)`。指定のある石はその数字で描く
  - `revealAdjustPanel()`(`#adjust-panel` を `scrollIntoView({ block: 'nearest' })`)
  - main.js の `place(idx, adjust)`(打って演出する。今の `confirmPick` の中身)
  - `#adjust-panel` の中のボタン: `button[data-adjust="-3".."3"]` と `button[data-cancel]`

画面の変更:
- index.html: `#preview-panel` を `<div id="adjust-panel" class="adjust-panel card" hidden aria-live="polite"></div>` に置き換える。ルールの2項目を置き換える:
  - 「相手の石を挟むと裏返せます。挟んだ列が複数あるときは…」→「相手の石を挟むと、挟んだ列の石がすべて裏返ります。」
  - 「マスをタップすると結果を予告します。…」→「空いているマスをタップすると、すぐに石を置きます。日数調整の効果があるときだけ、−3〜+3 を選んでから置きます。」
- main.js:
  - `pick`・`choicePick`・`confirmPick`・`confirmChoice`・`showPick`・`showChoicePick`・列の切り替えを消す。`let pickIdx = null;`(`startGame`・`backToSetup` で null に戻す)。
  - `tapCell(idx)`: `phase === 'choose'` なら `choose(idx)`(対象外のマスは applyChoice が同じ state を返すので何もしない)。`phase !== 'play'` か石のあるマスなら何もしない。空きマスなら `pickIdx = null` にしてから、`previewMove(state, idx).needsAdjust` なら `pickIdx = idx`・`renderGame(state, { pickIdx })`・`revealAdjustPanel()`、そうでなければ `place(idx, 0)`。
  - パネルのクリック: `data-adjust` なら `const idx = pickIdx; pickIdx = null; await place(idx, Number(adjust))`。`data-cancel` なら `pickIdx = null; renderGame(state)`。
- ui.js:
  - `CHOICE_CONFIRM_TEXT`、`renderPreviewPanel`、`revealPreviewPanel`、`.chosen`・`dest`・`line-on`・`line-off`・`ghost`・`will-flip` を付ける処理を消す。
  - `renderAdjustPanel(state, pickIdx)`: pickIdx が null なら隠して空にする。それ以外は次を出す。
    - `span.ap-main`「調整: 動くマス数を選ぶと置きます」
    - `span.ap-note`「{返す枚数}枚返す(調整なしなら{days}マス)」
    - `div.adjust-row` に7つのボタン。文言は `${a > 0 ? '+' : ''}${a}(${pv.days}マス → ${formatMD(到着日)}${勝ち})`。`勝ち` は `pv.win` が手番の人なら「 勝ち」、相手なら「 相手の勝ち」、なければ空。
    - 「別のマスにする」(`class="link"`、`data-cancel`)
  - `renderPlayerStatus` の `active`: `(turnOverride !== null || state.phase !== 'over') && turn === color`。
  - `turnMessage`: 演出中でない `over` は「対戦終了」。`choose` は今の CHOICE_PROMPT。`pickIdx !== null` は「{名前}({色}): 調整を選んでください」。それ以外は「{名前}({色})の番です」。
  - `animateMove`: `overlay = { turnOverride: move.color, shownWeights: new Map(move.flips.map((idx, i) => [idx, move.flipWeights[i]])) }`(5ec1c9b の `beforeFlip` を置き換える。重さリセットのイベントでも0にならない)。
- css/style.css:
  - 消す: `.cell.dest`、`.cell.target.chosen`、`.cell.is-today.line-on`、`.cell.line-on`、`.cell.dest.line-on`、`.cell.line-off::before`、`.stone.ghost`、`.stone.will-flip`、`.cell.line-on .stone.will-flip`、keyframes `dest-blink`・`dest-line-blink`・`ghost-pulse`・`line-glow`、reduced-motion の中の同じもの(`.cell.dest { box-shadow… }` も)。
  - `.preview-panel`・`.pv-*` を `.adjust-panel`・`.ap-main`・`.ap-note` に改名。`.pv-actions` は不要。
  - 足す: `.cell.picked::before { content: ""; position: absolute; inset: 2px; border: 3px solid var(--accent); border-radius: 4px; pointer-events: none; }`(box-shadow を使わないので、今日の金色の枠とぶつからない)。

スモークテスト(tools/smoke.mjs)の置き換え:
- 部品:
  - `playCell(idx, adjust = 0)`: 1回クリックし、同じ js 呼び出しで `#adjust-panel` が見えているかを返す。見えていれば `[data-adjust="${adjust}"]` をクリック。そのあと `settled()`。
  - `playToEnd()`: 結果ダイアログ → true。イベントのダイアログ → OK。`.cell.target` → 1回タップ。`#adjust-panel` が見えている → `[data-adjust="0"]`。それ以外 → 最初の空きマスを1回タップ。上限を 600 手に。
  - `stoneCount()` は `#board .stone`。`panelText()` は `#adjust-panel`。
- シナリオ1: 予告の確認を消し、`tapCell(27)` + `settled()` で石が1つになること、`#adjust-panel` が隠れていること、`.stone.ghost` がないこと、今日の札が残ることを確かめる。そのあと `playCell(28)`・`playCell(20)` と今の確認。
- シナリオ2: 連打の js を `cell(19).click(); cell(19).click(); cell(20).click(); cell(20).click();` のままにし、石が1つ。
- シナリオ4(6/1 と 6/20): 名前を「挟んだ列はすべて返す」に。27・28・45・37 のあと、29 を1回クリックする js の中で、黒の名札が active、28 の数字が '1' を読む(今の duringFlip)。`settled()` 後、28 と 37 がどちらも黒、29 に `last`、白が active、28 の数字が '2'。日付は 6/11 → 6/9(今日の文字が「6月9日」)。最後の「やめる」の確認は消す。
- シナリオ9(11/1 と 11/7、開始 11/4 = マス3、1マス=1日)。序盤 = `playCell(27)`・`playCell(28)`・`playCell(29)`(黒が28を返して 11/3 文化の日に止まり、黒に調整)・ポップアップの OK・`settled()`・`playCell(26)`(白、日付は動かない)。この盤面で黒が返せるのは 25 だけ(26 を返す)。コントローラーが今のルールで確かめた値: 調整 +1 → 2マスで 11/1(黒の勝ち)、+2 → 3マスで跳ね返って 11/2。同じ序盤を3回打つ(1回ごとに「設定に戻る」→ 対戦開始で新しい対戦にする)。
  - 1回目:
    1. `tapCell(25)` → パネルが出る。石は4つのまま、25 に `picked`、ボタンが7つ、パネルが 375×553 に収まる、`[data-adjust="1"]` の文言に「勝ち」、`[data-adjust="2"]` の文言に「3マス」。スクリーンショット `adjust-visible`。
    2. 石のある 27 をタップ → パネルはそのまま、`picked` は 25。
    3. 「別のマスにする」→ パネルが消え、`.cell.picked` がない。
    4. もう一度 `tapCell(25)` → `[data-adjust="2"]` → `settled()` → 今日の文字が「11月2日」。
  - 2回目: `tapCell(25)` でパネルを出したまま、返す石のない空きマス 24 をタップ → すぐ置かれて石が5つ、パネルが消え、`.cell.picked` がない(Review Focus 2。この盤面では調整が要る別のマスがないので、「調整が要らないマスはすぐ置かれる」ことを確かめる)。
  - 3回目: `tapCell(25)` でパネルを出したまま「設定に戻る」→ 新しい対戦で `#adjust-panel` が隠れ、`.cell.picked` がなく、`body.dataset.busy` が '1' でなく、`playCell(20)` で石が1つ置ける。
- シナリオ10: `tapCell(27)` を消し、1つの js で `27 のクリック → 設定に戻る → 対戦開始`。
- シナリオ11: `tapCell(27)` を1回だけにする(打つまでの時間の測定はそのクリックから)。
- シナリオ13: 29 を1回クリックする js のまま(今の2回目のクリックだけにする)。
- シナリオ15: `tapCell(29)` を1回にし、そのクリックと同じ js で `#turn-msg` を読み、「対戦終了」でないこと(勝った手の演出中)。
- シナリオ16: 置き換え(今日のマスが調整中のマスでもあるとき)。動きを減らす設定で対戦画面を開き、ページ内で(シナリオ13bと同じやり方で)`rules.newGame` から状態を作って `ui.renderGame(st)` → `.cell.is-today` の idx を読む → `ui.renderGame(st, { pickIdx: その idx })`。今日のマスについて、box-shadow に `rgb(255, 183, 3)` が含まれ、`getComputedStyle(cell, '::before').borderTopWidth` が '3px'、animationName が 'none'。スクリーンショット `reduced-today-picked`。
- シナリオ17: 名前を「選ぶ効果は1回のタップで確定」に。節分まで同じ手順のあと、候補が1つ、46 を1回タップ → `settled()` → 46 の石が消え、白の番。予告パネルと「選び直す」の確認は消す。
- シナリオ19: 消す。

- [ ] **Step 1: スモークテストを先に置き換える**(上のとおり)
- [ ] **Step 2: 失敗を確かめる**

  Run: `lsof -i :9333`(空であること)のあと `caffeinate -i npm run smoke`
  Expected: NG が出る(例: シナリオ1で1回のタップでは石が置かれない、`#adjust-panel` がない)

- [ ] **Step 3: 実装する**(上の画面の変更)
- [ ] **Step 4: 通ることを確かめる**

  Run: `npm test` と `caffeinate -i npm run smoke`
  Expected: どちらも OK。スクリーンショット `adjust-visible`・`phone-game` を Read で見て、パネルの文言と `picked` の枠が見えること。

- [ ] **Step 5: コミット**

```bash
git add js/main.js js/ui.js index.html css/style.css tools/smoke.mjs
git commit -m "Tap to place immediately; adjust panel only when the adjust effect applies"
```

---

### Task 4: 画面(サドンデス)

**Files:**
- Modify: `js/dates.js`、`tests/dates.test.js`、`js/ui.js`、`js/main.js`、`index.html`、`css/style.css`、`tools/smoke.mjs`、`README.md`

**Interfaces:**
- Consumes: Task 1 の `sideOf`、`cropBoard`、`state.stage`、`lastMove.stage`、`result.reason === 'pass'`・`result.exact`。Task 3 の `renderGame` のオプション、`place`、`choose`。
- Produces:
  - `boardDates(currentDay, count = 64)`(今の月の1日から count 日)
  - `cellDistance(a, b, size = 8)`
  - `showStageDialog(state) → Promise`(`#event-dialog` を使う。文言は下)
  - `animateExpand(state, fromSize, { isCurrent } = {}) → Promise`(約600ms)
  - `#stage-badge`

画面の変更:
- dates.js: `boardDates(currentDay, count = 64)`。dates.test.js に `boardDates: マスの数だけ並べる`(144 と 196 で長さと先頭・末尾の日)。
- index.html: `.today` の段落の直後に `<p id="stage-badge" class="stage-badge" hidden></p>`。ルールの項目「盤面が埋まったら、誕生日までの残りマス数が少ない方の勝ち…」を次の3項目に置き換える。
  - 「盤面が埋まったらサドンデス: 周りに2周マスが増えて12×12になり、日付が誕生日に届くか通り越したら、その誕生日の人の勝ちです(跳ね返りません)。」
  - 「サドンデスでも埋まったら、さらに1周増えて14×14になり、日付の動きが2倍になります。」
  - 「それでも埋まったら、誕生日までの残りマス数が少ない方の勝ち。同じなら石の数で決めます。」

  あわせて「誕生日を通り越したら、通り越した分だけ跳ね返ります。」の末尾に「(サドンデスでは跳ね返りません)」を足す。
- ui.js:
  - `renderBoard`: `const size = sideOf(state.board)`。`#board` に `style.setProperty('--size', String(size))` と `dataset.size = String(size)`。日付は `boardDates(today, size * size)`。
  - `renderGame`: `#stage-badge` を、段階0なら隠す、1なら「サドンデス」、2なら「サドンデス ×2」。
  - `animateMove`: 石の順番は `cellDistance(a, move.idx, sideOf(state.board))`。日付の演出に渡す日数は `move.stage > 0 ? Math.abs(move.toP - move.fromP) : move.days`(段階1・2は端で止まるので、跳ね返りの経路を作らない)。
  - `showStageDialog(state)`: 段階1は 名前の行「盤面が埋まった!」、見出し「サドンデス」、本文「マスが広がり、先に自分の誕生日を通り越した人の勝ち」。段階2は「盤面がまた埋まった!」「サドンデス ×2」「さらに広がり、日付の動きが2倍に」。
  - `animateExpand(state, fromSize, { isCurrent })`: `renderGame(state)`。新しい外周のマス(中央の fromSize×fromSize の外)に `.ring-new`、石に `.settle`。`#stage-badge` に `glowOnce(…, 'pulse')`。`await wait(600)`。
  - `resultReason`:
    - `'pass'`: `exact` なら「サドンデスで、日付が{m/d}({名前}の誕生日)に届きました。」、そうでなければ「…を通り越しました。」
    - `'full'`: 先頭を `state.stage === 2 ? 'サドンデスでも盤面が埋まりました。' : '盤面が埋まりました。'` にし、続きは今と同じ。
- main.js:
  - `const viewBefore = (prev, next) => next.stage === prev.stage ? next : { ...next, stage: prev.stage, board: cropBoard(next.board, sideOf(prev.board)) };`
  - `place`: 打つ前の状態を `prev` に取り、演出(`animateMove`・イベントのポップアップ・`animateWarp`・`renderGame`・`highlightEffect`)はすべて `viewBefore(prev, next)` で行う。そのあと `next.stage > prev.stage` なら `showStageDialog(next)` → `animateExpand(next, sideOf(prev.board), { isCurrent })`。各 await のあとで `isCurrent()` を確かめる。
  - `choose`: `animateChoice(prev, viewBefore(prev, next), idx, …)` のあと、同じく段階が上がっていればポップアップと `animateExpand`(Review Focus 1)。
- css/style.css:
  - `.board` の `grid-template-columns`・`grid-template-rows` を `repeat(var(--size, 8), 1fr)` に。
  - 12マス: `#board[data-size="12"] .cell .date { font-size: clamp(0.4rem, 1.5vw, 0.55rem); }`、`.stone` は `clamp(0.5rem, 2vw, 0.8rem)`、`.today-tag` は `clamp(0.35rem, 1.2vw, 0.5rem)`。
  - 14マス: `.date` `clamp(0.36rem, 1.3vw, 0.5rem)`、`.stone` `clamp(0.45rem, 1.7vw, 0.7rem)`、`.today-tag` `clamp(0.32rem, 1.1vw, 0.45rem)`。`.cell .date` の `top`・`left` は 1px。
  - 文字が重なって読めないときは、スクリーンショットを見て値を調整してよい(調整した値を報告する)。
  - `.stage-badge`: 中央寄せの丸い札(`background: var(--accent); color: #fff; font-weight: bold; border-radius: 999px; padding: 2px 12px; width: fit-content; margin: 0 auto 8px;`)。`.stage-badge.pulse { animation: badge-pulse 0.8s ease; }`、`@keyframes badge-pulse { 40% { transform: scale(1.25); box-shadow: 0 0 0 4px rgba(232, 106, 146, 0.35); } }`。
  - `.cell.ring-new { animation: ring-in 0.6s ease both; }`、`@keyframes ring-in { from { opacity: 0; transform: scale(0.6); } }`。
  - `.stone.settle { animation: settle 0.6s ease both; }`、`@keyframes settle { from { transform: scale(1.4); } }`。
  - reduced-motion の `animation: none` の一覧に `.stage-badge.pulse, .cell.ring-new, .stone.settle` を足す。
- README.md: 1行目の説明に「盤面が埋まったらサドンデス。」を足し、仕様のリンクを `docs/superpowers/specs/2026-11-11-birthday-othello-v3-design.md` にする(v2・v1 を土台として併記)。

スモークテスト(追加):
- シナリオ20(本物の画面で段階1へ): 先に、決まった誕生日2つと開始日で、`playToEnd()` と同じ打ち方(最初の空きマス、選ぶ効果は最初の候補、調整は0)をしたときに、段階0では誕生日で決着せず段階1に進む組を、Node で `js/rules.js` を使って探す(探すスクリプトは scratchpad に置き、コミットしない)。同じ誕生日の組は黒白がランダムになるので使わない。開始日はシナリオ15と同じやり方で明示する。見つけた組をシナリオに書き、コメントに探し方を1行残す。
  - 動きを減らす設定にして、上の打ち方で `#event-dialog` に「サドンデス」が出るまで進める。
  - 見出しが「サドンデス」、本文に「通り越した」。OK を押して `settled()` → `#board .cell` が144、`#board` の `data-size` が '12'、`#stage-badge` が見えていて「サドンデス」、石が64。
  - 動きを元に戻してスクリーンショット `phone-sudden-death`。
  - 動きを減らす設定に戻し、`playToEnd()` で最後まで → 結果ダイアログが出る。
- シナリオ21(14×14 の配置): 幅390と320で、ページ内で `rules.newGame` の盤面を `expandBoard` で 12 → 14 にした段階2の状態を作り、`ui.renderGame`。
  - `#board .cell` が196、横スクロールなし。
  - 1マスの幅が 390px で 22px 以上、320px で 17px 以上。
  - 札が「サドンデス ×2」。
  - スクリーンショット `phone-14` と `small-14` を撮り、Read で見て、日付・今日の札・数字が読めることを確かめる(Review Focus 3)。
- シナリオ22(拡張の演出): 通常の動きで、段階1の状態(中央8×8に石64個)を作り、`ui.animateExpand(st, 8)` を await せずに呼んだ直後に数える。
  - `.cell.ring-new` が80、`.stone.settle` が64、`#stage-badge` に `pulse`。
  - await までの時間が 500〜1000ms。
  - 動きを減らす設定では 100ms 未満。
- シナリオ23(段階2の大きな移動): 通常の動きで、シナリオ16(旧)と同じ形の match(baseDay 1/1、D = N = 30、k 1、u0 3)から `rules.newGame` で状態を作り、`stage` 2、黒の石を idx 30、白の石を idx 29(flips 19 = 重さ20)に置いて、黒が idx 28 に打つ(`rules.playMove`)。移動は 20×2 = 40マス分で、残りは3マス。
  - `toP` 0、`result.winner` 'B'、`reason` 'pass'。
  - `ui.animateMove(next)` の間 `#turn-msg` を 50ms ごとに読み、「跳ね返り!」と「対戦終了」が一度も出ないこと。`.cell.bounce` が出ないこと。
  - 全体が 2600ms 未満(Review Focus 5)。

- [ ] **Step 1: テストを先に書く**(dates.test.js と、スモークテストのシナリオ20〜23)
- [ ] **Step 2: 失敗を確かめる**(`npm test` で boardDates が FAIL、スモークで NG)
- [ ] **Step 3: 実装する**(上の画面の変更)
- [ ] **Step 4: 通ることを確かめる**

  Run: `npm test`、`caffeinate -i npm run smoke`、`caffeinate -i npm run balance`
  Expected: すべて OK。スクリーンショット `phone-sudden-death`・`phone-14`・`small-14` を Read で見る。

- [ ] **Step 5: コミット**

```bash
git add js/dates.js tests/dates.test.js js/ui.js js/main.js index.html css/style.css tools/smoke.mjs README.md
git commit -m "Sudden death UI: expanding board, stage popups and badge, pass-win results"
```
