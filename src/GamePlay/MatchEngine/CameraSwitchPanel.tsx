'use client';

import { GameScene } from '@/GamePlay/MatchEngine/GameScene';
import { useState, useEffect } from 'react';

interface CameraSwitchPanelProps {
  gameScene: GameScene | null;
}

/**
 * カメラターゲット切り替えパネル
 */
export function CameraSwitchPanel({ gameScene }: CameraSwitchPanelProps) {
  const [currentInfo, setCurrentInfo] = useState<{
    team: 'ally' | 'enemy';
    index: number;
    playerName: string;
  } | null>(null);

  // 現在のターゲット情報を更新
  const updateCurrentInfo = () => {
    if (!gameScene) return;
    const info = gameScene.getCurrentTargetInfo();
    setCurrentInfo({
      team: info.team,
      index: info.index,
      playerName: info.character?.playerData?.basic.NAME || 'Unknown',
    });
  };

  useEffect(() => {
    updateCurrentInfo();
  }, [gameScene]);

  const handlePrevious = () => {
    if (!gameScene) return;
    gameScene.switchToPreviousCharacter();
    updateCurrentInfo();
  };

  const handleNext = () => {
    if (!gameScene) return;
    gameScene.switchToNextCharacter();
    updateCurrentInfo();
  };

  const handleSwitchTeam = () => {
    if (!gameScene) return;
    gameScene.switchTeam();
    updateCurrentInfo();
  };

  if (!currentInfo) return null;

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white rounded-lg shadow-lg p-4">
      <div className="flex flex-col items-center gap-3">
        {/* 現在のターゲット情報 */}
        <div className="text-center">
          <p className="text-xs text-gray-400">カメラターゲット</p>
          <p className="text-sm font-bold">
            {currentInfo.team === 'ally' ? '味方チーム' : '敵チーム'} - {currentInfo.playerName}
          </p>
        </div>

        {/* 操作ボタン */}
        <div className="flex items-center gap-2">
          {/* 前のキャラクター */}
          <button
            onClick={handlePrevious}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition-colors"
            title="前のキャラクター (キーボード: Z)"
          >
            ← 前
          </button>

          {/* チーム切り替え */}
          <button
            onClick={handleSwitchTeam}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded font-semibold transition-colors"
            title="チーム切り替え (キーボード: Tab)"
          >
            チーム切替
          </button>

          {/* 次のキャラクター */}
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition-colors"
            title="次のキャラクター (キーボード: C)"
          >
            次 →
          </button>
        </div>

        {/* キーボードショートカットヒント */}
        <div className="text-xs text-gray-400 text-center">
          <p>キーボード: Z (前) / C (次) / Tab (チーム切替)</p>
        </div>
      </div>
    </div>
  );
}
