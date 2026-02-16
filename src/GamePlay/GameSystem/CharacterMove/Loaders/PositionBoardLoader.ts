/**
 * ポジション配置ボードローダー
 */

import { PositionBoardConfig } from '@/GamePlay/GameSystem/CharacterMove/Types/PositionBoard';
import { createDefaultPositionBoardConfig } from '@/GamePlay/GameSystem/CharacterMove/Config/PositionBoardConfig';

/**
 * デフォルトの配置ボード設定を取得
 */
export function createDefaultConfig(): PositionBoardConfig {
  return createDefaultPositionBoardConfig();
}
