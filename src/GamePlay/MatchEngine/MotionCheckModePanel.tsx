'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameScene } from '@/GamePlay/MatchEngine/GameScene';
import { PlayerDataLoader } from '@/GamePlay/Management/Services/PlayerDataLoader';
import { PlayerData } from '@/GamePlay/GameSystem/CharacterMove/Types/PlayerData';
import { Character } from '@/GamePlay/Object/Entities/Character';
import { MotionCheckPanel } from '@/GamePlay/GameSystem/CharacterModel/UI/MotionCheckPanel';
import { GAME_MOTIONS } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/GameMotionCatalog';
import { MotionDefinition } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes';
import { MotionPlayer, SingleMotionPoseData } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionPlayer';
import { createSingleMotionPoseData } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory';
import { loadGLBAnimation } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/GLBAnimationLoader';
import { GameMotionEntry } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/GameMotionCatalog';

interface MotionCheckModePanelProps {
  gameScene: GameScene | null;
  onClose: () => void;
}

type Phase = 'setup' | 'playing';

/**
 * GAME_MOTIONS のエントリ名（"game:idle"）と
 * motionDataToDefinition が返す MotionDefinition.name（"idle"）が異なる場合があるため、
 * MotionCheckPanel の select value が一致するようエントリ名で統一する。
 */
const BASE_MOTIONS: GameMotionEntry[] = GAME_MOTIONS.map(entry => ({
  name: entry.name,
  motion: entry.motion.name === entry.name
    ? entry.motion
    : { ...entry.motion, name: entry.name },
}));

/**
 * モーションチェックモードパネル
 * MotionCheckPanel（テストシーン用）を試合環境で再利用し、
 * 37+モーション・12関節リスト・キーフレーム編集・コードエクスポートを提供する。
 */
export function MotionCheckModePanel({ gameScene, onClose }: MotionCheckModePanelProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [loading, setLoading] = useState(true);

  // 選手データ
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');

  // MotionCheckPanel 用 state
  const [availableMotions, setAvailableMotions] = useState<GameMotionEntry[]>(BASE_MOTIONS);
  const [currentMotion, setCurrentMotion] = useState<MotionDefinition>(
    BASE_MOTIONS[0].motion
  );
  const [motionPlaying, setMotionPlaying] = useState(false);
  const [glbLoading, setGlbLoading] = useState(false);

  // refs
  const characterRef = useRef<Character | null>(null);
  const motionPlayerRef = useRef<MotionPlayer | null>(null);
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

  /** MotionDefinition → SingleMotionPoseData を生成 */
  const buildPoseData = useCallback((motion: MotionDefinition): SingleMotionPoseData | null => {
    const character = characterRef.current;
    if (!character) return null;
    const adapter = character.getSkeletonAdapter();
    return createSingleMotionPoseData(adapter.skeleton, motion, adapter.getRestPoseCache(), adapter.isXMirrored);
  }, []);

  /** MotionPlayer を作成 or ホットスワップ */
  const applyMotionToPlayer = useCallback((motion: MotionDefinition) => {
    const poseData = buildPoseData(motion);
    if (!poseData) return;

    if (motionPlayerRef.current) {
      motionPlayerRef.current.setData(poseData);
      motionPlayerRef.current.reset();
    } else {
      motionPlayerRef.current = new MotionPlayer(poseData);
      motionPlayerRef.current.setLoop(true);
    }
    // 最初のフレームを描画
    motionPlayerRef.current.seekTo(0);
  }, [buildPoseData]);

  // 開始ボタン
  const handleStart = useCallback(async () => {
    if (!gameScene || !selectedPlayerId) return;

    const character = gameScene.setupMotionCheckMode(selectedPlayerId, players);
    if (!character) return;

    // GameScene を一時停止して Character.update() がボーンを上書きしないようにする
    gameScene.pause();

    characterRef.current = character;

    // デフォルトのモーション（カタログ先頭）をセット
    const initialMotion = availableMotions[0].motion;
    setCurrentMotion(initialMotion);

    // MotionPlayer を作成し、即座に再生開始
    const adapter = character.getSkeletonAdapter();
    const poseData = createSingleMotionPoseData(adapter.skeleton, initialMotion, adapter.getRestPoseCache(), adapter.isXMirrored);
    if (poseData) {
      motionPlayerRef.current = new MotionPlayer(poseData);
      motionPlayerRef.current.setLoop(true);
    }

    lastTimeRef.current = performance.now();
    setMotionPlaying(true);
    setPhase('playing');

    // public/dribble.glb を自動読み込み＆即再生
    try {
      const glbMotion = await loadGLBAnimation('/dribble.glb', gameScene.getScene(), 'glb:dribble');
      if (glbMotion) {
        const entry: GameMotionEntry = { name: 'glb:dribble', motion: glbMotion };
        setAvailableMotions(prev => {
          if (prev.some(m => m.name === 'glb:dribble')) return prev;
          return [...prev, entry];
        });
        // 読み込み完了後、即座に選択＆再生
        stopAnimLoop();
        setCurrentMotion(glbMotion);
        applyMotionToPlayer(glbMotion);
        lastTimeRef.current = performance.now();
        setMotionPlaying(true);
      }
    } catch {
      // dribble.glb が存在しない場合は無視
    }
  }, [gameScene, selectedPlayerId, players, stopAnimLoop, applyMotionToPlayer]);

  // モーション選択（MotionCheckPanel からのコールバック）
  const handleMotionSelect = useCallback((name: string) => {
    const entry = availableMotions.find(m => m.name === name);
    if (!entry) return;

    stopAnimLoop();

    setCurrentMotion(entry.motion);
    applyMotionToPlayer(entry.motion);

    // 選択後すぐに再生開始
    lastTimeRef.current = performance.now();
    setMotionPlaying(true);
  }, [availableMotions, stopAnimLoop, applyMotionToPlayer]);

  // モーション変更（キーフレーム編集）— MotionCheckPanel からのコールバック
  // MotionCheckPanel は name を保持したまま joints を変更するのでそのまま使える
  const handleMotionChange = useCallback((edited: MotionDefinition) => {
    setCurrentMotion(edited);

    // MotionPlayer にホットスワップ（再生位置を維持）
    const poseData = buildPoseData(edited);
    if (poseData && motionPlayerRef.current) {
      const prevTime = motionPlayerRef.current.currentTime;
      motionPlayerRef.current.setData(poseData);
      motionPlayerRef.current.seekTo(prevTime);
    }
  }, [buildPoseData]);

  // 再生/一時停止トグル
  const handlePlayToggle = useCallback(() => {
    if (motionPlaying) {
      // 一時停止
      stopAnimLoop();
      setMotionPlaying(false);
    } else {
      // 再生開始
      lastTimeRef.current = performance.now();
      setMotionPlaying(true);
    }
  }, [motionPlaying, stopAnimLoop]);

  // 再生中の RAF ループ
  useEffect(() => {
    if (!motionPlaying || !motionPlayerRef.current) return;

    const updateLoop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      motionPlayerRef.current?.update(dt);
      animFrameRef.current = requestAnimationFrame(updateLoop);
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      stopAnimLoop();
    };
  }, [motionPlaying, stopAnimLoop]);

  // 現在の再生時刻を返す（MotionCheckPanel の getPlaybackTime）
  const getPlaybackTime = useCallback(() => {
    return motionPlayerRef.current?.currentTime ?? 0;
  }, []);

  // GLB ファイルからアニメーションを読み込み、モーションリストに追加
  const handleLoadGLB = useCallback(async (file: File) => {
    if (!gameScene) return;

    setGlbLoading(true);
    try {
      const url = URL.createObjectURL(file);
      const motionName = `glb:${file.name.replace(/\.glb$/i, '')}`;
      const motion = await loadGLBAnimation(url, gameScene.getScene(), motionName);
      URL.revokeObjectURL(url);

      if (!motion) return;

      const entry: GameMotionEntry = { name: motionName, motion };
      setAvailableMotions(prev => {
        // 同名エントリがあれば上書き
        const filtered = prev.filter(m => m.name !== motionName);
        return [...filtered, entry];
      });

      // 読み込んだモーションを即座に選択＆再生
      stopAnimLoop();
      setCurrentMotion(motion);
      applyMotionToPlayer(motion);
      lastTimeRef.current = performance.now();
      setMotionPlaying(true);
    } finally {
      setGlbLoading(false);
    }
  }, [gameScene, stopAnimLoop, applyMotionToPlayer]);

  // 設定に戻る
  const handleBackToSetup = useCallback(() => {
    stopAnimLoop();
    setMotionPlaying(false);
    motionPlayerRef.current?.dispose();
    motionPlayerRef.current = null;
    characterRef.current = null;
    gameScene?.resume();
    setPhase('setup');
  }, [stopAnimLoop, gameScene]);

  // 閉じる
  const handleClose = useCallback(() => {
    stopAnimLoop();
    motionPlayerRef.current?.dispose();
    motionPlayerRef.current = null;
    gameScene?.resume();
    onClose();
  }, [stopAnimLoop, onClose, gameScene]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopAnimLoop();
      motionPlayerRef.current?.dispose();
      motionPlayerRef.current = null;
      gameScene?.resume();
    };
  }, [stopAnimLoop, gameScene]);

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

      {/* プレビュー画面: 右サイドパネル */}
      {phase === 'playing' && (
        <div className="absolute top-0 right-0 bottom-0 w-80 flex flex-col pointer-events-auto"
             style={{ background: '#1e1e1e' }}>
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <h3 className="text-sm font-bold text-white">Motion Check</h3>
            <div className="flex gap-1">
              <label
                className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer ${
                  glbLoading
                    ? 'bg-gray-700 text-gray-400'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {glbLoading ? '...' : 'GLB'}
                <input
                  type="file"
                  accept=".glb"
                  className="hidden"
                  disabled={glbLoading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLoadGLB(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                onClick={handleBackToSetup}
                className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs font-semibold"
              >
                戻る
              </button>
              <button
                onClick={handleClose}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
              >
                閉じる
              </button>
            </div>
          </div>

          {/* MotionCheckPanel */}
          <div className="flex-1 overflow-hidden p-1">
            <MotionCheckPanel
              motionData={currentMotion}
              onMotionChange={handleMotionChange}
              playing={motionPlaying}
              onPlayToggle={handlePlayToggle}
              availableMotions={availableMotions}
              onMotionSelect={handleMotionSelect}
              getPlaybackTime={getPlaybackTime}
            />
          </div>
        </div>
      )}
    </div>
  );
}
