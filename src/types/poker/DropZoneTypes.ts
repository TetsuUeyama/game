import { ReactNode } from 'react'

export interface SlotConfig {
  id: number
  name: string
  description: string
  effect: string
  cooldown: string
  target: string
  icon: {
    imagePath: string
    fallbackEmoji: string
    bgColor: string
    borderRadius: string
  }
  dialogContent: {
    title: string
    details: Array<{
      label: string
      value: string
      color?: string
    }>
  }
}

export interface SlotAttack {
  id: number
  name: string
  baseDamage: number
  target: 'all' | 'random' | 'up' | 'down' | 'left' | 'right'
  baseCooldown: number
  currentCooldown: number
  damageBonus: number
}

export interface DropZoneConfig {
  slots: SlotConfig[]
  defaultSlot: Omit<SlotConfig, 'id'>
}