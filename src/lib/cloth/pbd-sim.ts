import type { Skeleton } from '@babylonjs/core';
import { FACE_DIRS } from '@/lib/vox-parser';
import type { ClothVoxel, GridInfo, CapsuleDef, GridWorldTransform } from './types';
import { HUMANOID_BONES } from './capsules';
import { voxelCenterWorld } from './mesh-builder';

/** PBD 状態（内部用、VoxelCloth が保持） */
export interface PbdState {
  voxelCount: number;
  posX: Float32Array; posY: Float32Array; posZ: Float32Array;
  prevX: Float32Array; prevY: Float32Array; prevZ: Float32Array;
  restX: Float32Array; restY: Float32Array; restZ: Float32Array;
  pinnedBone: Int16Array;

  stretchA: Int32Array;
  stretchB: Int32Array;
  stretchRestLen: Float32Array;
  bendingA: Int32Array;
  bendingB: Int32Array;
  bendingRestLen: Float32Array;

  skeleton: Skeleton;
  anchorRestX: Float32Array;
  anchorRestY: Float32Array;
  anchorRestZ: Float32Array;

  capsuleStartBone: Int32Array;
  capsuleEndBone: Int32Array;
  capsuleRadius: Float32Array;
  capSx: Float32Array; capSy: Float32Array; capSz: Float32Array;
  capEx: Float32Array; capEy: Float32Array; capEz: Float32Array;
  capSegLen2: Float32Array;
  capR2: Float32Array;

  gravity: number;
  damping: number;
  iterations: number;
  collisionEvery: number;
}

export interface PbdBuildParams {
  gravity: number;
  damping: number;
  iterations: number;
  collisionEvery: number;
}

function nearestBoneIndex(
  wx: number, wy: number, wz: number,
  bonePositions: Array<[number, number, number]>,
  boneIndexMap: number[],
): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < bonePositions.length; i++) {
    const [bx, by, bz] = bonePositions[i];
    const dx = bx - wx, dy = by - wy, dz = bz - wz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return boneIndexMap[best];
}

// 距離制約オフセット
const STRETCH_OFFSETS: Array<[number, number, number]> = [
  // 6-neighbor
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  // 12 edge-diagonals
  [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
  [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
  [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1],
  // 8 corner-diagonals
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
];
const BENDING_OFFSETS: Array<[number, number, number]> = [
  [2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2],
  [2, 2, 0], [2, -2, 0], [-2, 2, 0], [-2, -2, 0],
  [2, 0, 2], [2, 0, -2], [-2, 0, 2], [-2, 0, -2],
  [0, 2, 2], [0, 2, -2], [0, -2, 2], [0, -2, -2],
];

/**
 * PBD 状態を構築する（ボクセル位置 → ノード + 制約 + pin + カプセル）。
 */
export function buildPbdState(
  voxels: ClothVoxel[],
  _grid: GridInfo,
  skeleton: Skeleton,
  anchorVoxelSet: Set<string>,
  anchorBoneNames: string[],
  capsules: CapsuleDef[],
  params: PbdBuildParams,
  transform: GridWorldTransform,
): PbdState {
  const N = voxels.length;
  const posX = new Float32Array(N), posY = new Float32Array(N), posZ = new Float32Array(N);
  const prevX = new Float32Array(N), prevY = new Float32Array(N), prevZ = new Float32Array(N);
  const restX = new Float32Array(N), restY = new Float32Array(N), restZ = new Float32Array(N);
  const pinnedBone = new Int16Array(N);
  pinnedBone.fill(-1);

  const voxelIdx = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const v = voxels[i];
    voxelIdx.set(`${v.x},${v.y},${v.z}`, i);
    const [wx, wy, wz] = voxelCenterWorld(v, transform);
    restX[i] = wx; restY[i] = wy; restZ[i] = wz;
    posX[i] = wx; posY[i] = wy; posZ[i] = wz;
    prevX[i] = wx; prevY[i] = wy; prevZ[i] = wz;
  }

  // 人体ボーン位置を抽出
  const humanBonesSet = new Set(HUMANOID_BONES);
  const bonePositions: Array<[number, number, number]> = [];
  const boneIndexMap: number[] = [];
  for (let i = 0; i < skeleton.bones.length; i++) {
    const b = skeleton.bones[i];
    if (!humanBonesSet.has(b.name)) continue;
    const p = b.getAbsolutePosition();
    bonePositions.push([p.x, p.y, p.z]);
    boneIndexMap.push(i);
  }

  // アンカーボーン（布の上端 pin 用）
  const anchorBonesSet = new Set(anchorBoneNames);
  const anchorPositions: Array<[number, number, number]> = [];
  const anchorIndexMap: number[] = [];
  for (let bi = 0; bi < boneIndexMap.length; bi++) {
    const origIdx = boneIndexMap[bi];
    if (anchorBonesSet.has(skeleton.bones[origIdx].name)) {
      anchorPositions.push(bonePositions[bi]);
      anchorIndexMap.push(origIdx);
    }
  }

  // Pin: (a) 非布ボクセル（anchorVoxelSet）と接する / (b) 上に布 voxel 無い（布の上端）
  for (let i = 0; i < N; i++) {
    const v = voxels[i];
    let hasAnchorNeighbor = false;
    for (const [dx, dy, dz] of FACE_DIRS) {
      const key = `${v.x + dx},${v.y + dy},${v.z + dz}`;
      if (anchorVoxelSet.has(key) && !voxelIdx.has(key)) { hasAnchorNeighbor = true; break; }
    }
    const aboveKey = `${v.x},${v.y},${v.z + 1}`;
    const noVoxelAbove = !voxelIdx.has(aboveKey);

    if (hasAnchorNeighbor && bonePositions.length > 0) {
      const [wx, wy, wz] = voxelCenterWorld(v, transform);
      pinnedBone[i] = nearestBoneIndex(wx, wy, wz, bonePositions, boneIndexMap);
    } else if (noVoxelAbove) {
      const [wx, wy, wz] = voxelCenterWorld(v, transform);
      if (anchorPositions.length > 0) {
        pinnedBone[i] = nearestBoneIndex(wx, wy, wz, anchorPositions, anchorIndexMap);
      } else if (bonePositions.length > 0) {
        pinnedBone[i] = nearestBoneIndex(wx, wy, wz, bonePositions, boneIndexMap);
      }
    }
  }

  // 距離制約構築
  const stretchA: number[] = [];
  const stretchB: number[] = [];
  const stretchRestLen: number[] = [];
  const bendingA: number[] = [];
  const bendingB: number[] = [];
  const bendingRestLen: number[] = [];
  const addConstraint = (
    aArr: number[], bArr: number[], rArr: number[],
    offsets: Array<[number, number, number]>,
  ) => {
    for (let i = 0; i < N; i++) {
      const v = voxels[i];
      for (const [dx, dy, dz] of offsets) {
        const j = voxelIdx.get(`${v.x + dx},${v.y + dy},${v.z + dz}`);
        if (j !== undefined && j > i) {
          aArr.push(i); bArr.push(j);
          const rx = restX[i] - restX[j];
          const ry = restY[i] - restY[j];
          const rz = restZ[i] - restZ[j];
          rArr.push(Math.sqrt(rx * rx + ry * ry + rz * rz));
        }
      }
    }
  };
  addConstraint(stretchA, stretchB, stretchRestLen, STRETCH_OFFSETS);
  addConstraint(bendingA, bendingB, bendingRestLen, BENDING_OFFSETS);

  // 孤立した連結成分（pin 無し）→ 最上部を強制 pin
  const visited = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (visited[i]) continue;
    const comp: number[] = [];
    let hasPinned = false;
    const queue: number[] = [i];
    visited[i] = 1;
    while (queue.length) {
      const vi = queue.shift()!;
      comp.push(vi);
      if (pinnedBone[vi] >= 0) hasPinned = true;
      const v = voxels[vi];
      for (const [dx, dy, dz] of FACE_DIRS) {
        const nj = voxelIdx.get(`${v.x + dx},${v.y + dy},${v.z + dz}`);
        if (nj === undefined || visited[nj]) continue;
        visited[nj] = 1;
        queue.push(nj);
      }
    }
    if (!hasPinned) {
      let topIdx = comp[0];
      let topZ = voxels[topIdx].z;
      for (const ci of comp) {
        if (voxels[ci].z > topZ) { topZ = voxels[ci].z; topIdx = ci; }
      }
      const [wx, wy, wz] = voxelCenterWorld(voxels[topIdx], transform);
      if (anchorPositions.length > 0) {
        pinnedBone[topIdx] = nearestBoneIndex(wx, wy, wz, anchorPositions, anchorIndexMap);
      } else if (bonePositions.length > 0) {
        pinnedBone[topIdx] = nearestBoneIndex(wx, wy, wz, bonePositions, boneIndexMap);
      }
    }
  }

  // Pin されたボーンの rest world 座標を記録
  const anchorRestX = new Float32Array(N);
  const anchorRestY = new Float32Array(N);
  const anchorRestZ = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const b = pinnedBone[i];
    if (b < 0) continue;
    const p = skeleton.bones[b].getAbsolutePosition();
    anchorRestX[i] = p.x;
    anchorRestY[i] = p.y;
    anchorRestZ[i] = p.z;
  }

  // カプセル: 実在ボーン名のみ採用
  const boneByName = new Map<string, number>();
  for (let bi = 0; bi < skeleton.bones.length; bi++) {
    boneByName.set(skeleton.bones[bi].name, bi);
  }
  const capStart: number[] = [];
  const capEnd: number[] = [];
  const capRadius: number[] = [];
  for (const cap of capsules) {
    const ai = boneByName.get(cap.startBone);
    const bi = boneByName.get(cap.endBone);
    if (ai === undefined || bi === undefined) continue;
    capStart.push(ai); capEnd.push(bi); capRadius.push(cap.radius);
  }
  const capLen = capStart.length;
  const capR2 = new Float32Array(capLen);
  for (let i = 0; i < capLen; i++) capR2[i] = capRadius[i] * capRadius[i];

  return {
    voxelCount: N,
    posX, posY, posZ, prevX, prevY, prevZ, restX, restY, restZ,
    pinnedBone,
    stretchA: Int32Array.from(stretchA),
    stretchB: Int32Array.from(stretchB),
    stretchRestLen: Float32Array.from(stretchRestLen),
    bendingA: Int32Array.from(bendingA),
    bendingB: Int32Array.from(bendingB),
    bendingRestLen: Float32Array.from(bendingRestLen),
    skeleton,
    anchorRestX, anchorRestY, anchorRestZ,
    capsuleStartBone: Int32Array.from(capStart),
    capsuleEndBone: Int32Array.from(capEnd),
    capsuleRadius: Float32Array.from(capRadius),
    capSx: new Float32Array(capLen), capSy: new Float32Array(capLen), capSz: new Float32Array(capLen),
    capEx: new Float32Array(capLen), capEy: new Float32Array(capLen), capEz: new Float32Array(capLen),
    capSegLen2: new Float32Array(capLen),
    capR2,
    gravity: params.gravity,
    damping: params.damping,
    iterations: params.iterations,
    collisionEvery: params.collisionEvery,
  };
}

/**
 * PBD シミュレーションを1フレーム進める（in-place）。
 * 1. pin ノード位置更新
 * 2. 自由ノード Verlet + 重力
 * 3. bending → stretch 制約反復 + 衝突判定
 * 4. 仕上げ stretch + 衝突
 */
export function stepPbd(state: PbdState): void {
  const N = state.voxelCount;
  const {
    posX, posY, posZ, prevX, prevY, prevZ, restX, restY, restZ,
    pinnedBone, skeleton, anchorRestX, anchorRestY, anchorRestZ,
  } = state;

  // 1. pin ノード位置
  for (let i = 0; i < N; i++) {
    const b = pinnedBone[i];
    if (b < 0) continue;
    const bone = skeleton.bones[b];
    const curr = bone.getAbsolutePosition();
    const dx = curr.x - anchorRestX[i];
    const dy = curr.y - anchorRestY[i];
    const dz = curr.z - anchorRestZ[i];
    posX[i] = restX[i] + dx;
    posY[i] = restY[i] + dy;
    posZ[i] = restZ[i] + dz;
    prevX[i] = posX[i]; prevY[i] = posY[i]; prevZ[i] = posZ[i];
  }

  // 2. 自由ノード Verlet 積分
  const g = state.gravity;
  const damping = state.damping;
  for (let i = 0; i < N; i++) {
    if (pinnedBone[i] >= 0) continue;
    const vx = (posX[i] - prevX[i]) * damping;
    const vy = (posY[i] - prevY[i]) * damping;
    const vz = (posZ[i] - prevZ[i]) * damping;
    prevX[i] = posX[i]; prevY[i] = posY[i]; prevZ[i] = posZ[i];
    posX[i] += vx;
    posY[i] += vy + g;
    posZ[i] += vz;
  }

  // カプセル位置を1フレ分キャッシュ
  const capCount = state.capsuleStartBone.length;
  for (let c = 0; c < capCount; c++) {
    const aPos = skeleton.bones[state.capsuleStartBone[c]].getAbsolutePosition();
    const bPos = skeleton.bones[state.capsuleEndBone[c]].getAbsolutePosition();
    state.capSx[c] = aPos.x; state.capSy[c] = aPos.y; state.capSz[c] = aPos.z;
    state.capEx[c] = bPos.x; state.capEy[c] = bPos.y; state.capEz[c] = bPos.z;
    const dx = bPos.x - aPos.x, dy = bPos.y - aPos.y, dz = bPos.z - aPos.z;
    state.capSegLen2[c] = dx * dx + dy * dy + dz * dz;
  }

  const applyDistanceConstraints = (
    aArr: Int32Array, bArr: Int32Array, rArr: Float32Array,
  ) => {
    const cCount = aArr.length;
    for (let c = 0; c < cCount; c++) {
      const i = aArr[c];
      const j = bArr[c];
      const dx = posX[j] - posX[i];
      const dy = posY[j] - posY[i];
      const dz = posZ[j] - posZ[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-8) continue;
      const rest = rArr[c];
      const diff = (d - rest) / d;
      const iPin = pinnedBone[i] >= 0;
      const jPin = pinnedBone[j] >= 0;
      if (!iPin && !jPin) {
        const cx = dx * diff * 0.5, cy = dy * diff * 0.5, cz = dz * diff * 0.5;
        posX[i] += cx; posY[i] += cy; posZ[i] += cz;
        posX[j] -= cx; posY[j] -= cy; posZ[j] -= cz;
      } else if (iPin && !jPin) {
        const cx = dx * diff, cy = dy * diff, cz = dz * diff;
        posX[j] -= cx; posY[j] -= cy; posZ[j] -= cz;
      } else if (!iPin && jPin) {
        const cx = dx * diff, cy = dy * diff, cz = dz * diff;
        posX[i] += cx; posY[i] += cy; posZ[i] += cz;
      }
    }
  };

  const applyBodyCollision = () => {
    for (let c = 0; c < capCount; c++) {
      const sx = state.capSx[c], sy = state.capSy[c], sz = state.capSz[c];
      const ex = state.capEx[c], ey = state.capEy[c], ez = state.capEz[c];
      const dx = ex - sx, dy = ey - sy, dz = ez - sz;
      const segLen2 = state.capSegLen2[c];
      const r = state.capsuleRadius[c];
      const r2 = state.capR2[c];

      for (let i = 0; i < N; i++) {
        if (pinnedBone[i] >= 0) continue;
        const px = posX[i];
        const py = posY[i];
        const pz = posZ[i];
        const pvx = px - sx, pvy = py - sy, pvz = pz - sz;
        let t = segLen2 > 1e-12 ? (dx * pvx + dy * pvy + dz * pvz) / segLen2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const ccx = sx + t * dx;
        const ccy = sy + t * dy;
        const ccz = sz + t * dz;
        const rx = px - ccx, ry = py - ccy, rz = pz - ccz;
        const d2 = rx * rx + ry * ry + rz * rz;
        if (d2 >= r2) continue;
        if (d2 < 1e-12) {
          posX[i] = ccx + r;
        } else {
          const scale = r / Math.sqrt(d2);
          posX[i] = ccx + rx * scale;
          posY[i] = ccy + ry * scale;
          posZ[i] = ccz + rz * scale;
        }
      }
    }
  };

  const iterCount = state.iterations;
  const collideEvery = state.collisionEvery;
  for (let iter = 0; iter < iterCount; iter++) {
    applyDistanceConstraints(state.bendingA, state.bendingB, state.bendingRestLen);
    applyDistanceConstraints(state.stretchA, state.stretchB, state.stretchRestLen);
    if (capCount > 0 && (iter + 1) % collideEvery === 0) applyBodyCollision();
  }
  // 仕上げ: stretch + 衝突を2回
  for (let iter = 0; iter < 2; iter++) {
    applyDistanceConstraints(state.stretchA, state.stretchB, state.stretchRestLen);
    if (capCount > 0) applyBodyCollision();
  }
}
