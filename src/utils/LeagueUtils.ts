import { Player, Match } from '@/types/league/LeagueTypes'

export const createInitialPlayers = (): Player[] => {
  const playerNames = [
    'ファイター',
    'ナイト', 
    'ウィザード',
    'レンジャー',
    'パラディン',
    'ローグ',
    'バーバリアン',
    'クレリック'
  ]

  const colors = [
    'red.500',
    'blue.500', 
    'purple.500',
    'green.500',
    'orange.500',
    'pink.500',
    'cyan.500',
    'yellow.500'
  ]

  return playerNames.map((name, index) => ({
    id: index + 1,
    name,
    color: colors[index],
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0,
    points: 0
  }))
}

export const generateRoundMatches = (players: Player[], turnNumber: number): Match[] => {
  const matches: Match[] = []
  
  // 8人総当たりの1ターンあたり4試合を生成
  // ターム番号に基づいて対戦カードをローテーション
  const turnIndex = (turnNumber - 1) % 14 // 14ターンで全組み合わせが完了
  
  const matchups = generateTurnMatchups(turnIndex)
  
  matchups.forEach((matchup, index) => {
    const [homeId, awayId] = matchup
    matches.push({
      id: `turn-${turnNumber}-match-${index + 1}`,
      homePlayer: players[homeId],
      awayPlayer: players[awayId],
      completed: false
    })
  })

  return matches
}

// 各ターンの対戦カードを生成（8人の場合、1ターン4試合）
const generateTurnMatchups = (turnIndex: number): number[][] => {
  // 8人総当たりリーグのスケジュール（簡略版）
  const schedules = [
    [[0, 1], [2, 3], [4, 5], [6, 7]], // ターン1
    [[0, 2], [1, 4], [3, 6], [5, 7]], // ターン2
    [[0, 3], [1, 5], [2, 7], [4, 6]], // ターン3
    [[0, 4], [1, 6], [2, 5], [3, 7]], // ターン4
    [[0, 5], [1, 7], [2, 4], [3, 6]], // ターン5
    [[0, 6], [1, 3], [2, 7], [4, 5]], // ターン6
    [[0, 7], [1, 2], [3, 5], [4, 6]], // ターン7
    [[1, 0], [3, 2], [5, 4], [7, 6]], // ターン8（ホーム・アウェー逆転）
    [[2, 0], [4, 1], [6, 3], [7, 5]], // ターン9
    [[3, 0], [5, 1], [7, 2], [6, 4]], // ターン10
    [[4, 0], [6, 1], [5, 2], [7, 3]], // ターン11
    [[5, 0], [7, 1], [4, 2], [6, 3]], // ターン12
    [[6, 0], [3, 1], [7, 2], [5, 4]], // ターン13
    [[7, 0], [2, 1], [5, 3], [6, 4]]  // ターン14
  ]
  
  return schedules[turnIndex] || schedules[0]
}

export const rollDice = (): number => {
  return Math.floor(Math.random() * 6) + 1
}

export const executeMatch = (match: Match): Match => {
  const homeScore = rollDice()
  const awayScore = rollDice()
  
  let result: 'home' | 'away' | 'draw'
  if (homeScore > awayScore) {
    result = 'home'
  } else if (awayScore > homeScore) {
    result = 'away'
  } else {
    result = 'draw'
  }

  return {
    ...match,
    homeScore,
    awayScore,
    result,
    completed: true
  }
}

export const updatePlayerStats = (players: Player[], matches: Match[]): Player[] => {
  const updatedPlayers = [...players]

  matches.forEach(match => {
    if (!match.completed) return

    const homePlayerIndex = updatedPlayers.findIndex(p => p.id === match.homePlayer.id)
    const awayPlayerIndex = updatedPlayers.findIndex(p => p.id === match.awayPlayer.id)

    if (homePlayerIndex === -1 || awayPlayerIndex === -1) return

    // 試合数をインクリメント
    updatedPlayers[homePlayerIndex].totalGames += 1
    updatedPlayers[awayPlayerIndex].totalGames += 1

    // 結果に応じて勝敗数とポイントを更新
    if (match.result === 'home') {
      updatedPlayers[homePlayerIndex].wins += 1
      updatedPlayers[homePlayerIndex].points += 3
      updatedPlayers[awayPlayerIndex].losses += 1
    } else if (match.result === 'away') {
      updatedPlayers[awayPlayerIndex].wins += 1
      updatedPlayers[awayPlayerIndex].points += 3
      updatedPlayers[homePlayerIndex].losses += 1
    } else if (match.result === 'draw') {
      updatedPlayers[homePlayerIndex].draws += 1
      updatedPlayers[homePlayerIndex].points += 1
      updatedPlayers[awayPlayerIndex].draws += 1
      updatedPlayers[awayPlayerIndex].points += 1
    }
  })

  return updatedPlayers
}

export const sortPlayersByRanking = (players: Player[]): Player[] => {
  return [...players].sort((a, b) => {
    // 1. ポイント（勝ち点）で比較
    if (b.points !== a.points) {
      return b.points - a.points
    }
    
    // 2. 勝利数で比較
    if (b.wins !== a.wins) {
      return b.wins - a.wins
    }
    
    // 3. 勝率で比較
    const aWinRate = a.totalGames > 0 ? a.wins / a.totalGames : 0
    const bWinRate = b.totalGames > 0 ? b.wins / b.totalGames : 0
    if (bWinRate !== aWinRate) {
      return bWinRate - aWinRate
    }
    
    // 4. 敗北数の少なさで比較（昇順）
    return a.losses - b.losses
  })
}