/**
 * 8チーム定義
 * 既存の選手データ(ID 1-40)から5人ずつ構成
 */

import { OffenseRole, DefenseRole, DefenseScheme } from '@/GamePlay/GameSystem/StatusCheckSystem/PlayerStateTypes';
import type { LeagueTeam } from '@/GamePlay/Management/League/Types';

export const LEAGUE_TEAMS: LeagueTeam[] = [
  {
    id: 1,
    name: 'スターズ',
    abbr: 'STR',
    defenseScheme: DefenseScheme.DROP,
    players: [
      { playerId: '1',  position: 'PG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 1 },
      { playerId: '2',  position: 'SG', offenseRole: OffenseRole.SPACER,         defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 2 },
      { playerId: '3',  position: 'SF', offenseRole: OffenseRole.SLASHER,        defenseRole: DefenseRole.NAIL,      shotPriority: 3 },
      { playerId: '4',  position: 'PF', offenseRole: OffenseRole.SECOND_HANDLER, defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '5',  position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.LOW_MAN,   shotPriority: 5 },
    ],
  },
  {
    id: 2,
    name: 'レジェンズ',
    abbr: 'LGD',
    defenseScheme: DefenseScheme.SWITCH,
    players: [
      { playerId: '6',  position: 'PG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 2 },
      { playerId: '7',  position: 'SG', offenseRole: OffenseRole.SPACER,         defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 1 },
      { playerId: '8',  position: 'SF', offenseRole: OffenseRole.DUNKER,         defenseRole: DefenseRole.NAIL,      shotPriority: 3 },
      { playerId: '9',  position: 'PF', offenseRole: OffenseRole.SLASHER,        defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '10', position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.LOW_MAN,   shotPriority: 5 },
    ],
  },
  {
    id: 3,
    name: 'ストライカーズ',
    abbr: 'STK',
    defenseScheme: DefenseScheme.DROP,
    players: [
      { playerId: '11', position: 'PG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 2 },
      { playerId: '12', position: 'SG', offenseRole: OffenseRole.SLASHER,        defenseRole: DefenseRole.NAIL,      shotPriority: 1 },
      { playerId: '13', position: 'SF', offenseRole: OffenseRole.DUNKER,         defenseRole: DefenseRole.LOW_MAN,   shotPriority: 3 },
      { playerId: '14', position: 'PF', offenseRole: OffenseRole.SECOND_HANDLER, defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '15', position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 5 },
    ],
  },
  {
    id: 4,
    name: 'マエストロ',
    abbr: 'MST',
    defenseScheme: DefenseScheme.ZONE,
    players: [
      { playerId: '16', position: 'PG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 1 },
      { playerId: '17', position: 'SG', offenseRole: OffenseRole.SPACER,         defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 3 },
      { playerId: '18', position: 'SF', offenseRole: OffenseRole.SECOND_HANDLER, defenseRole: DefenseRole.NAIL,      shotPriority: 2 },
      { playerId: '19', position: 'PF', offenseRole: OffenseRole.SLASHER,        defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '20', position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.LOW_MAN,   shotPriority: 5 },
    ],
  },
  {
    id: 5,
    name: 'ファイターズ',
    abbr: 'FTR',
    defenseScheme: DefenseScheme.SWITCH,
    players: [
      { playerId: '21', position: 'PG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 1 },
      { playerId: '22', position: 'SG', offenseRole: OffenseRole.SLASHER,        defenseRole: DefenseRole.NAIL,      shotPriority: 2 },
      { playerId: '23', position: 'SF', offenseRole: OffenseRole.SPACER,         defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 3 },
      { playerId: '24', position: 'PF', offenseRole: OffenseRole.SECOND_HANDLER, defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '25', position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.LOW_MAN,   shotPriority: 5 },
    ],
  },
  {
    id: 6,
    name: 'ライオンズ',
    abbr: 'LIO',
    defenseScheme: DefenseScheme.DROP,
    players: [
      { playerId: '26', position: 'PG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 2 },
      { playerId: '27', position: 'SG', offenseRole: OffenseRole.DUNKER,         defenseRole: DefenseRole.LOW_MAN,   shotPriority: 1 },
      { playerId: '28', position: 'SF', offenseRole: OffenseRole.SPACER,         defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 3 },
      { playerId: '29', position: 'PF', offenseRole: OffenseRole.SECOND_HANDLER, defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '30', position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.NAIL,      shotPriority: 5 },
    ],
  },
  {
    id: 7,
    name: 'フェニックス',
    abbr: 'PHX',
    defenseScheme: DefenseScheme.SWITCH,
    players: [
      { playerId: '31', position: 'PG', offenseRole: OffenseRole.SLASHER,        defenseRole: DefenseRole.NAIL,      shotPriority: 1 },
      { playerId: '32', position: 'SG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 3 },
      { playerId: '33', position: 'SF', offenseRole: OffenseRole.SPACER,         defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 2 },
      { playerId: '34', position: 'PF', offenseRole: OffenseRole.SECOND_HANDLER, defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '35', position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.LOW_MAN,   shotPriority: 5 },
    ],
  },
  {
    id: 8,
    name: 'イーグルス',
    abbr: 'EGL',
    defenseScheme: DefenseScheme.ZONE,
    players: [
      { playerId: '36', position: 'PG', offenseRole: OffenseRole.SLASHER,        defenseRole: DefenseRole.NAIL,      shotPriority: 2 },
      { playerId: '37', position: 'SG', offenseRole: OffenseRole.MAIN_HANDLER,   defenseRole: DefenseRole.POA,       shotPriority: 1 },
      { playerId: '38', position: 'SF', offenseRole: OffenseRole.SPACER,         defenseRole: DefenseRole.CLOSEOUT,  shotPriority: 3 },
      { playerId: '39', position: 'PF', offenseRole: OffenseRole.SECOND_HANDLER, defenseRole: DefenseRole.SCRAMBLER, shotPriority: 4 },
      { playerId: '40', position: 'C',  offenseRole: OffenseRole.SCREENER,       defenseRole: DefenseRole.LOW_MAN,   shotPriority: 5 },
    ],
  },
];
