// ポーカーゲーム用の型定義

// アクション型をインポート
export type { ActionA, ActionD, ActionM, ActionI, Strengthen } from './Actions'

// 新しいPlayer型定義
export interface NewPlayer {
  name: string
  image: string
  
  // HP管理
  bodyHp: number
  rightHp: number
  leftHp: number
  legHp: number
  
  // 防御力
  bodyDiffence: number
  rightDiffence: number
  leftDiffence: number
  legDiffence: number
  
  // 基本ステータス
  evasion: number
  mobility: number
  instinct: number
  
  // アクション
  actionA?: ActionA
  actionD?: ActionD
  actionM?: ActionM
  actionI?: ActionI
}

export interface Character {
  id: number
  name: string
  personality: string
  type: 'attack' | 'defense'
  hp: string
  attack: string
  defense: string
  speed: string
  intelligence: string
  image: string
}

export interface Card {
  id: number
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs'
  rank: number
  image: string
}

export interface Hand {
  role: string
  strength: number
}

export interface Player {
  character: Character
  cards: Card[]
  currentHp: number
  maxHp: number
  hand: Hand | null
  attackAction: string
  defenseAction: string
}

export interface GameState {
  player: Player
  enemy: Player
  deck: Card[]
  discardPile: Card[]
  turn: number
  phase: 'select' | 'battle' | 'result'
  isPlayerTurn: boolean
  gameLog: string[]
}

export type AttackType = 'balance' | 'full' | 'light'
export type DefenseType = 'balance' | 'royal_straight_flush' | 'straight_flush' | 'four_of_a_kind' | 'full_house' | 'flush' | 'straight' | 'three_of_a_kind' | 'two_pair' | 'one_pair' | 'high_card'

export interface GameAction {
  type: 'attack' | 'defense' | 'exchange' | 'decide'
  attackType?: AttackType
  defenseType?: DefenseType
  cardsToExchange?: number[]
}