'use client'

import {
  Box,
  VStack,
  HStack,
  SimpleGrid
} from '@chakra-ui/react'
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/Text'
import { TeamMatchCard } from './TeamMatchCard'
import { MemberComponent } from './MemberComponent'
import { Team, TeamMatch, Member, ResultTabType } from '@/types/league/TeamLeagueTypes'
import { useState } from 'react'

interface TeamResultModalProps {
  isOpen: boolean
  onClose: () => void
  teams: (Team & { members: Member[] })[]
  teamMatches: TeamMatch[]
  turnNumber: number
}

export const TeamResultModal = ({ 
  isOpen, 
  onClose, 
  teams, 
  teamMatches, 
  turnNumber 
}: TeamResultModalProps) => {
  const [activeTab, setActiveTab] = useState<ResultTabType>('team')

  const renderTabButton = (tab: ResultTabType, label: string) => {
    const isActive = activeTab === tab
    
    return (
      <Button
        onClick={() => setActiveTab(tab)}
        variant={isActive ? "solid" : "outline"}
        colorScheme={isActive ? "blue" : "gray"}
        size="sm"
        fontSize={{ base: 10, md: 12 }}
        minWidth="80px"
      >
        {label}
      </Button>
    )
  }

  const renderTeamResults = () => (
    <VStack gap={4} width="100%">
      <Text
        text={`ターム ${turnNumber} チーム戦結果`}
        fontSize={{ base: 14, md: 16 }}
        fontWeight="bold"
        color="blue.600"
        textAlign="center"
      />
      
      <SimpleGrid columns={1} gap={3} width="100%">
        {teamMatches.map((teamMatch) => (
          <TeamMatchCard
            key={teamMatch.id}
            teamMatch={teamMatch}
            showToggleDetails={true}
            allTeams={teams}
          />
        ))}
      </SimpleGrid>

      <Box
        textAlign="center"
        padding={2}
        bg="blue.50"
        borderRadius="md"
        width="100%"
      >
        <Text
          text="💡 「詳細を表示」をクリックするとメンバー別の結果が見られます"
          fontSize={{ base: 10, md: 12 }}
          color="blue.600"
        />
      </Box>
    </VStack>
  )

  const renderMemberResults = () => {
    const allMembers: Member[] = teams.flatMap(team => team.members)
    
    return (
      <VStack gap={4} width="100%">
        <Text
          text={`ターム ${turnNumber} 個人戦績`}
          fontSize={{ base: 14, md: 16 }}
          fontWeight="bold"
          color="purple.600"
          textAlign="center"
        />
        
        <SimpleGrid columns={2} gap={2} width="100%">
          {allMembers.map((member) => (
            <MemberComponent
              key={member.id}
              member={member}
              showDetails={true}
              size="sm"
            />
          ))}
        </SimpleGrid>
      </VStack>
    )
  }


  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <DialogContent maxWidth="600px" mx="auto">
        <DialogHeader textAlign="center">
          <DialogTitle>
            <Text
              text={`ターム ${turnNumber} 試合結果`}
              fontSize={{ base: 16, md: 20 }}
              fontWeight="bold"
              color="blue.600"
            />
          </DialogTitle>
        </DialogHeader>
        
        <DialogBody bg="gray.50">
          <VStack gap={4} width="100%">
            {/* タブナビゲーション */}
            <HStack gap={2} justifyContent="center" flexWrap="wrap" bg="white" padding={3} borderRadius="lg" boxShadow="sm">
              {renderTabButton('team', 'チーム戦')}
              {renderTabButton('member', '個人成績')}
            </HStack>

            {/* コンテンツエリア */}
            <Box width="100%" minHeight="300px" bg="white" padding={4} borderRadius="lg" boxShadow="sm">
              {activeTab === 'team' && renderTeamResults()}
              {activeTab === 'member' && renderMemberResults()}
            </Box>
          </VStack>
        </DialogBody>

        <DialogFooter justifyContent="center">
          <Button onClick={onClose} colorScheme="blue" size="lg" width="150px">
            {turnNumber === 52 ? '完了' : '次へ進む'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}