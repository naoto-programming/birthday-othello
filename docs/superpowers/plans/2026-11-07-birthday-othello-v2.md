# 誕生日オセロ v2 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開中の誕生日オセロを v2 にする。空の盤面から始め、返す列を選べるようにし、日付の道をマスにする。様子見の代償を加え、予告 → 決定の打ち方、今日の強調、アニメーションも入れる。

**Architecture:** ルール(js/rules.js)と日付(js/dates.js)は DOM に触れない純粋な処理のまま拡張し、単体テストで確かめる。画面(js/ui.js・js/main.js)は「予告中の手」を main.js が持ち、ui.js が予告を描く形に作り直す。本物の rules.js を使うバランス確認スクリプトで、設計時のシミュレーション結果と実装がずれていないことを確かめる。

**Tech Stack:** HTML / CSS / JavaScript(ES モジュール、ビルドなし、依存パッケージなし)、Node.js v23(`node --test`)、ヘッドレス Google Chrome(スモークテスト)、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-11-07-birthday-othello-v2-design.md`(書いていない点は `docs/superpowers/specs/2026-10-29-birthday-othello-design.md` のまま)

## Global Constraints

- フレームワーク・ビルド手順・npm の依存パッケージを使わない。
- js/dates.js・js/holidays.js・js/events.js・js/rules.js は DOM に触れない純粋な処理にする。
- 日付は UTC 基準の通し番号で扱う。
- 日付の道:
  - D ≦ 30 なら N = D、k = 1。
  - D > 30 なら k = ceil(D ÷ 30)、N = round(D ÷ k)。
  - マス u の日付 = 黒の誕生日 + round(u × D ÷ N)。
  - 日付 d のマス = round((d − 黒の誕生日) × N ÷ D)。
  - round は Math.round。
- 開始マス = 開始日のマスを 1〜N−1 に収めたもの。
- 石の重さ = 1 + 裏返った回数(増え方 s は削除)。
- 列が1つ以上あるマスに置くときは、返す列を少なくとも1つ選ぶ。
- 1枚も返さない手:
  - 盤面のどこかに挟める手があったなら、相手の誕生日の方へ1マス(黒 +1、白 −1)。2倍・+3・調整・おやすみ・うそは関係しない。
  - 挟める手がどこにもなければ、日付は動かない。
  - どちらの場合も、予定されていた効果は使い切る。
- イベント:
  - 日付が属するマスに割り当てる。同じマスに複数あるときは日付が早いもの。マス0とマスNは除く。
  - 日付が動いて止まったときに発動する(様子見の代償で動いた場合も含む)。
- 効果はマス単位で働く(+3マス、−3〜+3マス、真ん中は floor(N ÷ 2))。
- すべての手は「予告 → 決定」。決定は「ここに置く」か、同じマスの2回目のタップ。
- 日付が動く演出は最大1.5秒程度。`prefers-reduced-motion: reduce` のときは演出の待ちをなくす。
- スマートフォンで、左右16pxの余白、横スクロールなし。
- 入力された名前は textContent でのみ表示する。
- 画面の文字は日本語。
- スモークテストは `caffeinate -i npm run smoke` で実行する(この Mac は1分で眠るため)。

## Review Focus

1. **予告中に別の空きマスをタップする** → 予告が切り替わるだけで、石は置かれない。Task 4 のスモークテストで確認する。
2. **予告中・演出中に「設定に戻る」で中断する** → 新しい対戦に、予告パネル・半透明の石・前の対戦の石や手番が残らない。Task 4 のスモークテストで確認する。
3. **誕生日が2〜3日しか離れていない** → 1手目で決着せず、対戦として成り立つ。Task 2 の単体テストで確認する。
4. **1マスが数日分(k > 1)で、月をまたいで動く** → 今日のマスと、今のマスの期間の色分けが正しい。Task 1 の単体テスト(マスの期間)と、Task 4 のスモークテスト(in-period の数)で確認する。
5. **端末で「動きを減らす」が有効** → 打ってから盤面が更新されるまでがすぐ終わる。Task 4 と Task 5 のスモークテストで確認する。

---

## ファイル構成(変更するもの)

| ファイル | 変更 |
|---|---|
| `js/dates.js` | 日付の道の関数(dateLine、squareOffset、squareOfOffset、squarePeriod)を追加する。setupMatch が N・k・u0 を返す。増え方 s を削除する |
| `js/events.js` | 効果の名前と説明文をマス単位にする |
| `js/rules.js` | 空の盤面、列(flipLines)、挟める手の有無(canFlipAnywhere)、予告(previewMove)、列を選んで打つ(playMove の options)、様子見の代償、マス単位の位置とイベント |
| `js/ui.js` / `js/main.js` | 予告 → 決定、列の切り替え、予告パネル、今日の強調、マス表示、アニメーション |
| `index.html` / `css/style.css` | 予告パネル、盤面の外枠、ルール画面の文言、アニメーション |
| `tools/balance.mjs`(新規) / `package.json` / `README.md` | バランス確認スクリプトと実行方法 |
| `tests/dates.test.js` / `tests/rules.test.js` | 単体テスト |
| `tools/smoke.mjs` | スモークテストを v2 の操作に合わせる |

---

### Task 1: 日付の道(マス)

**Files:**
- Modify: `js/dates.js`
- Test: `tests/dates.test.js`

**Interfaces:**
- Consumes: なし(既存の dates.js)
- Produces:
  - `dateLine(D) → { N, k }`
  - `squareOffset(u, D, N) → number`(マス u の日付が黒の誕生日から何日目か)
  - `squareOfOffset(offset, D, N) → number`(黒の誕生日から offset 日目の日付が属するマス)
  - `squarePeriod(u, D, N) → [from, to]`(マス u が受け持つ期間。黒の誕生日からの日数)
  - `setupMatch(...)` の戻り値に `N`, `k`, `u0` を追加する(このタスクでは `s` も残す。Task 2 で削除する)

- [ ] **Step 1: 失敗するテストを書く**

`tests/dates.test.js` の import を次に置き換える:

```js
import {
  dayNum, fromDayNum, weekday, birthdayInYear, prevOccurrence, nextOccurrence, growthStep,
  setupMatch, defaultStart, boardDates, formatMD, toISODate, parseISODate,
  dateLine, squareOffset, squareOfOffset, squarePeriod,
} from '../js/dates.js';
```

`test('setupMatch: 過去側の誕生日の人が黒、未来側の人が白', ...)` の中の `assert.equal(m.sameBirthday, false);` の直後に追記する:

```js
  assert.equal(m.N, 25);
  assert.equal(m.k, 2);
  assert.equal(m.u0, 13);
```

`tests/dates.test.js` の末尾に追記する:

```js
test('dateLine: 30日以下は1マス=1日', () => {
  assert.deepEqual(dateLine(2), { N: 2, k: 1 });
  assert.deepEqual(dateLine(30), { N: 30, k: 1 });
});

test('dateLine: 30日を超えると1マス=k日で30マス以下', () => {
  assert.deepEqual(dateLine(31), { N: 16, k: 2 });
  assert.deepEqual(dateLine(50), { N: 25, k: 2 });
  assert.deepEqual(dateLine(180), { N: 30, k: 6 });
  assert.deepEqual(dateLine(365), { N: 28, k: 13 });
  for (let D = 31; D <= 366; D++) assert.ok(dateLine(D).N <= 30, `D=${D}`);
});

test('squareOffset / squareOfOffset: 両端は誕生日、往復で同じマス', () => {
  for (const D of [20, 31, 50, 180, 365]) {
    const { N } = dateLine(D);
    assert.equal(squareOffset(0, D, N), 0);
    assert.equal(squareOffset(N, D, N), D);
    for (let u = 0; u <= N; u++) assert.equal(squareOfOffset(squareOffset(u, D, N), D, N), u, `D=${D} u=${u}`);
  }
});

test('squarePeriod: マスの期間がすき間なく並ぶ', () => {
  for (const D of [20, 50, 180, 365]) {
    const { N } = dateLine(D);
    let next = 0;
    for (let u = 0; u <= N; u++) {
      const [from, to] = squarePeriod(u, D, N);
      assert.equal(from, next, `D=${D} u=${u}`);
      const center = squareOffset(u, D, N);
      assert.ok(from <= center && center <= to, `D=${D} u=${u}`);
      next = to + 1;
    }
    assert.equal(next, D + 1);
  }
});

test('squarePeriod: 50日なら1マス2日', () => {
  assert.deepEqual(squarePeriod(1, 50, 25), [1, 2]);
  assert.deepEqual(squarePeriod(13, 50, 25), [25, 26]);
});

test('setupMatch: 開始マスは1〜N−1に収める', () => {
  const a = { name: 'A', birthday: { m: 1, d: 1 } };
  const b = { name: 'B', birthday: { m: 6, d: 30 } };
  const early = setupMatch([a, b], dayNum(2026, 1, 2));
  assert.equal(early.D, 180);
  assert.equal(early.N, 30);
  assert.equal(early.u0, 1);
  const late = setupMatch([a, b], dayNum(2026, 6, 29));
  assert.equal(late.u0, 29);
});

test('setupMatch: 同じ誕生日なら28マス(1マス=13日)', () => {
  const bd = { m: 5, d: 5 };
  const m = setupMatch([{ name: 'A', birthday: bd }, { name: 'B', birthday: bd }], dayNum(2026, 11, 1), () => 0);
  assert.equal(m.N, 28);
  assert.equal(m.k, 13);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: FAIL(`dateLine` などが export されていない)

- [ ] **Step 3: 実装する**

`js/dates.js` の `growthStep` 関数の直後に追加する:

```js
// 日付の道: 2人の誕生日の間を N マスに分ける。30日以下なら1マス=1日、それより長ければ1マス=k日(N は30以下)。
export function dateLine(D) {
  if (D <= 30) return { N: D, k: 1 };
  const k = Math.ceil(D / 30);
  return { N: Math.round(D / k), k };
}

// マス u の日付が、黒の誕生日から何日目か
export function squareOffset(u, D, N) {
  return Math.round((u * D) / N);
}

// 黒の誕生日から offset 日目の日付が属するマス
export function squareOfOffset(offset, D, N) {
  return Math.round((offset * N) / D);
}

// マス u が受け持つ期間(黒の誕生日からの日数で [最初, 最後])
export function squarePeriod(u, D, N) {
  let from = squareOffset(u, D, N);
  let to = from;
  while (from > 0 && squareOfOffset(from - 1, D, N) === u) from -= 1;
  while (to < D && squareOfOffset(to + 1, D, N) === u) to += 1;
  return [from, to];
}
```

`js/dates.js` の `setupMatch` の `const D = whiteDay - baseDay;` の直後に追加する:

```js
  const { N, k } = dateLine(D);
  const u0 = Math.min(N - 1, Math.max(1, squareOfOffset(start - baseDay, D, N)));
```

同じ関数の戻り値の `sameBirthday,` の直後に `N,`、`k,`、`u0,` を1行ずつ追加する。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: すべて pass、fail 0

- [ ] **Step 5: コミット**

```bash
git add js/dates.js tests/dates.test.js
git commit -m "Add date-line squares to dates"
```

(コミットメッセージの最後には、実際に作業したモデル名の Co-Authored-By 行を付ける。以下のタスクも同じ。)

---

### Task 2: ルール本体 v2

**Files:**
- Modify: `js/rules.js`(全体を置き換え)
- Modify: `js/events.js`(EFFECTS を置き換え)
- Modify: `js/dates.js`(増え方 s を削除)
- Test: `tests/rules.test.js`(全体を置き換え)、`tests/dates.test.js`(s の削除に合わせる)

**Interfaces:**
- Consumes: Task 1 の `squareOfOffset`、setupMatch の `N`・`u0`
- Produces(js/rules.js):
  - `stoneWeight(stone) → number`(1 + flips)
  - `reflect(x, N)`
  - `newGame(match)`: 空の盤面。`p = match.u0`。`events` はマス番号がキー
  - `flipLines(board, idx, color) → Array<{ dir: 0〜7, cells: number[] }>`
    - dir の意味: 0 左上、1 上、2 右上、3 左、4 右、5 左下、6 下、7 右下
    - cells は置いたマスに近い順
  - `computeFlips(board, idx, color) → number[]`(すべての列)
  - `canFlipAnywhere(board, color) → boolean`
  - `moveDays(base, pending, color, adjust = 0, penalty = false) → { days, dir, stall }`
  - `previewMove(state, idx, { lines?, adjust? }) → { idx, lines, chosen, flips, base, needsAdjust, adjust, days, dir, stall, toP, bounced, win, event }`
  - `playMove(state, idx, { lines?, adjust? }) → State`
    - `lastMove` に `lines`(選んだ列)と `stall` を追加する
  - `judgeFull`・`countStones`・`choiceTargets`・`applyChoice`(マス単位、使い方は今まで通り)
- Produces(js/dates.js): `setupMatch` の戻り値から `s` を削除し、`growthStep` も削除する

- [ ] **Step 1: 失敗するテストを書く**

`tests/rules.test.js` を次の内容に置き換える:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNum } from '../js/dates.js';
import {
  reflect, stoneWeight, newGame, flipLines, computeFlips, canFlipAnywhere, previewMove, moveDays, playMove,
  countStones, judgeFull, choiceTargets, applyChoice,
} from '../js/rules.js';

const at = (r, c) => r * 8 + c;
// 方向の番号: 0 左上, 1 上, 2 右上, 3 左, 4 右, 5 左下, 6 下, 7 右下
const DIR = { UL: 0, U: 1, UR: 2, L: 3, R: 4, DL: 5, D: 6, DR: 7 };

// 8行の文字列で盤面を作る。'.' 空き、'B' 黒、'W' 白、'b' 固定の黒、'w' 固定の白
function boardFrom(rows) {
  return rows.join('').split('').map((ch) => {
    if (ch === '.') return null;
    return { color: ch.toUpperCase(), flips: 0, fixed: ch === 'b' || ch === 'w' };
  });
}

const EMPTY_ROWS = Array(8).fill('........');
const rowsWith = (row3) => EMPTY_ROWS.map((row, i) => (i === 3 ? row3 : row));
// 真ん中の4石(イベントのテストで使う盤面)
const CENTER4 = ['........', '........', '........', '...WB...', '...BW...', '........', '........', '........'];
// 黒が (3,5) に置くと、左の列 (3,4) と下の列 (4,5) を挟める盤面
const TWO_LINES = ['........', '........', '........', '...BW...', '.....W..', '.....B..', '........', '........'];

function testMatch({ N = 20, u0 = 10, D = N, baseDay = dayNum(2026, 6, 1) } = {}) {
  return {
    black: { name: '黒の人', birthday: { m: 6, d: 1 }, day: baseDay },
    white: { name: '白の人', birthday: { m: 6, d: 21 }, day: baseDay + D },
    baseDay, D, N, k: D === N ? 1 : Math.ceil(D / 30), u0, sameBirthday: false,
  };
}

// テスト用の状態。rows を省略すると空の盤面。events は明示的に差し替える。
function stateWith({ N = 20, p = 10, turn = 'B', rows = null, events = {} } = {}) {
  const state = newGame(testMatch({ N, u0: p }));
  if (rows) state.board = boardFrom(rows);
  state.turn = turn;
  state.events = events;
  return state;
}

const NONE = { double: false, plus3: false, adjust: false, rest: false, reverse: false };
const ev = (effect, extra = {}) => ({ occasion: 'テスト', name: 'テスト', effect, day: 0, used: false, ...extra });

// ---- 基本 ----

test('reflect: 範囲内はそのまま', () => {
  assert.equal(reflect(7, 10), 7);
  assert.equal(reflect(0, 10), 0);
  assert.equal(reflect(10, 10), 10);
});

test('reflect: 仕様の例(2 から 5 戻ると 3)', () => {
  assert.equal(reflect(2 - 5, 10), 3);
});

test('reflect: 何度も跳ね返る', () => {
  assert.equal(reflect(13, 10), 7);
  assert.equal(reflect(-23, 10), 3);
  assert.equal(reflect(25, 10), 5);
  assert.equal(reflect(40, 10), 0);
});

test('stoneWeight: 1 + 裏返った回数', () => {
  assert.equal(stoneWeight({ color: 'B', flips: 0, fixed: false }), 1);
  assert.equal(stoneWeight({ color: 'B', flips: 3, fixed: false }), 4);
});

test('newGame: 空の盤面、黒の手番、開始マス', () => {
  const state = newGame(testMatch({ N: 20, u0: 10 }));
  assert.equal(state.board.filter(Boolean).length, 0);
  assert.equal(state.turn, 'B');
  assert.equal(state.p, 10);
  assert.equal(state.phase, 'play');
});

test('newGame: イベントを日付が属するマスに割り当てる(1マス=2日)', () => {
  // 10/14 から 12/3(D=50, N=25): ハロウィン(17日目)→マス9、文化の日(20日目)→マス10、勤労感謝の日(40日目)→マス20
  const state = newGame(testMatch({ D: 50, N: 25, u0: 13, baseDay: dayNum(2026, 10, 14) }));
  assert.equal(state.events[9].name, 'お菓子');
  assert.equal(state.events[9].day, dayNum(2026, 10, 31));
  assert.equal(state.events[10].effect, 'adjust');
  assert.equal(state.events[20].effect, 'rest');
  assert.equal(Object.keys(state.events).length, 3);
});

test('newGame: 同じマスに複数のイベントがあれば日付が早い方', () => {
  // 5/1 から(D=60, N=30): 5/3→マス1、5/4→マス2(1.5を切り上げ)、5/5→マス2
  const state = newGame(testMatch({ D: 60, N: 30, u0: 15, baseDay: dayNum(2026, 5, 1) }));
  assert.equal(state.events[1].occasion, '憲法記念日');
  assert.equal(state.events[2].occasion, 'みどりの日');
});

test('newGame: 白の誕生日のマスに入るイベントは使わない', () => {
  // 11/2 から(D=60, N=30): 12/31(59日目)→マス30(白の誕生日)なので除く。12/25(53日目)→マス27
  const state = newGame(testMatch({ D: 60, N: 30, u0: 15, baseDay: dayNum(2026, 11, 2) }));
  assert.equal(state.events[30], undefined);
  assert.equal(state.events[27].name, 'プレゼント');
});

// ---- 列 ----

test('flipLines: 8方向の列', () => {
  const board = boardFrom(['........', '.B.B.B..', '..WWW...', '.BW.WB..', '..WWW...', '.B.B.B..', '........', '........']);
  const lines = flipLines(board, at(3, 3), 'B');
  assert.equal(lines.length, 8);
  assert.deepEqual(lines.find((l) => l.dir === DIR.R).cells, [at(3, 4)]);
  assert.equal(computeFlips(board, at(3, 3), 'B').length, 8);
});

test('flipLines: 列の石は置いたマスに近い順', () => {
  assert.deepEqual(flipLines(boardFrom(rowsWith('.WWB....')), at(3, 0), 'B'), [{ dir: DIR.R, cells: [at(3, 1), at(3, 2)] }]);
});

test('flipLines: 相手の固定石は壁になり、自分の固定石は端に使える', () => {
  assert.deepEqual(flipLines(boardFrom(rowsWith('.WwB....')), at(3, 0), 'B'), []);
  assert.deepEqual(flipLines(boardFrom(rowsWith('.WWb....')), at(3, 0), 'B'), [{ dir: DIR.R, cells: [at(3, 1), at(3, 2)] }]);
});

test('flipLines: 空の盤面や石があるマスでは列がない', () => {
  assert.deepEqual(flipLines(boardFrom(EMPTY_ROWS), at(0, 0), 'B'), []);
  assert.deepEqual(flipLines(boardFrom(rowsWith('.WB.....')), at(3, 1), 'B'), []);
});

test('canFlipAnywhere: どこかに挟める手があるか', () => {
  assert.equal(canFlipAnywhere(boardFrom(EMPTY_ROWS), 'B'), false);
  // (3,0) 黒・(3,1) 白: 黒は (3,2) に置けば挟めるが、白は盤の端があるので挟めない
  assert.equal(canFlipAnywhere(boardFrom(rowsWith('BW......')), 'B'), true);
  assert.equal(canFlipAnywhere(boardFrom(rowsWith('BW......')), 'W'), false);
});

// ---- 移動マス数 ----

test('moveDays: 返したとき 黒は-1、白は+1 の向き', () => {
  assert.deepEqual(moveDays(5, NONE, 'B'), { days: 5, dir: -1, stall: false });
  assert.deepEqual(moveDays(5, NONE, 'W'), { days: 5, dir: 1, stall: false });
});

test('moveDays: 2倍 → +3 → 調整 の順に計算する', () => {
  assert.equal(moveDays(5, { ...NONE, double: true, plus3: true }, 'B').days, 13);
  assert.equal(moveDays(5, { ...NONE, double: true, plus3: true, adjust: true }, 'B', -3).days, 10);
});

test('moveDays: 調整は -3〜+3 に収め、0マス未満にならない', () => {
  assert.equal(moveDays(2, { ...NONE, adjust: true }, 'W', -3).days, 0);
  assert.equal(moveDays(2, { ...NONE, adjust: true }, 'W', 9).days, 5);
});

test('moveDays: 調整の効果がなければ調整値は無視する', () => {
  assert.equal(moveDays(5, NONE, 'B', 3).days, 5);
});

test('moveDays: おやすみは0マス、うそは向きが逆', () => {
  assert.equal(moveDays(5, { ...NONE, double: true, rest: true }, 'B').days, 0);
  assert.deepEqual(moveDays(5, { ...NONE, reverse: true }, 'B'), { days: 5, dir: 1, stall: false });
});

test('moveDays: 返さない手は、代償なら効果に関係なく相手側へ1マス、そうでなければ動かない', () => {
  const all = { double: true, plus3: true, adjust: true, rest: true, reverse: true };
  assert.deepEqual(moveDays(0, NONE, 'B', 0, true), { days: 1, dir: 1, stall: true });
  assert.deepEqual(moveDays(0, NONE, 'W', 0, true), { days: 1, dir: -1, stall: true });
  assert.deepEqual(moveDays(0, all, 'B', 3, true), { days: 1, dir: 1, stall: true });
  assert.equal(moveDays(0, all, 'B', 3, false).days, 0);
});

// ---- 予告 ----

test('previewMove: 既定ではすべての列を返す', () => {
  const pv = previewMove(stateWith({ N: 20, p: 10, rows: TWO_LINES }), at(3, 5));
  assert.deepEqual(pv.chosen, [DIR.L, DIR.D]);
  assert.deepEqual(pv.flips, [at(3, 4), at(4, 5)]);
  assert.equal(pv.base, 2);
  assert.equal(pv.days, 2);
  assert.equal(pv.toP, 8);
  assert.equal(pv.stall, false);
});

test('previewMove: 選んだ列だけを返す', () => {
  const pv = previewMove(stateWith({ rows: TWO_LINES }), at(3, 5), { lines: [DIR.D] });
  assert.deepEqual(pv.chosen, [DIR.D]);
  assert.deepEqual(pv.flips, [at(4, 5)]);
  assert.equal(pv.toP, 9);
});

test('previewMove: 列を1つも選ばなければすべての列を返す(少なくとも1列)', () => {
  const pv = previewMove(stateWith({ rows: TWO_LINES }), at(3, 5), { lines: [] });
  assert.equal(pv.flips.length, 2);
});

test('previewMove: 挟める手があるのに返さなければ相手側へ1マス', () => {
  const black = previewMove(stateWith({ p: 10, rows: rowsWith('.WB.....') }), at(7, 7));
  assert.equal(black.stall, true);
  assert.equal(black.toP, 11);
  const white = previewMove(stateWith({ p: 10, turn: 'W', rows: rowsWith('.BW.....') }), at(7, 7));
  assert.equal(white.toP, 9);
});

test('previewMove: 挟める手がどこにもなければ日付は動かない', () => {
  const pv = previewMove(stateWith({ p: 10 }), at(0, 0));
  assert.equal(pv.stall, false);
  assert.equal(pv.days, 0);
  assert.equal(pv.toP, 10);
});

test('previewMove: 誕生日にぴったり・跳ね返り・イベントを予告する', () => {
  const win = previewMove(stateWith({ N: 20, p: 1, rows: rowsWith('.WB.....') }), at(3, 0));
  assert.equal(win.win, 'B');
  const bounce = previewMove(stateWith({ N: 20, p: 2, rows: rowsWith('.WWWWWB.') }), at(3, 0));
  assert.equal(bounce.bounced, true);
  assert.equal(bounce.toP, 3);
  const event = previewMove(stateWith({ p: 10, rows: rowsWith('.WB.....'), events: { 9: ev('plus3') } }), at(3, 0));
  assert.equal(event.event.effect, 'plus3');
});

test('previewMove: 調整は返す石があるときだけ', () => {
  const st = stateWith({ p: 10, rows: rowsWith('.WB.....') });
  st.pending.B.adjust = true;
  const pv = previewMove(st, at(3, 0), { adjust: 2 });
  assert.equal(pv.needsAdjust, true);
  assert.equal(pv.adjust, 2);
  assert.equal(pv.days, 3);
  assert.equal(pv.toP, 7);
  assert.equal(previewMove(st, at(7, 7), { adjust: 2 }).needsAdjust, false);
});

// ---- 打つ ----

test('playMove: 予告と同じ結果になり、選ばなかった列は返らない', () => {
  const st = stateWith({ rows: TWO_LINES });
  const pv = previewMove(st, at(3, 5), { lines: [DIR.D] });
  const next = playMove(st, at(3, 5), { lines: [DIR.D] });
  assert.equal(next.p, pv.toP);
  assert.equal(next.board[at(4, 5)].color, 'B');
  assert.equal(next.board[at(3, 4)].color, 'W');
  assert.deepEqual(next.lastMove.lines, [DIR.D]);
  assert.equal(next.turn, 'W');
  assert.equal(st.board[at(4, 5)].color, 'W', '元の盤面は変えない');
});

test('playMove: 返した石は重くなり、重さの合計だけ動く', () => {
  const st = stateWith({ N: 30, p: 20, rows: rowsWith('.WWB....') });
  st.board[at(3, 1)].flips = 2;
  const next = playMove(st, at(3, 0));
  assert.equal(next.lastMove.base, 4);
  assert.equal(next.p, 16);
  assert.equal(stoneWeight(next.board[at(3, 1)]), 4);
});

test('playMove: 仕様の例(黒の誕生日の2マス手前から5マス分で、跳ね返って3マス)', () => {
  const next = playMove(stateWith({ N: 50, p: 2, rows: rowsWith('.WWWWWB.') }), at(3, 0));
  assert.equal(next.lastMove.base, 5);
  assert.equal(next.p, 3);
});

test('playMove: 返さない手の代償は効果に関係なく1マスで、効果は使い切る', () => {
  const st = stateWith({ p: 10, rows: rowsWith('.WB.....') });
  st.pending.B.double = true;
  st.pending.B.rest = true;
  const next = playMove(st, at(7, 7));
  assert.equal(next.p, 11);
  assert.equal(next.lastMove.stall, true);
  assert.equal(next.pending.B.double, false);
  assert.equal(next.pending.B.rest, false);
  assert.equal(next.turn, 'W');
});

test('playMove: 挟める手がどこにもなければ日付は動かず、イベントも起きない', () => {
  const st = stateWith({ p: 10, events: { 10: ev('plus3') } });
  st.pending.B.plus3 = true;
  const next = playMove(st, at(0, 0));
  assert.equal(next.p, 10);
  assert.equal(next.lastMove.stall, false);
  assert.equal(next.lastMove.event, null);
  assert.equal(next.pending.B.plus3, false);
});

test('playMove: 誕生日が2日差でも1手目で決着しない', () => {
  const next = playMove(stateWith({ N: 2, p: 1 }), at(3, 3));
  assert.equal(next.phase, 'play');
  assert.equal(next.p, 1);
});

test('playMove: 代償で相手の誕生日に止まると相手の勝ち', () => {
  const next = playMove(stateWith({ N: 20, p: 19, rows: rowsWith('.WB.....') }), at(7, 7));
  assert.deepEqual(next.result, { winner: 'W', reason: 'birthday' });
});

test('playMove: 代償でもイベントのマスに止まれば発動する', () => {
  const next = playMove(stateWith({ p: 10, rows: rowsWith('.WB.....'), events: { 11: ev('plus3') } }), at(7, 7));
  assert.equal(next.lastMove.event.effect, 'plus3');
  assert.equal(next.pending.B.plus3, true);
});

test('playMove: 石があるマスには置けない', () => {
  const st = stateWith({ rows: CENTER4 });
  assert.equal(playMove(st, at(3, 3)), st);
});

test('playMove: 黒が黒の誕生日にぴったり止めたら黒の勝ち', () => {
  const next = playMove(stateWith({ N: 20, p: 1, rows: rowsWith('.WB.....') }), at(3, 0));
  assert.equal(next.p, 0);
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result, { winner: 'B', reason: 'birthday' });
});

test('playMove: 白の手でも、黒の誕生日に止まれば黒の勝ち', () => {
  const st = stateWith({ N: 20, p: 1, turn: 'W', rows: rowsWith('.BW.....') });
  st.pending.W.reverse = true;
  const next = playMove(st, at(3, 0));
  assert.deepEqual(next.result, { winner: 'B', reason: 'birthday' });
});

test('playMove: 跳ね返りで反対側の誕生日に止まったら、その誕生日の人の勝ち', () => {
  const next = playMove(stateWith({ N: 4, p: 1, rows: rowsWith('.WWWWWB.') }), at(3, 0));
  assert.equal(next.p, 4);
  assert.deepEqual(next.result, { winner: 'W', reason: 'birthday' });
});

test('playMove: 最後の空きマスを埋めたら、残りマス数で判定する', () => {
  const next = playMove(stateWith({ N: 20, p: 8, rows: ['.BBBBBBB', ...Array(7).fill('BBBBBBBB')] }), at(0, 0));
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result, { winner: 'B', reason: 'full' });
});

test('judgeFull: 残りマス数が少ない方の勝ち', () => {
  assert.deepEqual(judgeFull(stateWith({ N: 20, p: 15 })), { winner: 'W', reason: 'full' });
});

test('judgeFull: 残りマス数が同じなら石の数、それも同じなら引き分け', () => {
  const half = [...Array(4).fill('BBBBBBBB'), ...Array(4).fill('WWWWWWWW')];
  const draw = stateWith({ N: 20, p: 10, rows: half });
  assert.deepEqual(countStones(draw), { B: 32, W: 32 });
  assert.deepEqual(judgeFull(draw), { winner: null, reason: 'full' });
  const blackMore = stateWith({ N: 20, p: 10, rows: [...Array(4).fill('BBBBBBBB'), 'BWWWWWWW', ...Array(3).fill('WWWWWWWW')] });
  assert.deepEqual(judgeFull(blackMore), { winner: 'B', reason: 'full' });
});

// ---- イベント ----

test('イベント: ぴったり止まった人に発動し、使用済みになる', () => {
  const next = playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('plus3') } }), at(2, 3));
  assert.equal(next.lastMove.event.effect, 'plus3');
  assert.equal(next.events[9].used, true);
  assert.equal(next.pending.B.plus3, true);
  assert.equal(next.turn, 'W');
});

test('イベント: 使用済みのイベントは発動しない', () => {
  const next = playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('plus3', { used: true }) } }), at(2, 3));
  assert.equal(next.lastMove.event, null);
  assert.equal(next.pending.B.plus3, false);
});

test('イベント: おやすみで日付が動かなかった手では発動しない', () => {
  const st = stateWith({ p: 10, rows: CENTER4, events: { 10: ev('plus3') } });
  st.pending.B.rest = true;
  const next = playMove(st, at(2, 3));
  assert.equal(next.p, 10);
  assert.equal(next.lastMove.event, null);
});

test('イベント: 誕生日に止まったらイベントより勝利が優先', () => {
  const next = playMove(stateWith({ p: 1, rows: CENTER4, events: { 0: ev('plus3') } }), at(2, 3));
  assert.deepEqual(next.result, { winner: 'B', reason: 'birthday' });
  assert.equal(next.events[0].used, false);
});

test('イベント: おやすみは相手の次の手に付き、日付が動かない', () => {
  const mid = playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('rest') } }), at(2, 3));
  assert.equal(mid.pending.W.rest, true);
  const next = playMove(mid, at(2, 2));
  assert.equal(next.lastMove.base, 2);
  assert.equal(next.p, 9);
  assert.equal(next.pending.W.rest, false);
});

test('イベント: うそは相手の次の手の向きを逆にする', () => {
  const mid = playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('reverse') } }), at(2, 3));
  assert.equal(playMove(mid, at(2, 2)).p, 7);
});

test('イベント: もう一手なら同じ人の番が続く', () => {
  assert.equal(playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('extraTurn') } }), at(2, 3)).turn, 'B');
});

test('イベント: 真ん中へで floor(N/2) に飛び、飛んだ先では発動しない', () => {
  const next = playMove(stateWith({ N: 21, p: 10, rows: CENTER4, events: { 9: ev('middle'), 10: ev('plus3') } }), at(2, 3));
  assert.equal(next.p, 10);
  assert.equal(next.lastMove.warpTo, 10);
  assert.equal(next.events[10].used, false);
  assert.equal(next.pending.B.plus3, false);
});

test('イベント: 重さリセットで全部の石の裏返り回数が0になる', () => {
  const st = stateWith({ p: 10, rows: CENTER4, events: { 9: ev('resetWeights') } });
  st.board[at(3, 4)].flips = 3;
  const next = playMove(st, at(2, 3));
  assert.ok(next.board.filter(Boolean).every((stone) => stone.flips === 0));
});

test('イベント: 鬼は外は相手の石を選んで取り除く', () => {
  const mid = playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('remove') } }), at(2, 3));
  assert.equal(mid.phase, 'choose');
  assert.equal(mid.turn, 'B');
  assert.deepEqual(choiceTargets(mid), [at(4, 4)]);
  const next = applyChoice(mid, at(4, 4));
  assert.equal(next.board[at(4, 4)], null);
  assert.equal(next.phase, 'play');
  assert.equal(next.turn, 'W');
  assert.equal(applyChoice(mid, at(0, 0)), mid, '選べないマスでは何も起きない');
});

test('イベント: 固定は自分の石を固定し、以後は裏返らない', () => {
  const mid = playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('fix') } }), at(2, 3));
  assert.deepEqual(choiceTargets(mid), [at(2, 3), at(3, 3), at(3, 4), at(4, 3)]);
  assert.deepEqual(computeFlips(mid.board, at(2, 4), 'W'), [at(3, 4)]);
  const next = applyChoice(mid, at(3, 4));
  assert.equal(next.board[at(3, 4)].fixed, true);
  assert.deepEqual(computeFlips(next.board, at(2, 4), 'W'), []);
});

test('イベント: 奪うは相手の石を自分の色にし、重さは変わらない', () => {
  const st = stateWith({ p: 10, rows: CENTER4, events: { 9: ev('steal') } });
  st.board[at(4, 4)].flips = 2;
  const next = applyChoice(playMove(st, at(2, 3)), at(4, 4));
  assert.equal(next.board[at(4, 4)].color, 'B');
  assert.equal(next.board[at(4, 4)].flips, 2);
});

test('イベント: 植えるは空きマスに自分の石を置く', () => {
  const mid = playMove(stateWith({ p: 10, rows: CENTER4, events: { 9: ev('plant') } }), at(2, 3));
  assert.equal(choiceTargets(mid).length, 59);
  const next = applyChoice(mid, at(0, 0));
  assert.deepEqual(next.board[at(0, 0)], { color: 'B', flips: 0, fixed: false });
});

test('イベント: 選べる対象がなければ不発で、次の手番へ進む', () => {
  const rows = rowsWith('.WB.....').map((row, i) => (i === 0 ? 'w.......' : row));
  const next = playMove(stateWith({ p: 10, rows, events: { 9: ev('steal') } }), at(3, 0));
  assert.equal(next.lastMove.fizzled, true);
  assert.equal(next.phase, 'play');
  assert.equal(next.turn, 'W');
});

test('イベント: 植えるで最後の空きマスが埋まったら判定で終局', () => {
  const rows = ['.WBBBBB.', ...Array(7).fill('BBBBBBBB')];
  const mid = playMove(stateWith({ N: 20, p: 10, rows, events: { 9: ev('plant') } }), at(0, 0));
  assert.deepEqual(choiceTargets(mid), [at(0, 7)]);
  const next = applyChoice(mid, at(0, 7));
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result, { winner: 'B', reason: 'full' });
});
```

`tests/dates.test.js` から次を削除する:
- import の `growthStep,`
- `test('growthStep: D/24 を四捨五入し、最低1', ...)` のテスト全体
- `test('setupMatch: 過去側の誕生日の人が黒、未来側の人が白', ...)` の中の `assert.equal(m.s, 2);`

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: FAIL(`flipLines` などが export されていない、または空の盤面・マス単位のアサーションが失敗)

- [ ] **Step 3: js/rules.js を置き換える**

`js/rules.js`:

```js
import { listEventDays } from './events.js';
import { squareOfOffset } from './dates.js';

export const SIZE = 8;
// 方向の番号(0〜7): 0 左上, 1 上, 2 右上, 3 左, 4 右, 5 左下, 6 下, 7 右下。返す列の選択で使う。
const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export const opponent = (color) => (color === 'B' ? 'W' : 'B');

// 石の重さ = 次に裏返ったときに日付を何マス動かすか
export function stoneWeight(stone) {
  return 1 + stone.flips;
}

// 位置 x を 0〜N の範囲へ跳ね返らせる(何度でも)
export function reflect(x, N) {
  const period = 2 * N;
  const r = ((x % period) + period) % period;
  return r > N ? period - r : r;
}

function emptyPending() {
  return { double: false, plus3: false, adjust: false, rest: false, reverse: false };
}

const SELF_EFFECTS = ['double', 'plus3', 'adjust'];
const OPPONENT_EFFECTS = ['rest', 'reverse'];
const CHOICE_EFFECTS = ['remove', 'fix', 'steal', 'plant'];

// match: setupMatch の戻り値(D: 誕生日の間の日数、N: マス数、u0: 開始マス)
export function newGame(match) {
  const { baseDay, D, N } = match;
  const events = {};
  for (const { day, event } of listEventDays(baseDay + 1, baseDay + D - 1)) {
    const u = squareOfOffset(day - baseDay, D, N);
    if (u > 0 && u < N && !events[u]) events[u] = { ...event, day, used: false };
  }
  return {
    match,
    board: Array(SIZE * SIZE).fill(null),
    events,
    turn: 'B',
    p: match.u0,
    pending: { B: emptyPending(), W: emptyPending() },
    phase: 'play',
    choice: null,
    lastMove: null,
    result: null,
  };
}

// idx に color の石を置いたときに返せる列。dir は方向の番号、cells は裏返る石(置いたマスに近い順)。
// 相手の固定石は壁として働き、その方向は列にならない。
export function flipLines(board, idx, color) {
  if (board[idx]) return [];
  const r0 = Math.floor(idx / SIZE);
  const c0 = idx % SIZE;
  const lines = [];
  DIRECTIONS.forEach(([dr, dc], dir) => {
    const cells = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      const stone = board[r * SIZE + c];
      if (!stone) return;
      if (stone.color === color) {
        if (cells.length) lines.push({ dir, cells });
        return;
      }
      if (stone.fixed) return;
      cells.push(r * SIZE + c);
      r += dr;
      c += dc;
    }
  });
  return lines;
}

// すべての列を返したときに裏返る石
export function computeFlips(board, idx, color) {
  return flipLines(board, idx, color).flatMap((line) => line.cells);
}

// color の番で、どこかのマスに石を挟める手があるか
export function canFlipAnywhere(board, color) {
  for (let idx = 0; idx < SIZE * SIZE; idx++) {
    if (!board[idx] && flipLines(board, idx, color).length > 0) return true;
  }
  return false;
}

// 移動マス数と向き。
// 1枚以上返すとき: 基本 → 2倍 → +3 → 調整 → おやすみ → うそ。
// 1枚も返さないとき: penalty(挟める手があったのに返さなかった)なら、効果に関係なく相手の誕生日の方へ1マス。そうでなければ動かない。
export function moveDays(base, pending, color, adjust = 0, penalty = false) {
  const toOwn = color === 'B' ? -1 : 1;
  if (base === 0) return penalty ? { days: 1, dir: -toOwn, stall: true } : { days: 0, dir: toOwn, stall: false };
  let days = base;
  if (pending.double) days *= 2;
  if (pending.plus3) days += 3;
  if (pending.adjust) days = Math.max(0, days + Math.max(-3, Math.min(3, adjust)));
  if (pending.rest) days = 0;
  return { days, dir: pending.reverse ? -toOwn : toOwn, stall: false };
}

// 打つ前の予告。options.lines: 返す列の方向番号(省略時はすべて。空ならすべて)、options.adjust: 調整(−3〜+3)
export function previewMove(state, idx, options = {}) {
  const color = state.turn;
  const { N } = state.match;
  const pending = state.pending[color];
  const lines = flipLines(state.board, idx, color);
  const available = lines.map((line) => line.dir);
  let chosen = options.lines === undefined ? available : available.filter((dir) => options.lines.includes(dir));
  if (chosen.length === 0) chosen = available;
  const flips = lines.filter((line) => chosen.includes(line.dir)).flatMap((line) => line.cells);
  const base = flips.reduce((sum, i) => sum + stoneWeight(state.board[i]), 0);
  const needsAdjust = pending.adjust && base > 0;
  const adjust = needsAdjust ? Math.max(-3, Math.min(3, options.adjust ?? 0)) : 0;
  const penalty = base === 0 && canFlipAnywhere(state.board, color);
  const { days, dir, stall } = moveDays(base, pending, color, adjust, penalty);
  const raw = state.p + dir * days;
  const toP = reflect(raw, N);
  const win = toP === 0 ? 'B' : toP === N ? 'W' : null;
  const target = !win && days > 0 ? state.events[toP] : null;
  return {
    idx, lines, chosen, flips, base, needsAdjust, adjust, days, dir, stall, toP,
    bounced: raw < 0 || raw > N,
    win,
    event: target && !target.used ? target : null,
  };
}

export function playMove(state, idx, options = {}) {
  if (state.phase !== 'play' || state.board[idx]) return state;
  const move = previewMove(state, idx, options);
  const next = structuredClone(state);
  const color = next.turn;
  next.board[idx] = { color, flips: 0, fixed: false };
  for (const i of move.flips) {
    next.board[i].color = color;
    next.board[i].flips += 1;
  }
  next.pending[color] = emptyPending();
  const fromP = next.p;
  next.p = move.toP;
  next.lastMove = {
    color, idx, lines: move.chosen, flips: move.flips, base: move.base, days: move.days, dir: move.dir,
    stall: move.stall, fromP, toP: next.p, event: null, fizzled: false,
  };
  if (move.win) {
    next.phase = 'over';
    next.result = { winner: move.win, reason: 'birthday' };
    return next;
  }
  let extraTurn = false;
  const event = move.days > 0 ? next.events[next.p] : null;
  if (event && !event.used) {
    event.used = true;
    next.lastMove.event = { ...event };
    extraTurn = applyEffect(next, event.effect, color);
  }
  return finishTurn(next, extraTurn);
}

// 盤面が埋まっていれば判定で終局、そうでなければ次の手番へ。石やマスを選ぶ途中なら何もしない。
function finishTurn(state, extraTurn) {
  if (state.phase === 'choose') return state;
  if (state.board.every(Boolean)) {
    state.phase = 'over';
    state.result = judgeFull(state);
    return state;
  }
  if (!extraTurn) state.turn = opponent(state.turn);
  return state;
}

export function countStones(state) {
  const count = { B: 0, W: 0 };
  for (const stone of state.board) if (stone) count[stone.color] += 1;
  return count;
}

// 盤面が埋まったときの判定: 誕生日までの残りマス数 → 石の数 → 引き分け
export function judgeFull(state) {
  const blackLeft = state.p;
  const whiteLeft = state.match.N - state.p;
  if (blackLeft !== whiteLeft) return { winner: blackLeft < whiteLeft ? 'B' : 'W', reason: 'full' };
  const { B, W } = countStones(state);
  if (B !== W) return { winner: B > W ? 'B' : 'W', reason: 'full' };
  return { winner: null, reason: 'full' };
}

// 効果を適用する(state を直接書き換える)。もう一手なら true を返す。
function applyEffect(state, effect, color) {
  if (SELF_EFFECTS.includes(effect)) {
    state.pending[color][effect] = true;
  } else if (OPPONENT_EFFECTS.includes(effect)) {
    state.pending[opponent(color)][effect] = true;
  } else if (effect === 'extraTurn') {
    return true;
  } else if (effect === 'middle') {
    state.p = Math.floor(state.match.N / 2);
    state.lastMove.warpTo = state.p;
  } else if (effect === 'resetWeights') {
    for (const stone of state.board) if (stone) stone.flips = 0;
  } else if (CHOICE_EFFECTS.includes(effect)) {
    state.choice = { effect, player: color };
    if (choiceTargets(state).length > 0) {
      state.phase = 'choose';
    } else {
      state.choice = null;
      state.lastMove.fizzled = true;
    }
  }
  return false;
}

// 石やマスを選ぶ効果で、選べるマス
export function choiceTargets(state) {
  if (!state.choice) return [];
  const { effect, player } = state.choice;
  const targets = [];
  state.board.forEach((stone, idx) => {
    let ok;
    if (effect === 'plant') ok = !stone;
    else if (effect === 'fix') ok = stone && stone.color === player && !stone.fixed;
    else ok = stone && stone.color === opponent(player) && !stone.fixed;
    if (ok) targets.push(idx);
  });
  return targets;
}

export function applyChoice(state, idx) {
  if (state.phase !== 'choose' || !choiceTargets(state).includes(idx)) return state;
  const next = structuredClone(state);
  const { effect, player } = next.choice;
  if (effect === 'remove') next.board[idx] = null;
  else if (effect === 'fix') next.board[idx].fixed = true;
  else if (effect === 'steal') next.board[idx].color = player;
  else if (effect === 'plant') next.board[idx] = { color: player, flips: 0, fixed: false };
  next.choice = null;
  next.phase = 'play';
  return finishTurn(next, false);
}
```

- [ ] **Step 4: 効果の説明文と、dates.js の増え方 s を直す**

`js/events.js` の `export const EFFECTS = { ... };` を次に置き換える:

```js
export const EFFECTS = {
  plus3: { name: 'プラス3', text: '自分の次の手で動くマス数が+3' },
  double: { name: '2倍', text: '自分の次の手で動くマス数が2倍' },
  adjust: { name: '調整', text: '自分の次の手で、動くマス数を−3〜+3の範囲で選べる' },
  extraTurn: { name: 'もう一手', text: '続けてもう1回打てる' },
  rest: { name: 'おやすみ', text: '相手の次の手は、石を返しても日付が動かない' },
  reverse: { name: 'うそ', text: '相手の次の手は日付が逆向きに動く' },
  middle: { name: '真ん中へ', text: '日付が2人の誕生日のちょうど真ん中のマスに飛ぶ' },
  remove: { name: '鬼は外', text: '相手の石を1つ選んで取り除く' },
  fix: { name: '固定', text: '自分の石を1つ選んで固定する(以後は裏返らない)' },
  steal: { name: '奪う', text: '相手の石を1つ選んで自分の色にする' },
  resetWeights: { name: '重さリセット', text: '盤面のすべての石の重さが1に戻る' },
  plant: { name: '植える', text: '空きマスを1つ選んで自分の石を置く' },
};
```

`js/dates.js` から次を削除する:
- `growthStep` 関数とその直前のコメント
- `setupMatch` の戻り値の `s: growthStep(D),`

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test`
Expected: すべて pass、fail 0

(この時点の画面は rules.js の新しい形にまだ対応していない。画面は Task 4 で直し、スモークテストもそこで実行する。)

- [ ] **Step 6: コミット**

```bash
git add js/rules.js js/events.js js/dates.js tests/rules.test.js tests/dates.test.js
git commit -m "Rules v2: empty board, line choice, date squares, waiting cost"
```

---

### Task 3: バランス確認スクリプト

**Files:**
- Create: `tools/balance.mjs`
- Modify: `package.json`、`README.md`

**Interfaces:**
- Consumes: Task 2 の `newGame`, `previewMove`, `playMove`, `flipLines`, `choiceTargets`, `applyChoice`、Task 1・2 の `setupMatch`, `defaultStart`
- Produces: `npm run balance [-- 対局数]`。誕生日決着の割合が 60〜90% なら終了コード 0、外れたら 1。

- [ ] **Step 1: スクリプトを書く**

`tools/balance.mjs`:

```js
// 本物のルール(js/rules.js)で、ていねいなAI同士を対戦させてバランスを確かめる。
// 使い方: caffeinate -i npm run balance(対局数を変えるときは npm run balance -- 400)
import { defaultStart, setupMatch } from '../js/dates.js';
import { applyChoice, choiceTargets, flipLines, newGame, playMove, previewMove } from '../js/rules.js';

const GAMES = Number(process.argv[2] ?? 200);
const PASS_RANGE = [0.6, 0.9];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function randomBirthday() {
  const date = new Date(Date.UTC(2026, 0, 1 + Math.floor(Math.random() * 365)));
  return { m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function nonEmptySubsets(dirs) {
  const out = [];
  for (let mask = 1; mask < 1 << dirs.length; mask++) out.push(dirs.filter((_, i) => mask & (1 << i)));
  return out;
}

// 置けるすべての手(返す列の選び方と調整の値まで含める)
function candidates(state) {
  const adjusts = state.pending[state.turn].adjust ? [-3, -2, -1, 0, 1, 2, 3] : [0];
  const out = [];
  for (let idx = 0; idx < 64; idx++) {
    if (state.board[idx]) continue;
    const dirs = flipLines(state.board, idx, state.turn).map((line) => line.dir);
    for (const lines of dirs.length ? nonEmptySubsets(dirs) : [[]]) {
      for (const adjust of adjusts) out.push({ idx, lines, adjust });
    }
  }
  return out;
}

// 選ぶ効果: 相手のいちばん重い石・自分のいちばん重い石・ランダムな空きマス
function resolveChoice(state) {
  let current = state;
  while (current.phase === 'choose') {
    const targets = choiceTargets(current);
    const weight = (i) => current.board[i]?.flips ?? 0;
    const idx = current.choice.effect === 'plant' ? pick(targets) : targets.reduce((a, b) => (weight(b) > weight(a) ? b : a));
    current = applyChoice(current, idx);
  }
  return current;
}

const left = (state, p, color) => (color === 'B' ? p : state.match.N - p);

function opponentCanWin(state, me) {
  if (state.phase !== 'play' || state.turn === me) return false;
  return candidates(state).some((c) => previewMove(state, c.idx, c).win === state.turn);
}

// ていねいなAI: 1手先でいちばん得な手(相手の残りマス − 自分の残りマス)を選ぶ。ただし相手にすぐ勝たれる手は避ける。
function carefulMove(state) {
  const me = state.turn;
  const them = me === 'B' ? 'W' : 'B';
  const scored = candidates(state).map((c) => {
    const pv = previewMove(state, c.idx, c);
    let score = left(state, pv.toP, them) - left(state, pv.toP, me) + Math.random() * 1e-3;
    if (pv.win) score = pv.win === me ? Infinity : -Infinity;
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  if (scored[0].score === Infinity) return scored[0].c;
  for (const { c } of scored) {
    if (!opponentCanWin(resolveChoice(playMove(state, c.idx, c)), me)) return c;
  }
  return scored[0].c;
}

function playGame() {
  const a = { name: 'A', birthday: randomBirthday() };
  const b = { name: 'B', birthday: randomBirthday() };
  let state = newGame(setupMatch([a, b], defaultStart(a.birthday, b.birthday, 2026)));
  let moves = 0;
  let events = 0;
  while (state.phase !== 'over' && moves < 300) {
    const c = carefulMove(state);
    state = playMove(state, c.idx, c);
    if (state.lastMove.event) events += 1;
    state = resolveChoice(state);
    moves += 1;
  }
  return { result: state.result, moves, events };
}

const started = Date.now();
let birthday = 0;
let blackWins = 0;
let totalMoves = 0;
let totalEvents = 0;
for (let i = 0; i < GAMES; i++) {
  const game = playGame();
  if (game.result?.reason === 'birthday') birthday += 1;
  if (game.result?.winner === 'B') blackWins += 1;
  totalMoves += game.moves;
  totalEvents += game.events;
}
const rate = birthday / GAMES;
console.log(`対局数 ${GAMES}(${Math.round((Date.now() - started) / 1000)}秒)`);
console.log(`誕生日で決着: ${Math.round(100 * rate)}%  平均手数: ${(totalMoves / GAMES).toFixed(1)}  先手の勝率: ${Math.round((100 * blackWins) / GAMES)}%  1試合のイベント: ${(totalEvents / GAMES).toFixed(1)}`);
if (rate < PASS_RANGE[0] || rate > PASS_RANGE[1]) {
  console.error(`NG: 誕生日決着の割合が ${PASS_RANGE[0] * 100}〜${PASS_RANGE[1] * 100}% の範囲外です`);
  process.exit(1);
}
console.log('OK: バランスは想定の範囲内です');
```

`package.json` の `"scripts"` に `"balance": "node tools/balance.mjs"` を追加する(`"smoke"` の行の後。直前の行の末尾にカンマを付ける)。

`README.md` の「## 開発」のコードブロックの `npm run smoke` の行の後に、次の1行を追加する:

```
npm run balance   # 本物のルールでAI同士を対戦させ、バランスを確かめる
```

`README.md` の `Mac がスリープすると…` の行を次に置き換える:

```
Mac がスリープすると長い処理が途中で止まるため、`caffeinate -i npm run smoke`・`caffeinate -i npm run balance` のように実行してください。
```

- [ ] **Step 2: 実行して確かめる**

Run: `caffeinate -i npm run balance`
Expected: `OK: バランスは想定の範囲内です`(誕生日決着がおよそ 60〜80%)。

NG になった場合は、AI ではなくルールの実装を疑う。仕様の 2.5 と 2.7 を見直し、Task 2 の rules.js と仕様が食い違っていないか調べて報告する。ルールを変えて数字を合わせることはしない。

- [ ] **Step 3: コミット**

```bash
git add tools/balance.mjs package.json README.md
git commit -m "Add balance check script with careful AI"
```

---

### Task 4: 画面(予告 → 決定、今日の強調、マス表示)

**Files:**
- Modify: `index.html`(全体を置き換え)
- Modify: `css/style.css`(全体を置き換え)
- Modify: `js/ui.js`(全体を置き換え)
- Modify: `js/main.js`(全体を置き換え)
- Modify: `tools/smoke.mjs`(全体を置き換え)

**Interfaces:**
- Consumes: Task 1 の `squareOffset`, `squarePeriod`、setupMatch の `N`/`k`/`u0`。Task 2 の `previewMove`, `playMove(state, idx, { lines, adjust })`, `applyChoice`, `stoneWeight(stone)`
- Produces:
  - js/ui.js: `renderGame(state, { shownP, preview })`, `renderSetupPreview`, `revealPreviewPanel`, `squareLabel`, `dateOf(state, u)`, `cellDistance`, `animateMove`, `animateChoice`, `animateWarp`, `highlightEffect`, `celebrate`, `showEventDialog`, `showResult`, `showRules`, `fillRulesEventList`, `fillMonthSelect`, `fillDaySelect`
  - DOM の約束: `#square-size`, `.board-wrap`, `#preview-panel`(中のボタンは `[data-pv="confirm"]`, `[data-pv="cancel"]`, `[data-adjust="-3"..."3"]`), `.cell.is-today .today-tag`, `.cell.in-period`, `.cell.dest`, `.cell.line-on`, `.cell.line-off`, `.stone.ghost`, `.stone.will-flip`
  - Task 5 で中身を差し替える関数: `animateMove`, `animateChoice`, `animateWarp`, `highlightEffect`, `celebrate`(このタスクでは、最小限の動きで正しく表示するだけにする)

- [ ] **Step 1: スモークテストを v2 の操作に合わせて書き換える(失敗するテスト)**

`tools/smoke.mjs` を次の内容に置き換える:

```js
// ヘッドレス Chrome で画面を開いて操作し、エラーがないことを確かめ、スクリーンショットを保存する。
// 使い方: caffeinate -i npm run smoke(公開版を確かめるときは SMOKE_URL=https://... を付ける)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
import { startServer } from './serve.mjs';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_PORT = 8765;
const DEBUG_PORT = 9333;
const OUT = new URL('./screenshots/', import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = process.env.SMOKE_URL ? null : await startServer(APP_PORT);
const appUrl = process.env.SMOKE_URL ?? `http://127.0.0.1:${APP_PORT}/`;
const profile = mkdtempSync(join(tmpdir(), 'birthday-othello-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  // バックグラウンド扱いによるタイマーの抑制を切る(長い演出の途中で止まらないように)
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: 'ignore' });

const failures = [];
const pageErrors = [];
const waiting = new Map();
const listeners = [];
let ws;
let nextId = 1;

try {
  ws = new WebSocket(await pageSocketUrl());
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
      return;
    }
    for (const l of listeners.filter((x) => x.method === msg.method)) {
      listeners.splice(listeners.indexOf(l), 1);
      l.resolve(msg.params);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(d.exception?.description ?? d.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') pageErrors.push(msg.params.entry.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    // confirm() などのダイアログは既定では止まってしまうので、自動で「OK」を押す
    if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  mkdirSync(OUT, { recursive: true });
  await scenarios();
} catch (err) {
  failures.push(`スモークテストが途中で止まりました: ${err.message}`);
} finally {
  ws?.close();
  chrome.kill();
  server?.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 後片付けの失敗は無視 */ }
}

for (const e of pageErrors) failures.push(`ページのエラー: ${e}`);
if (failures.length) {
  console.error(failures.map((f) => `NG: ${f}`).join('\n'));
  process.exit(1);
}
console.log(`OK: スクリーンショットを ${fileURLToPath(OUT)} に保存しました`);

// ---- シナリオ ----

async function scenarios() {
  // 1. スマホ幅: 設定 → 空の盤面 → 予告 → 決定、序盤の3手
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  const setupText = await js(`document.querySelector('#setup-preview').textContent`);
  check(
    setupText.includes('黒: たろう(10/14)') && setupText.includes('白: はなこ(12/3)') && setupText.includes('間は50日、25マス(1マス=2日)'),
    `設定の確認文が想定と違います: ${setupText}`,
  );
  check(await noHorizontalScroll(), '設定画面(390px)が横にスクロールします');
  await shot('phone-setup');
  await startFromSetup();
  check(await stoneCount() === 0, `空の盤面から始まっていません: 石の数 ${await stoneCount()}`);
  check(await js(`document.querySelector('#square-size').textContent`) === '1マス=2日', '上部の帯に「1マス=2日」が出ていません');
  check(await js(`document.querySelector('#board .cell.is-today .today-tag') !== null`), '今日のマスに「今日」の札がありません');
  check(await js(`document.querySelectorAll('#board .cell.in-period').length`) === 1, '1マス=2日のとき、今のマスの期間に色がついていません');
  const before = await todayText();
  await tapCell(27);
  check(await stoneCount() === 0, '予告しただけで石が置かれています');
  check(await js(`document.querySelector('#board .cell[data-idx="27"] .stone.ghost') !== null`), '予告の半透明の石が出ていません');
  check(!(await js(`document.querySelector('#preview-panel').hidden`)), '予告パネルが出ていません');
  check(await panelText().then((t) => t.includes('挟める手がない')), `空の盤面での予告文がおかしいです: ${await panelText()}`);
  await tapCell(36);
  check(await stoneCount() === 0, '別のマスをタップしただけで石が置かれています');
  check(await js(`document.querySelector('#board .cell[data-idx="36"] .stone.ghost') !== null`), '予告が別のマスに切り替わっていません');
  await shot('phone-preview');
  await tapCell(36);
  await settled();
  check(await stoneCount() === 1, '同じマスの2回目のタップで石が置かれていません');
  check(await js(`document.querySelector('#preview-panel').hidden`), '打った後も予告パネルが残っています');
  await playCell(28);
  await playCell(20);
  check(await stoneCount() === 3, `3手打った後の石の数が3ではありません: ${await stoneCount()}`);
  check(await todayText() !== before, `石を返しても日付が変わっていません: ${before}`);
  check(await noHorizontalScroll(), '対戦画面(390px)が横にスクロールします');
  await shot('phone-game');

  // 2. 小さいスマホ幅: 月の切り替え、開始日を空にする、長い名前、半年離れた誕生日、連打
  await open(320, 640);
  await js(`(() => {
    const f = document.querySelector('#setup-form');
    const set = (name, value) => { f[name].value = value; f[name].dispatchEvent(new Event('change', { bubbles: true })); };
    set('month1', '1'); set('day1', '31'); set('month1', '2');
  })()`);
  check(await js(`document.querySelector('#setup-form').day1.value`) === '29', '31日のまま2月に切り替えたとき、日が29日に収まっていません');
  await js(`(() => {
    const f = document.querySelector('#setup-form');
    f.start.value = '';
    f.start.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  check(await js(`document.querySelector('#setup-form').start.value`) !== '', '開始日を空にしたとき既定の開始日に戻りません');
  await fillSetup({ name: 'あいうえおかきくけこ', m: 1, d: 1 }, { name: 'さしすせそたちつてと', m: 7, d: 1 });
  check(await noHorizontalScroll(), '設定画面(320px)が横にスクロールします');
  await startFromSetup();
  await js(`(() => {
    const cell = (i) => document.querySelector('#board .cell[data-idx="' + i + '"]');
    cell(19).click(); cell(19).click(); cell(20).click(); cell(20).click();
  })()`);
  await settled();
  check(await stoneCount() === 1, `連打で2手以上打てています: 石の数 ${await stoneCount()}`);
  check(await noHorizontalScroll(), '対戦画面(320px)が横にスクロールします');
  await shot('small-game');

  // 3. PC 幅
  await open(1280, 800);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  await startFromSetup();
  await shot('pc-game');

  // 4. 返す列を選ぶ(6/1 と 6/20。間にイベントがない)。黒が (3,5)=29 に置くと、左の列(28)と下の列(37)を挟める
  await open(390, 844);
  await fillSetup({ name: 'れつ', m: 6, d: 1 }, { name: 'えらび', m: 6, d: 20 });
  await startFromSetup();
  for (const idx of [27, 28, 45, 37]) await playCell(idx);
  await tapCell(29);
  check(await js(`document.querySelectorAll('#board .cell.line-on').length`) === 2, '2つの列が予告されていません');
  check(await panelText().then((t) => t.includes('2枚返して')), `2列を返す予告文になっていません: ${await panelText()}`);
  await tapCell(37);
  check(await js(`document.querySelectorAll('#board .cell.line-on').length`) === 1, '列の石をタップしても列が外れません');
  check(await js(`document.querySelectorAll('#board .cell.line-off').length`) === 1, '外した列が点線になっていません');
  check(await panelText().then((t) => t.includes('1枚返して')), `列を外した後の予告文になっていません: ${await panelText()}`);
  await tapCell(28);
  check(await js(`document.querySelectorAll('#board .cell.line-on').length`) === 1, '最後の1列が外れてしまいました');
  await shot('phone-lines');
  await js(`document.querySelector('#preview-panel [data-pv="confirm"]').click()`);
  await settled();
  check(await js(`document.querySelector('#board .cell[data-idx="28"] .stone').classList.contains('black')`), '選んだ列の石が返っていません');
  check(await js(`document.querySelector('#board .cell[data-idx="37"] .stone').classList.contains('white')`), '外した列の石まで返っています');
  await tapCell(0);
  await js(`document.querySelector('#preview-panel [data-pv="cancel"]').click()`);
  check(await js(`document.querySelector('#preview-panel').hidden`), '「やめる」で予告が消えません');
  check(await js(`document.querySelector('#board .stone.ghost') === null`), '「やめる」の後も半透明の石が残っています');

  // 5. イベント: 10/28 と 11/5(開始 11/1、1マス=1日)。黒の3手目で 10/31 ハロウィンに止まる
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 28 }, { name: 'はなこ', m: 11, d: 5 });
  await startFromSetup();
  await playCell(27);
  await playCell(28);
  await playCell(29);
  check(await js(`document.querySelector('#event-dialog').open`), 'ハロウィンに止まってもイベントのポップアップが出ません');
  check((await js(`document.querySelector('#event-title').textContent`)).includes('ハロウィン'), 'イベント名がハロウィンではありません');
  await shot('phone-event');
  await js(`document.querySelector('#event-dialog button').click()`);
  await settled();
  check((await js(`document.querySelector('#status-black').textContent`)).includes('2倍'), '黒の次の手に「2倍」が表示されていません');
  await playCell(26);
  check(await todayText() === '10月31日', `挟める手がない白の手で日付が動いています: ${await todayText()}`);
  await playCell(25);
  check(await todayText() === '10月29日', `2倍が効いた後の日付が 10月29日 ではありません: ${await todayText()}`);

  // 6. 最後まで打って結果を出し、再戦 → 2回目は Esc 相当で閉じて設定に戻る
  check(await playToEnd(), '最後まで打っても結果が出ません');
  const title = await js(`document.querySelector('#result-title').textContent`);
  check(title.includes('お誕生日おめでとう') || title.includes('引き分け'), `結果の見出しがおかしいです: ${title}`);
  await shot('phone-result');
  await js(`document.querySelector('#result-dialog button[value=rematch]').click()`);
  await waitFor(`!document.querySelector('#result-dialog').open && document.querySelectorAll('#board .stone').length === 0`, 3000).catch(() => {});
  check(await stoneCount() === 0, '再戦で盤面が空になっていません');
  check(await playToEnd(), '再戦で最後まで打っても結果が出ません');
  await js(`document.querySelector('#result-dialog').close()`);
  await waitFor(`!document.querySelector('#setup').hidden`, 2000).catch(() => {});
  check(await js(`!document.querySelector('#setup').hidden`), 'ボタン以外で結果を閉じたとき設定画面に戻りません(前回の再戦が残っています)');

  // 7. 半年離れた誕生日で最後まで
  await open(320, 640);
  await fillSetup({ name: 'あいうえおかきくけこ', m: 1, d: 1 }, { name: 'さしすせそたちつてと', m: 7, d: 1 });
  await startFromSetup();
  check(await playToEnd(), '半年離れた誕生日で最後まで打っても結果が出ません');
  await shot('small-result');

  // 8. ルール画面
  await js(`document.querySelector('#result-dialog button[value=setup]').click()`);
  await js(`document.querySelector('#setup [data-action="rules"]').click()`);
  check(await js(`document.querySelectorAll('#rules-events li').length`) === 23, 'ルール画面のイベント一覧が23件ではありません');
  check(await js(`document.querySelector('#rules-dialog').scrollTop`) === 0, 'ルールダイアログが先頭にスクロールしていません');
  await shot('small-rules');

  // 9. 調整つきの予告(11/1 と 11/7、1マス=1日)。黒の3手目で 11/3 文化の日に止まり、次の黒の手で調整が出る
  await open(375, 553);
  await fillSetup({ name: 'くろ', m: 11, d: 1 }, { name: 'しろ', m: 11, d: 7 });
  await startFromSetup();
  await playCell(27);
  await playCell(28);
  await playCell(29);
  check(await js(`document.querySelector('#event-dialog').open`), '文化の日のイベントが発動しません');
  await js(`document.querySelector('#event-dialog button').click()`);
  await settled();
  await playCell(26);
  await tapCell(25);
  await waitFor(`document.querySelector('#preview-panel .adjust-row') !== null`);
  const panelRect = await js(`(() => {
    const r = document.querySelector('#preview-panel').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  })()`);
  check(panelRect.top >= 0 && panelRect.bottom <= 553, `予告パネルが375x553の画面からはみ出しています: ${JSON.stringify(panelRect)}`);
  check(await js(`document.querySelectorAll('#preview-panel .adjust-row button').length`) === 7, '調整のボタンが7つではありません');
  await js(`document.querySelector('#preview-panel [data-adjust="2"]').click()`);
  check(await panelText().then((t) => t.includes('3マス動く')), `調整+2が予告に反映されていません: ${await panelText()}`);
  await shot('adjust-visible');
  // 予告中に「設定に戻る」で中断しても、次の対戦に残らない
  await js(`document.querySelector('[data-action="quit"]').click()`);
  await waitFor(`!document.querySelector('#setup').hidden`);
  check(await js(`document.body.dataset.busy`) !== '1', '予告中に中断しても busy が残っています');
  await startFromSetup();
  check(await stoneCount() === 0, '中断後の新しい対戦が空の盤面になっていません');
  check(await js(`document.querySelector('#preview-panel').hidden`), '中断後の新しい対戦に予告パネルが残っています');
  check(await js(`document.querySelector('#board .stone.ghost') === null`), '中断後の新しい対戦に半透明の石が残っています');
  await playCell(20);
  check(await stoneCount() === 1, '中断後の新しい対戦で打てません');

  // 10. 演出中に「設定に戻る」で中断し、演出が終わる前に新しい対戦を始めても上書きされない
  await open(400, 700);
  await fillSetup({ name: 'アニメ太郎', m: 3, d: 1 }, { name: 'アニメ花子', m: 9, d: 1 });
  await startFromSetup();
  await tapCell(27);
  await js(`(() => {
    document.querySelector('#board .cell[data-idx="27"]').click();
    document.querySelector('[data-action="quit"]').click();
    document.querySelector('#setup-form button[type=submit]').click();
  })()`);
  await waitFor(`!document.querySelector('#game').hidden`);
  await sleep(1500);
  check(await stoneCount() === 0, '演出中に中断して新しい対戦を始めても、盤面が上書きされます');
  check(await js(`document.querySelector('#status-black').classList.contains('active')`), '演出中に中断して新しい対戦を始めても、黒の番になっていません');
  check(await noHorizontalScroll(), '演出中断からの新しい対戦画面が横にスクロールします');

  // 11. 端末で「動きを減らす」が有効なら、打ってから盤面の更新までがすぐ終わる
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  await startFromSetup();
  await tapCell(27);
  const t0 = Date.now();
  await tapCell(27);
  await settled();
  const elapsed = Date.now() - t0;
  check(elapsed < 300, `動きを減らす設定でも、打ってから更新まで ${elapsed}ms かかっています`);
  await send('Emulation.setEmulatedMedia', { features: [] });

  // 12. 開発サーバーが壊れたURLでも落ちずに400を返す
  await checkServerRobustness();
}

// 壊れたURLを送っても dev サーバーが落ちず、400を返して配信を続けられることを確かめる
async function checkServerRobustness() {
  if (process.env.SMOKE_URL) return;
  const malformed = await rawGet('/%E0%A4%A').catch((err) => `error:${err.code ?? err.message}`);
  check(malformed === 400, `壊れたURL(不正なパーセントエンコーディング)で400を返しません: ${malformed}`);
  const doubleSlash = await rawGet('//').catch((err) => `error:${err.code ?? err.message}`);
  check(doubleSlash === 400, `壊れたURL(空のホストになるパス)で400を返しません: ${doubleSlash}`);
  const stillOk = await rawGet('/index.html').catch((err) => `error:${err.code ?? err.message}`);
  check(stillOk === 200, `壊れたURLの後にサーバーが配信を続けられません: ${stillOk}`);
}

function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: APP_PORT, path, method: 'GET' }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

// ---- 操作の部品 ----

async function pageSocketUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome の起動待ち */ }
    await sleep(100);
  }
  throw new Error('Chrome に接続できませんでした');
}

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    waiting.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  });
}

function once(method) {
  return new Promise((resolve) => listeners.push({ method, resolve }));
}

async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function waitFor(expression, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await js(`Boolean(${expression})`)) return;
    await sleep(50);
  }
  throw new Error(`待っても条件を満たしませんでした: ${expression}`);
}

async function open(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: appUrl });
  await loaded;
  await waitFor(`document.querySelector('#setup-preview').textContent.length > 0`);
}

async function fillSetup(p1, p2) {
  await js(`(() => {
    const f = document.querySelector('#setup-form');
    const set = (name, value) => {
      f[name].value = value;
      f[name].dispatchEvent(new Event(f[name].tagName === 'INPUT' ? 'input' : 'change', { bubbles: true }));
    };
    set('name1', ${JSON.stringify(p1.name)}); set('month1', '${p1.m}'); set('day1', '${p1.d}');
    set('name2', ${JSON.stringify(p2.name)}); set('month2', '${p2.m}'); set('day2', '${p2.d}');
  })()`);
}

async function startFromSetup() {
  await js(`document.querySelector('#setup-form button[type=submit]').click()`);
  await waitFor(`!document.querySelector('#game').hidden`);
}

// マスを1回タップする(空きマスなら予告、予告中のマスなら決定、列の石なら列の切り替え)
function tapCell(idx) { return js(`document.querySelector('#board .cell[data-idx="${idx}"]').click()`); }
// 予告してから同じマスをもう一度タップして打ち、演出が終わるまで待つ
async function playCell(idx) {
  await tapCell(idx);
  await tapCell(idx);
  await settled();
}
function settled() {
  return waitFor(`document.body.dataset.busy !== '1' || document.querySelector('dialog[open]')`);
}
function stoneCount() { return js(`document.querySelectorAll('#board .stone:not(.ghost)').length`); }
function todayText() { return js(`document.querySelector('#today-date').textContent`); }
function panelText() { return js(`document.querySelector('#preview-panel').textContent`); }
function noHorizontalScroll() { return js(`document.documentElement.scrollWidth <= window.innerWidth`); }

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(new URL(`${name}.png`, OUT), Buffer.from(data, 'base64'));
}

function check(ok, message) {
  if (!ok) failures.push(message);
}

// 決着がつくまで打つ。ポップアップは閉じ、選ぶ効果は最初の候補を選び、手は最初の空きマスに予告→決定で打つ。
async function playToEnd() {
  for (let step = 0; step < 400; step++) {
    if (await js(`document.querySelector('#result-dialog').open`)) return true;
    if (await js(`document.querySelector('#event-dialog').open`)) {
      await js(`document.querySelector('#event-dialog button').click()`);
    } else if (await js(`document.querySelector('#board .cell.target') !== null`)) {
      await js(`document.querySelector('#board .cell.target').click()`);
    } else {
      const idx = await js(`document.querySelector('#board .cell:not(.has-stone)')?.dataset.idx ?? null`);
      if (idx === null) {
        await sleep(100);
        continue;
      }
      await tapCell(Number(idx));
      await tapCell(Number(idx));
    }
    await settled();
  }
  return false;
}
```

- [ ] **Step 2: スモークテストが失敗することを確かめる**

Run: `lsof -i :9333`(何も出ないこと)の後に `caffeinate -i npm run smoke`
Expected: 終了コード 1。`#preview-panel` がない、設定の確認文が違う、などの NG が出る。

- [ ] **Step 3: index.html を置き換える**

`index.html`:

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>誕生日オセロ</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="css/style.css">
  <script type="module" src="js/main.js"></script>
</head>
<body>
  <main id="app">
    <section id="setup" class="screen">
      <h1>誕生日オセロ</h1>
      <p class="lead">日付を引っぱり合って、自分の誕生日にぴったり止めよう。</p>
      <form id="setup-form" class="card">
        <fieldset>
          <legend>プレイヤー1</legend>
          <label class="field">名前 <input name="name1" maxlength="10" placeholder="プレイヤー1" autocomplete="off"></label>
          <div class="field">誕生日
            <select name="month1" aria-label="プレイヤー1の誕生月"></select>月
            <select name="day1" aria-label="プレイヤー1の誕生日"></select>日
          </div>
        </fieldset>
        <fieldset>
          <legend>プレイヤー2</legend>
          <label class="field">名前 <input name="name2" maxlength="10" placeholder="プレイヤー2" autocomplete="off"></label>
          <div class="field">誕生日
            <select name="month2" aria-label="プレイヤー2の誕生月"></select>月
            <select name="day2" aria-label="プレイヤー2の誕生日"></select>日
          </div>
        </fieldset>
        <label class="field">開始日 <input type="date" name="start" required></label>
        <p id="setup-preview" class="preview" aria-live="polite"></p>
        <button type="submit" class="primary">対戦開始</button>
      </form>
      <button type="button" class="link" data-action="rules">ルールを見る</button>
    </section>

    <section id="game" class="screen" hidden>
      <header class="status">
        <p class="today"><span class="today-label">今日</span><span id="today-date"></span><span id="square-size" class="square-size"></span></p>
        <div class="players">
          <div id="status-black" class="pl black"></div>
          <div id="status-white" class="pl white"></div>
        </div>
        <p id="turn-msg" class="turn-msg" aria-live="polite"></p>
      </header>
      <div class="board-wrap"><div id="board" class="board"></div></div>
      <div id="preview-panel" class="preview-panel card" hidden aria-live="polite"></div>
      <footer class="game-footer">
        <button type="button" class="link" data-action="rules">ルール</button>
        <button type="button" class="link" data-action="quit">設定に戻る</button>
      </footer>
    </section>
  </main>

  <dialog id="event-dialog" class="card">
    <p id="event-player" class="event-player"></p>
    <h2 id="event-title"></h2>
    <p id="event-text"></p>
    <form method="dialog"><button value="ok" class="primary">OK</button></form>
  </dialog>

  <dialog id="result-dialog" class="card">
    <div class="confetti" aria-hidden="true"></div>
    <svg class="cake" viewBox="0 0 120 100" aria-hidden="true">
      <rect x="10" y="88" width="100" height="6" rx="3" fill="#d9c2a6"/>
      <rect x="20" y="50" width="80" height="40" rx="6" fill="#f6a5c0"/>
      <rect x="20" y="50" width="80" height="12" rx="6" fill="#fff4e6"/>
      <rect x="38" y="30" width="6" height="20" fill="#7bdff2"/>
      <rect x="57" y="30" width="6" height="20" fill="#ffd166"/>
      <rect x="76" y="30" width="6" height="20" fill="#b8e986"/>
      <ellipse cx="41" cy="25" rx="3" ry="5" fill="#ff9f1c"/>
      <ellipse cx="60" cy="25" rx="3" ry="5" fill="#ff9f1c"/>
      <ellipse cx="79" cy="25" rx="3" ry="5" fill="#ff9f1c"/>
    </svg>
    <h2 id="result-title"></h2>
    <p id="result-reason"></p>
    <form method="dialog" class="actions">
      <button value="rematch" class="primary">同じ2人で再戦</button>
      <button value="setup">設定に戻る</button>
    </form>
  </dialog>

  <dialog id="rules-dialog" class="card">
    <h2>ルール</h2>
    <ul class="rules">
      <li>盤面は空っぽから始まります。空いているマスならどこにでも置けます。</li>
      <li>相手の石を挟むと裏返せます。挟んだ列が複数あるときは、返す列を選べます(少なくとも1列)。</li>
      <li>裏返した石の数字(重さ)の合計だけ、日付がマスを動きます。黒は黒の誕生日へ、白は白の誕生日へ引っぱります。</li>
      <li>石の重さは「1 + 裏返った回数」です。</li>
      <li>日付は2人の誕生日の間のマスを動きます。誕生日が30日より離れているときは、1マスが数日分になります。</li>
      <li>挟める手があるのに1枚も返さないと、日付が相手の誕生日の方へ1マス動きます。</li>
      <li>誕生日を通り越したら、通り越した分だけ跳ね返ります。</li>
      <li>日付が誕生日にぴったり止まったら、その誕生日の人の勝ちです(どちらが動かしても)。</li>
      <li>盤面が埋まったら、誕生日までの残りマス数が少ない方の勝ち。同じなら石の数で決めます。</li>
      <li>祝日や行事のマスにぴったり止めると、イベントが起きます(1試合に1回ずつ)。</li>
      <li>マスをタップすると結果を予告します。「ここに置く」か、同じマスをもう一度タップすると決定です。</li>
    </ul>
    <h3>イベント</h3>
    <ul id="rules-events" class="rules-events"></ul>
    <form method="dialog"><button value="ok" class="primary">閉じる</button></form>
  </dialog>
</body>
</html>
```

- [ ] **Step 4: css/style.css を置き換える**

`css/style.css`:

```css
:root {
  --bg: #fff8f0;
  --ink: #3a2e2a;
  --muted: #8a7b72;
  --accent: #e86a92;
  --card: #ffffff;
  --line: #ead9c8;
  --cell: #fffdf8;
  --event: #ffe7c2;
  --event-used: #f3eee8;
  --today: #ffb703;
  --period: rgba(255, 183, 3, 0.18);
  --bday-black: #ddd6f3;
  --bday-white: #cdeefa;
  --stone-black: #2b2523;
  --stone-white: #fdfdfd;
  --date-label: #5c4f47;
  --radius: 12px;
  font-family: "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  color: var(--ink);
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); min-height: 100vh; }
#app { max-width: 560px; margin: 0 auto; padding: 16px; }
h1 { text-align: center; color: var(--accent); margin: 8px 0 4px; font-size: clamp(1.6rem, 7vw, 2.2rem); }
.lead { text-align: center; color: var(--muted); margin: 0 0 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; }
fieldset { border: 1px solid var(--line); border-radius: var(--radius); margin: 0 0 12px; padding: 8px 12px 12px; min-width: 0; }
legend { padding: 0 6px; font-weight: bold; }
.field { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
input, select { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); }
input[name^="name"] { flex: 1; min-width: 0; }
input[type="date"] { min-width: 0; }
.preview { min-height: 3em; margin: 12px 0; font-size: 0.95rem; overflow-wrap: anywhere; }
.preview.error { color: #c0392b; }
button { font: inherit; cursor: pointer; }
.primary { background: var(--accent); color: #fff; border: 0; border-radius: 999px; padding: 10px 24px; font-weight: bold; }
.primary:disabled { opacity: 0.4; cursor: not-allowed; }
.link { background: none; border: 0; color: var(--muted); text-decoration: underline; padding: 8px; }
#setup-form .primary { width: 100%; }
#setup > .link { display: block; margin: 12px auto; }

/* 対戦画面 */
.status { margin-bottom: 12px; }
.today { text-align: center; margin: 0 0 8px; }
.today-label { font-size: 0.8rem; color: var(--muted); margin-right: 8px; }
#today-date { font-size: clamp(1.6rem, 8vw, 2.2rem); font-weight: bold; }
.square-size { display: block; font-size: 0.8rem; color: var(--muted); }
.players { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pl {
  border: 2px solid var(--line);
  border-radius: var(--radius);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  background: var(--card);
  min-width: 0;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.pl.black { border-left: 6px solid var(--stone-black); }
.pl.white { border-left: 6px solid #cfc6bd; }
.pl.active { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(232, 106, 146, 0.25); transform: scale(1.03); }
.pl-name { font-weight: bold; font-size: 1rem; overflow-wrap: anywhere; }
.pl-left { font-weight: bold; }
.pl-effects { color: var(--accent); font-size: 0.8rem; }
.turn-msg { text-align: center; margin: 8px 0 0; font-weight: bold; min-height: 1.5em; }

.board-wrap { position: relative; }
.board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  width: 100%;
  aspect-ratio: 1;
  gap: 1px;
  background: var(--line);
  border: 2px solid var(--ink);
  border-radius: 8px;
  overflow: hidden;
}
.cell {
  position: relative;
  min-width: 0;
  height: 100%;
  padding: 0 0 6% 0;
  border: 0;
  background: var(--cell);
  display: grid;
  align-items: end;
  justify-items: center;
  touch-action: manipulation;
}
.cell .date { position: absolute; top: 2px; left: 3px; font-size: clamp(0.55rem, 2.2vw, 0.7rem); color: var(--date-label); line-height: 1; }
.cell.event { background: var(--event); }
.cell.event::after { content: ""; position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: #ff9f1c; }
.cell.event-used { background: var(--event-used); }
.cell.bday-black { background: var(--bday-black); }
.cell.bday-white { background: var(--bday-white); }
.cell.in-period { background-image: linear-gradient(var(--period), var(--period)); }
.cell.is-today { z-index: 1; box-shadow: inset 0 0 0 4px var(--today); animation: today-pulse 1.6s ease-in-out infinite; }
.today-tag {
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 0 3px;
  border-radius: 4px;
  background: var(--today);
  color: var(--ink);
  font-size: clamp(0.45rem, 1.8vw, 0.6rem);
  font-weight: bold;
  line-height: 1.3;
}
.cell.dest { animation: dest-blink 0.7s ease-in-out infinite alternate; }
.cell.target { box-shadow: inset 0 0 0 3px var(--accent); animation: pulse 0.8s infinite alternate; }
.cell.line-on { box-shadow: inset 0 0 0 2px var(--accent); }
.cell.line-off::before { content: ""; position: absolute; inset: 3px; border: 2px dashed var(--muted); border-radius: 4px; pointer-events: none; }
.cell.last .stone { outline: 2px solid var(--accent); outline-offset: 1px; }
.stone {
  width: 66%;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: bold;
  font-size: clamp(0.65rem, 3vw, 1rem);
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.25);
}
.stone.black { background: var(--stone-black); color: #fff; }
.stone.white { background: var(--stone-white); color: var(--ink); border: 1px solid #cfc6bd; }
.stone.fixed { box-shadow: 0 0 0 3px #ffd166, 0 2px 2px rgba(0, 0, 0, 0.25); }
.stone.ghost { opacity: 0.45; animation: ghost-pulse 1s ease-in-out infinite alternate; }
.stone.will-flip { box-shadow: 0 0 0 3px var(--accent), 0 2px 2px rgba(0, 0, 0, 0.25); }
.cell.line-on .stone.will-flip { animation: line-glow 1.2s ease-in-out infinite; }
.stone.flip { animation: flip 0.35s ease; }
.stone.placed { animation: drop 0.25s ease; }
@keyframes flip { 0% { transform: rotateY(0); } 50% { transform: rotateY(90deg); } 100% { transform: rotateY(0); } }
@keyframes drop { from { transform: scale(1.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes pulse { from { box-shadow: inset 0 0 0 2px var(--accent); } to { box-shadow: inset 0 0 0 4px var(--accent); } }
@keyframes today-pulse { 50% { box-shadow: inset 0 0 0 4px var(--today), inset 0 0 14px 4px rgba(255, 183, 3, 0.55); } }
@keyframes dest-blink { from { box-shadow: inset 0 0 0 0 var(--accent); } to { box-shadow: inset 0 0 0 4px var(--accent); } }
@keyframes ghost-pulse { from { transform: scale(0.9); } to { transform: scale(1); } }
@keyframes line-glow { 50% { box-shadow: 0 0 0 3px var(--accent), 0 0 10px 3px rgba(232, 106, 146, 0.6); } }

.preview-panel { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; text-align: center; }
.pv-main { font-weight: bold; font-size: 1.05rem; }
.pv-note { font-size: 0.85rem; color: var(--muted); }
.pv-actions { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 4px; }
.adjust-row { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.adjust-row button { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 6px 10px; }
.adjust-row button.selected { background: var(--accent); border-color: var(--accent); color: #fff; }
.game-footer { display: flex; justify-content: space-between; margin-top: 8px; }

/* ダイアログ */
dialog { max-width: min(92vw, 420px); text-align: center; position: relative; color: var(--ink); }
dialog::backdrop { background: rgba(58, 46, 42, 0.45); }
.event-player { color: var(--accent); font-weight: bold; margin: 0; }
#rules-dialog { text-align: left; max-height: 85vh; overflow-y: auto; }
.rules, .rules-events { padding-left: 1.2em; }
.rules-events { font-size: 0.85rem; }
.actions { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.actions button:not(.primary) { background: none; border: 0; text-decoration: underline; color: var(--muted); }
.cake { width: 120px; height: 100px; }
#result-dialog.draw .cake { opacity: 0.4; }
.confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.confetti span { position: absolute; top: -12px; width: 8px; height: 12px; border-radius: 2px; animation: fall linear forwards; }
@keyframes fall { to { transform: translateY(110vh) rotate(540deg); } }

@media (prefers-reduced-motion: reduce) {
  .stone.flip, .stone.placed, .stone.ghost, .cell.target, .cell.is-today, .cell.dest,
  .cell.line-on .stone.will-flip, .confetti span { animation: none; }
  .pl { transition: none; }
}
```

- [ ] **Step 5: js/ui.js を置き換える**

`js/ui.js`:

```js
import { boardDates, formatMD, fromDayNum, squareOffset, squarePeriod } from './dates.js';
import { choiceTargets, countStones, reflect, stoneWeight } from './rules.js';
import { EFFECTS, EVENTS, ruleLabel } from './events.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 端末で「動きを減らす」が有効なときは、演出の待ち時間をなくす
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => (reducedMotion() ? Promise.resolve() : sleep(ms));

const $ = (selector) => document.querySelector(selector);
const COLOR_NAME = { B: '黒', W: '白' };
const CHOICE_PROMPT = {
  remove: '取り除く相手の石を選んでください',
  fix: '固定する自分の石を選んでください',
  steal: '自分の色にする相手の石を選んでください',
  plant: '石を置く空きマスを選んでください',
};

export const playerOf = (state, color) => (color === 'B' ? state.match.black : state.match.white);
// マス u の日付(通し番号)
export const dateOf = (state, u = state.p) => state.match.baseDay + squareOffset(u, state.match.D, state.match.N);
// 2つのマスが盤面上で何マス離れているか(縦・横・斜め)
export const cellDistance = (a, b) => Math.max(Math.abs(Math.floor(a / 8) - Math.floor(b / 8)), Math.abs((a % 8) - (b % 8)));

export function formatLong(day) {
  const { m, d } = fromDayNum(day);
  return `${m}月${d}日`;
}

function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function button(text, className, data = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  Object.assign(el.dataset, data);
  return el;
}

// 1マスの日数。割り切れないときは「約」をつける(例: 1マス=2日、1マス=約13日)
export function squareLabel(match) {
  const perSquare = match.D / match.N;
  return `1マス=${Number.isInteger(perSquare) ? '' : '約'}${Math.round(perSquare)}日`;
}

// ---- 設定画面 ----

export function fillMonthSelect(select) {
  for (let m = 1; m <= 12; m++) select.add(new Option(String(m), String(m)));
}

// 月に合わせて日の選択肢を作り直す。選んでいた日がその月にない場合は月末に収める。
export function fillDaySelect(select, month) {
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const current = Number(select.value) || 1;
  select.length = 0;
  for (let d = 1; d <= max; d++) select.add(new Option(String(d), String(d)));
  select.value = String(Math.min(current, max));
}

export function renderSetupPreview(match) {
  const preview = $('#setup-preview');
  const submit = $('#setup-form button[type=submit]');
  preview.classList.toggle('error', Boolean(match.error));
  submit.disabled = Boolean(match.error);
  if (match.error) {
    preview.textContent = match.error;
    return;
  }
  const { black, white } = match;
  const pair = match.sameBirthday
    ? `同じ誕生日(${formatMD(black.day)})なので、黒白は開始時にランダムで決まります。`
    : `黒: ${black.name}(${formatMD(black.day)}) 白: ${white.name}(${formatMD(white.day)})`;
  const distance = match.k > 1
    ? `間は${match.D}日、${match.N}マス(${squareLabel(match)})`
    : `間は${match.D}日(${squareLabel(match)})`;
  preview.textContent = `${pair} ${distance}`;
}

// ---- 対戦画面 ----

// shownP: 表示する日付のマス(演出中に途中の日付を出すため)、preview: 予告中の手(previewMove の戻り値)
export function renderGame(state, { shownP = state.p, preview = null } = {}) {
  $('#today-date').textContent = formatLong(dateOf(state, shownP));
  $('#square-size').textContent = state.match.k > 1 ? squareLabel(state.match) : '';
  renderPlayerStatus($('#status-black'), state, 'B', shownP);
  renderPlayerStatus($('#status-white'), state, 'W', shownP);
  $('#turn-msg').textContent = turnMessage(state, preview);
  renderBoard(state, shownP, preview);
  renderPreviewPanel(state, preview);
}

function renderPlayerStatus(el, state, color, shownP) {
  const { match } = state;
  const player = playerOf(state, color);
  const squares = color === 'B' ? shownP : match.N - shownP;
  const days = color === 'B' ? dateOf(state, shownP) - match.black.day : match.white.day - dateOf(state, shownP);
  const left = match.k > 1 ? `あと${squares}マス(約${days}日)` : `あと${squares}日`;
  const effects = Object.entries(state.pending[color])
    .filter(([, on]) => on)
    .map(([id]) => EFFECTS[id].name);
  el.classList.toggle('active', state.phase !== 'over' && state.turn === color);
  el.replaceChildren(
    span('pl-name', `${COLOR_NAME[color]} ${player.name}`),
    span('pl-bday', `誕生日 ${formatMD(player.day)}`),
    span('pl-left', left),
  );
  if (effects.length) el.append(span('pl-effects', `次の手: ${effects.join('・')}`));
}

function turnMessage(state, preview) {
  if (state.phase === 'over') return '対戦終了';
  const player = playerOf(state, state.turn);
  const who = `${player.name}(${COLOR_NAME[state.turn]})`;
  if (state.phase === 'choose') return `${who}: ${CHOICE_PROMPT[state.choice.effect]}`;
  if (preview) return `${who}: 予告を確かめて「ここに置く」`;
  return `${who}の番です`;
}

function renderBoard(state, shownP, preview) {
  const { match } = state;
  const today = dateOf(state, shownP);
  const [periodFrom, periodTo] = squarePeriod(shownP, match.D, match.N).map((offset) => match.baseDay + offset);
  const eventByDay = new Map(Object.values(state.events).map((ev) => [ev.day, ev]));
  const targets = new Set(state.phase === 'choose' ? choiceTargets(state) : []);
  const willFlip = new Set(preview?.flips ?? []);
  const lineOf = new Map();
  for (const line of preview?.lines ?? []) {
    const on = preview.chosen.includes(line.dir);
    for (const idx of line.cells) lineOf.set(idx, on);
  }
  const destDay = preview ? dateOf(state, preview.toP) : null;
  const cells = boardDates(today).map((day, idx) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.idx = String(idx);
    const { d } = fromDayNum(day);
    cell.append(span('date', idx === 0 || d === 1 ? formatMD(day) : String(d)));
    if (day === today) {
      cell.classList.add('is-today');
      cell.append(span('today-tag', '今日'));
    } else if (match.k > 1 && day >= periodFrom && day <= periodTo) {
      cell.classList.add('in-period');
    }
    if (day === match.black.day) cell.classList.add('bday-black');
    if (day === match.white.day) cell.classList.add('bday-white');
    const ev = eventByDay.get(day);
    if (ev) cell.classList.add(ev.used ? 'event-used' : 'event');
    if (targets.has(idx)) cell.classList.add('target');
    if (day === destDay) cell.classList.add('dest');
    if (lineOf.has(idx)) cell.classList.add(lineOf.get(idx) ? 'line-on' : 'line-off');
    const stone = state.board[idx];
    if (stone) {
      cell.classList.add('has-stone');
      const classes = ['stone', stone.color === 'B' ? 'black' : 'white'];
      if (stone.fixed) classes.push('fixed');
      if (willFlip.has(idx)) classes.push('will-flip');
      const el = span(classes.join(' '), String(stoneWeight(stone)));
      if (lineOf.get(idx)) el.style.animationDelay = `${cellDistance(idx, preview.idx) * 120}ms`;
      cell.append(el);
    } else if (preview && idx === preview.idx) {
      cell.append(span(`stone ghost ${state.turn === 'B' ? 'black' : 'white'}`, '1'));
    }
    if (state.lastMove?.idx === idx) cell.classList.add('last');
    cell.setAttribute('aria-label', `${formatMD(day)} ${stone ? `${COLOR_NAME[stone.color]}の石` : '空き'}`);
    return cell;
  });
  $('#board').replaceChildren(...cells);
}

function renderPreviewPanel(state, preview) {
  const panel = $('#preview-panel');
  if (!preview) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  const dest = formatLong(dateOf(state, preview.toP));
  let main;
  if (preview.stall) main = `返さない: 相手側へ1マス → ${dest}`;
  else if (preview.flips.length === 0) main = '返さない: 挟める手がないので日付は動かない';
  else if (preview.days === 0) main = `${preview.flips.length}枚返す: 日付は動かない(おやすみ)`;
  else main = `${preview.flips.length}枚返して${preview.days}マス動く → ${dest}`;
  const notes = [];
  if (preview.bounced) notes.push('誕生日を通り越して跳ね返ります');
  if (preview.win) notes.push(`${playerOf(state, preview.win).name}の誕生日にぴったり!`);
  else if (preview.event) notes.push(`${preview.event.occasion}「${preview.event.name}」に止まります`);
  if (preview.lines.length > 1) notes.push('列の石をタップすると、その列を返すかどうかを切り替えられます');
  const children = [span('pv-main', main), ...notes.map((text) => span('pv-note', text))];
  if (preview.needsAdjust) {
    const row = document.createElement('div');
    row.className = 'adjust-row';
    for (let a = -3; a <= 3; a++) {
      row.append(button(`${a > 0 ? '+' : ''}${a}`, a === preview.adjust ? 'selected' : '', { adjust: String(a) }));
    }
    children.push(span('pv-note', '調整: 動くマス数を −3〜+3 で選べます'), row);
  }
  const actions = document.createElement('div');
  actions.className = 'pv-actions';
  actions.append(button('ここに置く', 'primary', { pv: 'confirm' }), button('やめる', 'link', { pv: 'cancel' }));
  children.push(actions);
  panel.replaceChildren(...children);
  panel.hidden = false;
}

// 予告パネルが画面の外にあれば、見える位置までスクロールする
export function revealPreviewPanel() {
  $('#preview-panel').scrollIntoView({ block: 'nearest' });
}

// ---- ダイアログ ----

// returnValue を毎回空に戻す。Esc などボタン以外で閉じたときに、前回の選択が残らないようにするため。
function openDialog(dialog) {
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
  });
}

export function showEventDialog(state) {
  const { event, fizzled, warpTo, color } = state.lastMove;
  $('#event-player').textContent = `${playerOf(state, color).name}に発動!`;
  $('#event-title').textContent = `${formatMD(event.day)} ${event.occasion}「${event.name}」`;
  let text = EFFECTS[event.effect].text;
  if (warpTo !== undefined) text += `(${formatMD(dateOf(state, warpTo))}へ)`;
  if (fizzled) text += '。選べる対象がないので不発でした';
  $('#event-text').textContent = text;
  return openDialog($('#event-dialog'));
}

export function showRules() {
  const dialog = $('#rules-dialog');
  const closed = openDialog(dialog);
  // showModal() が「閉じる」ボタンへフォーカスを移し、スクロール位置をそこまで動かしてしまうため戻す
  dialog.scrollTop = 0;
  return closed;
}

export function fillRulesEventList() {
  const items = EVENTS.map((ev) => {
    const li = document.createElement('li');
    li.textContent = `${ruleLabel(ev.rule)} ${ev.occasion}「${ev.name}」: ${EFFECTS[ev.effect].text}`;
    return li;
  });
  $('#rules-events').replaceChildren(...items);
}

export function showResult(state) {
  const dialog = $('#result-dialog');
  const winner = state.result.winner ? playerOf(state, state.result.winner) : null;
  $('#result-title').textContent = winner ? `お誕生日おめでとう、${winner.name}!` : '引き分け';
  $('#result-reason').textContent = resultReason(state);
  dialog.classList.toggle('draw', !winner);
  const confetti = dialog.querySelector('.confetti');
  confetti.replaceChildren();
  if (winner) launchConfetti(confetti);
  return openDialog(dialog);
}

function resultReason(state) {
  const { result, match } = state;
  if (result.reason === 'birthday') {
    const winner = playerOf(state, result.winner);
    return `日付が${formatMD(winner.day)}(${winner.name}の誕生日)にぴったり止まりました。`;
  }
  const unit = match.k > 1 ? 'マス' : '日';
  const left = `誕生日まで ${match.black.name} あと${state.p}${unit}、${match.white.name} あと${match.N - state.p}${unit}`;
  if (state.p !== match.N - state.p) return `盤面が埋まりました。${left}。`;
  const stones = countStones(state);
  const count = `石の数は ${match.black.name} ${stones.B}個、${match.white.name} ${stones.W}個`;
  return result.winner
    ? `盤面が埋まりました。${left}で同じなので、石の数で決めました(${count})。`
    : `盤面が埋まりました。${left}で同じ、${count}で同じでした。`;
}

function launchConfetti(container) {
  const colors = ['#f6a5c0', '#ffd166', '#7bdff2', '#b8e986', '#c3a6ff'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
    container.append(piece);
  }
}

// ---- 演出 ----

// 置いた石と裏返った石を動かしてから、今日の光を1マスずつ動かす。
// isCurrent: 呼び出し側の対戦がまだ有効かどうか。中断されていたら残りの演出と最後の再描画を打ち切る。
export async function animateMove(state, { isCurrent = () => true } = {}) {
  const move = state.lastMove;
  renderGame(state, { shownP: move.fromP });
  for (const idx of [move.idx, ...move.flips]) {
    $(`#board .cell[data-idx="${idx}"] .stone`)?.classList.add(idx === move.idx ? 'placed' : 'flip');
  }
  await wait(350);
  if (!isCurrent()) return;
  await animateDate(state, move.fromP, move.dir, move.days, { isCurrent });
  if (!isCurrent()) return;
  // 「真ん中へ」で飛んだ先は、イベントのポップアップを閉じたあとで表示する
  renderGame(state, { shownP: move.toP });
}

// 今日の光をカレンダーの上で1マスずつ動かす(最大1.5秒程度)
async function animateDate(state, fromP, dir, days, { isCurrent }) {
  if (days <= 0) return;
  const { N } = state.match;
  const frames = Math.min(days, 30);
  const frameMs = Math.min(80, 1500 / frames);
  let bounced = false;
  for (let f = 1; f <= frames; f++) {
    if (!isCurrent()) return;
    const raw = fromP + dir * Math.round((f * days) / frames);
    bounced ||= raw < 0 || raw > N;
    renderGame(state, { shownP: reflect(raw, N) });
    if (bounced) $('#turn-msg').textContent = '跳ね返り!';
    await wait(frameMs);
  }
  if (bounced) await wait(550);
}

// 選ぶ効果(鬼は外・固定・奪う・植える)の結果を表示する
export async function animateChoice(prev, next, idx, { isCurrent = () => true } = {}) {
  if (isCurrent()) renderGame(next);
}

// 「真ん中へ」で飛んだ先を表示する
export async function animateWarp(state, { isCurrent = () => true } = {}) {
  if (isCurrent()) renderGame(state);
}

// 効果が働いた名札や石を光らせる
export function highlightEffect() {}

// 勝利の演出(結果のダイアログを開く前)
export async function celebrate() {}
```

- [ ] **Step 6: js/main.js を置き換える**

`js/main.js`:

```js
import { dayNum, defaultStart, fromDayNum, parseISODate, setupMatch, toISODate } from './dates.js';
import { applyChoice, newGame, playMove, previewMove } from './rules.js';
import {
  animateChoice, animateMove, animateWarp, celebrate, fillDaySelect, fillMonthSelect, fillRulesEventList,
  highlightEffect, renderGame, renderSetupPreview, revealPreviewPanel, showEventDialog, showResult, showRules,
} from './ui.js';

const form = document.querySelector('#setup-form');
const setupScreen = document.querySelector('#setup');
const gameScreen = document.querySelector('#game');
const boardEl = document.querySelector('#board');
const panelEl = document.querySelector('#preview-panel');

let state = null;
let busy = false;
// 対戦が入れ替わるたびに増やす番号。進行中の await の続きが、もう終わった対戦に書き戻さないようにする。
let epoch = 0;
// 予告中の手(まだ打っていない): { idx, lines, adjust }
let pick = null;

function today() {
  const now = new Date();
  return dayNum(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function readPlayers() {
  return [1, 2].map((n) => ({
    name: form[`name${n}`].value.trim() || `プレイヤー${n}`,
    birthday: { m: Number(form[`month${n}`].value), d: Number(form[`day${n}`].value) },
  }));
}

// 誕生日が変わったら開始日を既定の日に戻す。開始日が空なら既定の日を入れる。
function refreshPreview({ resetStart = false } = {}) {
  const players = readPlayers();
  if (resetStart || !form.start.value) {
    form.start.value = toISODate(defaultStart(players[0].birthday, players[1].birthday, fromDayNum(today()).y));
  }
  renderSetupPreview(setupMatch(players, parseISODate(form.start.value), () => 0));
}

function initSetup() {
  for (const n of [1, 2]) {
    const month = form[`month${n}`];
    const day = form[`day${n}`];
    fillMonthSelect(month);
    month.value = String(n);
    fillDaySelect(day, n);
    month.addEventListener('change', () => {
      fillDaySelect(day, Number(month.value));
      refreshPreview({ resetStart: true });
    });
    day.addEventListener('change', () => refreshPreview({ resetStart: true }));
    form[`name${n}`].addEventListener('input', () => refreshPreview());
  }
  form.start.addEventListener('change', () => refreshPreview());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    startGame();
  });
  refreshPreview({ resetStart: true });
}

function startGame() {
  const match = setupMatch(readPlayers(), parseISODate(form.start.value));
  if (match.error) return;
  epoch += 1;
  pick = null;
  state = newGame(match);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame(state);
}

function backToSetup() {
  epoch += 1;
  pick = null;
  state = null;
  gameScreen.hidden = true;
  setupScreen.hidden = false;
}

// 演出や選択の途中に次の操作が入らないようにする
async function run(task) {
  busy = true;
  document.body.dataset.busy = '1';
  try {
    await task();
  } finally {
    busy = false;
    document.body.dataset.busy = '0';
  }
}

// 予告中の手を描き直す
function showPick() {
  renderGame(state, { preview: pick ? previewMove(state, pick.idx, pick) : null });
}

async function finishGame() {
  await celebrate(state);
  const choice = await showResult(state);
  if (choice === 'rematch') startGame();
  else backToSetup();
}

// 予告中の手を決定して打つ
async function confirmPick() {
  if (!pick || busy || !state || state.phase !== 'play') return;
  const chosen = pick;
  pick = null;
  const myEpoch = epoch;
  const isCurrent = () => epoch === myEpoch;
  let local = state;
  await run(async () => {
    const next = playMove(local, chosen.idx, { lines: chosen.lines, adjust: chosen.adjust });
    if (next === local) return;
    local = next;
    state = local;
    await animateMove(local, { isCurrent });
    if (!isCurrent() || !local.lastMove.event) return;
    await showEventDialog(local);
    if (!isCurrent()) return;
    if (local.lastMove.warpTo !== undefined) await animateWarp(local, { isCurrent });
    if (!isCurrent()) return;
    renderGame(local);
    highlightEffect(local);
  });
  if (isCurrent() && local.phase === 'over') await finishGame();
}

// 選ぶ効果(鬼は外・固定・奪う・植える)の対象を決める
async function choose(idx) {
  const prev = state;
  const next = applyChoice(prev, idx);
  if (next === prev) return;
  const myEpoch = epoch;
  const isCurrent = () => epoch === myEpoch;
  await run(async () => {
    state = next;
    await animateChoice(prev, next, idx, { isCurrent });
  });
  if (isCurrent() && next.phase === 'over') await finishGame();
}

async function tapCell(idx) {
  if (state.phase === 'choose') {
    await choose(idx);
    return;
  }
  if (state.phase !== 'play') return;
  if (!state.board[idx]) {
    if (pick && pick.idx === idx) {
      await confirmPick();
      return;
    }
    pick = { idx, lines: undefined, adjust: 0 };
    showPick();
    revealPreviewPanel();
    return;
  }
  // 予告中に列の石をタップすると、その列を返すかどうかを切り替える(最後の1列は外せない)
  if (!pick) return;
  const preview = previewMove(state, pick.idx, pick);
  const line = preview.lines.find((l) => l.cells.includes(idx));
  if (!line) return;
  const chosen = new Set(preview.chosen);
  if (chosen.has(line.dir)) {
    if (chosen.size === 1) return;
    chosen.delete(line.dir);
  } else {
    chosen.add(line.dir);
  }
  pick = { ...pick, lines: [...chosen] };
  showPick();
}

boardEl.addEventListener('click', async (e) => {
  try {
    const cell = e.target.closest('.cell');
    if (!cell || busy || !state) return;
    await tapCell(Number(cell.dataset.idx));
  } catch (err) {
    // ここで投げると addEventListener からは拾えない未処理の rejection になるため、必ず閉じ込める
    console.error(err);
  }
});

panelEl.addEventListener('click', async (e) => {
  try {
    const target = e.target.closest('button');
    if (!target || busy || !state || !pick) return;
    if (target.dataset.pv === 'confirm') {
      await confirmPick();
    } else if (target.dataset.pv === 'cancel') {
      pick = null;
      renderGame(state);
    } else if (target.dataset.adjust !== undefined) {
      pick = { ...pick, adjust: Number(target.dataset.adjust) };
      showPick();
    }
  } catch (err) {
    console.error(err);
  }
});

document.querySelector('[data-action="quit"]').addEventListener('click', () => {
  if (window.confirm('対戦をやめて設定画面に戻りますか?')) backToSetup();
});

for (const rulesButton of document.querySelectorAll('[data-action="rules"]')) {
  rulesButton.addEventListener('click', () => showRules());
}

fillRulesEventList();
initSetup();
```

- [ ] **Step 7: スモークテストと単体テストが通ることを確かめる**

Run: `lsof -i :9333`(何も出ないこと)、`caffeinate -i npm run smoke`、`npm test`
Expected: `OK: スクリーンショットを .../tools/screenshots/ に保存しました`、単体テストはすべて pass

- [ ] **Step 8: スクリーンショットを目で確かめる**

Read ツールで次を開き、確認する。
- `phone-preview.png`: 半透明の石、予告パネル(「ここに置く」「やめる」)、今日のマスの金色の枠と「今日」の札、1マス=2日の期間の色。
- `phone-lines.png`: 返す列が実線、外した列が点線、予告パネルの「1枚返して」。
- `adjust-visible.png`: 調整のボタンが画面内にあり、選んだ値が強調されている。
- `phone-game.png` / `small-game.png` / `pc-game.png`: 行の高さがそろい、横にはみ出していない。

問題があれば直し、Step 7 からやり直す。

- [ ] **Step 9: コミット**

```bash
git add index.html css/style.css js/ui.js js/main.js tools/smoke.mjs
git commit -m "UI v2: preview-then-confirm, line toggles, today highlight, square display"
```

---

### Task 5: アニメーション

**Files:**
- Modify: `js/ui.js`(「---- 演出 ----」以降と launchConfetti)
- Modify: `css/style.css`(石の演出と新しい演出、動きを減らす設定)
- Modify: `index.html`(ろうそくの炎)
- Modify: `tools/smoke.mjs`(確認を追加)

**Interfaces:**
- Consumes: Task 4 の ui.js(renderGame, wait, reducedMotion, sleep, cellDistance, dateOf, $)、main.js が呼ぶ `animateMove` / `animateChoice` / `animateWarp` / `highlightEffect` / `celebrate`
- Produces: 同じ関数名のまま中身を演出つきにする。DOM: `.stone.flip-to-black` / `.stone.flip-to-white`(animationDelay で順番)、`.board.page-turn`、`.cell.bounce`、`.pl.glow`、`.stone.glow-gold`、`.stone.vanish`、`.board-wrap .fireworks`、`.cake .flame`

- [ ] **Step 1: 失敗するスモークテストを書く**

`tools/smoke.mjs` の `scenarios()` の中の、`// 12. 開発サーバーが…` の行の直前に追記する:

```js
  // 13. 返す石は置いたマスに近い順に1枚ずつ返る(6/1 と 6/20。間にイベントがない)。勝利の花火が出て消える
  await open(390, 844);
  await fillSetup({ name: 'れつ', m: 6, d: 1 }, { name: 'えらび', m: 6, d: 20 });
  await startFromSetup();
  for (const idx of [27, 28, 45, 37]) await playCell(idx);
  await tapCell(29);
  const delays = await js(`(() => {
    document.querySelector('#board .cell[data-idx="29"]').click();
    return [...document.querySelectorAll('#board .stone.flip-to-black')].map((s) => s.style.animationDelay);
  })()`);
  check(delays.length === 2 && new Set(delays).size === 2, `返す石が順番に返っていません: ${JSON.stringify(delays)}`);
  await shot('phone-flip');
  await settled();
  const fireworks = await js(`(async () => {
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    const done = ui.celebrate({ result: { winner: 'B' } });
    const during = document.querySelector('.board-wrap .fireworks') !== null;
    await done;
    return { during, after: document.querySelector('.fireworks') !== null };
  })()`);
  check(fireworks.during && !fireworks.after, `花火が出ないか、消えません: ${JSON.stringify(fireworks)}`);
```

- [ ] **Step 2: スモークテストが失敗することを確かめる**

Run: `caffeinate -i npm run smoke`
Expected: 終了コード 1、`返す石が順番に返っていません` と `花火が出ないか、消えません` の NG。

- [ ] **Step 3: ui.js の演出を作る**

`js/ui.js` の `function launchConfetti(container) {` の中の `for (let i = 0; i < 40; i++) {` を `for (let i = 0; i < 80; i++) {` に変える。

`js/ui.js` の `// ---- 演出 ----` の行から末尾までを、次に置き換える:

```js
// ---- 演出 ----

// 置いた石を落とし、置いたマスに近い石から1枚ずつ返してから、今日の光を1マスずつ動かす。
// isCurrent: 呼び出し側の対戦がまだ有効かどうか。中断されていたら残りの演出と最後の再描画を打ち切る。
export async function animateMove(state, { isCurrent = () => true } = {}) {
  const move = state.lastMove;
  renderGame(state, { shownP: move.fromP });
  $(`#board .cell[data-idx="${move.idx}"] .stone`)?.classList.add('placed');
  const order = [...move.flips].sort((a, b) => cellDistance(a, move.idx) - cellDistance(b, move.idx));
  order.forEach((idx, i) => {
    const stone = $(`#board .cell[data-idx="${idx}"] .stone`);
    if (!stone) return;
    stone.classList.add(move.color === 'B' ? 'flip-to-black' : 'flip-to-white');
    stone.style.animationDelay = `${300 + i * 80}ms`;
  });
  await wait(order.length ? 300 + order.length * 80 + 400 : 450);
  if (!isCurrent()) return;
  await animateDate(state, move.fromP, move.dir, move.days, { isCurrent });
  if (!isCurrent()) return;
  // 「真ん中へ」で飛んだ先は、イベントのポップアップを閉じたあとで表示する
  renderGame(state, { shownP: move.toP });
}

// 今日の光をカレンダーの上で1マスずつ動かす(最大1.5秒程度)。
// 月が変わるときはカレンダーをめくり、誕生日で跳ね返るときは誕生日のマスを弾ませる。
async function animateDate(state, fromP, dir, days, { isCurrent }) {
  if (days <= 0) return;
  const { N } = state.match;
  const frames = Math.min(days, 30);
  const frameMs = Math.min(80, 1500 / frames);
  let bounced = false;
  let month = fromDayNum(dateOf(state, fromP)).m;
  for (let f = 1; f <= frames; f++) {
    if (!isCurrent()) return;
    const raw = fromP + dir * Math.round((f * days) / frames);
    const p = reflect(raw, N);
    const hit = !bounced && (raw < 0 || raw > N);
    bounced ||= hit;
    const m = fromDayNum(dateOf(state, p)).m;
    if (m !== month) {
      month = m;
      await turnPage();
      if (!isCurrent()) return;
    }
    renderGame(state, { shownP: p });
    if (bounced) $('#turn-msg').textContent = '跳ね返り!';
    if (hit) {
      $(`#board .cell.bday-${raw < 0 ? 'black' : 'white'}`)?.classList.add('bounce');
      await wait(250);
    }
    await wait(frameMs);
  }
  if (bounced) await wait(550);
}

// 月が変わるとき、カレンダーをめくる
async function turnPage() {
  const board = $('#board');
  board.classList.add('page-turn');
  await wait(320);
  board.classList.remove('page-turn');
}

// 選ぶ効果の演出: 鬼は外は消える、固定は金色に光る、奪うは裏返る、植えるは落ちてくる
export async function animateChoice(prev, next, idx, { isCurrent = () => true } = {}) {
  const { effect } = prev.choice;
  if (effect === 'remove') {
    $(`#board .cell[data-idx="${idx}"] .stone`)?.classList.add('vanish');
    await wait(400);
    if (!isCurrent()) return;
  }
  renderGame(next);
  const stone = $(`#board .cell[data-idx="${idx}"] .stone`);
  if (effect === 'fix') stone?.classList.add('glow-gold');
  if (effect === 'steal') stone?.classList.add(next.board[idx].color === 'B' ? 'flip-to-black' : 'flip-to-white');
  if (effect === 'plant') stone?.classList.add('placed');
  await wait(500);
}

// 「真ん中へ」で飛んだ先まで、今日の光を動かす
export async function animateWarp(state, { isCurrent = () => true } = {}) {
  const { toP, warpTo } = state.lastMove;
  await animateDate(state, toP, Math.sign(warpTo - toP), Math.abs(warpTo - toP), { isCurrent });
}

function glowOnce(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // 同じ演出をもう一度最初から始めるため
  el.classList.add(className);
  el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
}

// 効果が働いた名札や石を光らせる
export function highlightEffect(state) {
  const effect = state.lastMove?.event?.effect;
  if (!effect) return;
  const mover = state.lastMove.color;
  const target = ['rest', 'reverse'].includes(effect) ? (mover === 'B' ? 'W' : 'B') : mover;
  if (['double', 'plus3', 'adjust', 'rest', 'reverse', 'extraTurn'].includes(effect)) {
    glowOnce($(`#status-${target === 'B' ? 'black' : 'white'}`), 'glow');
  }
  if (effect === 'resetWeights') {
    for (const stone of document.querySelectorAll('#board .stone')) glowOnce(stone, 'glow-gold');
  }
}

// 勝った人の誕生日のマス(盤面になければ盤面の中央)から花火を上げる
export async function celebrate(state) {
  if (!state.result?.winner || reducedMotion()) return;
  const wrap = $('.board-wrap');
  const area = wrap.getBoundingClientRect();
  const cell = $(`#board .cell.bday-${state.result.winner === 'B' ? 'black' : 'white'}`)?.getBoundingClientRect();
  const x = cell ? cell.left + cell.width / 2 - area.left : area.width / 2;
  const y = cell ? cell.top + cell.height / 2 - area.top : area.height / 2;
  const layer = document.createElement('div');
  layer.className = 'fireworks';
  const colors = ['#f6a5c0', '#ffd166', '#7bdff2', '#b8e986', '#c3a6ff', '#ff9f1c'];
  for (let burst = 0; burst < 3; burst++) {
    for (let i = 0; i < 16; i++) {
      const spark = document.createElement('span');
      const angle = (2 * Math.PI * i) / 16;
      const radius = 50 + Math.random() * 40;
      spark.style.left = `${x}px`;
      spark.style.top = `${y - burst * 25}px`;
      spark.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * radius}px`);
      spark.style.background = colors[(i + burst) % colors.length];
      spark.style.animationDelay = `${burst * 280}ms`;
      layer.append(spark);
    }
  }
  wrap.append(layer);
  await sleep(1500);
  layer.remove();
}
```

- [ ] **Step 4: CSS を足す**

`css/style.css` の次の4行(連続している)を削除する:

```css
.stone.flip { animation: flip 0.35s ease; }
.stone.placed { animation: drop 0.25s ease; }
@keyframes flip { 0% { transform: rotateY(0); } 50% { transform: rotateY(90deg); } 100% { transform: rotateY(0); } }
@keyframes drop { from { transform: scale(1.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
```

`css/style.css` の `@keyframes pulse {` の行の直前に追加する:

```css
.stone.placed { animation: drop 0.45s cubic-bezier(0.3, 0.7, 0.4, 1) both; }
@keyframes drop {
  0% { transform: translateY(-160%) scale(1.15); opacity: 0; }
  60% { transform: translateY(0) scale(1); opacity: 1; }
  78% { transform: translateY(-12%); }
  100% { transform: translateY(0); }
}
.stone.flip-to-black { animation: to-black 0.4s ease both; }
.stone.flip-to-white { animation: to-white 0.4s ease both; }
@keyframes to-black {
  0% { transform: rotateY(0); background: var(--stone-white); color: var(--ink); }
  50% { transform: rotateY(90deg); background: var(--stone-white); color: var(--ink); }
  51% { transform: rotateY(90deg); background: var(--stone-black); color: #fff; }
  100% { transform: rotateY(0); background: var(--stone-black); color: #fff; }
}
@keyframes to-white {
  0% { transform: rotateY(0); background: var(--stone-black); color: #fff; }
  50% { transform: rotateY(90deg); background: var(--stone-black); color: #fff; }
  51% { transform: rotateY(90deg); background: var(--stone-white); color: var(--ink); }
  100% { transform: rotateY(0); background: var(--stone-white); color: var(--ink); }
}
.stone.vanish { animation: vanish 0.4s ease forwards; }
@keyframes vanish { to { opacity: 0; transform: scale(0.3) rotate(25deg); } }
.stone.glow-gold { animation: glow-gold 1s ease; }
@keyframes glow-gold { 40% { box-shadow: 0 0 0 4px #ffd166, 0 0 14px 4px rgba(255, 209, 102, 0.9); transform: scale(1.12); } }
.board.page-turn { animation: page-turn 0.32s ease-in-out; transform-origin: top center; }
@keyframes page-turn { 50% { transform: perspective(600px) rotateX(70deg); opacity: 0.4; } }
.cell.bounce { animation: bounce-cell 0.25s ease; }
@keyframes bounce-cell { 50% { transform: scale(0.8); } }
.pl.glow { animation: glow 1.2s ease; }
@keyframes glow { 30% { box-shadow: 0 0 0 4px #ffd166, 0 0 16px 4px rgba(255, 209, 102, 0.8); } }
.fireworks { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.fireworks span { position: absolute; width: 7px; height: 7px; border-radius: 50%; animation: burst 0.9s ease-out both; }
@keyframes burst {
  0% { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1); opacity: 0; }
}
dialog[open] { animation: pop-in 0.35s cubic-bezier(0.2, 1.4, 0.4, 1); }
@keyframes pop-in { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.cake .flame { transform-box: fill-box; transform-origin: 50% 100%; animation: flicker 0.6s ease-in-out infinite alternate; }
.cake .flame:nth-of-type(2) { animation-delay: 0.2s; }
.cake .flame:nth-of-type(3) { animation-delay: 0.4s; }
@keyframes flicker { from { transform: scaleY(0.85) rotate(-4deg); } to { transform: scaleY(1.15) rotate(4deg); } }
```

`css/style.css` の末尾の `@media (prefers-reduced-motion: reduce) { ... }` を、次に置き換える:

```css
@media (prefers-reduced-motion: reduce) {
  .stone.placed, .stone.ghost, .stone.flip-to-black, .stone.flip-to-white, .stone.vanish, .stone.glow-gold,
  .cell.target, .cell.is-today, .cell.dest, .cell.bounce, .cell.line-on .stone.will-flip,
  .board.page-turn, .pl.glow, dialog[open], .cake .flame, .confetti span { animation: none; }
  .pl { transition: none; }
}
```

- [ ] **Step 5: ろうそくの炎に印を付ける**

`index.html` の3つの `<ellipse cx="..." cy="25" rx="3" ry="5" fill="#ff9f1c"/>` に、それぞれ `class="flame" ` を加える(例: `<ellipse class="flame" cx="41" cy="25" rx="3" ry="5" fill="#ff9f1c"/>`)。

- [ ] **Step 6: スモークテストと単体テストが通ることを確かめる**

Run: `lsof -i :9333`(何も出ないこと)、`caffeinate -i npm run smoke`、`npm test`
Expected: `OK: ...`、単体テストはすべて pass。シナリオ 11(動きを減らす設定で300ms未満)も通ること。

- [ ] **Step 7: スクリーンショットを目で確かめる**

- `phone-flip.png`: 返る途中の石が見える(色が変わる途中か、まだ元の色)。
- `phone-event.png`: イベントのポップアップが表示されている。
- `phone-result.png`: ケーキ(炎)、紙吹雪、見出し、理由。

問題があれば直し、Step 6 からやり直す。

- [ ] **Step 8: 実際にブラウザで1局遊ぶ(人間の確認)**

`npm run serve` で http://localhost:8000/ を開き、1局遊んで確かめる。これは人間のパートナーが行う。
- 石が落ちる・順に返る
- 今日の光が動く、月をめくる、跳ね返りで弾む
- イベントのポップアップが弾む
- 名札が光る
- 花火とろうそく

サブエージェントはこのステップを行えないので、報告に「人間の確認待ち」と書く。

- [ ] **Step 9: コミット**

```bash
git add js/ui.js css/style.css index.html tools/smoke.mjs
git commit -m "Add v2 animations: drop, staggered flips, page turn, bounce, glows, fireworks"
```

---

### Task 6: 公開(GitHub Pages を更新する)

**Files:** なし(プッシュのみ)

**Interfaces:**
- Consumes: Task 1〜5 の成果物(main にマージ済みであること)
- Produces: https://naoto-programming.github.io/birthday-othello/ が v2 になる

- [ ] **Step 1: 人間のパートナーに確認を取る(外部への公開のため必須)**

main を GitHub にプッシュすると、公開中のゲームが v2 に置き換わる。プッシュしてよいか確認し、了承が得られるまで先に進まない。

- [ ] **Step 2: プッシュする**

```bash
git push origin main
```

- [ ] **Step 3: 公開を確かめる**

```bash
gh api repos/naoto-programming/birthday-othello/pages/builds/latest --jq .status
```

Expected: `built`(数分かかることがある)

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://naoto-programming.github.io/birthday-othello/
SMOKE_URL=https://naoto-programming.github.io/birthday-othello/ caffeinate -i npm run smoke
```

Expected: `200`、`OK: ...`(公開直後に一時的な 503 が出たら、少し待ってやり直す)
