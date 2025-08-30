import { Team, Member, TeamMatch, MemberMatch, TeamLeagueDatabase } from '@/types/league/TeamLeagueTypes'

// 32人の選手データベースを作成
export const createMembersDatabase = (): Member[] => {
  const members: Member[] = []
  let memberId = 1

  const teamData = [
    {
      teamId: 1,
      members: [
        { name: 'ファイター', color: 'red.600', strength: 3 },
        { name: 'バーバリアン', color: 'red.700', strength: 2 },
        { name: 'ウォリアー', color: 'red.800', strength: 2 },
        { name: 'ベルセルカー', color: 'red.500', strength: 1 }
      ]
    },
    {
      teamId: 2,
      members: [
        { name: 'ナイト', color: 'blue.600', strength: 3 },
        { name: 'パラディン', color: 'blue.700', strength: 2 },
        { name: 'クルセイダー', color: 'blue.800', strength: 2 },
        { name: 'テンプラー', color: 'blue.500', strength: 1 }
      ]
    },
    {
      teamId: 3,
      members: [
        { name: 'ウィザード', color: 'purple.600', strength: 3 },
        { name: 'クレリック', color: 'purple.700', strength: 2 },
        { name: 'ソーサラー', color: 'purple.800', strength: 2 },
        { name: 'エンチャンター', color: 'purple.500', strength: 1 }
      ]
    },
    {
      teamId: 4,
      members: [
        { name: 'レンジャー', color: 'green.600', strength: 3 },
        { name: 'ローグ', color: 'green.700', strength: 2 },
        { name: 'アーチャー', color: 'green.800', strength: 2 },
        { name: 'スカウト', color: 'green.500', strength: 1 }
      ]
    },
    {
      teamId: 5,
      members: [
        { name: 'ドラゴンナイト', color: 'orange.600', strength: 3 },
        { name: 'ドレイク', color: 'orange.700', strength: 2 },
        { name: 'ワイバーン', color: 'orange.800', strength: 2 },
        { name: 'ドラゴンボーン', color: 'orange.500', strength: 1 }
      ]
    },
    {
      teamId: 6,
      members: [
        { name: 'アイスメイジ', color: 'cyan.600', strength: 3 },
        { name: 'ファイアメイジ', color: 'cyan.700', strength: 2 },
        { name: 'ライトニングメイジ', color: 'cyan.800', strength: 2 },
        { name: 'アースメイジ', color: 'cyan.500', strength: 1 }
      ]
    },
    {
      teamId: 7,
      members: [
        { name: 'アサシン', color: 'gray.700', strength: 3 },
        { name: 'シャドウ', color: 'gray.800', strength: 2 },
        { name: 'ニンジャ', color: 'gray.900', strength: 2 },
        { name: 'ダークナイト', color: 'gray.600', strength: 1 }
      ]
    },
    {
      teamId: 8,
      members: [
        { name: 'ハンター', color: 'yellow.600', strength: 3 },
        { name: 'ビーストマスター', color: 'yellow.700', strength: 2 },
        { name: 'ドルイド', color: 'yellow.800', strength: 2 },
        { name: 'シャーマン', color: 'yellow.500', strength: 1 }
      ]
    }
  ]

  teamData.forEach(team => {
    team.members.forEach(memberData => {
      members.push({
        id: memberId++,
        name: memberData.name,
        teamId: team.teamId,
        color: memberData.color,
        strength: memberData.strength,
        wins: 0,
        losses: 0,
        draws: 0,
        totalGames: 0,
        points: 0
      })
    })
  })

  return members
}

// 8チームを作成
export const createTeamsDatabase = (): Team[] => {
  return [
    {
      id: 1,
      name: 'ファイターチーム',
      color: 'red.500',
      memberIds: [1, 2, 3, 4],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    },
    {
      id: 2,
      name: 'ナイトチーム',
      color: 'blue.500',
      memberIds: [5, 6, 7, 8],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    },
    {
      id: 3,
      name: 'マジックチーム',
      color: 'purple.500',
      memberIds: [9, 10, 11, 12],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    },
    {
      id: 4,
      name: 'スカウトチーム',
      color: 'green.500',
      memberIds: [13, 14, 15, 16],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    },
    {
      id: 5,
      name: 'ドラゴンチーム',
      color: 'orange.500',
      memberIds: [17, 18, 19, 20],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    },
    {
      id: 6,
      name: 'エレメントチーム',
      color: 'cyan.500',
      memberIds: [21, 22, 23, 24],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    },
    {
      id: 7,
      name: 'シャドウチーム',
      color: 'gray.600',
      memberIds: [25, 26, 27, 28],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    },
    {
      id: 8,
      name: 'ビーストチーム',
      color: 'yellow.500',
      memberIds: [29, 30, 31, 32],
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      points: 0,
      goalFor: 0,
      goalAgainst: 0
    }
  ]
}

// 初期データベースを作成
export const createInitialDatabase = (): TeamLeagueDatabase => {
  return {
    members: createMembersDatabase(),
    teams: createTeamsDatabase()
  }
}

// ヘルパー関数: チームのメンバーを取得
export const getTeamMembers = (team: Team, members: Member[]): Member[] => {
  return team.memberIds.map(id => members.find(m => m.id === id)!).filter(Boolean)
}

// ヘルパー関数: 従来のTeam型（メンバー情報含む）を作成
export const getTeamWithMembers = (team: Team, members: Member[]): Team & { members: Member[] } => {
  return {
    ...team,
    members: getTeamMembers(team, members)
  }
}

// 後方互換性のための関数
export const createInitialTeams = (): (Team & { members: Member[] })[] => {
  const database = createInitialDatabase()
  return database.teams.map(team => getTeamWithMembers(team, database.members))
}

// 後方互換性のための generateTeamMatches 関数（古い形式）
export const generateTeamMatchesLegacy = (teams: (Team & { members: Member[] })[], turnNumber: number): TeamMatch[] => {
  // 古い形式のチームデータから新しい形式のデータベースを作成
  const members: Member[] = []
  const newTeams: Team[] = []
  
  teams.forEach(team => {
    // メンバーを追加
    team.members.forEach(member => {
      members.push(member)
    })
    
    // チームを追加（memberIdsは後で設定）
    newTeams.push({
      ...team,
      memberIds: team.members.map(m => m.id)
    })
  })
  
  const database: TeamLeagueDatabase = {
    members,
    teams: newTeams
  }
  
  return generateTeamMatches(database, turnNumber)
}

// 後方互換性のための updateTeamStats 関数（古い形式）
export const updateTeamStatsLegacy = (teams: (Team & { members: Member[] })[], teamMatches: TeamMatch[]): (Team & { members: Member[] })[] => {
  // 古い形式のチームデータから新しい形式のデータベースを作成
  const members: Member[] = []
  const newTeams: Team[] = []
  
  teams.forEach(team => {
    // メンバーを追加
    team.members.forEach(member => {
      members.push(member)
    })
    
    // チームを追加
    newTeams.push({
      ...team,
      memberIds: team.members.map(m => m.id)
    })
  })
  
  const database: TeamLeagueDatabase = {
    members,
    teams: newTeams
  }
  
  // 新しい関数で更新
  const updatedDatabase = updateTeamStats(database, teamMatches)
  
  // 古い形式に戻す
  return updatedDatabase.teams.map(team => getTeamWithMembers(team, updatedDatabase.members))
}

// ターンごとの対戦カード生成（8チーム総当たり）
export const generateTeamMatches = (database: TeamLeagueDatabase, turnNumber: number): TeamMatch[] => {
  const { teams, members } = database
  const teamMatches: TeamMatch[] = []
  
  // 8チーム総当たりのスケジュール（14ターンで完了）
  const schedules = [
    [[0, 1], [2, 3], [4, 5], [6, 7]], // ターン1
    [[0, 2], [1, 7], [3, 4], [5, 6]], // ターン2
    [[0, 3], [1, 2], [4, 6], [5, 7]], // ターン3
    [[0, 4], [1, 3], [2, 7], [5, 6]], // ターン4
    [[0, 5], [1, 4], [2, 6], [3, 7]], // ターン5
    [[0, 6], [1, 5], [2, 4], [3, 7]], // ターン6
    [[0, 7], [1, 6], [2, 5], [3, 4]], // ターン7
    [[1, 0], [3, 2], [5, 4], [7, 6]], // ターン8 (ホームアウェー逆転)
    [[2, 0], [7, 1], [4, 3], [6, 5]], // ターン9
    [[3, 0], [2, 1], [6, 4], [7, 5]], // ターン10
    [[4, 0], [3, 1], [7, 2], [6, 5]], // ターン11
    [[5, 0], [4, 1], [6, 2], [7, 3]], // ターン12
    [[6, 0], [5, 1], [4, 2], [7, 3]], // ターン13
    [[7, 0], [6, 1], [5, 2], [4, 3]]  // ターン14
  ]

  const turnIndex = (turnNumber - 1) % 14
  const matchups = schedules[turnIndex] || schedules[0]

  matchups.forEach((matchup, index) => {
    const [homeTeamIndex, awayTeamIndex] = matchup
    const homeTeam = teams[homeTeamIndex]
    const awayTeam = teams[awayTeamIndex]

    // 各チームから3人を選出して3試合組む
    const memberMatches: MemberMatch[] = []
    
    // ランダムに3人を選出
    const homeMembers = selectRandomMembers(getTeamMembers(homeTeam, members), 3)
    const awayMembers = selectRandomMembers(getTeamMembers(awayTeam, members), 3)

    // 3試合を生成（順番もランダム化）
    const matchPairs = homeMembers.map((homeMember, i) => ({
      homeMember,
      awayMember: awayMembers[i]
    }))
    
    // 対戦順番もランダム化
    const shuffledPairs = matchPairs.sort(() => Math.random() - 0.5)
    
    shuffledPairs.forEach((pair, i) => {
      memberMatches.push({
        id: `turn-${turnNumber}-team-${index + 1}-match-${i + 1}`,
        homeMember: pair.homeMember,
        awayMember: pair.awayMember,
        completed: false
      })
    })

    teamMatches.push({
      id: `turn-${turnNumber}-team-match-${index + 1}`,
      homeTeam,
      awayTeam,
      memberMatches,
      homeTeamScore: 0,
      awayTeamScore: 0,
      completed: false
    })
  })

  return teamMatches
}

// チームからランダムにメンバーを選出する関数
export const selectRandomMembers = (members: Member[], count: number): Member[] => {
  const shuffledMembers = [...members].sort(() => Math.random() - 0.5)
  return shuffledMembers.slice(0, Math.min(count, members.length))
}

export const rollDice = (): number => {
  return Math.floor(Math.random() * 6) + 1
}

// メンバー個人戦の実行（引き分けなし、決着がつくまで振り続ける）
export const executeMemberMatch = (match: MemberMatch): MemberMatch => {
  let homeScore: number
  let awayScore: number
  
  // 引き分けが出なくなるまで振り続ける
  do {
    // 基本ダイス + 強さボーナス
    homeScore = rollDice() + match.homeMember.strength
    awayScore = rollDice() + match.awayMember.strength
  } while (homeScore === awayScore)
  
  const result: 'home' | 'away' = homeScore > awayScore ? 'home' : 'away'

  return {
    ...match,
    homeScore,
    awayScore,
    result,
    completed: true
  }
}

// チーム戦全体の実行
export const executeTeamMatch = (teamMatch: TeamMatch): TeamMatch => {
  // 各メンバー戦を実行
  const completedMemberMatches = teamMatch.memberMatches.map(match => 
    executeMemberMatch(match)
  )

  // チーム戦のスコアを集計
  let homeTeamScore = 0
  let awayTeamScore = 0

  completedMemberMatches.forEach(match => {
    if (match.result === 'home') {
      homeTeamScore++
    } else if (match.result === 'away') {
      awayTeamScore++
    }
  })

  // チーム戦の結果判定（引き分けなし）
  const result: 'home' | 'away' = homeTeamScore > awayTeamScore ? 'home' : 'away'

  return {
    ...teamMatch,
    memberMatches: completedMemberMatches,
    homeTeamScore,
    awayTeamScore,
    result,
    completed: true
  }
}

// チーム・メンバー統計の更新
export const updateTeamStats = (database: TeamLeagueDatabase, teamMatches: TeamMatch[]): TeamLeagueDatabase => {
  const updatedMembers = [...database.members]
  const updatedTeams = [...database.teams]
  
  // メンバー統計をリセット（今回の試合分のみ追加）
  teamMatches.forEach(teamMatch => {
    if (!teamMatch.completed) return

    const homeTeamIndex = updatedTeams.findIndex(t => t.id === teamMatch.homeTeam.id)
    const awayTeamIndex = updatedTeams.findIndex(t => t.id === teamMatch.awayTeam.id)

    if (homeTeamIndex === -1 || awayTeamIndex === -1) return

    // チーム戦績の更新
    updatedTeams[homeTeamIndex].totalGames += 1
    updatedTeams[awayTeamIndex].totalGames += 1

    // チーム得失点の更新
    updatedTeams[homeTeamIndex].goalFor += teamMatch.homeTeamScore
    updatedTeams[homeTeamIndex].goalAgainst += teamMatch.awayTeamScore
    updatedTeams[awayTeamIndex].goalFor += teamMatch.awayTeamScore
    updatedTeams[awayTeamIndex].goalAgainst += teamMatch.homeTeamScore

    // チーム勝敗の更新（引き分けなし）
    if (teamMatch.result === 'home') {
      updatedTeams[homeTeamIndex].wins += 1
      updatedTeams[homeTeamIndex].points += 3
      updatedTeams[awayTeamIndex].losses += 1
    } else {
      updatedTeams[awayTeamIndex].wins += 1
      updatedTeams[awayTeamIndex].points += 3
      updatedTeams[homeTeamIndex].losses += 1
    }

    // メンバー個人統計の更新
    teamMatch.memberMatches.forEach(memberMatch => {
      if (!memberMatch.completed) return

      const homeMemberIndex = updatedMembers.findIndex(m => m.id === memberMatch.homeMember.id)
      const awayMemberIndex = updatedMembers.findIndex(m => m.id === memberMatch.awayMember.id)

      if (homeMemberIndex !== -1) {
        updatedMembers[homeMemberIndex].totalGames += 1
        if (memberMatch.result === 'home') {
          updatedMembers[homeMemberIndex].wins += 1
          updatedMembers[homeMemberIndex].points += 3
        } else {
          updatedMembers[homeMemberIndex].losses += 1
        }
      }

      if (awayMemberIndex !== -1) {
        updatedMembers[awayMemberIndex].totalGames += 1
        if (memberMatch.result === 'away') {
          updatedMembers[awayMemberIndex].wins += 1
          updatedMembers[awayMemberIndex].points += 3
        } else {
          updatedMembers[awayMemberIndex].losses += 1
        }
      }
    })
  })

  return {
    members: updatedMembers,
    teams: updatedTeams
  }
}

// チーム順位ソート
export const sortTeamsByRanking = (teams: Team[]): Team[] => {
  return [...teams].sort((a, b) => {
    // 1. ポイント（勝ち点）で比較
    if (b.points !== a.points) {
      return b.points - a.points
    }
    
    // 2. 得失点差で比較
    const aGoalDiff = a.goalFor - a.goalAgainst
    const bGoalDiff = b.goalFor - b.goalAgainst
    if (bGoalDiff !== aGoalDiff) {
      return bGoalDiff - aGoalDiff
    }
    
    // 3. 総得点で比較
    if (b.goalFor !== a.goalFor) {
      return b.goalFor - a.goalFor
    }
    
    // 4. 勝利数で比較
    return b.wins - a.wins
  })
}

// メンバー個人順位ソート（データベースから全メンバーを取得）
export const sortMembersByRanking = (members: Member[]): Member[] => {
  return [...members].sort((a, b) => {
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