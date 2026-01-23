/**
 * ポジション配置ボードのユーティリティ
 */

import { PositionBoardConfig } from '../types/PositionBoard';
import { createDefaultPositionBoardConfig } from '../config/PositionBoardConfig';

/**
 * デフォルトの配置ボード設定を取得
 */
export function createDefaultConfig(): PositionBoardConfig {
  return createDefaultPositionBoardConfig();
}
