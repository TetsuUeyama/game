// ===== 型定義 =====

export type EventType = 'springLeague' | 'leagueTournament' | 'fallLeague' | 'prelim' | 'final';

export interface ScheduleEvent {
  date: Date;
  type: EventType;
  label: string;
}

// ===== スケジュール生成 =====

/**
 * シーズンスケジュールを生成（4月〜翌3月）。
 *
 * 春リーグ戦（7節）: 毎週土曜（4月〜5月）
 * リーグ内トーナメント（3回戦）: 土・水・土（6月）
 * 秋リーグ戦（7節）: 毎週土曜（9月〜10月）
 * 全体予選トーナメント（3回戦）: 水・土・水（11月）
 * 全体決勝トーナメント（4回戦）: 土・水・土・日（11月〜12月）
 */
export function buildSeasonSchedule(year: number = 2026): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];

  // ===== 春リーグ戦（4月〜5月） =====
  const springBase = new Date(year, 3, 1); // 4月1日
  const springFirstSat = firstWeekdayOnOrAfter(springBase, 6);

  let sat = new Date(springFirstSat);
  for (let i = 0; i < 7; i++) {
    events.push({ date: new Date(sat), type: 'springLeague', label: `春リーグ第${i + 1}節` });
    sat.setDate(sat.getDate() + 7);
  }

  // ===== リーグ内トーナメント（春リーグ後、土・水・土） =====
  const ltSat1 = nextWeekday(sat, 6);
  events.push({ date: new Date(ltSat1), type: 'leagueTournament', label: 'リーグT 準決勝' });

  const ltWed = nextWeekday(ltSat1, 3);
  events.push({ date: new Date(ltWed), type: 'leagueTournament', label: 'リーグT 決勝' });

  // ===== 秋リーグ戦（9月〜10月） =====
  const fallBase = new Date(year, 8, 1); // 9月1日
  const fallFirstSat = firstWeekdayOnOrAfter(fallBase, 6);

  sat = new Date(fallFirstSat);
  for (let i = 0; i < 7; i++) {
    events.push({ date: new Date(sat), type: 'fallLeague', label: `秋リーグ第${i + 1}節` });
    sat.setDate(sat.getDate() + 7);
  }

  // ===== 全体予選トーナメント（秋リーグ後、水・土・水） =====
  const prelimWed1 = nextWeekday(sat, 3);
  events.push({ date: new Date(prelimWed1), type: 'prelim', label: '予選1回戦' });

  const prelimSat = nextWeekday(prelimWed1, 6);
  events.push({ date: new Date(prelimSat), type: 'prelim', label: '予選2回戦' });

  const prelimWed2 = nextWeekday(prelimSat, 3);
  events.push({ date: new Date(prelimWed2), type: 'prelim', label: '予選決勝' });

  // ===== 全体決勝トーナメント（土・水・土・日） =====
  const finalSat1 = nextWeekday(prelimWed2, 6);
  events.push({ date: new Date(finalSat1), type: 'final', label: '決勝T 1回戦' });

  const finalWed = nextWeekday(finalSat1, 3);
  events.push({ date: new Date(finalWed), type: 'final', label: '準々決勝' });

  const finalSat2 = nextWeekday(finalWed, 6);
  events.push({ date: new Date(finalSat2), type: 'final', label: '準決勝' });

  const finalSun = new Date(finalSat2);
  finalSun.setDate(finalSun.getDate() + 1);
  events.push({ date: new Date(finalSun), type: 'final', label: '決勝' });

  return events;
}

/** date 以降で最も近い指定曜日を返す（date 自身は含まない）。0=日,1=月,...6=土 */
function nextWeekday(date: Date, weekday: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** date 当日 or 以降で最も近い指定曜日を返す */
function firstWeekdayOnOrAfter(date: Date, weekday: number): Date {
  const d = new Date(date);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// ===== カレンダー用ヘルパー =====

/** 指定月のカレンダーグリッド用日付配列（月曜始まり・前後パディング付き） */
export function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  // 月曜始まり: getDay() 0=日→6, 1=月→0, ...
  const startPad = (first.getDay() + 6) % 7;
  const endPad = (7 - ((last.getDay() + 6) % 7) - 1) % 7;

  const days: Date[] = [];

  // 前月パディング
  for (let i = startPad; i > 0; i--) {
    const d = new Date(first);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  // 当月
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // 翌月パディング
  for (let i = 1; i <= endPad; i++) {
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + i));
  }

  return days;
}

/** 2つのDateが同じ日か */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
