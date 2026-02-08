'use client';

import type { LeagueState } from '@/league/types';
import { LeagueManager } from '@/league/LeagueManager';

interface Props {
  leagueState: LeagueState;
}

export function LeagueStarChart({ leagueState }: Props) {
  const teams = leagueState.teams;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-700 text-gray-200">
            <th className="px-2 py-2 text-left min-w-[80px]">チーム</th>
            {teams.map(t => (
              <th key={t.id} className="px-2 py-2 text-center min-w-[50px]">
                {t.abbr}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map(rowTeam => (
            <tr key={rowTeam.id} className="border-b border-gray-700">
              <td className="px-2 py-2 font-bold text-white bg-gray-800">
                {rowTeam.abbr}
                <span className="ml-1 text-gray-400 font-normal">{rowTeam.name}</span>
              </td>
              {teams.map(colTeam => {
                if (rowTeam.id === colTeam.id) {
                  return (
                    <td key={colTeam.id} className="px-2 py-2 text-center bg-gray-900 text-gray-600">
                      -
                    </td>
                  );
                }

                const h2h = LeagueManager.getHeadToHead(leagueState, rowTeam.id, colTeam.id);

                if (h2h.result === null) {
                  return (
                    <td key={colTeam.id} className="px-2 py-2 text-center text-gray-500">
                      -
                    </td>
                  );
                }

                return (
                  <td
                    key={colTeam.id}
                    className={`px-2 py-2 text-center font-bold ${
                      h2h.result === 'win'
                        ? 'text-green-400 bg-green-900/20'
                        : 'text-red-400 bg-red-900/20'
                    }`}
                  >
                    <div>{h2h.result === 'win' ? '○' : '●'}</div>
                    {h2h.score && (
                      <div className="text-[10px] text-gray-400 font-normal">{h2h.score}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
