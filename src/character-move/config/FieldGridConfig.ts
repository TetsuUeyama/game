/**
 * フィールドの碁盤目座標システム
 * 小升目: 横A〜O（15個）、縦1〜30
 * 大枠（ブロック）: 5×5の升目をまとめた単位、3×6=18ブロック
 */

import { FIELD_CONFIG } from "./gameConfig";

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
}
