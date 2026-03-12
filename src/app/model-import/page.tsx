'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, Mesh, MeshBuilder, StandardMaterial,
  SceneLoader, AbstractMesh, HighlightLayer, Bone, Skeleton,
  Matrix, VertexData, Effect, ShaderMaterial,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/OBJ';

// ========================================================================
// Types
// ========================================================================
type TemplateCategory =
  | 'body' | 'hair' | 'upper_body' | 'lower_body' | 'footwear'
  | 'gloves' | 'full_body_suit' | 'accessory' | 'exclude';

interface PartConfig {
  category: TemplateCategory;
  meshName: string;
  vertexCount: number;
  visible: boolean;
}

interface ImportConfig {
  fileName: string;
  parts: Record<string, PartConfig>;
  tPoseStatus: TPoseStatus | null;
  timestamp: string;
}

interface TPoseStatus {
  detected: boolean;
  isTPose: boolean;
  leftArmAngle: number;
  rightArmAngle: number;
  poseType: 'T-pose' | 'A-pose' | 'other';
}

interface VoxelEntry { x: number; y: number; z: number; r: number; g: number; b: number; }

const VSCALE = 0.01; // 1 voxel = 0.01 world units
const BODY_SIZE = { x: 85, y: 34, z: 102 };

const CATEGORY_INFO: Record<TemplateCategory, { label: string; labelJa: string; color: string }> = {
  body:           { label: 'Body',           labelJa: '体',           color: '#888888' },
  hair:           { label: 'Hair',           labelJa: '髪',           color: '#cc8833' },
  upper_body:     { label: 'Upper Body',     labelJa: '上半身衣装',   color: '#4488cc' },
  lower_body:     { label: 'Lower Body',     labelJa: '下半身衣装',   color: '#44cc88' },
  footwear:       { label: 'Footwear',       labelJa: 'ブーツ/靴',    color: '#885533' },
  gloves:         { label: 'Gloves',         labelJa: '手袋',         color: '#aa6644' },
  full_body_suit: { label: 'Full Body Suit', labelJa: '全身スーツ',   color: '#6644aa' },
  accessory:      { label: 'Accessory',      labelJa: '装飾品',       color: '#ccaa44' },
  exclude:        { label: 'Exclude',        labelJa: '除外',         color: '#444444' },
};

const CATEGORIES = Object.keys(CATEGORY_INFO) as TemplateCategory[];

const TEMPLATE_MAP: Record<string, string> = {
  hair: '/templates/hair_cap.vox',
  upper_body: '/templates/shirt_shell.vox',
  lower_body: '/templates/pants_shell.vox',
  footwear: '/templates/boots_shell.vox',
  gloves: '/templates/gloves_shell.vox',
  full_body_suit: '/templates/full_body_shell.vox',
};

// ========================================================================
// Auto-classify
// ========================================================================
function guessCategory(name: string): TemplateCategory {
  const n = name.toLowerCase();
  if (/body|skin|torso/.test(n)) return 'body';
  if (/hair|bangs|ponytail|braid/.test(n)) return 'hair';
  if (/shoe|boot|foot|feet|sandal/.test(n)) return 'footwear';
  if (/glove|gauntlet|hand_wear/.test(n)) return 'gloves';
  if (/pant|trouser|skirt|leg_wear|shorts|stocking|legging/.test(n)) return 'lower_body';
  if (/shirt|jacket|coat|vest|top|chest|armor|bra|corset/.test(n)) return 'upper_body';
  if (/suit|bodysuit|leotard/.test(n)) return 'full_body_suit';
  if (/necklace|earring|ring|belt|buckle|strap|cape|cloak|scarf|ribbon|bow|crown|tiara|helmet|hat|mask|visor|glasses|wing/.test(n)) return 'accessory';
  if (/armature|skeleton|bone|rig|root|null|empty/.test(n)) return 'exclude';
  return 'accessory';
}

// ========================================================================
// T-pose detection
// ========================================================================
function detectTPose(skeletons: Skeleton[]): TPoseStatus | null {
  if (skeletons.length === 0) return null;
  const leftPats = [/left.*upper.*arm/i, /left.*arm$/i, /l_upperarm/i, /leftarm/i, /arm\.l/i, /upperarm\.l/i];
  const rightPats = [/right.*upper.*arm/i, /right.*arm$/i, /r_upperarm/i, /rightarm/i, /arm\.r/i, /upperarm\.r/i];

  let leftBone: Bone | null = null, rightBone: Bone | null = null;
  for (const sk of skeletons) {
    for (const bone of sk.bones) {
      if (!leftBone) for (const p of leftPats) { if (p.test(bone.name)) { leftBone = bone; break; } }
      if (!rightBone) for (const p of rightPats) { if (p.test(bone.name)) { rightBone = bone; break; } }
      if (leftBone && rightBone) break;
    }
    if (leftBone && rightBone) break;
  }
  if (!leftBone && !rightBone) return { detected: false, isTPose: false, leftArmAngle: 0, rightArmAngle: 0, poseType: 'other' };

  const getAngle = (bone: Bone | null) => {
    if (!bone) return 0;
    const dir = new Vector3();
    const pm = bone.getParent()?.getWorldMatrix() ?? Matrix.Identity();
    const fm = bone.getLocalMatrix().multiply(pm);
    Vector3.TransformNormalToRef(new Vector3(0, 1, 0), fm, dir);
    dir.normalize();
    const hLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    return Math.atan2(Math.abs(dir.y), hLen) * (180 / Math.PI);
  };

  const la = getAngle(leftBone), ra = getAngle(rightBone);
  const avg = (la + ra) / 2;
  let poseType: TPoseStatus['poseType'] = 'other';
  if (avg <= 15) poseType = 'T-pose';
  else if (avg >= 25 && avg <= 55) poseType = 'A-pose';
  return { detected: true, isTPose: poseType === 'T-pose', leftArmAngle: Math.round(la), rightArmAngle: Math.round(ra), poseType };
}

// ========================================================================
// VOX parser (browser)
// ========================================================================
function parseVoxBrowser(buf: ArrayBuffer): { voxels: { x: number; y: number; z: number; colorIndex: number }[]; palette: { r: number; g: number; b: number }[] } {
  const view = new DataView(buf);
  let off = 0;
  const r32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  const r8 = () => { const v = view.getUint8(off); off += 1; return v; };
  const rStr = (n: number) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i)); off += n; return s; };

  if (rStr(4) !== 'VOX ') throw new Error('Invalid VOX');
  r32();
  rStr(4); const mc = r32(); const mch = r32();
  const end = off + mch + mc;
  const voxels: { x: number; y: number; z: number; colorIndex: number }[] = [];
  const palette: { r: number; g: number; b: number }[] = [];

  while (off < end) {
    const id = rStr(4); const cs = r32(); const chs = r32(); const ds = off;
    if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), colorIndex: r8() }); }
    else if (id === 'RGBA') { for (let i = 0; i < 256; i++) { palette.push({ r: r8() / 255, g: r8() / 255, b: r8() / 255 }); r8(); } }
    off = ds + cs + chs;
  }
  if (palette.length === 0) for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 });
  return { voxels, palette };
}

async function loadTemplateVox(url: string): Promise<VoxelEntry[]> {
  try {
    const resp = await fetch(url + `?v=${Date.now()}`);
    if (!resp.ok) return [];
    const { voxels, palette } = parseVoxBrowser(await resp.arrayBuffer());
    return voxels.map(v => {
      const c = palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
      return { x: v.x, y: v.y, z: v.z, r: c.r, g: c.g, b: c.b };
    });
  } catch { return []; }
}

// ========================================================================
// EC Body Standard Chibi Deformation (デフォルメ変形)
// Matches blender_voxelize.py deform_point — EC body proportions
// Regions: head (t>0.85), torso (0.50<t≤0.85), legs (t≤0.50)
// Babylon coords: Y=up, X=right, Z=depth
// ========================================================================
interface DeformBounds {
  minY: number;     // model bottom (feet) in Babylon Y
  modelH: number;   // model height
  centerX: number;  // X center of body bounding box
  centerZ: number;  // Z center of body bounding box
}

function computeModelBounds(
  meshMap: Map<string, AbstractMesh[]>,
  partsCfg: Record<string, PartConfig>,
): DeformBounds | null {
  // Prefer body meshes for bounds (matches Blender: body-only bbox)
  let targets: AbstractMesh[] = [];
  for (const [name, meshes] of meshMap) {
    if (partsCfg[name]?.category === 'body' && partsCfg[name]?.visible) targets.push(...meshes);
  }
  if (targets.length === 0) {
    for (const [name, meshes] of meshMap) {
      if (partsCfg[name]?.visible && partsCfg[name]?.category !== 'exclude') targets.push(...meshes);
    }
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const mesh of targets) {
    if (!(mesh instanceof Mesh)) continue;
    const pos = mesh.getVerticesData('position');
    if (!pos) continue;
    const wm = mesh.getWorldMatrix();
    for (let i = 0; i < pos.length; i += 3) {
      const wp = Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm);
      minX = Math.min(minX, wp.x); maxX = Math.max(maxX, wp.x);
      minY = Math.min(minY, wp.y); maxY = Math.max(maxY, wp.y);
      minZ = Math.min(minZ, wp.z); maxZ = Math.max(maxZ, wp.z);
    }
  }
  if (!isFinite(minY)) return null;
  return { minY, modelH: maxY - minY, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2 };
}

/**
 * Apply EC body chibi deformation to a point in Babylon world space.
 * headScale: override head region XY scale (1.0 for hair = no enlargement)
 */
function chibiDeform(
  px: number, py: number, pz: number,
  b: DeformBounds, headScale?: number,
): [number, number, number] {
  let x = px, y = py, z = pz;
  const t = b.modelH > 0 ? Math.max(0, Math.min(1, (y - b.minY) / b.modelH)) : 0.5;

  if (t > 0.85) {
    // Head: enlarge XY (1.5→1.8), push Z upward
    const ht = (t - 0.85) / 0.15;
    const s = headScale ?? (1.5 + ht * 0.3);
    x = b.centerX + (x - b.centerX) * s;
    z = b.centerZ + (z - b.centerZ) * s;
    y = y + ht * b.modelH * 0.06;
  } else if (t > 0.50) {
    // Torso: slight XZ expansion
    x = b.centerX + (x - b.centerX) * 1.1;
    z = b.centerZ + (z - b.centerZ) * 1.1;
  } else {
    // Legs: compress Z (quadratic), spread outward (ハの字)
    const legT = t / 0.50;
    const f = 0.70 * legT + 0.30 * legT * legT;
    y = b.minY + f * 0.50 * b.modelH;
    x = b.centerX + (x - b.centerX) * 1.1;
    z = b.centerZ + (z - b.centerZ) * 1.1;
    const sign = x > b.centerX ? 1.0 : -1.0;
    x += sign * 0.06 * (1.0 - legT);
  }

  return [x, y, z];
}

// ========================================================================
// Mesh → Voxel (triangle rasterization)
// ========================================================================
function voxelizeMesh(
  mesh: AbstractMesh, gridX: number, gridY: number, gridZ: number,
  offX: number, offY: number, offZ: number, scale: number,
  deform?: { bounds: DeformBounds; headScale?: number },
): VoxelEntry[] {
  if (!(mesh instanceof Mesh)) return [];
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  const colors = mesh.getVerticesData('color');
  if (!positions || !indices) return [];

  const voxelSet = new Map<string, VoxelEntry>();
  const wm = mesh.getWorldMatrix();

  for (let i = 0; i < indices.length; i += 3) {
    const tv: Vector3[] = [], tc: { r: number; g: number; b: number }[] = [];
    for (let vi = 0; vi < 3; vi++) {
      const idx = indices[i + vi];
      tv.push(Vector3.TransformCoordinates(new Vector3(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]), wm));
      if (colors) tc.push({ r: colors[idx * 4], g: colors[idx * 4 + 1], b: colors[idx * 4 + 2] });
      else {
        const mat = mesh.material;
        const dc = mat && 'diffuseColor' in mat ? (mat as StandardMaterial).diffuseColor : new Color3(0.7, 0.7, 0.7);
        tc.push({ r: dc.r, g: dc.g, b: dc.b });
      }
    }
    // Rasterize
    const e0 = tv[1].subtract(tv[0]).length(), e1 = tv[2].subtract(tv[1]).length(), e2 = tv[0].subtract(tv[2]).length();
    const steps = Math.max(Math.ceil(Math.max(e0, e1, e2) / scale), 1);
    for (let si = 0; si <= steps; si++) {
      for (let sj = 0; sj <= steps - si; sj++) {
        const u = si / steps, v = sj / steps, w = 1 - u - v;
        if (w < 0) continue;
        const px = tv[0].x * w + tv[1].x * u + tv[2].x * v;
        const py = tv[0].y * w + tv[1].y * u + tv[2].y * v;
        const pz = tv[0].z * w + tv[1].z * u + tv[2].z * v;
        let rx = px, ry = py, rz = pz;
        if (deform) [rx, ry, rz] = chibiDeform(px, py, pz, deform.bounds, deform.headScale);
        const vx = Math.round(rx / scale + offX);
        const vy = Math.round(-rz / scale + offY);
        const vz = Math.round(ry / scale + offZ);
        if (vx < 0 || vy < 0 || vz < 0 || vx >= gridX || vy >= gridY || vz >= gridZ) continue;
        const key = `${vx},${vy},${vz}`;
        if (!voxelSet.has(key)) {
          voxelSet.set(key, { x: vx, y: vy, z: vz,
            r: tc[0].r * w + tc[1].r * u + tc[2].r * v,
            g: tc[0].g * w + tc[1].g * u + tc[2].g * v,
            b: tc[0].b * w + tc[1].b * u + tc[2].b * v,
          });
        }
      }
    }
  }
  return Array.from(voxelSet.values());
}

// ========================================================================
// Voxel mesh builder (unlit, face-culled)
// ========================================================================
const FACE_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FACE_VERTS = [
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],[[0,0,1],[0,0,0],[1,0,0],[1,0,1]],
  [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
];
const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

function createUnlit(scene: Scene, name: string): ShaderMaterial {
  Effect.ShadersStore[name + 'VertexShader'] = `precision highp float;attribute vec3 position;attribute vec4 color;uniform mat4 worldViewProjection;varying vec4 vColor;void main(){gl_Position=worldViewProjection*vec4(position,1.0);vColor=color;}`;
  Effect.ShadersStore[name + 'FragmentShader'] = `precision highp float;varying vec4 vColor;void main(){gl_FragColor=vColor;}`;
  const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, { attributes: ['position', 'color'], uniforms: ['worldViewProjection'] });
  mat.backFaceCulling = false;
  return mat;
}

function buildVoxelMesh(voxels: VoxelEntry[], scene: Scene, name: string, cx: number, cy: number): Mesh {
  const occ = new Set<string>();
  for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  for (const vx of voxels) {
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occ.has(`${vx.x+dx},${vx.y+dy},${vx.z+dz}`)) continue;
      const bi = pos.length / 3;
      const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        pos.push((vx.x+fv[vi][0]-cx)*VSCALE, (vx.z+fv[vi][2])*VSCALE, -(vx.y+fv[vi][1]-cy)*VSCALE);
        nrm.push(fn[0], fn[2], -fn[1]);
        col.push(vx.r, vx.g, vx.b, 1);
      }
      idx.push(bi, bi+1, bi+2, bi, bi+2, bi+3);
    }
  }
  const vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.colors = col; vd.indices = idx;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m);
  m.material = createUnlit(scene, name + '_u');
  return m;
}

// ========================================================================
// VOX export (browser)
// ========================================================================
function exportVoxBlob(voxels: VoxelEntry[], sizeX: number, sizeY: number, sizeZ: number): Blob {
  const cMap = new Map<string, number>(); const pal: { r: number; g: number; b: number }[] = [];
  for (const v of voxels) {
    const k = `${Math.round(v.r*255)},${Math.round(v.g*255)},${Math.round(v.b*255)}`;
    if (!cMap.has(k) && pal.length < 255) { cMap.set(k, pal.length + 1); pal.push({ r: v.r, g: v.g, b: v.b }); }
  }
  const vd = voxels.map(v => ({ x: v.x, y: v.y, z: v.z, ci: cMap.get(`${Math.round(v.r*255)},${Math.round(v.g*255)},${Math.round(v.b*255)}`) ?? 1 }));
  const szC = 12, xyC = 4 + vd.length * 4, rgC = 1024;
  const chSz = (12+szC)+(12+xyC)+(12+rgC);
  const buf = new ArrayBuffer(8+12+chSz); const dv = new DataView(buf); let o = 0;
  const ws = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
  const w32 = (v: number) => { dv.setUint32(o, v, true); o += 4; };
  const w8 = (v: number) => { dv.setUint8(o, v); o += 1; };
  ws('VOX '); w32(200); ws('MAIN'); w32(0); w32(chSz);
  ws('SIZE'); w32(szC); w32(0); w32(sizeX); w32(sizeY); w32(sizeZ);
  ws('XYZI'); w32(xyC); w32(0); w32(vd.length);
  for (const v of vd) { w8(v.x); w8(v.y); w8(v.z); w8(v.ci); }
  ws('RGBA'); w32(rgC); w32(0);
  for (let i = 0; i < 256; i++) { const c = pal[i] ?? { r: 0, g: 0, b: 0 }; w8(Math.round(c.r*255)); w8(Math.round(c.g*255)); w8(Math.round(c.b*255)); w8(255); }
  return new Blob([buf], { type: 'application/octet-stream' });
}

// ========================================================================
// Component
// ========================================================================
export default function ModelImportPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const highlightRef = useRef<HighlightLayer | null>(null);
  const meshMapRef = useRef<Map<string, AbstractMesh[]>>(new Map());
  const voxelMeshesRef = useRef<Mesh[]>([]);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parts, setParts] = useState<Record<string, PartConfig>>({});
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tPoseStatus, setTPoseStatus] = useState<TPoseStatus | null>(null);

  // Voxelize state
  const [mode, setMode] = useState<'classify' | 'voxelize'>('classify');
  const [voxelizing, setVoxelizing] = useState(false);
  const [voxelResult, setVoxelResult] = useState<Record<string, VoxelEntry[]>>({});
  const [showGlb, setShowGlb] = useState(true);
  const [showVoxels, setShowVoxels] = useState(true);
  const [scaleMul, setScaleMul] = useState(1.0);
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [offZ, setOffZ] = useState(0);
  const [voxRes, setVoxRes] = useState(VSCALE);
  const [voxStatus, setVoxStatus] = useState('');
  const [chibiEnabled, setChibiEnabled] = useState(true);

  // Init engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10 }, scene);
    const gMat = new StandardMaterial('gMat', scene);
    gMat.diffuseColor = new Color3(0.2, 0.2, 0.25); gMat.alpha = 0.3; gMat.wireframe = true;
    ground.material = gMat; ground.isPickable = false;

    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 5, new Vector3(0, 1, 0), scene);
    camera.attachControl(canvas, true); camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = 20; camera.wheelPrecision = 40;

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6; hemi.groundColor = new Color3(0.1, 0.1, 0.15);
    const dir = new DirectionalLight('dir', new Vector3(-1, -2, 1), scene);
    dir.intensity = 0.5;

    highlightRef.current = new HighlightLayer('hl', scene);
    sceneRef.current = scene; engineRef.current = engine; setInitialized(true);

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  // Load model
  const loadModel = useCallback(async (file: File) => {
    const scene = sceneRef.current;
    if (!scene || !initialized) return;
    setLoading(true); setError(null); setFileName(file.name); setSelectedPart(null); setTPoseStatus(null);
    setMode('classify'); setVoxelResult({}); setVoxStatus('');
    for (const m of voxelMeshesRef.current) m.dispose(); voxelMeshesRef.current = [];
    for (const meshes of meshMapRef.current.values()) for (const m of meshes) m.dispose();
    meshMapRef.current.clear();
    const toDispose = scene.meshes.filter(m => m.name !== 'ground');
    for (const m of toDispose) m.dispose();
    const nodesToDispose = scene.transformNodes.filter(n => n.name !== 'cam');
    for (const n of nodesToDispose) n.dispose();

    try {
      const url = URL.createObjectURL(file);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      let result: { meshes: AbstractMesh[] };
      if (ext === 'glb' || ext === 'gltf') result = await SceneLoader.ImportMeshAsync('', url, '', scene, null, '.glb');
      else if (ext === 'obj') result = await SceneLoader.ImportMeshAsync('', url, '', scene, null, '.obj');
      else throw new Error(`Unsupported: .${ext}`);
      URL.revokeObjectURL(url);

      for (const mesh of result.meshes) { mesh.isVisible = false; mesh.isPickable = false; }

      const partMap = new Map<string, AbstractMesh[]>();
      const partConfigs: Record<string, PartConfig> = {};

      for (const mesh of result.meshes) {
        if (!mesh.name || mesh.name === '__root__') continue;
        if (mesh instanceof Mesh && mesh.getTotalVertices() === 0) continue;
        if (!(mesh instanceof Mesh)) continue;
        if (/^(armature|skeleton|bone|rig|root|null|empty|camera|light|lamp)/i.test(mesh.name.toLowerCase())) continue;
        if (mesh.getTotalVertices() < 3) continue;

        let partName = mesh.name.replace(/^mixamorig:?/i, '').replace(/\.\d+$/, '').trim();
        if (!partName) partName = mesh.name;
        if (!partMap.has(partName)) partMap.set(partName, []);
        partMap.get(partName)!.push(mesh);
        mesh.isVisible = true; mesh.isPickable = true;
      }

      for (const [name, meshes] of partMap) {
        const totalVerts = meshes.reduce((s, m) => s + (m instanceof Mesh ? m.getTotalVertices() : 0), 0);
        partConfigs[name] = { category: guessCategory(name), meshName: name, vertexCount: totalVerts, visible: true };
      }

      meshMapRef.current = partMap;
      setParts(partConfigs);
      setTPoseStatus(detectTPose(scene.skeletons));

      const bounds = scene.getWorldExtends();
      const center = bounds.min.add(bounds.max).scale(0.5);
      const size = bounds.max.subtract(bounds.min).length();
      const cam = scene.activeCamera as ArcRotateCamera;
      if (cam) { cam.target = center; cam.radius = Math.max(size * 1.2, 2); }

      scene.onPointerDown = (_evt, pick) => {
        if (pick?.hit && pick.pickedMesh) {
          for (const [pn, ms] of meshMapRef.current) {
            if (ms.includes(pick.pickedMesh)) { setSelectedPart(pn); return; }
          }
        }
      };
      setLoading(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
  }, [initialized]);

  // Highlight
  useEffect(() => {
    const hl = highlightRef.current; if (!hl) return;
    hl.removeAllMeshes();
    if (selectedPart && meshMapRef.current.has(selectedPart)) {
      for (const m of meshMapRef.current.get(selectedPart)!) if (m instanceof Mesh) hl.addMesh(m, Color3.FromHexString('#44aaff'));
    }
  }, [selectedPart]);

  // Delete key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedPart) {
        const ms = meshMapRef.current.get(selectedPart);
        if (ms) for (const m of ms) { m.isVisible = false; m.isPickable = false; }
        setParts(p => ({ ...p, [selectedPart]: { ...p[selectedPart], visible: false } }));
        setSelectedPart(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPart]);

  const toggleVisibility = (name: string) => {
    const ms = meshMapRef.current.get(name); if (!ms) return;
    setParts(p => { const n = { ...p }; n[name] = { ...n[name], visible: !n[name].visible }; for (const m of ms) m.isVisible = n[name].visible; return n; });
  };

  const setCategory = (name: string, cat: TemplateCategory) => setParts(p => ({ ...p, [name]: { ...p[name], category: cat } }));

  const exportConfig = () => {
    if (!fileName) return;
    const cfg: ImportConfig = { fileName, parts, tPoseStatus, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${fileName.replace(/\.[^.]+$/, '')}_config.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const cfg: ImportConfig = JSON.parse(reader.result as string);
        if (cfg.parts) setParts(p => { const n = { ...p }; for (const [k, v] of Object.entries(cfg.parts)) if (n[k]) n[k] = { ...n[k], category: v.category }; return n; });
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
  };

  // Toggle GLB/voxel visibility
  useEffect(() => { for (const ms of meshMapRef.current.values()) for (const m of ms) if (parts[Array.from(meshMapRef.current.entries()).find(([_, v]) => v.includes(m))?.[0] ?? '']?.visible) m.isVisible = showGlb; }, [showGlb]);
  useEffect(() => { for (const m of voxelMeshesRef.current) m.isVisible = showVoxels; }, [showVoxels]);

  // Voxelize
  const doVoxelize = useCallback(async () => {
    const scene = sceneRef.current; if (!scene) return;
    setVoxelizing(true); setVoxStatus('Starting...');
    for (const m of voxelMeshesRef.current) m.dispose(); voxelMeshesRef.current = [];
    const cx = BODY_SIZE.x / 2, cy = BODY_SIZE.y / 2;
    const results: Record<string, VoxelEntry[]> = {};
    const entries = Object.entries(parts).filter(([_, p]) => p.visible && p.category !== 'exclude' && p.category !== 'body');

    // Compute deformation bounds from body meshes
    const deformBounds = chibiEnabled ? computeModelBounds(meshMapRef.current, parts) : null;
    if (chibiEnabled && deformBounds) setVoxStatus('Chibi deform enabled');
    let i = 0;

    for (const [name, partCfg] of entries) {
      setVoxStatus(`${name} (${++i}/${entries.length})${chibiEnabled ? ' [chibi]' : ''}`);

      // Hair: headScale=1.0 (no head enlargement, matches Blender head_scale_override)
      const isHair = partCfg.category === 'hair';
      const deform = deformBounds ? { bounds: deformBounds, headScale: isHair ? 1.0 : undefined } : undefined;

      // Collect all meshes for this part
      const meshes = meshMapRef.current.get(name) ?? [];
      let partVoxels: VoxelEntry[] = [];
      for (const mesh of meshes) {
        const mv = voxelizeMesh(mesh, BODY_SIZE.x, BODY_SIZE.y, BODY_SIZE.z, cx + offX, cy + offY, offZ, voxRes * scaleMul, deform);
        partVoxels.push(...mv);
      }

      // Merge with template
      const tmplUrl = TEMPLATE_MAP[partCfg.category];
      if (tmplUrl) {
        const tmplVoxels = await loadTemplateVox(tmplUrl);
        if (tmplVoxels.length > 0 && partVoxels.length > 0) {
          const meshSet = new Set(partVoxels.map(v => `${v.x},${v.y},${v.z}`));
          for (const tv of tmplVoxels) if (!meshSet.has(`${tv.x},${tv.y},${tv.z}`)) partVoxels.push({ ...tv, r: tv.r * 0.4, g: tv.g * 0.4, b: tv.b * 0.4 });
        } else if (partVoxels.length === 0) partVoxels = tmplVoxels;
      }

      if (partVoxels.length > 0) {
        results[name] = partVoxels;
        const vm = buildVoxelMesh(partVoxels, scene, `vox_${name}`, cx, cy);
        voxelMeshesRef.current.push(vm);
      }
      await new Promise(r => setTimeout(r, 10));
    }

    setVoxelResult(results);
    setVoxelizing(false);
    const total = Object.values(results).reduce((s, a) => s + a.length, 0);
    setVoxStatus(`${Object.keys(results).length} parts, ${total} voxels`);
    setMode('voxelize');
  }, [parts, scaleMul, offX, offY, offZ, voxRes, chibiEnabled]);

  // Export vox
  const doExportAll = useCallback(() => {
    const all: VoxelEntry[] = []; for (const v of Object.values(voxelResult)) all.push(...v);
    if (all.length === 0) return;
    const seen = new Set<string>(); const dedup: VoxelEntry[] = [];
    for (const v of all) { const k = `${v.x},${v.y},${v.z}`; if (!seen.has(k)) { seen.add(k); dedup.push(v); } }
    const blob = exportVoxBlob(dedup, BODY_SIZE.x, BODY_SIZE.y, BODY_SIZE.z);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${fileName?.replace(/\.[^.]+$/, '') ?? 'output'}_voxelized.vox`; a.click();
  }, [voxelResult, fileName]);

  const doExportPart = useCallback((name: string) => {
    const v = voxelResult[name]; if (!v?.length) return;
    const blob = exportVoxBlob(v, BODY_SIZE.x, BODY_SIZE.y, BODY_SIZE.z);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.vox`; a.click();
  }, [voxelResult]);

  // Drag & drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadModel(f); };

  const partNames = Object.keys(parts).sort((a, b) => {
    const ca = parts[a].category === 'exclude' ? 1 : 0, cb = parts[b].category === 'exclude' ? 1 : 0;
    if (ca !== cb) return ca - cb; return a.localeCompare(b);
  });

  const categoryCounts: Record<string, number> = {};
  for (const p of Object.values(parts)) categoryCounts[p.category] = (categoryCounts[p.category] ?? 0) + 1;

  const hasModel = partNames.length > 0;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      {/* Left panel */}
      <div style={{ width: 380, minWidth: 380, background: '#0f0f23', color: '#ccc', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 'bold', fontSize: 16 }}>Model Import</div>
            {hasModel && (
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button onClick={() => setMode('classify')} style={{
                  padding: '3px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                  background: mode === 'classify' ? '#48f' : '#234', color: '#fff', border: 'none',
                }}>Classify</button>
                <button onClick={() => setMode('voxelize')} style={{
                  padding: '3px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                  background: mode === 'voxelize' ? '#48f' : '#234', color: '#fff', border: 'none',
                }}>Voxelize</button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <label style={{ padding: '6px 16px', borderRadius: 4, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 12 }}>
              Open File
              <input type="file" accept=".glb,.gltf,.obj" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) loadModel(f); }} />
            </label>
            {fileName && <span style={{ fontSize: 11, color: '#888', alignSelf: 'center', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</span>}
          </div>
          <div style={{ fontSize: 10, color: '#666' }}>Supported: .glb, .gltf, .obj</div>
        </div>

        {/* T-pose status */}
        {tPoseStatus && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Pose Detection</div>
            {!tPoseStatus.detected ? (
              <div style={{ fontSize: 12, color: '#888' }}>Skeleton not found</div>
            ) : tPoseStatus.isTPose ? (
              <div style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: '#1a3a1a', color: '#4c4', border: '1px solid #2a5a2a' }}>
                T-pose OK (L:{tPoseStatus.leftArmAngle} R:{tPoseStatus.rightArmAngle})
              </div>
            ) : (
              <div style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: '#3a2a1a', color: '#ca4', border: '1px solid #5a3a1a' }}>
                {tPoseStatus.poseType === 'A-pose' ? 'A-pose' : 'Non-T-pose'} (L:{tPoseStatus.leftArmAngle} R:{tPoseStatus.rightArmAngle})
                <div style={{ fontSize: 10, color: '#a86', marginTop: 2 }}>Fix in Blender: Pose Mode &rarr; Arms horizontal &rarr; Apply as Rest Pose</div>
              </div>
            )}
          </div>
        )}

        {/* MODE: CLASSIFY */}
        {mode === 'classify' && (
          <>
            {/* Category summary */}
            {hasModel && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Categories</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {CATEGORIES.filter(c => categoryCounts[c]).map(c => (
                    <span key={c} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: CATEGORY_INFO[c].color + '33', color: CATEGORY_INFO[c].color, border: `1px solid ${CATEGORY_INFO[c].color}55` }}>
                      {CATEGORY_INFO[c].labelJa} ({categoryCounts[c]})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Parts list */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading && <div style={{ padding: 16, color: '#88f' }}>Loading...</div>}
              {error && <div style={{ padding: 16, color: '#f88', fontSize: 12 }}>{error}</div>}
              {partNames.map(name => {
                const part = parts[name];
                const isSelected = selectedPart === name;
                const ci = CATEGORY_INFO[part.category];
                return (
                  <div key={name} onClick={() => setSelectedPart(name)} style={{
                    padding: '8px 12px', borderBottom: '1px solid #1a1a2e',
                    background: isSelected ? '#1a2a3a' : 'transparent', cursor: 'pointer', opacity: part.visible ? 1 : 0.4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <button onClick={e => { e.stopPropagation(); toggleVisibility(name); }} style={{
                        width: 20, height: 20, border: 'none', borderRadius: 3, background: part.visible ? '#3a3a4a' : '#222',
                        color: part.visible ? '#aaa' : '#555', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0,
                      }}>{part.visible ? '\u25C9' : '\u25CB'}</button>
                      <span style={{ fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <span style={{ fontSize: 9, color: '#666' }}>{part.vertexCount > 0 ? `${part.vertexCount}v` : ''}</span>
                    </div>
                    <select value={part.category} onClick={e => e.stopPropagation()} onChange={e => setCategory(name, e.target.value as TemplateCategory)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 3, background: ci.color + '22', color: ci.color, border: `1px solid ${ci.color}55` }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_INFO[c].labelJa} ({CATEGORY_INFO[c].label})</option>)}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Classify bottom buttons */}
            {hasModel && (
              <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ flex: 1, padding: '6px 12px', borderRadius: 4, background: '#2a2a3a', color: '#aaa', border: '1px solid #444', cursor: 'pointer', fontSize: 11, textAlign: 'center' }}>
                    Load Config
                    <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) importConfig(f); }} />
                  </label>
                  <button onClick={exportConfig} style={{ flex: 1, padding: '6px 12px', borderRadius: 4, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 11 }}>
                    Export Config
                  </button>
                </div>
                <button onClick={() => setMode('voxelize')} style={{
                  padding: '10px 16px', borderRadius: 4, background: '#253', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
                }}>
                  Next: Voxelize &rarr;
                </button>
              </div>
            )}
          </>
        )}

        {/* MODE: VOXELIZE */}
        {mode === 'voxelize' && (
          <>
            {/* Alignment */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Alignment</div>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 40px', gap: '4px', alignItems: 'center', fontSize: 11 }}>
                <span>Scale</span>
                <input type="range" min="0.1" max="5" step="0.05" value={scaleMul} onChange={e => setScaleMul(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{scaleMul.toFixed(2)}</span>
                <span>Offset X</span>
                <input type="range" min="-50" max="50" step="1" value={offX} onChange={e => setOffX(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{offX}</span>
                <span>Offset Y</span>
                <input type="range" min="-50" max="50" step="1" value={offY} onChange={e => setOffY(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{offY}</span>
                <span>Offset Z</span>
                <input type="range" min="-50" max="50" step="1" value={offZ} onChange={e => setOffZ(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{offZ}</span>
                <span>Resolution</span>
                <input type="range" min="0.005" max="0.03" step="0.001" value={voxRes} onChange={e => setVoxRes(Number(e.target.value))} />
                <span style={{ color: '#8cf' }}>{voxRes.toFixed(3)}</span>
              </div>
            </div>

            {/* Chibi deform toggle */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
              <label style={{ fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={chibiEnabled} onChange={e => setChibiEnabled(e.target.checked)} />
                <span>EC Body Chibi Deform</span>
              </label>
              <div style={{ fontSize: 9, color: '#666', marginTop: 2, marginLeft: 20 }}>
                Head 1.5-1.8x, Torso 1.1x, Legs compress+spread
              </div>
            </div>

            {/* Visibility */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: 16 }}>
              <label style={{ fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={showGlb} onChange={e => setShowGlb(e.target.checked)} /> 3D Model
              </label>
              <label style={{ fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={showVoxels} onChange={e => setShowVoxels(e.target.checked)} /> Voxels
              </label>
            </div>

            {/* Parts with voxel counts */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {Object.entries(parts).filter(([_, p]) => p.visible && p.category !== 'exclude' && p.category !== 'body').map(([name, part]) => (
                <div key={name} style={{ padding: '6px 12px', borderBottom: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_INFO[part.category].color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ fontSize: 9, color: '#666' }}>{part.category}</span>
                  {voxelResult[name] && (
                    <>
                      <span style={{ fontSize: 9, color: '#4c4' }}>{voxelResult[name].length}v</span>
                      <button onClick={() => doExportPart(name)} style={{ padding: '1px 6px', fontSize: 9, background: '#234', color: '#8cf', border: '1px solid #48f', borderRadius: 3, cursor: 'pointer' }}>
                        .vox
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Voxelize bottom */}
            <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {voxStatus && <div style={{ fontSize: 11, color: '#888' }}>{voxStatus}</div>}
              <button onClick={() => setMode('classify')} style={{
                padding: '6px 12px', borderRadius: 4, background: '#2a2a3a', color: '#aaa', border: '1px solid #444', cursor: 'pointer', fontSize: 11,
              }}>&larr; Back to Classify</button>
              <button onClick={doVoxelize} disabled={voxelizing} style={{
                padding: '10px 16px', borderRadius: 4, background: voxelizing ? '#532' : '#253',
                color: '#8cf', border: '1px solid #48f', cursor: voxelizing ? 'wait' : 'pointer', fontSize: 14, fontWeight: 'bold',
              }}>{voxelizing ? 'Voxelizing...' : 'Voxelize'}</button>
              {Object.keys(voxelResult).length > 0 && (
                <button onClick={doExportAll} style={{
                  padding: '8px 16px', borderRadius: 4, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
                }}>Export All (.vox)</button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 3D Canvas */}
      <div style={{ flex: 1, position: 'relative' }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />
        {dragOver && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(40,80,160,0.3)', border: '3px dashed #48f', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 24, color: '#8cf', fontWeight: 'bold' }}>Drop model file here</div>
          </div>
        )}
        {!fileName && !loading && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 48, color: '#333', marginBottom: 16 }}>+</div>
            <div style={{ fontSize: 16, color: '#555' }}>Drag & drop a 3D model file</div>
            <div style={{ fontSize: 12, color: '#444', marginTop: 8 }}>.glb / .gltf / .obj</div>
          </div>
        )}
        {selectedPart && parts[selectedPart] && mode === 'classify' && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: 'rgba(15,15,35,0.9)', border: '1px solid #333', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, display: 'inline-block', background: CATEGORY_INFO[parts[selectedPart].category].color }} />
              <span style={{ fontSize: 14, fontWeight: 'bold', color: '#ccc' }}>{selectedPart}</span>
              <span style={{ fontSize: 11, color: '#888' }}>{CATEGORY_INFO[parts[selectedPart].category].labelJa}</span>
              <span style={{ fontSize: 11, color: '#666' }}>{parts[selectedPart].vertexCount} vertices</span>
              <button onClick={() => setSelectedPart(null)} style={{ marginLeft: 'auto', padding: '2px 8px', border: '1px solid #555', borderRadius: 3, background: '#2a2a3a', color: '#888', cursor: 'pointer', fontSize: 11 }}>Deselect</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
