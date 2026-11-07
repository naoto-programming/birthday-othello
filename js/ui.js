import { boardDates, formatMD, fromDayNum, squareOffset, squarePeriod } from './dates.js';
import { choiceTargets, countStones, reflect, stoneWeight } from './rules.js';
import { EFFECTS, EVENTS, ruleLabel } from './events.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 端末で「動きを減らす」が有効なときは、演出の待ち時間をなくす
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => (reducedMotion() ? Promise.resolve() : sleep(ms));

const $ = (selector) => document.querySelector(selector);
const COLOR_NAME = { B: '黒', W: '白' };
const CHOICE_PROMPT = {
  remove: '取り除く相手の石を選んでください',
  fix: '固定する自分の石を選んでください',
  steal: '自分の色にする相手の石を選んでください',
  plant: '石を置く空きマスを選んでください',
};

export const playerOf = (state, color) => (color === 'B' ? state.match.black : state.match.white);
// マス u の日付(通し番号)
export const dateOf = (state, u = state.p) => state.match.baseDay + squareOffset(u, state.match.D, state.match.N);
// 2つのマスが盤面上で何マス離れているか(縦・横・斜め)
export const cellDistance = (a, b) => Math.max(Math.abs(Math.floor(a / 8) - Math.floor(b / 8)), Math.abs((a % 8) - (b % 8)));

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

function button(text, className, data = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  Object.assign(el.dataset, data);
  return el;
}

// 1マスの日数。割り切れないときは「約」をつける(例: 1マス=2日、1マス=約13日)
export function squareLabel(match) {
  const perSquare = match.D / match.N;
  return `1マス=${Number.isInteger(perSquare) ? '' : '約'}${Math.round(perSquare)}日`;
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
  const submit = $('#setup-form button[type=submit]');
  preview.classList.toggle('error', Boolean(match.error));
  submit.disabled = Boolean(match.error);
  if (match.error) {
    preview.textContent = match.error;
    return;
  }
  const { black, white } = match;
  const pair = match.sameBirthday
    ? `同じ誕生日(${formatMD(black.day)})なので、黒白は開始時にランダムで決まります。`
    : `黒: ${black.name}(${formatMD(black.day)}) 白: ${white.name}(${formatMD(white.day)})`;
  const distance = match.k > 1
    ? `間は${match.D}日、${match.N}マス(${squareLabel(match)})`
    : `間は${match.D}日(${squareLabel(match)})`;
  preview.textContent = `${pair} ${distance}`;
}

// ---- 対戦画面 ----

// shownP: 表示する日付のマス(演出中に途中の日付を出すため)、preview: 予告中の手(previewMove の戻り値)
export function renderGame(state, { shownP = state.p, preview = null } = {}) {
  $('#today-date').textContent = formatLong(dateOf(state, shownP));
  $('#square-size').textContent = state.match.k > 1 ? squareLabel(state.match) : '';
  renderPlayerStatus($('#status-black'), state, 'B', shownP);
  renderPlayerStatus($('#status-white'), state, 'W', shownP);
  $('#turn-msg').textContent = turnMessage(state, preview);
  renderBoard(state, shownP, preview);
  renderPreviewPanel(state, preview);
}

function renderPlayerStatus(el, state, color, shownP) {
  const { match } = state;
  const player = playerOf(state, color);
  const squares = color === 'B' ? shownP : match.N - shownP;
  const days = color === 'B' ? dateOf(state, shownP) - match.black.day : match.white.day - dateOf(state, shownP);
  const left = match.k > 1 ? `あと${squares}マス(約${days}日)` : `あと${squares}日`;
  const effects = Object.entries(state.pending[color])
    .filter(([, on]) => on)
    .map(([id]) => EFFECTS[id].name);
  el.classList.toggle('active', state.phase !== 'over' && state.turn === color);
  el.replaceChildren(
    span('pl-name', `${COLOR_NAME[color]} ${player.name}`),
    span('pl-bday', `誕生日 ${formatMD(player.day)}`),
    span('pl-left', left),
  );
  if (effects.length) el.append(span('pl-effects', `次の手: ${effects.join('・')}`));
}

function turnMessage(state, preview) {
  if (state.phase === 'over') return '対戦終了';
  const player = playerOf(state, state.turn);
  const who = `${player.name}(${COLOR_NAME[state.turn]})`;
  if (state.phase === 'choose') return `${who}: ${CHOICE_PROMPT[state.choice.effect]}`;
  if (preview) return `${who}: 予告を確かめて「ここに置く」`;
  return `${who}の番です`;
}

function renderBoard(state, shownP, preview) {
  const { match } = state;
  const today = dateOf(state, shownP);
  const [periodFrom, periodTo] = squarePeriod(shownP, match.D, match.N).map((offset) => match.baseDay + offset);
  const eventByDay = new Map(Object.values(state.events).map((ev) => [ev.day, ev]));
  const targets = new Set(state.phase === 'choose' ? choiceTargets(state) : []);
  const willFlip = new Set(preview?.flips ?? []);
  const lineOf = new Map();
  for (const line of preview?.lines ?? []) {
    const on = preview.chosen.includes(line.dir);
    for (const idx of line.cells) lineOf.set(idx, on);
  }
  const destDay = preview ? dateOf(state, preview.toP) : null;
  const cells = boardDates(today).map((day, idx) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.idx = String(idx);
    const { d } = fromDayNum(day);
    cell.append(span('date', idx === 0 || d === 1 ? formatMD(day) : String(d)));
    if (day === today) {
      cell.classList.add('is-today');
      cell.append(span('today-tag', '今日'));
    } else if (match.k > 1 && day >= periodFrom && day <= periodTo) {
      cell.classList.add('in-period');
    }
    if (day === match.black.day) cell.classList.add('bday-black');
    if (day === match.white.day) cell.classList.add('bday-white');
    const ev = eventByDay.get(day);
    if (ev) cell.classList.add(ev.used ? 'event-used' : 'event');
    if (targets.has(idx)) cell.classList.add('target');
    // 日付が動かない予告(destDay === today)では、今日のマス自身を目的地として指し示す意味がないので dest を付けない。
    // こうしないと is-today と dest が同じマスに重なり、金色の「今日」強調がピンクの dest 点滅に上書きされてしまう。
    if (day === destDay && destDay !== today) cell.classList.add('dest');
    if (lineOf.has(idx)) cell.classList.add(lineOf.get(idx) ? 'line-on' : 'line-off');
    const stone = state.board[idx];
    if (stone) {
      cell.classList.add('has-stone');
      const classes = ['stone', stone.color === 'B' ? 'black' : 'white'];
      if (stone.fixed) classes.push('fixed');
      if (willFlip.has(idx)) classes.push('will-flip');
      const el = span(classes.join(' '), String(stoneWeight(stone)));
      if (lineOf.get(idx)) el.style.animationDelay = `${cellDistance(idx, preview.idx) * 120}ms`;
      cell.append(el);
    } else if (preview && idx === preview.idx) {
      cell.append(span(`stone ghost ${state.turn === 'B' ? 'black' : 'white'}`, '1'));
    }
    if (state.lastMove?.idx === idx) cell.classList.add('last');
    cell.setAttribute('aria-label', `${formatMD(day)} ${stone ? `${COLOR_NAME[stone.color]}の石` : '空き'}`);
    return cell;
  });
  $('#board').replaceChildren(...cells);
}

function renderPreviewPanel(state, preview) {
  const panel = $('#preview-panel');
  if (!preview) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  const dest = formatLong(dateOf(state, preview.toP));
  let main;
  if (preview.stall) main = `返さない: 相手側へ1マス → ${dest}`;
  else if (preview.flips.length === 0) main = '返さない: 挟める手がないので日付は動かない';
  else if (preview.days === 0) main = `${preview.flips.length}枚返す: 日付は動かない(おやすみ)`;
  else main = `${preview.flips.length}枚返して${preview.days}マス動く → ${dest}`;
  const notes = [];
  if (preview.bounced) notes.push('誕生日を通り越して跳ね返ります');
  if (preview.win) notes.push(`${playerOf(state, preview.win).name}の誕生日にぴったり!`);
  else if (preview.event) notes.push(`${preview.event.occasion}「${preview.event.name}」に止まります`);
  if (preview.lines.length > 1) notes.push('列の石をタップすると、その列を返すかどうかを切り替えられます');
  const children = [span('pv-main', main), ...notes.map((text) => span('pv-note', text))];
  if (preview.needsAdjust) {
    const row = document.createElement('div');
    row.className = 'adjust-row';
    for (let a = -3; a <= 3; a++) {
      row.append(button(`${a > 0 ? '+' : ''}${a}`, a === preview.adjust ? 'selected' : '', { adjust: String(a) }));
    }
    children.push(span('pv-note', '調整: 動くマス数を −3〜+3 で選べます'), row);
  }
  const actions = document.createElement('div');
  actions.className = 'pv-actions';
  actions.append(button('ここに置く', 'primary', { pv: 'confirm' }), button('やめる', 'link', { pv: 'cancel' }));
  children.push(actions);
  panel.replaceChildren(...children);
  panel.hidden = false;
}

// 予告パネルが画面の外にあれば、見える位置までスクロールする
export function revealPreviewPanel() {
  $('#preview-panel').scrollIntoView({ block: 'nearest' });
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
  const dialog = $('#rules-dialog');
  const closed = openDialog(dialog);
  // showModal() が「閉じる」ボタンへフォーカスを移し、スクロール位置をそこまで動かしてしまうため戻す
  dialog.scrollTop = 0;
  return closed;
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
  const unit = match.k > 1 ? 'マス' : '日';
  const left = `誕生日まで ${match.black.name} あと${state.p}${unit}、${match.white.name} あと${match.N - state.p}${unit}`;
  if (state.p !== match.N - state.p) return `盤面が埋まりました。${left}。`;
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

// ---- 演出 ----

// 置いた石と裏返った石を動かしてから、今日の光を1マスずつ動かす。
// isCurrent: 呼び出し側の対戦がまだ有効かどうか。中断されていたら残りの演出と最後の再描画を打ち切る。
export async function animateMove(state, { isCurrent = () => true } = {}) {
  const move = state.lastMove;
  renderGame(state, { shownP: move.fromP });
  for (const idx of [move.idx, ...move.flips]) {
    $(`#board .cell[data-idx="${idx}"] .stone`)?.classList.add(idx === move.idx ? 'placed' : 'flip');
  }
  await wait(350);
  if (!isCurrent()) return;
  await animateDate(state, move.fromP, move.dir, move.days, { isCurrent });
  if (!isCurrent()) return;
  // 「真ん中へ」で飛んだ先は、イベントのポップアップを閉じたあとで表示する
  renderGame(state, { shownP: move.toP });
}

// 今日の光をカレンダーの上で1マスずつ動かす(最大1.5秒程度)
async function animateDate(state, fromP, dir, days, { isCurrent }) {
  if (days <= 0) return;
  const { N } = state.match;
  const frames = Math.min(days, 30);
  const frameMs = Math.min(80, 1500 / frames);
  let bounced = false;
  for (let f = 1; f <= frames; f++) {
    if (!isCurrent()) return;
    const raw = fromP + dir * Math.round((f * days) / frames);
    bounced ||= raw < 0 || raw > N;
    renderGame(state, { shownP: reflect(raw, N) });
    if (bounced) $('#turn-msg').textContent = '跳ね返り!';
    await wait(frameMs);
  }
  if (bounced) await wait(550);
}

// 選ぶ効果(鬼は外・固定・奪う・植える)の結果を表示する
export async function animateChoice(prev, next, idx, { isCurrent = () => true } = {}) {
  if (isCurrent()) renderGame(next);
}

// 「真ん中へ」で飛んだ先を表示する
export async function animateWarp(state, { isCurrent = () => true } = {}) {
  if (isCurrent()) renderGame(state);
}

// 効果が働いた名札や石を光らせる
export function highlightEffect() {}

// 勝利の演出(結果のダイアログを開く前)
export async function celebrate() {}
