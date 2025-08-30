import { NewPlayer } from '@/types/poker/PokerGameTypes'
import { ActionA, createActionA } from '@/types/poker/ActionA'
import { ActionD, createActionD } from '@/types/poker/ActionD' 
import { ActionM, createActionM } from '@/types/poker/ActionM'
import { ActionI, createActionI } from '@/types/poker/ActionI'

// サンプルプレイヤーデータ
export const createSamplePlayer = (): NewPlayer => {
  const sampleActionA = createActionA({
    function: "射撃攻撃",
    attribute: "物理",
    cooltime: 2000,
    damage: 25,
    shots: 3,
    surelyhitting: 80,
    hitrate: 85,
    strengthen: [
      { type: "damage_boost", value: 5, duration: 3000 }
    ]
  })

  const sampleActionD = createActionD({
    function: "防御態勢",
    attribute: "防御",
    fixdamege: 5,
    lowerlimit: 10,
    higherlimit: 50,
    diffencerate: 75,
    evasionrate: 25,
    blockdamege: 15,
    strengthen: [
      { type: "defense_boost", value: 10, duration: 5000 }
    ]
  })

  const sampleActionM = createActionM({
    mobility: "高速移動",
    strengthen: [
      { type: "mobility_boost", value: 20, duration: 4000 }
    ]
  })

  const sampleActionI = createActionI({
    instinct: 90,
    strengthen: [
      { type: "instinct_boost", value: 15, duration: 6000 }
    ]
  })

  return {
    name: "テストプレイヤー",
    image: "/poker/characters/1.png",
    
    // HP
    bodyHp: 100,
    rightHp: 80,
    leftHp: 80,
    legHp: 90,
    
    // 防御力
    bodyDiffence: 15,
    rightDiffence: 10,
    leftDiffence: 10,
    legDiffence: 12,
    
    // 基本ステータス
    evasion: 25,
    mobility: 30,
    instinct: 35,
    
    // アクション
    actionA: sampleActionA,
    actionD: sampleActionD,
    actionM: sampleActionM,
    actionI: sampleActionI
  }
}

// 最大HPの計算
export const getMaxValues = (player: NewPlayer) => ({
  bodyHp: 120,
  rightHp: 100,
  leftHp: 100,
  legHp: 110
})