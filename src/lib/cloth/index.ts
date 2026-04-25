/**
 * Voxel Cloth Library
 *
 * ボクセル形式の衣装/布を PBD シミュレーションで動かすためのライブラリ。
 *
 * 基本的な使い方:
 * ```ts
 * import { VoxelCloth, MIXAMO_HUMANOID_CAPSULES } from '@/lib/cloth';
 *
 * const cloth = new VoxelCloth(scene, {
 *   voxels: gravityVoxels,       // ClothVoxel[]
 *   grid,                         // GridInfo
 *   skeleton,                     // Babylon Skeleton
 *   capsules: MIXAMO_HUMANOID_CAPSULES,  // 体衝突
 * });
 * // ...
 * cloth.dispose();
 * ```
 */

export { VoxelCloth } from './voxel-cloth';
export { SpringClothSystem, type TaggedVoxel } from './cloth-system';
export { buildBodySkinnedMesh, type BodySkinVoxel } from './body-skin';
export {
  MIXAMO_HUMANOID_CAPSULES,
  DEFAULT_ANCHOR_BONES,
  HUMANOID_BONES,
} from './capsules';
export type {
  ClothOptions,
  ClothVoxel,
  ClothStats,
  CapsuleDef,
  GridInfo,
} from './types';
