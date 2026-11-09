// ヘッドレス Chrome で画面を開いて操作し、エラーがないことを確かめ、スクリーンショットを保存する。
// 使い方: caffeinate -i npm run smoke(公開版を確かめるときは SMOKE_URL=https://... を付ける)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';
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
  // バックグラウンド扱いによるタイマーの抑制を切る(長い演出の途中で止まらないように)
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
    // confirm() などのダイアログは既定では止まってしまうので、自動で「OK」を押す
    if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
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
  // 1. スマホ幅: 設定 → 空の盤面 → 予告 → 決定、序盤の3手
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  const setupText = await js(`document.querySelector('#setup-preview').textContent`);
  check(
    setupText.includes('黒: たろう(10/14)') && setupText.includes('白: はなこ(12/3)') && setupText.includes('間は50日、25マス(1マス=2日)'),
    `設定の確認文が想定と違います: ${setupText}`,
  );
  check(await noHorizontalScroll(), '設定画面(390px)が横にスクロールします');
  await shot('phone-setup');
  await startFromSetup();
  check(await stoneCount() === 0, `空の盤面から始まっていません: 石の数 ${await stoneCount()}`);
  check(await js(`document.querySelector('#square-size').textContent`) === '1マス=2日', '上部の帯に「1マス=2日」が出ていません');
  check(await js(`document.querySelector('#board .cell.is-today .today-tag') !== null`), '今日のマスに「今日」の札がありません');
  check(await js(`document.querySelectorAll('#board .cell.in-period').length`) === 1, '1マス=2日のとき、今のマスの期間に色がついていません');
  const before = await todayText();
  await tapCell(27);
  check(await stoneCount() === 0, '予告しただけで石が置かれています');
  check(await js(`document.querySelector('#board .cell[data-idx="27"] .stone.ghost') !== null`), '予告の半透明の石が出ていません');
  check(!(await js(`document.querySelector('#preview-panel').hidden`)), '予告パネルが出ていません');
  check(await panelText().then((t) => t.includes('挟める手がない')), `空の盤面での予告文がおかしいです: ${await panelText()}`);
  // 日付が動かない予告(今のマスのまま)では、今日のマスの金色の点滅がピンクの dest 点滅などに上書きされてはいけない
  check(
    (await js(`getComputedStyle(document.querySelector('#board .cell.is-today')).animationName`)).includes('today-pulse'),
    '日付が動かない予告中、今日のマスの金色の点滅が消えています',
  );
  check(
    await js(`document.querySelector('#board .cell.is-today').classList.contains('dest')`) === false,
    '日付が動かない予告で、今日のマス自身が dest 扱いになっています',
  );
  await tapCell(36);
  check(await stoneCount() === 0, '別のマスをタップしただけで石が置かれています');
  check(await js(`document.querySelector('#board .cell[data-idx="36"] .stone.ghost') !== null`), '予告が別のマスに切り替わっていません');
  await shot('phone-preview');
  await tapCell(36);
  await settled();
  check(await stoneCount() === 1, '同じマスの2回目のタップで石が置かれていません');
  check(await js(`document.querySelector('#preview-panel').hidden`), '打った後も予告パネルが残っています');
  await playCell(28);
  await playCell(20);
  check(await stoneCount() === 3, `3手打った後の石の数が3ではありません: ${await stoneCount()}`);
  check(await todayText() !== before, `石を返しても日付が変わっていません: ${before}`);
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
    cell(19).click(); cell(19).click(); cell(20).click(); cell(20).click();
  })()`);
  await settled();
  check(await stoneCount() === 1, `連打で2手以上打てています: 石の数 ${await stoneCount()}`);
  check(await noHorizontalScroll(), '対戦画面(320px)が横にスクロールします');
  await shot('small-game');

  // 3. PC 幅
  await open(1280, 800);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  await startFromSetup();
  await shot('pc-game');

  // 4. 返す列を選ぶ(6/1 と 6/20。間にイベントがない)。黒が (3,5)=29 に置くと、左の列(28)と下の列(37)を挟める
  await open(390, 844);
  await fillSetup({ name: 'れつ', m: 6, d: 1 }, { name: 'えらび', m: 6, d: 20 });
  await startFromSetup();
  for (const idx of [27, 28, 45, 37]) await playCell(idx);
  await tapCell(29);
  check(await js(`document.querySelectorAll('#board .cell.line-on').length`) === 2, '2つの列が予告されていません');
  check(await panelText().then((t) => t.includes('2枚返して')), `2列を返す予告文になっていません: ${await panelText()}`);
  // 予告中は直前手(37、この一つ前の playCell)のマーカー(last)を出さない(will-flip のピンクのリングと紛らわしいため)
  check(
    !(await js(`document.querySelector('#board .cell[data-idx="37"]').classList.contains('last')`)),
    '予告中に直前手のマーカー(last)が残っています',
  );
  await tapCell(37);
  check(await js(`document.querySelectorAll('#board .cell.line-on').length`) === 1, '列の石をタップしても列が外れません');
  check(await js(`document.querySelectorAll('#board .cell.line-off').length`) === 1, '外した列が点線になっていません');
  check(await panelText().then((t) => t.includes('1枚返して')), `列を外した後の予告文になっていません: ${await panelText()}`);
  await tapCell(28);
  check(await js(`document.querySelectorAll('#board .cell.line-on').length`) === 1, '最後の1列が外れてしまいました');
  await shot('phone-lines');
  await js(`document.querySelector('#preview-panel [data-pv="confirm"]').click()`);
  await settled();
  check(await js(`document.querySelector('#board .cell[data-idx="28"] .stone').classList.contains('black')`), '選んだ列の石が返っていません');
  check(await js(`document.querySelector('#board .cell[data-idx="37"] .stone').classList.contains('white')`), '外した列の石まで返っています');
  check(await js(`document.querySelector('#board .cell[data-idx="29"]').classList.contains('last')`), '決定後、直前手のマーカー(last)が付いていません');
  await tapCell(0);
  await js(`document.querySelector('#preview-panel [data-pv="cancel"]').click()`);
  check(await js(`document.querySelector('#preview-panel').hidden`), '「やめる」で予告が消えません');
  check(await js(`document.querySelector('#board .stone.ghost') === null`), '「やめる」の後も半透明の石が残っています');

  // 5. イベント: 10/28 と 11/5(開始 11/1、1マス=1日)。黒の3手目で 10/31 ハロウィンに止まる
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 28 }, { name: 'はなこ', m: 11, d: 5 });
  await startFromSetup();
  await playCell(27);
  await playCell(28);
  await playCell(29);
  check(await js(`document.querySelector('#event-dialog').open`), 'ハロウィンに止まってもイベントのポップアップが出ません');
  check((await js(`document.querySelector('#event-title').textContent`)).includes('ハロウィン'), 'イベント名がハロウィンではありません');
  await shot('phone-event');
  await js(`document.querySelector('#event-dialog button').click()`);
  await settled();
  check((await js(`document.querySelector('#status-black').textContent`)).includes('2倍'), '黒の次の手に「2倍」が表示されていません');
  await playCell(26);
  check(await todayText() === '10月31日', `挟める手がない白の手で日付が動いています: ${await todayText()}`);
  await playCell(25);
  check(await todayText() === '10月29日', `2倍が効いた後の日付が 10月29日 ではありません: ${await todayText()}`);

  // 6. 最後まで打って結果を出し、再戦 → 2回目は Esc 相当で閉じて設定に戻る
  // playToEnd() は何十手も自動で打ち続けるため実時間のタイマーに依存する時間が長くなる。
  // ヘッドレス Chrome のタイマー配送が(App Nap 等で)たまに大きく遅延すると settled() が
  // 本物のタイムアウトで落ちることがあるため、シナリオ6・7の自動進行中は「動きを減らす」設定にして
  // wait() を即解決させ、celebrate() の花火も省いて、タイマー配送に依存しないようにする。
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  check(await playToEnd(), '最後まで打っても結果が出ません');
  const title = await js(`document.querySelector('#result-title').textContent`);
  check(title.includes('お誕生日おめでとう') || title.includes('引き分け'), `結果の見出しがおかしいです: ${title}`);
  // 「動きを減らす」設定では紙吹雪が落ちてこない(.confetti span の fall アニメーションで初めて
  // ダイアログ内に入る)ため、結果のスクリーンショットだけは通常の動きに戻し、紙吹雪が落ちてきてから撮る
  await send('Emulation.setEmulatedMedia', { features: [] });
  await sleep(600);
  await shot('phone-result');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await js(`document.querySelector('#result-dialog button[value=rematch]').click()`);
  await waitFor(`!document.querySelector('#result-dialog').open && document.querySelectorAll('#board .stone').length === 0`, 3000).catch(() => {});
  check(await stoneCount() === 0, '再戦で盤面が空になっていません');
  check(await playToEnd(), '再戦で最後まで打っても結果が出ません');
  await js(`document.querySelector('#result-dialog').close()`);
  await waitFor(`!document.querySelector('#setup').hidden`, 2000).catch(() => {});
  check(await js(`!document.querySelector('#setup').hidden`), 'ボタン以外で結果を閉じたとき設定画面に戻りません(前回の再戦が残っています)');

  // 7. 半年離れた誕生日で最後まで
  await open(320, 640);
  await fillSetup({ name: 'あいうえおかきくけこ', m: 1, d: 1 }, { name: 'さしすせそたちつてと', m: 7, d: 1 });
  await startFromSetup();
  check(await playToEnd(), '半年離れた誕生日で最後まで打っても結果が出ません');
  await send('Emulation.setEmulatedMedia', { features: [] });
  // 通常の動きに戻した瞬間からダイアログの pop-in(0.35秒)が始まるので、出きってから撮る
  await sleep(500);
  await shot('small-result');

  // 8. ルール画面
  await js(`document.querySelector('#result-dialog button[value=setup]').click()`);
  await js(`document.querySelector('#setup [data-action="rules"]').click()`);
  check(await js(`document.querySelectorAll('#rules-events li').length`) === 23, 'ルール画面のイベント一覧が23件ではありません');
  check(await js(`document.querySelector('#rules-dialog').scrollTop`) === 0, 'ルールダイアログが先頭にスクロールしていません');
  await shot('small-rules');

  // 9. 調整つきの予告(11/1 と 11/7、1マス=1日)。黒の3手目で 11/3 文化の日に止まり、次の黒の手で調整が出る
  await open(375, 553);
  await fillSetup({ name: 'くろ', m: 11, d: 1 }, { name: 'しろ', m: 11, d: 7 });
  await startFromSetup();
  await playCell(27);
  await playCell(28);
  await playCell(29);
  check(await js(`document.querySelector('#event-dialog').open`), '文化の日のイベントが発動しません');
  await js(`document.querySelector('#event-dialog button').click()`);
  await settled();
  await playCell(26);
  await tapCell(25);
  await waitFor(`document.querySelector('#preview-panel .adjust-row') !== null`);
  const panelRect = await js(`(() => {
    const r = document.querySelector('#preview-panel').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  })()`);
  check(panelRect.top >= 0 && panelRect.bottom <= 553, `予告パネルが375x553の画面からはみ出しています: ${JSON.stringify(panelRect)}`);
  check(await js(`document.querySelectorAll('#preview-panel .adjust-row button').length`) === 7, '調整のボタンが7つではありません');
  await js(`document.querySelector('#preview-panel [data-adjust="2"]').click()`);
  check(await panelText().then((t) => t.includes('3マス動く')), `調整+2が予告に反映されていません: ${await panelText()}`);
  await shot('adjust-visible');
  // 予告中に「設定に戻る」で中断しても、次の対戦に残らない
  await js(`document.querySelector('[data-action="quit"]').click()`);
  await waitFor(`!document.querySelector('#setup').hidden`);
  check(await js(`document.body.dataset.busy`) !== '1', '予告中に中断しても busy が残っています');
  await startFromSetup();
  check(await stoneCount() === 0, '中断後の新しい対戦が空の盤面になっていません');
  check(await js(`document.querySelector('#preview-panel').hidden`), '中断後の新しい対戦に予告パネルが残っています');
  check(await js(`document.querySelector('#board .stone.ghost') === null`), '中断後の新しい対戦に半透明の石が残っています');
  await playCell(20);
  check(await stoneCount() === 1, '中断後の新しい対戦で打てません');

  // 10. 演出中に「設定に戻る」で中断し、演出が終わる前に新しい対戦を始めても上書きされない
  await open(400, 700);
  await fillSetup({ name: 'アニメ太郎', m: 3, d: 1 }, { name: 'アニメ花子', m: 9, d: 1 });
  await startFromSetup();
  await tapCell(27);
  await js(`(() => {
    document.querySelector('#board .cell[data-idx="27"]').click();
    document.querySelector('[data-action="quit"]').click();
    document.querySelector('#setup-form button[type=submit]').click();
  })()`);
  await waitFor(`!document.querySelector('#game').hidden`);
  await sleep(1500);
  check(await stoneCount() === 0, '演出中に中断して新しい対戦を始めても、盤面が上書きされます');
  check(await js(`document.querySelector('#status-black').classList.contains('active')`), '演出中に中断して新しい対戦を始めても、黒の番になっていません');
  check(await noHorizontalScroll(), '演出中断からの新しい対戦画面が横にスクロールします');

  // 11. 端末で「動きを減らす」が有効なら、打ってから盤面の更新までがすぐ終わる
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open(390, 844);
  await fillSetup({ name: 'たろう', m: 10, d: 14 }, { name: 'はなこ', m: 12, d: 3 });
  await startFromSetup();
  await tapCell(27);
  const t0 = Date.now();
  await tapCell(27);
  await settled();
  const elapsed = Date.now() - t0;
  check(elapsed < 300, `動きを減らす設定でも、打ってから更新まで ${elapsed}ms かかっています`);
  // 動きを減らす設定では celebrate() も花火を出さない
  const noFireworks = await js(`(async () => {
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    await ui.celebrate({ result: { winner: 'B' } });
    return document.querySelector('.fireworks') === null;
  })()`);
  check(noFireworks, '動きを減らす設定でも celebrate() が花火を出しています');
  await send('Emulation.setEmulatedMedia', { features: [] });

  // 13. 返す石は置いたマスに近い順に1枚ずつ返る(6/1 と 6/20。間にイベントがない)。勝利の花火が出て消える
  await open(390, 844);
  await fillSetup({ name: 'れつ', m: 6, d: 1 }, { name: 'えらび', m: 6, d: 20 });
  await startFromSetup();
  for (const idx of [27, 28, 45, 37]) await playCell(idx);
  await tapCell(29);
  const delays = await js(`(() => {
    document.querySelector('#board .cell[data-idx="29"]').click();
    return [...document.querySelectorAll('#board .stone.flip-to-black')].map((s) => s.style.animationDelay);
  })()`);
  check(delays.length === 2 && new Set(delays).size === 2, `返す石が順番に返っていません: ${JSON.stringify(delays)}`);
  await shot('phone-flip');
  await settled();
  const fireworks = await js(`(async () => {
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    const done = ui.celebrate({ result: { winner: 'B' } });
    const during = document.querySelector('.board-wrap .fireworks') !== null;
    await done;
    return { during, after: document.querySelector('.fireworks') !== null };
  })()`);
  check(fireworks.during && !fireworks.after, `花火が出ないか、消えません: ${JSON.stringify(fireworks)}`);

  // 14. 日付演出(月またぎ+跳ね返り)の合計がおよそ1.5秒におさまる(石を返す演出は含まない animateDate 単体ではなく、
  // 実際に main.js が呼ぶ animateMove 全体で測る。間 50日・25マスの対戦で、黒が5枚(各重さ3=重さの合計15)を
  // 一気に返して11月3日→10月24日まで動き、10/14(黒の誕生日)の手前で跳ね返りつつ11月→10月の月またぎも起きる)
  await open(390, 844);
  await fillSetup({ name: 'くろ', m: 10, d: 14 }, { name: 'しろ', m: 12, d: 3 });
  await startFromSetup();
  const dateAnimMs = await js(`(async () => {
    const rules = await import(new URL('js/rules.js', document.baseURI).href);
    const dates = await import(new URL('js/dates.js', document.baseURI).href);
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    const match = dates.setupMatch(
      [{ name: 'くろ', birthday: { m: 10, d: 14 } }, { name: 'しろ', birthday: { m: 12, d: 3 } }],
      dates.dayNum(2026, 11, 3),
    );
    let st = rules.newGame(match);
    st = { ...st, board: st.board.slice() };
    st.board[30] = { color: 'B', flips: 0 };
    for (const i of [25, 26, 27, 28, 29]) st.board[i] = { color: 'W', flips: 2 };
    st.turn = 'B';
    const next = rules.playMove(st, 24);
    const t0 = performance.now();
    await ui.animateMove(next);
    return performance.now() - t0;
  })()`);
  // 実測: 修正前(ページめくり・跳ね返り待ちが1.5秒の枠の外に積み増しされていた)は約3460ms、
  // 修正後(枠の中にページめくり・跳ね返りの分も含めて配分する)は約2640msで安定している。
  // どちらとも明確に離れた 3000ms をしきい値にする(石を返す演出 約1100ms を含む)。
  check(dateAnimMs < 3000, `日付が動く演出(月またぎ+跳ね返り)が長すぎます: ${dateAnimMs}ms`);

  // 14b. 動きを減らす設定では、上と同じ手(月またぎ+跳ね返りを含む)でも、フリップの一時停止・日付のコマ送り・
  // ページめくり・跳ね返りの待ちがすべて省かれてすぐ終わる(待ちのどれかが wait() の代わりに sleep() を
  // 使ってしまう退行を検知する。scenario 11 は0フリップの最初の1手しか見ていないので、ここで別途確かめる)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reducedDateAnimMs = await js(`(async () => {
    const rules = await import(new URL('js/rules.js', document.baseURI).href);
    const dates = await import(new URL('js/dates.js', document.baseURI).href);
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    const match = dates.setupMatch(
      [{ name: 'くろ', birthday: { m: 10, d: 14 } }, { name: 'しろ', birthday: { m: 12, d: 3 } }],
      dates.dayNum(2026, 11, 3),
    );
    let st = rules.newGame(match);
    st = { ...st, board: st.board.slice() };
    st.board[30] = { color: 'B', flips: 0 };
    for (const i of [25, 26, 27, 28, 29]) st.board[i] = { color: 'W', flips: 2 };
    st.turn = 'B';
    const next = rules.playMove(st, 24);
    const t0 = performance.now();
    await ui.animateMove(next);
    return performance.now() - t0;
  })()`);
  check(
    reducedDateAnimMs < 150,
    `動きを減らす設定でも、月またぎ+跳ね返りを含む手の演出に ${reducedDateAnimMs}ms かかっています(wait() の代わりに sleep() を使っている可能性)`,
  );
  await send('Emulation.setEmulatedMedia', { features: [] });

  // 15. 勝利の花火が流れている間に「設定に戻る」で中断しても、古い対戦の結果ダイアログを開こうとしてエラーにならない
  await open(390, 844);
  await fillSetup({ name: 'くろ', m: 10, d: 28 }, { name: 'しろ', m: 10, d: 30 });
  await js(`(() => {
    const f = document.querySelector('#setup-form');
    f.start.value = '2026-10-29';
    f.start.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await startFromSetup();
  await playCell(27);
  await playCell(28);
  await tapCell(29);
  await tapCell(29);
  await waitFor(`document.querySelector('.board-wrap .fireworks') !== null`);
  const errorsBeforeQuit = pageErrors.length;
  await js(`document.querySelector('[data-action="quit"]').click()`);
  await sleep(2000);
  check(await js(`!document.querySelector('#setup').hidden`), '花火の演出中に中断しても設定画面に戻りません');
  check(!(await js(`document.querySelector('#result-dialog').open`)), '花火の演出中に中断したのに結果ダイアログが開いています');
  check(
    pageErrors.length === errorsBeforeQuit,
    `花火の演出中に中断するとページのエラーが発生します: ${JSON.stringify(pageErrors.slice(errorsBeforeQuit))}`,
  );

  // 16. 今日のマスの金色の枠(I1: 動きを減らす設定での行き先の印、I2: 予告の列が今日のマスを通るとき)。
  // 本物の対局の流れでは今日のマスと列の通り道を重ねにくいので、rules.js/dates.js で専用の盤面を直接組み立てる。
  // baseDay=1/1・N=D=30・p=28 なら今日は1/29(idx 28)。idx 28 を 黒27・白28・白37・黒45 で (3,5)=29 に黒を置く
  // (rules.test.js の TWO_LINES と同じ並び)と、今日のマス(idx 28)自身が予告の列(line-on)になり、
  // 行き先(idx 26, 1/27)は今日とは別のマスになる。
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await open(390, 844);
  await fillSetup({ name: 'くろ', m: 10, d: 14 }, { name: 'しろ', m: 12, d: 3 });
  await startFromSetup();
  const todayLineDest = await js(`(async () => {
    const dates = await import(new URL('js/dates.js', document.baseURI).href);
    const rules = await import(new URL('js/rules.js', document.baseURI).href);
    const ui = await import(new URL('js/ui.js', document.baseURI).href);
    const baseDay = dates.dayNum(2026, 1, 1);
    const match = {
      black: { name: 'くろ', birthday: { m: 1, d: 1 }, day: baseDay },
      white: { name: 'しろ', birthday: { m: 1, d: 31 }, day: baseDay + 30 },
      baseDay, D: 30, N: 30, k: 1, u0: 28, sameBirthday: false,
    };
    let state = rules.newGame(match);
    state = { ...state, board: state.board.slice() };
    state.board[27] = { color: 'B', flips: 0, fixed: false };
    state.board[28] = { color: 'W', flips: 0, fixed: false };
    state.board[37] = { color: 'W', flips: 0, fixed: false };
    state.board[45] = { color: 'B', flips: 0, fixed: false };
    const preview = rules.previewMove(state, 29);
    ui.renderGame(state, { preview });
    const todayCell = document.querySelector('#board .cell.is-today');
    const destCell = document.querySelector('#board .cell.dest');
    return {
      todayIdx: todayCell?.dataset.idx ?? null,
      todayLineOn: todayCell?.classList.contains('line-on') ?? false,
      todayShadow: todayCell ? getComputedStyle(todayCell).boxShadow : null,
      todayAnimationName: todayCell ? getComputedStyle(todayCell).animationName : null,
      destIdx: destCell?.dataset.idx ?? null,
      destShadow: destCell ? getComputedStyle(destCell).boxShadow : null,
    };
  })()`);
  check(
    todayLineDest.todayIdx === '28' && todayLineDest.destIdx === '26',
    `想定した今日(idx 28)・行き先(idx 26)のマスになっていません: ${JSON.stringify(todayLineDest)}`,
  );
  check(todayLineDest.todayLineOn, `今日のマスが予告の列(line-on)になっていません: ${JSON.stringify(todayLineDest)}`);
  check(
    Boolean(todayLineDest.todayShadow) && todayLineDest.todayShadow.includes('rgb(255, 183, 3)'),
    `動きを減らす設定で、予告の列が通る今日のマスから金色の枠が消えています: ${todayLineDest.todayShadow}`,
  );
  check(
    todayLineDest.todayAnimationName === 'none',
    `動きを減らす設定でも、列に入った今日のマスが脈打っています: ${todayLineDest.todayAnimationName}`,
  );
  check(
    Boolean(todayLineDest.destShadow) && todayLineDest.destShadow !== 'none',
    `動きを減らす設定で、行き先のマスの印(box-shadow)が none になっています: ${todayLineDest.destShadow}`,
  );
  await shot('reduced-today-line-dest');
  await send('Emulation.setEmulatedMedia', { features: [] });

  // 17. 石を選ぶ効果(鬼は外・固定・奪う・植える)も「予告 → 決定」にする。
  // 2/1 と 2/7(1マス=1日、開始 2/4 = マス3、2/3 節分 = マス2)。
  // 27(黒)・28(白)・45(黒)・46(白)・29(黒)と打つと、黒の29が28を返して2/3に止まり、節分「鬼は外」が黒に発動する(白は46だけ残る)。
  await open(390, 844);
  await fillSetup({ name: 'おに', m: 2, d: 1 }, { name: 'そと', m: 2, d: 7 });
  await startFromSetup();
  await playCell(27);
  await playCell(28);
  await playCell(45);
  await playCell(46);
  await playCell(29);
  check(await js(`document.querySelector('#event-dialog').open`), '節分の「鬼は外」イベントが発動しません');
  await js(`document.querySelector('#event-dialog button').click()`);
  await settled();
  check(await js(`document.querySelector('#board .cell[data-idx="46"] .stone') !== null`), '鬼は外の対象を選ぶ前に石が消えています');
  check(await js(`document.querySelectorAll('#board .cell.target').length`) === 1, '鬼は外の候補(白の46だけ)が1つになっていません');
  // 46 を1回タップ: まだ確定しない。選択中として強く強調し、予告パネルに説明と「決定」「選び直す」を出す。
  await tapCell(46);
  check(await js(`document.querySelector('#board .cell[data-idx="46"] .stone') !== null`), '1回タップしただけで石が取り除かれています');
  check(!(await js(`document.querySelector('#preview-panel').hidden`)), '鬼は外の予告パネルが出ていません');
  check(await panelText().then((t) => t.includes('取り除く')), `鬼は外の予告文に「取り除く」が含まれていません: ${await panelText()}`);
  check(await js(`document.querySelector('#board .cell[data-idx="46"]').classList.contains('chosen')`), '選択中のマスが強調(chosen)されていません');
  await shot('phone-choice-pick');
  // 「選び直す」: パネルが閉じて候補の強調(target)だけに戻る。石は消えない。
  await js(`document.querySelector('#preview-panel [data-pv="cancel"]').click()`);
  check(await js(`document.querySelector('#preview-panel').hidden`), '「選び直す」で予告パネルが閉じません');
  check(await js(`document.querySelector('#board .cell[data-idx="46"]').classList.contains('chosen')`) === false, '「選び直す」の後も選択中の強調が残っています');
  check(await js(`document.querySelector('#board .cell[data-idx="46"]').classList.contains('target')`), '「選び直す」の後、候補の強調まで消えています');
  check(await js(`document.querySelector('#board .cell[data-idx="46"] .stone') !== null`), '「選び直す」で石が消えています');
  // 46 をもう1回選んで、2回目のタップで確定する
  await tapCell(46);
  await tapCell(46);
  await settled();
  check(await js(`document.querySelector('#board .cell[data-idx="46"] .stone') === null`), '2回目のタップで46の石が消えていません');
  check(await js(`document.querySelector('#preview-panel').hidden`), '確定後も予告パネルが残っています');
  check(await js(`document.querySelector('#status-white').classList.contains('active')`), '鬼は外の確定後、白の番になっていません');

  // 12. 開発サーバーが壊れたURLでも落ちずに400を返す
  await checkServerRobustness();
}

// 壊れたURLを送っても dev サーバーが落ちず、400を返して配信を続けられることを確かめる
async function checkServerRobustness() {
  if (process.env.SMOKE_URL) return;
  const malformed = await rawGet('/%E0%A4%A').catch((err) => `error:${err.code ?? err.message}`);
  check(malformed === 400, `壊れたURL(不正なパーセントエンコーディング)で400を返しません: ${malformed}`);
  const doubleSlash = await rawGet('//').catch((err) => `error:${err.code ?? err.message}`);
  check(doubleSlash === 400, `壊れたURL(空のホストになるパス)で400を返しません: ${doubleSlash}`);
  const stillOk = await rawGet('/index.html').catch((err) => `error:${err.code ?? err.message}`);
  check(stillOk === 200, `壊れたURLの後にサーバーが配信を続けられません: ${stillOk}`);
}

function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: APP_PORT, path, method: 'GET' }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
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

// マスを1回タップする(空きマスなら予告、予告中のマスなら決定、列の石なら列の切り替え)
function tapCell(idx) { return js(`document.querySelector('#board .cell[data-idx="${idx}"]').click()`); }
// 予告してから同じマスをもう一度タップして打ち、演出が終わるまで待つ
async function playCell(idx) {
  await tapCell(idx);
  await tapCell(idx);
  await settled();
}
// busy が外れても、勝利の花火(celebrate)はダイアログを開く前に演出が続くことがあるので、それも終わるまで待つ
function settled() {
  return waitFor(
    `(document.body.dataset.busy !== '1' && !document.querySelector('.board-wrap .fireworks')) || document.querySelector('dialog[open]')`,
  );
}
function stoneCount() { return js(`document.querySelectorAll('#board .stone:not(.ghost)').length`); }
function todayText() { return js(`document.querySelector('#today-date').textContent`); }
function panelText() { return js(`document.querySelector('#preview-panel').textContent`); }
function noHorizontalScroll() { return js(`document.documentElement.scrollWidth <= window.innerWidth`); }

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(new URL(`${name}.png`, OUT), Buffer.from(data, 'base64'));
}

function check(ok, message) {
  if (!ok) failures.push(message);
}

// 決着がつくまで打つ。ポップアップは閉じ、選ぶ効果は最初の候補を選び、手は最初の空きマスに予告→決定で打つ。
async function playToEnd() {
  for (let step = 0; step < 400; step++) {
    if (await js(`document.querySelector('#result-dialog').open`)) return true;
    if (await js(`document.querySelector('#event-dialog').open`)) {
      await js(`document.querySelector('#event-dialog button').click()`);
    } else if (await js(`document.querySelector('#board .cell.target') !== null`)) {
      const idx = await js(`document.querySelector('#board .cell.target').dataset.idx`);
      await tapCell(Number(idx));
      await tapCell(Number(idx));
    } else {
      const idx = await js(`document.querySelector('#board .cell:not(.has-stone)')?.dataset.idx ?? null`);
      if (idx === null) {
        await sleep(100);
        continue;
      }
      await tapCell(Number(idx));
      await tapCell(Number(idx));
    }
    await settled();
  }
  return false;
}
