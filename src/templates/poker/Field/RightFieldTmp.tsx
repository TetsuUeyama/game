'use client'

import { useState, useEffect } from 'react'
import { Box } from '@chakra-ui/react'
// import { CardDiscardArea } from '@/components/poker/CardDiscardArea'
import { PlayerInfo } from '@/components/poker/PlayerInfo'
import { Card, Player } from '@/types/poker/PokerGameTypes'
import { SlotAttack } from '@/utils/cardExchange'

interface RightFieldTmpProps {
  player?: Player
  enemyDiscardedCards?: Card[][]
  onDropCard?: (slotIndex: number, card: Card) => void
  onRemoveCard?: (slotIndex: number) => void
  onAttackExecute?: (slotIndex: number, attack: SlotAttack) => void
}

export const RightFieldTmp = ({
  player,
  // enemyDiscardedCards = Array(6).fill(null).map(() => []),
  // onDropCard = () => {},
  // onRemoveCard = () => {},
  // onAttackExecute = () => {}
}: RightFieldTmpProps) => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <Box display="flex" flexDirection="column" justifyContent="flex-start" pb={2}>
      {/* プレイヤー情報 - 画面下 */}
      {player && (
        <Box pt={20} display="flex" justifyContent="flex-end">
          <PlayerInfo
            player={player}
            showRole={true}
            rolePosition="above"
          />
        </Box>
      )}
    </Box>
  )
}