'use client';

import { useMemo, useState } from 'react';
import { LeagueTeam } from '@/SimulationPlay/Management/Services/LeagueService';
import {
  buildTournamentData,
  TournamentData,
  TournamentMatch,
  TournamentEntry,
  PreliminaryBlock,
} from '@/SimulationPlay/Management/Services/TournamentService';

// ===== Props =====

interface TournamentBracketProps {
  leagueTeams: LeagueTeam[];
  onBack: () => void;
}

// ===== メインコンポーネント =====

export function TournamentBracket({ leagueTeams, onBack }: TournamentBracketProps) {
  const [tab, setTab] = useState<'prelim' | 'final'>('prelim');

  const data: TournamentData = useMemo(
    () => buildTournamentData(leagueTeams),
    [leagueTeams]
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
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
        <h2 className="text-lg text-gray-400 mb-6 text-center">
          全120チーム トーナメント表
        </h2>

        {/* タブ */}
        <div className="flex justify-center gap-2 mb-6">
          <button
            onClick={() => setTab('prelim')}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-colors cursor-pointer ${
              tab === 'prelim'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            予選トーナメント (16ブロック)
          </button>
          <button
            onClick={() => setTab('final')}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-colors cursor-pointer ${
              tab === 'final'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            決勝トーナメント (16チーム)
          </button>
        </div>

        {tab === 'prelim' ? (
          <PreliminarySection data={data} />
        ) : (
          <FinalSection data={data} />
        )}
      </div>
    </div>
  );
}

// ===== 予選トーナメント =====

function PreliminarySection({ data }: { data: TournamentData }) {
  const [view, setView] = useState<'teams' | 'bracket'>('teams');
  const div1Blocks = data.blocks.filter((b) => b.seedType === '1部');
  const div2Blocks = data.blocks.filter((b) => b.seedType === '2部');

  return (
    <div className="space-y-6">
      {/* 表示切替 */}
      <div className="flex justify-center gap-1">
        <button
          onClick={() => setView('teams')}
          className={`px-4 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer ${
            view === 'teams'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          チーム一覧
        </button>
        <button
          onClick={() => setView('bracket')}
          className={`px-4 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer ${
            view === 'bracket'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          トーナメント表
        </button>
      </div>

      {/* 1部ブロック */}
      <div>
        <h3 className="text-center text-sm font-bold text-blue-400 mb-1">
          1部ブロック (A〜H)
        </h3>
        <p className="text-center text-gray-500 text-xs mb-3">
          1部 + 4部（確定）+ 抽選5チーム = 7チーム / 1部はR1シード通過
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {div1Blocks.map((block) =>
            view === 'teams'
              ? <BlockTeamList key={block.blockLabel} block={block} />
              : <BlockBracket key={block.blockLabel} block={block} />
          )}
        </div>
      </div>

      {/* 2部ブロック */}
      <div>
        <h3 className="text-center text-sm font-bold text-green-400 mb-1">
          2部ブロック (I〜P)
        </h3>
        <p className="text-center text-gray-500 text-xs mb-3">
          2部 + 3部（確定）+ 抽選6チーム = 8チーム
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {div2Blocks.map((block) =>
            view === 'teams'
              ? <BlockTeamList key={block.blockLabel} block={block} />
              : <BlockBracket key={block.blockLabel} block={block} />
          )}
        </div>
      </div>
    </div>
  );
}

/** チーム一覧表示 */
function BlockTeamList({ block }: { block: PreliminaryBlock }) {
  const headerBg = block.seedType === '1部' ? 'bg-blue-900/50' : 'bg-green-900/50';
  const headerText = block.seedType === '1部' ? 'text-blue-300' : 'text-green-300';

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className={`${headerBg} px-3 py-1.5 flex items-center justify-between`}>
        <span className={`font-bold text-sm ${headerText}`}>
          ブロック {block.blockLabel}
        </span>
        <span className="text-gray-400 text-xs">
          {block.teams.length}チーム
        </span>
      </div>
      <div className="divide-y divide-gray-700/50">
        {block.teams.map((team, i) => (
          <div
            key={i}
            className={`px-3 py-1.5 text-sm flex items-center gap-2 ${
              team.isMyTeam ? 'bg-yellow-900/30' : ''
            }`}
          >
            <span className="text-gray-500 text-xs w-3">{i + 1}</span>
            {team.isMyTeam && <MyBadge />}
            <span className={`truncate ${team.isMyTeam ? 'text-yellow-300 font-bold' : ''}`}>
              {team.label}
            </span>
            <span className="text-gray-500 text-xs ml-auto shrink-0">
              {team.division}部
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** トーナメント表表示（決勝トーナメントと同じ縦書きブラケット形式） */
function BlockBracket({ block }: { block: PreliminaryBlock }) {
  const headerBg = block.seedType === '1部' ? 'bg-blue-900/50' : 'bg-green-900/50';
  const headerText = block.seedType === '1部' ? 'text-blue-300' : 'text-green-300';
  const roundLabels = ['1回戦', '2回戦', '決勝'];
  const reversedRounds = [...block.rounds].reverse();

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className={`${headerBg} px-3 py-1.5 flex items-center justify-between`}>
        <span className={`font-bold text-sm ${headerText}`}>
          ブロック {block.blockLabel}
        </span>
        <span className="text-gray-400 text-xs">
          {block.seedType}シード / {block.teams.length}チーム
        </span>
      </div>

      <div className="px-3 py-3 flex flex-col items-center gap-0">
        {/* ブロック勝者 */}
        <div className="px-4 py-1 bg-yellow-600/80 rounded text-xs font-bold text-center">
          本戦進出
        </div>
        <div className="w-px h-3 bg-yellow-500/50" />

        {reversedRounds.map((round, i) => {
          const roundIdx = block.rounds.length - 1 - i;
          const isFirst = i === 0;
          const isLast = i === reversedRounds.length - 1;
          const cols = getBlockGridCols(round.matches.length);

          return (
            <div key={i} className="w-full flex flex-col items-center">
              {/* ラウンドラベル */}
              <div className={`px-3 py-1 rounded text-[11px] font-bold text-center ${
                isFirst ? 'bg-orange-700/60 text-orange-200' : 'bg-gray-700/60 text-gray-400'
              }`}>
                {roundLabels[roundIdx]}
              </div>

              {/* マッチカード */}
              <div className={`mt-2 mb-1 grid gap-1.5 w-full ${cols}`}>
                {round.matches.map((match, mIdx) => (
                  <VerticalMatchCard key={mIdx} match={match} />
                ))}
              </div>

              {/* byeチーム（1回戦のみ） */}
              {round.byeTeam && (
                <div className="mt-1 mb-1 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-gray-700/30">
                  {round.byeTeam.isMyTeam && <MyBadge />}
                  <span className={round.byeTeam.isMyTeam ? 'text-yellow-300 font-bold' : 'text-gray-400'}>
                    {round.byeTeam.label}
                  </span>
                  <span className="text-gray-500">{round.byeTeam.division}部</span>
                  <span className="text-gray-600 ml-1">シード通過</span>
                </div>
              )}

              {/* 上向き矢印 */}
              {!isLast && (
                <div className="flex flex-col items-center py-0.5">
                  <div className="text-gray-600 text-[10px] leading-none">▲</div>
                  <div className="w-px h-2 bg-gray-600" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getBlockGridCols(matchCount: number): string {
  if (matchCount <= 1) return 'grid-cols-1 max-w-[70px] mx-auto';
  if (matchCount <= 2) return 'grid-cols-2 max-w-[150px] mx-auto';
  if (matchCount <= 3) return 'grid-cols-3 max-w-[220px] mx-auto';
  return 'grid-cols-4 max-w-[290px] mx-auto';
}

function MyBadge() {
  return (
    <span className="text-[9px] px-1 py-0.5 bg-yellow-600 rounded text-white font-bold mr-1 inline-block leading-none align-middle">
      MY
    </span>
  );
}

// ===== 決勝トーナメント（上=優勝、下=1回戦） =====

function FinalSection({ data }: { data: TournamentData }) {
  const reversedRounds = [...data.finalRounds].reverse();

  return (
    <div>
      <p className="text-center text-gray-400 text-sm mb-6">
        予選16ブロック勝者による決勝トーナメント
      </p>

      <div className="flex flex-col items-center gap-0">
        {/* 優勝 */}
        <div className="px-8 py-3 bg-yellow-600 rounded-lg font-bold text-center text-lg">
          優勝
        </div>
        <div className="w-px h-5 bg-yellow-500" />

        {reversedRounds.map((round, i) => {
          const isFirst = i === 0;
          const isLast = i === reversedRounds.length - 1;
          const cols = getFinalGridCols(round.matches.length);

          return (
            <div key={i} className="w-full flex flex-col items-center">
              {/* ラウンドヘッダー */}
              <div className={`px-6 py-2 rounded-lg font-bold text-sm text-center ${
                isFirst ? 'bg-orange-600 text-white' : 'bg-gray-700'
              }`}>
                {round.label}
                <span className="ml-2 text-xs font-normal opacity-60">
                  ({round.matches.length}試合)
                </span>
              </div>

              {/* マッチカード群（縦書き） */}
              <div className={`mt-3 mb-1 grid gap-2 w-full ${cols}`}>
                {round.matches.map((match, matchIdx) => (
                  <VerticalMatchCard key={matchIdx} match={match} />
                ))}
              </div>

              {/* 上向き矢印 */}
              {!isLast && (
                <div className="flex flex-col items-center py-1">
                  <div className="text-gray-500 text-sm leading-none">▲</div>
                  <div className="w-px h-4 bg-gray-600" />
                </div>
              )}
            </div>
          );
        })}

        {/* 予選からの流入 */}
        <div className="flex items-center gap-2 mt-1 mb-2">
          <div className="h-px w-8 bg-orange-500/50" />
          <span className="text-xs text-orange-400 font-bold px-3 py-1 bg-orange-900/30 rounded-full">
            ↑ 予選16ブロック勝者
          </span>
          <div className="h-px w-8 bg-orange-500/50" />
        </div>
      </div>
    </div>
  );
}

function getFinalGridCols(matchCount: number): string {
  if (matchCount <= 1) return 'grid-cols-1 max-w-[80px] mx-auto';
  if (matchCount <= 2) return 'grid-cols-2 max-w-[180px] mx-auto';
  if (matchCount <= 4) return 'grid-cols-4 max-w-[360px] mx-auto';
  return 'grid-cols-8 max-w-[700px] mx-auto';
}

function VerticalMatchCard({ match }: { match: TournamentMatch }) {
  return (
    <div className="flex justify-center border border-gray-600 rounded overflow-hidden">
      <VerticalEntry entry={match.team1} />
      <div className="w-px bg-gray-600 shrink-0" />
      <VerticalEntry entry={match.team2} />
    </div>
  );
}

function VerticalEntry({ entry }: { entry: TournamentEntry | null }) {
  if (!entry) {
    return (
      <div className="w-8 min-h-[60px] bg-gray-800 flex items-center justify-center text-gray-600 text-[10px]">
        -
      </div>
    );
  }

  const isPlaceholder = !!entry.source;

  return (
    <div className={`w-8 min-h-[60px] flex flex-col items-center justify-center py-1 ${
      entry.isMyTeam ? 'bg-yellow-900/40' : 'bg-gray-800'
    }`}>
      {entry.isMyTeam && (
        <span className="text-[8px] px-1 bg-yellow-600 rounded text-white font-bold mb-0.5 leading-tight">
          MY
        </span>
      )}
      <span
        className={`text-[11px] leading-tight ${
          entry.isMyTeam
            ? 'text-yellow-200 font-bold'
            : isPlaceholder
              ? 'text-gray-500'
              : 'text-gray-300'
        }`}
        style={{ writingMode: 'vertical-rl' }}
      >
        {entry.label}
      </span>
    </div>
  );
}
