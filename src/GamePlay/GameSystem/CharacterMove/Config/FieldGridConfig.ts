/**
 * フィールドの碁盤目座標システム
 * 小升目: 横A〜O（15個）、縦1〜30
 * 大枠（ブロック）: 5×5の升目をまとめた単位、3×6=18ブロック
 */

import { FIELD_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Config/GameConfig";

/**
 * 小升目の座標（例: "A1", "O30"）
 */
export interface CellCoord {
  col: string;  // A〜O
  row: number;  // 1〜30
}

/**
 * ブロックの座標（例: "A1", "C6"）
 */
export interface BlockCoord {
  col: string;  // A〜C
  row: number;  // 1〜6
}

/**
 * グリッド設定
 */
export const GRID_CONFIG = {
  // 小升目
  cell: {
    size: 1,  // 1m
    colCount: 15,  // A〜O
    rowCount: 30,  // 1〜30
    colLabels: 'ABCDEFGHIJKLMNO'.split(''),
  },
  // 大枠（ブロック）
  block: {
    size: 5,  // 5m（5×5の小升目）
    colCount: 3,   // A〜C
    rowCount: 6,   // 1〜6
    colLabels: 'ABC'.split(''),
  },
} as const;

/**
 * 外側マスの設定（スローイン用）
 *
 * フィールド外周に1マス分のエリアを追加:
 * - @列（X = -8.5m）: 左サイドラインの外側
 * - P列（X = +8.5m）: 右サイドラインの外側
 * - 0行（Z = +15.5m）: 上エンドライン外側
 * - 31行（Z = -15.5m）: 下エンドライン外側
 */
export const OUTER_GRID_CONFIG = {
  // 外側列（サイドライン外）
  outerColumnLeft: '@',   // X = -8.5m
  outerColumnRight: 'P',  // X = +8.5m

  // 外側行（エンドライン外）
  outerRowTop: 0,         // Z = +15.5m
  outerRowBottom: 31,     // Z = -15.5m

  // 外側マスのセルサイズ（内側と同じ）
  cellSize: 1.0,
} as const;

/**
 * フィールド座標ユーティリティ
 */
export class FieldGridUtils {
  private static halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
  private static halfLength = FIELD_CONFIG.length / 2; // 15m

  /**
   * 小升目の座標名を取得（例: "A1"）
   */
  static getCellName(col: number, row: number): string {
    if (col < 0 || col >= GRID_CONFIG.cell.colCount) return '';
    if (row < 1 || row > GRID_CONFIG.cell.rowCount) return '';
    return `${GRID_CONFIG.cell.colLabels[col]}${row}`;
  }

  /**
   * 座標名から小升目インデックスを取得
   */
  static parseCellName(name: string): CellCoord | null {
    const match = name.match(/^([A-O])(\d+)$/);
    if (!match) return null;
    const col = match[1];
    const row = parseInt(match[2], 10);
    if (row < 1 || row > GRID_CONFIG.cell.rowCount) return null;
    return { col, row };
  }

  /**
   * ブロックの座標名を取得（例: "A1"）
   */
  static getBlockName(col: number, row: number): string {
    if (col < 0 || col >= GRID_CONFIG.block.colCount) return '';
    if (row < 1 || row > GRID_CONFIG.block.rowCount) return '';
    return `${GRID_CONFIG.block.colLabels[col]}${row}`;
  }

  /**
   * 座標名からブロックインデックスを取得
   */
  static parseBlockName(name: string): BlockCoord | null {
    const match = name.match(/^([A-C])(\d+)$/);
    if (!match) return null;
    const col = match[1];
    const row = parseInt(match[2], 10);
    if (row < 1 || row > GRID_CONFIG.block.rowCount) return null;
    return { col, row };
  }

  /**
   * 小升目の座標からワールド座標（中心）を取得
   * @param col 列インデックス（0〜14）またはラベル（A〜O）
   * @param row 行番号（1〜30）
   */
  static cellToWorld(col: number | string, row: number): { x: number; z: number } | null {
    let colIndex: number;
    if (typeof col === 'string') {
      colIndex = GRID_CONFIG.cell.colLabels.indexOf(col);
      if (colIndex === -1) return null;
    } else {
      colIndex = col;
    }
    if (colIndex < 0 || colIndex >= GRID_CONFIG.cell.colCount) return null;
    if (row < 1 || row > GRID_CONFIG.cell.rowCount) return null;

    // 升目の中心座標を計算
    // X: 左端(-7.5m)から右へ、升目の中心は +0.5m
    // Z: 手前(-15m)から奥へ、升目の中心は +0.5m
    const x = -this.halfWidth + colIndex * GRID_CONFIG.cell.size + GRID_CONFIG.cell.size / 2;
    const z = -this.halfLength + (row - 1) * GRID_CONFIG.cell.size + GRID_CONFIG.cell.size / 2;

    return { x, z };
  }

  /**
   * ワールド座標から小升目の座標を取得
   */
  static worldToCell(x: number, z: number): CellCoord | null {
    const colIndex = Math.floor((x + this.halfWidth) / GRID_CONFIG.cell.size);
    const rowIndex = Math.floor((z + this.halfLength) / GRID_CONFIG.cell.size);

    if (colIndex < 0 || colIndex >= GRID_CONFIG.cell.colCount) return null;
    if (rowIndex < 0 || rowIndex >= GRID_CONFIG.cell.rowCount) return null;

    return {
      col: GRID_CONFIG.cell.colLabels[colIndex],
      row: rowIndex + 1,
    };
  }

  /**
   * ブロックの座標からワールド座標（中心）を取得
   * @param col 列インデックス（0〜2）またはラベル（A〜C）
   * @param row 行番号（1〜6）
   */
  static blockToWorld(col: number | string, row: number): { x: number; z: number } | null {
    let colIndex: number;
    if (typeof col === 'string') {
      colIndex = GRID_CONFIG.block.colLabels.indexOf(col);
      if (colIndex === -1) return null;
    } else {
      colIndex = col;
    }
    if (colIndex < 0 || colIndex >= GRID_CONFIG.block.colCount) return null;
    if (row < 1 || row > GRID_CONFIG.block.rowCount) return null;

    // ブロックの中心座標を計算
    const x = -this.halfWidth + colIndex * GRID_CONFIG.block.size + GRID_CONFIG.block.size / 2;
    const z = -this.halfLength + (row - 1) * GRID_CONFIG.block.size + GRID_CONFIG.block.size / 2;

    return { x, z };
  }

  /**
   * ワールド座標からブロックの座標を取得
   */
  static worldToBlock(x: number, z: number): BlockCoord | null {
    const colIndex = Math.floor((x + this.halfWidth) / GRID_CONFIG.block.size);
    const rowIndex = Math.floor((z + this.halfLength) / GRID_CONFIG.block.size);

    if (colIndex < 0 || colIndex >= GRID_CONFIG.block.colCount) return null;
    if (rowIndex < 0 || rowIndex >= GRID_CONFIG.block.rowCount) return null;

    return {
      col: GRID_CONFIG.block.colLabels[colIndex],
      row: rowIndex + 1,
    };
  }

  /**
   * 小升目がどのブロックに属するか取得
   */
  static cellToBlock(cellCol: string, cellRow: number): BlockCoord | null {
    const colIndex = GRID_CONFIG.cell.colLabels.indexOf(cellCol);
    if (colIndex === -1) return null;
    if (cellRow < 1 || cellRow > GRID_CONFIG.cell.rowCount) return null;

    const blockColIndex = Math.floor(colIndex / GRID_CONFIG.block.size);
    const blockRowIndex = Math.floor((cellRow - 1) / GRID_CONFIG.block.size);

    return {
      col: GRID_CONFIG.block.colLabels[blockColIndex],
      row: blockRowIndex + 1,
    };
  }

  /**
   * ブロック内の全小升目座標を取得
   */
  static getBlockCells(blockCol: string, blockRow: number): CellCoord[] {
    const blockColIndex = GRID_CONFIG.block.colLabels.indexOf(blockCol);
    if (blockColIndex === -1) return [];
    if (blockRow < 1 || blockRow > GRID_CONFIG.block.rowCount) return [];

    const cells: CellCoord[] = [];
    const startCol = blockColIndex * GRID_CONFIG.block.size;
    const startRow = (blockRow - 1) * GRID_CONFIG.block.size + 1;

    for (let c = 0; c < GRID_CONFIG.block.size; c++) {
      for (let r = 0; r < GRID_CONFIG.block.size; r++) {
        const colIndex = startCol + c;
        const row = startRow + r;
        if (colIndex < GRID_CONFIG.cell.colCount && row <= GRID_CONFIG.cell.rowCount) {
          cells.push({
            col: GRID_CONFIG.cell.colLabels[colIndex],
            row,
          });
        }
      }
    }

    return cells;
  }

  /**
   * 全ブロックの座標リストを取得
   */
  static getAllBlocks(): BlockCoord[] {
    const blocks: BlockCoord[] = [];
    for (let c = 0; c < GRID_CONFIG.block.colCount; c++) {
      for (let r = 1; r <= GRID_CONFIG.block.rowCount; r++) {
        blocks.push({
          col: GRID_CONFIG.block.colLabels[c],
          row: r,
        });
      }
    }
    return blocks;
  }

  // ============================================
  // 外側マス関連のメソッド
  // ============================================

  /**
   * 指定されたセルが外側マスかどうかを判定
   * @param col 列名（@ or P for outer columns, A-O for inner）
   * @param row 行番号（0 or 31 for outer rows, 1-30 for inner）
   */
  static isOuterCell(col: string, row: number): boolean {
    const isOuterColumn = col === OUTER_GRID_CONFIG.outerColumnLeft ||
                          col === OUTER_GRID_CONFIG.outerColumnRight;
    const isOuterRow = row === OUTER_GRID_CONFIG.outerRowTop ||
                       row === OUTER_GRID_CONFIG.outerRowBottom;
    const isInnerColumn = GRID_CONFIG.cell.colLabels.includes(col);
    const isInnerRow = row >= 1 && row <= GRID_CONFIG.cell.rowCount;

    // 外側列（@, P）で内側行（1-30）
    if (isOuterColumn && isInnerRow) return true;
    // 内側列（A-O）で外側行（0, 31）
    if (isInnerColumn && isOuterRow) return true;
    // コーナー外側（@0, @31, P0, P31）
    if (isOuterColumn && isOuterRow) return true;

    return false;
  }

  /**
   * ワールド座標から外側マスの座標を取得
   * @returns 外側マスの場合は座標、フィールド内の場合はnull
   */
  static worldToOuterCell(x: number, z: number): CellCoord | null {
    // サイドライン外側の判定
    if (x < -this.halfWidth) {
      // 左サイドライン外側（@列）
      const row = this.zToRow(z);
      return { col: OUTER_GRID_CONFIG.outerColumnLeft, row };
    }
    if (x > this.halfWidth) {
      // 右サイドライン外側（P列）
      const row = this.zToRow(z);
      return { col: OUTER_GRID_CONFIG.outerColumnRight, row };
    }

    // エンドライン外側の判定
    if (z > this.halfLength) {
      // 上エンドライン外側（0行）
      const col = this.xToColumnName(x);
      return { col, row: OUTER_GRID_CONFIG.outerRowTop };
    }
    if (z < -this.halfLength) {
      // 下エンドライン外側（31行）
      const col = this.xToColumnName(x);
      return { col, row: OUTER_GRID_CONFIG.outerRowBottom };
    }

    return null; // フィールド内
  }

  /**
   * X座標を列名に変換（A-O、クランプあり）
   */
  static xToColumnName(x: number): string {
    const colIndex = Math.floor((x + this.halfWidth) / GRID_CONFIG.cell.size);
    const clampedIndex = Math.max(0, Math.min(GRID_CONFIG.cell.colCount - 1, colIndex));
    return GRID_CONFIG.cell.colLabels[clampedIndex];
  }

  /**
   * Z座標を行番号に変換（1-30、クランプあり）
   */
  private static zToRow(z: number): number {
    // Z座標は-15から+15、行番号は1から30
    // z = -15 → row = 1, z = +15 → row = 30
    const rowIndex = Math.floor((z + this.halfLength) / GRID_CONFIG.cell.size);
    return Math.max(1, Math.min(GRID_CONFIG.cell.rowCount, rowIndex + 1));
  }

  /**
   * 外側マスの座標からワールド座標（中心）を取得
   * @param col 列名（@, A-O, P）
   * @param row 行番号（0, 1-30, 31）
   *
   * 外側マスの中心座標（計画書準拠）:
   * - @列: X = -8.5m（サイドライン -7.5m から 1m 外側）
   * - P列: X = +8.5m（サイドライン +7.5m から 1m 外側）
   * - 0行: Z = +15.5m（エンドライン +15m から 0.5m 外側）
   * - 31行: Z = -15.5m（エンドライン -15m から 0.5m 外側）
   */
  static outerCellToWorld(col: string, row: number): { x: number; z: number } | null {
    if (!this.isOuterCell(col, row)) {
      // 内側のセルの場合は通常のcellToWorldを使用
      return this.cellToWorld(col, row);
    }

    const cellSize = OUTER_GRID_CONFIG.cellSize;
    let x: number;
    let z: number;

    // X座標の計算
    if (col === OUTER_GRID_CONFIG.outerColumnLeft) {
      // @列: 左サイドライン外側（サイドラインから1m外側の中心 = -7.5 - 1.0 = -8.5）
      x = -this.halfWidth - cellSize;
    } else if (col === OUTER_GRID_CONFIG.outerColumnRight) {
      // P列: 右サイドライン外側（サイドラインから1m外側の中心 = +7.5 + 1.0 = +8.5）
      x = this.halfWidth + cellSize;
    } else {
      // A-O列
      const colIndex = GRID_CONFIG.cell.colLabels.indexOf(col);
      if (colIndex === -1) return null;
      x = -this.halfWidth + colIndex * cellSize + cellSize / 2;
    }

    // Z座標の計算
    if (row === OUTER_GRID_CONFIG.outerRowTop) {
      // 0行: 上エンドライン外側
      z = this.halfLength + cellSize / 2;
    } else if (row === OUTER_GRID_CONFIG.outerRowBottom) {
      // 31行: 下エンドライン外側
      z = -this.halfLength - cellSize / 2;
    } else {
      // 1-30行
      z = -this.halfLength + (row - 1) * cellSize + cellSize / 2;
    }

    return { x, z };
  }

  /**
   * 位置に応じたディフェンス係数を取得
   * 自軍ゴール付近で100%、相手ゴール付近で10%
   * 行番号（row）に基づいて線形補間
   *
   * @param z キャラクターのZ座標
   * @param team キャラクターのチーム（'ally' | 'enemy'）
   * @returns ディフェンス係数（0.1〜1.0）
   *
   * ally: 自軍ゴールは-Z側 → row 1で100%、row 30で10%
   * enemy: 自軍ゴールは+Z側 → row 30で100%、row 1で10%
   */
  static getDefenseCoefficient(z: number, team: 'ally' | 'enemy'): number {
    const MIN_COEFFICIENT = 0.1;  // 10%
    const MAX_COEFFICIENT = 1.0;  // 100%

    // Z座標を0-1の範囲に正規化（-15mで0、+15mで1）
    const normalizedZ = (z + this.halfLength) / (this.halfLength * 2);
    const clampedZ = Math.max(0, Math.min(1, normalizedZ));

    // ally: Z小さい（自軍ゴール側）= 高い係数、Z大きい（相手ゴール側）= 低い係数
    // enemy: Z大きい（自軍ゴール側）= 高い係数、Z小さい（相手ゴール側）= 低い係数
    let coefficient: number;
    if (team === 'ally') {
      // ally: clampedZ=0で1.0、clampedZ=1で0.1
      coefficient = MAX_COEFFICIENT - (MAX_COEFFICIENT - MIN_COEFFICIENT) * clampedZ;
    } else {
      // enemy: clampedZ=0で0.1、clampedZ=1で1.0
      coefficient = MIN_COEFFICIENT + (MAX_COEFFICIENT - MIN_COEFFICIENT) * clampedZ;
    }

    return coefficient;
  }

  /**
   * ディフェンス値に位置係数を適用
   * @param baseDefense 基本ディフェンス値
   * @param z キャラクターのZ座標
   * @param team キャラクターのチーム
   * @returns 位置係数を適用したディフェンス値
   */
  static applyDefenseCoefficient(baseDefense: number, z: number, team: 'ally' | 'enemy'): number {
    const coefficient = this.getDefenseCoefficient(z, team);
    return baseDefense * coefficient;
  }

}
