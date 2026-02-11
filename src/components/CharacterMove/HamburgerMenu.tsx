'use client';

import { useState, useEffect, useCallback } from 'react';
import { GameScene } from '@/character-move/scenes/GameScene';
import type { VisualSettings } from '@/character-move/state';

type GameModeType = 'game' | 'shoot_check' | 'dribble_check' | 'pass_check' | 'motion_check';
type CameraModeType = 'on_ball' | 'manual';

interface HamburgerMenuProps {
  gameScene: GameScene | null;
  currentMode: GameModeType;
  onModeChange: (mode: GameModeType) => void;
  isPositionBoardVisible: boolean;
  onTogglePositionBoard: () => void;
}

/**
 * ハンバーガーメニュー
 * モード切り替えとカメラターゲット選択を含む
 */
export function HamburgerMenu({ gameScene, currentMode, onModeChange, isPositionBoardVisible, onTogglePositionBoard }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraModeType>('on_ball');
  const [cameraInfo, setCameraInfo] = useState<{
    team: 'ally' | 'enemy';
    index: number;
    playerName: string;
  } | null>(null);
  const [visualSettings, setVisualSettings] = useState<VisualSettings>({
    shootTrajectory: false,
    passTrajectory: false,
    dribblePath: false,
    tacticalZones: false,
    visionCone: false,
    gridLines: true,
    gridLabels: false,
    shootRange: false,
  });

  // 現在のカメラターゲット情報を更新
  const updateCameraInfo = useCallback(() => {
    if (!gameScene) return;
    const info = gameScene.getCurrentTargetInfo();
    setCameraInfo({
      team: info.team,
      index: info.index,
      playerName: info.character?.playerData?.basic.NAME || 'Unknown',
    });
    setCameraMode(info.cameraMode);
  }, [gameScene]);

  useEffect(() => {
    updateCameraInfo();
    // 視覚情報の初期値を取得
    if (gameScene) {
      setVisualSettings(gameScene.getVisualSettings());
    }
  }, [updateCameraInfo, gameScene]);

  // 定期的にカメラ情報を更新
  useEffect(() => {
    const interval = setInterval(updateCameraInfo, 500);
    return () => clearInterval(interval);
  }, [updateCameraInfo]);

  const handleCameraModeChange = (mode: CameraModeType) => {
    if (!gameScene) return;
    gameScene.setCameraMode(mode);
    setCameraMode(mode);
    updateCameraInfo();
  };

  const handlePreviousCharacter = () => {
    if (!gameScene) return;
    // マニュアルモードに切り替え
    if (cameraMode !== 'manual') {
      gameScene.setCameraMode('manual');
      setCameraMode('manual');
    }
    gameScene.switchToPreviousCharacter();
    updateCameraInfo();
  };

  const handleNextCharacter = () => {
    if (!gameScene) return;
    // マニュアルモードに切り替え
    if (cameraMode !== 'manual') {
      gameScene.setCameraMode('manual');
      setCameraMode('manual');
    }
    gameScene.switchToNextCharacter();
    updateCameraInfo();
  };

  const handleSwitchTeam = () => {
    if (!gameScene) return;
    // マニュアルモードに切り替え
    if (cameraMode !== 'manual') {
      gameScene.setCameraMode('manual');
      setCameraMode('manual');
    }
    gameScene.switchTeam();
    updateCameraInfo();
  };

  const handleModeSelect = (mode: GameModeType) => {
    onModeChange(mode);
    setIsOpen(false);
  };

  const handleToggleVisualSetting = (key: keyof VisualSettings) => {
    if (!gameScene) return;
    const newValue = gameScene.toggleVisualSetting(key);
    setVisualSettings(prev => ({ ...prev, [key]: newValue }));
  };

  const getModeLabel = (mode: GameModeType): string => {
    switch (mode) {
      case 'game': return '試合モード';
      case 'shoot_check': return 'シュートチェック';
      case 'dribble_check': return 'ドリブルチェック';
      case 'pass_check': return 'パスチェック';
      case 'motion_check': return 'モーションチェック';
    }
  };

  const getModeColor = (mode: GameModeType): string => {
    switch (mode) {
      case 'game': return 'bg-blue-600 hover:bg-blue-700';
      case 'shoot_check': return 'bg-purple-600 hover:bg-purple-700';
      case 'dribble_check': return 'bg-orange-600 hover:bg-orange-700';
      case 'pass_check': return 'bg-green-600 hover:bg-green-700';
      case 'motion_check': return 'bg-teal-600 hover:bg-teal-700';
    }
  };

  return (
    <div className="absolute top-4 left-4 z-50">
      {/* ハンバーガーボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all shadow-lg ${
          isOpen
            ? 'bg-gray-700 hover:bg-gray-600'
            : 'bg-gray-800/90 hover:bg-gray-700/90'
        }`}
        aria-label="メニュー"
      >
        <span className={`block w-6 h-0.5 bg-white transition-transform ${isOpen ? 'rotate-45 translate-y-2' : ''}`} />
        <span className={`block w-6 h-0.5 bg-white transition-opacity ${isOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-6 h-0.5 bg-white transition-transform ${isOpen ? '-rotate-45 -translate-y-2' : ''}`} />
      </button>

      {/* メニューパネル */}
      {isOpen && (
        <div className="absolute top-14 left-0 w-72 bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700 overflow-hidden">
          {/* モード選択セクション */}
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-sm font-bold text-gray-400 mb-3">モード選択</h3>
            <div className="space-y-2">
              {(['game', 'shoot_check', 'dribble_check', 'pass_check', 'motion_check'] as GameModeType[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeSelect(mode)}
                  className={`w-full px-4 py-2 rounded-lg font-semibold text-white text-left transition-all ${
                    currentMode === mode
                      ? `${getModeColor(mode)} ring-2 ring-white/50`
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{getModeLabel(mode)}</span>
                    {currentMode === mode && (
                      <span className="text-xs bg-white/20 px-2 py-0.5 rounded">現在</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* カメラターゲットセクション */}
          <div className="p-4">
            <h3 className="text-sm font-bold text-gray-400 mb-3">カメラターゲット</h3>

            {/* カメラモード選択 */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => handleCameraModeChange('on_ball')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  cameraMode === 'on_ball'
                    ? 'bg-yellow-500 text-black ring-2 ring-yellow-300'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                オンボール
              </button>
              <button
                onClick={() => handleCameraModeChange('manual')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  cameraMode === 'manual'
                    ? 'bg-cyan-500 text-black ring-2 ring-cyan-300'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                手動選択
              </button>
            </div>

            {cameraInfo && (
              <>
                {/* 現在のターゲット情報 */}
                <div className="mb-3 p-2 bg-gray-700/50 rounded-lg">
                  <p className="text-xs text-gray-400">
                    {cameraMode === 'on_ball' ? 'ボール保持者' : '選択中のプレイヤー'}
                  </p>
                  <p className="text-sm font-semibold text-white">
                    <span className={cameraInfo.team === 'ally' ? 'text-blue-400' : 'text-red-400'}>
                      {cameraInfo.team === 'ally' ? '味方' : '敵'}
                    </span>
                    {' - '}
                    {cameraInfo.playerName}
                  </p>
                </div>

                {/* 手動選択時のみ操作ボタンを表示 */}
                {cameraMode === 'manual' && (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePreviousCharacter}
                        className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-colors"
                        title="キーボード: Z"
                      >
                        ← 前
                      </button>
                      <button
                        onClick={handleSwitchTeam}
                        className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors"
                        title="キーボード: Tab"
                      >
                        チーム
                      </button>
                      <button
                        onClick={handleNextCharacter}
                        className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-colors"
                        title="キーボード: C"
                      >
                        次 →
                      </button>
                    </div>

                    {/* キーボードショートカット */}
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      Z/C: 切替 | Tab: チーム
                    </p>
                  </>
                )}

                {cameraMode === 'on_ball' && (
                  <p className="text-xs text-gray-500 text-center">
                    ボールを持っている選手を自動追従
                  </p>
                )}
              </>
            )}
          </div>

          {/* ツールセクション */}
          <div className="p-4 border-t border-gray-700">
            <h3 className="text-sm font-bold text-gray-400 mb-3">ツール</h3>
            <button
              onClick={() => {
                onTogglePositionBoard();
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2 rounded-lg font-semibold text-left transition-all ${
                isPositionBoardVisible
                  ? 'bg-yellow-500 text-black ring-2 ring-yellow-300'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>配置ボード</span>
                {isPositionBoardVisible && (
                  <span className="text-xs bg-black/20 px-2 py-0.5 rounded">表示中</span>
                )}
              </div>
            </button>
          </div>

          {/* 視覚情報セクション */}
          <div className="p-4 border-t border-gray-700">
            <h3 className="text-sm font-bold text-gray-400 mb-3">視覚情報</h3>
            <div className="space-y-2">
              {([
                { key: 'shootTrajectory' as const, label: 'シュート軌道' },
                { key: 'passTrajectory' as const, label: 'パス軌道' },
                { key: 'dribblePath' as const, label: 'ドリブル導線' },
                { key: 'shootRange' as const, label: 'シュートレンジ' },
                { key: 'tacticalZones' as const, label: '戦術ゾーン' },
                { key: 'visionCone' as const, label: '視野角' },
                { key: 'gridLines' as const, label: 'マスの枠' },
                { key: 'gridLabels' as const, label: 'マスの座標名' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleToggleVisualSetting(key)}
                  className={`w-full px-4 py-2 rounded-lg font-semibold text-left transition-all ${
                    visualSettings[key]
                      ? 'bg-yellow-500 text-black ring-2 ring-yellow-300'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{label}</span>
                    {visualSettings[key] && (
                      <span className="text-xs bg-black/20 px-2 py-0.5 rounded">表示中</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* オーバーレイ（メニュー外クリックで閉じる） */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
