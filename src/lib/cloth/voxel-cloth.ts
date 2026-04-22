




import { Scene, Mesh, Observer, VertexBuffer } from '@babylonjs/core';
import type { ClothOptions, ClothStats } from './types';
import { DEFAULT_ANCHOR_BONES } from './capsules';
import { buildClothMesh, defaultBlenderToGltfTransform } from './mesh-builder';
import { buildPbdState, stepPbd, type PbdState } from './pbd-sim';

/**
 * ボクセル布のシミュレーションを一括管理するクラス。
 *
 * 使い方:
 * ```ts
 * import { VoxelCloth, MIXAMO_HUMANOID_CAPSULES } from '@/lib/cloth';
 *
 * const cloth = new VoxelCloth(scene, {
 *   voxels: gravityVoxels,
 *   grid,
 *   skeleton,
 *   capsules: MIXAMO_HUMANOID_CAPSULES,
 * });
 *
 * // 自動で毎フレ更新
 * // 終了時:
 * cloth.dispose();
 * ```
 */
export class VoxelCloth {
  /** シミュレーションで使っている Babylon Mesh。外から visibility など変えてよい */
  readonly mesh: Mesh;
  /** 構築時の統計情報 */
  readonly stats: ClothStats;

  private state: PbdState | null;
  private vertexVoxelIdx: Int32Array;
  private restPositions: Float32Array;
  private positionsBuf: Float32Array;
  private observer: Observer<Scene> | null = null;
  private scene: Scene;

  constructor(scene: Scene, options: ClothOptions) {
    this.scene = scene;
    const name = options.name ?? 'voxel_cloth';
    const inflate = options.voxelInflate ?? 1.30;

    const voxels = options.voxels;
    const anchorVoxelSet = options.anchorVoxelSet ?? new Set<string>();

    // 実測軸ベースの transform があればそれを使う。無ければ Blender→glTF のレガシー変換。
    const transform = options.gridTransform ?? defaultBlenderToGltfTransform(options.grid);

    const built = buildClothMesh(scene, name, voxels, transform, inflate);
    if (!built) throw new Error('VoxelCloth: voxel set is empty');

    this.mesh = built.mesh;
    this.vertexVoxelIdx = built.vertexVoxelIdx;
    this.restPositions = built.restPositions;
    this.positionsBuf = new Float32Array(built.restPositions.length);

    const anchorBones = options.anchorBones ?? [...DEFAULT_ANCHOR_BONES];
    const capsules = options.capsules ?? [];

    this.state = buildPbdState(
      voxels, options.grid, options.skeleton,
      anchorVoxelSet, anchorBones, capsules,
      {
        gravity: options.gravity ?? -0.0002,
        damping: options.damping ?? 0.96,
        iterations: options.iterations ?? 16,
        collisionEvery: options.collisionEvery ?? 4,
      },
      transform,
    );

    let pinnedCount = 0;
    for (let i = 0; i < this.state.voxelCount; i++) {
      if (this.state.pinnedBone[i] >= 0) pinnedCount++;
    }
    this.stats = {
      voxelCount: this.state.voxelCount,
      pinnedCount,
      stretchConstraints: this.state.stretchA.length,
      bendingConstraints: this.state.bendingA.length,
      capsuleCount: this.state.capsuleStartBone.length,
    };

    if (options.autoUpdate ?? true) {
      this.observer = scene.onBeforeRenderObservable.add(() => this.update());
    }
  }

  /** 1 フレーム分シミュレーションを進めて mesh に反映。autoUpdate=true なら自動呼び出し */
  update(): void {
    if (!this.state) return;
    stepPbd(this.state);

    const buf = this.positionsBuf;
    const rest = this.restPositions;
    const vmap = this.vertexVoxelIdx;
    const { posX, posY, posZ, restX, restY, restZ } = this.state;
    const vertexCount = vmap.length;
    for (let vi = 0; vi < vertexCount; vi++) {
      const voxIdx = vmap[vi];
      const base = vi * 3;
      buf[base + 0] = rest[base + 0] + (posX[voxIdx] - restX[voxIdx]);
      buf[base + 1] = rest[base + 1] + (posY[voxIdx] - restY[voxIdx]);
      buf[base + 2] = rest[base + 2] + (posZ[voxIdx] - restZ[voxIdx]);
    }
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, buf);
  }

  /** Observer を解除して mesh/material を dispose */
  dispose(): void {
    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
    if (this.mesh.material) this.mesh.material.dispose();
    this.mesh.dispose();
    this.state = null;
  }
}
