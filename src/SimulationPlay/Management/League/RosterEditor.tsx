'use client';

import { useState, useCallback } from 'react';
import { LeagueTeam, LeaguePlayer } from '@/SimulationPlay/Management/Services/LeagueService';
import { PlayerDataLoader } from '@/GamePlay/Data/PlayerDataLoader';
import { RosterConfig, RosterStarter, Position } from '@/SimulationPlay/Management/Services/UserDataService';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POSITION_LABELS: Record<Position, string> = {
  PG: 'PG (ポイントガード)',
  SG: 'SG (シューティングガード)',
  SF: 'SF (スモールフォワード)',
  PF: 'PF (パワーフォワード)',
  C: 'C (センター)',
};

type SelectionMode = { type: 'starter'; position: Position } | { type: 'bench'; index: number } | null;

interface Props {
  myTeam: LeagueTeam;
  leaguePlayers: Record<string, LeaguePlayer>;
  masterPlayerCache: Record<string, Record<string, unknown>>;
  initialRoster: RosterConfig | null;
  onSave: (config: RosterConfig) => void;
  onBack: () => void;
  onPlayerClick: (player: LeaguePlayer) => void;
}

function getPlayerInfo(player: LeaguePlayer, masterPlayerCache: Record<string, Record<string, unknown>>) {
  const raw = masterPlayerCache[player.playerId];
  if (!raw) return { position: '?', height: 0 };
  const pd = PlayerDataLoader.convertToPlayerData(
    raw as unknown as Parameters<typeof PlayerDataLoader.convertToPlayerData>[0]
  );
  return { position: pd.basic.PositionMain, height: pd.basic.height };
}

export function RosterEditor({
  myTeam,
  leaguePlayers,
  masterPlayerCache,
  initialRoster,
  onSave,
  onBack,
  onPlayerClick,
}: Props) {
  const [starters, setStarters] = useState<(RosterStarter | null)[]>(() => {
    if (initialRoster) {
      return POSITIONS.map((pos) =>
        initialRoster.starters.find((s) => s.position === pos) ?? null
      );
    }
    return [null, null, null, null, null];
  });

  const [bench, setBench] = useState<(string | null)[]>(() => {
    if (initialRoster) {
      const arr: (string | null)[] = [...initialRoster.bench];
      while (arr.length < 5) arr.push(null);
      return arr.slice(0, 5);
    }
    return [null, null, null, null, null];
  });

  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);

  // 割り当て済みのプレイヤーID一覧
  const assignedIds = new Set<string>();
  for (const s of starters) {
    if (s) assignedIds.add(s.leaguePlayerId);
  }
  for (const b of bench) {
    if (b) assignedIds.add(b);
  }

  // チームの全選手
  const teamPlayers = myTeam.playerIds
    .map((id) => leaguePlayers[id])
    .filter((p): p is LeaguePlayer => p != null);

  // 未割り当て選手
  const unassignedPlayers = teamPlayers.filter((p) => !assignedIds.has(p.id));

  const handleSelectPlayer = useCallback((playerId: string) => {
    if (!selectionMode) return;

    if (selectionMode.type === 'starter') {
      const posIndex = POSITIONS.indexOf(selectionMode.position);
      setStarters((prev) => {
        const next = [...prev];
        next[posIndex] = { leaguePlayerId: playerId, position: selectionMode.position };
        return next;
      });
    } else {
      setBench((prev) => {
        const next = [...prev];
        next[selectionMode.index] = playerId;
        return next;
      });
    }
    setSelectionMode(null);
  }, [selectionMode]);

  const handleClearStarter = (posIndex: number) => {
    setStarters((prev) => {
      const next = [...prev];
      next[posIndex] = null;
      return next;
    });
  };

  const handleClearBench = (index: number) => {
    setBench((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const handleSave = () => {
    const validStarters = starters.filter((s): s is RosterStarter => s != null);
    const validBench = bench.filter((b): b is string => b != null);
    onSave({
      starters: validStarters,
      bench: validBench,
    });
  };

  const getPlayerName = (leaguePlayerId: string): string => {
    const p = leaguePlayers[leaguePlayerId];
    return p ? `${p.lastName} ${p.firstName}` : '不明';
  };

  const canSave = starters.filter((s) => s != null).length === 5;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-colors cursor-pointer"
          >
            戻る
          </button>
          <h1 className="text-2xl font-bold">チーム編成</h1>
          <div className="w-16" />
        </div>

        {selectionMode && (
          <div className="mb-4 p-3 bg-blue-900/50 border border-blue-500 rounded-lg text-center text-sm">
            {selectionMode.type === 'starter'
              ? `${selectionMode.position} のスタメンを選択してください`
              : `控え ${selectionMode.index + 1} を選択してください`}
            <button
              onClick={() => setSelectionMode(null)}
              className="ml-3 text-blue-300 underline cursor-pointer"
            >
              キャンセル
            </button>
          </div>
        )}

        {/* スタメン */}
        <h2 className="text-lg font-bold mb-3 text-yellow-400">スタメン</h2>
        <div className="space-y-2 mb-6">
          {POSITIONS.map((pos, i) => {
            const starter = starters[i];
            const isSelecting = selectionMode?.type === 'starter' && selectionMode.position === pos;
            return (
              <div
                key={pos}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  isSelecting ? 'bg-blue-900/40 border border-blue-500' : 'bg-gray-800'
                }`}
              >
                <span className="w-8 text-center font-bold text-yellow-400">{pos}</span>
                {starter ? (
                  <>
                    <span className="flex-1 font-semibold">{getPlayerName(starter.leaguePlayerId)}</span>
                    <button
                      onClick={() => onPlayerClick(leaguePlayers[starter.leaguePlayerId])}
                      className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded cursor-pointer"
                    >
                      詳細
                    </button>
                    <button
                      onClick={() => handleClearStarter(i)}
                      className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded cursor-pointer"
                    >
                      解除
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setSelectionMode({ type: 'starter', position: pos })}
                    className="flex-1 text-left text-gray-500 hover:text-gray-300 cursor-pointer"
                  >
                    {POSITION_LABELS[pos]} — タップして選択
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 控え */}
        <h2 className="text-lg font-bold mb-3 text-blue-400">控え</h2>
        <div className="grid grid-cols-5 gap-2 mb-6">
          {bench.map((playerId, i) => {
            const isSelecting = selectionMode?.type === 'bench' && selectionMode.index === i;
            return (
              <div
                key={i}
                className={`p-2 rounded-lg text-center text-sm ${
                  isSelecting ? 'bg-blue-900/40 border border-blue-500' : 'bg-gray-800'
                }`}
              >
                {playerId ? (
                  <>
                    <p className="font-semibold text-xs mb-1">{getPlayerName(playerId)}</p>
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => onPlayerClick(leaguePlayers[playerId])}
                        className="px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded cursor-pointer"
                      >
                        詳細
                      </button>
                      <button
                        onClick={() => handleClearBench(i)}
                        className="px-1 py-0.5 text-[10px] bg-red-700 hover:bg-red-600 rounded cursor-pointer"
                      >
                        解除
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setSelectionMode({ type: 'bench', index: i })}
                    className="w-full h-full min-h-[48px] text-gray-500 hover:text-gray-300 cursor-pointer text-xs"
                  >
                    控え{i + 1}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 未登録選手一覧 */}
        <h2 className="text-lg font-bold mb-3 text-gray-400">未登録選手</h2>
        <div className="bg-gray-800 rounded-xl overflow-hidden mb-6">
          {unassignedPlayers.length === 0 ? (
            <p className="px-4 py-3 text-gray-500 text-sm">全選手が登録済みです</p>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {unassignedPlayers.map((p) => {
                const info = getPlayerInfo(p, masterPlayerCache);
                return (
                  <div
                    key={p.id}
                    className={`px-4 py-3 flex items-center gap-3 ${
                      selectionMode ? 'hover:bg-white/10 cursor-pointer' : ''
                    }`}
                    onClick={() => selectionMode && handleSelectPlayer(p.id)}
                  >
                    <span className="font-semibold flex-1">
                      {p.lastName} {p.firstName}
                    </span>
                    <span className="text-xs text-gray-400">{info.position}</span>
                    <span className="text-xs text-gray-400">{info.height}cm</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onPlayerClick(p); }}
                      className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded cursor-pointer"
                    >
                      詳細
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`w-full py-3 rounded-lg text-lg font-bold transition-colors cursor-pointer ${
            canSave
              ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {canSave ? '保存する' : 'スタメン5人を選択してください'}
        </button>
      </div>
    </div>
  );
}
