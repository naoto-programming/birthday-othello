import { dayNum, defaultStart, fromDayNum, parseISODate, setupMatch, toISODate } from './dates.js';
import { applyChoice, newGame, playMove, previewMove } from './rules.js';
import {
  animateChoice, animateMove, animateWarp, celebrate, fillDaySelect, fillMonthSelect, fillRulesEventList,
  highlightEffect, renderGame, renderSetupPreview, revealPreviewPanel, showEventDialog, showResult, showRules,
} from './ui.js';

const form = document.querySelector('#setup-form');
const setupScreen = document.querySelector('#setup');
const gameScreen = document.querySelector('#game');
const boardEl = document.querySelector('#board');
const panelEl = document.querySelector('#preview-panel');

let state = null;
let busy = false;
// 対戦が入れ替わるたびに増やす番号。進行中の await の続きが、もう終わった対戦に書き戻さないようにする。
let epoch = 0;
// 予告中の手(まだ打っていない): { idx, lines, adjust }
let pick = null;

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
  pick = null;
  state = newGame(match);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame(state);
}

function backToSetup() {
  epoch += 1;
  pick = null;
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

// 予告中の手を描き直す
function showPick() {
  renderGame(state, { preview: pick ? previewMove(state, pick.idx, pick) : null });
}

async function finishGame() {
  await celebrate(state);
  const choice = await showResult(state);
  if (choice === 'rematch') startGame();
  else backToSetup();
}

// 予告中の手を決定して打つ
async function confirmPick() {
  if (!pick || busy || !state || state.phase !== 'play') return;
  const chosen = pick;
  pick = null;
  const myEpoch = epoch;
  const isCurrent = () => epoch === myEpoch;
  let local = state;
  await run(async () => {
    const next = playMove(local, chosen.idx, { lines: chosen.lines, adjust: chosen.adjust });
    if (next === local) return;
    local = next;
    state = local;
    await animateMove(local, { isCurrent });
    if (!isCurrent() || !local.lastMove.event) return;
    await showEventDialog(local);
    if (!isCurrent()) return;
    if (local.lastMove.warpTo !== undefined) await animateWarp(local, { isCurrent });
    if (!isCurrent()) return;
    renderGame(local);
    highlightEffect(local);
  });
  if (isCurrent() && local.phase === 'over') await finishGame();
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
    await animateChoice(prev, next, idx, { isCurrent });
  });
  if (isCurrent() && next.phase === 'over') await finishGame();
}

async function tapCell(idx) {
  if (state.phase === 'choose') {
    await choose(idx);
    return;
  }
  if (state.phase !== 'play') return;
  if (!state.board[idx]) {
    if (pick && pick.idx === idx) {
      await confirmPick();
      return;
    }
    pick = { idx, lines: undefined, adjust: 0 };
    showPick();
    revealPreviewPanel();
    return;
  }
  // 予告中に列の石をタップすると、その列を返すかどうかを切り替える(最後の1列は外せない)
  if (!pick) return;
  const preview = previewMove(state, pick.idx, pick);
  const line = preview.lines.find((l) => l.cells.includes(idx));
  if (!line) return;
  const chosen = new Set(preview.chosen);
  if (chosen.has(line.dir)) {
    if (chosen.size === 1) return;
    chosen.delete(line.dir);
  } else {
    chosen.add(line.dir);
  }
  pick = { ...pick, lines: [...chosen] };
  showPick();
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
    if (!target || busy || !state || !pick) return;
    if (target.dataset.pv === 'confirm') {
      await confirmPick();
    } else if (target.dataset.pv === 'cancel') {
      pick = null;
      renderGame(state);
    } else if (target.dataset.adjust !== undefined) {
      pick = { ...pick, adjust: Number(target.dataset.adjust) };
      showPick();
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
