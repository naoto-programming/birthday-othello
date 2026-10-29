import { dayNum, defaultStart, fromDayNum, parseISODate, setupMatch, toISODate } from './dates.js';
import { applyChoice, newGame, playMove } from './rules.js';
import { fillDaySelect, fillMonthSelect, renderGame, renderSetupPreview } from './ui.js';

const form = document.querySelector('#setup-form');
const setupScreen = document.querySelector('#setup');
const gameScreen = document.querySelector('#game');
const boardEl = document.querySelector('#board');

let state = null;
let busy = false;

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
  state = newGame(match);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame(state);
}

function backToSetup() {
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

boardEl.addEventListener('click', async (e) => {
  const cell = e.target.closest('.cell');
  if (!cell || busy || !state) return;
  const idx = Number(cell.dataset.idx);
  if (state.phase === 'choose') {
    const next = applyChoice(state, idx);
    if (next === state) return;
    await run(async () => {
      state = next;
      renderGame(state);
    });
  } else if (state.phase === 'play' && !state.board[idx]) {
    await run(async () => {
      state = playMove(state, idx);
      renderGame(state);
    });
  }
});

document.querySelector('[data-action="quit"]').addEventListener('click', () => {
  if (window.confirm('対戦をやめて設定画面に戻りますか?')) backToSetup();
});

initSetup();
