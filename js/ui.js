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
// 選ぶ効果の予告パネルに出す、選んだマスへの説明文
const CHOICE_CONFIRM_TEXT = {
  remove: 'この石を取り除く',
  fix: 'この石を固定する',
  steal: 'この石を自分の色にする',
  plant: 'ここに石を置く',
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

// shownP: 表示する日付のマス(演出中に途中の日付を出すため)、preview: 予告中の手(previewMove の戻り値)、
// choicePick: 選ぶ効果(鬼は外・固定・奪う・植える)で、選択中(まだ確定していない)のマス
export function renderGame(state, { shownP = state.p, preview = null, choicePick = null } = {}) {
  $('#today-date').textContent = formatLong(dateOf(state, shownP));
  $('#square-size').textContent = state.match.k > 1 ? squareLabel(state.match) : '';
  renderPlayerStatus($('#status-black'), state, 'B', shownP);
  renderPlayerStatus($('#status-white'), state, 'W', shownP);
  $('#turn-msg').textContent = turnMessage(state, preview, choicePick);
  renderBoard(state, shownP, preview, choicePick);
  renderPreviewPanel(state, preview, choicePick);
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

function turnMessage(state, preview, choicePick) {
  if (state.phase === 'over') return '対戦終了';
  const player = playerOf(state, state.turn);
  const who = `${player.name}(${COLOR_NAME[state.turn]})`;
  if (state.phase === 'choose') {
    return choicePick !== null ? `${who}: 確かめて「決定」` : `${who}: ${CHOICE_PROMPT[state.choice.effect]}`;
  }
  if (preview) return `${who}: 予告を確かめて「ここに置く」`;
  return `${who}の番です`;
}

function renderBoard(state, shownP, preview, choicePick) {
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
    if (idx === choicePick) cell.classList.add('chosen');
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
    // 予告中は直前手のマーカーを出さない。予告中の will-flip のピンクのリングと見分けがつかなくなるため。
    if (!preview && state.lastMove?.idx === idx) cell.classList.add('last');
    cell.setAttribute('aria-label', `${formatMD(day)} ${stone ? `${COLOR_NAME[stone.color]}の石` : '空き'}`);
    return cell;
  });
  $('#board').replaceChildren(...cells);
}

function renderPreviewPanel(state, preview, choicePick) {
  const panel = $('#preview-panel');
  if (state.phase === 'choose' && choicePick !== null) {
    const actions = document.createElement('div');
    actions.className = 'pv-actions';
    actions.append(button('決定', 'primary', { pv: 'confirm' }), button('選び直す', 'link', { pv: 'cancel' }));
    panel.replaceChildren(span('pv-main', CHOICE_CONFIRM_TEXT[state.choice.effect]), actions);
    panel.hidden = false;
    return;
  }
  if (!preview) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  const dest = formatLong(dateOf(state, preview.toP));
  let main;
  if (preview.stall) main = `返さない: 相手側へ1マス → ${dest}`;
  else if (preview.flips.length === 0) main = '返さない: 挟める手がないので日付は動かない';
  else if (preview.days === 0) {
    // 日付が動かない0マスは、おやすみが理由のときと、調整で0マスを選んだときの両方で起こりうる。
    const reason = state.pending[state.turn].rest ? 'おやすみ' : '調整で0マス';
    main = `${preview.flips.length}枚返す: 日付は動かない(${reason})`;
  } else main = `${preview.flips.length}枚返して${preview.days}マス動く → ${dest}`;
  const notes = [];
  if (preview.bounced) notes.push('誕生日を通り越して跳ね返ります');
  if (preview.win) {
    const winNote = `${playerOf(state, preview.win).name}の誕生日にぴったり!`;
    notes.push(preview.win === state.turn ? winNote : `${winNote}(相手の勝ちになります)`);
  } else if (preview.event) notes.push(`${preview.event.occasion}「${preview.event.name}」に止まります`);
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
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
    container.append(piece);
  }
}

// ---- 演出 ----

// 置いた石を落とし、置いたマスに近い石から1枚ずつ返してから、今日の光を1マスずつ動かす。
// isCurrent: 呼び出し側の対戦がまだ有効かどうか。中断されていたら残りの演出と最後の再描画を打ち切る。
export async function animateMove(state, { isCurrent = () => true } = {}) {
  const move = state.lastMove;
  renderGame(state, { shownP: move.fromP });
  $(`#board .cell[data-idx="${move.idx}"] .stone`)?.classList.add('placed');
  const order = [...move.flips].sort((a, b) => cellDistance(a, move.idx) - cellDistance(b, move.idx));
  order.forEach((idx, i) => {
    const stone = $(`#board .cell[data-idx="${idx}"] .stone`);
    if (!stone) return;
    stone.classList.add(move.color === 'B' ? 'flip-to-black' : 'flip-to-white');
    stone.style.animationDelay = `${300 + i * 80}ms`;
  });
  await wait(order.length ? 300 + order.length * 80 + 400 : 450);
  if (!isCurrent()) return;
  await animateDate(state, move.fromP, move.dir, move.days, { isCurrent });
  if (!isCurrent()) return;
  // 「真ん中へ」で飛んだ先は、イベントのポップアップを閉じたあとで表示する
  renderGame(state, { shownP: move.toP });
}

// 今日の光をカレンダーの上で1マスずつ動かす。
// 月が変わるときはカレンダーをめくり、誕生日で跳ね返るときは誕生日のマスを弾ませるが、
// 合計はおよそ1.5秒におさまるように、先に経路を計算してからページめくり・跳ね返りの分を差し引いて1コマの時間を決める。
const TURN_MS = 250;
const BOUNCE_MS = 200;
const HOLD_MS = 300;
const DATE_ANIM_BUDGET_MS = 1500;

async function animateDate(state, fromP, dir, days, { isCurrent }) {
  if (days <= 0) return;
  const { N } = state.match;
  const frames = Math.min(days, 30);
  let month = fromDayNum(dateOf(state, fromP)).m;
  // 経路を先に計算し、月が変わる回数と跳ね返りの有無を数える
  const path = [];
  let bounced = false;
  let turns = 0;
  for (let f = 1; f <= frames; f++) {
    const raw = fromP + dir * Math.round((f * days) / frames);
    const p = reflect(raw, N);
    const hit = !bounced && (raw < 0 || raw > N);
    bounced ||= hit;
    const m = fromDayNum(dateOf(state, p)).m;
    if (m !== month) {
      month = m;
      turns += 1;
    }
    path.push({ raw, p, hit });
  }
  const extras = turns * TURN_MS + (bounced ? BOUNCE_MS + HOLD_MS : 0);
  const frameMs = Math.max(15, Math.min(80, (DATE_ANIM_BUDGET_MS - extras) / frames));
  month = fromDayNum(dateOf(state, fromP)).m;
  let bouncedSoFar = false;
  for (const { raw, p, hit } of path) {
    if (!isCurrent()) return;
    const m = fromDayNum(dateOf(state, p)).m;
    if (m !== month) {
      month = m;
      await turnPage(TURN_MS);
      if (!isCurrent()) return;
    }
    renderGame(state, { shownP: p });
    bouncedSoFar ||= hit;
    if (bouncedSoFar) $('#turn-msg').textContent = '跳ね返り!';
    if (hit) {
      $(`#board .cell.bday-${raw < 0 ? 'black' : 'white'}`)?.classList.add('bounce');
      await wait(BOUNCE_MS);
      if (!isCurrent()) return;
    }
    await wait(frameMs);
    if (!isCurrent()) return;
  }
  if (bounced) {
    await wait(HOLD_MS);
  }
}

// 月が変わるとき、カレンダーをめくる
async function turnPage(ms) {
  const board = $('#board');
  board.classList.add('page-turn');
  await wait(ms);
  board.classList.remove('page-turn');
}

// 選ぶ効果の演出: 鬼は外は消える、固定は金色に光る、奪うは裏返る、植えるは落ちてくる
export async function animateChoice(prev, next, idx, { isCurrent = () => true } = {}) {
  const { effect } = prev.choice;
  if (effect === 'remove') {
    $(`#board .cell[data-idx="${idx}"] .stone`)?.classList.add('vanish');
    await wait(400);
    if (!isCurrent()) return;
  }
  renderGame(next);
  const stone = $(`#board .cell[data-idx="${idx}"] .stone`);
  if (effect === 'fix') stone?.classList.add('glow-gold');
  if (effect === 'steal') stone?.classList.add(next.board[idx].color === 'B' ? 'flip-to-black' : 'flip-to-white');
  if (effect === 'plant') stone?.classList.add('placed');
  await wait(500);
}

// 「真ん中へ」で飛んだ先まで、今日の光を動かす
export async function animateWarp(state, { isCurrent = () => true } = {}) {
  const { toP, warpTo } = state.lastMove;
  await animateDate(state, toP, Math.sign(warpTo - toP), Math.abs(warpTo - toP), { isCurrent });
}

function glowOnce(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // 同じ演出をもう一度最初から始めるため
  el.classList.add(className);
  el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
}

// 効果が働いた名札や石を光らせる
export function highlightEffect(state) {
  const effect = state.lastMove?.event?.effect;
  if (!effect) return;
  const mover = state.lastMove.color;
  const target = ['rest', 'reverse'].includes(effect) ? (mover === 'B' ? 'W' : 'B') : mover;
  if (['double', 'plus3', 'adjust', 'rest', 'reverse', 'extraTurn'].includes(effect)) {
    glowOnce($(`#status-${target === 'B' ? 'black' : 'white'}`), 'glow');
  }
  if (effect === 'resetWeights') {
    for (const stone of document.querySelectorAll('#board .stone')) glowOnce(stone, 'glow-gold');
  }
}

// 勝った人の誕生日のマス(盤面になければ盤面の中央)から花火を上げる
export async function celebrate(state) {
  if (!state.result?.winner || reducedMotion()) return;
  const wrap = $('.board-wrap');
  const area = wrap.getBoundingClientRect();
  const cell = $(`#board .cell.bday-${state.result.winner === 'B' ? 'black' : 'white'}`)?.getBoundingClientRect();
  const x = cell ? cell.left + cell.width / 2 - area.left : area.width / 2;
  const y = cell ? cell.top + cell.height / 2 - area.top : area.height / 2;
  const layer = document.createElement('div');
  layer.className = 'fireworks';
  const colors = ['#f6a5c0', '#ffd166', '#7bdff2', '#b8e986', '#c3a6ff', '#ff9f1c'];
  for (let burst = 0; burst < 3; burst++) {
    for (let i = 0; i < 16; i++) {
      const spark = document.createElement('span');
      const angle = (2 * Math.PI * i) / 16;
      const radius = 50 + Math.random() * 40;
      spark.style.left = `${x}px`;
      spark.style.top = `${y - burst * 25}px`;
      spark.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * radius}px`);
      spark.style.background = colors[(i + burst) % colors.length];
      spark.style.animationDelay = `${burst * 280}ms`;
      layer.append(spark);
    }
  }
  wrap.append(layer);
  await sleep(1500);
  layer.remove();
}
