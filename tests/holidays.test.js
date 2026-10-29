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
