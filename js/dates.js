// 日付はタイムゾーンの影響を避けるため、UTC基準の通し番号(1970-01-01からの日数)で扱う。
const MS_PER_DAY = 86400000;

export function dayNum(y, m, d) {
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNum(n) {
  const date = new Date(n * MS_PER_DAY);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export function weekday(n) {
  return new Date(n * MS_PER_DAY).getUTCDay(); // 0=日 1=月 … 6=土
}

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// 誕生日 {m, d} のその年での日付。2/29 はうるう年以外では 2/28 として扱う。
export function birthdayInYear(birthday, y) {
  if (birthday.m === 2 && birthday.d === 29 && !isLeapYear(y)) return dayNum(y, 2, 28);
  return dayNum(y, birthday.m, birthday.d);
}

// day より前(day は含まない)で最も近い誕生日
export function prevOccurrence(birthday, day) {
  const { y } = fromDayNum(day);
  const thisYear = birthdayInYear(birthday, y);
  return thisYear < day ? thisYear : birthdayInYear(birthday, y - 1);
}

// day より後(day は含まない)で最も近い誕生日
export function nextOccurrence(birthday, day) {
  const { y } = fromDayNum(day);
  const thisYear = birthdayInYear(birthday, y);
  return thisYear > day ? thisYear : birthdayInYear(birthday, y + 1);
}

// 石が裏返るたびに重くなる量。2人の誕生日が離れているほど大きくする。
export function growthStep(D) {
  return Math.max(1, Math.round(D / 24));
}

// 開始日から過去へさかのぼって最初に出てくる誕生日の人が黒、未来へ進んで最初に出てくる誕生日の人が白。
export function setupMatch(players, start, rng = Math.random) {
  if (!Number.isFinite(start)) return { error: '開始日を入力してください。' };
  const year = fromDayNum(start).y;
  if (players.some((pl) => birthdayInYear(pl.birthday, year) === start)) {
    return { error: '開始日が誕生日と同じ日です。別の日にしてください。' };
  }
  const [a, b] = players;
  const prevA = prevOccurrence(a.birthday, start);
  const prevB = prevOccurrence(b.birthday, start);
  const sameBirthday = prevA === prevB;
  let order;
  if (sameBirthday) order = rng() < 0.5 ? [a, b] : [b, a];
  else order = prevA > prevB ? [a, b] : [b, a];
  const [blackPlayer, whitePlayer] = order;
  const baseDay = prevOccurrence(blackPlayer.birthday, start);
  const whiteDay = nextOccurrence(whitePlayer.birthday, start);
  const D = whiteDay - baseDay;
  return {
    black: { ...blackPlayer, day: baseDay },
    white: { ...whitePlayer, day: whiteDay },
    baseDay,
    D,
    p0: start - baseDay,
    s: growthStep(D),
    sameBirthday,
  };
}

// 2人の誕生日の間で、間隔が短い側の真ん中(端数は白寄り)。短い側に間の日がなければ長い側。
export function defaultStart(birthdayA, birthdayB, year) {
  const a = birthdayInYear(birthdayA, year);
  const b = birthdayInYear(birthdayB, year);
  const arcs = [
    { from: a, to: nextOccurrence(birthdayB, a) },
    { from: b, to: nextOccurrence(birthdayA, b) },
  ]
    .map((arc) => ({ ...arc, len: arc.to - arc.from }))
    .sort((x, y) => x.len - y.len);
  const arc = arcs[0].len >= 2 ? arcs[0] : arcs[1];
  return arc.from + Math.ceil(arc.len / 2);
}

// 盤面に印刷する64日分(現在の日付がある月の1日から)
export function boardDates(currentDay) {
  const { y, m } = fromDayNum(currentDay);
  const first = dayNum(y, m, 1);
  return Array.from({ length: 64 }, (_, i) => first + i);
}

export function formatMD(day) {
  const { m, d } = fromDayNum(day);
  return `${m}/${d}`;
}

export function toISODate(day) {
  const { y, m, d } = fromDayNum(day);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseISODate(text) {
  const [y, m, d] = text.split('-').map(Number);
  return dayNum(y, m, d);
}
