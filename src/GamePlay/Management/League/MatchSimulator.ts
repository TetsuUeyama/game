/**
 * 選手データに基づく即座のシミュレーション（5点先取）
 * GameScene を使わず、選手のステータス値から確率的に試合結果を算出する。
 */

import { PlayerDataLoader } from '@/GamePlay/Management/Services/PlayerDataLoader';
import type { PlayerData } from '@/GamePlay/Management/Types/PlayerData';
import { LeagueManager } from '@/GamePlay/Management/League/LeagueManager';
import type { LeagueTeam, MatchResultPayload, LeagueMatch } from '@/GamePlay/Management/League/Types';

export interface SimulationResult {
  matchId: number;
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away';
}

/**
 * チームの攻撃力・防御力をステータスから計算
 */
function calcTeamRating(
  team: LeagueTeam,
  playerDataMap: Record<string, PlayerData>,
): { offense: number; defense: number } {
  let offense = 0;
  let defense = 0;

  for (const p of team.players) {
    const pd = playerDataMap[p.playerId];
    if (!pd) continue;
    const s = pd.stats;

    // 攻撃力: offense, shootccuracy, 3paccuracy, speed, technique のブレンド
    offense += s.offense * 0.25
      + s.shootccuracy * 0.20
      + s['3paccuracy'] * 0.15
      + s.speed * 0.10
      + s.technique * 0.10
      + s.passaccuracy * 0.10
      + s.dribblingaccuracy * 0.10;

    // 防御力: defense, reflexes, quickness, power のブレンド
    defense += s.defense * 0.35
      + s.reflexes * 0.20
      + s.quickness * 0.15
      + s.power * 0.15
      + s.speed * 0.15;
  }

  return { offense, defense };
}

/**
 * 1得点の成功確率を計算（0.0〜1.0）
 * 攻撃側チームの攻撃力と防御側チームの防御力から決定
 */
function scoreProbability(attackOffense: number, defendDefense: number): number {
  // 差分を正規化（5人分のステータス値の合計を考慮）
  const diff = (attackOffense - defendDefense) / 500;
  // シグモイド風に 0.30〜0.70 の範囲にマッピング
  const base = 0.50 + diff * 0.30;
  return Math.max(0.20, Math.min(0.80, base));
}

/**
 * 1試合をシミュレーション（5点先取）
 */
function simulateSingleMatch(
  homeTeam: LeagueTeam,
  awayTeam: LeagueTeam,
  matchId: number,
  playerDataMap: Record<string, PlayerData>,
): SimulationResult {
  const homeRating = calcTeamRating(homeTeam, playerDataMap);
  const awayRating = calcTeamRating(awayTeam, playerDataMap);

  let homeScore = 0;
  let awayScore = 0;
  const winningScore = 5;

  // 交互に攻撃（ホームチームから開始）
  let possession: 'home' | 'away' = 'home';

  while (homeScore < winningScore && awayScore < winningScore) {
    if (possession === 'home') {
      const prob = scoreProbability(homeRating.offense, awayRating.defense);
      if (Math.random() < prob) {
        homeScore++;
      }
    } else {
      const prob = scoreProbability(awayRating.offense, homeRating.defense);
      if (Math.random() < prob) {
        awayScore++;
      }
    }
    // ポゼッション交替
    possession = possession === 'home' ? 'away' : 'home';
  }

  return {
    matchId,
    homeScore,
    awayScore,
    winner: homeScore >= winningScore ? 'home' : 'away',
  };
}

export class MatchSimulator {
  /**
   * 複数試合を即座にシミュレーション（同期的・瞬時）
   */
  static async simulateMatches(
    matches: LeagueMatch[],
  ): Promise<SimulationResult[]> {
    const playerDataMap = await PlayerDataLoader.loadPlayerData();
    const results: SimulationResult[] = [];

    for (const match of matches) {
      const homeTeam = LeagueManager.getTeam(match.homeTeamId);
      const awayTeam = LeagueManager.getTeam(match.awayTeamId);
      if (!homeTeam || !awayTeam) continue;

      results.push(simulateSingleMatch(homeTeam, awayTeam, match.matchId, playerDataMap));
    }

    return results;
  }

  /**
   * SimulationResult を MatchResultPayload に変換
   */
  static toMatchResultPayload(result: SimulationResult): MatchResultPayload {
    return {
      matchId: result.matchId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winner: result.winner,
    };
  }
}
