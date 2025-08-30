// 直感アクション（ActionI）の型定義

export interface Strengthen {
  type: string
  value: number
  duration?: number
}

export interface ActionI {
  instinct: number
  strengthen: Strengthen[]
}

// 直感効果の種類
export type InstinctEffect = 
  | "critical_hit"
  | "dodge_prediction"
  | "weakness_detection"
  | "timing_perfect"
  | "danger_sense"
  | "opportunity_recognition"

// ActionI用のユーティリティ関数
export const createActionI = (config: Partial<ActionI>): ActionI => ({
  instinct: config.instinct || 50,
  strengthen: config.strengthen || []
})

// 直感値の効果計算
export const calculateInstinctEffect = (action: ActionI): {
  criticalChance: number,
  dodgeBonus: number,
  accuracyBonus: number,
  initiativeBonus: number
} => {
  let totalInstinct = action.instinct

  // 強化効果を追加
  action.strengthen.forEach(buff => {
    if (buff.type === "instinct_boost") {
      totalInstinct += buff.value
    }
  })

  // 直感値に基づく各種ボーナス計算
  const criticalChance = Math.min(50, totalInstinct * 0.3) // 最大50%
  const dodgeBonus = Math.min(30, totalInstinct * 0.2) // 最大30%
  const accuracyBonus = Math.min(25, totalInstinct * 0.15) // 最大25%
  const initiativeBonus = Math.min(40, totalInstinct * 0.25) // 最大40%

  return {
    criticalChance,
    dodgeBonus,
    accuracyBonus,
    initiativeBonus
  }
}

// 直感による特殊効果判定
export const rollInstinctEffect = (action: ActionI): InstinctEffect | null => {
  const { criticalChance } = calculateInstinctEffect(action)
  const roll = Math.random() * 100

  if (roll < criticalChance * 0.3) {
    return "critical_hit"
  } else if (roll < criticalChance * 0.5) {
    return "dodge_prediction"
  } else if (roll < criticalChance * 0.7) {
    return "weakness_detection"
  } else if (roll < criticalChance * 0.85) {
    return "timing_perfect"
  } else if (roll < criticalChance * 0.95) {
    return "danger_sense"
  } else if (roll < criticalChance) {
    return "opportunity_recognition"
  }

  return null
}

// 先制攻撃判定
export const checkInitiativeAdvantage = (
  playerAction: ActionI,
  enemyInstinct: number = 50
): boolean => {
  const { initiativeBonus } = calculateInstinctEffect(playerAction)
  const playerTotal = playerAction.instinct + initiativeBonus
  
  // 相手の直感値と比較
  const advantage = playerTotal - enemyInstinct
  const successRate = Math.min(90, Math.max(10, 50 + advantage))
  
  return Math.random() * 100 < successRate
}

// 直感による危険察知
export const detectDanger = (action: ActionI, dangerLevel: number): boolean => {
  const { dodgeBonus } = calculateInstinctEffect(action)
  const detectionRate = Math.min(95, action.instinct + dodgeBonus - dangerLevel)
  
  return Math.random() * 100 < detectionRate
}