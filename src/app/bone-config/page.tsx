'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, Color4, Mesh, VertexData, ShaderMaterial, Effect,
  MeshBuilder, StandardMaterial, Color3, Plane, PointerEventTypes,
  TransformNode, Quaternion,
} from '@babylonjs/core';
import { loadVoxFile, SCALE, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { VoxelEntry } from '@/lib/vox-parser';
import { MODEL_REGISTRY, DEFAULT_MODEL_ID } from '@/lib/model-registry';
import type { ModelEntry } from '@/lib/model-registry';

// ========================================================================
// Key Markers
// ========================================================================
interface MarkerDef {
  name: string;
  label: string;
  color: string;
  side: 'center' | 'left' | 'right'; // center=単体, left/right=対
  mirrorOf?: string; // right側のみ: 対応するleft側のname
}

const MARKER_DEFS: MarkerDef[] = [
  { name: 'Chin',        label: 'Chin (顎)',          color: '#ffee44', side: 'center' },
  { name: 'Groin',       label: 'Groin (股間)',        color: '#ff4444', side: 'center' },
  { name: 'LeftWrist',   label: 'L.Wrist (左手首)',    color: '#4444ff', side: 'left' },
  { name: 'LeftElbow',   label: 'L.Elbow (左肘)',      color: '#4488ff', side: 'left' },
  { name: 'LeftKnee',    label: 'L.Knee (左膝)',       color: '#44ff66', side: 'left' },
  { name: 'RightWrist',  label: 'R.Wrist (右手首)',    color: '#ff4466', side: 'right', mirrorOf: 'LeftWrist' },
  { name: 'RightElbow',  label: 'R.Elbow (右肘)',      color: '#ff4488', side: 'right', mirrorOf: 'LeftElbow' },
  { name: 'RightKnee',   label: 'R.Knee (右膝)',       color: '#88ff44', side: 'right', mirrorOf: 'LeftKnee' },
];

interface Vec3 { x: number; y: number; z: number; }
type MarkerData = Record<string, Vec3>;

// ========================================================================
// Bone definitions (all 41 Mixamo standard bones)
// ========================================================================
interface BoneDef {
  name: string;
  label: string;
  parent: string | null;
  color: string;
}

const BONE_DEFS: BoneDef[] = [
  // Center chain
  { name: 'Hips',           label: 'Hips',           parent: null,             color: '#ff4444' },
  { name: 'Spine',          label: 'Spine',          parent: 'Hips',           color: '#ff6644' },
  { name: 'Spine1',         label: 'Spine1',         parent: 'Spine',          color: '#ff8844' },
  { name: 'Spine2',         label: 'Spine2',         parent: 'Spine1',         color: '#ffaa44' },
  { name: 'Neck',           label: 'Neck',           parent: 'Spine2',         color: '#ffcc44' },
  { name: 'Head',           label: 'Head',           parent: 'Neck',           color: '#ffee44' },
  // HeadTop_End removed — leaf bone not needed for motion, voxels assigned to Head instead
  // Left arm chain
  { name: 'LeftShoulder',   label: 'L.Shoulder',     parent: 'Spine2',         color: '#44aaff' },
  { name: 'LeftArm',        label: 'L.Arm',          parent: 'LeftShoulder',   color: '#4488ff' },
  { name: 'LeftForeArm',    label: 'L.ForeArm',      parent: 'LeftArm',        color: '#4466ff' },
  { name: 'LeftHand',       label: 'L.Hand',         parent: 'LeftForeArm',    color: '#4444ff' },
  // Left hand fingers
  { name: 'LeftHandThumb1', label: 'L.Thumb1',       parent: 'LeftHand',       color: '#5555ff' },
  { name: 'LeftHandThumb2', label: 'L.Thumb2',       parent: 'LeftHandThumb1', color: '#5555ee' },
  { name: 'LeftHandThumb3', label: 'L.Thumb3',       parent: 'LeftHandThumb2', color: '#5555dd' },
  { name: 'LeftHandThumb4', label: 'L.Thumb4',       parent: 'LeftHandThumb3', color: '#5555cc' },
  { name: 'LeftHandIndex1', label: 'L.Index1',       parent: 'LeftHand',       color: '#6666ff' },
  { name: 'LeftHandIndex2', label: 'L.Index2',       parent: 'LeftHandIndex1', color: '#6666ee' },
  { name: 'LeftHandIndex3', label: 'L.Index3',       parent: 'LeftHandIndex2', color: '#6666dd' },
  { name: 'LeftHandIndex4', label: 'L.Index4',       parent: 'LeftHandIndex3', color: '#6666cc' },
  // Right arm chain
  { name: 'RightShoulder',  label: 'R.Shoulder',     parent: 'Spine2',         color: '#ff44aa' },
  { name: 'RightArm',       label: 'R.Arm',          parent: 'RightShoulder',  color: '#ff4488' },
  { name: 'RightForeArm',   label: 'R.ForeArm',      parent: 'RightArm',       color: '#ff4466' },
  { name: 'RightHand',      label: 'R.Hand',         parent: 'RightForeArm',   color: '#ff4444' },
  // Right hand fingers
  { name: 'RightHandThumb1',label: 'R.Thumb1',       parent: 'RightHand',      color: '#ff5555' },
  { name: 'RightHandThumb2',label: 'R.Thumb2',       parent: 'RightHandThumb1',color: '#ee5555' },
  { name: 'RightHandThumb3',label: 'R.Thumb3',       parent: 'RightHandThumb2',color: '#dd5555' },
  { name: 'RightHandThumb4',label: 'R.Thumb4',       parent: 'RightHandThumb3',color: '#cc5555' },
  { name: 'RightHandIndex1',label: 'R.Index1',       parent: 'RightHand',      color: '#ff6666' },
  { name: 'RightHandIndex2',label: 'R.Index2',       parent: 'RightHandIndex1',color: '#ee6666' },
  { name: 'RightHandIndex3',label: 'R.Index3',       parent: 'RightHandIndex2',color: '#dd6666' },
  { name: 'RightHandIndex4',label: 'R.Index4',       parent: 'RightHandIndex3',color: '#cc6666' },
  // Left leg chain
  { name: 'LeftUpLeg',      label: 'L.UpLeg',        parent: 'Hips',           color: '#44ff88' },
  { name: 'LeftLeg',        label: 'L.Leg',          parent: 'LeftUpLeg',      color: '#44ff66' },
  { name: 'LeftFoot',       label: 'L.Foot',         parent: 'LeftLeg',        color: '#44ff44' },
  { name: 'LeftToeBase',    label: 'L.ToeBase',      parent: 'LeftFoot',       color: '#44ee44' },
  { name: 'LeftToe_End',    label: 'L.ToeEnd',       parent: 'LeftToeBase',    color: '#44dd44' },
  // Right leg chain
  { name: 'RightUpLeg',     label: 'R.UpLeg',        parent: 'Hips',           color: '#aaff44' },
  { name: 'RightLeg',       label: 'R.Leg',          parent: 'RightUpLeg',     color: '#88ff44' },
  { name: 'RightFoot',      label: 'R.Foot',         parent: 'RightLeg',       color: '#66ff44' },
  { name: 'RightToeBase',   label: 'R.ToeBase',      parent: 'RightFoot',      color: '#55ee44' },
  { name: 'RightToe_End',   label: 'R.ToeEnd',       parent: 'RightToeBase',   color: '#55dd44' },
];

// ========================================================================
// Fixed camera views
// ========================================================================
type ViewDirection = 'front' | 'right' | 'back' | 'left';

interface ViewDef {
  key: ViewDirection;
  label: string;
  alpha: number;
  dragAxes: ('x' | 'y' | 'z')[];
  axisLabels: string;
}

const VIEW_DEFS: ViewDef[] = [
  { key: 'front', label: '正面',  alpha: Math.PI / 2,     dragAxes: ['x', 'z'], axisLabels: 'X(左右) + Z(高さ)' },
  { key: 'right', label: '右',    alpha: 0,               dragAxes: ['y', 'z'], axisLabels: 'Y(前後) + Z(高さ)' },
  { key: 'back',  label: '背面',  alpha: Math.PI * 3 / 2, dragAxes: ['x', 'z'], axisLabels: 'X(左右) + Z(高さ)' },
  { key: 'left',  label: '左',    alpha: Math.PI,         dragAxes: ['y', 'z'], axisLabels: 'Y(前後) + Z(高さ)' },
];

// ========================================================================
// Auto-calculation: markers → all 41 bones
// ========================================================================
function calculateAllBones(
  markers: MarkerData, bodyMaxZ: number,
): Record<string, Vec3> {
  const chin = markers['Chin'];
  const groin = markers['Groin'];
  const lWrist = markers['LeftWrist'];
  const lElbow = markers['LeftElbow'];
  const lKnee = markers['LeftKnee'];
  const rWrist = markers['RightWrist'];
  const rElbow = markers['RightElbow'];
  const rKnee = markers['RightKnee'];

  const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });

  // Center chain
  const hips: Vec3 = { x: groin.x, y: groin.y, z: groin.z };
  const neck: Vec3 = { x: chin.x, y: chin.y, z: chin.z - 4 };
  const head: Vec3 = { x: chin.x, y: chin.y, z: Math.min(chin.z + 8, bodyMaxZ) };


  const spine  = lerp3(hips, neck, 0.25);
  const spine1 = lerp3(hips, neck, 0.50);
  const spine2 = lerp3(hips, neck, 0.75);

  // Left arm
  const lShoulderOffset = (lElbow.x - spine2.x) * 0.35;
  const lShoulder: Vec3 = { x: spine2.x + lShoulderOffset, y: spine2.y, z: spine2.z + 2 };
  const lArm = lerp3(lShoulder, lElbow, 0.3);
  const lForeArm: Vec3 = { ...lElbow };
  const lHand: Vec3 = { ...lWrist };

  // Left hand fingers (small offsets from hand position)
  const lFingerDir = { x: lHand.x - lForeArm.x, y: lHand.y - lForeArm.y, z: lHand.z - lForeArm.z };
  const lFingerLen = Math.sqrt(lFingerDir.x * lFingerDir.x + lFingerDir.y * lFingerDir.y + lFingerDir.z * lFingerDir.z) || 1;
  const lFD = { x: lFingerDir.x / lFingerLen, y: lFingerDir.y / lFingerLen, z: lFingerDir.z / lFingerLen };
  const lThumb1: Vec3 = { x: lHand.x + lFD.x * 1, y: lHand.y + lFD.y * 1, z: lHand.z + lFD.z * 1 };
  const lThumb2: Vec3 = { x: lThumb1.x + lFD.x * 0.8, y: lThumb1.y + lFD.y * 0.8, z: lThumb1.z + lFD.z * 0.8 };
  const lThumb3: Vec3 = { x: lThumb2.x + lFD.x * 0.7, y: lThumb2.y + lFD.y * 0.7, z: lThumb2.z + lFD.z * 0.7 };
  const lThumb4: Vec3 = { x: lThumb3.x + lFD.x * 0.5, y: lThumb3.y + lFD.y * 0.5, z: lThumb3.z + lFD.z * 0.5 };
  const lIndex1: Vec3 = { x: lHand.x + lFD.x * 1.5, y: lHand.y + lFD.y * 1.5, z: lHand.z + lFD.z * 1.5 };
  const lIndex2: Vec3 = { x: lIndex1.x + lFD.x * 1, y: lIndex1.y + lFD.y * 1, z: lIndex1.z + lFD.z * 1 };
  const lIndex3: Vec3 = { x: lIndex2.x + lFD.x * 0.8, y: lIndex2.y + lFD.y * 0.8, z: lIndex2.z + lFD.z * 0.8 };
  const lIndex4: Vec3 = { x: lIndex3.x + lFD.x * 0.7, y: lIndex3.y + lFD.y * 0.7, z: lIndex3.z + lFD.z * 0.7 };

  // Right arm (independent)
  const rShoulderOffset = (rElbow.x - spine2.x) * 0.35;
  const rShoulder: Vec3 = { x: spine2.x + rShoulderOffset, y: spine2.y, z: spine2.z + 2 };
  const rArm = lerp3(rShoulder, rElbow, 0.3);
  const rForeArm: Vec3 = { ...rElbow };
  const rHand: Vec3 = { ...rWrist };

  // Right hand fingers
  const rFingerDir = { x: rHand.x - rForeArm.x, y: rHand.y - rForeArm.y, z: rHand.z - rForeArm.z };
  const rFingerLen = Math.sqrt(rFingerDir.x * rFingerDir.x + rFingerDir.y * rFingerDir.y + rFingerDir.z * rFingerDir.z) || 1;
  const rFD = { x: rFingerDir.x / rFingerLen, y: rFingerDir.y / rFingerLen, z: rFingerDir.z / rFingerLen };
  const rThumb1: Vec3 = { x: rHand.x + rFD.x * 1, y: rHand.y + rFD.y * 1, z: rHand.z + rFD.z * 1 };
  const rThumb2: Vec3 = { x: rThumb1.x + rFD.x * 0.8, y: rThumb1.y + rFD.y * 0.8, z: rThumb1.z + rFD.z * 0.8 };
  const rThumb3: Vec3 = { x: rThumb2.x + rFD.x * 0.7, y: rThumb2.y + rFD.y * 0.7, z: rThumb2.z + rFD.z * 0.7 };
  const rThumb4: Vec3 = { x: rThumb3.x + rFD.x * 0.5, y: rThumb3.y + rFD.y * 0.5, z: rThumb3.z + rFD.z * 0.5 };
  const rIndex1: Vec3 = { x: rHand.x + rFD.x * 1.5, y: rHand.y + rFD.y * 1.5, z: rHand.z + rFD.z * 1.5 };
  const rIndex2: Vec3 = { x: rIndex1.x + rFD.x * 1, y: rIndex1.y + rFD.y * 1, z: rIndex1.z + rFD.z * 1 };
  const rIndex3: Vec3 = { x: rIndex2.x + rFD.x * 0.8, y: rIndex2.y + rFD.y * 0.8, z: rIndex2.z + rFD.z * 0.8 };
  const rIndex4: Vec3 = { x: rIndex3.x + rFD.x * 0.7, y: rIndex3.y + rFD.y * 0.7, z: rIndex3.z + rFD.z * 0.7 };

  // Left leg
  const lLegOffsetX = (lKnee.x - groin.x) * 0.8;
  const lUpLeg: Vec3 = { x: groin.x + lLegOffsetX, y: groin.y, z: groin.z };
  const lLeg: Vec3 = { ...lKnee };
  const lFoot: Vec3 = { x: lKnee.x, y: Math.max(lKnee.y - 4, 0), z: 2 };
  const lToeBase: Vec3 = { x: lFoot.x, y: Math.max(lFoot.y - 3, 0), z: 1 };
  const lToeEnd: Vec3 = { x: lToeBase.x, y: Math.max(lToeBase.y - 2, 0), z: 0 };

  // Right leg (independent)
  const rLegOffsetX = (rKnee.x - groin.x) * 0.8;
  const rUpLeg: Vec3 = { x: groin.x + rLegOffsetX, y: groin.y, z: groin.z };
  const rLeg: Vec3 = { ...rKnee };
  const rFoot: Vec3 = { x: rKnee.x, y: Math.max(rKnee.y - 4, 0), z: 2 };
  const rToeBase: Vec3 = { x: rFoot.x, y: Math.max(rFoot.y - 3, 0), z: 1 };
  const rToeEnd: Vec3 = { x: rToeBase.x, y: Math.max(rToeBase.y - 2, 0), z: 0 };

  return {
    Hips: hips, Spine: spine, Spine1: spine1, Spine2: spine2,
    Neck: neck, Head: head,
    LeftShoulder: lShoulder, LeftArm: lArm, LeftForeArm: lForeArm, LeftHand: lHand,
    LeftHandThumb1: lThumb1, LeftHandThumb2: lThumb2, LeftHandThumb3: lThumb3, LeftHandThumb4: lThumb4,
    LeftHandIndex1: lIndex1, LeftHandIndex2: lIndex2, LeftHandIndex3: lIndex3, LeftHandIndex4: lIndex4,
    RightShoulder: rShoulder, RightArm: rArm, RightForeArm: rForeArm, RightHand: rHand,
    RightHandThumb1: rThumb1, RightHandThumb2: rThumb2, RightHandThumb3: rThumb3, RightHandThumb4: rThumb4,
    RightHandIndex1: rIndex1, RightHandIndex2: rIndex2, RightHandIndex3: rIndex3, RightHandIndex4: rIndex4,
    LeftUpLeg: lUpLeg, LeftLeg: lLeg, LeftFoot: lFoot, LeftToeBase: lToeBase, LeftToe_End: lToeEnd,
    RightUpLeg: rUpLeg, RightLeg: rLeg, RightFoot: rFoot, RightToeBase: rToeBase, RightToe_End: rToeEnd,
  };
}

// Mirror a left-side marker using Chin/Groin center
function mirrorMarker(leftPos: Vec3, mirrorCenterX: number): Vec3 {
  return { x: mirrorCenterX + (mirrorCenterX - leftPos.x), y: leftPos.y, z: leftPos.z };
}

function getDefaultMarkers(centerX: number): MarkerData {
  const left: MarkerData = {
    Chin:       { x: 42.5, y: 13, z: 82 },
    Groin:      { x: 41, y: 13, z: 47.5 },
    LeftWrist:  { x: 9, y: 13, z: 63.5 },
    LeftElbow:  { x: 23, y: 13, z: 70 },
    LeftKnee:   { x: 32.5, y: 15.5, z: 27.5 },
  };
  // Default right = mirrored from left
  left['RightWrist'] = mirrorMarker(left['LeftWrist'], centerX);
  left['RightElbow'] = mirrorMarker(left['LeftElbow'], centerX);
  left['RightKnee']  = mirrorMarker(left['LeftKnee'], centerX);
  return left;
}

// ========================================================================
// Helpers
// ========================================================================
function createUnlitMaterial(scene: Scene, name: string): ShaderMaterial {
  Effect.ShadersStore[name + 'VertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec4 color;
    uniform mat4 worldViewProjection;
    varying vec4 vColor;
    void main() { gl_Position = worldViewProjection * vec4(position, 1.0); vColor = color; }
  `;
  Effect.ShadersStore[name + 'FragmentShader'] = `
    precision highp float;
    varying vec4 vColor;
    void main() { gl_FragColor = vColor; }
  `;
  const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, {
    attributes: ['position', 'color'], uniforms: ['worldViewProjection'],
    needAlphaBlending: false,
  });
  mat.backFaceCulling = false;
  mat.forceDepthWrite = true;
  return mat;
}

function buildBodyMesh(voxels: VoxelEntry[], scene: Scene, cx: number, cy: number, alpha: number): Mesh {
  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const voxel of voxels) {
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      const bi = positions.length / 3;
      const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        positions.push(
          (voxel.x + fv[vi][0] - cx) * SCALE,
          (voxel.z + fv[vi][2]) * SCALE,
          -(voxel.y + fv[vi][1] - cy) * SCALE,
        );
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(voxel.r * 0.6, voxel.g * 0.6, voxel.b * 0.6, alpha);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh('body', scene);
  vd.applyToMesh(mesh);
  mesh.material = createUnlitMaterial(scene, 'body_unlit');
  mesh.isPickable = false;
  return mesh;
}

function voxelToViewer(vx: number, vy: number, vz: number, cx: number, cy: number): Vector3 {
  return new Vector3((vx - cx) * SCALE, vz * SCALE, -(vy - cy) * SCALE);
}

function viewerToVoxel(viewerPos: Vector3, cx: number, cy: number): Vec3 {
  return {
    x: viewerPos.x / SCALE + cx,
    y: -(viewerPos.z / SCALE) + cy,
    z: viewerPos.y / SCALE,
  };
}

function r1(n: number): number { return Math.round(n * 10) / 10; }

// ========================================================================
// Preview: 20-bone hierarchical skeletal animation
// ========================================================================

// Assign each voxel to nearest bone (in voxel space)
// Distance from point P to line segment AB (squared)
function distToSegmentSq(px: number, py: number, pz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 0.0001) {
    // Degenerate segment (same point) — use point distance
    return apx * apx + apy * apy + apz * apz;
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / lenSq));
  const cx = ax + abx * t - px, cy = ay + aby * t - py, cz = az + abz * t - pz;
  return cx * cx + cy * cy + cz * cz;
}

function assignVoxelsToBones(
  voxels: VoxelEntry[],
  bones: Record<string, Vec3>,
): Record<string, VoxelEntry[]> {
  const boneNames = Object.keys(bones);
  const result: Record<string, VoxelEntry[]> = {};
  for (const name of boneNames) result[name] = [];

  // Build bone segments: each bone owns the segment from ITSELF to its CHILDREN.
  // When a bone rotates, the body part from this joint toward the child joint moves.
  // e.g. LeftForeArm (elbow) owns the forearm = elbow→wrist (LeftForeArm→LeftHand)
  //      LeftArm owns the upper arm = LeftArm→LeftForeArm
  // Leaf bones (no children) use point distance.

  // Build children map
  const childrenMap = new Map<string, string[]>();
  for (const name of boneNames) childrenMap.set(name, []);
  for (const def of BONE_DEFS) {
    if (boneNames.includes(def.name) && def.parent && boneNames.includes(def.parent)) {
      childrenMap.get(def.parent)!.push(def.name);
    }
  }

  // Build segments: bone → each child (one segment per parent-child pair, owned by parent)
  type Segment = { name: string; ax: number; ay: number; az: number; bx: number; by: number; bz: number };
  const segments: Segment[] = [];
  for (const name of boneNames) {
    const b = bones[name];
    const children = childrenMap.get(name) ?? [];
    if (children.length > 0) {
      for (const childName of children) {
        const c = bones[childName];
        segments.push({ name, ax: b.x, ay: b.y, az: b.z, bx: c.x, by: c.y, bz: c.z });
      }
    } else {
      // Leaf bone — use point (degenerate segment)
      segments.push({ name, ax: b.x, ay: b.y, az: b.z, bx: b.x, by: b.y, bz: b.z });
    }
  }

  for (const v of voxels) {
    let bestBone = segments[0].name;
    let bestDist = Infinity;
    for (const seg of segments) {
      const dist = distToSegmentSq(v.x, v.y, v.z, seg.ax, seg.ay, seg.az, seg.bx, seg.by, seg.bz);
      if (dist < bestDist) {
        bestDist = dist;
        bestBone = seg.name;
      }
    }
    result[bestBone].push(v);
  }

  // Connectivity check: for each bone, keep only voxels connected to the
  // largest cluster. Disconnected voxels are reassigned to the nearest
  // face-adjacent bone that they connect to.
  const globalMap = new Map<string, string>(); // position → boneName
  for (const [boneName, bvs] of Object.entries(result)) {
    for (const v of bvs) globalMap.set(`${v.x},${v.y},${v.z}`, boneName);
  }

  for (const boneName of boneNames) {
    const bvs = result[boneName];
    if (bvs.length === 0) continue;

    // Build set for this bone
    const posSet = new Set<string>();
    const posMap = new Map<string, VoxelEntry>();
    for (const v of bvs) {
      const k = `${v.x},${v.y},${v.z}`;
      posSet.add(k);
      posMap.set(k, v);
    }

    // Find connected components via flood fill
    const visited = new Set<string>();
    const components: VoxelEntry[][] = [];

    for (const v of bvs) {
      const k = `${v.x},${v.y},${v.z}`;
      if (visited.has(k)) continue;
      const component: VoxelEntry[] = [];
      const queue = [k];
      visited.add(k);
      while (queue.length > 0) {
        const ck = queue.pop()!;
        component.push(posMap.get(ck)!);
        const cv = posMap.get(ck)!;
        for (const [dx, dy, dz] of FACE_DIRS) {
          const nk = `${cv.x + dx},${cv.y + dy},${cv.z + dz}`;
          if (posSet.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(nk);
          }
        }
      }
      components.push(component);
    }

    if (components.length <= 1) continue;

    // Keep largest component, reassign others
    components.sort((a, b) => b.length - a.length);
    const keep = components[0];
    result[boneName] = keep;

    // Reassign disconnected voxels to nearest adjacent bone
    for (let ci = 1; ci < components.length; ci++) {
      for (const v of components[ci]) {
        // Find nearest adjacent bone via face neighbors
        let reassignTo: string | null = null;
        let reassignDist = Infinity;
        for (const [dx, dy, dz] of FACE_DIRS) {
          const nk = `${v.x + dx},${v.y + dy},${v.z + dz}`;
          const nb = globalMap.get(nk);
          if (nb && nb !== boneName) {
            // Use segment distance to decide which bone
            for (const seg of segments) {
              if (seg.name !== nb) continue;
              const d = distToSegmentSq(v.x, v.y, v.z, seg.ax, seg.ay, seg.az, seg.bx, seg.by, seg.bz);
              if (d < reassignDist) { reassignDist = d; reassignTo = nb; }
            }
          }
        }
        if (!reassignTo) {
          // No adjacent bone found, use nearest segment
          let bestDist = Infinity;
          for (const seg of segments) {
            if (seg.name === boneName) continue;
            const d = distToSegmentSq(v.x, v.y, v.z, seg.ax, seg.ay, seg.az, seg.bx, seg.by, seg.bz);
            if (d < bestDist) { bestDist = d; reassignTo = seg.name; }
          }
        }
        if (reassignTo) {
          result[reassignTo].push(v);
          globalMap.set(`${v.x},${v.y},${v.z}`, reassignTo);
        }
      }
    }
  }

  return result;
}

// Seal bone partition cross-sections with sphere caps.
// At each boundary, place a sphere at the midpoint. The sphere is split
// into hemispheres: each bone gets the hemisphere on the OTHER side
// (extending into the other bone's territory). Overlapping voxels from
// the original bone at those positions are removed.
function addSphereCaps(
  boneVoxels: Record<string, VoxelEntry[]>,
): void {
  // Build per-bone lookup: position → VoxelEntry
  const boneMaps = new Map<string, Map<string, VoxelEntry>>();
  for (const [boneName, voxels] of Object.entries(boneVoxels)) {
    const m = new Map<string, VoxelEntry>();
    for (const v of voxels) m.set(`${v.x},${v.y},${v.z}`, v);
    boneMaps.set(boneName, m);
  }

  const processedPairs = new Set<string>();

  // Collect all modifications to apply after iteration
  const toAdd = new Map<string, VoxelEntry[]>();
  for (const name of Object.keys(boneVoxels)) {
    toAdd.set(name, []);
  }

  for (const [boneName] of Object.entries(boneVoxels)) {
    const thisMap = boneMaps.get(boneName)!;

    // Find boundary voxels grouped by adjacent bone
    const adjBoundary = new Map<string, Map<string, VoxelEntry>>();
    for (const [k, v] of thisMap) {
      for (const [dx, dy, dz] of FACE_DIRS) {
        const nk = `${v.x + dx},${v.y + dy},${v.z + dz}`;
        if (thisMap.has(nk)) continue;
        for (const [otherName, otherMap] of boneMaps) {
          if (otherName !== boneName && otherMap.has(nk)) {
            if (!adjBoundary.has(otherName)) adjBoundary.set(otherName, new Map());
            adjBoundary.get(otherName)!.set(k, v);
            break;
          }
        }
      }
    }

    for (const [otherName, thisBnd] of adjBoundary) {
      const pairKey = [boneName, otherName].sort().join('|');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const otherMap = boneMaps.get(otherName)!;

      // Other side's boundary
      const otherBnd = new Map<string, VoxelEntry>();
      for (const [, v] of otherMap) {
        for (const [dx, dy, dz] of FACE_DIRS) {
          const nk = `${v.x + dx},${v.y + dy},${v.z + dz}`;
          if (thisMap.has(nk)) { otherBnd.set(`${v.x},${v.y},${v.z}`, v); break; }
        }
      }

      // Centers of each side's boundary
      let tx = 0, ty = 0, tz = 0;
      for (const v of thisBnd.values()) { tx += v.x; ty += v.y; tz += v.z; }
      tx /= thisBnd.size; ty /= thisBnd.size; tz /= thisBnd.size;

      let ox = 0, oy = 0, oz = 0;
      for (const v of otherBnd.values()) { ox += v.x; oy += v.y; oz += v.z; }
      ox /= otherBnd.size; oy /= otherBnd.size; oz /= otherBnd.size;

      // Midpoint and normal
      const mx = (tx + ox) / 2, my = (ty + oy) / 2, mz = (tz + oz) / 2;
      const ndx = ox - tx, ndy = oy - ty, ndz = oz - tz;
      const nLen = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz) || 1;
      const nnx = ndx / nLen, nny = ndy / nLen, nnz = ndz / nLen;

      // Radius: max distance from midpoint to any boundary voxel (= actual cross-section size)
      let maxDistSq = 0;
      for (const v of thisBnd.values()) {
        const dsq = (v.x - mx) ** 2 + (v.y - my) ** 2 + (v.z - mz) ** 2;
        if (dsq > maxDistSq) maxDistSq = dsq;
      }
      for (const v of otherBnd.values()) {
        const dsq = (v.x - mx) ** 2 + (v.y - my) ** 2 + (v.z - mz) ** 2;
        if (dsq > maxDistSq) maxDistSq = dsq;
      }
      const radius = Math.max(1, Math.sqrt(maxDistSq) / 2);
      const radiusSq = radius * radius;
      const ri = Math.ceil(radius);

      // All boundary voxels for color lookup
      const allBnd = [...thisBnd.values(), ...otherBnd.values()];

      for (let sx = -ri; sx <= ri; sx++) {
        for (let sy = -ri; sy <= ri; sy++) {
          for (let sz = -ri; sz <= ri; sz++) {
            const vx = Math.round(mx) + sx;
            const vy = Math.round(my) + sy;
            const vz = Math.round(mz) + sz;
            if ((vx - mx) ** 2 + (vy - my) ** 2 + (vz - mz) ** 2 > radiusSq) continue;

            const k = `${vx},${vy},${vz}`;

            // Color from nearest boundary voxel
            let nearestDist = Infinity;
            let nearestColor = { r: 0.5, g: 0.5, b: 0.5 };
            for (const bv of allBnd) {
              const d = (vx - bv.x) ** 2 + (vy - bv.y) ** 2 + (vz - bv.z) ** 2;
              if (d < nearestDist) { nearestDist = d; nearestColor = { r: bv.r, g: bv.g, b: bv.b }; }
            }
            const entry: VoxelEntry = { x: vx, y: vy, z: vz, r: nearestColor.r, g: nearestColor.g, b: nearestColor.b };

            // Split: each bone gets the hemisphere extending INTO the other's territory.
            // depthProj > 0 = toward otherBone → assign to thisBone (cap for thisBone)
            // depthProj <= 0 = toward thisBone → assign to otherBone (cap for otherBone)
            const depthProj = (vx - mx) * nnx + (vy - my) * nny + (vz - mz) * nnz;

            if (depthProj > 0) {
              // This position is in otherBone's territory → add to thisBone as cap
              if (!thisMap.has(k)) toAdd.get(boneName)!.push(entry);
            } else {
              // This position is in thisBone's territory → add to otherBone as cap
              if (!otherMap.has(k)) toAdd.get(otherName)!.push(entry);
            }
          }
        }
      }
    }
  }

  // Apply modifications
  for (const [boneName, addVoxels] of toAdd) {
    if (addVoxels.length > 0) boneVoxels[boneName].push(...addVoxels);
  }
}

// Build mesh with vertices in bone-local space (offset baked into vertex data)
function buildBoneMeshLocal(
  voxels: VoxelEntry[], scene: Scene, name: string,
  cx: number, cy: number, bonePos: Vec3,
): Mesh {
  const boneViewX = (bonePos.x - cx) * SCALE;
  const boneViewY = bonePos.z * SCALE;
  const boneViewZ = -(bonePos.y - cy) * SCALE;

  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const voxel of voxels) {
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      const bi = positions.length / 3;
      const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        // Vertex position relative to bone (bone-local space)
        positions.push(
          (voxel.x + fv[vi][0] - cx) * SCALE - boneViewX,
          (voxel.z + fv[vi][2]) * SCALE - boneViewY,
          -(voxel.y + fv[vi][1] - cy) * SCALE - boneViewZ,
        );
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(voxel.r, voxel.g, voxel.b, 1);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.material = createUnlitMaterial(scene, name + '_unlit');
  return mesh;
}

// Build HIERARCHICAL TransformNode tree with bone-local vertex data.
// Each node is positioned relative to its parent bone.
// Animation converts world-space deltas → local deltas via parent inverse.
function buildSkeletalPreview(
  voxels: VoxelEntry[], bones: Record<string, Vec3>,
  scene: Scene, cx: number, cy: number,
): { nodes: Map<string, TransformNode>; meshes: Map<string, Mesh> } {
  const boneVoxels = assignVoxelsToBones(voxels, bones);
  addSphereCaps(boneVoxels);

  const nodes = new Map<string, TransformNode>();
  const meshes = new Map<string, Mesh>();

  // Create all nodes
  for (const boneDef of BONE_DEFS) {
    const bonePos = bones[boneDef.name];
    if (!bonePos) continue;
    const node = new TransformNode(`bone_${boneDef.name}`, scene);
    nodes.set(boneDef.name, node);
  }

  // Set up hierarchy and relative positions
  for (const boneDef of BONE_DEFS) {
    const node = nodes.get(boneDef.name);
    const bonePos = bones[boneDef.name];
    if (!node || !bonePos) continue;

    const viewPos = voxelToViewer(bonePos.x, bonePos.y, bonePos.z, cx, cy);

    if (boneDef.parent) {
      const parentNode = nodes.get(boneDef.parent);
      const parentPos = bones[boneDef.parent];
      if (parentNode && parentPos) {
        node.parent = parentNode;
        const parentViewPos = voxelToViewer(parentPos.x, parentPos.y, parentPos.z, cx, cy);
        node.position = viewPos.subtract(parentViewPos);
      } else {
        node.position = viewPos;
      }
    } else {
      node.position = viewPos;
    }
  }

  // Create meshes with bone-local vertices
  for (const boneDef of BONE_DEFS) {
    const bv = boneVoxels[boneDef.name];
    const node = nodes.get(boneDef.name);
    const bonePos = bones[boneDef.name];
    if (!bv || bv.length === 0 || !node || !bonePos) continue;

    const mesh = buildBoneMeshLocal(bv, scene, `preview_${boneDef.name}`, cx, cy, bonePos);
    mesh.parent = node;
    mesh.isPickable = false;
    meshes.set(boneDef.name, mesh);
  }

  return { nodes, meshes };
}

// ========================================================================
// FBX Motion data (loaded from .motion.json converted by scripts/convert-fbx-motion.mjs)
// Per-bone WORLD-SPACE delta quaternion + delta position from rest pose
// ========================================================================
interface BoneFrameData {
  dq: [number, number, number, number]; // delta quaternion xyzw (world space, Three.js coords)
  dp?: [number, number, number];        // delta position xyz (world space, Three.js coords)
}

interface MotionClip {
  name: string;
  label: string;
  duration: number;
  fps: number;
  frameCount: number;
  fbxBodyHeight: number;    // FBX Hips→Head distance for scaling
  outputBones: string[];
  bindWorldPositions?: Record<string, [number, number, number]>; // FBX bind-pose world positions (Three.js coords)
  frames: Record<string, BoneFrameData>[];
}

// Available motion files under /models/character-motion/
const MOTION_FILES: { name: string; label: string; file: string }[] = [
  { name: 'hip_hop', label: 'Hip Hop Dancing', file: '/models/character-motion/Hip Hop Dancing.motion.json' },
  { name: 'belly_dance', label: 'Belly Dance', file: '/models/character-motion/Belly Dance.motion.json' },
  { name: 'jump', label: 'Jump', file: '/models/character-motion/Jump.motion.json' },
  { name: 'martelo', label: 'Martelo 3', file: '/models/character-motion/Martelo 3.motion.json' },
  { name: 'mma_kick', label: 'MMA Kick', file: '/models/character-motion/Mma Kick.motion.json' },
  { name: 'roundhouse', label: 'Roundhouse Kick', file: '/models/character-motion/Roundhouse Kick.motion.json' },
  { name: 'snake_hip_hop', label: 'Snake Hip Hop', file: '/models/character-motion/Snake Hip Hop Dance.motion.json' },
];

interface EquipPart { key: string; file: string; default_on: boolean; voxels: number; }

type PageMode = 'edit' | 'preview';

// Quaternion conversion from Three.js to viewer coordinate system.
// Axis mapping: viewer = (-Three_x, Three_y, Three_z) = X-reflection
// This is a reflection (det=-1) for right→left handedness change.
// q_viewer = (x, -y, -z, w) from q_three = (x, y, z, w)
type QuatConversion = 'correct' | 'conv1' | 'conv2' | 'identity';
const QUAT_CONVERSIONS: { key: QuatConversion; label: string; desc: string }[] = [
  { key: 'correct',  label: '(x,-y,-z,w)',  desc: 'X-reflect (correct)' },
  { key: 'conv1',    label: '(-x,-y,z,w)',   desc: 'Z-flip only (old)' },
  { key: 'conv2',    label: '(x,y,-z,w)',    desc: 'Negate Z only' },
  { key: 'identity', label: '(x,y,z,w)',     desc: 'No conversion' },
];

// ========================================================================
// Component
// ========================================================================
export default function BoneConfigPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const bodyMeshRef = useRef<Mesh | null>(null);
  const jointSpheresRef = useRef<Map<string, Mesh>>(new Map());
  const markerSpheresRef = useRef<Map<string, Mesh>>(new Map());
  const boneLineMeshesRef = useRef<Mesh[]>([]);
  const centerLineMeshRef = useRef<Mesh | null>(null);
  const centerRef = useRef({ cx: 0, cy: 0, maxZ: 103 });
  const draggingRef = useRef<{ markerName: string; plane: Plane; offset: Vector3 } | null>(null);
  const viewRef = useRef<ViewDirection>('front');
  const autoMirrorRef = useRef(true);
  const previewNodesRef = useRef<Map<string, TransformNode>>(new Map());
  const previewMeshesRef = useRef<Map<string, Mesh>>(new Map());
  const debugBonesRef = useRef<{ spheres: Mesh[]; lines: Mesh | null }>({ spheres: [], lines: null });
  const boneRestPosRef = useRef<Map<string, Vector3>>(new Map());
  const voxelBodyHeightRef = useRef(0);  // viewer-space Hips→Head distance
  const voxelsRef = useRef<VoxelEntry[]>([]);

  const [currentModel, setCurrentModel] = useState<ModelEntry>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const modelId = params.get('model');
      if (modelId) {
        const m = MODEL_REGISTRY.find(e => e.id === modelId);
        if (m) return m;
      }
    }
    return MODEL_REGISTRY.find(m => m.id === DEFAULT_MODEL_ID) ?? MODEL_REGISTRY[0];
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<MarkerData>(() => getDefaultMarkers(35));
  const [calculatedBones, setCalculatedBones] = useState<Record<string, Vec3>>({});
  const [selectedMarker, setSelectedMarker] = useState<string>('Chin');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showBody, setShowBody] = useState(true);
  const [showBones, setShowBones] = useState(true);
  const [tab, setTab] = useState<'markers' | 'bones'>('markers');
  const [viewDir, setViewDir] = useState<ViewDirection>('front');
  const [autoMirror, setAutoMirror] = useState(true);
  const [mode, setMode] = useState<PageMode>('edit');
  const [playingMotion, setPlayingMotion] = useState<string | null>(null);
  const [motionSpeed, setMotionSpeed] = useState(1.0);
  const [loadedClips, setLoadedClips] = useState<Record<string, MotionClip>>({});
  const [loadingMotion, setLoadingMotion] = useState(false);
  const [quatConv, setQuatConv] = useState<QuatConversion>('correct');
  const [paused, setPaused] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showBonesOnly, setShowBonesOnly] = useState(false);
  const animCallbackRef = useRef<(() => void) | null>(null);
  const animTimeRef = useRef(0);
  const pausedRef = useRef(false);
  const applyFrameRef = useRef<((frame: number) => void) | null>(null);
  const loadKeyRef = useRef(0);

  // Equipment state
  const [equipParts, setEquipParts] = useState<EquipPart[]>([]);
  const [equipEnabled, setEquipEnabled] = useState<Record<string, boolean>>({});
  const [equipVoxelCache, setEquipVoxelCache] = useState<Record<string, VoxelEntry[]>>({});
  const [equipLoading, setEquipLoading] = useState(false);

  // Keep refs in sync
  useEffect(() => { autoMirrorRef.current = autoMirror; }, [autoMirror]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Compute mirror center from Chin/Groin X
  const getMirrorCenterX = useCallback(() => {
    const chin = markers['Chin'];
    const groin = markers['Groin'];
    return (chin.x + groin.x) / 2;
  }, [markers]);

  // Apply auto-mirror: sync right markers from left when enabled
  const applyAutoMirror = useCallback((m: MarkerData): MarkerData => {
    const mcx = (m['Chin'].x + m['Groin'].x) / 2;
    return {
      ...m,
      RightWrist: mirrorMarker(m['LeftWrist'], mcx),
      RightElbow: mirrorMarker(m['LeftElbow'], mcx),
      RightKnee:  mirrorMarker(m['LeftKnee'], mcx),
    };
  }, []);

  const setCameraView = useCallback((dir: ViewDirection) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const vDef = VIEW_DEFS.find(v => v.key === dir)!;
    camera.alpha = vDef.alpha;
    camera.beta = Math.PI / 2;
    viewRef.current = dir;
  }, []);

  const switchView = useCallback((dir: ViewDirection) => {
    setViewDir(dir);
    setCameraView(dir);
  }, [setCameraView]);

  // Recalculate bones whenever markers change
  useEffect(() => {
    const { maxZ } = centerRef.current;
    const bones = calculateAllBones(markers, maxZ);
    setCalculatedBones(bones);
  }, [markers]);

  // Get visible markers based on autoMirror state
  const getVisibleMarkers = useCallback((): MarkerDef[] => {
    if (autoMirror) {
      // Show only center + left markers
      return MARKER_DEFS.filter(m => m.side !== 'right');
    }
    return MARKER_DEFS;
  }, [autoMirror]);

  // Build all visuals
  const rebuildVisuals = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const { cx, cy } = centerRef.current;

    // Clear old
    for (const m of jointSpheresRef.current.values()) m.dispose();
    jointSpheresRef.current.clear();
    for (const m of markerSpheresRef.current.values()) m.dispose();
    markerSpheresRef.current.clear();
    for (const m of boneLineMeshesRef.current) m.dispose();
    boneLineMeshesRef.current = [];
    if (centerLineMeshRef.current) { centerLineMeshRef.current.dispose(); centerLineMeshRef.current = null; }

    // Center line based on Chin/Groin
    const mcx = getMirrorCenterX();
    const clP1 = voxelToViewer(mcx, cy, 0, cx, cy);
    const clP2 = voxelToViewer(mcx, cy, centerRef.current.maxZ, cx, cy);
    const cl = MeshBuilder.CreateTube('centerLine', {
      path: [clP1, clP2], radius: 0.003, tessellation: 4, updatable: false,
    }, scene);
    const clMat = new StandardMaterial('clMat', scene);
    clMat.diffuseColor = new Color3(1, 1, 0);
    clMat.emissiveColor = new Color3(0.5, 0.5, 0);
    clMat.alpha = 0.3;
    clMat.disableLighting = true;
    cl.material = clMat;
    cl.isPickable = false;
    centerLineMeshRef.current = cl;

    // Marker spheres
    const visibleMarkers = getVisibleMarkers();
    for (const mDef of visibleMarkers) {
      const pos = markers[mDef.name];
      if (!pos) continue;

      const sphere = MeshBuilder.CreateSphere(`marker_${mDef.name}`, { diameter: 0.06 }, scene);
      sphere.position = voxelToViewer(pos.x, pos.y, pos.z, cx, cy);
      const mat = new StandardMaterial(`mmat_${mDef.name}`, scene);
      const c = Color3.FromHexString(mDef.color);
      mat.diffuseColor = c;
      mat.emissiveColor = mDef.name === selectedMarker ? c : c.scale(0.6);
      mat.disableLighting = true;
      sphere.material = mat;
      sphere.isPickable = true;
      sphere.metadata = { markerName: mDef.name };
      if (mDef.name === selectedMarker) {
        sphere.scaling = new Vector3(1.8, 1.8, 1.8);
      }
      markerSpheresRef.current.set(mDef.name, sphere);
    }

    // Ghost markers for auto-mirrored right side
    if (autoMirror) {
      for (const mDef of MARKER_DEFS.filter(m => m.side === 'right' && m.mirrorOf)) {
        const pos = markers[mDef.name];
        if (!pos) continue;
        const sphere = MeshBuilder.CreateSphere(`marker_${mDef.name}_ghost`, { diameter: 0.06 }, scene);
        sphere.position = voxelToViewer(pos.x, pos.y, pos.z, cx, cy);
        const mat = new StandardMaterial(`mmat_${mDef.name}_ghost`, scene);
        const c = Color3.FromHexString(mDef.color);
        mat.diffuseColor = c;
        mat.emissiveColor = c.scale(0.3);
        mat.alpha = 0.4;
        mat.disableLighting = true;
        sphere.material = mat;
        sphere.isPickable = false;
        markerSpheresRef.current.set(mDef.name + '_ghost', sphere);
      }
    }

    // Bone joints and lines
    if (showBones && Object.keys(calculatedBones).length > 0) {
      for (const bone of BONE_DEFS) {
        const pos = calculatedBones[bone.name];
        if (!pos) continue;
        const sphere = MeshBuilder.CreateSphere(`joint_${bone.name}`, { diameter: 0.03 }, scene);
        sphere.position = voxelToViewer(pos.x, pos.y, pos.z, cx, cy);
        const mat = new StandardMaterial(`jmat_${bone.name}`, scene);
        const c = Color3.FromHexString(bone.color);
        mat.diffuseColor = c;
        mat.emissiveColor = c.scale(0.4);
        mat.alpha = 0.7;
        mat.disableLighting = true;
        sphere.material = mat;
        sphere.isPickable = false;
        jointSpheresRef.current.set(bone.name, sphere);
      }

      for (const bone of BONE_DEFS) {
        if (!bone.parent) continue;
        const childPos = calculatedBones[bone.name];
        const parentPos = calculatedBones[bone.parent];
        if (!childPos || !parentPos) continue;
        const p1 = voxelToViewer(parentPos.x, parentPos.y, parentPos.z, cx, cy);
        const p2 = voxelToViewer(childPos.x, childPos.y, childPos.z, cx, cy);
        if (Vector3.Distance(p1, p2) < 0.001) continue;

        const line = MeshBuilder.CreateTube(`bone_${bone.name}`, {
          path: [p1, p2], radius: 0.005, tessellation: 6, updatable: false,
        }, scene);
        const mat = new StandardMaterial(`bmat_${bone.name}`, scene);
        const c = Color3.FromHexString(bone.color);
        mat.diffuseColor = c;
        mat.emissiveColor = c.scale(0.3);
        mat.alpha = 0.6;
        mat.disableLighting = true;
        line.material = mat;
        line.isPickable = false;
        boneLineMeshesRef.current.push(line);
      }
    }
  }, [markers, calculatedBones, selectedMarker, showBones, autoMirror, getMirrorCenterX, getVisibleMarkers]);

  // Init engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.10, 0.10, 0.16, 1);

    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4 }, scene);
    const gMat = new StandardMaterial('gMat', scene);
    gMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
    gMat.alpha = 0.3; gMat.wireframe = true;
    ground.material = gMat;
    ground.isPickable = false;

    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 2, 2.5, new Vector3(0, 0.5, 0), scene);
    camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = 8; camera.wheelPrecision = 80;
    camera.inputs.clear();
    camera.inputs.addMouseWheel();
    cameraRef.current = camera;

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.5;

    // --- Drag & drop ---
    scene.onPointerObservable.add((pointerInfo) => {
      const { cx, cy } = centerRef.current;
      const currentView = VIEW_DEFS.find(v => v.key === viewRef.current)!;

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN: {
          const pickResult = scene.pick(scene.pointerX, scene.pointerY);
          if (pickResult?.hit && pickResult.pickedMesh?.metadata?.markerName) {
            const markerName = pickResult.pickedMesh.metadata.markerName as string;
            const meshPos = pickResult.pickedMesh.position;
            const cameraDir = camera.position.subtract(camera.target).normalize();
            const dragPlane = Plane.FromPositionAndNormal(meshPos, cameraDir);
            const pickPoint = pickResult.pickedPoint!;
            const offset = meshPos.subtract(pickPoint);
            draggingRef.current = { markerName, plane: dragPlane, offset };
            setSelectedMarker(markerName);
            setTab('markers');
          }
          break;
        }
        case PointerEventTypes.POINTERMOVE: {
          if (!draggingRef.current) break;
          const { markerName, plane, offset } = draggingRef.current;

          const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
          const denom = Vector3.Dot(ray.direction, plane.normal);
          if (Math.abs(denom) < 1e-6) break;
          const t = -(Vector3.Dot(ray.origin, plane.normal) + plane.d) / denom;
          if (t < 0) break;
          const hitPoint = ray.origin.add(ray.direction.scale(t)).add(offset);
          const newVox = viewerToVoxel(hitPoint, cx, cy);

          setMarkers(prev => {
            const old = prev[markerName];
            const updated = { ...old };

            if (currentView.dragAxes.includes('x')) {
              updated.x = Math.max(0, Math.min(85, Math.round(newVox.x * 2) / 2));
            }
            if (currentView.dragAxes.includes('y')) {
              updated.y = Math.max(0, Math.min(34, Math.round(newVox.y * 2) / 2));
            }
            if (currentView.dragAxes.includes('z')) {
              updated.z = Math.max(0, Math.min(103, Math.round(newVox.z * 2) / 2));
            }

            let next = { ...prev, [markerName]: updated };

            // Auto-mirror: if editing a left marker, sync right
            if (autoMirrorRef.current) {
              const mDef = MARKER_DEFS.find(m => m.name === markerName);
              if (mDef?.side === 'left') {
                const rightName = MARKER_DEFS.find(m => m.mirrorOf === markerName)?.name;
                if (rightName) {
                  const mcx = (next['Chin'].x + next['Groin'].x) / 2;
                  next[rightName] = mirrorMarker(updated, mcx);
                }
              }
              // If editing Chin or Groin (center changes), re-mirror all
              if (markerName === 'Chin' || markerName === 'Groin') {
                const mcx = (next['Chin'].x + next['Groin'].x) / 2;
                next['RightWrist'] = mirrorMarker(next['LeftWrist'], mcx);
                next['RightElbow'] = mirrorMarker(next['LeftElbow'], mcx);
                next['RightKnee']  = mirrorMarker(next['LeftKnee'], mcx);
              }
            }

            return next;
          });
          setDirty(true);
          break;
        }
        case PointerEventTypes.POINTERUP: {
          if (draggingRef.current) {
            draggingRef.current = null;
          }
          break;
        }
      }
    });

    sceneRef.current = scene;
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  // Load body + saved config (re-runs when model changes)
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const thisLoadKey = ++loadKeyRef.current;

    // Clear existing body mesh
    if (bodyMeshRef.current) { bodyMeshRef.current.dispose(); bodyMeshRef.current = null; }

    setLoading(true);
    setError(null);
    setDirty(false);

    (async () => {
      try {
        const { model, voxels } = await loadVoxFile(currentModel.bodyFile);
        if (loadKeyRef.current !== thisLoadKey) return; // stale

        const cx = model.sizeX / 2;
        const cy = model.sizeY / 2;
        const maxZ = model.sizeZ;
        centerRef.current = { cx, cy, maxZ };
        voxelsRef.current = voxels;

        bodyMeshRef.current = buildBodyMesh(voxels, scene, cx, cy, 0.25);

        // Load equipment manifest
        try {
          const partsResp = await fetch(currentModel.partsManifest + `?v=${Date.now()}`);
          if (partsResp.ok) {
            const parts: EquipPart[] = await partsResp.json();
            // Filter out the body itself
            const equipOnly = parts.filter(p => p.key !== currentModel.bodyKey);
            setEquipParts(equipOnly);
            // Set default enabled state
            const enabled: Record<string, boolean> = {};
            for (const p of equipOnly) enabled[p.key] = p.default_on;
            setEquipEnabled(enabled);
            setEquipVoxelCache({});
          }
        } catch { /* no equipment available */ }

        // Load saved bone config for this model
        let loaded = false;
        try {
          const resp = await fetch(`/api/bone-config?dir=${currentModel.dir}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.markers && typeof data.markers === 'object') {
              setMarkers(prev => ({ ...prev, ...data.markers }));
              if (data.autoMirror === false) setAutoMirror(false);
              else setAutoMirror(true);
              loaded = true;
            }
          }
        } catch { /* use defaults */ }

        if (!loaded) {
          setMarkers(getDefaultMarkers(cx));
          setAutoMirror(true);
        }

        setLoading(false);
      } catch (e) {
        if (loadKeyRef.current !== thisLoadKey) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
  }, [currentModel]);

  // Rebuild visuals
  useEffect(() => {
    if (!loading) rebuildVisuals();
  }, [loading, rebuildVisuals]);

  // Toggle body visibility
  useEffect(() => {
    if (bodyMeshRef.current) bodyMeshRef.current.setEnabled(showBody);
  }, [showBody]);

  const updateMarker = useCallback((markerName: string, axis: 'x' | 'y' | 'z', value: number) => {
    setMarkers(prev => {
      let next = { ...prev, [markerName]: { ...prev[markerName], [axis]: value } };

      if (autoMirrorRef.current) {
        const mDef = MARKER_DEFS.find(m => m.name === markerName);
        if (mDef?.side === 'left') {
          const rightName = MARKER_DEFS.find(m => m.mirrorOf === markerName)?.name;
          if (rightName) {
            const mcx = (next['Chin'].x + next['Groin'].x) / 2;
            next[rightName] = mirrorMarker(next[markerName], mcx);
          }
        }
        if (markerName === 'Chin' || markerName === 'Groin') {
          const mcx = (next['Chin'].x + next['Groin'].x) / 2;
          next['RightWrist'] = mirrorMarker(next['LeftWrist'], mcx);
          next['RightElbow'] = mirrorMarker(next['LeftElbow'], mcx);
          next['RightKnee']  = mirrorMarker(next['LeftKnee'], mcx);
        }
      }

      return next;
    });
    setDirty(true);
  }, []);

  // Toggle auto-mirror
  const toggleAutoMirror = useCallback(() => {
    setAutoMirror(prev => {
      const next = !prev;
      if (next) {
        // Turning ON: sync right from left immediately
        setMarkers(m => applyAutoMirror(m));
      }
      // If selected marker is a right-side marker and we're turning mirror ON, switch to left
      const selDef = MARKER_DEFS.find(m => m.name === selectedMarker);
      if (next && selDef?.side === 'right' && selDef.mirrorOf) {
        setSelectedMarker(selDef.mirrorOf);
      }
      setDirty(true);
      return next;
    });
  }, [selectedMarker, applyAutoMirror]);

  const resetToDefaults = useCallback(() => {
    const { cx } = centerRef.current;
    setMarkers(getDefaultMarkers(cx));
    setAutoMirror(true);
    setDirty(true);
  }, []);


  // Load equipment voxels for enabled parts
  const loadEquipmentVoxels = useCallback(async (): Promise<VoxelEntry[]> => {
    const enabledKeys = Object.entries(equipEnabled).filter(([, v]) => v).map(([k]) => k);
    if (enabledKeys.length === 0) return [];

    const cache = { ...equipVoxelCache };
    const toLoad = enabledKeys.filter(k => !cache[k]);

    if (toLoad.length > 0) {
      setEquipLoading(true);
      const results = await Promise.all(
        toLoad.map(async key => {
          const part = equipParts.find(p => p.key === key);
          if (!part) return { key, voxels: [] as VoxelEntry[] };
          try {
            const { voxels } = await loadVoxFile(part.file);
            return { key, voxels };
          } catch {
            return { key, voxels: [] as VoxelEntry[] };
          }
        })
      );
      for (const r of results) cache[r.key] = r.voxels;
      setEquipVoxelCache(cache);
      setEquipLoading(false);
    }

    // Merge all enabled equipment voxels
    const allEquip: VoxelEntry[] = [];
    for (const key of enabledKeys) {
      if (cache[key]) allEquip.push(...cache[key]);
    }
    return allEquip;
  }, [equipEnabled, equipParts, equipVoxelCache]);

  // Enter preview: hide edit visuals, build skeletal hierarchy, free camera
  const enterPreview = useCallback(async () => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas || Object.keys(calculatedBones).length === 0) return;
    const { cx, cy } = centerRef.current;

    // Hide edit visuals
    if (bodyMeshRef.current) bodyMeshRef.current.setEnabled(false);
    for (const m of markerSpheresRef.current.values()) m.setEnabled(false);
    for (const m of jointSpheresRef.current.values()) m.setEnabled(false);
    for (const m of boneLineMeshesRef.current) m.setEnabled(false);
    if (centerLineMeshRef.current) centerLineMeshRef.current.setEnabled(false);

    // Dispose old preview
    for (const m of previewMeshesRef.current.values()) m.dispose();
    for (const n of previewNodesRef.current.values()) n.dispose();
    previewMeshesRef.current.clear();
    previewNodesRef.current.clear();

    // Load equipment voxels and merge with body
    const equipVoxels = await loadEquipmentVoxels();
    const mergedVoxels = [...voxelsRef.current];
    if (equipVoxels.length > 0) {
      // Equipment voxels override body voxels at same position (clothing priority)
      const bodySet = new Set<string>();
      for (const v of mergedVoxels) bodySet.add(`${v.x},${v.y},${v.z}`);
      for (const v of equipVoxels) {
        const k = `${v.x},${v.y},${v.z}`;
        if (bodySet.has(k)) {
          // Replace body voxel with equipment voxel
          const idx = mergedVoxels.findIndex(bv => bv.x === v.x && bv.y === v.y && bv.z === v.z);
          if (idx >= 0) mergedVoxels[idx] = v;
        } else {
          mergedVoxels.push(v);
        }
      }
    }

    // Build hierarchical 20-bone skeleton with voxel meshes
    const { nodes, meshes } = buildSkeletalPreview(mergedVoxels, calculatedBones, scene, cx, cy);
    previewNodesRef.current = nodes;
    previewMeshesRef.current = meshes;

    // Store rest positions for all bones (for animation delta application)
    const restPosMap = new Map<string, Vector3>();
    for (const boneDef of BONE_DEFS) {
      const bp = calculatedBones[boneDef.name];
      if (bp) {
        restPosMap.set(boneDef.name, voxelToViewer(bp.x, bp.y, bp.z, cx, cy));
      }
    }
    boneRestPosRef.current = restPosMap;

    // Compute voxel body height (Hips→Head in viewer space) for FBX scale matching
    const hipsPos = calculatedBones['Hips'];
    const headPos = calculatedBones['Head'];
    if (hipsPos && headPos) {
      voxelBodyHeightRef.current = (headPos.z - hipsPos.z) * SCALE;
    }

    // Enable free camera rotation
    const camera = cameraRef.current;
    if (camera) {
      camera.inputs.addPointers();
      camera.attachControl(canvas, true);
    }

    setMode('preview');
  }, [calculatedBones, loadEquipmentVoxels]);

  // Exit preview: restore edit visuals, dispose preview meshes, fixed camera
  const exitPreview = useCallback(() => {
    // Stop animation
    const scene = sceneRef.current;
    if (scene && animCallbackRef.current) {
      scene.unregisterBeforeRender(animCallbackRef.current);
      animCallbackRef.current = null;
    }
    animTimeRef.current = 0;
    setPlayingMotion(null);

    // Dispose preview meshes and debug bones
    for (const m of previewMeshesRef.current.values()) m.dispose();
    for (const n of previewNodesRef.current.values()) n.dispose();
    previewMeshesRef.current.clear();
    previewNodesRef.current.clear();
    for (const s of debugBonesRef.current.spheres) s.dispose();
    if (debugBonesRef.current.lines) debugBonesRef.current.lines.dispose();
    debugBonesRef.current = { spheres: [], lines: null };
    setShowBonesOnly(false);

    // Restore edit visuals
    if (bodyMeshRef.current) bodyMeshRef.current.setEnabled(showBody);
    for (const m of markerSpheresRef.current.values()) m.setEnabled(true);
    for (const m of jointSpheresRef.current.values()) m.setEnabled(true);
    for (const m of boneLineMeshesRef.current) m.setEnabled(true);
    if (centerLineMeshRef.current) centerLineMeshRef.current.setEnabled(true);

    // Restore fixed camera
    const camera = cameraRef.current;
    if (camera) {
      camera.detachControl();
      camera.inputs.clear();
      camera.inputs.addMouseWheel();
      setCameraView(viewRef.current);
    }

    setMode('edit');
  }, [showBody, setCameraView]);

  // Save from preview mode
  const handleConfirmSave = useCallback(async () => {
    setSaving(true);
    try {
      const resp = await fetch(`/api/bone-config?dir=${currentModel.dir}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markers, bones: calculatedBones, autoMirror }),
      });
      if (!resp.ok) throw new Error('Save failed');
      setDirty(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }, [markers, calculatedBones, autoMirror, currentModel]);

  // Motion playback
  const stopMotion = useCallback(() => {
    const scene = sceneRef.current;
    if (scene && animCallbackRef.current) {
      scene.unregisterBeforeRender(animCallbackRef.current);
    }
    animCallbackRef.current = null;
    animTimeRef.current = 0;
    setPlayingMotion(null);
  }, []);

  // Load a motion clip from JSON file
  const loadMotionClip = useCallback(async (motionName: string): Promise<MotionClip | null> => {
    if (loadedClips[motionName]) return loadedClips[motionName];

    const motionDef = MOTION_FILES.find(m => m.name === motionName);
    if (!motionDef) return null;

    setLoadingMotion(true);
    try {
      const resp = await fetch(motionDef.file);
      if (!resp.ok) throw new Error(`Failed to load ${motionDef.file}`);
      const data = await resp.json();
      const clip: MotionClip = {
        name: motionName,
        label: motionDef.label,
        duration: data.duration,
        fps: data.fps,
        frameCount: data.frameCount,
        fbxBodyHeight: data.fbxBodyHeight || 2.854,
        outputBones: data.outputBones || [],
        bindWorldPositions: data.bindWorldPositions,
        frames: data.frames,
      };
      setLoadedClips(prev => ({ ...prev, [motionName]: clip }));
      setLoadingMotion(false);
      return clip;
    } catch (e) {
      console.error('Failed to load motion:', e);
      setLoadingMotion(false);
      return null;
    }
  }, [loadedClips]);

  const playMotionClip = useCallback((clip: MotionClip) => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (animCallbackRef.current) {
      scene.unregisterBeforeRender(animCallbackRef.current);
      animCallbackRef.current = null;
    }

    // Scale factor: voxel body height / FBX body height
    const scaleFactor = clip.fbxBodyHeight > 0
      ? voxelBodyHeightRef.current / clip.fbxBodyHeight
      : 1;

    const bwp = clip.bindWorldPositions;
    const voxelHipsPos = boneRestPosRef.current.get('Hips') ?? Vector3.Zero();
    const hipsBindFBX = bwp?.['Hips'] ?? [0, 0, 0];

    // FBX rest positions in viewer space (for debug bones only)
    const fbxRestViewer = new Map<string, Vector3>();
    for (const boneDef of BONE_DEFS) {
      const bp = bwp?.[boneDef.name];
      if (bp) {
        const relX = bp[0] - hipsBindFBX[0];
        const relY = bp[1] - hipsBindFBX[1];
        const relZ = bp[2] - hipsBindFBX[2];
        fbxRestViewer.set(boneDef.name, new Vector3(
          voxelHipsPos.x + (-relX) * scaleFactor,
          voxelHipsPos.y + relY * scaleFactor,
          voxelHipsPos.z + relZ * scaleFactor,
        ));
      }
    }

    // HIERARCHICAL APPROACH: Keep node hierarchy from buildSkeletalPreview.
    // Convert world-space dq → local rotation via parent inverse.
    // Apply rest pose correction: rotate voxel bone direction to match FBX bone direction.

    // Compute rest pose correction for each bone:
    // correctionQ rotates voxelBoneDir → fbxBoneDir (both in viewer space).
    // This ensures FBX rotation deltas produce correct results on voxel geometry.
    const restCorrections = new Map<string, Quaternion>();
    for (const boneDef of BONE_DEFS) {
      if (!boneDef.parent) continue;
      const voxelChild = boneRestPosRef.current.get(boneDef.name);
      const voxelParent = boneRestPosRef.current.get(boneDef.parent);
      const fbxChild = fbxRestViewer.get(boneDef.name);
      const fbxParent = fbxRestViewer.get(boneDef.parent);
      if (!voxelChild || !voxelParent || !fbxChild || !fbxParent) continue;

      const voxelDir = voxelChild.subtract(voxelParent);
      const fbxDirRaw = fbxChild.subtract(fbxParent);
      // Flip Z: FBX bone direction Z is inverted relative to voxel viewer Z
      // (same root cause as the body front/back inversion fixed earlier)
      const fbxDir = new Vector3(fbxDirRaw.x, fbxDirRaw.y, -fbxDirRaw.z);
      if (voxelDir.length() < 0.001 || fbxDir.length() < 0.001) continue;

      voxelDir.normalize();
      fbxDir.normalize();

      // DEBUG: Log bone directions for investigation
      if (['LeftArm','LeftForeArm','LeftUpLeg','LeftLeg','Spine','Spine2','Neck'].includes(boneDef.name)) {
        console.log(`[RestCorr] ${boneDef.name}: voxel=(${voxelDir.x.toFixed(3)},${voxelDir.y.toFixed(3)},${voxelDir.z.toFixed(3)}) fbx=(${fbxDir.x.toFixed(3)},${fbxDir.y.toFixed(3)},${fbxDir.z.toFixed(3)}) dot=${Vector3.Dot(voxelDir, fbxDir).toFixed(3)}`);
      }

      // Quaternion from voxelDir → fbxDir
      const dot = Vector3.Dot(voxelDir, fbxDir);
      if (dot > 0.9999) {
        // Already aligned
        continue;
      }
      if (dot < -0.9999) {
        // Opposite: rotate 180° around any perpendicular axis
        const perp = Math.abs(voxelDir.x) < 0.9
          ? Vector3.Cross(voxelDir, Vector3.Right())
          : Vector3.Cross(voxelDir, Vector3.Up());
        perp.normalize();
        restCorrections.set(boneDef.name, new Quaternion(perp.x, perp.y, perp.z, 0));
        continue;
      }
      const axis = Vector3.Cross(voxelDir, fbxDir);
      axis.normalize();
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      restCorrections.set(boneDef.name, Quaternion.RotationAxis(axis, angle));
    }

    // Ensure hierarchy is intact (restore if previously detached)
    for (const boneDef of BONE_DEFS) {
      const node = previewNodesRef.current.get(boneDef.name);
      if (!node) continue;
      if (boneDef.parent) {
        const parentNode = previewNodesRef.current.get(boneDef.parent);
        if (parentNode && node.parent !== parentNode) {
          node.parent = parentNode;
          const bonePos = boneRestPosRef.current.get(boneDef.name);
          const parentPos = boneRestPosRef.current.get(boneDef.parent);
          if (bonePos && parentPos) {
            node.position = bonePos.subtract(parentPos);
          }
        }
      } else {
        node.parent = null;
        const rest = boneRestPosRef.current.get(boneDef.name);
        if (rest) node.position = rest.clone();
      }
      node.rotationQuaternion = Quaternion.Identity();
    }

    // Create debug bone spheres
    for (const s of debugBonesRef.current.spheres) s.dispose();
    if (debugBonesRef.current.lines) debugBonesRef.current.lines.dispose();
    const debugSpheres: Mesh[] = [];
    for (const boneDef of BONE_DEFS) {
      const fbxRest = fbxRestViewer.get(boneDef.name);
      if (!fbxRest) continue;
      const sphere = MeshBuilder.CreateSphere(`dbg_${boneDef.name}`, { diameter: 0.15 }, scene);
      const mat = new StandardMaterial(`dbg_mat_${boneDef.name}`, scene);
      mat.diffuseColor = Color3.FromHexString(boneDef.color);
      mat.emissiveColor = Color3.FromHexString(boneDef.color).scale(0.5);
      sphere.material = mat;
      sphere.position = fbxRest.clone();
      sphere.isPickable = false;
      sphere.setEnabled(showBonesOnly);
      debugSpheres.push(sphere);
    }
    // DEBUG: Draw direction arrows for each bone
    // Red line = voxel bone direction, Green line = FBX bone direction
    // Both start from the bone's voxel rest position
    const debugArrows: Mesh[] = [];
    const arrowLen = 0.8;
    const debugBones = ['LeftArm','LeftForeArm','LeftUpLeg','LeftLeg','LeftHand','Spine','Spine2','Neck','Head','RightArm','RightForeArm','RightUpLeg','RightLeg'];
    for (const boneName of debugBones) {
      const boneDef = BONE_DEFS.find(d => d.name === boneName);
      if (!boneDef?.parent) continue;
      const vChild = boneRestPosRef.current.get(boneDef.name);
      const vParent = boneRestPosRef.current.get(boneDef.parent);
      const fChild = fbxRestViewer.get(boneDef.name);
      const fParent = fbxRestViewer.get(boneDef.parent);
      if (!vChild || !vParent || !fChild || !fParent) continue;

      const vDir = vChild.subtract(vParent).normalize().scale(arrowLen);
      const fDirRaw = fChild.subtract(fParent);
      const fDir = new Vector3(fDirRaw.x, fDirRaw.y, -fDirRaw.z).normalize().scale(arrowLen);
      const origin = vParent.clone();

      // Red = voxel direction
      const redLine = MeshBuilder.CreateLines(`dbg_vdir_${boneName}`, {
        points: [origin, origin.add(vDir)],
      }, scene);
      redLine.color = new Color3(1, 0, 0);
      redLine.isPickable = false;
      redLine.setEnabled(showBonesOnly);
      debugArrows.push(redLine);

      // Green = FBX direction
      const greenLine = MeshBuilder.CreateLines(`dbg_fdir_${boneName}`, {
        points: [origin, origin.add(fDir)],
      }, scene);
      greenLine.color = new Color3(0, 1, 0);
      greenLine.isPickable = false;
      greenLine.setEnabled(showBonesOnly);
      debugArrows.push(greenLine);
    }
    debugSpheres.push(...debugArrows);

    debugBonesRef.current = { spheres: debugSpheres, lines: null };
    const boneToSphereIdx = new Map<string, number>();
    let sIdx = 0;
    for (const boneDef of BONE_DEFS) {
      if (fbxRestViewer.has(boneDef.name)) boneToSphereIdx.set(boneDef.name, sIdx++);
    }

    animTimeRef.current = 0;
    let lastTime = performance.now();
    const frameDuration = 1.0 / clip.fps;

    // Quaternion conversion: X-reflection (-Three_x, Three_y, Three_z)
    // q_viewer = (x, -y, -z, w)
    const toViewerQuat = (dq: [number, number, number, number]) => {
      switch (quatConv) {
        case 'correct':  return new Quaternion(dq[0], -dq[1], -dq[2], dq[3]);
        case 'conv1':    return new Quaternion(-dq[0], -dq[1], dq[2], dq[3]);
        case 'conv2':    return new Quaternion(dq[0], dq[1], -dq[2], dq[3]);
        case 'identity': return new Quaternion(dq[0], dq[1], dq[2], dq[3]);
      }
    };

    const applyFrame = (frameIndex: number) => {
      const frame = clip.frames[frameIndex];

      // Step 1: Compute world-space dq in viewer coords for all bones
      const worldDqs = new Map<string, Quaternion>();
      for (const boneDef of BONE_DEFS) {
        const data = frame[boneDef.name];
        worldDqs.set(boneDef.name, data ? toViewerQuat(data.dq) : Quaternion.Identity());
      }

      // Step 2: Convert world dq → local rotation with rest pose correction.
      // For each bone: localRot = correction × parentWorldDq⁻¹ × childWorldDq × correction⁻¹
      // The correction rotates from voxel bone direction to FBX bone direction.
      // correction⁻¹ on the right ensures the rotation acts in the FBX frame,
      // then correction on the left maps the result back to voxel frame.
      for (const boneDef of BONE_DEFS) {
        const node = previewNodesRef.current.get(boneDef.name);
        if (!node) continue;

        const worldDq = worldDqs.get(boneDef.name) ?? Quaternion.Identity();

        if (boneDef.parent) {
          const parentWorldDq = worldDqs.get(boneDef.parent) ?? Quaternion.Identity();
          const parentInv = Quaternion.Inverse(parentWorldDq);
          let localDq = parentInv.multiply(worldDq);

          // Rest pose correction DISABLED for testing
          // const corr = restCorrections.get(boneDef.name);
          // if (corr) {
          //   const corrInv = Quaternion.Inverse(corr);
          //   localDq = corr.multiply(localDq).multiply(corrInv);
          // }

          node.rotationQuaternion = localDq;
        } else {
          node.rotationQuaternion = worldDq;
        }
      }

      // Step 3: Hips position from dp
      const hipsData = frame['Hips'];
      const hipsNode = previewNodesRef.current.get('Hips');
      if (hipsNode && hipsData?.dp) {
        hipsNode.position.x = voxelHipsPos.x + (-hipsData.dp[0]) * scaleFactor;
        hipsNode.position.y = voxelHipsPos.y + hipsData.dp[1] * scaleFactor;
        hipsNode.position.z = voxelHipsPos.z + hipsData.dp[2] * scaleFactor;
      } else if (hipsNode) {
        hipsNode.position.copyFrom(voxelHipsPos);
      }

      // Debug: update sphere positions and lines (using dp world positions)
      const debugPositions = new Map<string, Vector3>();
      for (const boneDef of BONE_DEFS) {
        const fbxRest = fbxRestViewer.get(boneDef.name);
        if (!fbxRest) continue;
        const data = frame[boneDef.name];
        if (data?.dp) {
          debugPositions.set(boneDef.name, new Vector3(
            fbxRest.x + (-data.dp[0]) * scaleFactor,
            fbxRest.y + data.dp[1] * scaleFactor,
            fbxRest.z + data.dp[2] * scaleFactor,
          ));
        } else {
          debugPositions.set(boneDef.name, fbxRest.clone());
        }
      }
      const spheres = debugBonesRef.current.spheres;
      for (const boneDef of BONE_DEFS) {
        const idx = boneToSphereIdx.get(boneDef.name);
        if (idx === undefined) continue;
        const pos = debugPositions.get(boneDef.name);
        if (pos && spheres[idx]) spheres[idx].position.copyFrom(pos);
      }
      if (debugBonesRef.current.lines) {
        debugBonesRef.current.lines.dispose();
        debugBonesRef.current.lines = null;
      }
      const linePoints: Vector3[][] = [];
      for (const boneDef of BONE_DEFS) {
        if (!boneDef.parent) continue;
        const childPos = debugPositions.get(boneDef.name);
        const parentPos = debugPositions.get(boneDef.parent);
        if (childPos && parentPos) linePoints.push([parentPos, childPos]);
      }
      if (linePoints.length > 0) {
        const linesMesh = MeshBuilder.CreateLineSystem('dbg_lines', { lines: linePoints }, scene);
        linesMesh.color = new Color3(1, 1, 0);
        linesMesh.isPickable = false;
        linesMesh.setEnabled(showBonesOnly);
        debugBonesRef.current.lines = linesMesh;
      }
    };

    const callback = () => {
      if (pausedRef.current) return;
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      animTimeRef.current += dt * motionSpeed;

      const loopedTime = animTimeRef.current % clip.duration;
      const frameIndex = Math.min(
        Math.floor(loopedTime / frameDuration),
        clip.frameCount - 1
      );
      setCurrentFrame(frameIndex);
      applyFrame(frameIndex);
    };

    applyFrameRef.current = applyFrame;
    animCallbackRef.current = callback;
    scene.registerBeforeRender(callback);
    setPlayingMotion(clip.name);
  }, [motionSpeed, quatConv, calculatedBones, showBonesOnly]);

  const startMotion = useCallback(async (motionName: string) => {
    const clip = await loadMotionClip(motionName);
    if (clip) playMotionClip(clip);
  }, [loadMotionClip, playMotionClip]);

  // Update speed on running animation
  useEffect(() => {
    if (playingMotion && loadedClips[playingMotion]) {
      playMotionClip(loadedClips[playingMotion]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionSpeed, quatConv, showBonesOnly]);

  // Toggle voxel mesh / debug bone visibility
  useEffect(() => {
    for (const m of previewMeshesRef.current.values()) m.setEnabled(!showBonesOnly);
    for (const s of debugBonesRef.current.spheres) s.setEnabled(showBonesOnly);
    if (debugBonesRef.current.lines) debugBonesRef.current.lines.setEnabled(showBonesOnly);
  }, [showBonesOnly]);

  const selMarker = MARKER_DEFS.find(m => m.name === selectedMarker);
  const selPos = selectedMarker ? markers[selectedMarker] : null;
  const currentViewDef = VIEW_DEFS.find(v => v.key === viewDir)!;
  const visibleMarkers = getVisibleMarkers();
  const mirrorCenterX = getMirrorCenterX();

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      {/* Sidebar */}
      <div style={{
        width: 320, minWidth: 320, background: '#0f0f23', color: '#ccc',
        borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 'bold', fontSize: 16 }}>Bone Config</span>
            <Link href="/" style={{ color: '#888', fontSize: 11, textDecoration: 'none' }}>Top</Link>
          </div>
          <div style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Model:</span>
            <select
              value={currentModel.id}
              onChange={e => {
                const m = MODEL_REGISTRY.find(r => r.id === e.target.value);
                if (m && m.id !== currentModel.id) {
                  if (mode === 'preview') exitPreview();
                  setCurrentModel(m);
                }
              }}
              style={{
                fontSize: 11, background: '#1a1a2e', color: '#aaf',
                border: '1px solid #444', borderRadius: 3, padding: '2px 6px',
                cursor: 'pointer',
              }}
            >
              {MODEL_REGISTRY.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div style={{ padding: 12, color: '#f88', fontSize: 12 }}>Error: {error}</div>}
        {loading && <div style={{ padding: 12, color: '#88f', fontSize: 12 }}>Loading...</div>}

        {/* View direction (edit mode only) */}
        {mode === 'edit' && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>View Direction</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {VIEW_DEFS.map(vDef => {
                const active = viewDir === vDef.key;
                return (
                  <button
                    key={vDef.key}
                    onClick={() => switchView(vDef.key)}
                    style={{
                      flex: 1, padding: '6px 0', border: 'none', borderRadius: 4, cursor: 'pointer',
                      fontSize: 12, fontWeight: 'bold',
                      background: active ? '#3a3a8e' : '#1a1a3e',
                      color: active ? '#fff' : '#888',
                      outline: active ? '2px solid #66f' : '1px solid #333',
                    }}
                  >{vDef.label}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
              ドラッグ軸: {currentViewDef.axisLabels}
            </div>
          </div>
        )}

        {/* Toggles (edit mode only) */}
        {mode === 'edit' && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={showBody} onChange={() => setShowBody(!showBody)} />
              Body
            </label>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={showBones} onChange={() => setShowBones(!showBones)} />
              Bones
            </label>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={autoMirror} onChange={toggleAutoMirror} />
              <span style={{ color: autoMirror ? '#88f' : '#888' }}>左右対称</span>
            </label>
          </div>
        )}

        {/* Tabs (edit mode only) */}
        {mode === 'edit' && (
          <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
            <button
              onClick={() => setTab('markers')}
              style={{
                flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
                background: tab === 'markers' ? '#2a2a5e' : 'transparent',
                color: tab === 'markers' ? '#fff' : '#888',
                borderBottom: tab === 'markers' ? '2px solid #88f' : '2px solid transparent',
              }}
            >Markers ({autoMirror ? 5 : 8})</button>
            <button
              onClick={() => setTab('bones')}
              style={{
                flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
                background: tab === 'bones' ? '#2a2a5e' : 'transparent',
                color: tab === 'bones' ? '#fff' : '#888',
                borderBottom: tab === 'bones' ? '2px solid #88f' : '2px solid transparent',
              }}
            >Auto Bones (41)</button>
          </div>
        )}

        {/* Markers tab */}
        {mode === 'edit' && tab === 'markers' && (
          <>
            {selMarker && selPos && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #333', background: '#11112a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: selMarker.color, display: 'inline-block', border: '2px solid #fff' }} />
                  <span style={{ fontWeight: 'bold', fontSize: 14 }}>{selMarker.label}</span>
                  {selMarker.side === 'left' && autoMirror && (
                    <span style={{ fontSize: 10, color: '#88f', background: '#1a1a4e', padding: '1px 6px', borderRadius: 8 }}>L/R auto</span>
                  )}
                </div>

                {(['x', 'y', 'z'] as const).map(axis => {
                  const max = axis === 'x' ? 85 : axis === 'y' ? 34 : 103;
                  const labels = { x: 'X (左右)', y: 'Y (前後)', z: 'Z (高さ)' };
                  const isDragAxis = currentViewDef.dragAxes.includes(axis);
                  return (
                    <div key={axis} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 70, fontSize: 11, color: isDragAxis ? '#ddd' : '#666' }}>
                          {labels[axis]}
                        </span>
                        <input type="range" min={0} max={max} step={0.5}
                          value={selPos[axis]}
                          onChange={e => updateMarker(selectedMarker, axis, Number(e.target.value))}
                          style={{ flex: 1 }} />
                        <input type="number" min={0} max={max} step={0.5}
                          value={selPos[axis]}
                          onChange={e => updateMarker(selectedMarker, axis, Number(e.target.value))}
                          style={{
                            width: 50, fontSize: 11, background: '#1a1a3e', color: '#ccc',
                            border: '1px solid #444', borderRadius: 3, padding: '2px 4px', textAlign: 'right',
                          }} />
                      </div>
                    </div>
                  );
                })}

                {autoMirror && selMarker.side === 'left' && (
                  <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                    Right auto: X={r1(mirrorCenterX + (mirrorCenterX - selPos.x))}
                    {' '}(center: {r1(mirrorCenterX)})
                  </div>
                )}
                {(selMarker.name === 'Chin' || selMarker.name === 'Groin') && autoMirror && (
                  <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                    Mirror center X: {r1(mirrorCenterX)} (Chin+Groin)/2
                  </div>
                )}
              </div>
            )}

            {/* Marker list */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: '6px 12px', fontSize: 11, color: '#888', borderBottom: '1px solid #222' }}>
                マーカー一覧 (ドラッグ / クリックで選択)
              </div>
              {visibleMarkers.map(mDef => {
                const isSelected = mDef.name === selectedMarker;
                const pos = markers[mDef.name];
                return (
                  <div
                    key={mDef.name}
                    onClick={() => setSelectedMarker(mDef.name)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                      background: isSelected ? '#2a2a5e' : 'transparent',
                      borderLeft: isSelected ? `3px solid ${mDef.color}` : '3px solid transparent',
                      color: isSelected ? '#fff' : '#aaa',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span style={{
                      width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                      background: mDef.color, display: 'inline-block',
                      border: isSelected ? '2px solid #fff' : '1px solid #666',
                    }} />
                    <span style={{ flex: 1 }}>{mDef.label}</span>
                    {pos && (
                      <span style={{ fontSize: 10, color: '#666' }}>
                        ({r1(pos.x)}, {r1(pos.y)}, {r1(pos.z)})
                      </span>
                    )}
                    {autoMirror && mDef.side === 'left' && <span style={{ fontSize: 9, color: '#558' }}>L/R</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Bones tab */}
        {mode === 'edit' && tab === 'bones' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ padding: '6px 12px', fontSize: 11, color: '#888', borderBottom: '1px solid #222' }}>
              自動計算されたボーン (読み取り専用)
            </div>
            {BONE_DEFS.map(bone => {
              const pos = calculatedBones[bone.name];
              const depth = getDepth(bone.name);
              return (
                <div
                  key={bone.name}
                  style={{
                    padding: '4px 12px', paddingLeft: 12 + depth * 14,
                    fontSize: 11, color: '#999',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: bone.color, display: 'inline-block',
                  }} />
                  <span style={{ flex: 1 }}>{bone.label}</span>
                  {pos && (
                    <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
                      {r1(pos.x)}, {r1(pos.y)}, {r1(pos.z)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {mode === 'edit' && (
          <div style={{ padding: '10px 12px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={resetToDefaults} style={{
              padding: '6px 0', borderRadius: 4, cursor: 'pointer',
              background: '#3a2a2a', color: '#ccc', border: '1px solid #555', fontSize: 11,
            }}>Reset to Defaults</button>
            <button
              onClick={enterPreview}
              disabled={Object.keys(calculatedBones).length === 0}
              style={{
                padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                background: '#3a5a8a', color: '#fff',
                border: '2px solid #5588cc', fontSize: 13, fontWeight: 'bold',
              }}
            >
              決定 → プレビュー
            </button>
          </div>
        )}
        {mode === 'preview' && (
          <>
            {/* Motion clips */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>
                Motion
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {MOTION_FILES.map(motion => {
                  const isActive = playingMotion === motion.name;
                  const isLoaded = !!loadedClips[motion.name];
                  return (
                    <button
                      key={motion.name}
                      onClick={() => isActive ? stopMotion() : startMotion(motion.name)}
                      disabled={loadingMotion}
                      style={{
                        padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        textAlign: 'left',
                        background: isActive ? '#4a7a4a' : '#2a2a4e',
                        color: isActive ? '#fff' : '#aaa',
                        border: isActive ? '2px solid #6a6' : '1px solid #444',
                        fontWeight: isActive ? 'bold' : 'normal',
                      }}
                    >
                      {loadingMotion && !isLoaded ? '⏳ ' : isActive ? '■ ' : '▶ '}{motion.label}
                    </button>
                  );
                })}
              </div>
              {/* Speed control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#888', width: 40 }}>Speed</span>
                <input type="range" min={0.2} max={3.0} step={0.1}
                  value={motionSpeed}
                  onChange={e => setMotionSpeed(Number(e.target.value))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#888', width: 30, textAlign: 'right' }}>{motionSpeed.toFixed(1)}x</span>
              </div>
              {/* Quaternion conversion formula selector */}
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#888' }}>Quat Conv:</span>
                <select
                  value={quatConv}
                  onChange={e => setQuatConv(e.target.value as QuatConversion)}
                  style={{
                    marginLeft: 6, fontSize: 11, background: '#1a1a2e',
                    color: '#ccc', border: '1px solid #444', borderRadius: 3, padding: '2px 4px',
                  }}
                >
                  {QUAT_CONVERSIONS.map(c => (
                    <option key={c.key} value={c.key}>
                      {c.label} - {c.desc}
                    </option>
                  ))}
                </select>
              </div>
              {/* Bones-only toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showBonesOnly}
                  onChange={e => setShowBonesOnly(e.target.checked)}
                />
                <span style={{ fontSize: 11, color: '#ff8' }}>Bones Only (dp positions)</span>
              </label>
            </div>

            {/* Frame controls */}
            {playingMotion && (
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #333' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => setPaused(p => !p)}
                    style={{
                      padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                      background: paused ? '#664400' : '#333', color: '#ccc',
                      border: '1px solid #555', borderRadius: 3,
                    }}
                  >
                    {paused ? '▶ Play' : '⏸ Pause'}
                  </button>
                  {paused && (
                    <>
                      <button
                        onClick={() => {
                          const clip = loadedClips[playingMotion!];
                          if (!clip || !applyFrameRef.current) return;
                          const prev = Math.max(0, currentFrame - 1);
                          setCurrentFrame(prev);
                          applyFrameRef.current(prev);
                        }}
                        style={{ padding: '2px 6px', fontSize: 11, cursor: 'pointer', background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 3 }}
                      >◀</button>
                      <button
                        onClick={() => {
                          const clip = loadedClips[playingMotion!];
                          if (!clip || !applyFrameRef.current) return;
                          const next = Math.min(clip.frameCount - 1, currentFrame + 1);
                          setCurrentFrame(next);
                          applyFrameRef.current(next);
                        }}
                        style={{ padding: '2px 6px', fontSize: 11, cursor: 'pointer', background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 3 }}
                      >▶</button>
                    </>
                  )}
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    Frame: {currentFrame} / {loadedClips[playingMotion!]?.frameCount ?? '?'}
                  </span>
                </div>
              </div>
            )}
            {/* Equipment toggles */}
            {equipParts.length > 0 && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>
                  Equipment {equipLoading && <span style={{ fontSize: 10, color: '#888' }}>(loading...)</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {equipParts.map(part => (
                    <label key={part.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
                      <input
                        type="checkbox"
                        checked={equipEnabled[part.key] ?? false}
                        onChange={e => {
                          setEquipEnabled(prev => ({ ...prev, [part.key]: e.target.checked }));
                        }}
                      />
                      <span style={{ color: equipEnabled[part.key] ? '#ccc' : '#666' }}>{part.key}</span>
                      <span style={{ fontSize: 9, color: '#555' }}>({part.voxels})</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    // Rebuild preview with new equipment
                    const scene = sceneRef.current;
                    if (!scene) return;
                    const { cx, cy } = centerRef.current;
                    // Stop current motion
                    if (animCallbackRef.current) {
                      scene.unregisterBeforeRender(animCallbackRef.current);
                      animCallbackRef.current = null;
                    }
                    const wasPlaying = playingMotion;
                    setPlayingMotion(null);

                    // Dispose old preview
                    for (const m of previewMeshesRef.current.values()) m.dispose();
                    for (const n of previewNodesRef.current.values()) n.dispose();
                    previewMeshesRef.current.clear();
                    previewNodesRef.current.clear();
                    for (const s of debugBonesRef.current.spheres) s.dispose();
                    if (debugBonesRef.current.lines) debugBonesRef.current.lines.dispose();
                    debugBonesRef.current = { spheres: [], lines: null };

                    // Load equipment and rebuild
                    const equipVoxels = await loadEquipmentVoxels();
                    const mergedVoxels = [...voxelsRef.current];
                    if (equipVoxels.length > 0) {
                      const bodySet = new Set<string>();
                      for (const v of mergedVoxels) bodySet.add(`${v.x},${v.y},${v.z}`);
                      for (const v of equipVoxels) {
                        const k = `${v.x},${v.y},${v.z}`;
                        if (bodySet.has(k)) {
                          const idx = mergedVoxels.findIndex(bv => bv.x === v.x && bv.y === v.y && bv.z === v.z);
                          if (idx >= 0) mergedVoxels[idx] = v;
                        } else {
                          mergedVoxels.push(v);
                        }
                      }
                    }

                    const { nodes, meshes } = buildSkeletalPreview(mergedVoxels, calculatedBones, scene, cx, cy);
                    previewNodesRef.current = nodes;
                    previewMeshesRef.current = meshes;

                    // Restart motion if was playing
                    if (wasPlaying && loadedClips[wasPlaying]) {
                      playMotionClip(loadedClips[wasPlaying]);
                    }
                  }}
                  style={{
                    marginTop: 6, padding: '4px 0', width: '100%', borderRadius: 3, cursor: 'pointer',
                    background: '#2a3a5e', color: '#aaf', border: '1px solid #446', fontSize: 11,
                  }}
                >
                  装備を反映
                </button>
              </div>
            )}

            {/* Bone info */}
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #333' }}>
              <span style={{ fontSize: 11, color: '#888' }}>
                {playingMotion ? 'モーション再生中 (41ボーン階層アニメーション)' : 'モーションを選択してください'}
              </span>
            </div>

            {/* Bone list (read-only status) */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: '6px 12px', fontSize: 11, color: '#666', borderBottom: '1px solid #222' }}>
                ボーン分割一覧 (41ボーン)
              </div>
              {BONE_DEFS.map(bone => {
                const hasMesh = previewMeshesRef.current.has(bone.name);
                const depth = getDepth(bone.name);
                return (
                  <div
                    key={bone.name}
                    style={{
                      padding: '3px 12px', paddingLeft: 12 + depth * 12,
                      fontSize: 10, color: hasMesh ? '#aaa' : '#555',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: bone.color, display: 'inline-block',
                      opacity: hasMesh ? 1 : 0.3,
                    }} />
                    <span>{bone.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Save / Back buttons */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid #333', display: 'flex', gap: 6 }}>
              <button
                onClick={exitPreview}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                  background: '#3a2a2a', color: '#ccc', border: '1px solid #555', fontSize: 12,
                }}
              >
                ← 戻る
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 4, cursor: 'pointer',
                  background: '#4a6', color: '#fff', border: '2px solid #5b7',
                  fontSize: 12, fontWeight: 'bold',
                }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

        {mode === 'edit' && (
          <>
            <div style={{
              position: 'absolute', top: 12, left: 12, padding: '6px 14px',
              background: 'rgba(50, 50, 140, 0.8)', borderRadius: 6, fontSize: 14, color: '#fff', fontWeight: 'bold',
            }}>
              {currentViewDef.label}
            </div>

            {dirty && (
              <div style={{
                position: 'absolute', top: 12, right: 12, padding: '4px 10px',
                background: 'rgba(255, 130, 50, 0.8)', borderRadius: 4, fontSize: 12, color: '#fff',
              }}>Unsaved changes</div>
            )}

            <div style={{
              position: 'absolute', bottom: 12, left: 12, padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.6)', borderRadius: 6, fontSize: 11, color: '#aaa',
            }}>
              <div>● マーカーをドラッグして配置</div>
              <div>マウスホイールでズーム</div>
              <div style={{ marginTop: 4, color: '#666' }}>
                {autoMirror
                  ? `左右対称 ON (center: X=${r1(mirrorCenterX)})`
                  : '左右対称 OFF (左右独立)'}
              </div>
            </div>
          </>
        )}

        {mode === 'preview' && (
          <>
            <div style={{
              position: 'absolute', top: 12, left: 12, padding: '6px 14px',
              background: 'rgba(80, 140, 50, 0.8)', borderRadius: 6, fontSize: 14, color: '#fff', fontWeight: 'bold',
            }}>
              Split Preview
              {playingMotion && (
                <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.8 }}>
                  {MOTION_FILES.find(p => p.name === playingMotion)?.label}
                </span>
              )}
            </div>
            <div style={{
              position: 'absolute', bottom: 12, left: 12, padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.6)', borderRadius: 6, fontSize: 11, color: '#aaa',
            }}>
              <div>マウスドラッグで回転、ホイールでズーム</div>
              <div style={{ marginTop: 4, color: '#888' }}>問題なければ「保存」、修正は「戻る」</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getDepth(boneName: string): number {
  let depth = 0;
  let current = BONE_DEFS.find(b => b.name === boneName);
  while (current?.parent) {
    depth++;
    current = BONE_DEFS.find(b => b.name === current!.parent);
  }
  return depth;
}
