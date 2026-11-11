import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNum } from '../js/dates.js';
import {
  reflect, stoneWeight, newGame, flipLines, computeFlips, canFlipAnywhere, previewMove, moveDays, playMove,
  countStones, judgeFull, choiceTargets, applyChoice, sideOf, expandBoard, cropBoard,
} from '../js/rules.js';

const at = (r, c) => r * 8 + c;
const at12 = (r, c) => r * 12 + c;
const at14 = (r, c) => r * 14 + c;
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
function stateWith({ N = 20, p = 10, turn = 'B', rows = null, events = {}, stage = 0 } = {}) {
  const state = newGame(testMatch({ N, u0: p }));
  if (rows) state.board = boardFrom(rows);
  state.stage = stage;
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

test('newGame: 段階は0', () => {
  assert.equal(newGame(testMatch()).stage, 0);
});

test('sideOf: 64・144・196 マスの盤面は 8・12・14', () => {
  assert.equal(sideOf(Array(64).fill(null)), 8);
  assert.equal(sideOf(Array(144).fill(null)), 12);
  assert.equal(sideOf(Array(196).fill(null)), 14);
});

test('expandBoard: 石は (r+rings, c+rings) へ移り、色・重さ・固定はそのまま', () => {
  const board = Array(64).fill(null);
  board[at(0, 0)] = { color: 'W', flips: 2, fixed: true };
  board[at(7, 7)] = { color: 'B', flips: 0, fixed: false };
  const big = expandBoard(board, 2);
  assert.equal(big.length, 144);
  assert.deepEqual(big[at12(2, 2)], { color: 'W', flips: 2, fixed: true });
  assert.deepEqual(big[at12(9, 9)], { color: 'B', flips: 0, fixed: false });
  assert.equal(big.filter(Boolean).length, 2);
  assert.deepEqual(board[at(0, 0)], { color: 'W', flips: 2, fixed: true }, '元の盤面は変えない');
  assert.equal(board.length, 64);
  const bigger = expandBoard(big, 1);
  assert.equal(bigger.length, 196);
  assert.deepEqual(bigger[at14(3, 3)], { color: 'W', flips: 2, fixed: true });
});

test('cropBoard: 広げた盤面の中央を切り抜くと元に戻る', () => {
  const board = Array(64).fill(null);
  board[at(0, 0)] = { color: 'W', flips: 2, fixed: true };
  board[at(3, 4)] = { color: 'B', flips: 1, fixed: false };
  assert.deepEqual(cropBoard(expandBoard(board, 2), 8), board);
  assert.deepEqual(cropBoard(expandBoard(expandBoard(board, 2), 1), 8), board);
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

test('flipLines: 12マスの盤面では8マスより長い列を返せる', () => {
  const rows12 = ['BWWWWWWWWWW.', ...Array(11).fill('.'.repeat(12))];
  const board = boardFrom(rows12);
  const lines = flipLines(board, at12(0, 11), 'B');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].cells.length, 10);
  assert.equal(computeFlips(board, at12(0, 11), 'B').length, 10);
  assert.equal(canFlipAnywhere(board, 'B'), true);
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

test('previewMove: 挟んだ列はすべて返す', () => {
  const pv = previewMove(stateWith({ N: 20, p: 10, rows: TWO_LINES }), at(3, 5));
  assert.deepEqual(pv.flips, [at(3, 4), at(4, 5)]);
  assert.equal(pv.base, 2);
  assert.equal(pv.days, 2);
  assert.equal(pv.toP, 8);
  assert.equal(pv.stall, false);
  assert.equal('chosen' in pv, false);
  assert.equal('lines' in pv, false);
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

test('previewMove: おやすみが予定されているときは調整があっても調整ボタンを出さない', () => {
  const st = stateWith({ p: 10, rows: rowsWith('.WB.....') });
  st.pending.B.adjust = true;
  st.pending.B.rest = true;
  const pv = previewMove(st, at(3, 0), { adjust: 2 });
  assert.equal(pv.needsAdjust, false);
  assert.equal(pv.days, 0, 'おやすみなので調整に関わらず動くマス数は0');
});

// ---- 打つ ----

test('playMove: 予告と同じ結果になり、挟んだ列はすべて返る', () => {
  const st = stateWith({ rows: TWO_LINES });
  const pv = previewMove(st, at(3, 5));
  const next = playMove(st, at(3, 5));
  assert.equal(next.p, pv.toP);
  assert.equal(next.board[at(4, 5)].color, 'B');
  assert.equal(next.board[at(3, 4)].color, 'B');
  assert.equal(next.lastMove.lines, undefined);
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

test('playMove: 段階0で最後の空きマスを埋めたら、周りに2周広がって段階1になる', () => {
  const next = playMove(stateWith({ N: 20, p: 8, rows: ['.BBBBBBB', ...Array(7).fill('BBBBBBBB')] }), at(0, 0));
  assert.equal(next.phase, 'play');
  assert.equal(next.stage, 1);
  assert.equal(next.board.length, 144);
  assert.equal(next.board[at12(2, 2)].color, 'B');
  assert.equal(next.board[at12(0, 0)], null);
  assert.equal(next.board[at12(11, 11)], null);
  assert.equal(next.p, 8);
  assert.equal(next.turn, 'W');
  assert.equal(next.result, null);
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

test('イベント: 植えるで最後の空きマスが埋まったら段階1に広がる', () => {
  const rows = ['.WBBBBB.', ...Array(7).fill('BBBBBBBB')];
  const mid = playMove(stateWith({ N: 20, p: 10, rows, events: { 9: ev('plant') } }), at(0, 0));
  assert.deepEqual(choiceTargets(mid), [at(0, 7)]);
  const next = applyChoice(mid, at(0, 7));
  assert.equal(next.stage, 1);
  assert.equal(next.phase, 'play');
  assert.equal(next.board.length, 144);
});

// ---- 段階(サドンデス) ----

const FULL_BUT_ONE = ['.WBBBBBB', ...Array(6).fill('BBBBBBBB'), 'BBBBBBBW'];

test('段階1: 誕生日を通り越したら勝ちで、跳ね返らない', () => {
  const next = playMove(stateWith({ stage: 1, N: 20, p: 3, rows: rowsWith('.WWWWWB.') }), at(3, 0));
  assert.equal(next.lastMove.base, 5);
  const pv = previewMove(stateWith({ stage: 1, N: 20, p: 3, rows: rowsWith('.WWWWWB.') }), at(3, 0));
  assert.equal(pv.flips.length, 5);
  assert.equal(pv.raw, -2);
  assert.equal(pv.toP, 0);
  assert.equal(pv.bounced, false);
  assert.deepEqual(next.result, { winner: 'B', reason: 'pass', exact: false });
  assert.equal(next.phase, 'over');
});

test('段階1: ぴったり届いても勝ち(exact)', () => {
  const next = playMove(stateWith({ stage: 1, p: 2, rows: rowsWith('.WWB....') }), at(3, 0));
  assert.deepEqual(next.result, { winner: 'B', reason: 'pass', exact: true });
});

test('段階1: 相手の手(様子見の代償)で通り越しても誕生日の人の勝ち', () => {
  const next = playMove(stateWith({ stage: 1, p: 1, turn: 'W', rows: rowsWith('.BW.....') }), at(7, 7));
  assert.equal(next.lastMove.stall, true);
  assert.equal(next.result.winner, 'B');
  assert.equal(next.result.reason, 'pass');
});

test('段階2: 移動は最後に2倍(+3 のあと)', () => {
  const st = stateWith({ stage: 2, p: 10, rows: rowsWith('.WB.....') });
  st.pending.B.plus3 = true;
  const next = playMove(st, at(3, 0));
  assert.equal(next.lastMove.days, 8);
  assert.equal(next.p, 2);
});

test('段階2: 様子見の代償も2倍', () => {
  const next = playMove(stateWith({ stage: 2, p: 10, rows: rowsWith('.WB.....') }), at(7, 7));
  assert.equal(next.lastMove.stall, true);
  assert.equal(next.lastMove.days, 2);
  assert.equal(next.p, 12);
});

test('段階1: イベントは今までどおり止まったマスで発動する', () => {
  const next = playMove(stateWith({ stage: 1, p: 10, rows: CENTER4, events: { 9: ev('plus3') } }), at(2, 3));
  assert.equal(next.pending.B.plus3, true);
});

test('段階1で盤面が埋まったら1周広がって段階2になる', () => {
  const rows = ['.BBBBBBBBBBB', ...Array(11).fill('B'.repeat(12))];
  const next = playMove(stateWith({ stage: 1, p: 8, rows }), at12(0, 0));
  assert.equal(next.stage, 2);
  assert.equal(next.board.length, 196);
  assert.equal(next.board[at14(1, 1)].color, 'B');
  assert.equal(next.phase, 'play');
});

test('段階2で盤面が埋まったら判定で終局', () => {
  const rows = ['.' + 'B'.repeat(13), ...Array(13).fill('B'.repeat(14))];
  const next = playMove(stateWith({ stage: 2, N: 20, p: 8, rows }), at14(0, 0));
  assert.equal(next.phase, 'over');
  assert.deepEqual(next.result, { winner: 'B', reason: 'full' });
});

test('盤面を埋めた手がもう一手なら、広がったあとも同じ人の番', () => {
  const next = playMove(stateWith({ p: 10, rows: FULL_BUT_ONE, events: { 9: ev('extraTurn') } }), at(0, 0));
  assert.equal(next.stage, 1);
  assert.equal(next.turn, 'B');
});

test('固定・奪うで、埋まった盤面のまま確定したら広がる', () => {
  const mid = playMove(stateWith({ p: 10, rows: FULL_BUT_ONE, events: { 9: ev('steal') } }), at(0, 0));
  assert.equal(mid.phase, 'choose');
  assert.equal(mid.stage, 0);
  const next = applyChoice(mid, at(7, 7));
  assert.equal(next.stage, 1);
  assert.equal(next.board.length, 144);
  assert.equal(next.turn, 'W');
});

test('flipWeights: 打つ前の重さを記録する(重さリセットでも変わらない)', () => {
  const make = (events) => {
    const st = stateWith({ p: 10, rows: rowsWith('.WWB....'), events });
    st.board[at(3, 1)].flips = 2;
    return st;
  };
  const next = playMove(make({}), at(3, 0));
  assert.deepEqual(next.lastMove.flips, [at(3, 1), at(3, 2)]);
  assert.deepEqual(next.lastMove.flipWeights, [3, 1]);
  assert.equal(next.p, 6);
  const reset = playMove(make({ 6: ev('resetWeights') }), at(3, 0));
  assert.ok(reset.board.filter(Boolean).every((stone) => stone.flips === 0));
  assert.deepEqual(reset.lastMove.flipWeights, [3, 1]);
});

test('lastMove.stage は打ったときの段階', () => {
  const next = playMove(stateWith({ p: 10, rows: FULL_BUT_ONE }), at(0, 0));
  assert.equal(next.stage, 1);
  assert.equal(next.lastMove.stage, 0);
});
