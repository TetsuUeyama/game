// ========================================================================
// 装備関連の共通型定義
// ========================================================================

/** 装備ビヘイビアの種類 */
export type EquipBehavior = 'synced' | 'surface' | 'gravity';

/** ボクセルレベルのビヘイビアデータ（APIとの送受信用） */
export interface BehaviorData {
  surface: string[];
  gravity: string[];
}

/** 装備パーツの型定義 */
export interface EquipPart {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
}

/** パーツマニフェストのエントリ型 */
export interface EquipManifestEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
  meshes: string[];
  is_body: boolean;
  category?: string;
}

/** ビヘイビアタイプの情報（UI表示用） */
export interface BehaviorInfo {
  value: EquipBehavior;
  label: string;
  labelJa: string;
  color: string;
  desc?: string;
  shortcut?: string;
}

/** 共通ビヘイビア情報定義 */
export const BEHAVIOR_INFO_LIST: BehaviorInfo[] = [
  { value: 'synced', label: 'Synced', labelJa: 'body同期', color: '#4a6', desc: '体の動きに完全同期。シャツ・パンツなど。', shortcut: '1' },
  { value: 'surface', label: 'Surface', labelJa: '表面維持', color: '#68f', desc: '体表面に追従しつつ形状維持。肩パッド・アクセサリーなど。', shortcut: '2' },
  { value: 'gravity', label: 'Gravity', labelJa: '重力影響', color: '#f84', desc: '重力の影響を受ける。髪・ペンダント・マントなど。', shortcut: '3' },
];

/** ビヘイビアタイプごとの3D表示色 */
export const BEHAVIOR_COLORS: Record<EquipBehavior, { r: number; g: number; b: number }> = {
  synced:  { r: 0.30, g: 0.70, b: 0.40 },
  surface: { r: 0.40, g: 0.55, b: 1.00 },
  gravity: { r: 1.00, g: 0.55, b: 0.25 },
};
