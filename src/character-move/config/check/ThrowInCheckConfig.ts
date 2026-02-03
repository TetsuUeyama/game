/**
 * スローインチェック関連の設定を一元管理するファイル
 * 外枠マスからフィールド内へのスローインをテストする
 */

import { GRID_CONFIG, OUTER_GRID_CONFIG, FieldGridUtils } from '../FieldGridConfig';

/**
 * 外側マスの情報
 */
export interface OuterCellInfo {
  col: string;
  row: number;
  worldX: number;
  worldZ: number;
  type: 'sideline_left' | 'sideline_right' | 'endline_top' | 'endline_bottom' | 'corner';
}

/**
 * スローインテスト結果
 */
export interface ThrowInTestResult {
  throwerCell: { col: string; row: number };
  receiverCell: { col: string; row: number };
  distance: number;
  success: boolean;
  catchTime?: number;  // キャッチまでの時間（秒）
  error?: string;
}

/**
 * スローインチェック進捗情報
 */
export interface ThrowInCheckProgress {
  currentOuterCellIndex: number;
  currentReceiverCellIndex: number;
  totalOuterCells: number;
  totalReceiverCells: number;
  completedTests: number;
  totalTests: number;
  successCount: number;
  failCount: number;
}

/**
 * スローインチェック設定
 */
export const THROW_IN_CHECK_CONFIG = {
  // スローインの最大パス距離（m）
  maxPassDistance: 12.0,

  // スローインの最小パス距離（m）
  minPassDistance: 2.0,

  // テスト間の待機時間（秒）
  delayBetweenTests: 0.5,

  // タイムアウト時間（秒）
  timeoutSeconds: 5.0,

  // テストごとの試行回数
  trialsPerTest: 1,
} as const;

/**
 * 全ての外側マスを取得
 */
export function getAllOuterCells(): OuterCellInfo[] {
  const outerCells: OuterCellInfo[] = [];

  // 左サイドライン（@列、行1〜30）
  for (let row = 1; row <= GRID_CONFIG.cell.rowCount; row++) {
    const world = FieldGridUtils.outerCellToWorld(OUTER_GRID_CONFIG.outerColumnLeft, row);
    if (world) {
      outerCells.push({
        col: OUTER_GRID_CONFIG.outerColumnLeft,
        row,
        worldX: world.x,
        worldZ: world.z,
        type: 'sideline_left',
      });
    }
  }

  // 右サイドライン（P列、行1〜30）
  for (let row = 1; row <= GRID_CONFIG.cell.rowCount; row++) {
    const world = FieldGridUtils.outerCellToWorld(OUTER_GRID_CONFIG.outerColumnRight, row);
    if (world) {
      outerCells.push({
        col: OUTER_GRID_CONFIG.outerColumnRight,
        row,
        worldX: world.x,
        worldZ: world.z,
        type: 'sideline_right',
      });
    }
  }

  // 上エンドライン（0行、列A〜O）
  for (const col of GRID_CONFIG.cell.colLabels) {
    const world = FieldGridUtils.outerCellToWorld(col, OUTER_GRID_CONFIG.outerRowTop);
    if (world) {
      outerCells.push({
        col,
        row: OUTER_GRID_CONFIG.outerRowTop,
        worldX: world.x,
        worldZ: world.z,
        type: 'endline_top',
      });
    }
  }

  // 下エンドライン（31行、列A〜O）
  for (const col of GRID_CONFIG.cell.colLabels) {
    const world = FieldGridUtils.outerCellToWorld(col, OUTER_GRID_CONFIG.outerRowBottom);
    if (world) {
      outerCells.push({
        col,
        row: OUTER_GRID_CONFIG.outerRowBottom,
        worldX: world.x,
        worldZ: world.z,
        type: 'endline_bottom',
      });
    }
  }

  // コーナー（@0, @31, P0, P31）
  const corners: Array<{ col: string; row: number; type: 'corner' }> = [
    { col: OUTER_GRID_CONFIG.outerColumnLeft, row: OUTER_GRID_CONFIG.outerRowTop, type: 'corner' },
    { col: OUTER_GRID_CONFIG.outerColumnLeft, row: OUTER_GRID_CONFIG.outerRowBottom, type: 'corner' },
    { col: OUTER_GRID_CONFIG.outerColumnRight, row: OUTER_GRID_CONFIG.outerRowTop, type: 'corner' },
    { col: OUTER_GRID_CONFIG.outerColumnRight, row: OUTER_GRID_CONFIG.outerRowBottom, type: 'corner' },
  ];

  for (const corner of corners) {
    const world = FieldGridUtils.outerCellToWorld(corner.col, corner.row);
    if (world) {
      outerCells.push({
        col: corner.col,
        row: corner.row,
        worldX: world.x,
        worldZ: world.z,
        type: 'corner',
      });
    }
  }

  return outerCells;
}

/**
 * 指定された外側マスからパス可能な距離にあるフィールド内マスを取得
 */
export function getValidReceiverCells(
  outerCell: OuterCellInfo,
  minDistance: number = THROW_IN_CHECK_CONFIG.minPassDistance,
  maxDistance: number = THROW_IN_CHECK_CONFIG.maxPassDistance
): Array<{ col: string; row: number; worldX: number; worldZ: number; distance: number }> {
  const validCells: Array<{ col: string; row: number; worldX: number; worldZ: number; distance: number }> = [];

  // フィールド内の全マスをチェック
  for (let row = 1; row <= GRID_CONFIG.cell.rowCount; row++) {
    for (const col of GRID_CONFIG.cell.colLabels) {
      const world = FieldGridUtils.cellToWorld(col, row);
      if (!world) continue;

      // 距離を計算
      const dx = world.x - outerCell.worldX;
      const dz = world.z - outerCell.worldZ;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // 距離が範囲内かどうかをチェック
      if (distance >= minDistance && distance <= maxDistance) {
        validCells.push({
          col,
          row,
          worldX: world.x,
          worldZ: world.z,
          distance,
        });
      }
    }
  }

  // 距離でソート
  validCells.sort((a, b) => a.distance - b.distance);

  return validCells;
}

/**
 * テストの総数を計算
 */
export function calculateTotalTests(
  minDistance: number = THROW_IN_CHECK_CONFIG.minPassDistance,
  maxDistance: number = THROW_IN_CHECK_CONFIG.maxPassDistance
): { totalTests: number; outerCells: OuterCellInfo[]; receiverCountPerCell: number[] } {
  const outerCells = getAllOuterCells();
  const receiverCountPerCell: number[] = [];
  let totalTests = 0;

  for (const outerCell of outerCells) {
    const validReceivers = getValidReceiverCells(outerCell, minDistance, maxDistance);
    receiverCountPerCell.push(validReceivers.length);
    totalTests += validReceivers.length;
  }

  return { totalTests, outerCells, receiverCountPerCell };
}
