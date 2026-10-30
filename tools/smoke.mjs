// ヘッドレス Chrome で画面を開いて操作し、エラーがないことを確かめ、スクリーンショットを保存する。
// 使い方: npm run smoke(公開版を確かめるときは SMOKE_URL=https://... npm run smoke)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_PORT = 8765;
const DEBUG_PORT = 9333;
const OUT = new URL('./screenshots/', import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = process.env.SMOKE_URL ? null : await startServer(APP_PORT);
const appUrl = process.env.SMOKE_URL ?? `http://127.0.0.1:${APP_PORT}/`;
const profile = mkdtempSync(join(tmpdir(), 'birthday-othello-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  // headless Chrome は実ウィンドウがなく visibilityState は 'visible' のままでも、
  // レンダラーのタイマーが数秒でまるごと止まることがある(次のフレームの setTimeout が
  // 何秒も発火しない)。長い演出(animateMove の日付カウントアップ)の途中で止まると
  // settled() の待ちがタイムアウトする。バックグラウンド扱いによるタイマー抑制を切る。
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: 'ignore' });

const failures = [];
const pageErrors = [];
const waiting = new Map();
const listeners = [];
let ws;
let nextId = 1;

try {
  ws = new WebSocket(await pageSocketUrl());
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
      return;
    }
    for (const l of listeners.filter((x) => x.method === msg.method)) {
      listeners.splice(listeners.indexOf(l), 1);
      l.resolve(msg.params);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(d.exception?.description ?? d.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') pageErrors.push(msg.params.entry.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  mkdirSync(OUT, { recursive: true });
  await scenarios();
} catch (err) {
  failures.push(`スモークテストが途中で止まりました: ${err.message}`);
} finally {
  ws?.close();
  chrome.kill();
  server?.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 後片付けの失敗は無視 */ }
}

for (const e of pageErrors) failures.push(`ページのエラー: ${e}`);
if (failures.length) {
  console.error(failures.map((f) => `NG: ${f}`).join('\n'));
  process.exit(1);
}
console.log(`OK: スクリーンショットを ${fileURLToPath(OUT)} に保存しました`);

// ---- シナリオ ----

async function scenarios() {
  // 1. スマホ幅: 設定 → 序盤の3手
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  const preview = await js(`document.querySelector('#setup-preview').textContent`);
  check(
    preview.includes('黒: たろう(10/14)') && preview.includes('白: はなこ(12/3)')
      && preview.includes('間は50日') && preview.includes('+2'),
    `設定の確認文が想定と違います: ${preview}`,
  );
  check(await noHorizontalScroll(), '設定画面(390px)が横にスクロールします');
  await shot('phone-setup');
  await startFromSetup();
  const before = await todayText();
  for (const idx of [19, 18, 37]) {
    await clickCell(idx);
    await settled();
  }
  check(await stoneCount() === 7, `3手打った後の石の数が7ではありません: ${await stoneCount()}`);
  check(await todayText() !== before, `打っても日付が変わっていません: ${before}`);
  check(await noHorizontalScroll(), '対戦画面(390px)が横にスクロールします');
  await shot('phone-game');

  // 2. 小さいスマホ幅: 月の切り替え、開始日を空にする、長い名前、半年離れた誕生日、連打
  await open(320, 640);
  await js(`(() => {
    const f = document.querySelector('#setup-form');
    const set = (name, value) => { f[name].value = value; f[name].dispatchEvent(new Event('change', { bubbles: true })); };
    set('month1', '1'); set('day1', '31'); set('month1', '2');
  })()`);
  check(await js(`document.querySelector('#setup-form').day1.value`) === '29', '31日のまま2月に切り替えたとき、日が29日に収まっていません');
  await js(`(() => {
    const f = document.querySelector('#setup-form');
    f.start.value = '';
    f.start.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  check(await js(`document.querySelector('#setup-form').start.value`) !== '', '開始日を空にしたとき既定の開始日に戻りません');
  await fillSetup({ name: 'あいうえおかきくけこ', m: 1, d: 1 }, { name: 'さしすせそたちつてと', m: 7, d: 1 });
  check(await noHorizontalScroll(), '設定画面(320px)が横にスクロールします');
  await startFromSetup();
  await js(`(() => {
    const cell = (i) => document.querySelector('#board .cell[data-idx="' + i + '"]');
    cell(19).click(); cell(19).click(); cell(20).click();
  })()`);
  await settled();
  check(await stoneCount() === 5, `連打で2手以上打てています: 石の数 ${await stoneCount()}`);
  check(await noHorizontalScroll(), '対戦画面(320px)が横にスクロールします');
  await shot('small-game');

  // 3. PC 幅
  await open(1280, 800);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  await startFromSetup();
  await shot('pc-game');

  // 4. 日数調整の操作部品
  const adjust = await js(`(async () => {
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    const pending = { double: false, plus3: false, adjust: true, rest: false, reverse: false };
    const choice = ui.chooseAdjust(5, pending, 'B');
    const buttons = [...document.querySelectorAll('#adjust .adjust-row button')];
    const labels = buttons.map((b) => b.textContent);
    buttons[6].click();
    return { labels, value: await choice, hidden: document.querySelector('#adjust').hidden };
  })()`);
  check(
    adjust.labels.length === 7 && adjust.labels[0] === '-3(2日)' && adjust.labels[6] === '+3(8日)'
      && adjust.value === 3 && adjust.hidden,
    `日数調整の表示か選択がおかしいです: ${JSON.stringify(adjust)}`,
  );

  // 5. イベント: 10/28 と 11/5(開始 11/1)。黒の1手目で 10/31 ハロウィンに止まる
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 28 }, { name: 'はなこ', m: 11, d: 5 });
  await startFromSetup();
  await clickCell(19);
  await settled();
  check(await js(`document.querySelector('#event-dialog').open`), 'ハロウィンに止まってもイベントのポップアップが出ません');
  check((await js(`document.querySelector('#event-title').textContent`)).includes('ハロウィン'), 'イベント名がハロウィンではありません');
  await shot('phone-event');
  await js(`document.querySelector('#event-dialog button').click()`);
  await settled();
  check((await js(`document.querySelector('#status-black').textContent`)).includes('日数2倍'), '黒の次の手に「日数2倍」が表示されていません');
  for (const idx of [18, 37]) {
    await clickCell(idx);
    await settled();
  }
  check(await todayText() === '10月31日', `2倍が効いた後の日付が 10月31日 ではありません: ${await todayText()}`);

  // 6. 最後まで打って結果を出し、再戦 → 2回目は Esc 相当で閉じて設定に戻る
  check(await playToEnd(), '最後まで打っても結果が出ません');
  const title = await js(`document.querySelector('#result-title').textContent`);
  check(title.includes('お誕生日おめでとう') || title.includes('引き分け'), `結果の見出しがおかしいです: ${title}`);
  await shot('phone-result');
  await js(`document.querySelector('#result-dialog button[value=rematch]').click()`);
  // close イベントは非同期に届くので、盤面が作り直されるまで待つ
  await waitFor(`document.querySelectorAll('#board .stone').length === 4`, 3000).catch(() => {});
  check(await stoneCount() === 4, '再戦で盤面が初期状態になっていません');
  check(await playToEnd(), '再戦で最後まで打っても結果が出ません');
  await js(`document.querySelector('#result-dialog').close()`);
  await waitFor(`!document.querySelector('#setup').hidden`, 2000).catch(() => {});
  check(await js(`!document.querySelector('#setup').hidden`), 'ボタン以外で結果を閉じたとき設定画面に戻りません(前回の再戦が残っています)');

  // 7. 半年離れた誕生日で最後まで(大きな移動と演出の上限)
  await open(320, 640);
  await fillSetup({ name: 'あいうえおかきくけこ', m: 1, d: 1 }, { name: 'さしすせそたちつてと', m: 7, d: 1 });
  await startFromSetup();
  check(await playToEnd(), '半年離れた誕生日で最後まで打っても結果が出ません');
  await shot('small-result');

  // 8. ルール画面
  await js(`document.querySelector('#result-dialog button[value=setup]').click()`);
  await js(`document.querySelector('#setup [data-action="rules"]').click()`);
  check(await js(`document.querySelectorAll('#rules-events li').length`) === 23, 'ルール画面のイベント一覧が23件ではありません');
  await shot('small-rules');
}

// ---- 操作の部品 ----

async function pageSocketUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome の起動待ち */ }
    await sleep(100);
  }
  throw new Error('Chrome に接続できませんでした');
}

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    waiting.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  });
}

function once(method) {
  return new Promise((resolve) => listeners.push({ method, resolve }));
}

async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function waitFor(expression, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await js(`Boolean(${expression})`)) return;
    await sleep(50);
  }
  throw new Error(`待っても条件を満たしませんでした: ${expression}`);
}

async function open(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: appUrl });
  await loaded;
  await waitFor(`document.querySelector('#setup-preview').textContent.length > 0`);
}

async function fillSetup(p1, p2) {
  await js(`(() => {
    const f = document.querySelector('#setup-form');
    const set = (name, value) => {
      f[name].value = value;
      f[name].dispatchEvent(new Event(f[name].tagName === 'INPUT' ? 'input' : 'change', { bubbles: true }));
    };
    set('name1', ${JSON.stringify(p1.name)}); set('month1', '${p1.m}'); set('day1', '${p1.d}');
    set('name2', ${JSON.stringify(p2.name)}); set('month2', '${p2.m}'); set('day2', '${p2.d}');
  })()`);
}

async function startFromSetup() {
  await js(`document.querySelector('#setup-form button[type=submit]').click()`);
  await waitFor(`!document.querySelector('#game').hidden`);
}

function clickCell(idx) { return js(`document.querySelector('#board .cell[data-idx="${idx}"]').click()`); }
function settled() {
  return waitFor(
    `document.body.dataset.busy !== '1' || document.querySelector('dialog[open]') || !document.querySelector('#adjust').hidden`,
  );
}
function stoneCount() { return js(`document.querySelectorAll('#board .stone').length`); }
function todayText() { return js(`document.querySelector('#today-date').textContent`); }
function noHorizontalScroll() { return js(`document.documentElement.scrollWidth <= window.innerWidth`); }

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(new URL(`${name}.png`, OUT), Buffer.from(data, 'base64'));
}

function check(ok, message) {
  if (!ok) failures.push(message);
}

// 決着がつくまで打つ。ポップアップ・日数調整・選択は最初の選択肢で進める。
async function playToEnd() {
  for (let step = 0; step < 400; step++) {
    if (await js(`document.querySelector('#result-dialog').open`)) return true;
    if (await js(`document.querySelector('#event-dialog').open`)) {
      await js(`document.querySelector('#event-dialog button').click()`);
    } else if (await js(`!document.querySelector('#adjust').hidden`)) {
      await js(`document.querySelector('#adjust .adjust-row button').click()`);
    } else if (await js(`document.querySelector('#board .cell.target') !== null`)) {
      await js(`document.querySelector('#board .cell.target').click()`);
    } else {
      await js(`document.querySelector('#board .cell:not(.has-stone)').click()`);
    }
    await settled();
  }
  return false;
}
