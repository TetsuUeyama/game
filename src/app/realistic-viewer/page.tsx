'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
  Color4,
  Mesh,
  VertexData,
  StandardMaterial,
  MeshBuilder,
  Matrix,
} from '@babylonjs/core';

// ========================================================================
// VOX parser + mesh builder (same as vox-viewer2)
// ========================================================================

interface VoxModel {
  sizeX: number; sizeY: number; sizeZ: number;
  voxels: { x: number; y: number; z: number; colorIndex: number }[];
  palette: { r: number; g: number; b: number }[];
}

function parseVox(buf: ArrayBuffer): VoxModel {
  const view = new DataView(buf);
  let offset = 0;
  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  const readU8 = () => { const v = view.getUint8(offset); offset += 1; return v; };
  const readStr = (n: number) => {
    let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
    offset += n; return s;
  };
  if (readStr(4) !== 'VOX ') throw new Error('Not a VOX file');
  readU32();
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels: VoxModel['voxels'] = [];
  let palette: VoxModel['palette'] | null = null;
  const readChunks = (end: number) => {
    while (offset < end) {
      const id = readStr(4); const cs = readU32(); const ccs = readU32(); const ce = offset + cs;
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }
      else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), colorIndex: readU8() }); }
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const r = readU8(), g = readU8(), b = readU8(); readU8(); palette.push({ r: r / 255, g: g / 255, b: b / 255 }); } }
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };
  if (readStr(4) !== 'MAIN') throw new Error('Expected MAIN');
  const mc = readU32(); const mcc = readU32(); offset += mc;
  readChunks(offset + mcc);
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 }); }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_VERTS = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]],
];
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SCALE = 0.010;

function buildVoxMesh(model: VoxModel, scene: Scene, name: string, scale: number = SCALE): Mesh {
  const occupied = new Set<string>();
  for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const cx = model.sizeX / 2, cy = model.sizeY / 2;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const voxel of model.voxels) {
    const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      const bi = positions.length / 3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        const rx = (voxel.x + fv[vi][0] - cx) * scale;
        const ry = (voxel.y + fv[vi][1] - cy) * scale;
        const rz = (voxel.z + fv[vi][2]) * scale;
        positions.push(rx, rz, -ry);
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(col.r, col.g, col.b, 1);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh, true); // updatable = true for animation
  return mesh;
}

interface SegmentBundleData {
  grid: { gx: number; gy: number; gz: number };
  palette: number[][]; // [[r,g,b], ...] normalized 0-1
  segments: Record<string, number[]>; // boneName -> flat [x,y,z,ci, ...]
}

/** Build per-bone meshes from a single bundled segments file. No per-vertex animation needed — use mesh world matrix. */
function buildBundleMeshes(
  bundle: SegmentBundleData, scene: Scene, mat: StandardMaterial, scale: number
): Record<string, Mesh> {
  const cx = bundle.grid.gx / 2, cy = bundle.grid.gy / 2;
  const meshes: Record<string, Mesh> = {};

  for (const [boneName, flat] of Object.entries(bundle.segments)) {
    const numVoxels = flat.length / 4;
    if (numVoxels === 0) continue;

    // Build occupied set for face culling
    const occupied = new Set<string>();
    for (let i = 0; i < numVoxels; i++) {
      occupied.add(`${flat[i*4]},${flat[i*4+1]},${flat[i*4+2]}`);
    }

    const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let i = 0; i < numVoxels; i++) {
      const vx = flat[i*4], vy = flat[i*4+1], vz = flat[i*4+2], ci = flat[i*4+3];
      const col = bundle.palette[ci] ?? [0.8, 0.8, 0.8];
      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = FACE_DIRS[f];
        if (occupied.has(`${vx+dx},${vy+dy},${vz+dz}`)) continue;
        const bi = positions.length / 3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
        for (let vi = 0; vi < 4; vi++) {
          positions.push((vx + fv[vi][0] - cx) * scale, (vz + fv[vi][2]) * scale, -(vy + fv[vi][1] - cy) * scale);
          normals.push(fn[0], fn[2], -fn[1]);
          colors.push(col[0], col[1], col[2], 1);
        }
        indices.push(bi, bi+1, bi+2, bi, bi+2, bi+3);
      }
    }

    if (positions.length === 0) continue;
    const vd = new VertexData();
    vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
    const mesh = new Mesh(`seg_${boneName}`, scene);
    vd.applyToMesh(mesh, false); // not updatable — we use world matrix for animation
    mesh.material = mat;
    meshes[boneName] = mesh;
  }

  return meshes;
}

const CACHE_BUST = `?v=${Date.now()}`;

async function loadVoxMesh(scene: Scene, url: string, name: string, scale: number = SCALE): Promise<Mesh> {
  const resp = await fetch(url + CACHE_BUST);
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  const model = parseVox(await resp.arrayBuffer());
  return buildVoxMesh(model, scene, name, scale);
}

// ========================================================================
// Part manifest type & character config
// ========================================================================

interface PartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
  meshes: string[];
  is_body: boolean;
  category?: string;
}

interface GridInfo {
  voxel_size: number;
  gx: number;
  gy: number;
  gz: number;
}

type CharCategory = 'female' | 'male' | 'base' | 'weapons';

interface CharacterConfig {
  label: string;
  manifest: string;
  gridJson: string;
  gender: 'female' | 'male';
  category: CharCategory;
}

interface HairOption {
  label: string;
  charKey: string;
  file: string;        // full API path to .vox
  partKey: string;      // original part key in parts.json
  voxels: number;
  anchorsUrl: string;   // URL to hair_anchors.json
}

interface AnchorPoints {
  top: number[];
  front: number[];
  back: number[];
  left: number[];
  right: number[];
  width: number;
  depth: number;
}

interface HairAnchorsData {
  voxel_size: number;
  body_head?: AnchorPoints;
  hairs?: Record<string, AnchorPoints>;
}

interface MotionData {
  fps: number;
  frame_count: number;
  babylonFormat?: boolean; // true if matrices are already in Babylon.js format (no transpose needed)
  bones: Record<string, {
    matrices: number[][];  // flat 16-element skinning matrices per frame
  }>;
}

/** Raw motion data from Blender (no coordinate conversion applied) */
interface RawMotionData {
  format: 'blender_raw';
  fps: number;
  frame_count: number;
  bind_pose_rest: Record<string, number[]>;  // bone.matrix_local world-space, row-major
  bind_pose_eval: Record<string, number[]>;  // evaluated pose, row-major
  animated: Record<string, { matrices: number[][] }>; // per-frame world-space, row-major
}

/**
 * Convert Blender row-major (column-vector convention) 16-element array
 * to Babylon.js Matrix (row-vector convention).
 * Blender: M*v, translation at m[3],m[7],m[11]
 * Babylon: v*M, translation at m[12],m[13],m[14]
 * → Transpose is needed.
 */
function blenderToBabylonMatrix(m: number[]): Matrix {
  return Matrix.FromArray([
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ]);
}

/**
 * Coordinate conversion: Blender Z-up right-hand → Babylon Y-up left-hand
 * Blender (x,y,z) → Babylon (x,z,-y)
 * As a Babylon.js Matrix (already in Babylon convention).
 */
const COORD_BLENDER_TO_VIEWER = Matrix.FromArray([
  1,  0,  0,  0,
  0,  0, -1,  0,
  0,  1,  0,  0,
  0,  0,  0,  1,
]);

/**
 * Process raw Blender motion data into Babylon.js-ready matrices.
 * For each bone per frame:
 *   skinMat = animated_world × bind_rest_inverse  (in Blender space)
 *   viewerMat = C × skinMat × C_inv               (convert to viewer space)
 * All computed using Babylon.js Matrix API for consistent convention handling.
 */
function processRawMotionData(raw: RawMotionData): MotionData {
  const coordInv = COORD_BLENDER_TO_VIEWER.clone();
  coordInv.invert();

  // Per-bone bind pose selection: use evaluated pose (IK/FK applied) when it differs
  // significantly from rest pose, indicating IK was active for that bone.
  // Voxel meshes are extracted from the evaluated pose, so affected bones must use eval.
  const hasEval = raw.bind_pose_eval && Object.keys(raw.bind_pose_eval).length > 0;
  const bindInvCache: Record<string, Matrix> = {};
  for (const [name, restMat] of Object.entries(raw.bind_pose_rest)) {
    let useMat = restMat;
    if (hasEval && raw.bind_pose_eval[name]) {
      const evalMat = raw.bind_pose_eval[name];
      // Check if eval differs from rest (IK active for this bone)
      let diff = 0;
      for (let i = 0; i < 16; i++) diff += Math.abs(restMat[i] - evalMat[i]);
      if (diff > 0.01) useMat = evalMat;
    }
    const bjsMat = blenderToBabylonMatrix(useMat);
    const inv = new Matrix();
    bjsMat.invertToRef(inv);
    bindInvCache[name] = inv;
  }

  const bones: MotionData['bones'] = {};

  for (const [boneName, animData] of Object.entries(raw.animated)) {
    const bindInv = bindInvCache[boneName];
    if (!bindInv) continue;

    const matrices: number[][] = [];
    for (const frameMat of animData.matrices) {
      const animBjs = blenderToBabylonMatrix(frameMat);

      // Babylon row-vector: v * bindInv * anim = v * (bindInv * anim) ???
      // NO. We want: skinMat = anim × bind_inv (Blender column-vector convention)
      // In Babylon row-vector: this is bind_inv.multiply(anim)
      // Because Blender A*B = Babylon B.multiply(A)
      const skinBjs = bindInv.multiply(animBjs);

      // Convert to viewer space: C × skin × C_inv
      // Blender: C * skin * C_inv
      // Babylon: C_inv.multiply(skin).multiply(C)
      // Wait... let me think step by step.
      // Blender column-vector: v_viewer = C * skin * C_inv * v_viewer_input
      // Babylon row-vector: v_viewer_input * M = v_viewer
      // M = transpose(C * skin * C_inv)
      // But we already have skin in Babylon format (transposed from Blender).
      // C is also in Babylon format. So:
      // M_bjs = C_inv_bjs * skin_bjs * C_bjs
      // Let me verify: Blender C*skin*C_inv → transpose → (C*skin*C_inv)^T = C_inv^T * skin^T * C^T
      // Since we already transposed skin to get skin_bjs, and C/C_inv are also transposed...
      // Actually C_inv_bjs = transpose(C_inv_blender). But COORD_BLENDER_TO_VIEWER was defined directly
      // in Babylon format. So it's already correct.

      const viewerMat = coordInv.multiply(skinBjs).multiply(COORD_BLENDER_TO_VIEWER);

      // Store as flat array for the animation loop
      matrices.push(Array.from(viewerMat.asArray()));
    }
    bones[boneName] = { matrices };
  }

  return { fps: raw.fps, frame_count: raw.frame_count, babylonFormat: true, bones };
}

interface JointSphereConfig {
  position_voxel: number[];
  bone: string;
  radius_voxels: number | number[];
  shape: 'sphere' | 'ellipsoid';
  color: { r: number; g: number; b: number };
}

interface SegmentsData {
  voxel_size: number;
  grid: { gx: number; gy: number; gz: number };
  bb_min?: number[];
  bb_max?: number[];
  bone_positions: Record<string, {
    head_voxel: number[];
    tail_voxel: number[];
  }>;
  segments: Record<string, { file: string; voxels: number }>;
  joint_spheres?: Record<string, JointSphereConfig>;
}

// ========================================================================
// Bone hierarchy for joint correction
// ========================================================================

interface BoneHierarchyEntry {
  bone: string;
  parent: string | null;
  jointPoint: number[]; // head point in viewer space [x, y, z]
}

/** Build bone processing order (root→leaf) with parent info and joint points.
 *  Only considers bones that have actual segments (voxel meshes).
 *  Uses exact tail→head matching first, then proximity matching for orphans. */
function buildBoneHierarchy(segData: SegmentsData): BoneHierarchyEntry[] {
  const bp = segData.bone_positions;
  const grid = segData.grid;
  const cx = grid.gx / 2, cy = grid.gy / 2;
  const scale = segData.voxel_size;
  const segmentBones = new Set(Object.keys(segData.segments));

  // Build segment name → bone_positions key mapping
  // Segment names may be normalized (c_thigh_stretch.l) while bone_positions uses raw names (thigh_stretch.l)
  const bpKeys = new Set(Object.keys(bp));
  const segToBpName: Record<string, string> = {};
  for (const seg of segmentBones) {
    if (bpKeys.has(seg)) { segToBpName[seg] = seg; continue; }
    // Try dropping c_ prefix
    let alt = seg.replace(/^c_/, '');
    if (bpKeys.has(alt)) { segToBpName[seg] = alt; continue; }
    // Try dropping c_ prefix and _bend suffix
    alt = seg.replace(/^c_/, '').replace(/_bend/, '');
    if (bpKeys.has(alt)) { segToBpName[seg] = alt; continue; }
  }
  // Helper to get bone position by segment name
  const getBp = (seg: string) => bp[segToBpName[seg]];

  const tailMap = new Map<string, string>();
  for (const name of segmentBones) {
    const pos = getBp(name);
    if (!pos) continue;
    const t = pos.tail_voxel;
    tailMap.set(`${t[0]},${t[1]},${t[2]}`, name);
  }

  const parentOf: Record<string, string | null> = {};
  const children: Record<string, string[]> = {};
  for (const name of segmentBones) { parentOf[name] = null; children[name] = []; }
  for (const name of segmentBones) {
    const pos = getBp(name); if (!pos) continue;
    const h = pos.head_voxel;
    const parentName = tailMap.get(`${h[0]},${h[1]},${h[2]}`);
    if (parentName && parentName !== name) { parentOf[name] = parentName; children[parentName].push(name); }
  }

  // Proximity match for orphans
  const THRESHOLD = 20;
  const isAncestor = (bone: string, ancestor: string): boolean => {
    let cur = bone; const visited = new Set<string>();
    while (cur) { if (visited.has(cur)) return false; if (cur === ancestor) return true; visited.add(cur); cur = parentOf[cur]!; }
    return false;
  };
  for (let round = 0; round < 10; round++) {
    const orphanSet = new Set([...segmentBones].filter(n => !parentOf[n] && getBp(n)));
    if (orphanSet.size === 0) break;
    const inTree = new Set<string>();
    for (const n of segmentBones) { if (parentOf[n] || children[n].length > 0) inTree.add(n); }
    let attached = 0;
    for (const name of orphanSet) {
      const h = getBp(name)!.head_voxel;
      let bestParent: string | null = null, bestDist = THRESHOLD;
      for (const candidate of segmentBones) {
        if (candidate === name || !inTree.has(candidate) || isAncestor(candidate, name)) continue;
        const cPos = getBp(candidate);
        if (!cPos) continue;
        const t = cPos.tail_voxel;
        const d = Math.sqrt((t[0] - h[0]) ** 2 + (t[1] - h[1]) ** 2 + (t[2] - h[2]) ** 2);
        if (d < bestDist) { bestDist = d; bestParent = candidate; }
      }
      if (bestParent) { parentOf[name] = bestParent; children[bestParent].push(name); attached++; }
    }
    if (attached === 0) break;
  }

  const roots = [...segmentBones].filter(n => !parentOf[n]);
  const order: BoneHierarchyEntry[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const bone = queue.shift()!;
    const pos = getBp(bone); if (!pos) continue;
    const h = pos.head_voxel;
    order.push({ bone, parent: parentOf[bone], jointPoint: [(h[0] - cx) * scale, h[2] * scale, -(h[1] - cy) * scale] });
    for (const child of children[bone]) queue.push(child);
  }
  return order;
}

/**
 * Resolve segment bone name to motion bone name.
 * ARP rigs use different naming between control bones (segments) and deform bones (motion):
 *   c_arm_stretch.l → arm_stretch.l  (drop c_ prefix)
 *   c_spine_01_bend.x → spine_01.x   (drop c_ prefix and _bend suffix)
 */
function resolveMotionBoneName(segName: string, motionBones: Set<string>): string | null {
  if (motionBones.has(segName)) return segName;
  // Drop c_ prefix
  let alt = segName.replace(/^c_/, '');
  if (motionBones.has(alt)) return alt;
  // Drop c_ prefix and _bend suffix
  alt = segName.replace(/^c_/, '').replace(/_bend/, '');
  if (motionBones.has(alt)) return alt;
  return null;
}

/** Apply a row-major column-vector 4x4 matrix to a 3D point (Blender convention) */
function applyMatPointBlender(m: number[], p: number[]): number[] {
  return [
    p[0] * m[0] + p[1] * m[1] + p[2] * m[2] + m[3],
    p[0] * m[4] + p[1] * m[5] + p[2] * m[6] + m[7],
    p[0] * m[8] + p[1] * m[9] + p[2] * m[10] + m[11],
  ];
}

/** Apply a Babylon.js format (row-vector) 4x4 matrix to a 3D point */
function applyMatPointBabylon(m: number[], p: number[]): number[] {
  return [
    p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],
    p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],
    p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14],
  ];
}

const GAME_ASSETS_API = '/api/game-assets';
const VOX_API = '/api/vox';

const CHARACTERS: Record<string, CharacterConfig> = {
  // ---- Base Body (single model, all motions compatible) ----
  base_female: { label: 'Base Female (CyberpunkElf)', manifest: `${VOX_API}/female/CyberpunkElf-Detailed/parts.json`, gridJson: `${VOX_API}/female/CyberpunkElf-Detailed/grid.json`, gender: 'female', category: 'base' },
  base_bunnyakali: { label: 'Base Female (BunnyAkali)', manifest: `${VOX_API}/female/BunnyAkali-Base/parts.json`, gridJson: `${VOX_API}/female/BunnyAkali-Base/grid.json`, gender: 'female', category: 'base' },
  base_darkelfblader: { label: 'Base Female (DarkElfBlader)', manifest: `${VOX_API}/female/DarkElfBlader-Base/parts.json`, gridJson: `${VOX_API}/female/DarkElfBlader-Base/grid.json`, gender: 'female', category: 'base' },
  // ---- Female ----
  cyberpunkelf: { label: 'CyberpunkElf', manifest: `${VOX_API}/female/realistic/parts.json`, gridJson: `${VOX_API}/female/realistic/grid.json`, gender: 'female', category: 'female' },
  darkelfblader: { label: 'DarkElfBlader', manifest: `${VOX_API}/female/realistic-darkelf/parts.json`, gridJson: `${VOX_API}/female/realistic-darkelf/grid.json`, gender: 'female', category: 'female' },
  highpriestess: { label: 'HighPriestess', manifest: `${VOX_API}/female/realistic-highpriestess/parts.json`, gridJson: `${VOX_API}/female/realistic-highpriestess/grid.json`, gender: 'female', category: 'female' },
  pillarwoman: { label: 'PillarWoman', manifest: `${VOX_API}/female/realistic-pillarwoman/parts.json`, gridJson: `${VOX_API}/female/realistic-pillarwoman/grid.json`, gender: 'female', category: 'female' },
  bunnyirelia: { label: 'BunnyIrelia', manifest: `${VOX_API}/female/realistic-bunnyirelia/parts.json`, gridJson: `${VOX_API}/female/realistic-bunnyirelia/grid.json`, gender: 'female', category: 'female' },
  daemongirl: { label: 'DaemonGirl', manifest: `${VOX_API}/female/realistic-daemongirl/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl/grid.json`, gender: 'female', category: 'female' },
  daemongirl_default: { label: 'DaemonGirl Default', manifest: `${VOX_API}/female/realistic-daemongirl-default/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-default/grid.json`, gender: 'female', category: 'female' },
  daemongirl_bunny: { label: 'DaemonGirl Bunny', manifest: `${VOX_API}/female/realistic-daemongirl-bunny/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-bunny/grid.json`, gender: 'female', category: 'female' },
  daemongirl_bunnysuit: { label: 'DaemonGirl BunnySuit', manifest: `${VOX_API}/female/realistic-daemongirl-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  daemongirl_ponytail: { label: 'DaemonGirl Ponytail', manifest: `${VOX_API}/female/realistic-daemongirl-ponytail/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-ponytail/grid.json`, gender: 'female', category: 'female' },
  primrose_egypt: { label: 'Primrose Egypt', manifest: `${VOX_API}/female/realistic-primrose-egypt/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-egypt/grid.json`, gender: 'female', category: 'female' },
  primrose_officelady: { label: 'Primrose OfficeLady', manifest: `${VOX_API}/female/realistic-primrose-officelady/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-officelady/grid.json`, gender: 'female', category: 'female' },
  primrose_bunnysuit: { label: 'Primrose Bunnysuit', manifest: `${VOX_API}/female/realistic-primrose-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  primrose_swimsuit: { label: 'Primrose Swimsuit', manifest: `${VOX_API}/female/realistic-primrose-swimsuit/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-swimsuit/grid.json`, gender: 'female', category: 'female' },
  primrose_milkapron: { label: 'Primrose MilkApron', manifest: `${VOX_API}/female/realistic-primrose-milkapron/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-milkapron/grid.json`, gender: 'female', category: 'female' },
  queenmarika_default: { label: 'QueenMarika Default', manifest: `${VOX_API}/female/realistic-queenmarika-default/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-default/grid.json`, gender: 'female', category: 'female' },
  queenmarika_goldenbikini: { label: 'QueenMarika GoldenBikini', manifest: `${VOX_API}/female/realistic-queenmarika-goldenbikini/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-goldenbikini/grid.json`, gender: 'female', category: 'female' },
  bunnyakali: { label: 'BunnyAkali', manifest: `${VOX_API}/female/realistic-bunnyakali/parts.json`, gridJson: `${VOX_API}/female/realistic-bunnyakali/grid.json`, gender: 'female', category: 'female' },
  artorialancer_default: { label: 'ArtoriaLancer Default', manifest: `${VOX_API}/female/realistic-artorialancer-default/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-default/grid.json`, gender: 'female', category: 'female' },
  artorialancer_alter: { label: 'ArtoriaLancer Alter', manifest: `${VOX_API}/female/realistic-artorialancer-alter/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-alter/grid.json`, gender: 'female', category: 'female' },
  artorialancer_bunnysuit: { label: 'ArtoriaLancer BunnySuit', manifest: `${VOX_API}/female/realistic-artorialancer-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  elfpaladin: { label: 'ElfPaladin', manifest: `${VOX_API}/female/realistic-elfpaladin/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin/grid.json`, gender: 'female', category: 'female' },
  // ---- Male ----
  radagon: { label: 'Radagon', manifest: `${VOX_API}/male/realistic-radagon/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon/grid.json`, gender: 'male', category: 'male' },
  vagrant: { label: 'Vagrant', manifest: `${VOX_API}/male/realistic-vagrant/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite: { label: 'SpartanHoplite', manifest: `${VOX_API}/male/realistic-spartanhoplite/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite/grid.json`, gender: 'male', category: 'male' },
  radagon_tall: { label: 'Radagon (Tall)', manifest: `${VOX_API}/male/realistic-radagon-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-tall/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite_tall: { label: 'SpartanHoplite (Tall)', manifest: `${VOX_API}/male/realistic-spartanhoplite-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-tall/grid.json`, gender: 'male', category: 'male' },
  vagrant_tall: { label: 'Vagrant (Tall)', manifest: `${VOX_API}/male/realistic-vagrant-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant-tall/grid.json`, gender: 'male', category: 'male' },
  dido: { label: 'Dido (MaleSmall2)', manifest: `${VOX_API}/male/realistic-dido/parts.json`, gridJson: `${VOX_API}/male/realistic-dido/grid.json`, gender: 'male', category: 'male' },
  // ---- Weapons ----
  artorialancer_weapons: { label: 'ArtoriaLancer Weapons', manifest: `${VOX_API}/female/realistic-artorialancer-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-weapons/grid.json`, gender: 'female', category: 'weapons' },
  elfpaladin_weapons: { label: 'ElfPaladin Weapons', manifest: `${VOX_API}/female/realistic-elfpaladin-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin-weapons/grid.json`, gender: 'female', category: 'weapons' },
  radagon_weapons: { label: 'Radagon Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_weapons: { label: 'SpartanHoplite Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons/grid.json`, gender: 'male', category: 'weapons' },
  radagon_tall_weapons: { label: 'Radagon (Tall) Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_tall_weapons: { label: 'SpartanHoplite (Tall) Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
};

// ========================================================================
// Component
// ========================================================================

export default function RealisticViewerWrapper() {
  return (
    <Suspense fallback={<div style={{ background: '#12121f', width: '100vw', height: '100vh' }} />}>
      <RealisticViewerPage />
    </Suspense>
  );
}

function RealisticViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const bodyMatRef = useRef<StandardMaterial | null>(null);
  const partMatRef = useRef<StandardMaterial | null>(null);

  const meshesRef = useRef<Record<string, Mesh>>({});

  const [selectedCategory, setSelectedCategory] = useState<CharCategory>('base');
  const [charKey, setCharKey] = useState('base_female');
  const [parts, setParts] = useState<PartEntry[]>([]);
  const [partVisibility, setPartVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hair swap state
  const [hairOptions, setHairOptions] = useState<HairOption[]>([]);
  const [selectedHair, setSelectedHair] = useState<string>(''); // "charKey::partKey" or '' for default
  const [hairLoading, setHairLoading] = useState(false);

  // Animation state
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animReady, setAnimReady] = useState(false);
  const [selectedMotion, setSelectedMotion] = useState('');
  const [selectedMotionB, setSelectedMotionB] = useState('');
  const [blendDuration, setBlendDuration] = useState(30); // frames for crossfade
  const motionDataRef = useRef<MotionData | null>(null);
  const motionDataBRef = useRef<MotionData | null>(null);
  const segmentsDataRef = useRef<SegmentsData | null>(null);
  const boneHierarchyRef = useRef<BoneHierarchyEntry[]>([]);
  const animFrameRef = useRef(0);
  const frameDisplayRef = useRef<HTMLSpanElement>(null);
  // restVoxelsRef removed — using freezeWorldMatrix for animation
  const [hairSizeDiff, setHairSizeDiff] = useState<string>('');
  const voxelScaleRef = useRef<number>(SCALE);
  const jointBonesRef = useRef<Record<string, [string, string]>>({}); // jointKey -> [boneA, boneB]
  const bodyAnchorsRef = useRef<AnchorPoints | null>(null);

  // Toggle individual part
  const togglePart = useCallback((key: string) => {
    setPartVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const mesh = meshesRef.current[key];
      if (mesh) mesh.setEnabled(next[key]);
      return next;
    });
  }, []);

  // Toggle all parts
  const toggleAll = useCallback((on: boolean) => {
    setPartVisibility(prev => {
      const next: Record<string, boolean> = {};
      for (const key in prev) {
        next[key] = on;
        const mesh = meshesRef.current[key];
        if (mesh) mesh.setEnabled(on);
      }
      return next;
    });
  }, []);

  // Toggle body only / parts only
  const toggleCategory = useCallback((isBody: boolean, on: boolean) => {
    setPartVisibility(prev => {
      const next = { ...prev };
      for (const p of parts) {
        if (p.is_body === isBody) {
          next[p.key] = on;
          const mesh = meshesRef.current[p.key];
          if (mesh) mesh.setEnabled(on);
        }
      }
      return next;
    });
  }, [parts]);

  // Collect hair options from all same-gender characters
  useEffect(() => {
    const currentGender = CHARACTERS[charKey]?.gender;
    if (!currentGender) return;
    let cancelled = false;

    (async () => {
      const sameGenderChars = Object.entries(CHARACTERS).filter(
        ([, cfg]) => cfg.gender === currentGender
      );

      const options: HairOption[] = [];
      await Promise.all(
        sameGenderChars.map(async ([ck, cfg]) => {
          try {
            const resp = await fetch(cfg.manifest + CACHE_BUST);
            if (!resp.ok) return;
            const allParts: PartEntry[] = await resp.json();
            const manifestPath = cfg.manifest.replace(VOX_API + '/', '');
            const genderPrefix = manifestPath.split('/')[0];
            const hairParts = allParts.filter(
              p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body)
            );
            // Build anchors URL from manifest path
            const charFolder = manifestPath.split('/').slice(0, -1).join('/');
            const anchorsUrl = `${VOX_API}/${charFolder}/hair_anchors.json`;
            for (const hp of hairParts) {
              const fullFile = hp.file.startsWith(VOX_API)
                ? hp.file
                : `${VOX_API}/${genderPrefix}${hp.file}`;
              options.push({
                label: `${cfg.label} - ${hp.meshes[0] || hp.key}`,
                charKey: ck,
                file: fullFile,
                partKey: hp.key,
                voxels: hp.voxels,
                anchorsUrl,
              });
            }
          } catch {
            // skip characters whose manifest can't be loaded
          }
        })
      );

      if (!cancelled) {
        options.sort((a, b) => a.label.localeCompare(b.label));
        setHairOptions(options);
      }
    })();

    return () => { cancelled = true; };
  }, [charKey]);

  // Swap hair: dispose current hair meshes, load selected one, align via anchors
  const swapHair = useCallback(async (hairId: string) => {
    const scene = sceneRef.current;
    const partMat = partMatRef.current;
    if (!scene || !partMat) return;

    setSelectedHair(hairId);
    setHairSizeDiff('');

    // Find all current hair part keys and dispose
    const hairPartKeys = parts
      .filter(p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
      .map(p => p.key);
    for (const hk of hairPartKeys) {
      const mesh = meshesRef.current[hk];
      if (mesh) { mesh.dispose(); delete meshesRef.current[hk]; }
    }

    if (hairId === '') {
      // Reload original hair from current character
      const config = CHARACTERS[charKey];
      if (!config) return;
      setHairLoading(true);
      try {
        const resp = await fetch(config.manifest + CACHE_BUST);
        if (!resp.ok) return;
        const allParts: PartEntry[] = await resp.json();
        const manifestPath = config.manifest.replace(VOX_API + '/', '');
        const genderPrefix = manifestPath.split('/')[0];
        for (const hp of allParts) {
          if (!(hp.category === 'hair' || (hp.key.includes('hair') && hp.key !== 'body_hair' && !hp.is_body))) continue;
          const fullFile = hp.file.startsWith(VOX_API) ? hp.file : `${VOX_API}/${genderPrefix}${hp.file}`;
          try {
            const mesh = await loadVoxMesh(scene, fullFile, `part_${hp.key}`, voxelScaleRef.current);
            mesh.material = partMat;
            mesh.setEnabled(true);
            meshesRef.current[hp.key] = mesh;
            setPartVisibility(prev => ({ ...prev, [hp.key]: true }));
          } catch (e) {
            console.error(`Failed to reload hair ${fullFile}:`, e);
          }
        }
      } finally {
        setHairLoading(false);
      }
      return;
    }

    // Load the selected hair with anchor-based alignment
    const option = hairOptions.find(o => `${o.charKey}::${o.partKey}` === hairId);
    if (!option) return;

    setHairLoading(true);
    try {
      // Load source character's anchors (single fetch)
      let sourceHairAnchors: AnchorPoints | null = null;
      let sourceBodyAnchors: AnchorPoints | null = null;
      let sourceVoxelSize = voxelScaleRef.current;
      try {
        const anchResp = await fetch(option.anchorsUrl + CACHE_BUST);
        if (anchResp.ok) {
          const anchData: HairAnchorsData = await anchResp.json();
          sourceHairAnchors = anchData.hairs?.[option.partKey] ?? null;
          sourceBodyAnchors = anchData.body_head ?? null;
          sourceVoxelSize = anchData.voxel_size;
        }
      } catch { /* no anchors available, fall back to current char's scale */ }

      const targetBodyAnchors = bodyAnchorsRef.current;
      const swapKey = `swapped_hair_${option.partKey}`;

      const mesh = await loadVoxMesh(scene, option.file, `part_${swapKey}`, sourceVoxelSize);
      mesh.material = partMat;

      // Apply anchor-based alignment
      if (targetBodyAnchors && sourceHairAnchors) {
        // Scale: based on target body head size vs source body head size
        // If source has no body_head (standalone hair), use target as reference (scale=1.0)
        const srcBody = sourceBodyAnchors || targetBodyAnchors;
        const scaleW = targetBodyAnchors.width / srcBody.width;
        const scaleD = targetBodyAnchors.depth / srcBody.depth;
        const uniformScale = (scaleW + scaleD) / 2;

        mesh.scaling = new Vector3(uniformScale, uniformScale, uniformScale);

        // Position offset: align hair contact top to target body head top
        const offsetX = targetBodyAnchors.top[0] - sourceHairAnchors.top[0] * uniformScale;
        const offsetY = targetBodyAnchors.top[1] - sourceHairAnchors.top[1] * uniformScale + 2 * sourceVoxelSize;
        const offsetZ = targetBodyAnchors.top[2] - sourceHairAnchors.top[2] * uniformScale - 2 * sourceVoxelSize;
        mesh.position = new Vector3(offsetX, offsetY, offsetZ);

        // Show size difference info
        const pctDiff = Math.round((uniformScale - 1) * 100);
        setHairSizeDiff(pctDiff === 0 ? '' : `${pctDiff > 0 ? '+' : ''}${pctDiff}%`);
      } else {
        // No anchors: no transform
        mesh.position = Vector3.Zero();
      }

      mesh.setEnabled(true);
      meshesRef.current[swapKey] = mesh;
      setPartVisibility(prev => ({ ...prev, [swapKey]: true }));

      setParts(prev => {
        const nonHair = prev.filter(
          p => !(p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
        );
        return [...nonHair, {
          key: swapKey,
          file: option.file,
          voxels: option.voxels,
          default_on: true,
          meshes: [option.label],
          is_body: false,
          category: 'hair',
        }];
      });
    } catch (e) {
      console.error(`Failed to load swapped hair:`, e);
    } finally {
      setHairLoading(false);
    }
  }, [parts, charKey, hairOptions]);

  // Initialize scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, false, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.06, 0.06, 0.10, 1);

    const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0, new Vector3(0, 0.8, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3;
    camera.upperRadiusLimit = 15;
    camera.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);

    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10, subdivisions: 10 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    gm.freeze();
    ground.material = gm;
    ground.freezeWorldMatrix();

    // Body material
    const bodyMat = new StandardMaterial('bodyMat', scene);
    bodyMat.emissiveColor = Color3.White();
    bodyMat.disableLighting = true;
    bodyMat.backFaceCulling = false;
    bodyMat.freeze();
    bodyMatRef.current = bodyMat;

    // Part material (renders on top of body)
    const partMat = new StandardMaterial('partMat', scene);
    partMat.emissiveColor = Color3.White();
    partMat.disableLighting = true;
    partMat.backFaceCulling = false;
    partMat.zOffset = -2;
    partMat.freeze();
    partMatRef.current = partMat;

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load character parts when charKey changes
  useEffect(() => {
    const scene = sceneRef.current;
    const bodyMat = bodyMatRef.current;
    const partMat = partMatRef.current;
    if (!scene || !bodyMat || !partMat) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSelectedHair('');
      setHairSizeDiff('');
      bodyAnchorsRef.current = null;

      // Dispose old meshes
      for (const mesh of Object.values(meshesRef.current)) {
        mesh.dispose();
      }
      meshesRef.current = {};

      const config = CHARACTERS[charKey];
      if (!config) {
        setError(`Unknown character: ${charKey}`);
        setLoading(false);
        return;
      }

      try {
        // Load grid.json to get voxel_size for correct physical scale
        const gridResp = await fetch(config.gridJson + CACHE_BUST);
        let voxelScale = SCALE;
        if (gridResp.ok) {
          const grid: GridInfo = await gridResp.json();
          voxelScale = grid.voxel_size;
        }
        voxelScaleRef.current = voxelScale;

        const manifestPath = config.manifest.replace(VOX_API + '/', '');
        const genderPrefix = manifestPath.split('/')[0];
        const charFolder = manifestPath.split('/').slice(0, -1).join('/');

        // Try bundle-based loading first (single file, much faster)
        const bundleUrl = `${VOX_API}/${charFolder}/segments_bundle.json`;
        const bundleResp = await fetch(bundleUrl + CACHE_BUST);

        if (bundleResp.ok && config.category === 'base') {
          // Fast path: single bundled file
          const bundle: SegmentBundleData = await bundleResp.json();
          if (cancelled) return;

          const builtMeshes = buildBundleMeshes(bundle, scene, bodyMat, voxelScale);
          const vis: Record<string, boolean> = {};
          const partEntries: PartEntry[] = [];
          for (const boneName of Object.keys(builtMeshes)) {
            meshesRef.current[boneName] = builtMeshes[boneName];
            vis[boneName] = true;
            partEntries.push({ key: boneName, file: '', voxels: 0, default_on: true, meshes: [boneName], is_body: true });
          }
          setParts(partEntries);
          setPartVisibility(vis);
          jointBonesRef.current = {};
        } else {
          // Fallback: individual .vox file loading (non-base characters)
          const resp = await fetch(config.manifest + CACHE_BUST);
          if (!resp.ok) {
            setError(`${config.label}: parts.json not found.`);
            setLoading(false);
            return;
          }
          const allParts: PartEntry[] = await resp.json();
          if (cancelled) return;
          for (const p of allParts) {
            if (!p.file.startsWith(VOX_API)) {
              p.file = `${VOX_API}/${genderPrefix}${p.file}`;
            }
          }
          setParts(allParts);

          const vis: Record<string, boolean> = {};
          const jointBonesMap: Record<string, [string, string]> = {};
          for (const part of allParts) {
            vis[part.key] = part.default_on;
            const partAnyJ = part as unknown as Record<string, unknown>;
            if (partAnyJ.joint_bones && Array.isArray(partAnyJ.joint_bones)) {
              jointBonesMap[part.key] = partAnyJ.joint_bones as [string, string];
            }
          }

          const meshResults = await Promise.all(
            allParts.map(async (part) => {
              try {
                return { part, mesh: await loadVoxMesh(scene, part.file, `part_${part.key}`, voxelScale) };
              } catch { return null; }
            })
          );
          if (cancelled) { for (const r of meshResults) if (r) r.mesh.dispose(); return; }
          for (const r of meshResults) {
            if (!r) continue;
            r.mesh.material = (r.part.is_body && r.part.key !== 'eyes') ? bodyMat : partMat;
            r.mesh.setEnabled(vis[r.part.key] ?? true);
            meshesRef.current[r.part.key] = r.mesh;
          }
          setPartVisibility(vis);
          jointBonesRef.current = jointBonesMap;
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('Failed to load parts manifest');
          setLoading(false);
          console.error(e);
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey]);

  // Load animation data for BasicBody / Split characters
  useEffect(() => {
    if (CHARACTERS[charKey]?.category !== 'base') return;
    const config = CHARACTERS[charKey];
    if (!config) return;
    // Extract folder name from manifest path: /api/vox/<gender>/<folderName>/...
    const manifestPath = config.manifest.replace(VOX_API + '/', '');
    const pathParts = manifestPath.split('/');
    const gender = pathParts[0];
    const folderName = pathParts[1]; // BasicBodyFemale, BasicBodyMale-Vagrant, etc.

    // Default motion per model
    const defaultMotion: Record<string, string> = {
      'CyberpunkElf-Detailed': 'walk_cycle_arp.motion.json',
      'BunnyAkali-Base': 'bunnyakali_cozywinter.motion.json',
      'DarkElfBlader-Base': 'darkelfblader_titsuck.motion.json',
    };
    const motionFile = selectedMotion || defaultMotion[folderName] || 'walk_cycle_arp.motion.json';

    (async () => {
      try {
        // Load segments.json (bone positions)
        const segResp = await fetch(`${VOX_API}/${gender}/${folderName}/segments.json${CACHE_BUST}`);
        if (segResp.ok) {
          const segData: SegmentsData = await segResp.json();
          segmentsDataRef.current = segData;
          boneHierarchyRef.current = buildBoneHierarchy(segData);
        }
        // Load selected motion
        const motionResp = await fetch(`${GAME_ASSETS_API}/motion/${motionFile}${CACHE_BUST}`);
        if (motionResp.ok) {
          const motionJson = await motionResp.json();
          if (motionJson.format === 'blender_raw') {
            motionDataRef.current = processRawMotionData(motionJson as RawMotionData);
          } else {
            motionDataRef.current = motionJson;
          }
          setAnimReady(true);
        }
      } catch (e) {
        console.error('Failed to load animation data:', e);
      }
    })();

    return () => {
      motionDataRef.current = null;
      segmentsDataRef.current = null;
      boneHierarchyRef.current = [];
      setAnimPlaying(false);
      setAnimReady(false);
    };
  }, [charKey, selectedMotion]);

  // Load Motion B for blending
  useEffect(() => {
    if (!selectedMotionB || CHARACTERS[charKey]?.category !== 'base') {
      motionDataBRef.current = null;
      return;
    }
    (async () => {
      try {
        const resp = await fetch(`${GAME_ASSETS_API}/motion/${selectedMotionB}${CACHE_BUST}`);
        if (resp.ok) {
          const json = await resp.json();
          motionDataBRef.current = json.format === 'blender_raw'
            ? processRawMotionData(json as RawMotionData) : json;
        }
      } catch (e) {
        console.error('Failed to load Motion B:', e);
      }
    })();
    return () => { motionDataBRef.current = null; };
  }, [charKey, selectedMotionB]);

  // Note: rest pose vertex storage removed — using freezeWorldMatrix for animation (no per-vertex transform)

  // Animation loop — uses requestAnimationFrame with frame-rate throttle, no React state updates
  useEffect(() => {
    if (!animPlaying) return;
    const motion = motionDataRef.current;
    if (!motion) return;

    let frameCounter = animFrameRef.current;
    const motionB = motionDataBRef.current;
    const frameDuration = 1000 / (motion.fps || 30);
    const blendFrames = blendDuration;
    // Total frames: motionA full + blend transition + motionB full (if B exists)
    const totalFramesA = motion.frame_count;
    const totalFrames = motionB
      ? totalFramesA + motionB.frame_count
      : totalFramesA;

    // Build bone name mapping (segment name → motion bone name) once
    const allBoneSets = [new Set(Object.keys(motion.bones))];
    if (motionB) allBoneSets.push(new Set(Object.keys(motionB.bones)));
    const boneNameMap: Record<string, string> = {};
    for (const segKey of Object.keys(meshesRef.current)) {
      for (const boneSet of allBoneSets) {
        const resolved = resolveMotionBoneName(segKey, boneSet);
        if (resolved) { boneNameMap[segKey] = resolved; break; }
      }
    }
    for (const entry of boneHierarchyRef.current) {
      if (!boneNameMap[entry.bone]) {
        for (const boneSet of allBoneSets) {
          const resolved = resolveMotionBoneName(entry.bone, boneSet);
          if (resolved) { boneNameMap[entry.bone] = resolved; break; }
        }
      }
    }
    let lastTime = 0;
    let rafId = 0;

    // Convert matrix array to Babylon.js Matrix
    // babylonFormat: already in Babylon convention, use directly
    // legacy format: Blender row-major, needs transpose
    const isBabylon = motion.babylonFormat === true;
    const toMatrix = (m: number[]) => isBabylon
      ? Matrix.FromArray(m)
      : Matrix.FromArray([
          m[0], m[4], m[8],  m[12],
          m[1], m[5], m[9],  m[13],
          m[2], m[6], m[10], m[14],
          m[3], m[7], m[11], m[15],
        ]);

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const elapsed = now - lastTime;
      if (elapsed < frameDuration) return;
      lastTime = now - (elapsed % frameDuration);

      frameCounter = (frameCounter + 1) % totalFrames;
      animFrameRef.current = frameCounter;

      // Determine which motion(s) to sample and blend ratio
      let frameA = -1, frameB = -1, blendT = 0;
      if (!motionB) {
        // Single motion: loop A
        frameA = frameCounter;
      } else if (frameCounter < totalFramesA - blendFrames) {
        // Pure Motion A
        frameA = frameCounter;
      } else if (frameCounter < totalFramesA) {
        // Crossfade A→B
        frameA = frameCounter;
        frameB = frameCounter - (totalFramesA - blendFrames);
        blendT = (frameCounter - (totalFramesA - blendFrames)) / blendFrames;
      } else {
        // Pure Motion B
        frameB = frameCounter - totalFramesA + blendFrames;
      }

      // Update frame display directly via DOM (no React re-render)
      if (frameDisplayRef.current) {
        const phase = blendT > 0 ? ` [blend ${Math.round(blendT*100)}%]` : (frameB >= 0 && frameA < 0 ? ' [B]' : '');
        frameDisplayRef.current.textContent = `Frame: ${frameCounter}/${totalFrames}${phase}`;
      }

      // Voxel-to-bind-pose offset correction (only for babylonFormat/blender_raw processed matrices)
      const segData = segmentsDataRef.current;
      let ox = 0, oy = 0, oz = 0;
      if (isBabylon && segData?.bb_min) {
        const g = segData.grid, sc = segData.voxel_size;
        ox = -(g.gx / 2) * sc - segData.bb_min[0];
        oy = -segData.bb_min[2];
        oz = (g.gy / 2) * sc + segData.bb_min[1];
      }
      const hasOffset = isBabylon && (Math.abs(ox) > 0.001 || Math.abs(oy) > 0.001 || Math.abs(oz) > 0.001);

      // Correct a Babylon-format skin matrix for the voxel-bind offset
      const correctMatrix = (m: number[]): number[] => {
        if (!hasOffset) return m;
        const c = m.slice();
        c[12] = m[12] - (ox * m[0] + oy * m[4] + oz * m[8]) + ox;
        c[13] = m[13] - (ox * m[1] + oy * m[5] + oz * m[9]) + oy;
        c[14] = m[14] - (ox * m[2] + oy * m[6] + oz * m[10]) + oz;
        return c;
      };

      // Get blended matrix for a bone at current frame
      const getBlendedRaw = (boneName: string): number[] | undefined => {
        const motionName = boneNameMap[boneName] || boneName;
        let matA: number[] | undefined;
        let matBm: number[] | undefined;
        if (frameA >= 0) {
          const d = motion.bones[motionName];
          if (d) matA = d.matrices[Math.min(frameA, d.matrices.length - 1)];
        }
        if (frameB >= 0 && motionB) {
          const d = motionB.bones[motionName];
          if (d) matBm = d.matrices[Math.min(frameB, d.matrices.length - 1)];
        }
        if (matA && matBm && blendT > 0) {
          // Lerp matrices
          return matA.map((v, i) => v * (1 - blendT) + matBm[i] * blendT);
        }
        return matA || matBm;
      };

      // Joint correction cascade (root→leaf) with offset-corrected matrices
      const hierarchy = boneHierarchyRef.current;
      const applyPoint = isBabylon ? applyMatPointBabylon : applyMatPointBlender;
      const correctedMats: Record<string, number[]> = {};
      if (hierarchy.length > 0) {
        for (const entry of hierarchy) {
          const blendedRaw = getBlendedRaw(entry.bone);
          let raw: number[] | undefined;
          if (blendedRaw) {
            raw = correctMatrix(blendedRaw);
          } else if (entry.parent && correctedMats[entry.parent]) {
            raw = correctedMats[entry.parent];
          }
          if (!raw) continue;
          if (!entry.parent || !correctedMats[entry.parent]) {
            correctedMats[entry.bone] = raw;
          } else {
            const parentMat = correctedMats[entry.parent];
            const jp = entry.jointPoint;
            const pByParent = applyPoint(parentMat, jp);
            const pByChild = applyPoint(raw, jp);
            const corrected = raw.slice();
            corrected[12] += pByParent[0] - pByChild[0];
            corrected[13] += pByParent[1] - pByChild[1];
            corrected[14] += pByParent[2] - pByChild[2];
            correctedMats[entry.bone] = corrected;
          }
        }
      }

      // Apply matrices to meshes
      for (const [segKey, mesh] of Object.entries(meshesRef.current)) {
        let skinMat: Matrix | null = null;
        const jointBones = jointBonesRef.current[segKey];
        if (jointBones) {
          const [boneJA, boneJB] = jointBones;
          const matJA = correctedMats[boneJA] || getBlendedRaw(boneJA);
          const matJB = correctedMats[boneJB] || getBlendedRaw(boneJB);
          if (matJA && matJB) {
            const blended = matJA.map((v: number, i: number) => (v + matJB[i]) / 2);
            skinMat = toMatrix(blended);
          } else if (matJA) {
            skinMat = toMatrix(matJA);
          } else if (matJB) {
            skinMat = toMatrix(matJB);
          }
        } else {
          const mat = correctedMats[segKey] || getBlendedRaw(segKey);
          if (!mat) continue;
          skinMat = toMatrix(mat);
        }
        if (!skinMat) continue;
        mesh.freezeWorldMatrix(skinMat);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [animPlaying]);

  const partLabel = (key: string) => {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      .replace('  ', ' ').trim();
  };

  const bodyParts = parts.filter(p => p.is_body);
  const clothingParts = parts.filter(p => !p.is_body);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#101018', display: 'flex' }}>
      {/* Side panel */}
      <div style={{
        width: 280, minWidth: 280, padding: '14px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.55)', color: '#ddd', fontFamily: 'monospace', fontSize: 12,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#fff' }}>
          Realistic Viewer
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 10, color: '#888' }}>
          Original proportions - no deformation
        </p>

        {/* Category selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['base', 'female', 'male', 'weapons'] as CharCategory[]).map(cat => (
            <button key={cat} onClick={() => {
              setSelectedCategory(cat);
              const first = Object.entries(CHARACTERS).find(([, c]) => c.category === cat);
              if (first) setCharKey(first[0]);
            }} style={{
              flex: 1, padding: '5px 0', fontSize: 11, fontWeight: selectedCategory === cat ? 'bold' : 'normal',
              border: selectedCategory === cat ? '2px solid #fa0' : '1px solid #555',
              borderRadius: 4, cursor: 'pointer',
              background: selectedCategory === cat ? 'rgba(180,120,0,0.25)' : 'rgba(40,40,60,0.4)',
              color: selectedCategory === cat ? '#fda' : '#999',
              textTransform: 'capitalize',
            }}>
              {cat}
            </button>
          ))}
        </div>
        {/* Character selector */}
        <select
          value={charKey}
          onChange={(e) => setCharKey(e.target.value)}
          style={{
            width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 14,
            background: '#1a1a2e', color: '#fda', border: '1px solid #fa0',
            borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
          }}
        >
          {Object.entries(CHARACTERS)
            .filter(([, c]) => c.category === selectedCategory)
            .map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
        </select>

        {/* Animation controls (BasicBody only) */}
        {CHARACTERS[charKey]?.category === 'base' && !loading && animReady && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 'bold', color: '#fa0', fontSize: 13, marginBottom: 6 }}>
              Animation
            </div>
            <select
              value={selectedMotion}
              onChange={(e) => { setAnimPlaying(false); setSelectedMotion(e.target.value); }}
              style={{
                width: '100%', padding: '4px 6px', fontSize: 11, marginBottom: 6,
                background: '#1a1a2e', color: '#ddd', border: '1px solid #555',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              <option value="">Walk Cycle (default)</option>
              <option value="ero_pose_01.motion.json">Ero Pose 01</option>
              <option value="ero_pose_02.motion.json">Ero Pose 02</option>
              <option value="ero_pose_03.motion.json">Ero Pose 03</option>
              <option value="nursing_handjob.motion.json">Nursing Handjob (CE)</option>
              <option value="nursing_handjob_qm.motion.json">Nursing Handjob (QM)</option>
              <option value="doggy_qm.motion.json">Doggy (QM)</option>
              <option value="blowjob_qm.motion.json">Blowjob (QM)</option>
              <option value="reverse_cowgirl_qm.motion.json">Reverse Cowgirl (QM)</option>
              <option value="amazon_qm.motion.json">Amazon (QM)</option>
              <option value="missionary_qm.motion.json">Missionary (QM)</option>
              <option value="tall_qm.motion.json">Tall (QM)</option>
              <option value="tallqueenspooning_qm_detailed.motion.json">TallQueen Spooning (QM Detailed)</option>
              <option value="spin_qm_detailed.motion.json">Spin (QM Detailed)</option>
              <option value="riding_default.motion.json">Riding Default</option>
              <option value="riding_full_start.motion.json">Riding Full Start</option>
              <option value="riding_mid.motion.json">Riding Mid</option>
              <option value="riding_loop_extended.motion.json">Riding Loop Extended</option>
              <option value="riding_loop_extended_raw.motion.json">Riding Loop Extended (RAW/New)</option>
              <option value="bunnyakali_cozywinter.motion.json">BunnyAkali CozyWinter</option>
              <option value="bunnyakali_reversecowgirl.motion.json">BunnyAkali ReverseCowgirl</option>
              <option value="darkelfblader_titsuck.motion.json">DarkElfBlader TitSuck</option>
            </select>
            {/* Motion B for blending */}
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Motion B (blend to)</div>
            <select
              value={selectedMotionB}
              onChange={(e) => { setAnimPlaying(false); setSelectedMotionB(e.target.value); }}
              style={{
                width: '100%', padding: '4px 6px', fontSize: 11, marginBottom: 4,
                background: '#1a1a2e', color: '#adf', border: '1px solid #446',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              <option value="">(none - loop A)</option>
              <option value="walk_cycle_arp.motion.json">Walk Cycle</option>
              <option value="bunnyakali_cozywinter.motion.json">BunnyAkali CozyWinter</option>
              <option value="bunnyakali_reversecowgirl.motion.json">BunnyAkali ReverseCowgirl</option>
              <option value="darkelfblader_titsuck.motion.json">DarkElfBlader TitSuck</option>
              <option value="riding_loop_extended_raw.motion.json">Riding Loop Extended (RAW)</option>
            </select>
            {selectedMotionB && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#888' }}>Blend:</span>
                <input
                  type="range" min={5} max={120} value={blendDuration}
                  onChange={(e) => setBlendDuration(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, color: '#adf', minWidth: 35 }}>{blendDuration}f</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={() => setAnimPlaying(!animPlaying)}
                style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 'bold',
                  border: animPlaying ? '2px solid #f44' : '2px solid #4f4',
                  borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                  background: animPlaying ? 'rgba(80,20,20,0.4)' : 'rgba(20,80,20,0.4)',
                  color: animPlaying ? '#faa' : '#afa',
                }}
              >
                {animPlaying ? 'Stop' : 'Play'}
              </button>
              <span ref={frameDisplayRef} style={{ fontSize: 10, color: '#888' }}>
                Frame: {animFrameRef.current}/{motionDataRef.current?.frame_count || 0}
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ color: '#8af', fontSize: 13, padding: '20px 0' }}>
            Loading parts...
          </div>
        )}

        {error && (
          <div style={{ color: '#f88', fontSize: 12, padding: '10px', background: 'rgba(200,50,50,0.15)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Master toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              <button onClick={() => toggleAll(true)} style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
                border: '1px solid #4a4', borderRadius: 4,
                background: 'rgba(40,80,40,0.3)', color: '#afa', cursor: 'pointer',
              }}>
                All ON
              </button>
              <button onClick={() => toggleAll(false)} style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
                border: '1px solid #a44', borderRadius: 4,
                background: 'rgba(80,40,40,0.3)', color: '#faa', cursor: 'pointer',
              }}>
                All OFF
              </button>
            </div>

            {/* Hair Swap */}
            {hairOptions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 'bold', color: '#f8c', fontSize: 13, marginBottom: 6 }}>
                  Hair Swap {hairLoading && <span style={{ fontSize: 10, color: '#8af' }}>(loading...)</span>}
                  {hairSizeDiff && (
                    <span style={{
                      fontSize: 10, marginLeft: 6,
                      color: Math.abs(parseInt(hairSizeDiff)) > 30 ? '#f88' : '#8f8',
                    }}>
                      size: {hairSizeDiff}
                    </span>
                  )}
                </div>
                <select
                  value={selectedHair}
                  onChange={(e) => swapHair(e.target.value)}
                  disabled={hairLoading}
                  style={{
                    width: '100%', padding: '6px 8px', fontSize: 11,
                    background: '#1a1a2e', color: '#ddd', border: '1px solid #555',
                    borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                  }}
                >
                  <option value="">-- Default (own hair) --</option>
                  {hairOptions.map((opt, idx) => (
                    <option key={`${opt.charKey}::${opt.partKey}::${idx}`} value={`${opt.charKey}::${opt.partKey}`}>
                      {opt.label} ({opt.voxels.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Body section */}
            {bodyParts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', color: '#8c8', fontSize: 13 }}>
                    Body ({bodyParts.length})
                  </span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => toggleCategory(true, true)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #4a4', borderRadius: 3,
                      background: 'transparent', color: '#8c8', cursor: 'pointer',
                    }}>ON</button>
                    <button onClick={() => toggleCategory(true, false)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                      background: 'transparent', color: '#c88', cursor: 'pointer',
                    }}>OFF</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
                  {bodyParts.map(part => (
                    <button key={part.key} onClick={() => togglePart(part.key)} style={{
                      padding: '5px 10px', fontSize: 11, textAlign: 'left',
                      border: partVisibility[part.key] ? '2px solid #6a6' : '1px solid #444',
                      borderRadius: 4,
                      background: partVisibility[part.key] ? 'rgba(40,80,40,0.35)' : 'rgba(30,30,50,0.6)',
                      color: partVisibility[part.key] ? '#cec' : '#666',
                      cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{partLabel(part.key)}</span>
                      <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Clothing/Accessories section */}
            {clothingParts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', color: '#8af', fontSize: 13 }}>
                    Parts ({clothingParts.length})
                  </span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => toggleCategory(false, true)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #48f', borderRadius: 3,
                      background: 'transparent', color: '#8af', cursor: 'pointer',
                    }}>ON</button>
                    <button onClick={() => toggleCategory(false, false)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                      background: 'transparent', color: '#c88', cursor: 'pointer',
                    }}>OFF</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {clothingParts.map(part => (
                    <button key={part.key} onClick={() => togglePart(part.key)} style={{
                      padding: '5px 10px', fontSize: 11, textAlign: 'left',
                      border: partVisibility[part.key] ? '2px solid #68f' : '1px solid #444',
                      borderRadius: 4,
                      background: partVisibility[part.key] ? 'rgba(60,60,180,0.35)' : 'rgba(30,30,50,0.6)',
                      color: partVisibility[part.key] ? '#fff' : '#666',
                      cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span>{partLabel(part.key)}</span>
                        {part.meshes.length > 1 && (
                          <span style={{ fontSize: 9, opacity: 0.4 }}>
                            {part.meshes.join(', ')}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{
              marginTop: 16, paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: 10, opacity: 0.4, lineHeight: 1.6,
            }}>
              Total: {parts.reduce((s, p) => s + p.voxels, 0).toLocaleString()} voxels
              <br />
              Click parts to toggle on/off
            </div>
          </>
        )}

        <div style={{
          marginTop: 20, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          opacity: 0.4, fontSize: 10, lineHeight: 1.6,
        }}>
          Drag to rotate / Scroll to zoom / Right-drag to pan
        </div>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ flex: 1, height: '100%' }} />
    </div>
  );
}
