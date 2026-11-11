// 本物のルール(js/rules.js)で、ていねいなAI同士を対戦させてバランスを確かめる。
// 使い方: caffeinate -i npm run balance(対局数を変えるときは npm run balance -- 400)
import { defaultStart, setupMatch } from '../js/dates.js';
import { applyChoice, choiceTargets, newGame, playMove, previewMove } from '../js/rules.js';

const GAMES = Number(process.argv[2] ?? 200);
if (!Number.isInteger(GAMES) || GAMES <= 0) {
  console.error(`NG: 対局数は正の整数で指定してください: ${process.argv[2]}`);
  process.exit(1);
}
const FULL_MAX = 0.1;
const SAFETY_CHECKS = 30;
const MAX_MOVES = 600;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function randomBirthday() {
  const date = new Date(Date.UTC(2026, 0, 1 + Math.floor(Math.random() * 365)));
  return { m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

// 置けるすべての手(調整の効果があれば −3〜+3、なければ 0)
function candidates(state) {
  const out = [];
  for (let idx = 0; idx < state.board.length; idx++) {
    if (state.board[idx]) continue;
    const adjusts = previewMove(state, idx, { adjust: 0 }).needsAdjust ? [-3, -2, -1, 0, 1, 2, 3] : [0];
    for (const adjust of adjusts) out.push({ idx, adjust });
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
  for (const { c } of scored.slice(0, SAFETY_CHECKS)) {
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
  while (state.phase !== 'over' && moves < MAX_MOVES) {
    const c = carefulMove(state);
    state = playMove(state, c.idx, c);
    if (state.lastMove.event) events += 1;
    state = resolveChoice(state);
    moves += 1;
  }
  return { result: state.result, stage: state.stage, moves, events, unfinished: state.phase !== 'over' };
}

const started = Date.now();
const count = { birthday: 0, stage1: 0, stage2: 0, full: 0, unfinished: 0 };
let blackWins = 0;
let totalMoves = 0;
let totalEvents = 0;
for (let i = 0; i < GAMES; i++) {
  const game = playGame();
  const reason = game.result?.reason;
  if (game.unfinished) count.unfinished += 1;
  else if (reason === 'birthday') count.birthday += 1;
  else if (reason === 'pass' && game.stage === 1) count.stage1 += 1;
  else if (reason === 'pass' && game.stage === 2) count.stage2 += 1;
  else if (reason === 'full') count.full += 1;
  if (game.result?.winner === 'B') blackWins += 1;
  totalMoves += game.moves;
  totalEvents += game.events;
}
const pct = (n) => `${Math.round((100 * n) / GAMES)}%`;
console.log(`対局数 ${GAMES}(${Math.round((Date.now() - started) / 1000)}秒)`);
console.log(`終わり方: 通常のぴったり ${pct(count.birthday)}  サドンデス ${pct(count.stage1)}  サドンデス×2 ${pct(count.stage2)}  最後の判定 ${pct(count.full)}  未決着 ${count.unfinished}`);
console.log(`平均手数: ${(totalMoves / GAMES).toFixed(1)}  先手の勝率: ${pct(blackWins)}  1試合のイベント: ${(totalEvents / GAMES).toFixed(1)}`);
const problems = [];
if (count.unfinished > 0) problems.push(`未決着の対局が ${count.unfinished} 局あります`);
if (count.full / GAMES > FULL_MAX) problems.push(`最後の判定の割合が ${FULL_MAX * 100}% を超えています`);
if (problems.length) {
  console.error(`NG: ${problems.join('、')}`);
  process.exit(1);
}
console.log('OK: バランスは想定の範囲内です');
