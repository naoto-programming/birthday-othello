import { listEventDays } from './events.js';
import { squareOfOffset } from './dates.js';

export const SIZE = 8;
// 方向の番号(0〜7): 0 左上, 1 上, 2 右上, 3 左, 4 右, 5 左下, 6 下, 7 右下。
const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export const opponent = (color) => (color === 'B' ? 'W' : 'B');

// 盤面の一辺(8・12・14)
export const sideOf = (board) => Math.round(Math.sqrt(board.length));

// 盤面を周りに rings 周広げる(石は (r + rings, c + rings) へ移る。元の配列は変えない)
export function expandBoard(board, rings) {
  const old = sideOf(board);
  const side = old + rings * 2;
  const next = Array(side * side).fill(null);
  board.forEach((stone, i) => {
    if (!stone) return;
    const r = Math.floor(i / old) + rings;
    const c = (i % old) + rings;
    next[r * side + c] = { ...stone };
  });
  return next;
}

// 盤面の中央の size×size を切り抜く
export function cropBoard(board, size) {
  const old = sideOf(board);
  const off = (old - size) / 2;
  const next = Array(size * size).fill(null);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const stone = board[(r + off) * old + c + off];
      next[r * size + c] = stone ? { ...stone } : null;
    }
  }
  return next;
}

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
    stage: 0,
    choice: null,
    lastMove: null,
    result: null,
  };
}

// idx に color の石を置いたときに返せる列。dir は方向の番号、cells は裏返る石(置いたマスに近い順)。
// 相手の固定石は壁として働き、その方向は列にならない。
export function flipLines(board, idx, color) {
  if (board[idx]) return [];
  const side = sideOf(board);
  const r0 = Math.floor(idx / side);
  const c0 = idx % side;
  const lines = [];
  DIRECTIONS.forEach(([dr, dc], dir) => {
    const cells = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < side && c >= 0 && c < side) {
      const stone = board[r * side + c];
      if (!stone) return;
      if (stone.color === color) {
        if (cells.length) lines.push({ dir, cells });
        return;
      }
      if (stone.fixed) return;
      cells.push(r * side + c);
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
  for (let idx = 0; idx < board.length; idx++) {
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

// 打つ前の予告。options.adjust: 調整(−3〜+3)。挟んだ列はすべて返す。
// 段階0は誕生日で跳ね返り、段階1・2は端を通り越す(または届く)と勝ち。段階2は移動が2倍。
export function previewMove(state, idx, { adjust: adjustOption } = {}) {
  const color = state.turn;
  const { N } = state.match;
  const pending = state.pending[color];
  const flips = computeFlips(state.board, idx, color);
  const flipWeights = flips.map((i) => stoneWeight(state.board[i]));
  const base = flipWeights.reduce((sum, w) => sum + w, 0);
  // おやすみが予定されているときは、調整の値に関わらず moveDays が動くマス数を0にするので、
  // 調整ボタンを出さない(出しても選んでも効果がなく、紛らわしいため)。
  const needsAdjust = pending.adjust && base > 0 && !pending.rest;
  const adjust = needsAdjust ? Math.max(-3, Math.min(3, adjustOption ?? 0)) : 0;
  const penalty = base === 0 && canFlipAnywhere(state.board, color);
  const { days: baseDays, dir, stall } = moveDays(base, pending, color, adjust, penalty);
  const days = baseDays * (state.stage === 2 ? 2 : 1);
  const raw = state.p + dir * days;
  let toP;
  let win;
  let bounced;
  if (state.stage === 0) {
    toP = reflect(raw, N);
    bounced = raw < 0 || raw > N;
    win = toP === 0 ? 'B' : toP === N ? 'W' : null;
  } else {
    toP = Math.max(0, Math.min(N, raw));
    bounced = false;
    win = raw <= 0 ? 'B' : raw >= N ? 'W' : null;
  }
  const target = !win && days > 0 ? state.events[toP] : null;
  return {
    idx, flips, flipWeights, base, needsAdjust, adjust, days, dir, stall, raw, toP, bounced, win,
    event: target && !target.used ? target : null,
  };
}

export function playMove(state, idx, { adjust } = {}) {
  if (state.phase !== 'play' || state.board[idx]) return state;
  const move = previewMove(state, idx, { adjust });
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
    color, idx, stage: state.stage, flips: move.flips, flipWeights: move.flipWeights, base: move.base,
    days: move.days, dir: move.dir, stall: move.stall, fromP, toP: next.p, event: null, fizzled: false,
  };
  if (move.win) {
    next.phase = 'over';
    next.result = state.stage === 0
      ? { winner: move.win, reason: 'birthday' }
      : { winner: move.win, reason: 'pass', exact: move.raw === move.toP };
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

// 広がった直後に打つ側が有利すぎるため、広げるたびに全部の石の重さを1(flips = 0)に戻す。色と固定はそのまま。
function resetWeights(state) {
  state.board = state.board.map((stone) => (stone ? { ...stone, flips: 0 } : stone));
}

// 盤面が埋まっていれば広げる(段階2なら判定で終局)。そのあと次の手番へ。石やマスを選ぶ途中なら何もしない。
function finishTurn(state, extraTurn) {
  if (state.phase === 'choose') return state;
  if (state.board.every(Boolean)) {
    // 盤面が埋まったら、段階0・1は周りに広げて次の段階へ。段階2は判定で終局。
    if (state.stage === 0) {
      state.board = expandBoard(state.board, 2);
      state.stage = 1;
      resetWeights(state);
    } else if (state.stage === 1) {
      state.board = expandBoard(state.board, 1);
      state.stage = 2;
      resetWeights(state);
    } else {
      state.phase = 'over';
      state.result = judgeFull(state);
      return state;
    }
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
