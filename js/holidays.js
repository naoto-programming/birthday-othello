import { dayNum, weekday } from './dates.js';

// その月の第 n 月曜日
export function nthMonday(y, m, n) {
  const first = dayNum(y, m, 1);
  const toMonday = (8 - weekday(first)) % 7;
  return first + toMonday + (n - 1) * 7;
}

// 春分の日・秋分の日の近似式(1980〜2099年で使える)
function equinoxDay(y, m, constant) {
  const d = Math.floor(constant + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  return dayNum(y, m, d);
}

export const vernalEquinoxDay = (y) => equinoxDay(y, 3, 20.8431);
export const autumnalEquinoxDay = (y) => equinoxDay(y, 9, 23.2488);

// イベント表の日付ルールを、その年の日付(通し番号)にする
export function resolveRule(rule, y) {
  switch (rule.type) {
    case 'fixed': return dayNum(y, rule.m, rule.d);
    case 'nthMonday': return nthMonday(y, rule.m, rule.n);
    case 'vernalEquinox': return vernalEquinoxDay(y);
    case 'autumnalEquinox': return autumnalEquinoxDay(y);
    default: throw new Error(`unknown rule type: ${rule.type}`);
  }
}
