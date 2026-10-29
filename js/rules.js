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
