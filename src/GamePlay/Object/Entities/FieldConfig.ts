/**
 * フィールドの碁盤目座標システム
 * 元: GameSystem/FieldSystem/FieldGridConfig.ts から移動
 *
 * 小升目: 横A〜O（15個）、縦1〜30
 * 大枠（ブロック）: 5×5の升目をまとめた単位、3×6=18ブロック
 */

// フィールド設定（バスケットコートサイズ）
export const FIELD_CONFIG = {
  length: 30, // コートの長さ（m）- Z軸方向（5×5大枠が6つ並ぶ）
  width: 15, // コートの幅（m）- X軸方向
  floorColor: '#F5D2B0', // 床の色（肌色 - バスケットコート）
  gridSize: 10, // グリッドのサイズ
  gridColor: '#D4B896', // グリッドの色（薄い茶色）

  // センターサークル設定
  centerCircleRadius: 1.8, // センターサークル半径（m）- FIBA基準
  centerCircleLineWidth: 0.05, // ラインの太さ（m）
  centerCircleColor: '#8B4513', // ラインの色（茶色 - 肌色床とのコントラスト確保）
};

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
 */
export const OUTER_GRID_CONFIG = {
  outerColumnLeft: '@',   // X = -8.5m
  outerColumnRight: 'P',  // X = +8.5m
  outerRowTop: 0,         // Z = +15.5m
  outerRowBottom: 31,     // Z = -15.5m
  cellSize: 1.0,
} as const;

/**
 * フィールド座標ユーティリティ
 */
export class FieldGridUtils {
  private static halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
  private static halfLength = FIELD_CONFIG.length / 2; // 15m

  static getCellName(col: number, row: number): string {
    if (col < 0 || col >= GRID_CONFIG.cell.colCount) return '';
    if (row < 1 || row > GRID_CONFIG.cell.rowCount) return '';
    return `${GRID_CONFIG.cell.colLabels[col]}${row}`;
  }

  static parseCellName(name: string): CellCoord | null {
    const match = name.match(/^([A-O])(\d+)$/);
    if (!match) return null;
    const col = match[1];
    const row = parseInt(match[2], 10);
    if (row < 1 || row > GRID_CONFIG.cell.rowCount) return null;
    return { col, row };
  }

  static getBlockName(col: number, row: number): string {
    if (col < 0 || col >= GRID_CONFIG.block.colCount) return '';
    if (row < 1 || row > GRID_CONFIG.block.rowCount) return '';
    return `${GRID_CONFIG.block.colLabels[col]}${row}`;
  }

  static parseBlockName(name: string): BlockCoord | null {
    const match = name.match(/^([A-C])(\d+)$/);
    if (!match) return null;
    const col = match[1];
    const row = parseInt(match[2], 10);
    if (row < 1 || row > GRID_CONFIG.block.rowCount) return null;
    return { col, row };
  }

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

    const x = -this.halfWidth + colIndex * GRID_CONFIG.cell.size + GRID_CONFIG.cell.size / 2;
    const z = -this.halfLength + (row - 1) * GRID_CONFIG.cell.size + GRID_CONFIG.cell.size / 2;
    return { x, z };
  }

  static worldToCell(x: number, z: number): CellCoord | null {
    const colIndex = Math.floor((x + this.halfWidth) / GRID_CONFIG.cell.size);
    const rowIndex = Math.floor((z + this.halfLength) / GRID_CONFIG.cell.size);
    if (colIndex < 0 || colIndex >= GRID_CONFIG.cell.colCount) return null;
    if (rowIndex < 0 || rowIndex >= GRID_CONFIG.cell.rowCount) return null;
    return { col: GRID_CONFIG.cell.colLabels[colIndex], row: rowIndex + 1 };
  }

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

    const x = -this.halfWidth + colIndex * GRID_CONFIG.block.size + GRID_CONFIG.block.size / 2;
    const z = -this.halfLength + (row - 1) * GRID_CONFIG.block.size + GRID_CONFIG.block.size / 2;
    return { x, z };
  }

  static worldToBlock(x: number, z: number): BlockCoord | null {
    const colIndex = Math.floor((x + this.halfWidth) / GRID_CONFIG.block.size);
    const rowIndex = Math.floor((z + this.halfLength) / GRID_CONFIG.block.size);
    if (colIndex < 0 || colIndex >= GRID_CONFIG.block.colCount) return null;
    if (rowIndex < 0 || rowIndex >= GRID_CONFIG.block.rowCount) return null;
    return { col: GRID_CONFIG.block.colLabels[colIndex], row: rowIndex + 1 };
  }

  static cellToBlock(cellCol: string, cellRow: number): BlockCoord | null {
    const colIndex = GRID_CONFIG.cell.colLabels.indexOf(cellCol);
    if (colIndex === -1) return null;
    if (cellRow < 1 || cellRow > GRID_CONFIG.cell.rowCount) return null;

    const blockColIndex = Math.floor(colIndex / GRID_CONFIG.block.size);
    const blockRowIndex = Math.floor((cellRow - 1) / GRID_CONFIG.block.size);
    return { col: GRID_CONFIG.block.colLabels[blockColIndex], row: blockRowIndex + 1 };
  }

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
          cells.push({ col: GRID_CONFIG.cell.colLabels[colIndex], row });
        }
      }
    }
    return cells;
  }

  static getAllBlocks(): BlockCoord[] {
    const blocks: BlockCoord[] = [];
    for (let c = 0; c < GRID_CONFIG.block.colCount; c++) {
      for (let r = 1; r <= GRID_CONFIG.block.rowCount; r++) {
        blocks.push({ col: GRID_CONFIG.block.colLabels[c], row: r });
      }
    }
    return blocks;
  }

  static isOuterCell(col: string, row: number): boolean {
    const isOuterColumn = col === OUTER_GRID_CONFIG.outerColumnLeft ||
                          col === OUTER_GRID_CONFIG.outerColumnRight;
    const isOuterRow = row === OUTER_GRID_CONFIG.outerRowTop ||
                       row === OUTER_GRID_CONFIG.outerRowBottom;
    const isInnerColumn = GRID_CONFIG.cell.colLabels.includes(col);
    const isInnerRow = row >= 1 && row <= GRID_CONFIG.cell.rowCount;

    if (isOuterColumn && isInnerRow) return true;
    if (isInnerColumn && isOuterRow) return true;
    if (isOuterColumn && isOuterRow) return true;
    return false;
  }

  static worldToOuterCell(x: number, z: number): CellCoord | null {
    if (x < -this.halfWidth) {
      const row = this.zToRow(z);
      return { col: OUTER_GRID_CONFIG.outerColumnLeft, row };
    }
    if (x > this.halfWidth) {
      const row = this.zToRow(z);
      return { col: OUTER_GRID_CONFIG.outerColumnRight, row };
    }
    if (z > this.halfLength) {
      const col = this.xToColumnName(x);
      return { col, row: OUTER_GRID_CONFIG.outerRowTop };
    }
    if (z < -this.halfLength) {
      const col = this.xToColumnName(x);
      return { col, row: OUTER_GRID_CONFIG.outerRowBottom };
    }
    return null;
  }

  static xToColumnName(x: number): string {
    const colIndex = Math.floor((x + this.halfWidth) / GRID_CONFIG.cell.size);
    const clampedIndex = Math.max(0, Math.min(GRID_CONFIG.cell.colCount - 1, colIndex));
    return GRID_CONFIG.cell.colLabels[clampedIndex];
  }

  private static zToRow(z: number): number {
    const rowIndex = Math.floor((z + this.halfLength) / GRID_CONFIG.cell.size);
    return Math.max(1, Math.min(GRID_CONFIG.cell.rowCount, rowIndex + 1));
  }

  static outerCellToWorld(col: string, row: number): { x: number; z: number } | null {
    if (!this.isOuterCell(col, row)) {
      return this.cellToWorld(col, row);
    }

    const cellSize = OUTER_GRID_CONFIG.cellSize;
    let x: number;
    let z: number;

    if (col === OUTER_GRID_CONFIG.outerColumnLeft) {
      x = -this.halfWidth - cellSize;
    } else if (col === OUTER_GRID_CONFIG.outerColumnRight) {
      x = this.halfWidth + cellSize;
    } else {
      const colIndex = GRID_CONFIG.cell.colLabels.indexOf(col);
      if (colIndex === -1) return null;
      x = -this.halfWidth + colIndex * cellSize + cellSize / 2;
    }

    if (row === OUTER_GRID_CONFIG.outerRowTop) {
      z = this.halfLength + cellSize / 2;
    } else if (row === OUTER_GRID_CONFIG.outerRowBottom) {
      z = -this.halfLength - cellSize / 2;
    } else {
      z = -this.halfLength + (row - 1) * cellSize + cellSize / 2;
    }

    return { x, z };
  }

  static getDefenseCoefficient(z: number, team: 'ally' | 'enemy'): number {
    const MIN_COEFFICIENT = 0.1;
    const MAX_COEFFICIENT = 1.0;

    const normalizedZ = (z + this.halfLength) / (this.halfLength * 2);
    const clampedZ = Math.max(0, Math.min(1, normalizedZ));

    let coefficient: number;
    if (team === 'ally') {
      coefficient = MAX_COEFFICIENT - (MAX_COEFFICIENT - MIN_COEFFICIENT) * clampedZ;
    } else {
      coefficient = MIN_COEFFICIENT + (MAX_COEFFICIENT - MIN_COEFFICIENT) * clampedZ;
    }
    return coefficient;
  }

  static applyDefenseCoefficient(baseDefense: number, z: number, team: 'ally' | 'enemy'): number {
    const coefficient = this.getDefenseCoefficient(z, team);
    return baseDefense * coefficient;
  }
}
