'use client'

import { Box } from '@chakra-ui/react'
import { Header } from '@/templates/Header'
import { PokerGameTemplate } from '@/templates/poker/PokerGameTemplate'
import { colors } from '@/utils/theme'
import { useRouter } from 'next/navigation'

export const PokerGameView = () => {
  const router = useRouter()

  const handleExit = () => {
    router.push('/')
  }

  return (
    <Box
      color={colors.text}
      width="100%"
      minHeight="100vh"
      margin="auto"
      bg={colors.base}
      display="flex"
      flexDirection="column"
    >
      <Header />
      <Box flex="1">
        <PokerGameTemplate onExit={handleExit} />
      </Box>
    </Box>
  )
}