export interface Player {
  id: number
  name: string
  color: string
  wins: number
  losses: number
  draws: number
  totalGames: number
  points: number // 勝利3pt、引き分け1pt、敗北0pt
}

export interface Match {
  id: string
  homePlayer: Player
  awayPlayer: Player
  homeScore?: number
  awayScore?: number
  result?: 'home' | 'away' | 'draw'
  completed: boolean
}

export interface TurnResult {
  matches: Match[]
  turnNumber: number
}

export interface LeagueStats {
  players: Player[]
  totalTurns: number
  completedMatches: number
}