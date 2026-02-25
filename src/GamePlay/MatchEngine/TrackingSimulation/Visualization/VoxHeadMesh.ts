import { Mesh, VertexData, Scene } from "@babylonjs/core";

/**
 * MagicaVoxel .vox ファイルをパースし、
 * 露出面のみでメッシュを構築する軽量ローダー。
 */

// --- VOX binary parser helpers ---

interface VoxModel {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  voxels: { x: number; y: number; z: number; colorIndex: number }[];
  palette: { r: number; g: number; b: number }[];
}

function parseVox(buf: ArrayBuffer): VoxModel {
  const view = new DataView(buf);
  let offset = 0;

  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  const readU8 = () => { const v = view.getUint8(offset); offset += 1; return v; };
  const readStr = (n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
    offset += n;
    return s;
  };

  // Header: "VOX " + version
  const magic = readStr(4);
  if (magic !== "VOX ") throw new Error("Not a VOX file");
  readU32(); // version

  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels: VoxModel["voxels"] = [];
  let palette: VoxModel["palette"] | null = null;

  // Read chunks
  const readChunks = (end: number) => {
    while (offset < end) {
      const id = readStr(4);
      const contentSize = readU32();
      const childSize = readU32();
      const contentEnd = offset + contentSize;

      if (id === "SIZE") {
        sizeX = readU32();
        sizeY = readU32();
        sizeZ = readU32();
      } else if (id === "XYZI") {
        const numVoxels = readU32();
        for (let i = 0; i < numVoxels; i++) {
          const x = readU8();
          const y = readU8();
          const z = readU8();
          const colorIndex = readU8();
          voxels.push({ x, y, z, colorIndex });
        }
      } else if (id === "RGBA") {
        palette = [];
        for (let i = 0; i < 256; i++) {
          const r = readU8();
          const g = readU8();
          const b = readU8();
          readU8(); // alpha (skip)
          palette.push({ r: r / 255, g: g / 255, b: b / 255 });
        }
      }

      offset = contentEnd;
      // Recurse into children if present
      if (childSize > 0) {
        readChunks(offset + childSize);
      }
    }
  };

  // MAIN chunk
  const mainId = readStr(4);
  if (mainId !== "MAIN") throw new Error("Expected MAIN chunk");
  const mainContentSize = readU32();
  const mainChildSize = readU32();
  offset += mainContentSize; // skip MAIN content (usually 0)
  readChunks(offset + mainChildSize);

  // Default palette if none provided
  if (!palette) {
    palette = [];
    for (let i = 0; i < 256; i++) {
      palette.push({ r: 0.8, g: 0.8, b: 0.8 });
    }
  }

  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// --- Mesh builder with exposed-face culling ---

// 6 face directions: +X, -X, +Y, -Y, +Z, -Z
const FACE_DIRS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
] as const;

// Quad vertices for each face direction (CCW winding when viewed from outside)
// Each face has 4 vertices defined as offsets from voxel origin (0,0,0)-(1,1,1)
const FACE_VERTS: number[][][] = [
  // +X face (x=1 plane)
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],
  // -X face (x=0 plane)
  [[0,0,1],[0,1,1],[0,1,0],[0,0,0]],
  // +Y face (y=1 plane)
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],
  // -Y face (y=0 plane)
  [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],
  // +Z face (z=1 plane)
  [[0,0,1],[0,1,1],[1,1,1],[1,0,1]].map(v => [v[0], v[1], v[2]]),
  // -Z face (z=0 plane)
  [[1,0,0],[1,1,0],[0,1,0],[0,0,0]],
];

// Normals for each face direction
const FACE_NORMALS: number[][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

export interface VoxHeadInfo {
  mesh: Mesh;
  /** 顔前面までの距離（ローカルZ+方向、メッシュ中心から） */
  faceForwardOffset: number;
  /** 顔中心の高さ（ローカルY、メッシュ底面から） */
  faceCenterHeight: number;
}

function buildVoxMesh(model: VoxModel, scene: Scene): VoxHeadInfo {
  // Build occupancy set for neighbor lookups + compute actual voxel bounding box
  const occupied = new Set<string>();
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const v of model.voxels) {
    occupied.add(`${v.x},${v.y},${v.z}`);
    if (v.x < minX) minX = v.x;
    if (v.x + 1 > maxX) maxX = v.x + 1;
    if (v.y < minY) minY = v.y;
    if (v.y + 1 > maxY) maxY = v.y + 1;
    if (v.z < minZ) minZ = v.z;
    if (v.z + 1 > maxZ) maxZ = v.z + 1;
  }

  // Center X,Y on actual voxel extent; Z (→localY) starts at bottom (base of head)
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const SCALE = 0.010;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (const voxel of model.voxels) {
    const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };

    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      const nx = voxel.x + dx;
      const ny = voxel.y + dy;
      const nz = voxel.z + dz;

      // Skip face if neighbor voxel exists (internal face)
      if (occupied.has(`${nx},${ny},${nz}`)) continue;

      const baseIdx = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];

      for (let vi = 0; vi < 4; vi++) {
        // Raw voxel-space vertex
        const rawX = (voxel.x + fv[vi][0] - cx) * SCALE;
        const rawY = (voxel.y + fv[vi][1] - cy) * SCALE;
        const rawZ = (voxel.z + fv[vi][2] - minZ) * SCALE;

        // Axis remap: vox X → local X, vox Z → local Y (up), vox -Y → local Z (forward=face direction)
        const localX = rawX;
        const localY = rawZ;  // vox Z → up
        const localZ = -rawY; // vox -Y → forward

        positions.push(localX, localY, localZ);

        // Remap normals the same way
        normals.push(fn[0], fn[2], -fn[1]);

        // Vertex color
        colors.push(col.r, col.g, col.b, 1.0);
      }

      // Two triangles per quad (CCW)
      indices.push(
        baseIdx, baseIdx + 1, baseIdx + 2,
        baseIdx, baseIdx + 2, baseIdx + 3,
      );
    }
  }

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.indices = indices;

  const mesh = new Mesh("voxHead_template", scene);
  vertexData.applyToMesh(mesh);
  mesh.isPickable = false;

  // Head dimensions after axis remap (vox Y→localZ depth, vox Z→localY height)
  const faceForwardOffset = (maxY - minY) * SCALE / 2; // half-depth = face front from center
  const faceCenterHeight = (maxZ - minZ) * SCALE / 2;  // half-height from base

  return { mesh, faceForwardOffset, faceCenterHeight };
}

/**
 * VOXファイルを読み込み、露出面のみの最適化メッシュを返す。
 * 軸リマップ済み: vox X→localX, vox Z→localY(up), vox -Y→localZ(forward=顔方向)
 * スケール: 0.010 per voxel
 */
export async function loadVoxHeadMesh(scene: Scene, url: string): Promise<VoxHeadInfo> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch VOX: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const model = parseVox(buf);
  return buildVoxMesh(model, scene);
}
