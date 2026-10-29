import { boardDates, formatMD, fromDayNum } from './dates.js';
import { choiceTargets, stoneWeight } from './rules.js';
import { EFFECTS } from './events.js';

const $ = (selector) => document.querySelector(selector);
const COLOR_NAME = { B: '黒', W: '白' };
const CHOICE_PROMPT = {
  remove: '取り除く相手の石を選んでください',
  fix: '固定する自分の石を選んでください',
  steal: '自分の色にする相手の石を選んでください',
  plant: '石を置く空きマスを選んでください',
};

export const playerOf = (state, color) => (color === 'B' ? state.match.black : state.match.white);
export const dateOf = (state, p = state.p) => state.match.baseDay + p;

export function formatLong(day) {
  const { m, d } = fromDayNum(day);
  return `${m}月${d}日`;
}

function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

// ---- 設定画面 ----

export function fillMonthSelect(select) {
  for (let m = 1; m <= 12; m++) select.add(new Option(String(m), String(m)));
}

// 月に合わせて日の選択肢を作り直す。選んでいた日がその月にない場合は月末に収める。
export function fillDaySelect(select, month) {
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const current = Number(select.value) || 1;
  select.length = 0;
  for (let d = 1; d <= max; d++) select.add(new Option(String(d), String(d)));
  select.value = String(Math.min(current, max));
}

export function renderSetupPreview(match) {
  const preview = $('#setup-preview');
  const button = $('#setup-form button[type=submit]');
  preview.classList.toggle('error', Boolean(match.error));
  button.disabled = Boolean(match.error);
  if (match.error) {
    preview.textContent = match.error;
    return;
  }
  const { black, white } = match;
  const pair = match.sameBirthday
    ? `同じ誕生日(${formatMD(black.day)})なので、黒白は開始時にランダムで決まります。`
    : `黒: ${black.name}(${formatMD(black.day)}) 白: ${white.name}(${formatMD(white.day)})`;
  preview.textContent = `${pair} 間は${match.D}日、石の増え方は+${match.s}`;
}

// ---- 対戦画面 ----

// shownP: 表示する日付の位置(演出中に途中の日付を出すため)
export function renderGame(state, { shownP = state.p } = {}) {
  const today = dateOf(state, shownP);
  $('#today-date').textContent = formatLong(today);
  renderPlayerStatus($('#status-black'), state, 'B', shownP);
  renderPlayerStatus($('#status-white'), state, 'W', shownP);
  $('#turn-msg').textContent = turnMessage(state);
  renderBoard(state, today);
}

function renderPlayerStatus(el, state, color, shownP) {
  const player = playerOf(state, color);
  const left = color === 'B' ? shownP : state.match.D - shownP;
  const effects = Object.entries(state.pending[color])
    .filter(([, on]) => on)
    .map(([id]) => EFFECTS[id].name);
  el.classList.toggle('active', state.phase !== 'over' && state.turn === color);
  el.replaceChildren(
    span('pl-name', `${COLOR_NAME[color]} ${player.name}`),
    span('pl-bday', `誕生日 ${formatMD(player.day)}`),
    span('pl-left', `あと${left}日`),
  );
  if (effects.length) el.append(span('pl-effects', `次の手: ${effects.join('・')}`));
}

function turnMessage(state) {
  if (state.phase === 'over') return '対戦終了';
  const player = playerOf(state, state.turn);
  const who = `${player.name}(${COLOR_NAME[state.turn]})`;
  if (state.phase === 'choose') return `${who}: ${CHOICE_PROMPT[state.choice.effect]}`;
  return `${who}の番です`;
}

function renderBoard(state, today) {
  const { match } = state;
  const eventByDay = new Map(Object.values(state.events).map((ev) => [ev.day, ev]));
  const targets = new Set(state.phase === 'choose' ? choiceTargets(state) : []);
  const cells = boardDates(today).map((day, idx) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.idx = String(idx);
    const { d } = fromDayNum(day);
    cell.append(span('date', idx === 0 || d === 1 ? formatMD(day) : String(d)));
    if (day === today) cell.classList.add('today');
    if (day === match.black.day) cell.classList.add('bday-black');
    if (day === match.white.day) cell.classList.add('bday-white');
    const ev = eventByDay.get(day);
    if (ev) cell.classList.add(ev.used ? 'event-used' : 'event');
    if (targets.has(idx)) cell.classList.add('target');
    const stone = state.board[idx];
    if (stone) {
      cell.classList.add('has-stone');
      const classes = ['stone', stone.color === 'B' ? 'black' : 'white'];
      if (stone.fixed) classes.push('fixed');
      cell.append(span(classes.join(' '), String(stoneWeight(stone, match.s))));
    }
    if (state.lastMove?.idx === idx) cell.classList.add('last');
    const stoneLabel = stone ? `${COLOR_NAME[stone.color]}の石` : '空き';
    cell.setAttribute('aria-label', `${formatMD(day)} ${stoneLabel}`);
    return cell;
  });
  $('#board').replaceChildren(...cells);
}
