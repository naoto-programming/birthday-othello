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
