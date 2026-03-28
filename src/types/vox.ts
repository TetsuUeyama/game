// ========================================================================
// VOX関連の共通型定義
// ========================================================================

/** VOXモデルデータ（パース結果） */
export interface VoxModel {
  sizeX: number; sizeY: number; sizeZ: number;
  voxels: { x: number; y: number; z: number; colorIndex: number }[];
  palette: { r: number; g: number; b: number }[];
}

/** 色付きボクセルエントリ（座標+RGB） */
export interface VoxelEntry {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
}

/** セグメントバンドルデータ（全ボーンのボクセルを1ファイルに格納） */
export interface SegmentBundleData {
  grid: { gx: number; gy: number; gz: number };
  palette: number[][];
  segments: Record<string, number[]>;
}

/** セグメント情報（ボーン位置やグリッド情報を含むメタデータ） */
export interface SegmentsData {
  voxel_size: number;
  grid: { gx: number; gy: number; gz: number };
  bone_positions: Record<string, { head_voxel: number[]; tail_voxel: number[] }>;
  segments: Record<string, { file: string; voxels: number }>;
}

/** グリッド情報 */
export interface GridInfo {
  voxel_size: number;
  gx: number;
  gy: number;
  gz: number;
}
