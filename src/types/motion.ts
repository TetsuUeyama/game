// ========================================================================
// モーション関連の共通型定義
// ========================================================================

/** ボーン階層の1エントリ */
export interface BoneHierarchyEntry {
  bone: string;
  parent: string | null;
  jointPoint: number[];
  children: string[];
}

/** ポーズデータ（ボーン名→オイラー角回転[度]のマップ） */
export type PoseData = Record<string, { rx: number; ry: number; rz: number }>;

/** キーフレーム（ラベルとポーズデータ） */
export interface Keyframe {
  label: string;
  pose: PoseData;
}

/** ボーンごとの角度物理演算パラメータ */
export interface BonePhysics {
  ox: number; oy: number; oz: number;
  vx: number; vy: number; vz: number;
  mass: number;
  locked: boolean;
}

/** モーションデータ（アニメーション用） */
export interface MotionData {
  fps: number;
  frame_count: number;
  babylonFormat?: boolean;
  bones: Record<string, {
    matrices: number[][];
  }>;
}

/** Blenderからの生モーションデータ（座標変換未適用） */
export interface RawMotionData {
  format: 'blender_raw';
  fps: number;
  frame_count: number;
  bind_pose_rest: Record<string, number[]>;
  bind_pose_eval: Record<string, number[]>;
  animated: Record<string, { matrices: number[][] }>;
}
