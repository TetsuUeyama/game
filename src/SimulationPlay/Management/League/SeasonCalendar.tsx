'use client';

import { useMemo, useState } from 'react';
import {
  buildSeasonSchedule,
  getMonthGrid,
  isSameDay,
  ScheduleEvent,
  EventType,
} from '@/SimulationPlay/Management/Services/ScheduleService';

// ===== 定数 =====

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

const EVENT_COLORS: Record<EventType, { bg: string; text: string; dot: string }> = {
  springLeague:      { bg: 'bg-orange-900/40', text: 'text-orange-300', dot: 'bg-orange-400' },
  leagueTournament:  { bg: 'bg-green-900/40',  text: 'text-green-300',  dot: 'bg-green-400' },
  fallLeague:        { bg: 'bg-cyan-900/40',    text: 'text-cyan-300',   dot: 'bg-cyan-400' },
  prelim:            { bg: 'bg-blue-900/40',    text: 'text-blue-300',   dot: 'bg-blue-400' },
  final:             { bg: 'bg-yellow-900/40',  text: 'text-yellow-300', dot: 'bg-yellow-400' },
};

// ===== Props =====

interface SeasonCalendarProps {
  onBack: () => void;
}

// ===== メインコンポーネント =====

export function SeasonCalendar({ onBack }: SeasonCalendarProps) {
  const events = useMemo(() => buildSeasonSchedule(2026), []);

  // スケジュールの月範囲を算出（4月〜翌3月だが、イベント範囲で決定）
  const seasonYear = events[0].date.getFullYear();

  const [year, setYear] = useState(seasonYear);
  const [month, setMonth] = useState(3); // 4月始まり

  // シーズン全体（4月〜翌3月）をナビ可能にする
  const monthKey = year * 12 + month;
  const startKey = seasonYear * 12 + 3;           // 4月
  const endKey = (seasonYear + 1) * 12 + 2;       // 翌年3月
  const canPrev = monthKey > startKey;
  const canNext = monthKey < endKey;

  const goPrev = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-colors cursor-pointer"
          >
            戻る
          </button>
          <h1 className="text-3xl font-bold text-center">Basketball Game</h1>
          <div className="w-16" />
        </div>
        <h2 className="text-lg text-gray-400 mb-2 text-center">
          {seasonYear}年度 シーズンカレンダー
        </h2>
        <p className="text-xs text-gray-500 mb-6 text-center">
          {seasonYear}年4月 〜 {seasonYear + 1}年3月
        </p>

        {/* 凡例 */}
        <div className="flex flex-wrap justify-center gap-3 mb-4">
          <Legend color="bg-orange-400" label="春リーグ戦" />
          <Legend color="bg-green-400" label="リーグ内T" />
          <Legend color="bg-cyan-400" label="秋リーグ戦" />
          <Legend color="bg-blue-400" label="全体予選T" />
          <Legend color="bg-yellow-400" label="全体決勝T" />
        </div>

        {/* 月ナビ */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            onClick={goPrev}
            disabled={!canPrev}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-default rounded font-bold transition-colors cursor-pointer"
          >
            ◀
          </button>
          <h3 className="text-xl font-bold min-w-[140px] text-center">
            {year}年{month + 1}月
          </h3>
          <button
            onClick={goNext}
            disabled={!canNext}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-default rounded font-bold transition-colors cursor-pointer"
          >
            ▶
          </button>
        </div>

        {/* カレンダーグリッド */}
        <MonthGrid year={year} month={month} events={events} />

        {/* スケジュール一覧 */}
        <ScheduleList events={events} />
      </div>
    </div>
  );
}

// ===== 凡例 =====

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}

// ===== 月カレンダーグリッド =====

function MonthGrid({
  year,
  month,
  events,
}: {
  year: number;
  month: number;
  events: ScheduleEvent[];
}) {
  const days = useMemo(() => getMonthGrid(year, month), [year, month]);

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden mb-6">
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-xs font-bold py-2 ${
              i === 5 ? 'text-blue-400' : i === 6 ? 'text-red-400' : 'text-gray-500'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === month;
          const dayOfWeek = (day.getDay() + 6) % 7; // 0=月 ... 6=日
          const dayEvents = events.filter((e) => isSameDay(e.date, day));
          const hasEvent = dayEvents.length > 0;

          return (
            <div
              key={i}
              className={`min-h-[72px] border-t border-gray-700 px-1 py-1 ${
                !isCurrentMonth ? 'opacity-30' : ''
              } ${hasEvent && isCurrentMonth ? 'bg-gray-750' : ''}`}
            >
              {/* 日付番号 */}
              <div className={`text-xs text-right mb-0.5 ${
                dayOfWeek === 5 ? 'text-blue-400' : dayOfWeek === 6 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {day.getDate()}
              </div>

              {/* イベント */}
              {dayEvents.map((ev, ei) => {
                const c = EVENT_COLORS[ev.type];
                return (
                  <div
                    key={ei}
                    className={`${c.bg} rounded px-1 py-0.5 mb-0.5`}
                  >
                    <span className={`text-[10px] font-bold ${c.text} leading-tight block`}>
                      {ev.label}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== スケジュール一覧 =====

const SECTION_LABELS: { type: EventType; label: string }[] = [
  { type: 'springLeague', label: '春リーグ戦' },
  { type: 'leagueTournament', label: 'リーグ内トーナメント' },
  { type: 'fallLeague', label: '秋リーグ戦' },
  { type: 'prelim', label: '全体予選トーナメント' },
  { type: 'final', label: '全体決勝トーナメント' },
];

function ScheduleList({ events }: { events: ScheduleEvent[] }) {
  return (
    <div className="space-y-4">
      {SECTION_LABELS.map(({ type, label }) => {
        const sectionEvents = events.filter((e) => e.type === type);
        if (sectionEvents.length === 0) return null;
        const c = EVENT_COLORS[type];
        return (
          <div key={type} className="bg-gray-800 rounded-xl overflow-hidden">
            <div className={`px-4 py-2 ${c.bg} font-bold text-sm ${c.text}`}>
              {label}
            </div>
            <div className="divide-y divide-gray-700">
              {sectionEvents.map((ev, i) => {
                const d = ev.date;
                const dayLabel = WEEKDAY_LABELS[(d.getDay() + 6) % 7];
                return (
                  <div key={i} className="px-4 py-2 flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${c.dot} shrink-0`} />
                    <span className="text-sm text-gray-400 w-[120px] shrink-0">
                      {d.getFullYear()}/{d.getMonth() + 1}/{d.getDate()} ({dayLabel})
                    </span>
                    <span className={`text-sm font-bold ${c.text}`}>{ev.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
