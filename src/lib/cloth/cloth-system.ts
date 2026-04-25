/**
 * Spring Bone ベースの布システム
 *
 * 設計:
 * - 全 voxel を 1 枚の skinned mesh にする（GPU skinning）
 * - synced/surface voxel は既存の body bone に hard-skin → body に rigid 追従
 * - gravity voxel は voxel 列（X,Y が同じ voxel の縦ライン）ごとに cloth bone 鎖を新規生成し、
 *   bone に hard-skin する。cloth bone は body bone を親にする（translation-only）
 * - 毎フレーム、cloth bone のみ spring 物理で動かす（body bone は既存 animation）
 * - これにより「1 枚物」「synced=剛体追従」「gravity=物理」を達成しつつ、
 *   PBD より 1〜2 桁軽い
 */
import {
  Scene, Mesh, Skeleton, Bone, Matrix, Vector3, VertexData,
  StandardMaterial, Color3, Node as BabylonNode,
  Observer, Nullable,
} from '@babylonjs/core';
import type { EquipBehavior } from '@/types/equip';
import { FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { GridWorldTransform, CapsuleDef } from './types';
import { HUMANOID_BONES, MIXAMO_HUMANOID_CAPSULES } from './capsules';

/** 分類済み cloth voxel */
export interface TaggedVoxel {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  behavior: EquipBehavior;
}

/** 生成された 1 本の cloth bone の情報 */
interface ClothBoneDef {
  /** skeleton.bones 内での index */
  skeletonIdx: number;
  /** 親の skeleton bone index（body bone か、親の cloth bone） */
  parentSkeletonIdx: number;
  /** 同じ chain の body ancestor bone の skeleton index（rotation 継承に使う） */
  bodyAncestorIdx: number;
  /** rest 時の parent からの local offset（body ancestor の rotation frame で表現） */
  restLocalX: number;
  restLocalY: number;
  restLocalZ: number;
}

/**
 * cloth bone 鎖を生成し skeleton に追加、voxel ごとの bone weight 割り当てを返す。
 *
 * - synced/surface voxel: 最寄り body bone に weight (新規 bone は作らない)
 * - gravity voxel: (X, Y) でクラスタリングして縦 chain を作成
 *   各 chain は 1〜3 segment、segment ごとに 1 本の cloth bone
 */
function buildClothBones(
  skeleton: Skeleton,
  voxels: TaggedVoxel[],
  transform: GridWorldTransform,
): {
  voxelToBone: Int32Array;
  clothBones: ClothBoneDef[];
} {
  const N = voxels.length;
  const voxelToBone = new Int32Array(N);
  voxelToBone.fill(-1);

  // 人体 bone を抽出
  const humanSet = new Set(HUMANOID_BONES);
  const humanBoneIdx: number[] = [];
  const humanBonePos: Array<[number, number, number]> = [];
  for (let i = 0; i < skeleton.bones.length; i++) {
    const b = skeleton.bones[i];
    if (!humanSet.has(b.name)) continue;
    const p = b.getAbsolutePosition();
    humanBoneIdx.push(i);
    humanBonePos.push([p.x, p.y, p.z]);
  }
  if (humanBoneIdx.length === 0) {
    throw new Error('buildClothBones: no humanoid bones in skeleton');
  }

  const nearestBody = (wx: number, wy: number, wz: number): number => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < humanBonePos.length; i++) {
      const [bx, by, bz] = humanBonePos[i];
      const dx = bx - wx, dy = by - wy, dz = bz - wz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return humanBoneIdx[best];
  };

  // 1. synced / surface voxel → 最寄り body bone
  for (let i = 0; i < N; i++) {
    const v = voxels[i];
    if (v.behavior === 'gravity') continue;
    const [wx, wy, wz] = transform.point(v.x + 0.5, v.y + 0.5, v.z + 0.5);
    voxelToBone[i] = nearestBody(wx, wy, wz);
  }

  // 2. gravity voxel → (X, Y) ごとの縦 chain
  const columns = new Map<string, number[]>(); // "x,y" → voxel indices
  for (let i = 0; i < N; i++) {
    if (voxels[i].behavior !== 'gravity') continue;
    const key = `${voxels[i].x},${voxels[i].y}`;
    let arr = columns.get(key);
    if (!arr) { arr = []; columns.set(key, arr); }
    arr.push(i);
  }

  const clothBones: ClothBoneDef[] = [];
  const tmpRotInv = new Matrix();
  const tmpVec = new Vector3();

  for (const [, indices] of columns) {
    // Z 降順（上から下）
    indices.sort((a, b) => voxels[b].z - voxels[a].z);

    // 1 chain あたり segment 数 (voxel 高さから決める、最大 3)
    const numSegs = Math.max(1, Math.min(3, Math.ceil(indices.length / 5)));
    const segSize = Math.ceil(indices.length / numSegs);

    let prevBoneSkeletonIdx = -1;
    let bodyAncestorIdx = -1;

    for (let seg = 0; seg < numSegs; seg++) {
      const segStart = seg * segSize;
      const segEnd = Math.min(segStart + segSize, indices.length);
      if (segStart >= segEnd) continue;
      const segVoxels = indices.slice(segStart, segEnd);

      // segment の世界座標中心
      let cx = 0, cy = 0, cz = 0;
      for (const vi of segVoxels) {
        const v = voxels[vi];
        const [wx, wy, wz] = transform.point(v.x + 0.5, v.y + 0.5, v.z + 0.5);
        cx += wx; cy += wy; cz += wz;
      }
      cx /= segVoxels.length; cy /= segVoxels.length; cz /= segVoxels.length;

      // parent と body ancestor を決める
      let parentSkeletonIdx: number;
      if (seg === 0) {
        parentSkeletonIdx = nearestBody(cx, cy, cz);
        bodyAncestorIdx = parentSkeletonIdx;
      } else {
        parentSkeletonIdx = prevBoneSkeletonIdx;
      }
      const parentBone = skeleton.bones[parentSkeletonIdx];
      const parentAbsPos = parentBone.getAbsolutePosition();

      // body ancestor の rotation inverse で world offset → local offset
      const bodyAnc = skeleton.bones[bodyAncestorIdx];
      const bodyAncMat = bodyAnc.getAbsoluteTransform();
      // rotation 部分のみ取り出して invert
      bodyAncMat.getRotationMatrixToRef(tmpRotInv);
      tmpRotInv.invert();

      const worldOffX = cx - parentAbsPos.x;
      const worldOffY = cy - parentAbsPos.y;
      const worldOffZ = cz - parentAbsPos.z;
      Vector3.TransformNormalFromFloatsToRef(
        worldOffX, worldOffY, worldOffZ, tmpRotInv, tmpVec,
      );
      const localX = tmpVec.x, localY = tmpVec.y, localZ = tmpVec.z;

      // Babylon Bone を作る（translation のみの local matrix）
      const localMat = Matrix.Translation(localX, localY, localZ);
      const newBone = new Bone(
        `cloth_${seg}_${skeleton.bones.length}`,
        skeleton, parentBone, localMat,
      );
      const newSkeletonIdx = skeleton.bones.indexOf(newBone);

      clothBones.push({
        skeletonIdx: newSkeletonIdx,
        parentSkeletonIdx,
        bodyAncestorIdx,
        restLocalX: localX,
        restLocalY: localY,
        restLocalZ: localZ,
      });

      // segment 内 voxel を新 bone に weight
      for (const vi of segVoxels) {
        voxelToBone[vi] = newSkeletonIdx;
      }

      prevBoneSkeletonIdx = newSkeletonIdx;
    }
  }

  // assign 漏れが無いか確認（安全網: 残りは最寄り body bone）
  for (let i = 0; i < N; i++) {
    if (voxelToBone[i] < 0) {
      const v = voxels[i];
      const [wx, wy, wz] = transform.point(v.x + 0.5, v.y + 0.5, v.z + 0.5);
      voxelToBone[i] = nearestBody(wx, wy, wz);
    }
  }

  return { voxelToBone, clothBones };
}

/**
 * voxel 群から 1 枚の skinned mesh を構築する。
 * 各 vertex は 1 つの bone に hard-skin (weight 1.0)。
 */
function buildSkinnedClothMesh(
  scene: Scene,
  name: string,
  voxels: TaggedVoxel[],
  voxelToBone: Int32Array,
  transform: GridWorldTransform,
  skeleton: Skeleton,
): Mesh | null {
  if (voxels.length === 0) return null;

  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const matIdx: number[] = [];
  const matW: number[] = [];

  for (let i = 0; i < voxels.length; i++) {
    const voxel = voxels[i];
    const boneIdx = voxelToBone[i];

    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;

      const bi = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];
      const [nwx, nwy, nwz] = transform.dir(fn[0], fn[1], fn[2]);
      for (let vi = 0; vi < 4; vi++) {
        const [wx, wy, wz] = transform.point(
          voxel.x + fv[vi][0], voxel.y + fv[vi][1], voxel.z + fv[vi][2],
        );
        positions.push(wx, wy, wz);
        normals.push(nwx, nwy, nwz);
        colors.push(voxel.r, voxel.g, voxel.b, 1);
        matIdx.push(boneIdx, 0, 0, 0);
        matW.push(1, 0, 0, 0);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }

  if (positions.length === 0) return null;

  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.indices = indices;
  vd.matricesIndices = matIdx;
  vd.matricesWeights = matW;

  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 1;  // hard skin

  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

/**
 * Spring Bone シミュレータ。
 *
 * 各 cloth bone は「parent から見た local offset」を持ち、
 * 物理的には world 空間で位置を追跡する。毎フレーム:
 *   1. 親の現 world pos と body ancestor の現 rotation から、「rigid target」世界位置を算出
 *   2. spring（target に戻る力）、gravity、damping で currentWorld を更新
 *   3. capsule 衝突判定で currentWorld を補正
 *   4. currentWorld から parent ローカル offset を逆算し bone.position にセット
 *
 * 親の更新後に子を処理する（parent-first 順、boneChainOrder で管理）。
 */
class SpringBoneSim {
  private skeleton: Skeleton;
  private clothBones: ClothBoneDef[];
  // skeleton idx → clothBones index（親参照で O(1) lookup したい）
  private skeletonIdxToClothIdx: Map<number, number>;
  // per-bone 世界位置（物理状態）
  private curX: Float32Array;
  private curY: Float32Array;
  private curZ: Float32Array;
  private velX: Float32Array;
  private velY: Float32Array;
  private velZ: Float32Array;
  // capsule collision
  private caps: Array<{ sBone: number; eBone: number; r: number; r2: number }>;
  // params
  private stiffness: number;
  private damping: number;
  private gravityWorldY: number;
  // tmp
  private tmpVec = new Vector3();
  private tmpRot = new Matrix();

  constructor(
    skeleton: Skeleton,
    clothBones: ClothBoneDef[],
    params: {
      stiffness?: number;
      damping?: number;
      gravity?: number;
      capsules?: CapsuleDef[];
    } = {},
  ) {
    this.skeleton = skeleton;
    this.clothBones = clothBones;
    this.stiffness = params.stiffness ?? 0.35;
    this.damping = params.damping ?? 0.88;
    this.gravityWorldY = params.gravity ?? -0.0015;

    this.skeletonIdxToClothIdx = new Map();
    for (let i = 0; i < clothBones.length; i++) {
      this.skeletonIdxToClothIdx.set(clothBones[i].skeletonIdx, i);
    }

    const n = clothBones.length;
    this.curX = new Float32Array(n);
    this.curY = new Float32Array(n);
    this.curZ = new Float32Array(n);
    this.velX = new Float32Array(n);
    this.velY = new Float32Array(n);
    this.velZ = new Float32Array(n);

    // rest 世界位置を current に初期化
    for (let i = 0; i < n; i++) {
      const cb = clothBones[i];
      // 親の世界位置: clothBone なら既に初期化済みの cur* を参照（parent-first 順前提）
      const parentClothIdx = this.skeletonIdxToClothIdx.get(cb.parentSkeletonIdx);
      let px: number, py: number, pz: number;
      if (parentClothIdx !== undefined) {
        px = this.curX[parentClothIdx];
        py = this.curY[parentClothIdx];
        pz = this.curZ[parentClothIdx];
      } else {
        const pp = skeleton.bones[cb.parentSkeletonIdx].getAbsolutePosition();
        px = pp.x; py = pp.y; pz = pp.z;
      }
      const bodyAnc = skeleton.bones[cb.bodyAncestorIdx];
      bodyAnc.getAbsoluteTransform().getRotationMatrixToRef(this.tmpRot);
      Vector3.TransformNormalFromFloatsToRef(
        cb.restLocalX, cb.restLocalY, cb.restLocalZ, this.tmpRot, this.tmpVec,
      );
      this.curX[i] = px + this.tmpVec.x;
      this.curY[i] = py + this.tmpVec.y;
      this.curZ[i] = pz + this.tmpVec.z;
    }

    // Capsule を bone index に解決
    const caps = params.capsules ?? [];
    const byName = new Map<string, number>();
    for (let i = 0; i < skeleton.bones.length; i++) byName.set(skeleton.bones[i].name, i);
    this.caps = [];
    for (const cap of caps) {
      const si = byName.get(cap.startBone);
      const ei = byName.get(cap.endBone);
      if (si === undefined || ei === undefined) continue;
      this.caps.push({ sBone: si, eBone: ei, r: cap.radius, r2: cap.radius * cap.radius });
    }
  }

  update(): void {
    const n = this.clothBones.length;
    const skel = this.skeleton;
    const stiff = this.stiffness;
    const damp = this.damping;
    const gY = this.gravityWorldY;

    for (let i = 0; i < n; i++) {
      const cb = this.clothBones[i];
      const parent = skel.bones[cb.parentSkeletonIdx];
      // 親の世界位置（body bone なら Babylon 管理、cloth bone なら i より前なので cur* 更新済み）
      let px: number, py: number, pz: number;
      const parentClothIdx = this.skeletonIdxToClothIdx.get(cb.parentSkeletonIdx);
      if (parentClothIdx !== undefined) {
        px = this.curX[parentClothIdx];
        py = this.curY[parentClothIdx];
        pz = this.curZ[parentClothIdx];
      } else {
        const pp = parent.getAbsolutePosition();
        px = pp.x; py = pp.y; pz = pp.z;
      }

      // body ancestor の rotation を取得
      const bodyAnc = skel.bones[cb.bodyAncestorIdx];
      bodyAnc.getAbsoluteTransform().getRotationMatrixToRef(this.tmpRot);
      Vector3.TransformNormalFromFloatsToRef(
        cb.restLocalX, cb.restLocalY, cb.restLocalZ, this.tmpRot, this.tmpVec,
      );
      const targetX = px + this.tmpVec.x;
      const targetY = py + this.tmpVec.y;
      const targetZ = pz + this.tmpVec.z;

      // spring + gravity + damping
      let vx = this.velX[i], vy = this.velY[i], vz = this.velZ[i];
      vx = vx * damp + (targetX - this.curX[i]) * stiff;
      vy = vy * damp + (targetY - this.curY[i]) * stiff + gY;
      vz = vz * damp + (targetZ - this.curZ[i]) * stiff;

      let nx = this.curX[i] + vx;
      let ny = this.curY[i] + vy;
      let nz = this.curZ[i] + vz;

      // capsule collision
      const collided = this.resolveCapsuleCollision(nx, ny, nz);
      if (collided) {
        nx = collided[0]; ny = collided[1]; nz = collided[2];
        // 衝突時は velocity を削る（跳ね返り防止）
        vx *= 0.3; vy *= 0.3; vz *= 0.3;
      }

      this.velX[i] = vx; this.velY[i] = vy; this.velZ[i] = vz;
      this.curX[i] = nx; this.curY[i] = ny; this.curZ[i] = nz;

      // bone.position を更新（parent frame の local offset = rotInv × (cur - parent)）
      // rotInv は bodyAncestor の rotation inverse
      bodyAnc.getAbsoluteTransform().getRotationMatrixToRef(this.tmpRot);
      this.tmpRot.invert();
      Vector3.TransformNormalFromFloatsToRef(
        nx - px, ny - py, nz - pz, this.tmpRot, this.tmpVec,
      );
      skel.bones[cb.skeletonIdx].setPosition(
        new Vector3(this.tmpVec.x, this.tmpVec.y, this.tmpVec.z),
      );
    }
  }

  /**
   * 与えられた world 位置が capsule に食い込んでいたら押し出した位置を返す。
   * 食い込んでなければ null。
   */
  private resolveCapsuleCollision(
    x: number, y: number, z: number,
  ): [number, number, number] | null {
    const skel = this.skeleton;
    let bestPush: [number, number, number] | null = null;
    let bestDepth = 0;
    for (const cap of this.caps) {
      const s = skel.bones[cap.sBone].getAbsolutePosition();
      const e = skel.bones[cap.eBone].getAbsolutePosition();
      const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z;
      const segLen2 = dx * dx + dy * dy + dz * dz;
      const pvx = x - s.x, pvy = y - s.y, pvz = z - s.z;
      let t = segLen2 > 1e-12 ? (dx * pvx + dy * pvy + dz * pvz) / segLen2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const ccx = s.x + t * dx, ccy = s.y + t * dy, ccz = s.z + t * dz;
      const rx = x - ccx, ry = y - ccy, rz = z - ccz;
      const d2 = rx * rx + ry * ry + rz * rz;
      if (d2 >= cap.r2) continue;
      const d = Math.sqrt(d2);
      const depth = cap.r - d;
      if (depth > bestDepth) {
        bestDepth = depth;
        if (d < 1e-8) {
          bestPush = [ccx, ccy + cap.r, ccz];
        } else {
          const s2 = cap.r / d;
          bestPush = [ccx + rx * s2, ccy + ry * s2, ccz + rz * s2];
        }
      }
    }
    return bestPush;
  }
}

/**
 * 布システム全体（メッシュ + 物理）を一括管理する。
 */
export class SpringClothSystem {
  readonly mesh: Mesh;
  readonly boneCount: number;
  readonly voxelCount: number;

  private scene: Scene;
  private sim: SpringBoneSim;
  private observer: Nullable<Observer<Scene>> = null;

  constructor(
    scene: Scene,
    voxels: TaggedVoxel[],
    transform: GridWorldTransform,
    skeleton: Skeleton,
    meshName: string,
    options: {
      parentNode?: BabylonNode;
      capsules?: CapsuleDef[];
      stiffness?: number;
      damping?: number;
      gravity?: number;
      autoUpdate?: boolean;
    } = {},
  ) {
    this.scene = scene;
    this.voxelCount = voxels.length;

    // 1. cloth bone 鎖を生成
    const { voxelToBone, clothBones } = buildClothBones(skeleton, voxels, transform);
    this.boneCount = clothBones.length;

    // 2. skinned mesh を構築
    const mesh = buildSkinnedClothMesh(scene, meshName, voxels, voxelToBone, transform, skeleton);
    if (!mesh) throw new Error('SpringClothSystem: mesh build failed');
    this.mesh = mesh;
    if (options.parentNode) mesh.parent = options.parentNode;

    // 3. spring 物理
    this.sim = new SpringBoneSim(skeleton, clothBones, {
      stiffness: options.stiffness,
      damping: options.damping,
      gravity: options.gravity,
      capsules: options.capsules ?? MIXAMO_HUMANOID_CAPSULES,
    });

    // 4. 毎フレ更新 observer
    if (options.autoUpdate ?? true) {
      this.observer = scene.onBeforeRenderObservable.add(() => this.sim.update());
    }
  }

  update(): void {
    this.sim.update();
  }

  dispose(): void {
    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }
    if (this.mesh.material) this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

