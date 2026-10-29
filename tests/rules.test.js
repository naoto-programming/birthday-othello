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
