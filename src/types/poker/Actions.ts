// 全アクション型の統合インポート

export * from './ActionA'
export * from './ActionD' 
export * from './ActionM'
export * from './ActionI'

// 共通のStrengthen型（重複を避けるため統一）
export interface Strengthen {
  type: string
  value: number
  duration?: number
}