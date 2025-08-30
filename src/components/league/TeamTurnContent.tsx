'use client'

import { Box, VStack, SimpleGrid } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Button } from '@/components/ui/button'
import { TeamMatchCard } from '@/components/league/TeamMatchCard'
import { useState, useEffect } from 'react'
import { Team, TeamMatch, Member } from '@/types/league/TeamLeagueTypes'
import { generateTeamMatchesLegacy, executeTeamMatch } from '@/utils/TeamLeagueUtils'

interface TeamTurnContentProps {
  turnNumber: number
  teams: (Team & { members: Member[] })[]
  onRoundComplete: (teamMatches: TeamMatch[]) => void
}

export const TeamTurnContent = ({ turnNumber, teams, onRoundComplete }: TeamTurnContentProps) => {
  const [teamMatches, setTeamMatches] = useState<TeamMatch[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [roundCompleted, setRoundCompleted] = useState(false)

  useEffect(() => {
    // ターン変更時に新しいチーム対戦カードを生成
    const newTeamMatches = generateTeamMatchesLegacy(teams, turnNumber)
    setTeamMatches(newTeamMatches)
    setRoundCompleted(false)
  }, [turnNumber, teams])

  const executeAllMatches = async () => {
    setIsExecuting(true)
    
    // アニメーション用の一時的な表示
    const animationDuration = 3000 // 3秒間のアニメーション（チーム戦は複雑なので少し長め）
    const animationSteps = 30
    const stepDuration = animationDuration / animationSteps

    // アニメーション実行
    for (let i = 0; i < animationSteps; i++) {
      const tempMatches = teamMatches.map(teamMatch => {
        // 各メンバー戦の一時的な結果を生成
        const tempMemberMatches = teamMatch.memberMatches.map(memberMatch => ({
          ...memberMatch,
          homeScore: Math.floor(Math.random() * 6) + 1,
          awayScore: Math.floor(Math.random() * 6) + 1,
          completed: false
        }))

        // 一時的なチーム戦スコアを計算
        let tempHomeScore = 0
        let tempAwayScore = 0
        tempMemberMatches.forEach(match => {
          if (match.homeScore! > match.awayScore!) {
            tempHomeScore++
          } else if (match.awayScore! > match.homeScore!) {
            tempAwayScore++
          }
        })

        return {
          ...teamMatch,
          memberMatches: tempMemberMatches,
          homeTeamScore: tempHomeScore,
          awayTeamScore: tempAwayScore,
          completed: false
        }
      })
      
      setTeamMatches(tempMatches)
      await new Promise(resolve => setTimeout(resolve, stepDuration))
    }

    // 最終結果を計算
    const completedTeamMatches = teamMatches.map(teamMatch => executeTeamMatch(teamMatch))
    setTeamMatches(completedTeamMatches)
    setIsExecuting(false)
    setRoundCompleted(true)

    // 結果を1.5秒表示してからコールバック実行
    setTimeout(() => {
      onRoundComplete(completedTeamMatches)
    }, 1500)
  }

  return (
    <Box
      width="100%"
      maxWidth="900px"
      height="600px"
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
          text={`ターム ${turnNumber} - チームリーグ戦`}
          fontSize={{ base: 18, md: 24 }}
          fontWeight="bold"
          color="blue.600"
        />

        <Text
          text="今ターンのチーム対戦"
          fontSize={{ base: 14, md: 16 }}
          fontWeight="bold"
          color="gray.700"
        />

        {/* チーム対戦カードを表示 */}
        <SimpleGrid columns={1} gap={6} width="100%">
          {teamMatches.map((teamMatch) => (
            <TeamMatchCard key={teamMatch.id} teamMatch={teamMatch} allTeams={teams} />
          ))}
        </SimpleGrid>

        {/* 進行状況の説明 */}
        {isExecuting && (
          <Box
            textAlign="center"
            padding={3}
            bg="blue.50"
            borderRadius="md"
            width="100%"
            border="2px solid"
            borderColor="blue.200"
          >
            <Text
              text="⚔️ 各チーム3試合ずつ実行中..."
              fontSize={{ base: 14, md: 16 }}
              fontWeight="bold"
              color="blue.600"
            />
            <Text
              text="各チームのメンバーが対戦しています"
              fontSize={{ base: 12, md: 14 }}
              color="blue.500"
            />
          </Box>
        )}

        {/* 結果サマリー */}
        {roundCompleted && (
          <Box
            textAlign="center"
            padding={4}
            bg="green.50"
            borderRadius="md"
            width="100%"
            border="2px solid"
            borderColor="green.200"
          >
            <Text
              text="✅ 全チーム戦完了！"
              fontSize={{ base: 16, md: 18 }}
              fontWeight="bold"
              color="green.600"
            />
            <Text
              text="リザルト画面でチーム順位と個人成績を確認してください"
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
          width="250px"
          height="50px"
        >
          {isExecuting ? 'チーム戦実行中...' : roundCompleted ? 'チーム戦完了' : '全チーム戦を実行'}
        </Button>
      </VStack>
    </Box>
  )
}