'use client';

import { useState } from 'react';
import { PlayerData } from '@/character-move/types/PlayerData';

interface PlayerDataPanelProps {
  playerData: Record<string, PlayerData>;
}

/**
 * 選手データ表示パネル（プルダウン形式）
 */
export function PlayerDataPanel({ playerData }: PlayerDataPanelProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const playerIds = Object.keys(playerData).sort((a, b) => parseInt(a) - parseInt(b));
  const selectedPlayer = selectedPlayerId ? playerData[selectedPlayerId] : null;

  return (
    <div className="absolute top-4 left-4 w-[500px] bg-black/80 backdrop-blur-sm text-white rounded-lg shadow-lg overflow-hidden max-h-[calc(100vh-100px)]">
      {/* ヘッダー */}
      <div
        className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 cursor-pointer flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-bold">選手データ一覧</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-200">全{playerIds.length}人</span>
          <button className="text-white hover:text-gray-200">
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="overflow-y-auto max-h-[calc(100vh-150px)]">
          {/* プルダウン選択 */}
          <div className="p-4 border-b border-gray-700">
            <label className="block text-sm text-gray-300 mb-2">選手を選択してください</label>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">-- 選手を選択 --</option>
              {playerIds.map((id) => {
                const player = playerData[id];
                return (
                  <option key={id} value={id}>
                    ID:{id} - {player.basic.NAME} ({player.basic.PositionMain})
                  </option>
                );
              })}
            </select>
          </div>

          {/* 詳細データ表示 */}
          {selectedPlayer && (
            <div className="p-4 space-y-4">
              {/* 基本情報 */}
              <div>
                <h4 className="font-bold text-xl mb-2 text-blue-400">
                  {selectedPlayer.basic.NAME}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatItem label="ID" value={selectedPlayer.basic.ID} />
                  <StatItem label="身長" value={`${selectedPlayer.basic.height} cm`} />
                  <StatItem label="利き手" value={selectedPlayer.basic.dominanthand} />
                  <StatItem label="サイド" value={selectedPlayer.basic.side} />
                  <StatItem label="ポジション" value={selectedPlayer.basic.Position} />
                </div>
              </div>

              {/* ポジション */}
              <div>
                <h5 className="font-semibold text-sm text-purple-400 mb-2">ポジション</h5>
                <div className="flex flex-wrap gap-2">
                  <PositionBadge position={selectedPlayer.basic.PositionMain} main={true} />
                  {selectedPlayer.basic.Position2 && (
                    <PositionBadge position={selectedPlayer.basic.Position2} />
                  )}
                  {selectedPlayer.basic.Position3 && (
                    <PositionBadge position={selectedPlayer.basic.Position3} />
                  )}
                  {selectedPlayer.basic.Position4 && (
                    <PositionBadge position={selectedPlayer.basic.Position4} />
                  )}
                  {selectedPlayer.basic.Position5 && (
                    <PositionBadge position={selectedPlayer.basic.Position5} />
                  )}
                </div>
              </div>

              {/* 基本能力 */}
              <div>
                <h5 className="font-semibold text-sm text-green-400 mb-2">基本能力</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatBar label="オフェンス" value={selectedPlayer.stats.offense} />
                  <StatBar label="ディフェンス" value={selectedPlayer.stats.defense} />
                  <StatBar label="パワー" value={selectedPlayer.stats.power} />
                  <StatBar label="スタミナ" value={selectedPlayer.stats.stamina} />
                  <StatBar label="スピード" value={selectedPlayer.stats.speed} />
                  <StatBar label="加速力" value={selectedPlayer.stats.acceleration} />
                  <StatBar label="反応速度" value={selectedPlayer.stats.reflexes} />
                  <StatBar label="機敏性" value={selectedPlayer.stats.quickness} />
                </div>
              </div>

              {/* ドリブル・パス */}
              <div>
                <h5 className="font-semibold text-sm text-yellow-400 mb-2">ドリブル・パス</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatBar label="ドリブル精度" value={selectedPlayer.stats.dribblingaccuracy} />
                  <StatBar label="ドリブル速度" value={selectedPlayer.stats.dribblingspeed} />
                  <StatBar label="パス精度" value={selectedPlayer.stats.passaccuracy} />
                  <StatBar label="パス速度" value={selectedPlayer.stats.passspeed} />
                </div>
              </div>

              {/* シュート */}
              <div>
                <h5 className="font-semibold text-sm text-red-400 mb-2">シュート</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatBar label="3P精度" value={selectedPlayer.stats['3paccuracy']} />
                  <StatBar label="3P距離" value={selectedPlayer.stats['3pspeed']} />
                  <StatBar label="シュート精度" value={selectedPlayer.stats.shootccuracy} />
                  <StatBar label="シュート距離" value={selectedPlayer.stats.shootdistance} />
                  <StatBar label="シュート技術" value={selectedPlayer.stats.shoottechnique} />
                  <StatBar label="フリースロー" value={selectedPlayer.stats.freethrow} />
                </div>
              </div>

              {/* 特殊スキル */}
              <div>
                <h5 className="font-semibold text-sm text-cyan-400 mb-2">特殊スキル</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatBar label="カーブ" value={selectedPlayer.stats.curve} />
                  <StatBar label="ダンク" value={selectedPlayer.stats.dunk} />
                  <StatBar label="ジャンプ" value={selectedPlayer.stats.jump} />
                  <StatBar label="テクニック" value={selectedPlayer.stats.technique} />
                </div>
              </div>

              {/* メンタル */}
              <div>
                <h5 className="font-semibold text-sm text-orange-400 mb-2">メンタル・その他</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatBar label="メンタル" value={selectedPlayer.stats.mentality} />
                  <StatBar label="闘争心" value={selectedPlayer.stats.aggressive} />
                  <StatBar label="連携" value={selectedPlayer.stats.alignment} />
                  <StatGauge8 label="コンディション" value={selectedPlayer.stats.condition} />
                  <StatGauge8 label="逆手精度" value={selectedPlayer.stats.oppositeaccuracy} />
                  <StatGauge8 label="逆手頻度" value={selectedPlayer.stats.oppositefrequency} />
                </div>
              </div>

              {/* 特殊能力 */}
              <div>
                <h5 className="font-semibold text-sm text-pink-400 mb-2">特殊能力</h5>
                <div className="space-y-2">
                  {selectedPlayer.specialAbilities.specialabilitiy1 && (
                    <SpecialAbilityItem
                      label="スラッシャー"
                      value={selectedPlayer.specialAbilities.specialabilitiy1}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy2 && (
                    <SpecialAbilityItem
                      label="ハンドラー"
                      value={selectedPlayer.specialAbilities.specialabilitiy2}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy3 && (
                    <SpecialAbilityItem
                      label="オフェンスポジショニング"
                      value={selectedPlayer.specialAbilities.specialabilitiy3}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy4 && (
                    <SpecialAbilityItem
                      label="フリーランニング"
                      value={selectedPlayer.specialAbilities.specialabilitiy4}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy5 && (
                    <SpecialAbilityItem
                      label="ゲームメイカー"
                      value={selectedPlayer.specialAbilities.specialabilitiy5}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy6 && (
                    <SpecialAbilityItem
                      label="パサー"
                      value={selectedPlayer.specialAbilities.specialabilitiy6}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy7 && (
                    <SpecialAbilityItem
                      label="スコアラー"
                      value={selectedPlayer.specialAbilities.specialabilitiy7}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy8 && (
                    <SpecialAbilityItem
                      label="クラッチシューター"
                      value={selectedPlayer.specialAbilities.specialabilitiy8}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy9 && (
                    <SpecialAbilityItem
                      label="ダンカー"
                      value={selectedPlayer.specialAbilities.specialabilitiy9}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy10 && (
                    <SpecialAbilityItem
                      label="ラインキープ"
                      value={selectedPlayer.specialAbilities.specialabilitiy10}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy11 && (
                    <SpecialAbilityItem
                      label="ミドルシューター"
                      value={selectedPlayer.specialAbilities.specialabilitiy11}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy12 && (
                    <SpecialAbilityItem
                      label="サイドプレイヤー"
                      value={selectedPlayer.specialAbilities.specialabilitiy12}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy13 && (
                    <SpecialAbilityItem
                      label="センタープレイヤー"
                      value={selectedPlayer.specialAbilities.specialabilitiy13}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy14 && (
                    <SpecialAbilityItem
                      label="フリースロー"
                      value={selectedPlayer.specialAbilities.specialabilitiy14}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy15 && (
                    <SpecialAbilityItem
                      label="ワンタッチプレイ"
                      value={selectedPlayer.specialAbilities.specialabilitiy15}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy16 && (
                    <SpecialAbilityItem
                      label="テクニカルプレイ"
                      value={selectedPlayer.specialAbilities.specialabilitiy16}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy17 && (
                    <SpecialAbilityItem
                      label="マンマーク"
                      value={selectedPlayer.specialAbilities.specialabilitiy17}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy18 && (
                    <SpecialAbilityItem
                      label="インターセプト"
                      value={selectedPlayer.specialAbilities.specialabilitiy18}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy19 && (
                    <SpecialAbilityItem
                      label="カバーリング"
                      value={selectedPlayer.specialAbilities.specialabilitiy19}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy20 && (
                    <SpecialAbilityItem
                      label="ディフェンスリーダー"
                      value={selectedPlayer.specialAbilities.specialabilitiy20}
                    />
                  )}
                  {selectedPlayer.specialAbilities.specialabilitiy22 && (
                    <SpecialAbilityItem
                      label="ロングスロー"
                      value={selectedPlayer.specialAbilities.specialabilitiy22}
                    />
                  )}
                  {Object.values(selectedPlayer.specialAbilities).every((v) => !v) && (
                    <p className="text-sm text-gray-400">なし</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ステータス項目コンポーネント
 */
function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900/50 p-2 rounded">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

/**
 * ステータスバーコンポーネント
 */
function StatBar({ label, value }: { label: string; value: number }) {
  const percentage = Math.min(100, (value / 100) * 100);
  const color =
    value >= 90
      ? 'bg-green-500'
      : value >= 80
      ? 'bg-blue-500'
      : value >= 70
      ? 'bg-yellow-500'
      : 'bg-gray-500';

  return (
    <div className="bg-gray-900/50 p-2 rounded">
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-xs font-semibold">{value}</p>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}

/**
 * 1-8段階ゲージコンポーネント
 */
function StatGauge8({ label, value }: { label: string; value: number }) {
  const percentage = Math.min(100, (value / 8) * 100);
  const color =
    value >= 6
      ? 'bg-green-500'
      : value >= 4
      ? 'bg-blue-500'
      : value >= 2
      ? 'bg-yellow-500'
      : 'bg-gray-500';

  return (
    <div className="bg-gray-900/50 p-2 rounded">
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-xs font-semibold">{value}/8</p>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}

/**
 * ポジションバッジコンポーネント
 */
function PositionBadge({ position, main = false }: { position: string; main?: boolean }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-semibold ${
        main ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
      }`}
    >
      {position}
    </span>
  );
}

/**
 * 特殊能力項目コンポーネント（縦並び用）
 */
function SpecialAbilityItem({ label, value }: { label: string; value: string }) {
  const isSpecial = value === '☆';
  return (
    <div className="bg-gray-900/50 p-2 rounded flex justify-between items-center">
      <p className="text-sm text-gray-300">{label}</p>
      <span
        className={`px-3 py-1 rounded-full text-sm font-semibold ${
          isSpecial ? 'bg-yellow-500 text-black' : 'bg-purple-600 text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
