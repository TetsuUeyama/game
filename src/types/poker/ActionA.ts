// 攻撃アクション（ActionA）の型定義

export interface Strengthen {
  type: string
  value: number
  duration?: number
}

export interface ActionA {
  function: string
  attribute: string
  cooltime: number
  damage: number
  shots: number
  surelyhitting: number
  hitrate: number
  strengthen: Strengthen[]
}

// ActionA用のユーティリティ関数
export const createActionA = (config: Partial<ActionA>): ActionA => ({
  function: config.function || "基本攻撃",
  attribute: config.attribute || "物理",
  cooltime: config.cooltime || 2000,
  damage: config.damage || 20,
  shots: config.shots || 1,
  surelyhitting: config.surelyhitting || 70,
  hitrate: config.hitrate || 80,
  strengthen: config.strengthen || []
})

// 攻撃力計算
export const calculateAttackDamage = (action: ActionA, targetDefense: number = 0): number => {
  const baseDamage = action.damage * action.shots
  const hitChance = action.hitrate / 100
  const sureHitChance = action.surelyhitting / 100
  
  // 命中率と必中率を考慮したダメージ計算
  const effectiveDamage = baseDamage * Math.max(hitChance, sureHitChance)
  return Math.max(0, effectiveDamage - targetDefense)
}

// クールタイム管理
export const isActionAReady = (lastUsed: number, action: ActionA): boolean => {
  return Date.now() - lastUsed >= action.cooltime
}