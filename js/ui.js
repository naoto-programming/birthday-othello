import { boardDates, formatMD, fromDayNum } from './dates.js';
import { choiceTargets, countStones, moveDays, reflect, stoneWeight } from './rules.js';
import { EFFECTS, EVENTS, ruleLabel } from './events.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// ---- ダイアログ ----

// returnValue を毎回空に戻す。Esc などボタン以外で閉じたときに、前回の選択が残らないようにするため。
function openDialog(dialog) {
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
  });
}

export function showEventDialog(state) {
  const { event, fizzled, warpTo, color } = state.lastMove;
  $('#event-player').textContent = `${playerOf(state, color).name}に発動!`;
  $('#event-title').textContent = `${formatMD(event.day)} ${event.occasion}「${event.name}」`;
  let text = EFFECTS[event.effect].text;
  if (warpTo !== undefined) text += `(${formatMD(dateOf(state, warpTo))}へ)`;
  if (fizzled) text += '。選べる対象がないので不発でした';
  $('#event-text').textContent = text;
  return openDialog($('#event-dialog'));
}

export function showRules() {
  return openDialog($('#rules-dialog'));
}

export function fillRulesEventList() {
  const items = EVENTS.map((ev) => {
    const li = document.createElement('li');
    li.textContent = `${ruleLabel(ev.rule)} ${ev.occasion}「${ev.name}」: ${EFFECTS[ev.effect].text}`;
    return li;
  });
  $('#rules-events').replaceChildren(...items);
}

export function showResult(state) {
  const dialog = $('#result-dialog');
  const winner = state.result.winner ? playerOf(state, state.result.winner) : null;
  $('#result-title').textContent = winner ? `お誕生日おめでとう、${winner.name}!` : '引き分け';
  $('#result-reason').textContent = resultReason(state);
  dialog.classList.toggle('draw', !winner);
  const confetti = dialog.querySelector('.confetti');
  confetti.replaceChildren();
  if (winner) launchConfetti(confetti);
  return openDialog(dialog);
}

function resultReason(state) {
  const { result, match } = state;
  if (result.reason === 'birthday') {
    const winner = playerOf(state, result.winner);
    return `日付が${formatMD(winner.day)}(${winner.name}の誕生日)にぴったり止まりました。`;
  }
  const left = `誕生日まで ${match.black.name} あと${state.p}日、${match.white.name} あと${match.D - state.p}日`;
  if (state.p !== match.D - state.p) return `盤面が埋まりました。${left}。`;
  const stones = countStones(state);
  const count = `石の数は ${match.black.name} ${stones.B}個、${match.white.name} ${stones.W}個`;
  return result.winner
    ? `盤面が埋まりました。${left}で同じなので、石の数で決めました(${count})。`
    : `盤面が埋まりました。${left}で同じ、${count}で同じでした。`;
}

function launchConfetti(container) {
  const colors = ['#f6a5c0', '#ffd166', '#7bdff2', '#b8e986', '#c3a6ff'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
    container.append(piece);
  }
}

// ---- 日数調整 ----

// −3〜+3 のボタンを出し、選んだ値を返す。「別のマスにする」なら null。
export function chooseAdjust(base, pending, color) {
  const panel = $('#adjust');
  const row = document.createElement('div');
  row.className = 'adjust-row';
  panel.replaceChildren(span('adjust-title', '日数調整: 動く日数を選んでください'), row);
  panel.hidden = false;
  return new Promise((resolve) => {
    const finish = (value) => {
      panel.hidden = true;
      resolve(value);
    };
    for (let a = -3; a <= 3; a++) {
      const { days } = moveDays(base, pending, color, a);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${a > 0 ? '+' : ''}${a}(${days}日)`;
      button.addEventListener('click', () => finish(a));
      row.append(button);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link';
    cancel.textContent = '別のマスにする';
    cancel.addEventListener('click', () => finish(null));
    panel.append(cancel);
  });
}

// ---- 演出 ----

// 置いた石と裏返った石を動かしてから、日付を1日ずつ数えるように動かす(最大1.5秒程度)
export async function animateMove(state) {
  const move = state.lastMove;
  renderGame(state, { shownP: move.fromP });
  for (const idx of [move.idx, ...move.flips]) {
    $(`#board .cell[data-idx="${idx}"] .stone`)?.classList.add(idx === move.idx ? 'placed' : 'flip');
  }
  await sleep(350);
  if (move.days > 0) {
    const frames = Math.min(move.days, 30);
    const frameMs = Math.min(80, 1500 / frames);
    let bounced = false;
    for (let f = 1; f <= frames; f++) {
      const raw = move.fromP + move.dir * Math.round((f * move.days) / frames);
      bounced ||= raw < 0 || raw > state.match.D;
      showDate(state, reflect(raw, state.match.D), bounced);
      await sleep(frameMs);
    }
  }
  renderGame(state);
}

function showDate(state, p, bounced) {
  $('#today-date').textContent = formatLong(dateOf(state, p));
  $('#status-black .pl-left').textContent = `あと${p}日`;
  $('#status-white .pl-left').textContent = `あと${state.match.D - p}日`;
  if (bounced) $('#turn-msg').textContent = '跳ね返り!';
}
