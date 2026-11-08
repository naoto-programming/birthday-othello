// 本物のルール(js/rules.js)で、ていねいなAI同士を対戦させてバランスを確かめる。
// 使い方: caffeinate -i npm run balance(対局数を変えるときは npm run balance -- 400)
import { defaultStart, setupMatch } from '../js/dates.js';
import { applyChoice, choiceTargets, flipLines, newGame, playMove, previewMove } from '../js/rules.js';

const GAMES = Number(process.argv[2] ?? 200);
if (!Number.isInteger(GAMES) || GAMES <= 0) {
  console.error(`NG: 対局数は正の整数で指定してください: ${process.argv[2]}`);
  process.exit(1);
}
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
