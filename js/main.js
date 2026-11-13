import { dayNum, defaultStart, fromDayNum, parseISODate, setupMatch, toISODate } from './dates.js';
import { applyChoice, choiceTargets, cropBoard, newGame, playMove, previewMove, sideOf } from './rules.js';
import {
  animateChoice, animateExpand, animateMove, animateWarp, celebrate, fillDaySelect, fillMonthSelect, fillRulesEventList,
  highlightEffect, renderGame, renderSetupPreview, revealAdjustPanel, showEventDialog, showResult, showRules, showStageDialog,
} from './ui.js';

const form = document.querySelector('#setup-form');
const setupScreen = document.querySelector('#setup');
const gameScreen = document.querySelector('#game');
const boardEl = document.querySelector('#board');
const panelEl = document.querySelector('#adjust-panel');

let state = null;
let busy = false;
// 対戦が入れ替わるたびに増やす番号。進行中の await の続きが、もう終わった対戦に書き戻さないようにする。
let epoch = 0;
// 日数調整を選んでいる空きマス(まだ打っていない)
let pickIdx = null;

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
  pickIdx = null;
  state = newGame(match);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame(state);
}

function backToSetup() {
  epoch += 1;
  pickIdx = null;
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

// finished: 終局した対戦の状態をその場で受け取る(グローバルな state を読み直さない)。
// isCurrent: 呼び出し側から引き継いだ、対戦がまだ有効かどうかの判定。
// celebrate() の花火が流れている間や結果ダイアログが開いている間に「設定に戻る」で中断されたら、
// 古くなった対戦に対して showResult や再戦・設定に戻るを行わない。
async function finishGame(finished, isCurrent) {
  await celebrate(finished);
  if (!isCurrent()) return;
  const choice = await showResult(finished);
  if (!isCurrent()) return;
  if (choice === 'rematch') startGame();
  else backToSetup();
}

// 盤面が広がった手の演出は、広がる前の盤面(中央を切り抜いたもの)で行い、そのあとで広げる演出をする
const viewBefore = (prev, next) => (
  next.stage === prev.stage ? next : { ...next, stage: prev.stage, board: cropBoard(next.board, sideOf(prev.board)) }
);

// 段階が上がっていたら、サドンデスのポップアップと盤面が広がる演出を出す
async function expandIfNeeded(prev, next, isCurrent) {
  if (next.stage <= prev.stage || !isCurrent()) return;
  await showStageDialog(next);
  if (!isCurrent()) return;
  await animateExpand(next, sideOf(prev.board), { isCurrent });
}

// 手を打って演出する。adjust: 日数調整で選んだ −3〜+3(調整がなければ 0)
async function place(idx, adjust) {
  if (busy || !state || state.phase !== 'play') return;
  const myEpoch = epoch;
  const isCurrent = () => epoch === myEpoch;
  let local = state;
  await run(async () => {
    const prev = local;
    const next = playMove(prev, idx, { adjust });
    if (next === prev) return;
    local = next;
    state = local;
    // 広がった手でも、演出は広がる前の盤面で行う
    const view = viewBefore(prev, next);
    await animateMove(view, { isCurrent });
    if (!isCurrent()) return;
    if (next.lastMove.event) {
      await showEventDialog(view);
      if (!isCurrent()) return;
      if (next.lastMove.warpTo !== undefined) await animateWarp(view, { isCurrent });
      if (!isCurrent()) return;
      renderGame(view);
      highlightEffect(view);
    }
    await expandIfNeeded(prev, next, isCurrent);
  });
  if (isCurrent() && local.phase === 'over') await finishGame(local, isCurrent);
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
    await animateChoice(prev, viewBefore(prev, next), idx, { isCurrent });
    await expandIfNeeded(prev, next, isCurrent);
  });
  if (isCurrent() && next.phase === 'over') await finishGame(next, isCurrent);
}

async function tapCell(idx) {
  // 選ぶ効果の対象外のマスは applyChoice が同じ state を返すので、choose の中で何も起きない
  if (state.phase === 'choose') {
    await choose(idx);
    return;
  }
  if (state.phase !== 'play' || state.board[idx]) return;
  pickIdx = null;
  if (previewMove(state, idx).needsAdjust) {
    pickIdx = idx;
    renderGame(state, { pickIdx });
    revealAdjustPanel();
    return;
  }
  await place(idx, 0);
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
    if (!target || busy || !state || pickIdx === null) return;
    if (target.dataset.adjust !== undefined) {
      const idx = pickIdx;
      pickIdx = null;
      await place(idx, Number(target.dataset.adjust));
    } else if (target.dataset.cancel !== undefined) {
      pickIdx = null;
      renderGame(state);
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
