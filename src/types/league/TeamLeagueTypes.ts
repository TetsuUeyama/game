// メンバー（個人プレイヤー）の定義
export interface Member {
  id: number
  name: string
  teamId: number
  color: string
  strength: number // 強さパラメーター（0-3：ダイス目に加算）
  wins: number
  losses: number
  draws: number
  totalGames: number
  points: number // 勝利3pt、敗北0pt（引き分けなし）
}

// チームの定義
export interface Team {
  id: number
  name: string
  color: string
  memberIds: number[] // メンバーIDの配列
  wins: number // チーム戦での勝利数
  losses: number // チーム戦での敗北数
  draws: number // チーム戦での引き分け数（廃止予定）
  totalGames: number
  points: number // チーム戦での勝点（引き分けなし）
  goalFor: number // 得点（3試合の合計勝利数）
  goalAgainst: number // 失点（3試合の合計敗北数）
}

// 全体のデータベース構造
export interface TeamLeagueDatabase {
  members: Member[]
  teams: Team[]
}

// 個人戦（チーム内の1対1）の試合結果
export interface MemberMatch {
  id: string
  homeMember: Member
  awayMember: Member
  homeScore?: number
  awayScore?: number
  result?: 'home' | 'away' // 引き分けなし
  completed: boolean
}

// チーム戦（3試合セット）の定義
export interface TeamMatch {
  id: string
  homeTeam: Team
  awayTeam: Team
  memberMatches: MemberMatch[] // 3試合分
  homeTeamScore: number // ホームチームの勝利数 (0-3)
  awayTeamScore: number // アウェイチームの勝利数 (0-3)
  result?: 'home' | 'away' // 引き分けなし
  completed: boolean
}

// ターンの結果
export interface TurnResult {
  teamMatches: TeamMatch[]
  turnNumber: number
}

// リーグ全体の統計
export interface TeamLeagueStats {
  database: TeamLeagueDatabase
  totalTurns: number
  completedMatches: number
}

// リザルト表示用のタブタイプ
export type ResultTabType = 'team' | 'member' | 'detail'

// 詳細リザルト用のデータ
export interface DetailedResult {
  teamMatch: TeamMatch
  memberResults: MemberMatch[]
}