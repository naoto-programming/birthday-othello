import { dayNum, defaultStart, fromDayNum, parseISODate, setupMatch, toISODate } from './dates.js';
import { applyChoice, newGame, playMove, previewMove } from './rules.js';
import {
  animateMove, cancelAdjust, chooseAdjust, fillDaySelect, fillMonthSelect, fillRulesEventList,
  renderGame, renderSetupPreview, showEventDialog, showResult, showRules,
} from './ui.js';

const form = document.querySelector('#setup-form');
const setupScreen = document.querySelector('#setup');
const gameScreen = document.querySelector('#game');
const boardEl = document.querySelector('#board');

let state = null;
let busy = false;
// 対戦が入れ替わるたびに増やす番号。進行中の await の続きが、もう終わった対戦に
// 書き戻してしまわないようにするための合い言葉(I1 の中断バグ対策)。
let epoch = 0;

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
  cancelAdjust();
  epoch += 1;
  state = newGame(match);
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  renderGame(state);
}

function backToSetup() {
  cancelAdjust();
  epoch += 1;
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

async function finishGame() {
  const choice = await showResult(state);
  if (choice === 'rematch') startGame();
  else backToSetup();
}

boardEl.addEventListener('click', async (e) => {
  try {
    const cell = e.target.closest('.cell');
    if (!cell || busy || !state) return;
    const idx = Number(cell.dataset.idx);
    // この手が始まったときの対戦を覚えておく。await の間に中断・再開されても、
    // 別の対戦の盤面やモジュール変数 state を書き換えないようにするため。
    const myEpoch = epoch;
    let local = state;
    const isCurrent = () => epoch === myEpoch;
    if (local.phase === 'choose') {
      const next = applyChoice(local, idx);
      if (next === local) return;
      local = next;
      await run(async () => {
        if (!isCurrent()) return;
        state = local;
        renderGame(state);
      });
    } else if (local.phase === 'play' && !local.board[idx]) {
      await run(async () => {
        const preview = previewMove(local, idx);
        let adjust = 0;
        if (preview.needsAdjust) {
          adjust = await chooseAdjust(preview.base, local.pending[local.turn], local.turn, idx);
          if (!isCurrent() || adjust === null) return;
        }
        local = playMove(local, idx, adjust);
        if (!isCurrent()) return;
        state = local;
        await animateMove(local, { isCurrent });
        if (!isCurrent()) return;
        if (local.lastMove.event) {
          await showEventDialog(local);
          if (!isCurrent()) return;
          renderGame(local);
        }
      });
    }
    if (isCurrent() && local.phase === 'over') await finishGame();
  } catch (err) {
    // ここで投げると addEventListener からは拾えない未処理の rejection になるため、必ず閉じ込める
    console.error(err);
  }
});

document.querySelector('[data-action="quit"]').addEventListener('click', () => {
  if (window.confirm('対戦をやめて設定画面に戻りますか?')) backToSetup();
});

for (const button of document.querySelectorAll('[data-action="rules"]')) {
  button.addEventListener('click', () => showRules());
}

fillRulesEventList();
initSetup();
