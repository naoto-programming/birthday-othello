# 誕生日オセロ v4(序盤の駆け引き)実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 開始時に黒白2個ずつの石をランダムに置き、最初の3ターンは自分の石の周り8マスに置けないようにする。

**Architecture:** ルール(js/rules.js)は、乱数の元と「序盤の仕組みを使うか」を `newGame` の引数で受け取る。既定は使わない(v3 と同じ)なので、今の単体テストはそのまま。画面(main.js)は URL の `?seed=`・`?opening=off` を読んで `newGame` に渡し、置けないマスに印を付ける。

**Tech Stack:** HTML / CSS / JavaScript(ES モジュール、ビルドなし、依存なし)、Node.js v23(`node --test`)、ヘッドレス Chrome(tools/smoke.mjs)。

**Spec:** `docs/superpowers/specs/2026-11-16-birthday-othello-v4-opening-design.md`(書いていない点は v3 → v2 → v1 の仕様のまま)

**作業ブランチ:** `feature/v4-opening`(main fb6d162 から。fb6d162 は仕様の追加だけで、まだ push していない)。

## Global Constraints

- フレームワーク・ビルド・npm の依存パッケージを使わない。
- js/rules.js・js/dates.js・js/events.js・js/holidays.js は DOM・`location`・`window` に触れない。DOM に触れるのは js/ui.js と js/main.js だけ。
- 入力された名前は textContent でのみ表示する。画面の文字は日本語。
- スマートフォン(幅320px・390px)で左右16pxの余白、横スクロールなし。
- `prefers-reduced-motion: reduce` のときは演出の待ちをなくす(`wait()` を使い、`sleep()` は使わない)。
- 序盤の数: 最初の石は黒2・白2、制限は各自の最初の3手(`OPENING_TURNS = 3`)。
- スモークテストは `lsof -i :9333` が空であることを確かめてから `caffeinate -i npm run smoke` を、待ち受けたまま(バックグラウンドに回さず)実行する。既存の check は弱めない・消さない。
- コミットのメッセージの最後に、実際に作業したモデル名の `Co-Authored-By:` 行を付ける。tools/screenshots/ はコミットしない。

## Review Focus

1. **「もう一手」のイベントが最初の3手の中で起きる** → 続けて打つ手も1手と数え、4手目から制限が外れる。Task 1 の単体テストで確かめる。
2. **置けないマスでしか挟めない** → 様子見の代償は働かない(日付は動かない)。Task 1 の単体テストで確かめる。
3. **空きマスがすべて置けないマス** → どこにでも置け、画面には印を出さず「置ける場所がないので、どこにでも置けます」。Task 1 の単体テストと、Task 2 のスモークテスト(作った状態を描く)で確かめる。
4. **調整パネルを出したまま置けないマスをタップする** → 置かれず、注意が出て、パネルと選んだマスはそのまま。Task 2 の実装(`tapCell` の順番)で扱う。
5. **序盤の途中で「設定に戻る」→ 新しい対戦** → 新しい配置になり、前の対戦の印や注意が残らず、制限は3手から数え直す。Task 2 のスモークテストで確かめる。

---

### Task 1: ルール(最初の石と3ターンの制限)とバランス確認

**Files:**
- Modify: `js/rules.js`、`tools/balance.mjs`
- Test: `tests/rules.test.js`

**Interfaces:**
- Produces:
  - `OPENING_TURNS = 3`
  - `seededRandom(seed: number) → () => number`(0以上1未満を返す決まった乱数。mulberry32 でよい)
  - `openingBoard(random) → board`(8×8、黒・白・黒・白の順に1個ずつ。各石は、すでに置いた最初の石の周り8マスに入らない空きマスから、`Math.floor(random() * 候補の数)` 番目を選ぶ。候補はマス番号の小さい順)
  - `newGame(match, { opening = false, random = Math.random } = {})`。戻り値に `opening`(真偽)と `movesMade: { B: 0, W: 0 }` を足す。`opening` が真なら盤面は `openingBoard(random)`、偽なら空(v3 と同じ)
  - `forbiddenCells(state, color = state.turn) → number[]`: この手で置けない空きマス(小さい順)。`state.opening && state.movesMade[color] < OPENING_TURNS` のときだけ、`color` の石の周り8マスにある空きマス。それが空きマスのすべてなら `[]`(どこにでも置ける)。制限がないときも `[]`
  - `isRestricted(state, color = state.turn) → boolean`(`state.opening && state.movesMade[color] < OPENING_TURNS`。フォールバックで置き放題の手番でも真。画面の文の出し分けに使う)
  - `canPlace(state, idx) → boolean`(空きマスで、`forbiddenCells(state)` に入っていない)
  - `canFlipAnywhere(board, color, forbidden = [])`: `forbidden` のマスは調べない
  - `previewMove`: 代償の判定を `canFlipAnywhere(state.board, color, forbiddenCells(state))` にする
  - `playMove`: `!canPlace(state, idx)` なら同じ state を返す。打ったら `next.movesMade[color] += 1`(盤面の拡張やイベントより前、手を打った時点で数える)
  - 効果(`applyChoice`)は `movesMade` を変えない

- [ ] **Step 1: テストを書く**(`stateWith` はそのまま使える。序盤の仕組みを使うテストは、作った state に `state.opening = true` を直接入れる。`movesMade` は `newGame` が入れる `{ B: 0, W: 0 }`)
  - `seededRandom: 同じ値なら同じ列、違う値なら違う列`
  - `openingBoard: 黒2・白2で、どの2つも周り8マスに入らない`: `seededRandom(1)`〜`seededRandom(50)` のそれぞれで、石が4個、黒2・白2、どの2つの石も「行の差 ≤ 1 かつ 列の差 ≤ 1」にならない。同じ seed なら同じ盤面。
  - `newGame: 既定では空の盤面で、制限もない`: `newGame(testMatch())` の石が0個、`opening` false、`forbiddenCells` が `[]`。
  - `newGame: opening のとき最初の石があり、手の数は0から`: `newGame(testMatch(), { opening: true, random: seededRandom(7) })` の石が4個、`movesMade` が `{ B: 0, W: 0 }`。
  - `forbiddenCells: 最初の3手は自分の石の周りに置けない`: opening、`rowsWith('...B.W..')`(黒 (3,3)、白 (3,5))、黒の番 → `forbiddenCells` が `[at(2,2), at(2,3), at(2,4), at(3,2), at(3,4), at(4,2), at(4,3), at(4,4)]`。`isRestricted` が true。`canPlace(state, at(3,4))` が false、`canPlace(state, at(3,6))`(白の石の隣)が true。`playMove(state, at(2,2))` が同じ state を返す。
  - `forbiddenCells: 4手目からは制限がない`: 上の状態で `movesMade.B = 3` → `[]`、`isRestricted` が false、`canPlace(state, at(2,2))` が true。
  - `forbiddenCells: 置けるマスがなければどこでも`(Review Focus 3): opening、rows `['B.WWWWWW', '..WWWWWW', ...Array(6).fill('WWWWWWWW')]`(空きは黒 (0,0) の隣の3マスだけ)、黒の番 → `forbiddenCells` が `[]`、`isRestricted` が true、`canPlace(state, at(1,1))` が true。
  - `playMove: 打つと手の数が増え、効果では増えない`: opening、p 10、`rowsWith('.WB.....')`、`events: {9: ev('plant')}`、黒が `at(3,0)` に打つ(黒の石 (3,2) から2マス離れているので置ける)→ 1枚返して p 9 で植える、`movesMade` が `{ B: 1, W: 0 }`。`applyChoice(mid, at(7,7))` のあとも `movesMade.B` は 1。
  - `playMove: もう一手で続けて打つ手も1手と数える`(Review Focus 1): 上と同じ盤面で `events: {9: ev('extraTurn')}`。黒が `at(3,0)` → `turn` 'B'、`movesMade.B` 1。続けて黒が `at(7,7)` → `movesMade.B` 2。
  - `previewMove: 置けないマスでしか挟めなければ代償はない`(Review Focus 2): opening、p 10、rows `['........', '..B.....', '..W.....', '........', '..B.....', '........', '........', '........']`(黒 (1,2)、白 (2,2)、黒 (4,2))。黒が挟めるのは (3,2) だけで、(3,2) は黒の石 (4,2) の隣なので置けない。黒が `at(7,7)` に打つ予告 → `stall` false、`days` 0、`toP` 10。同じ盤面で `opening` false なら `stall` true、`toP` 11。
  - `canFlipAnywhere: forbidden のマスは調べない`: 上の盤面で `canFlipAnywhere(board, 'B')` が true、`canFlipAnywhere(board, 'B', [at(3,2)])` が false。

- [ ] **Step 2: 失敗を確かめる**

  Run: `npm test`
  Expected: 新しいテストが FAIL(`seededRandom` などが未定義)。今のテストは PASS のまま。

- [ ] **Step 3: js/rules.js を実装する**(上の Interfaces のとおり)

- [ ] **Step 4: 通ることを確かめる**

  Run: `npm test`
  Expected: すべて PASS。

- [ ] **Step 5: tools/balance.mjs を v4 の始まり方にする**
  - `newGame(setupMatch(...), { opening: true })`。
  - `candidates(state)` は `canPlace(state, idx)` が真のマスだけ。
  - Run: `caffeinate -i npm run balance`
  - Expected: `OK`。3行(対局数・終わり方・平均手数と先手の勝率)を報告に書く。先手の勝率は参考値(シミュレーションでは 50〜54%)。NG や大きく外れた値なら、直さずに数字を報告する。

- [ ] **Step 6: コミット**

```bash
git add js/rules.js tests/rules.test.js tools/balance.mjs
git commit -m "Rules v4: random isolated starting stones, no placing next to own stones for 3 moves"
```

---

### Task 2: 画面(印・注意・文言・開始の演出)とスモークテスト

**Files:**
- Modify: `js/main.js`、`js/ui.js`、`index.html`、`css/style.css`、`tools/smoke.mjs`、`README.md`

**Interfaces:**
- Consumes: Task 1 の `newGame(match, { opening, random })`、`seededRandom`、`forbiddenCells`、`isRestricted`、`canPlace`、`OPENING_TURNS`、`state.movesMade`
- Produces:
  - `showNotice(text)`(ui.js。`#notice` に文を出す。`renderGame` の最初で空にする)
  - `animateOpening()`(ui.js。盤面の石に `placed` を付け、`animationDelay` を 0・150・300・450ms にする。待たない)

画面の変更:
- main.js:
  - ページの読み込み時に `const params = new URLSearchParams(location.search)` を1回読む。`opening = params.get('opening') !== 'off'`、`seed = params.get('seed')`。
  - `startGame`: `newGame(match, { opening, random: seed !== null ? seededRandom(Number(seed)) : Math.random })`。描いたあと、`state.opening` なら `animateOpening()`。
  - `tapCell`: `phase === 'play'` で空きマスのとき、`!canPlace(state, idx)` なら `showNotice('自分の石の周りには置けません')` だけをして戻る(`pickIdx` も描画も変えない)。そのあとは今のまま(調整が要ればパネル、要らなければ `place`)。
- ui.js:
  - `renderBoard`: `turnOverride` が null で `phase === 'play'` のとき、`forbiddenCells(state)` のマスに `.forbidden`。
  - `turnMessage`(演出中でない `play` で、`pickIdx` が null のとき):
    - `isRestricted(state)` かつ `forbiddenCells(state).length > 0` → 「{名前}({色})の番です(あと{OPENING_TURNS − movesMade[turn]}ターン: 自分の石の周りには置けません)」
    - `isRestricted(state)` かつ `forbiddenCells(state).length === 0` → 「{名前}({色})の番です(置ける場所がないので、どこにでも置けます)」
    - それ以外は今のまま
  - `renderGame` の最初で `#notice` を空にする。
- index.html:
  - `#turn-msg` の直後に `<p id="notice" class="notice" aria-live="polite"></p>`。
  - ルールの最初の項目「盤面は空っぽから始まります。空いているマスならどこにでも置けます。」を次の2項目に置き換える。
    - 「最初に黒白2個ずつの石が、ランダムな場所に置かれます。空いているマスならどこにでも置けます。」
    - 「ただし、最初の3ターンは、自分の石の周り8マスには置けません(置ける場所がないときは、どこにでも置けます)。」
- css/style.css:
  - `.cell.forbidden::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(45deg, rgba(138, 123, 114, 0.22) 0 3px, transparent 3px 7px); pointer-events: none; }`(背景ではなく重ねるので、期間の色・誕生日・行事・今日の枠と重なっても消し合わない)。
  - `.notice { text-align: center; margin: 4px 0 0; color: var(--accent); font-size: 0.85rem; min-height: 1.2em; }`。
- README.md: 仕様のリンクを v4 にする(v3・v2・v1 を土台として併記)。説明の1行目は変えない。

スモークテスト(tools/smoke.mjs):
- `open(width, height, query = 'opening=off')`: `Page.navigate` の URL を `appUrl + (query ? '?' + query : '')` にする。既存のシナリオはすべて既定のまま(v3 と同じ始まり方)で通ること。
- シナリオ24(序盤、幅390): `open(390, 844, 'seed=3')`、誕生日 1/1 と 7/1、開始日を 2026-03-01 に明示(シナリオ15と同じやり方)、対戦開始。
  - 石が4個、黒2・白2、どの2つも周り8マスに入らない(ページ内で `.stone.black`/`.stone.white` のマス番号から計算)。
  - 通常の動きで、開始直後の石に `placed` が付いている。
  - `.cell.forbidden` のマスが、ちょうど「黒の石の周り8マスの空きマス」と一致する(ページ内で計算して比べる)。
  - `#turn-msg` に「あと3ターン」。
  - 置けないマスを1つタップ → 石は4個のまま、`#notice` が「自分の石の周りには置けません」。
  - 黒と白が交互に3手ずつ、置けるマス(`.cell:not(.has-stone):not(.forbidden)` の最初)に打つ。イベントのポップアップが出たら OK、選ぶ効果は最初の候補、調整は 0(`playUntil` があれば使う)。
  - 6手のあと: `.cell.forbidden` が0、`#turn-msg` に「あと」が入っていない。
  - 同じ `seed=3` で開き直すと、最初の石のマス番号が1回目と同じ。
  - 途中で「設定に戻る」→ 対戦開始で、`.cell.forbidden` は新しい配置に合っていて、`#notice` は空、`#turn-msg` に「あと3ターン」(Review Focus 5)。
  - スクリーンショット `phone-opening`(開始直後、動きを減らす設定にして撮る)。
- シナリオ25(フォールバックの表示): ページ内で rules/ui を import し、空きが黒の石の周りだけの状態(Task 1 のフォールバックのテストと同じ盤面)に `opening: true` を入れて `ui.renderGame(st)` → `.cell.forbidden` が0、`#turn-msg` に「どこにでも置けます」(Review Focus 3)。
- 幅320でもシナリオ24の開始直後の画面が横スクロールしないこと(1回確かめる)。

- [ ] **Step 1: スモークテストを先に書く**(`open` の既定の問い合わせ、シナリオ24・25)
- [ ] **Step 2: 失敗を確かめる**(`lsof -i :9333` が空のあと `caffeinate -i npm run smoke` → シナリオ24で NG)
- [ ] **Step 3: 実装する**(上の画面の変更)
- [ ] **Step 4: 通ることを確かめる**

  Run: `npm test`、`caffeinate -i npm run smoke`、`caffeinate -i npm run balance`
  Expected: すべて OK。スクリーンショット `phone-opening` を Read で見て、置けないマスの斜線が見え、日付・今日の枠・行事の色が読めること。

- [ ] **Step 5: コミット**

```bash
git add js/main.js js/ui.js index.html css/style.css tools/smoke.mjs README.md
git commit -m "Opening UI: starting stones, forbidden-cell marks and notice for the first 3 turns"
```
