'use client';

import { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import CharacterSelect from './CharacterSelect';
import { getCharacterConfig } from '@/fighting-game/config/characterConfig';

// Window型の拡張（関数として定義）
declare global {
  interface Window {
    getPlayerConfigs?: () => {
      player1: PlayerConfig;
      player2: PlayerConfig;
    };
  }
}

// キャラクター性能の型定義
interface CharacterStats {
  hp: number;           // 体力 (25 ~ 150)
  attack: number;       // 攻撃力 (25 ~ 150)
  attackSpeed: number;  // 攻撃速度 (25 ~ 150)
  defense: number;      // 防御 (25 ~ 150)
  specialAttack: number; // 特攻 (25 ~ 150)
  specialDefense: number; // 特防 (25 ~ 150)
  speed: number;        // 速度 (25 ~ 150)
}

// AIカスタマイズの型定義
interface AICustomization {
  preferredDistance: number;    // 基本距離 (100 ~ 400)
  closeRangeAggression: number; // 近距離攻撃性 (0 ~ 1)
  longRangeAggression: number;  // 遠距離攻撃性 (0 ~ 1)
  jumpFrequency: number;        // ジャンプ頻度 (0 ~ 1)
  dashFrequency: number;        // ダッシュ頻度 (0 ~ 1)
  specialMeterThreshold: number; // 必殺技使用開始値 (0 ~ 100)
  specialMeterReserve: number;   // 必殺技維持値 (0 ~ 100)
  staminaThreshold: number;      // スタミナ使用開始値 (0 ~ 50)
  staminaReserve: number;        // スタミナ維持値 (0 ~ 50)
}

// プレイヤー設定の型定義
interface PlayerConfig {
  characterId: number;
  stats: CharacterStats;
  aiCustomization: AICustomization;
}

export default function FightingGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ゲーム状態管理
  const [gameState, setGameState] = useState<'SELECT' | 'PLAYING'>('SELECT');
  const [selectedPlayer1Id, setSelectedPlayer1Id] = useState<number>(1);
  const [selectedPlayer2Id, setSelectedPlayer2Id] = useState<number>(2);

  // デフォルト設定
  const defaultPlayer1Config: PlayerConfig = {
    characterId: 1,
    stats: {
      hp: 100,
      attack: 100,
      attackSpeed: 100,
      defense: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    },
    aiCustomization: {
      preferredDistance: 200,
      closeRangeAggression: 0.7,
      longRangeAggression: 0.5,
      jumpFrequency: 0.3,
      dashFrequency: 0.5,
      specialMeterThreshold: 80,
      specialMeterReserve: 30,
      staminaThreshold: 30,
      staminaReserve: 10,
    },
  };

  const defaultPlayer2Config: PlayerConfig = {
    characterId: 2,
    stats: {
      hp: 100,
      attack: 100,
      attackSpeed: 100,
      defense: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    },
    aiCustomization: {
      preferredDistance: 200,
      closeRangeAggression: 0.7,
      longRangeAggression: 0.5,
      jumpFrequency: 0.3,
      dashFrequency: 0.5,
      specialMeterThreshold: 80,
      specialMeterReserve: 30,
      staminaThreshold: 30,
      staminaReserve: 10,
    },
  };

  // プレイヤー設定（キャラクター選択後に更新）
  const [player1Config, setPlayer1Config] = useState<PlayerConfig>(defaultPlayer1Config);
  const [player2Config, setPlayer2Config] = useState<PlayerConfig>(defaultPlayer2Config);

  // キャラクター選択完了時の処理
  const handleCharacterSelect = (player1Id: number, player2Id: number) => {
    const p1Char = getCharacterConfig(player1Id);
    const p2Char = getCharacterConfig(player2Id);

    setPlayer1Config({
      characterId: p1Char.id,
      stats: p1Char.stats,
      aiCustomization: p1Char.aiCustomization,
    });

    setPlayer2Config({
      characterId: p2Char.id,
      stats: p2Char.stats,
      aiCustomization: p2Char.aiCustomization,
    });

    setSelectedPlayer1Id(player1Id);
    setSelectedPlayer2Id(player2Id);
    setGameState('PLAYING');
  };

  // 2勝した時の処理（キャラクター選択画面に戻る）
  const handleMatchEnd = () => {
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
    setGameState('SELECT');
  };

  // ゲーム初期化（PLAYING状態になった時）
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    if (typeof window === 'undefined') return;

    const initGame = async () => {
      // グローバルに設定取得関数を登録（常に最新の値を返す）
      window.getPlayerConfigs = () => ({
        player1: player1Config,
        player2: player2Config,
      });

      // マッチ終了イベントリスナー登録
      window.addEventListener('matchEnd', handleMatchEnd);

      console.log('[FightingGame] ゲーム初期化: 設定取得関数を登録');

      const Phaser = await import('phaser');
      const { FightScene } = await import('@/fighting-game/scenes/FightScene');
      const { GAME_CONFIG } = await import('@/fighting-game/config/gameConfig');

      const config = {
        type: Phaser.AUTO,
        ...GAME_CONFIG,
        parent: containerRef.current || undefined,
        scene: [FightScene],
      };

      if (!gameRef.current) {
        gameRef.current = new Phaser.Game(config);
      }
    };

    initGame();

    return () => {
      window.removeEventListener('matchEnd', handleMatchEnd);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [gameState, player1Config, player2Config]); // PLAYING状態になった時に実行

  // 設定変更時にイベント発火（関数は既に登録済みなので、通知のみ）
  useEffect(() => {
    if (typeof window !== 'undefined' && window.getPlayerConfigs) {
      // Phaser側に設定変更を通知
      window.dispatchEvent(new Event('playerConfigsUpdated'));

      console.log('[FightingGame] 設定更新通知:', window.getPlayerConfigs());
    }
  }, [player1Config, player2Config]);

  return (
    <>
      {/* キャラクター選択画面 */}
      {gameState === 'SELECT' && (
        <CharacterSelect onStart={handleCharacterSelect} />
      )}

      {/* ゲーム画面 */}
      {gameState === 'PLAYING' && (
        <div className="flex items-start justify-center min-h-screen bg-gray-900 p-4 gap-4">
          {/* Player 1 設定フォーム */}
          <PlayerConfigForm
            playerNumber={1}
            config={player1Config}
            onChange={setPlayer1Config}
          />

          {/* ゲーム画面 */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors"
            >
              設定を反映（ページリロード）
            </button>
            <div
              ref={containerRef}
              id="fighting-game-container"
              className="border-4 border-purple-500 rounded-lg shadow-2xl"
            />
          </div>

          {/* Player 2 設定フォーム */}
          <PlayerConfigForm
            playerNumber={2}
            config={player2Config}
            onChange={setPlayer2Config}
          />
        </div>
      )}
    </>
  );
}

// プレイヤー設定フォームコンポーネント
function PlayerConfigForm({
  playerNumber,
  config,
  onChange,
}: {
  playerNumber: number;
  config: PlayerConfig;
  onChange: (config: PlayerConfig) => void;
}) {
  return (
    <div className="w-80 bg-gray-800 p-4 rounded-lg text-white space-y-4 overflow-y-auto max-h-screen">
      <h2 className="text-xl font-bold text-center border-b border-gray-600 pb-2">
        Player {playerNumber}
      </h2>

      {/* キャラクター選択 */}
      <div>
        <label className="block text-sm font-semibold mb-1">キャラクター</label>
        <select
          value={config.characterId}
          onChange={(e) => onChange({ ...config, characterId: parseInt(e.target.value) })}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => (
            <option key={id} value={id}>
              キャラクター {id}
            </option>
          ))}
        </select>
      </div>

      {/* 性能値 */}
      <div className="border-t border-gray-600 pt-3">
        <h3 className="text-lg font-semibold mb-2">性能値</h3>
        <div className="space-y-2">
          <StatSlider
            label="HP"
            value={config.stats.hp}
            onChange={(hp) => onChange({ ...config, stats: { ...config.stats, hp } })}
          />
          <StatSlider
            label="攻撃力"
            value={config.stats.attack}
            onChange={(attack) => onChange({ ...config, stats: { ...config.stats, attack } })}
          />
          <StatSlider
            label="攻撃速度"
            value={config.stats.attackSpeed}
            onChange={(attackSpeed) => onChange({ ...config, stats: { ...config.stats, attackSpeed } })}
          />
          <StatSlider
            label="防御"
            value={config.stats.defense}
            onChange={(defense) => onChange({ ...config, stats: { ...config.stats, defense } })}
          />
          <StatSlider
            label="特攻"
            value={config.stats.specialAttack}
            onChange={(specialAttack) => onChange({ ...config, stats: { ...config.stats, specialAttack } })}
          />
          <StatSlider
            label="特防"
            value={config.stats.specialDefense}
            onChange={(specialDefense) => onChange({ ...config, stats: { ...config.stats, specialDefense } })}
          />
          <StatSlider
            label="速度"
            value={config.stats.speed}
            onChange={(speed) => onChange({ ...config, stats: { ...config.stats, speed } })}
          />
        </div>
      </div>

      {/* AIカスタマイズ */}
      <div className="border-t border-gray-600 pt-3">
        <h3 className="text-lg font-semibold mb-2">AIカスタマイズ</h3>
        <div className="space-y-2">
          <AISlider
            label="基本距離"
            value={config.aiCustomization.preferredDistance}
            min={100}
            max={400}
            step={10}
            onChange={(preferredDistance) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, preferredDistance } })
            }
          />
          <AISlider
            label="近距離攻撃性"
            value={config.aiCustomization.closeRangeAggression}
            min={0}
            max={1}
            step={0.1}
            onChange={(closeRangeAggression) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, closeRangeAggression } })
            }
          />
          <AISlider
            label="遠距離攻撃性"
            value={config.aiCustomization.longRangeAggression}
            min={0}
            max={1}
            step={0.1}
            onChange={(longRangeAggression) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, longRangeAggression } })
            }
          />
          <AISlider
            label="ジャンプ頻度"
            value={config.aiCustomization.jumpFrequency}
            min={0}
            max={1}
            step={0.1}
            onChange={(jumpFrequency) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, jumpFrequency } })
            }
          />
          <AISlider
            label="ダッシュ頻度"
            value={config.aiCustomization.dashFrequency}
            min={0}
            max={1}
            step={0.1}
            onChange={(dashFrequency) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, dashFrequency } })
            }
          />
          <AISlider
            label="必殺技使用開始"
            value={config.aiCustomization.specialMeterThreshold}
            min={0}
            max={100}
            step={5}
            onChange={(specialMeterThreshold) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, specialMeterThreshold } })
            }
          />
          <AISlider
            label="必殺技維持値"
            value={config.aiCustomization.specialMeterReserve}
            min={0}
            max={100}
            step={5}
            onChange={(specialMeterReserve) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, specialMeterReserve } })
            }
          />
          <AISlider
            label="スタミナ使用開始"
            value={config.aiCustomization.staminaThreshold}
            min={0}
            max={50}
            step={5}
            onChange={(staminaThreshold) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, staminaThreshold } })
            }
          />
          <AISlider
            label="スタミナ維持値"
            value={config.aiCustomization.staminaReserve}
            min={0}
            max={50}
            step={5}
            onChange={(staminaReserve) =>
              onChange({ ...config, aiCustomization: { ...config.aiCustomization, staminaReserve } })
            }
          />
        </div>
      </div>
    </div>
  );
}

// 性能値入力フィールド（25 ~ 150）
function StatSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    if (!isNaN(newValue)) {
      // 25～150の範囲に制限
      const clampedValue = Math.max(25, Math.min(150, newValue));
      onChange(clampedValue);
    }
  };

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <input
          type="number"
          min="25"
          max="150"
          value={value}
          onChange={handleChange}
          className="w-16 bg-gray-600 border border-gray-500 rounded px-1 text-right"
        />
      </div>
    </div>
  );
}

// AIスライダー（可変範囲）
function AISlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
