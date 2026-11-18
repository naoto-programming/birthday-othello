# 誕生日オセロ v5(角のマス)実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 角のマスは、隣り合う3マスのどれかに石があるときだけ置けるようにする。

**Architecture:** js/rules.js の `forbiddenCells` に「閉じた角」を足す。そうすれば、`canPlace`・`playMove`・様子見の代償・画面の斜線・バランスの AI が、すべて同じ判定を使う。角の規則は常に有効(引数で切り替えない)。

**Tech Stack:** HTML / CSS / JavaScript(ES モジュール、ビルドなし、依存なし)、Node.js v23(`node --test`)、ヘッドレス Chrome(tools/smoke.mjs)。

**Spec:** `docs/superpowers/specs/2026-11-18-birthday-othello-v5-corners-design.md`

**作業ブランチ:** `feature/v5-corners`(main から)。

## Global Constraints

- フレームワーク・ビルド・npm の依存パッケージを使わない。
- js/rules.js は DOM・`location`・`window` に触れない。DOM に触れるのは js/ui.js と js/main.js だけ。
- 入力された名前は textContent でのみ表示する。画面の文字は日本語。
- スマートフォン(幅320px・390px)で左右16pxの余白、横スクロールなし。注意を出しても盤面が上下に動かない。
- `prefers-reduced-motion: reduce` のときは演出の待ちをなくす。
- スモークテストは `lsof -i :9333` が空であることを確かめてから `caffeinate -i npm run smoke` を、待ち受けたまま実行する。既存の check は弱めない・消さない(角の規則で前提が変わったものは、意図を保って置き換え、報告に書く)。
- コミットのメッセージの最後に、実際に作業したモデル名の `Co-Authored-By:` 行を付ける。tools/screenshots/ はコミットしない。

## Review Focus

1. **サドンデスで盤面が広がった直後の新しい角** → 12×12 では閉じている(斜線、置けない)。14×14 では斜め隣の 12×12 の角に石があるので開いている(最終レビューで判明、仕様を修正)。広がる前の盤面の角だったマスは、もう角ではない。Task 1 の単体テスト(12×12)と最終修正のテスト(広げた盤面)で確かめる。
2. **序盤のあと、閉じた角をタップする** → 置かれず、手番の文が注意に変わり、盤面は動かない。次の描画で元に戻る。Task 2 のスモークテストで確かめる。
3. **自動で打ち続けるテストの打ち方** → 最初の空きマス(0番)が閉じた角になるので、斜線のマスを飛ばす。サドンデスに入るシナリオ20の組(1/1 と 1/10、開始 2026-09-01)が、まだ盤面を埋めてサドンデスに入るか。入らなければ組を探し直す。Task 2 で確かめる。
4. **植える** → 閉じた角を選べない(候補の数が減る)。Task 1 の単体テストで確かめる。

---

### Task 1: ルール(閉じた角)

**Files:**
- Modify: `js/rules.js`、(必要なら)`tools/balance.mjs`
- Test: `tests/rules.test.js`

**Interfaces:**
- Produces:
  - `lockedCorners(board) → number[]`: 今の盤面の四隅(`0`、`side − 1`、`side × (side − 1)`、`side × side − 1`、`side = sideOf(board)`)のうち、空いていて、隣り合う3マスもすべて空いているもの(小さい順)
  - `forbiddenCells(state, color = state.turn)`: 序盤の制限のマス(v4、制限中だけ)と `lockedCorners(state.board)` を合わせたもの(重複なし、小さい順)。それが空きマスのすべてなら `[]`(v4 の例外のまま)。序盤の制限がなくても、閉じた角は入る
  - `isLockedCorner(board, idx) → boolean`(画面の注意の出し分けに使う)
  - `openingBoard(random)`: 候補から四隅を除く(候補の並びと選び方は v4 のまま)
  - `choiceTargets`: 植えるの候補から `lockedCorners(state.board)` を除く
  - `isRestricted` は v4 のまま(序盤の制限だけを表す)

- [ ] **Step 1: テストを書く**
  - `lockedCorners: 空の盤面では四隅すべて`: `lockedCorners(Array(64).fill(null))` が `[0, 7, 56, 63]`。
  - `lockedCorners: 隣の3マスのどれかに石があれば開く`: (0,1) に白、(6,6) に黒を置いた8×8(ほかは空き)→ `[7, 56]`。(0,1) は角0の隣、(6,6) は角63の隣なので、0 と 63 は開く。
  - `forbiddenCells: 序盤でなくても閉じた角は置けない`: 空の盤面の state(opening なし)→ `[0, 7, 56, 63]`。`canPlace(state, 0)` が false、`playMove(state, 0)` が同じ state を返す。`canPlace(state, 1)` が true。
  - `forbiddenCells: 12×12 の角も同じ`(Review Focus 1): 12×12 の空の盤面の state(`stage: 1`)→ `[0, 11, 132, 143]`。
  - `forbiddenCells: 序盤の制限と閉じた角を合わせる`: v4 の `forbiddenCells: 最初の3手は…` のテストの盤面(黒 (3,3)、白 (3,5))→ 期待値に `0, 7, 56, 63` を加えた小さい順の一覧。
  - `openingBoard: 角には置かない`: `seededRandom(1)`〜`seededRandom(200)` で、四隅に石がない。
  - `choiceTargets: 植えるは閉じた角を選べない`(Review Focus 4): v3 の `イベント: 植えるは空きマスに自分の石を置く` の期待値 59 を 55 に変え、確定に使うマスを角でないマス(例: `at(0, 1)`)に変える。
  - 既存のテストで、空いている角(多くは `at(7, 7)` や `at(0, 0)`)に打って「離れたマスに打つ手」を作っているものは、角でない離れたマス(例: `at(7, 6)` など、その盤面で石の隣にならないマス)に変える。テストの意図(返さない手、代償、手の数など)が変わらないことを確かめ、変えたテストの名前と新しいマスを報告に並べる。満杯直前の盤面で角を埋めるテスト(隣が埋まっているので開いている)は変えない。
- [ ] **Step 2: 失敗を確かめる**(`npm test` で新しいテストが FAIL)
- [ ] **Step 3: 実装する**(上の Interfaces のとおり)
- [ ] **Step 4: 通ることを確かめる**
  - Run: `npm test` → すべて PASS。
  - Run: `caffeinate -i npm run balance` → `OK`。3行を報告に書く(先手の勝率は参考値。大きく外れても直さずに報告)。
- [ ] **Step 5: コミット**

```bash
git add js/rules.js tests/rules.test.js
git commit -m "Rules v5: corners are closed until a neighboring cell has a stone"
```

---

### Task 2: 画面(角の印と注意)とスモークテスト

**Files:**
- Modify: `js/main.js`、`js/ui.js`、`index.html`、`css/style.css`、`tools/smoke.mjs`、`README.md`

**Interfaces:**
- Consumes: Task 1 の `forbiddenCells`(閉じた角を含む)、`isLockedCorner(board, idx)`、`canPlace`
- Produces: `showNotice(text)` の出し先の切り替え(下)

画面の変更:
- ui.js `renderBoard`: `.forbidden` の付け方は v4 のまま(`turnOverride` が null で `phase === 'play'` のとき `forbiddenCells(state)` のマス)。閉じた角は `forbiddenCells` に入るので、序盤のあとも斜線が付く。
- main.js `tapCell`: `!canPlace(state, idx)` のとき、`isLockedCorner(state.board, idx)` なら `showNotice('角は、となりに石が置かれるまで置けません')`、そうでなければ今の `showNotice('自分の石の周りには置けません')`。
- ui.js `showNotice(text)`: `.status` に `opening` があれば v4 のまま `#notice` に出す(`alert`)。なければ `#turn-msg` の文をその注意にして `alert` を付ける。`renderGame`(手番の文を書くところ)で `#turn-msg` の `alert` を外す。
- css: `.turn-msg.alert { color: var(--accent); }`(太さは今の手番の文と同じ)。
- index.html: ルールに「角のマスは、となりの3マスのどれかに石が置かれるまで置けません(盤が広がったあとの角も同じ)。」を、「最初の3ターンは…」の項目の次に足す。
- README.md: 仕様のリンクを v5 にする(v4・v3・v2・v1 を土台として併記)。

スモークテスト:
- シナリオ26(閉じた角、幅390、`opening=off`): 対戦開始。
  - 四隅(0・7・56・63)に `.forbidden`、ほかのマスにはない。
  - 0 をタップ → 石は0個のまま、`#turn-msg` が「角は、となりに石が置かれるまで置けません」で `alert` 付き。タップ前と後で `#board` の上端の位置が同じ(Review Focus 2)。
  - 1 に打つ(`playCell(1)`)→ 0 の `.forbidden` が消え、`#turn-msg` は通常の文で `alert` なし。白が 0 に打てる(`playCell(0)` で石が2個)。
- シナリオ24(序盤): `.cell.forbidden` の期待値を「黒の石の周り8マスの空きマス」と「閉じた角」の和にする。序盤の6手のあとの確認「`.cell.forbidden` が0」は、「`.cell.forbidden` が閉じた角だけ」に置き換える。
- シナリオ20(本物の画面でサドンデスへ): 角の規則で打つ順が変わる。今の組(1/1 と 1/10、開始 2026-09-01)で段階1に入るかを確かめ、入らなければ v3 のときと同じやり方(`playUntil` と同じ打ち方を Node で再現して探す。探すスクリプトは scratchpad に置き、コミットしない)で組を探し直す。どちらだったかを報告に書く(Review Focus 3)。
- そのほか、角の規則で前提が変わって落ちる既存のシナリオがあれば、意図を保って直し、報告に並べる。

- [ ] **Step 1: スモークテストを先に書く**(シナリオ26、24 の置き換え)
- [ ] **Step 2: 失敗を確かめる**(`lsof -i :9333` が空のあと `caffeinate -i npm run smoke`)
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる**
  - Run: `npm test`、`caffeinate -i npm run smoke`、`caffeinate -i npm run balance` → すべて OK。
  - スクリーンショット(シナリオ26で1枚、`phone-corners`)を Read で見て、四隅の斜線が見えること。
- [ ] **Step 5: コミット**

```bash
git add js/main.js js/ui.js index.html css/style.css tools/smoke.mjs README.md
git commit -m "Corner UI: closed-corner marks and notice without moving the board"
```
