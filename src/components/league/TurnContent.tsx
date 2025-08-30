'use client'

import { Box, VStack, SimpleGrid } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Button } from '@/components/ui/button'
import { MatchCard } from '@/components/league/MatchCard'
import { useState, useEffect } from 'react'
import { Player, Match } from '@/types/league/LeagueTypes'
import { generateRoundMatches, executeMatch } from '@/utils/LeagueUtils'

interface TurnContentProps {
  turnNumber: number
  players: Player[]
  onRoundComplete: (matches: Match[]) => void
}

export const TurnContent = ({ turnNumber, players, onRoundComplete }: TurnContentProps) => {
  const [matches, setMatches] = useState<Match[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [roundCompleted, setRoundCompleted] = useState(false)

  useEffect(() => {
    // ターン変更時に新しい対戦カードを生成
    const newMatches = generateRoundMatches(players, turnNumber)
    setMatches(newMatches)
    setRoundCompleted(false)
  }, [turnNumber, players])

  const executeAllMatches = async () => {
    setIsExecuting(true)
    
    // アニメーション用の一時的な表示
    const animationDuration = 2000 // 2秒間のアニメーション
    const animationSteps = 20
    const stepDuration = animationDuration / animationSteps

    // アニメーション実行
    for (let i = 0; i < animationSteps; i++) {
      const tempMatches = matches.map(match => ({
        ...match,
        homeScore: Math.floor(Math.random() * 6) + 1,
        awayScore: Math.floor(Math.random() * 6) + 1,
        completed: false
      }))
      setMatches(tempMatches)
      await new Promise(resolve => setTimeout(resolve, stepDuration))
    }

    // 最終結果を計算
    const completedMatches = matches.map(match => executeMatch(match))
    setMatches(completedMatches)
    setIsExecuting(false)
    setRoundCompleted(true)

    // 結果を1秒表示してからコールバック実行
    setTimeout(() => {
      onRoundComplete(completedMatches)
    }, 1000)
  }

  return (
    <Box
      width="100%"
      maxWidth="800px"
      height="500px"
      border="2px solid"
      borderColor="blue.200"
      borderRadius="lg"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="white"
      padding={6}
      overflow="auto"
    >
      <VStack gap={6} width="100%">
        <Text
          text={`ターム ${turnNumber} - リーグ戦`}
          fontSize={{ base: 18, md: 22 }}
          fontWeight="bold"
          color="blue.600"
        />

        <Text
          text="今ターンの対戦カード"
          fontSize={{ base: 14, md: 16 }}
          fontWeight="bold"
          color="gray.700"
        />

        {/* 4試合の対戦カードを2x2で表示 */}
        <SimpleGrid columns={2} gap={4} width="100%">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </SimpleGrid>

        {/* 結果サマリー */}
        {roundCompleted && (
          <Box
            textAlign="center"
            padding={3}
            bg="green.50"
            borderRadius="md"
            width="100%"
            border="2px solid"
            borderColor="green.200"
          >
            <Text
              text="✅ 全試合完了！"
              fontSize={{ base: 14, md: 16 }}
              fontWeight="bold"
              color="green.600"
            />
            <Text
              text="順位表で結果を確認してください"
              fontSize={{ base: 12, md: 14 }}
              color="green.500"
            />
          </Box>
        )}

        <Button
          onClick={executeAllMatches}
          loading={isExecuting}
          disabled={isExecuting || roundCompleted}
          size="lg"
          colorScheme="blue"
          width="200px"
        >
          {isExecuting ? '試合実行中...' : roundCompleted ? '試合完了' : '全試合を実行'}
        </Button>
      </VStack>
    </Box>
  )
}