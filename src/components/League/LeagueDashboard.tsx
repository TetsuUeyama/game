'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LeagueManager } from '@/league/LeagueManager';
import type { LeagueState } from '@/league/types';
import { LeagueSchedule } from './LeagueSchedule';
import { LeagueStarChart } from './LeagueStarChart';
import { LeagueStandings } from './LeagueStandings';
import Link from 'next/link';

type Tab = 'schedule' | 'star' | 'standings';

export function LeagueDashboard() {
  const router = useRouter();
  const [leagueState, setLeagueState] = useState<LeagueState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('schedule');

  // 初期化: リーグ状態を読み込み + 試合結果を消費
  useEffect(() => {
    let state = LeagueManager.loadLeagueState();

    // 試合結果があれば反映
    const result = LeagueManager.consumeMatchResult();
    if (result && state) {
      state = LeagueManager.applyMatchResult(state, result);
    }

    setLeagueState(state);
  }, []);

  // リーグ作成
  const handleCreateLeague = useCallback(() => {
    const state = LeagueManager.createLeague();
    setLeagueState(state);
  }, []);

  // リーグリセット
  const handleResetLeague = useCallback(() => {
    LeagueManager.clearLeagueState();
    setLeagueState(null);
  }, []);

  // 試合開始
  const handleStartMatch = useCallback((matchId: number) => {
    if (!leagueState) return;

    const match = leagueState.matches.find(m => m.matchId === matchId);
    if (!match) return;

    LeagueManager.saveMatchConfig({
      matchId: match.matchId,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
    });

    router.push('/league/match');
  }, [leagueState, router]);

  // リーグ未作成
  if (!leagueState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-4xl font-bold mb-8">Basketball League</h1>
        <p className="text-gray-400 mb-8">8チームのラウンドロビンリーグ戦</p>
        <div className="flex gap-4">
          <button
            onClick={handleCreateLeague}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold rounded-xl transition-colors"
          >
            リーグ作成
          </button>
          <Link
            href="/"
            className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold rounded-xl transition-colors"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'schedule', label: '日程' },
    { key: 'star', label: '星取表' },
    { key: 'standings', label: '順位表' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* ヘッダー */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Basketball League</h1>
            <p className="text-sm text-gray-400">
              {leagueState.isComplete
                ? '全日程終了'
                : `第${leagueState.currentRound + 1}節 進行中`
              }
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-sm text-white rounded-lg transition-colors"
            >
              ホーム
            </Link>
            <button
              onClick={handleResetLeague}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 text-sm text-white rounded-lg transition-colors"
            >
              リセット
            </button>
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <div className="flex gap-1 border-b border-gray-700">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* タブコンテンツ */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {activeTab === 'schedule' && (
          <LeagueSchedule leagueState={leagueState} onStartMatch={handleStartMatch} />
        )}
        {activeTab === 'star' && (
          <LeagueStarChart leagueState={leagueState} />
        )}
        {activeTab === 'standings' && (
          <LeagueStandings leagueState={leagueState} />
        )}
      </div>

      {/* リーグ完了時のチャンピオン表示 */}
      {leagueState.isComplete && (
        <div className="max-w-4xl mx-auto px-4 pb-8">
          <div className="bg-gradient-to-r from-yellow-900/30 to-yellow-700/30 border border-yellow-600 rounded-xl p-6 text-center">
            <p className="text-yellow-400 text-lg font-bold mb-2">CHAMPION</p>
            <p className="text-3xl font-black text-yellow-300">
              {(() => {
                const standings = LeagueManager.calcStandings(leagueState);
                const champion = leagueState.teams.find(t => t.id === standings[0].teamId);
                return champion?.name ?? '';
              })()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
