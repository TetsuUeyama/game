import { NewPlayer } from '@/types/poker/PokerGameTypes'

export const createSamplePlayer = (): NewPlayer => {
  return {
    name: 'Sample Player',
    image: '/images/sample-player.png',
    bodyHp: 100,
    rightHp: 80,
    leftHp: 80,
    legHp: 90,
    bodyDiffence: 10,
    rightDiffence: 8,
    leftDiffence: 8,
    legDiffence: 9,
    evasion: 15,
    mobility: 12,
    instinct: 14,
  }
}

export const getMaxValues = (_player: NewPlayer) => {
  return {
    bodyHp: 100,
    rightHp: 80,
    leftHp: 80,
    legHp: 90,
  }
}
