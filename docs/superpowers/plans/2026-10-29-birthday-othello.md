# 誕生日オセロ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 家族向けの1対1ブラウザゲーム「誕生日オセロ」(オセロ+日付の綱引き)を作り、GitHub Pages で公開する。

**Architecture:** 純粋な計算モジュール(dates / holidays / events / rules)と、画面モジュール(ui / main)に分ける。計算モジュールは DOM に触れず、Node.js の標準テスト機能でテストする。画面はヘッドレス Chrome を Chrome DevTools Protocol で操作するスモークテストで確認する。

**Tech Stack:** HTML / CSS / JavaScript(ES モジュール、ビルドなし、依存パッケージなし)、Node.js v23(`node --test`)、Google Chrome(ヘッドレス、スモークテスト用)、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-10-29-birthday-othello-design.md`

## Global Constraints

- フレームワーク・ビルド手順・npm の依存パッケージを使わない。ブラウザの ES モジュールで動かす。
- js/dates.js・js/holidays.js・js/events.js・js/rules.js は DOM に触れない純粋な処理にする。
- 日付は UTC 基準の通し番号(1970-01-01 からの日数)で扱う。
- 基準年 Y は、設定時点での端末の現在の年。
- 2/29 生まれは、うるう年でない年では 2/28 として扱う。
- 増え方 s = max(1, round(D / 24))。石の重さ = 1 + k × s(k はこれまでに裏返った回数)。
- 既定の開始日は、間隔が短い側の真ん中。割り切れない場合は白寄り。短い側が1日以下なら長い側。
- 先手は黒。空きマスならどこにでも置ける。パスはない。
- 移動日数の計算順: 基本 → 2倍 → +3 → 調整(−3〜+3、0未満にしない)→ おやすみ → うそ。1枚も裏返らなければ0日で、効果は使い切る。
- 1手の処理順: 置いて裏返す → 日付を動かす → 誕生日判定 → イベント → 盤面が埋まったかの判定 → 次の手番。
- 日付が動く演出は最大1.5秒程度。
- スマートフォン縦向きで、左右16pxの余白、ページ全体が横スクロールしない。
- プレイヤー名など入力された文字は textContent でのみ画面に出す(innerHTML に入れない)。
- 結果画面の見出しは「お誕生日おめでとう、◯◯!」。

## Review Focus

1. **幅320pxの画面で10文字の名前を入れる** → 設定画面・対戦画面が横にスクロールしないこと。Task 5 のスモークテストで確認する。
2. **石を置いた直後(演出中・処理中)にマスを連打する** → 2手目は無視され、1手しか打てないこと。Task 5 のスモークテストで確認する。
3. **誕生日の日を31日にしてから月を2月に変える** → 日が29日に収まること。Task 5 のスモークテストで確認する。
4. **開始日の入力欄を空にする** → 既定の開始日に戻ること。setupMatch も不正な開始日ではエラーを返すこと。Task 1 の単体テストと Task 5 のスモークテストで確認する。
5. **1回目の結果で「再戦」を選び、2回目の結果を Esc(ボタン以外)で閉じる** → 前回の「再戦」が残って勝手に再戦にならず、設定画面に戻ること。Task 6 のスモークテストで確認する。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `package.json` | `"type": "module"` とスクリプト(test / serve / smoke) |
| `.gitignore` | スクリーンショットなどを除外 |
| `js/dates.js` | 日付の通し番号、誕生日の出現日、黒白と範囲の決定、既定の開始日、盤面の64日分、書式 |
| `js/holidays.js` | 第N月曜、春分・秋分、日付ルールの解決 |
| `js/events.js` | 効果の定義(12種類)、イベント表(23日)、範囲内のイベント一覧、日付ルールの表示文字 |
| `js/rules.js` | 盤面、裏返し、重さ、移動日数、跳ね返り、勝敗、イベント効果 |
| `js/ui.js` | 画面の描画、ダイアログ、演出 |
| `js/main.js` | 状態の保持、入力の受け付け、画面の切り替え |
| `index.html` / `css/style.css` | 画面の骨組みと見た目 |
| `tools/serve.mjs` | 開発用の静的ファイルサーバー |
| `tools/smoke.mjs` | ヘッドレス Chrome によるスモークテスト |
| `tests/*.test.js` | 単体テスト |

---

### Task 1: プロジェクトの土台と日付計算

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `js/dates.js`
- Test: `tests/dates.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `dayNum(y, m, d) → number`(通し番号)
  - `fromDayNum(n) → { y, m, d }`
  - `weekday(n) → number`(0=日 … 6=土)
  - `isLeapYear(y) → boolean`
  - `birthdayInYear(birthday: {m, d}, y) → number`
  - `prevOccurrence(birthday, day) → number` / `nextOccurrence(birthday, day) → number`(当日を含まない)
  - `growthStep(D) → number`
  - `setupMatch(players: [{name, birthday:{m,d}}, {…}], start: number, rng = Math.random) → Match | { error: string }`
    - `Match = { black: {name, birthday, day}, white: {name, birthday, day}, baseDay, D, p0, s, sameBirthday }`
  - `defaultStart(birthdayA, birthdayB, year) → number`
  - `boardDates(currentDay) → number[64]`
  - `formatMD(day) → 'm/d'`、`toISODate(day) → 'YYYY-MM-DD'`、`parseISODate(text) → number`(不正なら NaN)

- [ ] **Step 1: package.json と .gitignore を作る**

`package.json`:

```json
{
  "name": "birthday-othello",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "node tools/serve.mjs",
    "smoke": "node tools/smoke.mjs"
  }
}
```

`.gitignore`:

```
tools/screenshots/
.DS_Store
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/dates.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayNum, fromDayNum, weekday, birthdayInYear, prevOccurrence, nextOccurrence, growthStep,
  setupMatch, defaultStart, boardDates, formatMD, toISODate, parseISODate,
} from '../js/dates.js';

const taro = { name: 'たろう', birthday: { m: 10, d: 14 } };
const hanako = { name: 'はなこ', birthday: { m: 12, d: 3 } };

test('dayNum と fromDayNum は往復で同じ日付になる', () => {
  const n = dayNum(2026, 10, 29);
  assert.deepEqual(fromDayNum(n), { y: 2026, m: 10, d: 29 });
  assert.equal(dayNum(2026, 11, 1) - dayNum(2026, 10, 31), 1);
});

test('weekday: 2026-10-29 は木曜日', () => {
  assert.equal(weekday(dayNum(2026, 10, 29)), 4);
});

test('birthdayInYear: 2/29 生まれはうるう年以外で 2/28', () => {
  assert.equal(birthdayInYear({ m: 2, d: 29 }, 2027), dayNum(2027, 2, 28));
  assert.equal(birthdayInYear({ m: 2, d: 29 }, 2028), dayNum(2028, 2, 29));
});

test('prevOccurrence / nextOccurrence は当日を含まない', () => {
  const day = dayNum(2026, 10, 14);
  assert.equal(prevOccurrence({ m: 10, d: 14 }, day), dayNum(2025, 10, 14));
  assert.equal(nextOccurrence({ m: 10, d: 14 }, day), dayNum(2027, 10, 14));
  assert.equal(prevOccurrence({ m: 12, d: 3 }, day), dayNum(2025, 12, 3));
  assert.equal(nextOccurrence({ m: 12, d: 3 }, day), dayNum(2026, 12, 3));
});

test('growthStep: D/24 を四捨五入し、最低1', () => {
  assert.equal(growthStep(2), 1);
  assert.equal(growthStep(20), 1);
  assert.equal(growthStep(36), 2);
  assert.equal(growthStep(40), 2);
  assert.equal(growthStep(180), 8);
});

test('setupMatch: 過去側の誕生日の人が黒、未来側の人が白', () => {
  const m = setupMatch([taro, hanako], dayNum(2026, 11, 8));
  assert.equal(m.black.name, 'たろう');
  assert.equal(m.black.day, dayNum(2026, 10, 14));
  assert.equal(m.white.name, 'はなこ');
  assert.equal(m.white.day, dayNum(2026, 12, 3));
  assert.equal(m.baseDay, dayNum(2026, 10, 14));
  assert.equal(m.D, 50);
  assert.equal(m.p0, 25);
  assert.equal(m.s, 2);
  assert.equal(m.sameBirthday, false);
});

test('setupMatch: 入力の順番を入れ替えても同じ', () => {
  const m = setupMatch([hanako, taro], dayNum(2026, 11, 8));
  assert.equal(m.black.name, 'たろう');
  assert.equal(m.white.name, 'はなこ');
});

test('setupMatch: 開始日が反対側にあると黒白が入れ替わる', () => {
  const m = setupMatch([taro, hanako], dayNum(2026, 6, 1));
  assert.equal(m.black.name, 'はなこ');
  assert.equal(m.black.day, dayNum(2025, 12, 3));
  assert.equal(m.white.name, 'たろう');
  assert.equal(m.white.day, dayNum(2026, 10, 14));
  assert.equal(m.D, dayNum(2026, 10, 14) - dayNum(2025, 12, 3));
});

test('setupMatch: 年をまたぐ範囲', () => {
  const m = setupMatch(
    [{ name: 'A', birthday: { m: 12, d: 20 } }, { name: 'B', birthday: { m: 1, d: 10 } }],
    dayNum(2026, 12, 31),
  );
  assert.equal(m.black.day, dayNum(2026, 12, 20));
  assert.equal(m.white.day, dayNum(2027, 1, 10));
  assert.equal(m.D, 21);
  assert.equal(m.p0, 11);
});

test('setupMatch: 開始日が誕生日と同じ日ならエラー', () => {
  assert.match(setupMatch([taro, hanako], dayNum(2026, 10, 14)).error, /誕生日と同じ/);
});

test('setupMatch: 開始日が不正ならエラー', () => {
  assert.match(setupMatch([taro, hanako], parseISODate('')).error, /開始日を入力/);
});

test('setupMatch: 同じ誕生日なら黒白は rng で決まり、範囲は約1年', () => {
  const a = { name: 'A', birthday: { m: 5, d: 5 } };
  const b = { name: 'B', birthday: { m: 5, d: 5 } };
  const start = dayNum(2026, 11, 1);
  assert.equal(setupMatch([a, b], start, () => 0).black.name, 'A');
  assert.equal(setupMatch([a, b], start, () => 0.9).black.name, 'B');
  const m = setupMatch([a, b], start, () => 0);
  assert.equal(m.sameBirthday, true);
  assert.equal(m.D, 365);
});

test('setupMatch: 2/29 生まれはうるう年以外で 2/28 として扱う', () => {
  const m = setupMatch(
    [{ name: 'うるう', birthday: { m: 2, d: 29 } }, { name: 'C', birthday: { m: 3, d: 10 } }],
    dayNum(2027, 3, 5),
  );
  assert.equal(m.black.name, 'うるう');
  assert.equal(m.black.day, dayNum(2027, 2, 28));
  assert.equal(m.D, 10);
});

test('defaultStart: 間隔が短い側の真ん中', () => {
  assert.equal(defaultStart(taro.birthday, hanako.birthday, 2026), dayNum(2026, 11, 8));
});

test('defaultStart: 割り切れないときは白寄り', () => {
  // 10/14〜10/17 は3日。黒(10/14)から2日、白(10/17)から1日の 10/16
  assert.equal(defaultStart({ m: 10, d: 14 }, { m: 10, d: 17 }, 2026), dayNum(2026, 10, 16));
});

test('defaultStart: 年末年始をまたぐ短い側', () => {
  assert.equal(defaultStart({ m: 12, d: 20 }, { m: 1, d: 10 }, 2026), dayNum(2026, 12, 31));
});

test('defaultStart: 連続した誕生日なら長い側の真ん中', () => {
  const a = { name: 'A', birthday: { m: 10, d: 14 } };
  const b = { name: 'B', birthday: { m: 10, d: 15 } };
  const start = defaultStart(a.birthday, b.birthday, 2026);
  const len = dayNum(2027, 10, 14) - dayNum(2026, 10, 15);
  assert.equal(start, dayNum(2026, 10, 15) + Math.ceil(len / 2));
  const m = setupMatch([a, b], start);
  assert.equal(m.error, undefined);
  assert.equal(m.black.name, 'B');
});

test('defaultStart: 同じ誕生日でも開始できる日になる', () => {
  const bd = { m: 5, d: 5 };
  const start = defaultStart(bd, bd, 2026);
  const m = setupMatch([{ name: 'A', birthday: bd }, { name: 'B', birthday: bd }], start, () => 0);
  assert.equal(m.error, undefined);
  assert.equal(m.D, 365);
});

test('boardDates: 現在の日付の月の1日から64日分', () => {
  const dates = boardDates(dayNum(2026, 11, 8));
  assert.equal(dates.length, 64);
  assert.equal(dates[0], dayNum(2026, 11, 1));
  assert.equal(dates[63], dayNum(2027, 1, 3));
});

test('formatMD / toISODate / parseISODate', () => {
  const n = dayNum(2026, 3, 5);
  assert.equal(formatMD(n), '3/5');
  assert.equal(toISODate(n), '2026-03-05');
  assert.equal(parseISODate('2026-03-05'), n);
});
```

- [ ] **Step 3: テストが失敗することを確かめる**

Run: `npm test`
Expected: FAIL(`Cannot find module '.../js/dates.js'`)

- [ ] **Step 4: 実装する**

`js/dates.js`:

```js
// 日付はタイムゾーンの影響を避けるため、UTC基準の通し番号(1970-01-01からの日数)で扱う。
const MS_PER_DAY = 86400000;

export function dayNum(y, m, d) {
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNum(n) {
  const date = new Date(n * MS_PER_DAY);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export function weekday(n) {
  return new Date(n * MS_PER_DAY).getUTCDay(); // 0=日 1=月 … 6=土
}

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// 誕生日 {m, d} のその年での日付。2/29 はうるう年以外では 2/28 として扱う。
export function birthdayInYear(birthday, y) {
  if (birthday.m === 2 && birthday.d === 29 && !isLeapYear(y)) return dayNum(y, 2, 28);
  return dayNum(y, birthday.m, birthday.d);
}

// day より前(day は含まない)で最も近い誕生日
export function prevOccurrence(birthday, day) {
  const { y } = fromDayNum(day);
  const thisYear = birthdayInYear(birthday, y);
  return thisYear < day ? thisYear : birthdayInYear(birthday, y - 1);
}

// day より後(day は含まない)で最も近い誕生日
export function nextOccurrence(birthday, day) {
  const { y } = fromDayNum(day);
  const thisYear = birthdayInYear(birthday, y);
  return thisYear > day ? thisYear : birthdayInYear(birthday, y + 1);
}

// 石が裏返るたびに重くなる量。2人の誕生日が離れているほど大きくする。
export function growthStep(D) {
  return Math.max(1, Math.round(D / 24));
}

// 開始日から過去へさかのぼって最初に出てくる誕生日の人が黒、未来へ進んで最初に出てくる誕生日の人が白。
export function setupMatch(players, start, rng = Math.random) {
  if (!Number.isFinite(start)) return { error: '開始日を入力してください。' };
  const year = fromDayNum(start).y;
  if (players.some((pl) => birthdayInYear(pl.birthday, year) === start)) {
    return { error: '開始日が誕生日と同じ日です。別の日にしてください。' };
  }
  const [a, b] = players;
  const prevA = prevOccurrence(a.birthday, start);
  const prevB = prevOccurrence(b.birthday, start);
  const sameBirthday = prevA === prevB;
  let order;
  if (sameBirthday) order = rng() < 0.5 ? [a, b] : [b, a];
  else order = prevA > prevB ? [a, b] : [b, a];
  const [blackPlayer, whitePlayer] = order;
  const baseDay = prevOccurrence(blackPlayer.birthday, start);
  const whiteDay = nextOccurrence(whitePlayer.birthday, start);
  const D = whiteDay - baseDay;
  return {
    black: { ...blackPlayer, day: baseDay },
    white: { ...whitePlayer, day: whiteDay },
    baseDay,
    D,
    p0: start - baseDay,
    s: growthStep(D),
    sameBirthday,
  };
}

// 2人の誕生日の間で、間隔が短い側の真ん中(端数は白寄り)。短い側に間の日がなければ長い側。
export function defaultStart(birthdayA, birthdayB, year) {
  const a = birthdayInYear(birthdayA, year);
  const b = birthdayInYear(birthdayB, year);
  const arcs = [
    { from: a, to: nextOccurrence(birthdayB, a) },
    { from: b, to: nextOccurrence(birthdayA, b) },
  ]
    .map((arc) => ({ ...arc, len: arc.to - arc.from }))
    .sort((x, y) => x.len - y.len);
  const arc = arcs[0].len >= 2 ? arcs[0] : arcs[1];
  return arc.from + Math.ceil(arc.len / 2);
}

// 盤面に印刷する64日分(現在の日付がある月の1日から)
export function boardDates(currentDay) {
  const { y, m } = fromDayNum(currentDay);
  const first = dayNum(y, m, 1);
  return Array.from({ length: 64 }, (_, i) => first + i);
}

export function formatMD(day) {
  const { m, d } = fromDayNum(day);
  return `${m}/${d}`;
}

export function toISODate(day) {
  const { y, m, d } = fromDayNum(day);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseISODate(text) {
  const [y, m, d] = text.split('-').map(Number);
  return dayNum(y, m, d);
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test`
Expected: すべて pass、fail 0

- [ ] **Step 6: コミット**

```bash
git add package.json .gitignore js/dates.js tests/dates.test.js
git commit -m "$(cat <<'EOF'
Add date utilities and match setup

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 祝日とイベント表

**Files:**
- Create: `js/holidays.js`
- Create: `js/events.js`
- Test: `tests/holidays.test.js`

**Interfaces:**
- Consumes: `dayNum`, `weekday`, `fromDayNum`(Task 1)
- Produces:
  - `nthMonday(y, m, n) → number`、`vernalEquinoxDay(y) → number`、`autumnalEquinoxDay(y) → number`
  - `resolveRule(rule, y) → number`(rule は `{type:'fixed', m, d}` / `{type:'nthMonday', m, n}` / `{type:'vernalEquinox'}` / `{type:'autumnalEquinox'}`)
  - `EFFECTS: { [effectId]: { name, text } }`(12種類: plus3, double, adjust, extraTurn, rest, reverse, middle, remove, fix, steal, resetWeights, plant)
  - `EVENTS: Array<{ rule, occasion, name, effect, holiday }>`(23件)
  - `listEventDays(fromDay, toDay) → Array<{ day, event }>`(両端を含み、日付順)
  - `ruleLabel(rule) → string`

- [ ] **Step 1: 失敗するテストを書く**

`tests/holidays.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNum, formatMD } from '../js/dates.js';
import { nthMonday, vernalEquinoxDay, autumnalEquinoxDay } from '../js/holidays.js';
import { EFFECTS, EVENTS, listEventDays, ruleLabel } from '../js/events.js';

// 内閣府「国民の祝日」CSV(https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv)から、
// 振替休日・国民の休日(CSV 上の「休日」)を除いたもの
const OFFICIAL = {
  2026: [
    ['1/1', '元日'], ['1/12', '成人の日'], ['2/11', '建国記念の日'], ['2/23', '天皇誕生日'],
    ['3/20', '春分の日'], ['4/29', '昭和の日'], ['5/3', '憲法記念日'], ['5/4', 'みどりの日'],
    ['5/5', 'こどもの日'], ['7/20', '海の日'], ['8/11', '山の日'], ['9/21', '敬老の日'],
    ['9/23', '秋分の日'], ['10/12', 'スポーツの日'], ['11/3', '文化の日'], ['11/23', '勤労感謝の日'],
  ],
  2027: [
    ['1/1', '元日'], ['1/11', '成人の日'], ['2/11', '建国記念の日'], ['2/23', '天皇誕生日'],
    ['3/21', '春分の日'], ['4/29', '昭和の日'], ['5/3', '憲法記念日'], ['5/4', 'みどりの日'],
    ['5/5', 'こどもの日'], ['7/19', '海の日'], ['8/11', '山の日'], ['9/20', '敬老の日'],
    ['9/23', '秋分の日'], ['10/11', 'スポーツの日'], ['11/3', '文化の日'], ['11/23', '勤労感謝の日'],
  ],
};

test('nthMonday: 2026年1月の第2月曜は 1/12', () => {
  assert.equal(nthMonday(2026, 1, 2), dayNum(2026, 1, 12));
});

test('春分の日・秋分の日の近似式', () => {
  assert.equal(vernalEquinoxDay(2026), dayNum(2026, 3, 20));
  assert.equal(autumnalEquinoxDay(2026), dayNum(2026, 9, 23));
  assert.equal(vernalEquinoxDay(2027), dayNum(2027, 3, 21));
  assert.equal(autumnalEquinoxDay(2027), dayNum(2027, 9, 23));
});

test('祝日: 内閣府の一覧と一致する', () => {
  for (const [year, expected] of Object.entries(OFFICIAL)) {
    const y = Number(year);
    const actual = listEventDays(dayNum(y, 1, 1), dayNum(y, 12, 31))
      .filter(({ event }) => event.holiday)
      .map(({ day, event }) => [formatMD(day), event.occasion]);
    assert.deepEqual(actual, expected, `${y}年`);
  }
});

test('イベント表: 23日分あり、効果はすべて定義済み', () => {
  assert.equal(EVENTS.length, 23);
  assert.equal(listEventDays(dayNum(2026, 1, 1), dayNum(2026, 12, 31)).length, 23);
  for (const ev of EVENTS) assert.ok(EFFECTS[ev.effect], `${ev.occasion} の効果 ${ev.effect}`);
  assert.equal(Object.keys(EFFECTS).length, 12);
});

test('listEventDays: 年をまたぐ範囲と両端', () => {
  const list = listEventDays(dayNum(2026, 12, 25), dayNum(2027, 1, 1));
  assert.deepEqual(list.map(({ event }) => event.occasion), ['クリスマス', '大晦日', '元日']);
});

test('ruleLabel', () => {
  assert.equal(ruleLabel({ type: 'fixed', m: 10, d: 31 }), '10/31');
  assert.equal(ruleLabel({ type: 'nthMonday', m: 1, n: 2 }), '1月第2月曜');
  assert.equal(ruleLabel({ type: 'vernalEquinox' }), '3/20ごろ');
  assert.equal(ruleLabel({ type: 'autumnalEquinox' }), '9/23ごろ');
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: FAIL(`Cannot find module '.../js/holidays.js'`)。dates のテストは pass のまま。

- [ ] **Step 3: holidays.js を実装する**

`js/holidays.js`:

```js
import { dayNum, weekday } from './dates.js';

// その月の第 n 月曜日
export function nthMonday(y, m, n) {
  const first = dayNum(y, m, 1);
  const toMonday = (8 - weekday(first)) % 7;
  return first + toMonday + (n - 1) * 7;
}

// 春分の日・秋分の日の近似式(1980〜2099年で使える)
function equinoxDay(y, m, constant) {
  const d = Math.floor(constant + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  return dayNum(y, m, d);
}

export const vernalEquinoxDay = (y) => equinoxDay(y, 3, 20.8431);
export const autumnalEquinoxDay = (y) => equinoxDay(y, 9, 23.2488);

// イベント表の日付ルールを、その年の日付(通し番号)にする
export function resolveRule(rule, y) {
  switch (rule.type) {
    case 'fixed': return dayNum(y, rule.m, rule.d);
    case 'nthMonday': return nthMonday(y, rule.m, rule.n);
    case 'vernalEquinox': return vernalEquinoxDay(y);
    case 'autumnalEquinox': return autumnalEquinoxDay(y);
    default: throw new Error(`unknown rule type: ${rule.type}`);
  }
}
```

- [ ] **Step 4: events.js を実装する**

`js/events.js`:

```js
import { fromDayNum } from './dates.js';
import { resolveRule } from './holidays.js';

// 効果の部品。イベント表はこの ID を割り当てる。
export const EFFECTS = {
  plus3: { name: '日数プラス', text: '自分の次の手で動く日数が+3日' },
  double: { name: '日数2倍', text: '自分の次の手で動く日数が2倍' },
  adjust: { name: '日数調整', text: '自分の次の手で、動く日数を−3〜+3日の範囲で選べる' },
  extraTurn: { name: 'もう一手', text: '続けてもう1回打てる' },
  rest: { name: 'おやすみ', text: '相手の次の手は日付が動かない' },
  reverse: { name: 'うそ', text: '相手の次の手は日付が逆向きに動く' },
  middle: { name: '真ん中へ', text: '日付が2人の誕生日のちょうど真ん中に飛ぶ' },
  remove: { name: '鬼は外', text: '相手の石を1つ選んで取り除く' },
  fix: { name: '固定', text: '自分の石を1つ選んで固定する(以後は裏返らない)' },
  steal: { name: '奪う', text: '相手の石を1つ選んで自分の色にする' },
  resetWeights: { name: '重さリセット', text: '盤面のすべての石の重さが1に戻る' },
  plant: { name: '植える', text: '空きマスを1つ選んで自分の石を置く' },
};

// イベント一覧。holiday: true は国民の祝日。
// 日付ルール: fixed(月日)/ nthMonday(その月の第n月曜)/ vernalEquinox(春分の日)/ autumnalEquinox(秋分の日)
export const EVENTS = [
  { rule: { type: 'fixed', m: 1, d: 1 }, occasion: '元日', name: 'お年玉', effect: 'plus3', holiday: true },
  { rule: { type: 'nthMonday', m: 1, n: 2 }, occasion: '成人の日', name: '大人の一歩', effect: 'double', holiday: true },
  { rule: { type: 'fixed', m: 2, d: 3 }, occasion: '節分', name: '鬼は外', effect: 'remove', holiday: false },
  { rule: { type: 'fixed', m: 2, d: 11 }, occasion: '建国記念の日', name: '国づくり', effect: 'plant', holiday: true },
  { rule: { type: 'fixed', m: 2, d: 23 }, occasion: '天皇誕生日', name: 'お祝い', effect: 'double', holiday: true },
  { rule: { type: 'fixed', m: 3, d: 3 }, occasion: 'ひな祭り', name: 'ひな飾り', effect: 'fix', holiday: false },
  { rule: { type: 'vernalEquinox' }, occasion: '春分の日', name: '昼と夜が同じ', effect: 'middle', holiday: true },
  { rule: { type: 'fixed', m: 4, d: 1 }, occasion: 'エイプリルフール', name: 'うそ', effect: 'reverse', holiday: false },
  { rule: { type: 'fixed', m: 4, d: 29 }, occasion: '昭和の日', name: 'なつかしの昔', effect: 'resetWeights', holiday: true },
  { rule: { type: 'fixed', m: 5, d: 3 }, occasion: '憲法記念日', name: 'きまりを守る', effect: 'fix', holiday: true },
  { rule: { type: 'fixed', m: 5, d: 4 }, occasion: 'みどりの日', name: '植樹', effect: 'plant', holiday: true },
  { rule: { type: 'fixed', m: 5, d: 5 }, occasion: 'こどもの日', name: 'こいのぼり', effect: 'extraTurn', holiday: true },
  { rule: { type: 'fixed', m: 7, d: 7 }, occasion: '七夕', name: '織姫と彦星', effect: 'middle', holiday: false },
  { rule: { type: 'nthMonday', m: 7, n: 3 }, occasion: '海の日', name: '引き潮', effect: 'reverse', holiday: true },
  { rule: { type: 'fixed', m: 8, d: 11 }, occasion: '山の日', name: '頂上をめざして', effect: 'plus3', holiday: true },
  { rule: { type: 'nthMonday', m: 9, n: 3 }, occasion: '敬老の日', name: '年の功', effect: 'adjust', holiday: true },
  { rule: { type: 'autumnalEquinox' }, occasion: '秋分の日', name: '昼と夜が同じ', effect: 'middle', holiday: true },
  { rule: { type: 'nthMonday', m: 10, n: 2 }, occasion: 'スポーツの日', name: 'かけっこ', effect: 'extraTurn', holiday: true },
  { rule: { type: 'fixed', m: 10, d: 31 }, occasion: 'ハロウィン', name: 'お菓子', effect: 'double', holiday: false },
  { rule: { type: 'fixed', m: 11, d: 3 }, occasion: '文化の日', name: '調整', effect: 'adjust', holiday: true },
  { rule: { type: 'fixed', m: 11, d: 23 }, occasion: '勤労感謝の日', name: 'おやすみ', effect: 'rest', holiday: true },
  { rule: { type: 'fixed', m: 12, d: 25 }, occasion: 'クリスマス', name: 'プレゼント', effect: 'steal', holiday: false },
  { rule: { type: 'fixed', m: 12, d: 31 }, occasion: '大晦日', name: '年越し', effect: 'resetWeights', holiday: false },
];

// fromDay〜toDay(両端を含む)にあるイベントを日付順に返す
export function listEventDays(fromDay, toDay) {
  const found = [];
  for (let y = fromDayNum(fromDay).y; y <= fromDayNum(toDay).y; y++) {
    for (const event of EVENTS) {
      const day = resolveRule(event.rule, y);
      if (day >= fromDay && day <= toDay) found.push({ day, event });
    }
  }
  return found.sort((a, b) => a.day - b.day);
}

// ルール画面などで使う、日付ルールの表示文字
export function ruleLabel(rule) {
  switch (rule.type) {
    case 'fixed': return `${rule.m}/${rule.d}`;
    case 'nthMonday': return `${rule.m}月第${rule.n}月曜`;
    case 'vernalEquinox': return '3/20ごろ';
    case 'autumnalEquinox': return '9/23ごろ';
    default: throw new Error(`unknown rule type: ${rule.type}`);
  }
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npm test`
Expected: すべて pass、fail 0

- [ ] **Step 6: コミット**

```bash
git add js/holidays.js js/events.js tests/holidays.test.js
git commit -m "$(cat <<'EOF'
Add holidays and event table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ルール本体(盤面・移動・勝敗)

**Files:**
- Create: `js/rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Consumes: `listEventDays`(Task 2)、`dayNum`(Task 1、テストのみ)
- Produces:
  - `SIZE = 8`、`opponent(color) → 'B' | 'W'`
  - `stoneWeight(stone, s) → number`
  - `reflect(x, D) → number`(0〜D に跳ね返らせる)
  - `newGame(match) → State`
    - `State = { match, board: (Stone|null)[64], events: { [p]: {occasion, name, effect, holiday, rule, day, used} }, turn: 'B'|'W', p, pending: { B: Pending, W: Pending }, phase: 'play'|'choose'|'over', choice: null|{effect, player}, lastMove: null|LastMove, result: null|{ winner: 'B'|'W'|null, reason: 'birthday'|'full' } }`
    - `Stone = { color: 'B'|'W', flips: number, fixed: boolean }`
    - `Pending = { double, plus3, adjust, rest, reverse }`(すべて boolean。その人の次の手に効く)
    - `LastMove = { color, idx, flips: number[], base, days, dir, fromP, toP, event: null|Event, fizzled: boolean, warpTo?: number }`
  - `computeFlips(board, idx, color) → number[]`
  - `previewMove(state, idx) → { flips, base, needsAdjust }`
  - `moveDays(base, pending, color, adjust = 0) → { days, dir }`
  - `playMove(state, idx, adjust = 0) → State`(新しい状態を返す。置けない場合は同じ state をそのまま返す)
  - `countStones(state) → { B, W }`
  - `judgeFull(state) → { winner, reason: 'full' }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/rules.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNum } from '../js/dates.js';
import {
  reflect, stoneWeight, newGame, computeFlips, previewMove, moveDays, playMove, countStones, judgeFull,
} from '../js/rules.js';

const at = (r, c) => r * 8 + c;

// 8行の文字列で盤面を作る。'.' 空き、'B' 黒、'W' 白、'b' 固定の黒、'w' 固定の白
function boardFrom(rows) {
  return rows.join('').split('').map((ch) => {
    if (ch === '.') return null;
    return { color: ch.toUpperCase(), flips: 0, fixed: ch === 'b' || ch === 'w' };
  });
}

const EMPTY_ROWS = Array(8).fill('........');
const rowsWith = (row3) => EMPTY_ROWS.map((row, i) => (i === 3 ? row3 : row));

function testMatch({ D = 20, p0 = 10, s = 1, baseDay = dayNum(2026, 6, 1) } = {}) {
  return {
    black: { name: '黒の人', birthday: { m: 6, d: 1 }, day: baseDay },
    white: { name: '白の人', birthday: { m: 6, d: 21 }, day: baseDay + D },
    baseDay, D, p0, s, sameBirthday: false,
  };
}

// テスト用の状態。rows を省略すると初期配置のまま。events は明示的に差し替える。
function stateWith({ D = 20, p = 10, s = 1, turn = 'B', rows = null, events = {} } = {}) {
  const state = newGame(testMatch({ D, p0: p, s }));
  if (rows) state.board = boardFrom(rows);
  state.turn = turn;
  state.events = events;
  return state;
}

const NONE = { double: false, plus3: false, adjust: false, rest: false, reverse: false };

test('reflect: 範囲内はそのまま', () => {
  assert.equal(reflect(7, 10), 7);
  assert.equal(reflect(0, 10), 0);
  assert.equal(reflect(10, 10), 10);
});

test('reflect: 仕様の例(2 から 5 戻ると 3)', () => {
  assert.equal(reflect(2 - 5, 10), 3);
});

test('reflect: 白の誕生日を越えても跳ね返る', () => {
  assert.equal(reflect(13, 10), 7);
});

test('reflect: 何度も跳ね返る', () => {
  assert.equal(reflect(-23, 10), 3);
  assert.equal(reflect(25, 10), 5);
  assert.equal(reflect(40, 10), 0);
});

test('stoneWeight: 1 + 裏返り回数 × s', () => {
  assert.equal(stoneWeight({ color: 'B', flips: 0, fixed: false }, 3), 1);
  assert.equal(stoneWeight({ color: 'B', flips: 2, fixed: false }, 3), 7);
});

test('newGame: 中央4石、黒の手番、開始位置', () => {
  const state = newGame(testMatch({ D: 20, p0: 10 }));
  assert.equal(state.board.filter(Boolean).length, 4);
  assert.equal(state.board[at(3, 3)].color, 'W');
  assert.equal(state.board[at(4, 4)].color, 'W');
  assert.equal(state.board[at(3, 4)].color, 'B');
  assert.equal(state.board[at(4, 3)].color, 'B');
  assert.equal(state.turn, 'B');
  assert.equal(state.p, 10);
  assert.equal(state.phase, 'play');
});

test('newGame: 範囲内(両端を除く)のイベントを位置で引ける', () => {
  // 10/14 から 12/3(D=50): ハロウィン p=17、文化の日 p=20、勤労感謝の日 p=40
  const state = newGame(testMatch({ D: 50, p0: 25, baseDay: dayNum(2026, 10, 14) }));
  assert.equal(state.events[17].name, 'お菓子');
  assert.equal(state.events[20].effect, 'adjust');
  assert.equal(state.events[40].effect, 'rest');
  assert.equal(state.events[17].used, false);
  assert.equal(state.events[17].day, dayNum(2026, 10, 31));
  assert.equal(Object.keys(state.events).length, 3);
});

test('computeFlips: 普通のオセロと同じく挟んだ石を返す', () => {
  const state = newGame(testMatch());
  assert.deepEqual(computeFlips(state.board, at(2, 3), 'B'), [at(3, 3)]);
});

test('computeFlips: 挟めないマスでは返る石がない', () => {
  const state = newGame(testMatch());
  assert.deepEqual(computeFlips(state.board, at(0, 0), 'B'), []);
});

test('computeFlips: 8方向をまとめて返す', () => {
  const board = boardFrom([
    '........',
    '.B.B.B..',
    '..WWW...',
    '.BW.WB..',
    '..WWW...',
    '.B.B.B..',
    '........',
    '........',
  ]);
  assert.equal(computeFlips(board, at(3, 3), 'B').length, 8);
});

test('computeFlips: 相手の固定石は壁になり、その方向は返せない', () => {
  assert.deepEqual(computeFlips(boardFrom(rowsWith('.WwB....')), at(3, 0), 'B'), []);
});

test('computeFlips: 自分の固定石は挟む端として使える', () => {
  assert.deepEqual(computeFlips(boardFrom(rowsWith('.WWb....')), at(3, 0), 'B'), [at(3, 1), at(3, 2)]);
});

test('previewMove: 日数調整は裏返る石があるときだけ選ぶ', () => {
  const state = stateWith();
  state.pending.B.adjust = true;
  assert.equal(previewMove(state, at(2, 3)).needsAdjust, true);
  assert.equal(previewMove(state, at(0, 0)).needsAdjust, false);
});

test('moveDays: 黒は過去へ(-1)、白は未来へ(+1)', () => {
  assert.deepEqual(moveDays(5, NONE, 'B'), { days: 5, dir: -1 });
  assert.deepEqual(moveDays(5, NONE, 'W'), { days: 5, dir: 1 });
});

test('moveDays: 2倍 → +3 → 調整 の順に計算する', () => {
  assert.equal(moveDays(5, { ...NONE, double: true, plus3: true }, 'B').days, 13);
  assert.equal(moveDays(5, { ...NONE, double: true, plus3: true, adjust: true }, 'B', -3).days, 10);
});

test('moveDays: 調整は -3〜+3 に収め、0日未満にならない', () => {
  assert.equal(moveDays(2, { ...NONE, adjust: true }, 'W', -3).days, 0);
  assert.equal(moveDays(2, { ...NONE, adjust: true }, 'W', 9).days, 5);
});

test('moveDays: 調整の効果がなければ調整値は無視する', () => {
  assert.equal(moveDays(5, NONE, 'B', 3).days, 5);
});

test('moveDays: おやすみは0日、うそは向きが逆', () => {
  assert.equal(moveDays(5, { ...NONE, double: true, rest: true }, 'B').days, 0);
  assert.deepEqual(moveDays(5, { ...NONE, reverse: true }, 'B'), { days: 5, dir: 1 });
});

test('moveDays: 1枚も返らなければ効果があっても0日', () => {
  assert.equal(moveDays(0, { ...NONE, plus3: true, double: true }, 'B').days, 0);
});

test('playMove: 置いた石と返した石、日付の移動、手番交代', () => {
  const state = stateWith({ D: 20, p: 10 });
  const next = playMove(state, at(2, 3));
  assert.equal(next.board[at(2, 3)].color, 'B');
  assert.equal(next.board[at(2, 3)].flips, 0);
  assert.equal(next.board[at(3, 3)].color, 'B');
  assert.equal(next.board[at(3, 3)].flips, 1);
  assert.equal(next.p, 9);
  assert.equal(next.turn, 'W');
  assert.deepEqual(next.lastMove.flips, [at(3, 3)]);
  assert.equal(state.p, 10, '元の状態は変えない');
  assert.equal(state.board[at(3, 3)].color, 'W', '元の盤面は変えない');
});

test('playMove: 仕様の例(黒の誕生日の2日後から5日分で、跳ね返って3日後)', () => {
  const state = stateWith({ D: 50, p: 2, rows: rowsWith('.WWWWWB.') });
  const next = playMove(state, at(3, 0));
  assert.equal(next.lastMove.base, 5);
  assert.equal(next.p, 3);
});

test('playMove: 石の重さの合計だけ動き、返した石は重くなる', () => {
  const state = stateWith({ D: 40, p: 20, s: 2, rows: rowsWith('.WWB....') });
  state.board[at(3, 1)].flips = 2;
  const next = playMove(state, at(3, 0));
  assert.equal(next.lastMove.base, 6);
  assert.equal(next.p, 14);
  assert.equal(next.board[at(3, 1)].flips, 3);
  assert.equal(stoneWeight(next.board[at(3, 1)], 2), 7);
});

test('playMove: 返せない場所にも置け、日付は動かず、効果は使い切る', () => {
  const state = stateWith({ p: 10 });
  state.pending.B.plus3 = true;
  const next = playMove(state, at(0, 0));
  assert.equal(next.board[at(0, 0)].color, 'B');
  assert.equal(next.p, 10);
  assert.equal(next.pending.B.plus3, false);
  assert.equal(next.turn, 'W');
});

test('playMove: 石があるマスには置けない', () => {
  const state = stateWith();
  assert.equal(playMove(state, at(3, 3)), state);
});

test('playMove: 黒が黒の誕生日にぴったり止めたら黒の勝ち', () => {
  const state = stateWith({ D: 20, p: 1, rows: rowsWith('.WB.....') });
  const next = playMove(state, at(3, 0));
  assert.equal(next.p, 0);
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result, { winner: 'B', reason: 'birthday' });
});

test('playMove: 白の手でも、黒の誕生日に止まれば黒の勝ち', () => {
  const state = stateWith({ D: 20, p: 1, turn: 'W', rows: rowsWith('.BW.....') });
  state.pending.W.reverse = true;
  const next = playMove(state, at(3, 0));
  assert.equal(next.p, 0);
  assert.deepEqual(next.result, { winner: 'B', reason: 'birthday' });
});

test('playMove: 跳ね返りで反対側の誕生日に止まったら、その誕生日の人の勝ち', () => {
  const state = stateWith({ D: 4, p: 1, rows: rowsWith('.WWWWWB.') });
  const next = playMove(state, at(3, 0));
  assert.equal(next.p, 4);
  assert.deepEqual(next.result, { winner: 'W', reason: 'birthday' });
});

test('playMove: 最後の空きマスを埋めたら、誕生日までの残り日数で判定する', () => {
  const state = stateWith({ D: 20, p: 8, rows: ['.BBBBBBB', ...Array(7).fill('BBBBBBBB')] });
  const next = playMove(state, at(0, 0));
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result, { winner: 'B', reason: 'full' });
});

test('judgeFull: 残り日数が少ない方の勝ち', () => {
  const state = stateWith({ D: 20, p: 15 });
  assert.deepEqual(judgeFull(state), { winner: 'W', reason: 'full' });
});

test('judgeFull: 残り日数が同じなら石の数、それも同じなら引き分け', () => {
  const half = [...Array(4).fill('BBBBBBBB'), ...Array(4).fill('WWWWWWWW')];
  const draw = stateWith({ D: 20, p: 10, rows: half });
  assert.deepEqual(countStones(draw), { B: 32, W: 32 });
  assert.deepEqual(judgeFull(draw), { winner: null, reason: 'full' });
  const blackMore = stateWith({ D: 20, p: 10, rows: [...Array(4).fill('BBBBBBBB'), 'BWWWWWWW', ...Array(3).fill('WWWWWWWW')] });
  assert.deepEqual(judgeFull(blackMore), { winner: 'B', reason: 'full' });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: FAIL(`Cannot find module '.../js/rules.js'`)

- [ ] **Step 3: rules.js を実装する**

**人間の担当(学習ポイント):** `reflect(x, D)` は、このゲームの元の発案(誕生日を通り越したら跳ね返る)の中心です。実行時は、テストを書いた状態で人間のパートナーにこの関数(5〜10行)を書いてもらうよう依頼する。「何度でも跳ね返るのをループで書くか、周期 2D の剰余で書くか」が考えどころ。サブエージェントで実行する場合は、コントローラーがディスパッチ前に人間へ依頼する。人間が辞退した場合は、下の参考実装を使う。

`js/rules.js`:

```js
import { listEventDays } from './events.js';

export const SIZE = 8;
const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export const opponent = (color) => (color === 'B' ? 'W' : 'B');

// 石の重さ = 次に裏返ったときに日付を何日動かすか
export function stoneWeight(stone, s) {
  return 1 + stone.flips * s;
}

// 位置 x を 0〜D の範囲へ跳ね返らせる(何度でも)
export function reflect(x, D) {
  const period = 2 * D;
  const r = ((x % period) + period) % period;
  return r > D ? period - r : r;
}

function emptyPending() {
  return { double: false, plus3: false, adjust: false, rest: false, reverse: false };
}

// match: setupMatch の戻り値
export function newGame(match) {
  const board = Array(SIZE * SIZE).fill(null);
  const put = (r, c, color) => { board[r * SIZE + c] = { color, flips: 0, fixed: false }; };
  put(3, 3, 'W');
  put(4, 4, 'W');
  put(3, 4, 'B');
  put(4, 3, 'B');
  const events = {};
  for (const { day, event } of listEventDays(match.baseDay + 1, match.baseDay + match.D - 1)) {
    const p = day - match.baseDay;
    if (!events[p]) events[p] = { ...event, day, used: false };
  }
  return {
    match,
    board,
    events,
    turn: 'B',
    p: match.p0,
    pending: { B: emptyPending(), W: emptyPending() },
    phase: 'play',
    choice: null,
    lastMove: null,
    result: null,
  };
}

// idx に color の石を置いたときに裏返る石。相手の固定石は壁として働く。
export function computeFlips(board, idx, color) {
  if (board[idx]) return [];
  const r0 = Math.floor(idx / SIZE);
  const c0 = idx % SIZE;
  const result = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      const stone = board[r * SIZE + c];
      if (!stone) break;
      if (stone.color === color) {
        result.push(...line);
        break;
      }
      if (stone.fixed) break;
      line.push(r * SIZE + c);
      r += dr;
      c += dc;
    }
  }
  return result;
}

// 打つ前の確認: 裏返る石、基本の移動日数、日数調整の選択が必要か
export function previewMove(state, idx) {
  const flips = computeFlips(state.board, idx, state.turn);
  const base = flips.reduce((sum, i) => sum + stoneWeight(state.board[i], state.match.s), 0);
  return { flips, base, needsAdjust: state.pending[state.turn].adjust && base > 0 };
}

// 移動日数と向き。計算順: 基本 → 2倍 → +3 → 調整 → おやすみ → うそ
export function moveDays(base, pending, color, adjust = 0) {
  let days = 0;
  if (base > 0) {
    days = base;
    if (pending.double) days *= 2;
    if (pending.plus3) days += 3;
    if (pending.adjust) days = Math.max(0, days + Math.max(-3, Math.min(3, adjust)));
    if (pending.rest) days = 0;
  }
  let dir = color === 'B' ? -1 : 1;
  if (pending.reverse) dir = -dir;
  return { days, dir };
}

export function playMove(state, idx, adjust = 0) {
  if (state.phase !== 'play' || state.board[idx]) return state;
  const next = structuredClone(state);
  const color = next.turn;
  const { flips, base } = previewMove(next, idx);
  next.board[idx] = { color, flips: 0, fixed: false };
  for (const i of flips) {
    next.board[i].color = color;
    next.board[i].flips += 1;
  }
  const { days, dir } = moveDays(base, next.pending[color], color, adjust);
  next.pending[color] = emptyPending();
  const fromP = next.p;
  next.p = reflect(fromP + dir * days, next.match.D);
  next.lastMove = { color, idx, flips, base, days, dir, fromP, toP: next.p, event: null, fizzled: false };

  if (next.p === 0 || next.p === next.match.D) {
    next.phase = 'over';
    next.result = { winner: next.p === 0 ? 'B' : 'W', reason: 'birthday' };
    return next;
  }
  return finishTurn(next, false);
}

// 盤面が埋まっていれば判定で終局、そうでなければ次の手番へ
function finishTurn(state, extraTurn) {
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

// 盤面が埋まったときの判定: 誕生日までの残り日数 → 石の数 → 引き分け
export function judgeFull(state) {
  const blackLeft = state.p;
  const whiteLeft = state.match.D - state.p;
  if (blackLeft !== whiteLeft) return { winner: blackLeft < whiteLeft ? 'B' : 'W', reason: 'full' };
  const { B, W } = countStones(state);
  if (B !== W) return { winner: B > W ? 'B' : 'W', reason: 'full' };
  return { winner: null, reason: 'full' };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: すべて pass、fail 0

- [ ] **Step 5: コミット**

```bash
git add js/rules.js tests/rules.test.js
git commit -m "$(cat <<'EOF'
Add core rules: flips, weights, date movement, win checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ルール本体(イベント効果)

**Files:**
- Modify: `js/rules.js`(playMove の末尾、finishTurn、関数を3つ追加)
- Test: `tests/rules.test.js`(末尾に追記)

**Interfaces:**
- Consumes: Task 3 の State と関数
- Produces:
  - `choiceTargets(state) → number[]`(choose 中に選べるマス。それ以外は [])
  - `applyChoice(state, idx) → State`(選べないマスなら同じ state をそのまま返す)
  - playMove が、イベントの発動(`lastMove.event`、`lastMove.fizzled`、`lastMove.warpTo`)、`phase: 'choose'`、もう一手を扱うようになる

- [ ] **Step 1: 失敗するテストを書く**

`tests/rules.test.js` の import を次に置き換える:

```js
import {
  reflect, stoneWeight, newGame, computeFlips, previewMove, moveDays, playMove, countStones, judgeFull,
  choiceTargets, applyChoice,
} from '../js/rules.js';
```

`tests/rules.test.js` の末尾に追記する:

```js
const ev = (effect, extra = {}) => ({ occasion: 'テスト', name: 'テスト', effect, day: 0, used: false, ...extra });

test('イベント: ぴったり止まった人に発動し、使用済みになる', () => {
  const state = stateWith({ p: 10, events: { 9: ev('plus3') } });
  const next = playMove(state, at(2, 3));
  assert.equal(next.lastMove.event.effect, 'plus3');
  assert.equal(next.events[9].used, true);
  assert.equal(next.pending.B.plus3, true);
  assert.equal(next.turn, 'W');
});

test('イベント: 使用済みのイベントは発動しない', () => {
  const state = stateWith({ p: 10, events: { 9: ev('plus3', { used: true }) } });
  const next = playMove(state, at(2, 3));
  assert.equal(next.lastMove.event, null);
  assert.equal(next.pending.B.plus3, false);
});

test('イベント: 日付が動かなかった手では発動しない', () => {
  const state = stateWith({ p: 10, events: { 10: ev('plus3') } });
  const next = playMove(state, at(0, 0));
  assert.equal(next.lastMove.event, null);
  assert.equal(next.events[10].used, false);
});

test('イベント: 誕生日に止まったらイベントより勝利が優先', () => {
  const state = stateWith({ p: 1, events: { 0: ev('plus3') } });
  const next = playMove(state, at(2, 3));
  assert.deepEqual(next.result, { winner: 'B', reason: 'birthday' });
  assert.equal(next.events[0].used, false);
});

test('イベント: おやすみは相手の次の手に付き、日付が動かない', () => {
  const state = stateWith({ p: 10, events: { 9: ev('rest') } });
  const mid = playMove(state, at(2, 3));
  assert.equal(mid.pending.W.rest, true);
  const next = playMove(mid, at(2, 2));
  assert.equal(next.lastMove.base, 2);
  assert.equal(next.p, 9);
  assert.equal(next.pending.W.rest, false);
});

test('イベント: うそは相手の次の手の向きを逆にする', () => {
  const state = stateWith({ p: 10, events: { 9: ev('reverse') } });
  const mid = playMove(state, at(2, 3));
  const next = playMove(mid, at(2, 2));
  assert.equal(next.p, 7);
});

test('イベント: もう一手なら同じ人の番が続く', () => {
  const state = stateWith({ p: 10, events: { 9: ev('extraTurn') } });
  assert.equal(playMove(state, at(2, 3)).turn, 'B');
});

test('イベント: 真ん中へで floor(D/2) に飛び、飛んだ先では発動しない', () => {
  const state = stateWith({ D: 21, p: 10, events: { 9: ev('middle'), 10: ev('plus3') } });
  const next = playMove(state, at(2, 3));
  assert.equal(next.p, 10);
  assert.equal(next.lastMove.warpTo, 10);
  assert.equal(next.events[10].used, false);
  assert.equal(next.pending.B.plus3, false);
  assert.equal(next.turn, 'W');
});

test('イベント: 重さリセットで全部の石の裏返り回数が0になる', () => {
  const state = stateWith({ p: 10, events: { 9: ev('resetWeights') } });
  state.board[at(3, 4)].flips = 3;
  const next = playMove(state, at(2, 3));
  assert.ok(next.board.filter(Boolean).every((stone) => stone.flips === 0));
});

test('イベント: 鬼は外は相手の石を選んで取り除く', () => {
  const state = stateWith({ p: 10, events: { 9: ev('remove') } });
  const mid = playMove(state, at(2, 3));
  assert.equal(mid.phase, 'choose');
  assert.equal(mid.turn, 'B');
  assert.deepEqual(choiceTargets(mid), [at(4, 4)]);
  const next = applyChoice(mid, at(4, 4));
  assert.equal(next.board[at(4, 4)], null);
  assert.equal(next.phase, 'play');
  assert.equal(next.choice, null);
  assert.equal(next.turn, 'W');
});

test('イベント: 選べないマスを選んでも何も起きない', () => {
  const state = stateWith({ p: 10, events: { 9: ev('remove') } });
  const mid = playMove(state, at(2, 3));
  assert.equal(applyChoice(mid, at(0, 0)), mid);
});

test('イベント: 固定は自分の石を固定し、以後は裏返らない', () => {
  const state = stateWith({ p: 10, events: { 9: ev('fix') } });
  const mid = playMove(state, at(2, 3));
  assert.deepEqual(choiceTargets(mid), [at(2, 3), at(3, 3), at(3, 4), at(4, 3)]);
  assert.deepEqual(computeFlips(mid.board, at(2, 4), 'W'), [at(3, 4)]);
  const next = applyChoice(mid, at(3, 4));
  assert.equal(next.board[at(3, 4)].fixed, true);
  assert.deepEqual(computeFlips(next.board, at(2, 4), 'W'), []);
});

test('イベント: 奪うは相手の石を自分の色にし、重さは変わらない', () => {
  const state = stateWith({ p: 10, events: { 9: ev('steal') } });
  state.board[at(4, 4)].flips = 2;
  const next = applyChoice(playMove(state, at(2, 3)), at(4, 4));
  assert.equal(next.board[at(4, 4)].color, 'B');
  assert.equal(next.board[at(4, 4)].flips, 2);
});

test('イベント: 植えるは空きマスに自分の石を置く', () => {
  const state = stateWith({ p: 10, events: { 9: ev('plant') } });
  const mid = playMove(state, at(2, 3));
  assert.equal(choiceTargets(mid).length, 59);
  const next = applyChoice(mid, at(0, 0));
  assert.deepEqual(next.board[at(0, 0)], { color: 'B', flips: 0, fixed: false });
});

test('イベント: 選べる対象がなければ不発で、次の手番へ進む', () => {
  const rows = rowsWith('.WB.....').map((row, i) => (i === 0 ? 'w.......' : row));
  const state = stateWith({ p: 10, rows, events: { 9: ev('steal') } });
  const next = playMove(state, at(3, 0));
  assert.equal(next.lastMove.fizzled, true);
  assert.equal(next.phase, 'play');
  assert.equal(next.choice, null);
  assert.equal(next.turn, 'W');
});

test('イベント: 植えるで最後の空きマスが埋まったら判定で終局', () => {
  const rows = ['.WBBBBB.', ...Array(7).fill('BBBBBBBB')];
  const state = stateWith({ D: 20, p: 10, rows, events: { 9: ev('plant') } });
  const mid = playMove(state, at(0, 0));
  assert.deepEqual(choiceTargets(mid), [at(0, 7)]);
  const next = applyChoice(mid, at(0, 7));
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result, { winner: 'B', reason: 'full' });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: FAIL(`choiceTargets` / `applyChoice` が export されていない、またはイベント関連のアサーションが失敗)

- [ ] **Step 3: rules.js にイベント処理を加える**

`js/rules.js` の `newGame` の上(`emptyPending` の下)に定数を追加する:

```js
const SELF_EFFECTS = ['double', 'plus3', 'adjust'];
const OPPONENT_EFFECTS = ['rest', 'reverse'];
const CHOICE_EFFECTS = ['remove', 'fix', 'steal', 'plant'];
```

`playMove` の最後の1行 `return finishTurn(next, false);` を次に置き換える:

```js
  let extraTurn = false;
  const event = days > 0 ? next.events[next.p] : null;
  if (event && !event.used) {
    event.used = true;
    next.lastMove.event = { ...event };
    extraTurn = applyEffect(next, event.effect, color);
  }
  return finishTurn(next, extraTurn);
```

`finishTurn` を次に置き換える:

```js
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
```

`finishTurn` の下に追加する:

```js
// 効果を適用する(state を直接書き換える)。もう一手なら true を返す。
function applyEffect(state, effect, color) {
  if (SELF_EFFECTS.includes(effect)) {
    state.pending[color][effect] = true;
  } else if (OPPONENT_EFFECTS.includes(effect)) {
    state.pending[opponent(color)][effect] = true;
  } else if (effect === 'extraTurn') {
    return true;
  } else if (effect === 'middle') {
    state.p = Math.floor(state.match.D / 2);
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

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: すべて pass、fail 0

- [ ] **Step 5: コミット**

```bash
git add js/rules.js tests/rules.test.js
git commit -m "$(cat <<'EOF'
Add event effects to rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 画面の基本(設定画面・盤面・打つ操作)とスモークテスト

**Files:**
- Create: `tools/serve.mjs`
- Create: `tools/smoke.mjs`
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/ui.js`
- Create: `js/main.js`

**Interfaces:**
- Consumes: Task 1〜4 の関数すべて
- Produces:
  - `tools/serve.mjs`: `startServer(port) → Promise<http.Server>`。直接実行すると 8000 番で配信。
  - `tools/smoke.mjs`: `npm run smoke` で実行。`SMOKE_URL` があればそのURLを、なければ自前のサーバーを使う。失敗があれば終了コード 1。スクリーンショットを `tools/screenshots/` に保存。
  - `js/ui.js`: `playerOf(state, color)`, `dateOf(state, p?)`, `formatLong(day)`, `fillMonthSelect(select)`, `fillDaySelect(select, month)`, `renderSetupPreview(match)`, `renderGame(state, { shownP }?)`
  - DOM の約束(スモークテストと Task 6 が使う): `#setup-form`(name1/month1/day1/name2/month2/day2/start)、`#setup-preview`、`#game`、`#today-date`、`#status-black .pl-left`、`#status-white .pl-left`、`#turn-msg`、`#board .cell[data-idx]`、`.cell.has-stone`、`.cell.target`、`.stone`、`#adjust`、`#event-dialog`、`#result-dialog`、`#rules-dialog`、`#rules-events`、`[data-action="rules"]`、`[data-action="quit"]`、`document.body.dataset.busy`('1' のあいだは処理中)

- [ ] **Step 1: 開発用サーバーを作る**

`tools/serve.mjs`:

```js
// 開発用の静的ファイルサーバー。ES モジュールは file:// では動かないため、http で配信する。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function startServer(port) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServer(8000);
  console.log('http://localhost:8000/ で配信中(Ctrl+C で終了)');
}
```

- [ ] **Step 2: 失敗するスモークテストを書く**

`tools/smoke.mjs`:

```js
// ヘッドレス Chrome で画面を開いて操作し、エラーがないことを確かめ、スクリーンショットを保存する。
// 使い方: npm run smoke(公開版を確かめるときは SMOKE_URL=https://... npm run smoke)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
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
  // 1. スマホ幅: 設定 → 序盤の3手
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  const preview = await js(`document.querySelector('#setup-preview').textContent`);
  check(
    preview.includes('黒: たろう(10/14)') && preview.includes('白: はなこ(12/3)')
      && preview.includes('間は50日') && preview.includes('+2'),
    `設定の確認文が想定と違います: ${preview}`,
  );
  check(await noHorizontalScroll(), '設定画面(390px)が横にスクロールします');
  await shot('phone-setup');
  await startFromSetup();
  const before = await todayText();
  for (const idx of [19, 18, 37]) {
    await clickCell(idx);
    await settled();
  }
  check(await stoneCount() === 7, `3手打った後の石の数が7ではありません: ${await stoneCount()}`);
  check(await todayText() !== before, `打っても日付が変わっていません: ${before}`);
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
    cell(19).click(); cell(19).click(); cell(20).click();
  })()`);
  await settled();
  check(await stoneCount() === 5, `連打で2手以上打てています: 石の数 ${await stoneCount()}`);
  check(await noHorizontalScroll(), '対戦画面(320px)が横にスクロールします');
  await shot('small-game');

  // 3. PC 幅
  await open(1280, 800);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  await startFromSetup();
  await shot('pc-game');
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

const clickCell = (idx) => js(`document.querySelector('#board .cell[data-idx="${idx}"]').click()`);
const settled = () => waitFor(
  `document.body.dataset.busy !== '1' || document.querySelector('dialog[open]') || !document.querySelector('#adjust').hidden`,
);
const stoneCount = () => js(`document.querySelectorAll('#board .stone').length`);
const todayText = () => js(`document.querySelector('#today-date').textContent`);
const noHorizontalScroll = () => js(`document.documentElement.scrollWidth <= window.innerWidth`);

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(new URL(`${name}.png`, OUT), Buffer.from(data, 'base64'));
}

function check(ok, message) {
  if (!ok) failures.push(message);
}
```

- [ ] **Step 3: スモークテストが失敗することを確かめる**

Run: `npm run smoke`
Expected: 終了コード 1、`NG: スモークテストが途中で止まりました: ...` と、`/` が 404 になったことによる NG が出る(index.html がまだないため)

- [ ] **Step 4: index.html を作る**

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
        <p class="today"><span class="today-label">今日</span><span id="today-date"></span></p>
        <div class="players">
          <div id="status-black" class="pl black"></div>
          <div id="status-white" class="pl white"></div>
        </div>
        <p id="turn-msg" class="turn-msg" aria-live="polite"></p>
      </header>
      <div id="board" class="board"></div>
      <div id="adjust" class="adjust card" hidden></div>
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
      <li>空いているマスならどこにでも置けます。挟んだ相手の石は、普通のオセロと同じく裏返ります。</li>
      <li>裏返った石の数字(重さ)の合計だけ日付が動きます。黒は過去へ、白は未来へ動かします。</li>
      <li>石は裏返るたびに重くなります。</li>
      <li>誕生日を通り越したら、通り越した分だけ跳ね返ります。</li>
      <li>日付が誕生日にぴったり止まったら、その誕生日の人の勝ちです(どちらが動かしても)。</li>
      <li>盤面が埋まったら、誕生日までの残り日数が少ない方の勝ち。同じなら石の数で決めます。</li>
      <li>祝日や行事の日にぴったり止めると、イベントが起きます(1試合に1回ずつ)。</li>
    </ul>
    <h3>イベント</h3>
    <ul id="rules-events" class="rules-events"></ul>
    <form method="dialog"><button value="ok" class="primary">閉じる</button></form>
  </dialog>
</body>
</html>
```

- [ ] **Step 5: style.css を作る**

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
  --bday-black: #ddd6f3;
  --bday-white: #cdeefa;
  --stone-black: #2b2523;
  --stone-white: #fdfdfd;
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
.players { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pl { border: 2px solid var(--line); border-radius: var(--radius); padding: 6px 8px; display: flex; flex-direction: column; font-size: 0.85rem; background: var(--card); min-width: 0; }
.pl.black { border-left: 6px solid var(--stone-black); }
.pl.white { border-left: 6px solid #cfc6bd; }
.pl.active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(232, 106, 146, 0.2); }
.pl-name { font-weight: bold; font-size: 1rem; overflow-wrap: anywhere; }
.pl-left { font-weight: bold; }
.pl-effects { color: var(--accent); font-size: 0.8rem; }
.turn-msg { text-align: center; margin: 8px 0 0; font-weight: bold; min-height: 1.5em; }

.board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
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
  padding: 0 0 6% 0;
  border: 0;
  background: var(--cell);
  display: grid;
  align-items: end;
  justify-items: center;
  touch-action: manipulation;
}
.cell .date { position: absolute; top: 2px; left: 3px; font-size: clamp(0.5rem, 2.2vw, 0.7rem); color: var(--muted); line-height: 1; }
.cell.event { background: var(--event); }
.cell.event::after { content: ""; position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: #ff9f1c; }
.cell.event-used { background: var(--event-used); }
.cell.bday-black { background: var(--bday-black); }
.cell.bday-white { background: var(--bday-white); }
.cell.today { box-shadow: inset 0 0 0 3px var(--today); }
.cell.target { box-shadow: inset 0 0 0 3px var(--accent); animation: pulse 0.8s infinite alternate; }
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
.stone.flip { animation: flip 0.35s ease; }
.stone.placed { animation: drop 0.25s ease; }
@keyframes flip { 0% { transform: rotateY(0); } 50% { transform: rotateY(90deg); } 100% { transform: rotateY(0); } }
@keyframes drop { from { transform: scale(1.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes pulse { from { box-shadow: inset 0 0 0 2px var(--accent); } to { box-shadow: inset 0 0 0 4px var(--accent); } }

.adjust { margin-top: 12px; text-align: center; }
.adjust-title { display: block; font-weight: bold; margin-bottom: 8px; }
.adjust-row { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.adjust-row button { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 6px 8px; }
.game-footer { display: flex; justify-content: space-between; margin-top: 8px; }

/* ダイアログ */
dialog { max-width: min(92vw, 420px); text-align: center; position: relative; overflow: hidden; color: var(--ink); }
dialog::backdrop { background: rgba(58, 46, 42, 0.45); }
.event-player { color: var(--accent); font-weight: bold; margin: 0; }
#rules-dialog { text-align: left; max-height: 85vh; overflow-y: auto; }
.rules, .rules-events { padding-left: 1.2em; }
.rules-events { font-size: 0.85rem; }
.actions { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.actions button:not(.primary) { background: none; border: 0; text-decoration: underline; color: var(--muted); }
.cake { width: 120px; height: 100px; }
#result-dialog.draw .cake { opacity: 0.4; }
.confetti { position: absolute; inset: 0; pointer-events: none; }
.confetti span { position: absolute; top: -12px; width: 8px; height: 12px; border-radius: 2px; animation: fall linear forwards; }
@keyframes fall { to { transform: translateY(110vh) rotate(540deg); } }

@media (prefers-reduced-motion: reduce) {
  .stone.flip, .stone.placed, .cell.target, .confetti span { animation: none; }
}
```

- [ ] **Step 6: ui.js(描画)を作る**

`js/ui.js`:

```js
import { boardDates, formatMD, fromDayNum } from './dates.js';
import { choiceTargets, stoneWeight } from './rules.js';
import { EFFECTS } from './events.js';

const $ = (selector) => document.querySelector(selector);
const COLOR_NAME = { B: '黒', W: '白' };
const CHOICE_PROMPT = {
  remove: '取り除く相手の石を選んでください',
  fix: '固定する自分の石を選んでください',
  steal: '自分の色にする相手の石を選んでください',
  plant: '石を置く空きマスを選んでください',
};

export const playerOf = (state, color) => (color === 'B' ? state.match.black : state.match.white);
export const dateOf = (state, p = state.p) => state.match.baseDay + p;

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
  const button = $('#setup-form button[type=submit]');
  preview.classList.toggle('error', Boolean(match.error));
  button.disabled = Boolean(match.error);
  if (match.error) {
    preview.textContent = match.error;
    return;
  }
  const { black, white } = match;
  const pair = match.sameBirthday
    ? `同じ誕生日(${formatMD(black.day)})なので、黒白は開始時にランダムで決まります。`
    : `黒: ${black.name}(${formatMD(black.day)}) 白: ${white.name}(${formatMD(white.day)})`;
  preview.textContent = `${pair} 間は${match.D}日、石の増え方は+${match.s}`;
}

// ---- 対戦画面 ----

// shownP: 表示する日付の位置(演出中に途中の日付を出すため)
export function renderGame(state, { shownP = state.p } = {}) {
  const today = dateOf(state, shownP);
  $('#today-date').textContent = formatLong(today);
  renderPlayerStatus($('#status-black'), state, 'B', shownP);
  renderPlayerStatus($('#status-white'), state, 'W', shownP);
  $('#turn-msg').textContent = turnMessage(state);
  renderBoard(state, today);
}

function renderPlayerStatus(el, state, color, shownP) {
  const player = playerOf(state, color);
  const left = color === 'B' ? shownP : state.match.D - shownP;
  const effects = Object.entries(state.pending[color])
    .filter(([, on]) => on)
    .map(([id]) => EFFECTS[id].name);
  el.classList.toggle('active', state.phase !== 'over' && state.turn === color);
  el.replaceChildren(
    span('pl-name', `${COLOR_NAME[color]} ${player.name}`),
    span('pl-bday', `誕生日 ${formatMD(player.day)}`),
    span('pl-left', `あと${left}日`),
  );
  if (effects.length) el.append(span('pl-effects', `次の手: ${effects.join('・')}`));
}

function turnMessage(state) {
  if (state.phase === 'over') return '対戦終了';
  const player = playerOf(state, state.turn);
  const who = `${player.name}(${COLOR_NAME[state.turn]})`;
  if (state.phase === 'choose') return `${who}: ${CHOICE_PROMPT[state.choice.effect]}`;
  return `${who}の番です`;
}

function renderBoard(state, today) {
  const { match } = state;
  const eventByDay = new Map(Object.values(state.events).map((ev) => [ev.day, ev]));
  const targets = new Set(state.phase === 'choose' ? choiceTargets(state) : []);
  const cells = boardDates(today).map((day, idx) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.idx = String(idx);
    const { d } = fromDayNum(day);
    cell.append(span('date', idx === 0 || d === 1 ? formatMD(day) : String(d)));
    if (day === today) cell.classList.add('today');
    if (day === match.black.day) cell.classList.add('bday-black');
    if (day === match.white.day) cell.classList.add('bday-white');
    const ev = eventByDay.get(day);
    if (ev) cell.classList.add(ev.used ? 'event-used' : 'event');
    if (targets.has(idx)) cell.classList.add('target');
    const stone = state.board[idx];
    if (stone) {
      cell.classList.add('has-stone');
      const classes = ['stone', stone.color === 'B' ? 'black' : 'white'];
      if (stone.fixed) classes.push('fixed');
      cell.append(span(classes.join(' '), String(stoneWeight(stone, match.s))));
    }
    if (state.lastMove?.idx === idx) cell.classList.add('last');
    const stoneLabel = stone ? `${COLOR_NAME[stone.color]}の石` : '空き';
    cell.setAttribute('aria-label', `${formatMD(day)} ${stoneLabel}`);
    return cell;
  });
  $('#board').replaceChildren(...cells);
}
```

- [ ] **Step 7: main.js を作る**

`js/main.js`:

```js
import { dayNum, defaultStart, fromDayNum, parseISODate, setupMatch, toISODate } from './dates.js';
import { applyChoice, newGame, playMove } from './rules.js';
import { fillDaySelect, fillMonthSelect, renderGame, renderSetupPreview } from './ui.js';

const form = document.querySelector('#setup-form');
const setupScreen = document.querySelector('#setup');
const gameScreen = document.querySelector('#game');
const boardEl = document.querySelector('#board');

let state = null;
let busy = false;

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
  state = newGame(match);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame(state);
}

function backToSetup() {
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

boardEl.addEventListener('click', async (e) => {
  const cell = e.target.closest('.cell');
  if (!cell || busy || !state) return;
  const idx = Number(cell.dataset.idx);
  if (state.phase === 'choose') {
    const next = applyChoice(state, idx);
    if (next === state) return;
    await run(async () => {
      state = next;
      renderGame(state);
    });
  } else if (state.phase === 'play' && !state.board[idx]) {
    await run(async () => {
      state = playMove(state, idx);
      renderGame(state);
    });
  }
});

document.querySelector('[data-action="quit"]').addEventListener('click', () => {
  if (window.confirm('対戦をやめて設定画面に戻りますか?')) backToSetup();
});

initSetup();
```

- [ ] **Step 8: スモークテストと単体テストが通ることを確かめる**

Run: `npm run smoke && npm test`
Expected: `OK: スクリーンショットを .../tools/screenshots/ に保存しました`、単体テストはすべて pass

- [ ] **Step 9: スクリーンショットを目で確かめる**

`tools/screenshots/phone-setup.png`、`phone-game.png`、`small-game.png`、`pc-game.png` を開き、次を確認する。
- 盤面のマスの隅に日付が出て、今日・イベント日・2人の誕生日のマスが色分けされている。
- 石に重さの数字が出ている。
- 上部に今日の日付、2人の名前・誕生日・残り日数、手番が出ている。
- 320px 幅で、長い名前が枠からはみ出していない。

問題があれば css/style.css を直し、Step 8 からやり直す。

- [ ] **Step 10: コミット**

```bash
git add tools/serve.mjs tools/smoke.mjs index.html css/style.css js/ui.js js/main.js
git commit -m "$(cat <<'EOF'
Add setup and game screens with smoke test

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: イベント・日数調整・結果・ルールの画面と演出

**Files:**
- Modify: `js/ui.js`(import の置き換え、関数の追加)
- Modify: `js/main.js`(全体を置き換え)
- Modify: `tools/smoke.mjs`(シナリオの追加)

**Interfaces:**
- Consumes: Task 5 の ui.js / main.js / smoke.mjs、Task 3〜4 の `reflect`, `moveDays`, `countStones`, `previewMove`
- Produces:
  - `js/ui.js`: `animateMove(state) → Promise`, `chooseAdjust(base, pending, color) → Promise<number|null>`, `showEventDialog(state) → Promise`, `showResult(state) → Promise<'rematch'|'setup'|''>`, `showRules() → Promise`, `fillRulesEventList()`

- [ ] **Step 1: 失敗するスモークテストを書く**

`tools/smoke.mjs` の `scenarios()` の末尾(`await shot('pc-game');` の後)に追記する:

```js
  // 4. 日数調整の操作部品
  const adjust = await js(`(async () => {
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    const pending = { double: false, plus3: false, adjust: true, rest: false, reverse: false };
    const choice = ui.chooseAdjust(5, pending, 'B');
    const buttons = [...document.querySelectorAll('#adjust .adjust-row button')];
    const labels = buttons.map((b) => b.textContent);
    buttons[6].click();
    return { labels, value: await choice, hidden: document.querySelector('#adjust').hidden };
  })()`);
  check(
    adjust.labels.length === 7 && adjust.labels[0] === '-3(2日)' && adjust.labels[6] === '+3(8日)'
      && adjust.value === 3 && adjust.hidden,
    `日数調整の表示か選択がおかしいです: ${JSON.stringify(adjust)}`,
  );

  // 5. イベント: 10/28 と 11/5(開始 11/1)。黒の1手目で 10/31 ハロウィンに止まる
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 28 }, { name: 'はなこ', m: 11, d: 5 });
  await startFromSetup();
  await clickCell(19);
  await settled();
  check(await js(`document.querySelector('#event-dialog').open`), 'ハロウィンに止まってもイベントのポップアップが出ません');
  check((await js(`document.querySelector('#event-title').textContent`)).includes('ハロウィン'), 'イベント名がハロウィンではありません');
  await shot('phone-event');
  await js(`document.querySelector('#event-dialog button').click()`);
  await settled();
  check((await js(`document.querySelector('#status-black').textContent`)).includes('日数2倍'), '黒の次の手に「日数2倍」が表示されていません');
  for (const idx of [18, 37]) {
    await clickCell(idx);
    await settled();
  }
  check(await todayText() === '10月31日', `2倍が効いた後の日付が 10月31日 ではありません: ${await todayText()}`);

  // 6. 最後まで打って結果を出し、再戦 → 2回目は Esc 相当で閉じて設定に戻る
  check(await playToEnd(), '最後まで打っても結果が出ません');
  const title = await js(`document.querySelector('#result-title').textContent`);
  check(title.includes('お誕生日おめでとう') || title.includes('引き分け'), `結果の見出しがおかしいです: ${title}`);
  await shot('phone-result');
  await js(`document.querySelector('#result-dialog button[value=rematch]').click()`);
  // close イベントは非同期に届くので、盤面が作り直されるまで待つ
  await waitFor(`document.querySelectorAll('#board .stone').length === 4`, 3000).catch(() => {});
  check(await stoneCount() === 4, '再戦で盤面が初期状態になっていません');
  check(await playToEnd(), '再戦で最後まで打っても結果が出ません');
  await js(`document.querySelector('#result-dialog').close()`);
  await waitFor(`!document.querySelector('#setup').hidden`, 2000).catch(() => {});
  check(await js(`!document.querySelector('#setup').hidden`), 'ボタン以外で結果を閉じたとき設定画面に戻りません(前回の再戦が残っています)');

  // 7. 半年離れた誕生日で最後まで(大きな移動と演出の上限)
  await open(320, 640);
  await fillSetup({ name: 'あいうえおかきくけこ', m: 1, d: 1 }, { name: 'さしすせそたちつてと', m: 7, d: 1 });
  await startFromSetup();
  check(await playToEnd(), '半年離れた誕生日で最後まで打っても結果が出ません');
  await shot('small-result');

  // 8. ルール画面
  await js(`document.querySelector('#result-dialog button[value=setup]').click()`);
  await js(`document.querySelector('#setup [data-action="rules"]').click()`);
  check(await js(`document.querySelectorAll('#rules-events li').length`) === 23, 'ルール画面のイベント一覧が23件ではありません');
  await shot('small-rules');
```

`tools/smoke.mjs` の「操作の部品」の末尾に追記する:

```js
// 決着がつくまで打つ。ポップアップ・日数調整・選択は最初の選択肢で進める。
async function playToEnd() {
  for (let step = 0; step < 400; step++) {
    if (await js(`document.querySelector('#result-dialog').open`)) return true;
    if (await js(`document.querySelector('#event-dialog').open`)) {
      await js(`document.querySelector('#event-dialog button').click()`);
    } else if (await js(`!document.querySelector('#adjust').hidden`)) {
      await js(`document.querySelector('#adjust .adjust-row button').click()`);
    } else if (await js(`document.querySelector('#board .cell.target') !== null`)) {
      await js(`document.querySelector('#board .cell.target').click()`);
    } else {
      await js(`document.querySelector('#board .cell:not(.has-stone)').click()`);
    }
    await settled();
  }
  return false;
}
```

- [ ] **Step 2: スモークテストが失敗することを確かめる**

Run: `npm run smoke`
Expected: 終了コード 1。`ui.chooseAdjust is not a function`、またはイベントのポップアップが出ない、などの NG が出る。

- [ ] **Step 3: ui.js にダイアログと演出を加える**

`js/ui.js` の import 3行を次に置き換える:

```js
import { boardDates, formatMD, fromDayNum } from './dates.js';
import { choiceTargets, countStones, moveDays, reflect, stoneWeight } from './rules.js';
import { EFFECTS, EVENTS, ruleLabel } from './events.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
```

`js/ui.js` の末尾に追記する:

```js
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
  return openDialog($('#rules-dialog'));
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
  const left = `誕生日まで ${match.black.name} あと${state.p}日、${match.white.name} あと${match.D - state.p}日`;
  if (state.p !== match.D - state.p) return `盤面が埋まりました。${left}。`;
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

// ---- 日数調整 ----

// −3〜+3 のボタンを出し、選んだ値を返す。「別のマスにする」なら null。
export function chooseAdjust(base, pending, color) {
  const panel = $('#adjust');
  const row = document.createElement('div');
  row.className = 'adjust-row';
  panel.replaceChildren(span('adjust-title', '日数調整: 動く日数を選んでください'), row);
  panel.hidden = false;
  return new Promise((resolve) => {
    const finish = (value) => {
      panel.hidden = true;
      resolve(value);
    };
    for (let a = -3; a <= 3; a++) {
      const { days } = moveDays(base, pending, color, a);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${a > 0 ? '+' : ''}${a}(${days}日)`;
      button.addEventListener('click', () => finish(a));
      row.append(button);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link';
    cancel.textContent = '別のマスにする';
    cancel.addEventListener('click', () => finish(null));
    panel.append(cancel);
  });
}

// ---- 演出 ----

// 置いた石と裏返った石を動かしてから、日付を1日ずつ数えるように動かす(最大1.5秒程度)
export async function animateMove(state) {
  const move = state.lastMove;
  renderGame(state, { shownP: move.fromP });
  for (const idx of [move.idx, ...move.flips]) {
    $(`#board .cell[data-idx="${idx}"] .stone`)?.classList.add(idx === move.idx ? 'placed' : 'flip');
  }
  await sleep(350);
  if (move.days > 0) {
    const frames = Math.min(move.days, 30);
    const frameMs = Math.min(80, 1500 / frames);
    let bounced = false;
    for (let f = 1; f <= frames; f++) {
      const raw = move.fromP + move.dir * Math.round((f * move.days) / frames);
      bounced ||= raw < 0 || raw > state.match.D;
      showDate(state, reflect(raw, state.match.D), bounced);
      await sleep(frameMs);
    }
  }
  renderGame(state);
}

function showDate(state, p, bounced) {
  $('#today-date').textContent = formatLong(dateOf(state, p));
  $('#status-black .pl-left').textContent = `あと${p}日`;
  $('#status-white .pl-left').textContent = `あと${state.match.D - p}日`;
  if (bounced) $('#turn-msg').textContent = '跳ね返り!';
}
```

- [ ] **Step 4: main.js を置き換える**

`js/main.js`:

```js
import { dayNum, defaultStart, fromDayNum, parseISODate, setupMatch, toISODate } from './dates.js';
import { applyChoice, newGame, playMove, previewMove } from './rules.js';
import {
  animateMove, chooseAdjust, fillDaySelect, fillMonthSelect, fillRulesEventList,
  renderGame, renderSetupPreview, showEventDialog, showResult, showRules,
} from './ui.js';

const form = document.querySelector('#setup-form');
const setupScreen = document.querySelector('#setup');
const gameScreen = document.querySelector('#game');
const boardEl = document.querySelector('#board');

let state = null;
let busy = false;

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
  state = newGame(match);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame(state);
}

function backToSetup() {
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

async function finishGame() {
  const choice = await showResult(state);
  if (choice === 'rematch') startGame();
  else backToSetup();
}

boardEl.addEventListener('click', async (e) => {
  const cell = e.target.closest('.cell');
  if (!cell || busy || !state) return;
  const idx = Number(cell.dataset.idx);
  if (state.phase === 'choose') {
    const next = applyChoice(state, idx);
    if (next === state) return;
    await run(async () => {
      state = next;
      renderGame(state);
    });
  } else if (state.phase === 'play' && !state.board[idx]) {
    await run(async () => {
      const preview = previewMove(state, idx);
      let adjust = 0;
      if (preview.needsAdjust) {
        adjust = await chooseAdjust(preview.base, state.pending[state.turn], state.turn);
        if (adjust === null) return;
      }
      state = playMove(state, idx, adjust);
      await animateMove(state);
      if (state.lastMove.event) {
        await showEventDialog(state);
        renderGame(state);
      }
    });
  }
  if (state?.phase === 'over') await finishGame();
});

document.querySelector('[data-action="quit"]').addEventListener('click', () => {
  if (window.confirm('対戦をやめて設定画面に戻りますか?')) backToSetup();
});

for (const button of document.querySelectorAll('[data-action="rules"]')) {
  button.addEventListener('click', () => showRules());
}

fillRulesEventList();
initSetup();
```

- [ ] **Step 5: スモークテストと単体テストが通ることを確かめる**

Run: `npm run smoke && npm test`
Expected: `OK: ...`、単体テストはすべて pass

- [ ] **Step 6: スクリーンショットを目で確かめる**

`tools/screenshots/phone-event.png`、`phone-result.png`、`small-result.png`、`small-rules.png` を開き、次を確認する。
- イベントのポップアップに日付・行事名・イベント名・効果が出ている。
- 結果画面にケーキと見出し、決着の理由が出ている。
- ルール画面に23件のイベントが読める大きさで並んでいる。

問題があれば直し、Step 5 からやり直す。

- [ ] **Step 7: 実際にブラウザで1局遊ぶ**

Run: `npm run serve`(別のターミナル)してから、ブラウザで http://localhost:8000/ を開き、1局最後まで遊ぶ。
確認すること: 石の裏返りと日付が数えるように動く演出、跳ね返りの表示、イベントのポップアップ、石を選ぶ効果での強調表示、結果画面の紙吹雪、「同じ2人で再戦」。ブラウザの開発者ツールで、スマホ幅(390px)の表示も確認する。

- [ ] **Step 8: コミット**

```bash
git add js/ui.js js/main.js tools/smoke.mjs
git commit -m "$(cat <<'EOF'
Add event, adjust, result and rules dialogs with animations

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: GitHub Pages で公開する

**Files:**
- Create: `README.md`
- Create: `.nojekyll`

**Interfaces:**
- Consumes: Task 1〜6 の成果物すべて
- Produces: 公開URL `https://naoto-programming.github.io/birthday-othello/`

- [ ] **Step 1: 公開前に人間の確認を取る(外部への公開のため必須)**

次を人間のパートナーに見せ、公開してよいか確認する。了承が得られるまで Step 3 以降に進まない。

```bash
git log --format='%an <%ae>' | sort -u
```

- 公開リポジトリ `naoto-programming/birthday-othello` を作ること。ソースコード・仕様書・計画書は誰でも見られるようになる。
- 上のコマンドで出たコミット作成者の名前とメールアドレスも公開されること。公開したくない場合は、プッシュ前に作成者を変更する方法を相談する。

- [ ] **Step 2: README.md と .nojekyll を作る**

`README.md`:

````markdown
# 誕生日オセロ

日付を引っぱり合って、自分の誕生日にぴったり止めたら勝ちのオセロです。
1台のPCまたはスマートフォンを2人で交代に操作して遊びます。

- 遊ぶ: https://naoto-programming.github.io/birthday-othello/
- ルールと設計: `docs/superpowers/specs/2026-10-29-birthday-othello-design.md`

## 開発

```bash
npm test          # ルール・日付・祝日の単体テスト(Node.js v23 以降)
npm run serve     # http://localhost:8000/ で配信
npm run smoke     # ヘッドレス Chrome で画面を操作して確認(Google Chrome が必要)
```

イベントの追加や効果の入れ替えは `js/events.js` の `EVENTS` を編集します。
````

`.nojekyll` は空ファイル:

```bash
touch .nojekyll
```

- [ ] **Step 3: コミットしてリポジトリを作り、プッシュする**

```bash
git add README.md .nojekyll
git commit -m "$(cat <<'EOF'
Add README and disable Jekyll for GitHub Pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
gh repo create birthday-othello --public --source=. --remote=origin --push
```

Expected: `https://github.com/naoto-programming/birthday-othello` が作られ、main がプッシュされる。

- [ ] **Step 4: GitHub Pages を有効にする**

```bash
gh api -X POST repos/naoto-programming/birthday-othello/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Expected: `html_url` に `https://naoto-programming.github.io/birthday-othello/` を含む JSON が返る。

- [ ] **Step 5: 公開されたことを確かめる**

ビルドが終わるまで待つ(通常は数分)。

```bash
gh api repos/naoto-programming/birthday-othello/pages/builds/latest --jq .status
```

Expected: `built`

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://naoto-programming.github.io/birthday-othello/
curl -s -o /dev/null -w '%{http_code}\n' https://naoto-programming.github.io/birthday-othello/js/main.js
SMOKE_URL=https://naoto-programming.github.io/birthday-othello/ npm run smoke
```

Expected: `200`、`200`、`OK: ...`

- [ ] **Step 6: 人間のパートナーにURLを伝える**

公開URL `https://naoto-programming.github.io/birthday-othello/` を伝え、家族のスマートフォンやPCで開けることを確かめてもらう。
