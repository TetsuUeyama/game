'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameScene } from '@/GamePlay/MatchEngine/GameScene';
import { PlayerDataLoader } from '@/GamePlay/Management/Services/PlayerDataLoader';
import { PlayerData } from '@/GamePlay/GameSystem/CharacterMove/Types/PlayerData';
import { ACTION_MOTIONS, ActionType } from '@/GamePlay/GameSystem/CharacterMove/Config/ActionConfig';
import { Character } from '@/GamePlay/Object/Entities/Character';

interface MotionCheckModePanelProps {
  gameScene: GameScene | null;
  onClose: () => void;
}

type Phase = 'setup' | 'playing';

const ACTION_KEYS = Object.keys(ACTION_MOTIONS) as ActionType[];

const ACTION_LABELS: Record<string, string> = {
  shoot_3pt: '3Pシュート',
  shoot_midrange: 'ミドルシュート',
  shoot_layup: 'レイアップ',
  shoot_dunk: 'ダンク',
  pass_chest: 'チェストパス',
  pass_bounce: 'バウンドパス',
  pass_overhead: 'オーバーヘッドパス',
  shoot_feint: 'シュートフェイント',
  block_shot: 'ブロック',
  steal_attempt: 'スティール',
  pass_intercept: 'パスインターセプト',
  defense_stance: 'ディフェンススタンス',
  dribble_breakthrough: 'ドリブル突破',
  jump_ball: 'ジャンプボール',
  rebound_jump: 'リバウンドジャンプ',
  loose_ball_scramble: 'ルーズボールスクランブル',
  loose_ball_pickup: 'ルーズボールピックアップ',
  ball_catch: 'ボールキャッチ',
};

/**
 * モーションチェックモードパネル
 * アクションごとのモーションを選択し、タイムライン操作で時間経過を確認する
 */
export function MotionCheckModePanel({ gameScene, onClose }: MotionCheckModePanelProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [loading, setLoading] = useState(true);

  // 選手データ
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');

  // アクション選択
  const [selectedAction, setSelectedAction] = useState<ActionType>(ACTION_KEYS[0]);

  // プレビュー状態
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // refs
  const characterRef = useRef<Character | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // 選手データを読み込む
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const playerData = await PlayerDataLoader.loadPlayerData();
        setPlayers(playerData);
        const playerIds = Object.keys(playerData);
        if (playerIds.length > 0) {
          setSelectedPlayerId(playerIds[0]);
        }
      } catch (error) {
        console.error('Failed to load player data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPlayers();
  }, []);

  // アニメーションループの停止
  const stopAnimLoop = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // モーションを適用して一時停止
  const applyMotion = useCallback((actionKey: ActionType) => {
    const character = characterRef.current;
    if (!character) return;

    const motionData = ACTION_MOTIONS[actionKey];
    if (!motionData) return;

    stopAnimLoop();
    setIsPlaying(false);

    // モーションを再生（ブレンドなし）
    character.getMotionController().play(motionData, 1.0, 0);
    // 即座に一時停止
    character.getMotionController().pause();
    // 時間を0にセット
    character.getMotionController().setCurrentTime(0);

    setCurrentTime(0);
    setDuration(motionData.duration);
  }, [stopAnimLoop]);

  // 開始ボタン
  const handleStart = useCallback(() => {
    if (!gameScene || !selectedPlayerId) return;

    const character = gameScene.setupMotionCheckMode(selectedPlayerId, players);
    if (!character) return;

    characterRef.current = character;
    setPhase('playing');

    // モーションを適用
    const motionData = ACTION_MOTIONS[selectedAction];
    if (motionData) {
      character.getMotionController().play(motionData, 1.0, 0);
      character.getMotionController().pause();
      character.getMotionController().setCurrentTime(0);
      setCurrentTime(0);
      setDuration(motionData.duration);
    }
  }, [gameScene, selectedPlayerId, players, selectedAction]);

  // 再生/一時停止
  const handlePlayPause = useCallback(() => {
    const character = characterRef.current;
    if (!character) return;

    if (isPlaying) {
      // 一時停止
      character.getMotionController().pause();
      stopAnimLoop();
      setIsPlaying(false);
    } else {
      // 再生開始
      character.getMotionController().resume();
      lastTimeRef.current = performance.now();
      setIsPlaying(true);
    }
  }, [isPlaying, stopAnimLoop]);

  // 再生中の更新ループ
  useEffect(() => {
    if (!isPlaying || !characterRef.current) return;

    const character = characterRef.current;

    const updateLoop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000 * playbackSpeed;
      lastTimeRef.current = now;

      character.update(dt);

      const state = character.getMotionController().getState();
      setCurrentTime(state.currentTime);

      // モーション終了チェック
      if (state.currentTime >= duration) {
        character.getMotionController().pause();
        setIsPlaying(false);
        setCurrentTime(duration);
        return;
      }

      animFrameRef.current = requestAnimationFrame(updateLoop);
    };

    animFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      stopAnimLoop();
    };
  }, [isPlaying, playbackSpeed, duration, stopAnimLoop]);

  // タイムラインシーク
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const character = characterRef.current;
    if (!character) return;

    character.getMotionController().setCurrentTime(time);
    setCurrentTime(time);
  }, []);

  // アクション切り替え
  const handleActionChange = useCallback((actionKey: ActionType) => {
    setSelectedAction(actionKey);
    if (phase === 'playing') {
      applyMotion(actionKey);
    }
  }, [phase, applyMotion]);

  // 設定に戻る
  const handleBackToSetup = useCallback(() => {
    stopAnimLoop();
    setIsPlaying(false);
    characterRef.current = null;
    setPhase('setup');
    setCurrentTime(0);
    setDuration(0);
  }, [stopAnimLoop]);

  // 閉じる
  const handleClose = useCallback(() => {
    stopAnimLoop();
    onClose();
  }, [stopAnimLoop, onClose]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopAnimLoop();
    };
  }, [stopAnimLoop]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  if (!gameScene) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="bg-red-900/20 border border-red-500 p-6 rounded-lg">
          <p className="text-red-400 text-xl mb-4">ゲームシーンが初期化されていません</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col pointer-events-none">
      {/* セットアップ画面 */}
      {phase === 'setup' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto">
          <div className="bg-gray-800 p-8 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                モーションチェック設定
              </h3>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
              >
                閉じる
              </button>
            </div>

            {/* 選手選択 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                選手
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none"
              >
                <option value="">選手を選択...</option>
                {Object.entries(players).map(([id, player]) => (
                  <option key={id} value={id}>
                    {player.basic.NAME} ({player.basic.PositionMain})
                  </option>
                ))}
              </select>
            </div>

            {/* アクション選択 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                アクション
              </label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value as ActionType)}
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none"
              >
                {ACTION_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {ACTION_LABELS[key] || key}
                  </option>
                ))}
              </select>
            </div>

            {/* 開始ボタン */}
            <button
              onClick={handleStart}
              disabled={!selectedPlayerId}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                selectedPlayerId
                  ? 'bg-teal-600 hover:bg-teal-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              開始
            </button>
          </div>
        </div>
      )}

      {/* プレビュー画面 */}
      {phase === 'playing' && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
          <div className="bg-gray-800/95 backdrop-blur-sm border-t border-gray-700 p-4">
            {/* ヘッダー行 */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">
                {ACTION_LABELS[selectedAction] || selectedAction}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleBackToSetup}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm font-semibold"
                >
                  設定に戻る
                </button>
                <button
                  onClick={handleClose}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold"
                >
                  閉じる
                </button>
              </div>
            </div>

            {/* タイムライン */}
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 font-mono w-16 text-right">
                  {currentTime.toFixed(2)}s
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.01}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500"
                />
                <span className="text-sm text-gray-400 font-mono w-16">
                  {duration.toFixed(2)}s
                </span>
              </div>
            </div>

            {/* コントロール行 */}
            <div className="flex items-center gap-3">
              {/* 再生/一時停止 */}
              <button
                onClick={handlePlayPause}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  isPlaying
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                {isPlaying ? '一時停止' : '再生'}
              </button>

              {/* 速度変更 */}
              <div className="flex gap-1">
                {[0.25, 0.5, 1.0].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-2 py-1.5 rounded text-xs font-semibold transition-colors ${
                      playbackSpeed === speed
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              {/* アクション切り替え */}
              <select
                value={selectedAction}
                onChange={(e) => handleActionChange(e.target.value as ActionType)}
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none text-sm"
              >
                {ACTION_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {ACTION_LABELS[key] || key}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
