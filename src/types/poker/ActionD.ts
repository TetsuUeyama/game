// 防御アクション（ActionD）の型定義

export interface Strengthen {
  type: string
  value: number
  duration?: number
}

export interface ActionD {
  function: string
  attribute: string
  fixdamege: number
  lowerlimit: number
  higherlimit: number
  diffencerate: number
  evasionrate: number
  blockdamege: number
  strengthen: Strengthen[]
}

// ActionD用のユーティリティ関数
export const createActionD = (config: Partial<ActionD>): ActionD => ({
  function: config.function || "基本防御",
  attribute: config.attribute || "防御",
  fixdamege: config.fixdamege || 5,
  lowerlimit: config.lowerlimit || 5,
  higherlimit: config.higherlimit || 30,
  diffencerate: config.diffencerate || 50,
  evasionrate: config.evasionrate || 20,
  blockdamege: config.blockdamege || 10,
  strengthen: config.strengthen || []
})

// ダメージ軽減計算
export const calculateDamageReduction = (
  action: ActionD, 
  incomingDamage: number
): { 
  finalDamage: number, 
  blocked: boolean, 
  evaded: boolean 
} => {
  // 回避判定
  const evadeRoll = Math.random() * 100
  if (evadeRoll < action.evasionrate) {
    return { finalDamage: 0, blocked: false, evaded: true }
  }

  // ブロック判定
  const blockRoll = Math.random() * 100
  const blocked = blockRoll < 50 // 50%でブロック成功と仮定

  if (blocked) {
    const blockedDamage = Math.min(incomingDamage, action.blockdamege)
    return { 
      finalDamage: Math.max(0, incomingDamage - blockedDamage), 
      blocked: true, 
      evaded: false 
    }
  }

  // 通常の軽減計算
  const reductionAmount = (incomingDamage * action.diffencerate) / 100
  const fixedReduction = action.fixdamege
  const totalReduction = Math.min(
    Math.max(reductionAmount, action.lowerlimit),
    action.higherlimit
  ) + fixedReduction

  const finalDamage = Math.max(0, incomingDamage - totalReduction)
  
  return { finalDamage, blocked: false, evaded: false }
}

// 防御効果の持続時間管理
export const isDefenseActive = (activatedAt: number, duration: number): boolean => {
  return Date.now() - activatedAt < duration
}