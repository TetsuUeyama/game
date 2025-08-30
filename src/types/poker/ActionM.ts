// 機動アクション（ActionM）の型定義

export interface Strengthen {
  type: string
  value: number
  duration?: number
}

export interface ActionM {
  mobility: string
  strengthen: Strengthen[]
}

// 機動タイプの定義
export type MobilityType = 
  | "高速移動"
  | "瞬間移動"
  | "飛行"
  | "潜行"
  | "ダッシュ"
  | "ステルス"
  | "バックステップ"

// ActionM用のユーティリティ関数
export const createActionM = (config: Partial<ActionM>): ActionM => ({
  mobility: config.mobility || "基本移動",
  strengthen: config.strengthen || []
})

// 機動効果の計算
export const calculateMobilityEffect = (action: ActionM): {
  speedBonus: number,
  evasionBonus: number,
  specialEffect: string | null
} => {
  let speedBonus = 0
  let evasionBonus = 0
  let specialEffect: string | null = null

  switch (action.mobility) {
    case "高速移動":
      speedBonus = 30
      evasionBonus = 15
      break
    case "瞬間移動":
      speedBonus = 50
      evasionBonus = 40
      specialEffect = "instant_dodge"
      break
    case "飛行":
      speedBonus = 20
      evasionBonus = 25
      specialEffect = "aerial_advantage"
      break
    case "潜行":
      speedBonus = 10
      evasionBonus = 35
      specialEffect = "stealth"
      break
    case "ダッシュ":
      speedBonus = 40
      evasionBonus = 10
      break
    case "ステルス":
      speedBonus = 5
      evasionBonus = 50
      specialEffect = "invisible"
      break
    case "バックステップ":
      speedBonus = 15
      evasionBonus = 30
      specialEffect = "counter_ready"
      break
    default:
      speedBonus = 10
      evasionBonus = 5
  }

  // 強化効果を追加
  action.strengthen.forEach(buff => {
    if (buff.type === "mobility_boost") {
      speedBonus += buff.value
    } else if (buff.type === "evasion_boost") {
      evasionBonus += buff.value
    }
  })

  return { speedBonus, evasionBonus, specialEffect }
}

// 機動アクションの成功判定
export const checkMobilitySuccess = (
  action: ActionM, 
  userMobility: number,
  enemySpeed: number = 50
): boolean => {
  const { speedBonus } = calculateMobilityEffect(action)
  const totalSpeed = userMobility + speedBonus
  
  // 相手の速度と比較して成功率を計算
  const successRate = Math.min(95, Math.max(10, (totalSpeed / enemySpeed) * 70))
  const roll = Math.random() * 100
  
  return roll < successRate
}