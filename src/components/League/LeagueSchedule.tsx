'use client';

import type { LeagueState } from '@/league/types';
import { LeagueManager } from '@/league/LeagueManager';

interface Props {
  leagueState: LeagueState;
  onStartMatch: (matchId: number) => void;
}

export function LeagueSchedule({ leagueState, onStartMatch }: Props) {
  const totalRounds = 7;

  return (
    <div className="space-y-6">
      {Array.from({ length: totalRounds }, (_, round) => {
        const matches = LeagueManager.getRoundMatches(leagueState, round);
        const isCurrent = round === leagueState.currentRound;
        const isPast = round < leagueState.currentRound;

        return (
          <div
            key={round}
            className={`rounded-lg border ${
              isCurrent
                ? 'border-yellow-500 bg-yellow-900/10'
                : isPast
                  ? 'border-gray-700 bg-gray-800/30'
                  : 'border-gray-700 bg-gray-800/10'
            }`}
          >
            <div className={`px-4 py-2 font-bold text-sm ${
              isCurrent ? 'text-yellow-400' : isPast ? 'text-gray-400' : 'text-gray-500'
            }`}>
              第{round + 1}節
              {isCurrent && <span className="ml-2 text-xs bg-yellow-500 text-black px-2 py-0.5 rounded">現在</span>}
              {leagueState.isComplete && round === 6 && (
                <span className="ml-2 text-xs bg-green-500 text-black px-2 py-0.5 rounded">完了</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
              {matches.map(match => {
                const homeTeam = LeagueManager.getTeam(match.homeTeamId);
                const awayTeam = LeagueManager.getTeam(match.awayTeamId);
                if (!homeTeam || !awayTeam) return null;

                const hasResult = match.result !== null;
                const canPlay = isCurrent && !hasResult && !leagueState.isComplete;

                return (
                  <div
                    key={match.matchId}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      hasResult ? 'bg-gray-700/50' : canPlay ? 'bg-gray-700/30' : 'bg-gray-800/30'
                    }`}
                  >
                    {/* ホームチーム */}
                    <div className={`text-right flex-1 ${
                      hasResult && match.result?.winner === 'home' ? 'text-green-400 font-bold' : 'text-gray-300'
                    }`}>
                      <span className="text-xs text-gray-500 mr-1">{homeTeam.abbr}</span>
                      {homeTeam.name}
                    </div>

                    {/* スコアまたはVS */}
                    <div className="mx-3 min-w-[60px] text-center">
                      {hasResult ? (
                        <span className="font-mono font-bold text-white">
                          {match.result!.homeScore} - {match.result!.awayScore}
                        </span>
                      ) : canPlay ? (
                        <button
                          onClick={() => onStartMatch(match.matchId)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors"
                        >
                          対戦
                        </button>
                      ) : (
                        <span className="text-gray-600 text-xs">vs</span>
                      )}
                    </div>

                    {/* アウェイチーム */}
                    <div className={`text-left flex-1 ${
                      hasResult && match.result?.winner === 'away' ? 'text-green-400 font-bold' : 'text-gray-300'
                    }`}>
                      {awayTeam.name}
                      <span className="text-xs text-gray-500 ml-1">{awayTeam.abbr}</span>
                    </div>
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
