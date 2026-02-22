'use client';

import type { LeagueState, TeamStanding } from '@/SimulationPlay/Management/League/Types';
import { LeagueManager } from '@/SimulationPlay/Management/League/LeagueManager';

interface Props {
  leagueState: LeagueState;
}

export function LeagueStandings({ leagueState }: Props) {
  const standings = LeagueManager.calcStandings(leagueState);

  const getTeamName = (teamId: number) =>
    leagueState.teams.find(t => t.id === teamId)?.name ?? '';

  const getTeamAbbr = (teamId: number) =>
    leagueState.teams.find(t => t.id === teamId)?.abbr ?? '';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-700 text-gray-200">
            <th className="px-3 py-2 text-center w-10">#</th>
            <th className="px-3 py-2 text-left">チーム</th>
            <th className="px-3 py-2 text-center">勝</th>
            <th className="px-3 py-2 text-center">敗</th>
            <th className="px-3 py-2 text-center">得点</th>
            <th className="px-3 py-2 text-center">失点</th>
            <th className="px-3 py-2 text-center">得失差</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s: TeamStanding, idx: number) => (
            <tr
              key={s.teamId}
              className={`border-b border-gray-700 ${
                idx === 0 ? 'bg-yellow-900/30' : idx < 3 ? 'bg-gray-800/50' : ''
              }`}
            >
              <td className="px-3 py-2 text-center font-bold text-gray-400">
                {idx + 1}
              </td>
              <td className="px-3 py-2">
                <span className="font-bold text-white">{getTeamName(s.teamId)}</span>
                <span className="ml-2 text-xs text-gray-400">{getTeamAbbr(s.teamId)}</span>
              </td>
              <td className="px-3 py-2 text-center text-green-400 font-bold">{s.wins}</td>
              <td className="px-3 py-2 text-center text-red-400 font-bold">{s.losses}</td>
              <td className="px-3 py-2 text-center text-gray-300">{s.pointsFor}</td>
              <td className="px-3 py-2 text-center text-gray-300">{s.pointsAgainst}</td>
              <td className={`px-3 py-2 text-center font-bold ${
                s.pointDiff > 0 ? 'text-green-400' : s.pointDiff < 0 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {s.pointDiff > 0 ? '+' : ''}{s.pointDiff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
