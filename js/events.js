import { fromDayNum } from './dates.js';
import { resolveRule } from './holidays.js';

// 効果の部品。イベント表はこの ID を割り当てる。
export const EFFECTS = {
  plus3: { name: '日数プラス', text: '自分の次の手で動く日数が+3日' },
  double: { name: '日数2倍', text: '自分の次の手で動く日数が2倍' },
  adjust: { name: '日数調整', text: '自分の次の手で、動く日数を−3〜+3日の範囲で選べる' },
  extraTurn: { name: 'もう一手', text: '続けてもう1回打てる' },
  rest: { name: 'おやすみ', text: '相手の次の手は日付が動かない' },
  reverse: { name: 'うそ', text: '相手の次の手は日付が逆向きに動く' },
  middle: { name: '真ん中へ', text: '日付が2人の誕生日のちょうど真ん中に飛ぶ' },
  remove: { name: '鬼は外', text: '相手の石を1つ選んで取り除く' },
  fix: { name: '固定', text: '自分の石を1つ選んで固定する(以後は裏返らない)' },
  steal: { name: '奪う', text: '相手の石を1つ選んで自分の色にする' },
  resetWeights: { name: '重さリセット', text: '盤面のすべての石の重さが1に戻る' },
  plant: { name: '植える', text: '空きマスを1つ選んで自分の石を置く' },
};

// イベント一覧。holiday: true は国民の祝日。
// 日付ルール: fixed(月日)/ nthMonday(その月の第n月曜)/ vernalEquinox(春分の日)/ autumnalEquinox(秋分の日)
export const EVENTS = [
  { rule: { type: 'fixed', m: 1, d: 1 }, occasion: '元日', name: 'お年玉', effect: 'plus3', holiday: true },
  { rule: { type: 'nthMonday', m: 1, n: 2 }, occasion: '成人の日', name: '大人の一歩', effect: 'double', holiday: true },
  { rule: { type: 'fixed', m: 2, d: 3 }, occasion: '節分', name: '鬼は外', effect: 'remove', holiday: false },
  { rule: { type: 'fixed', m: 2, d: 11 }, occasion: '建国記念の日', name: '国づくり', effect: 'plant', holiday: true },
  { rule: { type: 'fixed', m: 2, d: 23 }, occasion: '天皇誕生日', name: 'お祝い', effect: 'double', holiday: true },
  { rule: { type: 'fixed', m: 3, d: 3 }, occasion: 'ひな祭り', name: 'ひな飾り', effect: 'fix', holiday: false },
  { rule: { type: 'vernalEquinox' }, occasion: '春分の日', name: '昼と夜が同じ', effect: 'middle', holiday: true },
  { rule: { type: 'fixed', m: 4, d: 1 }, occasion: 'エイプリルフール', name: 'うそ', effect: 'reverse', holiday: false },
  { rule: { type: 'fixed', m: 4, d: 29 }, occasion: '昭和の日', name: 'なつかしの昔', effect: 'resetWeights', holiday: true },
  { rule: { type: 'fixed', m: 5, d: 3 }, occasion: '憲法記念日', name: 'きまりを守る', effect: 'fix', holiday: true },
  { rule: { type: 'fixed', m: 5, d: 4 }, occasion: 'みどりの日', name: '植樹', effect: 'plant', holiday: true },
  { rule: { type: 'fixed', m: 5, d: 5 }, occasion: 'こどもの日', name: 'こいのぼり', effect: 'extraTurn', holiday: true },
  { rule: { type: 'fixed', m: 7, d: 7 }, occasion: '七夕', name: '織姫と彦星', effect: 'middle', holiday: false },
  { rule: { type: 'nthMonday', m: 7, n: 3 }, occasion: '海の日', name: '引き潮', effect: 'reverse', holiday: true },
  { rule: { type: 'fixed', m: 8, d: 11 }, occasion: '山の日', name: '頂上をめざして', effect: 'plus3', holiday: true },
  { rule: { type: 'nthMonday', m: 9, n: 3 }, occasion: '敬老の日', name: '年の功', effect: 'adjust', holiday: true },
  { rule: { type: 'autumnalEquinox' }, occasion: '秋分の日', name: '昼と夜が同じ', effect: 'middle', holiday: true },
  { rule: { type: 'nthMonday', m: 10, n: 2 }, occasion: 'スポーツの日', name: 'かけっこ', effect: 'extraTurn', holiday: true },
  { rule: { type: 'fixed', m: 10, d: 31 }, occasion: 'ハロウィン', name: 'お菓子', effect: 'double', holiday: false },
  { rule: { type: 'fixed', m: 11, d: 3 }, occasion: '文化の日', name: '調整', effect: 'adjust', holiday: true },
  { rule: { type: 'fixed', m: 11, d: 23 }, occasion: '勤労感謝の日', name: 'おやすみ', effect: 'rest', holiday: true },
  { rule: { type: 'fixed', m: 12, d: 25 }, occasion: 'クリスマス', name: 'プレゼント', effect: 'steal', holiday: false },
  { rule: { type: 'fixed', m: 12, d: 31 }, occasion: '大晦日', name: '年越し', effect: 'resetWeights', holiday: false },
];

// fromDay〜toDay(両端を含む)にあるイベントを日付順に返す
export function listEventDays(fromDay, toDay) {
  const found = [];
  for (let y = fromDayNum(fromDay).y; y <= fromDayNum(toDay).y; y++) {
    for (const event of EVENTS) {
      const day = resolveRule(event.rule, y);
      if (day >= fromDay && day <= toDay) found.push({ day, event });
    }
  }
  return found.sort((a, b) => a.day - b.day);
}

// ルール画面などで使う、日付ルールの表示文字
export function ruleLabel(rule) {
  switch (rule.type) {
    case 'fixed': return `${rule.m}/${rule.d}`;
    case 'nthMonday': return `${rule.m}月第${rule.n}月曜`;
    case 'vernalEquinox': return '3/20ごろ';
    case 'autumnalEquinox': return '9/23ごろ';
    default: throw new Error(`unknown rule type: ${rule.type}`);
  }
}
