import type { Skeleton } from '@babylonjs/core';

/** ボクセルグリッドのワールド配置情報 */
export interface GridInfo {
  voxel_size: number;
  grid_origin: [number, number, number];
  gx: number;
  gy: number;
  gz: number;
}

/** 布を構成する1ボクセル（グリッド座標 + 色） */
export interface ClothVoxel {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
}

/** ボディ衝突用カプセル定義（ボーン A → B を線分、radius の半径） */
export interface CapsuleDef {
  startBone: string;
  endBone: string;
  radius: number;
}

/**
 * Grid 座標 → world 座標の変換。skeleton 軸検出から動的に構築される。
 * 未指定時は Blender→glTF の規約 (x, z, -y) へのフォールバックを使う。
 */
export interface GridWorldTransform {
  point: (gx: number, gy: number, gz: number) => [number, number, number];
  dir: (dx: number, dy: number, dz: number) => [number, number, number];
}

/** VoxelCloth が公開する統計情報 */
export interface ClothStats {
  voxelCount: number;
  pinnedCount: number;
  stretchConstraints: number;
  bendingConstraints: number;
  capsuleCount: number;
}

/** VoxelCloth 生成オプション */
export interface ClothOptions {
  /** 布を構成するボクセル（gravity 指定された voxel のみ想定） */
  voxels: ClothVoxel[];
  /** ボクセルグリッド情報 */
  grid: GridInfo;
  /** 骨格。pin・衝突判定対象 */
  skeleton: Skeleton;

  /** mesh 名プレフィックス */
  name?: string;

  /**
   * 布と接触している非布ボクセルの位置集合（"x,y,z" 形式キー）。
   * 布の上端判定で「moving voxel 隣接 → pin」に使う。
   */
  anchorVoxelSet?: Set<string>;

  /**
   * 布の上端 pin 候補とするボーン名リスト。
   * 脚・腕ボーンを除外することで「脚の動きに布が引きずられる」挙動を防ぐ。
   * 未指定の場合は胴体系ボーンが使われる。
   */
  anchorBones?: string[];

  /** ボディ衝突カプセル。空配列なら衝突判定を行わない。 */
  capsules?: CapsuleDef[];

  // ---- 物理パラメータ ----
  /** 重力加速度(Y軸, ワールド単位/frame^2)。既定 -0.0002 */
  gravity?: number;
  /** 速度減衰係数 (0..1)。1に近いほど長く揺れる。既定 0.96 */
  damping?: number;
  /** PBD 外側反復数。既定 16 */
  iterations?: number;
  /** 衝突判定を行う反復頻度（N iter ごと）。既定 4 */
  collisionEvery?: number;
  /** ボクセル描画の膨張率。隙間防止。既定 1.30 */
  voxelInflate?: number;

  /** true ならシーンに毎フレ自動更新する Observer を登録（既定 true） */
  autoUpdate?: boolean;

  /**
   * Grid 座標 → world 座標の変換。skeleton 軸実測から動的に構築されたもの。
   * 未指定時は Blender→glTF の hardcoded 変換 (x, z, -y) を使う（レガシー互換）。
   * 新規コードは必ず渡すこと。
   */
  gridTransform?: GridWorldTransform;
}
