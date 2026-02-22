/**
 * ラウンドロビン日程生成アルゴリズム
 * 8チームの総当たり1回戦: 7節 × 4試合 = 28試合
 *
 * サークル法（circle method）を使用:
 * チーム1を固定し、残り7チームを回転させてペアを生成する
 */

import type { LeagueMatch } from '@/SimulationPlay/Management/League/Types';

/**
 * 8チームのラウンドロビン日程を生成
 * @param teamIds チームIDの配列 (長さ8)
 * @returns 全28試合のLeagueMatch配列
 */
export function generateRoundRobinSchedule(teamIds: number[]): LeagueMatch[] {
  const n = teamIds.length; // 8
  const rounds = n - 1;     // 7節
  const matchesPerRound = n / 2; // 4試合/節

  // サークル法: team[0]を固定、team[1..6]を回転
  const fixed = teamIds[0];
  const rotating = teamIds.slice(1); // 7要素

  const matches: LeagueMatch[] = [];
  let matchId = 0;

  for (let round = 0; round < rounds; round++) {
    // この節のペアを生成
    // 固定チーム vs rotating[0]
    const roundMatches: [number, number][] = [];

    // ホーム/アウェイを交互に
    if (round % 2 === 0) {
      roundMatches.push([fixed, rotating[0]]);
    } else {
      roundMatches.push([rotating[0], fixed]);
    }

    // 残りのペア: rotating[i] vs rotating[n-2-i]
    for (let i = 1; i < matchesPerRound; i++) {
      const home = rotating[i];
      const away = rotating[rotating.length - i];
      roundMatches.push([home, away]);
    }

    // LeagueMatchオブジェクトに変換
    for (const [home, away] of roundMatches) {
      matches.push({
        matchId,
        round,
        homeTeamId: home,
        awayTeamId: away,
        result: null,
      });
      matchId++;
    }

    // rotating配列を右に1つ回転
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  return matches;
}
