'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color3,
  Color4,
  Mesh,
  VertexData,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  ShaderMaterial,
  Effect,
} from '@babylonjs/core';

// ========================================================================
// VOX parser
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

// ========================================================================
// Types
// ========================================================================
type VoxelEntry = { x: number; y: number; z: number; r: number; g: number; b: number };
type EquipBehavior = 'synced' | 'surface' | 'gravity';

interface BodyPartDef {
  name: string;
  label: string;
  color: string;
  classify: (x: number, y: number, z: number) => boolean;
  pivotX: number | 'auto';
  pivotZ: number | 'auto';
  capLayers: number; // pyramid cap erosion stages for this part
}

interface EquipPart {
  key: string;
  file: string;
  default_on: boolean;
}

interface EquipConfig {
  enabled: Record<string, boolean>;
  behaviors: Record<string, EquipBehavior>;
}

// ========================================================================
// Body part definitions
// ========================================================================
const LIMB_PARTS: BodyPartDef[] = [
  {
    name: 'head', label: 'Head', color: '#ffaa44',
    classify: (_x, _y, z) => z >= 79,
    pivotX: 41.5, pivotZ: 79,
    capLayers: 4,
  },
  {
    name: 'leftArm', label: 'Left Arm', color: '#44aaff',
    classify: (x, _y, z) => z >= 35 && z < 79 && x < 28,
    pivotX: 'auto', pivotZ: 'auto',
    capLayers: 2,
  },
  {
    name: 'rightArm', label: 'Right Arm', color: '#ff44aa',
    classify: (x, _y, z) => z >= 35 && z < 79 && x > 54,
    pivotX: 'auto', pivotZ: 'auto',
    capLayers: 2,
  },
  {
    name: 'leftLeg', label: 'Left Leg', color: '#44ffaa',
    classify: (x, _y, z) => z < 35 && x < 41,
    pivotX: 33, pivotZ: 35,
    capLayers: 4,
  },
  {
    name: 'rightLeg', label: 'Right Leg', color: '#aaff44',
    classify: (x, _y, z) => z < 35 && x >= 41,
    pivotX: 49, pivotZ: 35,
    capLayers: 4,
  },
  {
    name: 'torso', label: 'Torso', color: '#aaaaaa',
    classify: () => true,
    pivotX: 41.5, pivotZ: 50,
    capLayers: 4,
  },
];

// ========================================================================
// Mesh building
// ========================================================================
const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_VERTS = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]],
];
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SCALE = 0.01;

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
  });
  mat.backFaceCulling = false;
  return mat;
}

function buildPartMesh(voxels: VoxelEntry[], scene: Scene, name: string, cx: number, cy: number): Mesh {
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
        positions.push((voxel.x + fv[vi][0] - cx) * SCALE, (voxel.z + fv[vi][2]) * SCALE, -(voxel.y + fv[vi][1] - cy) * SCALE);
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

// ========================================================================
// Helpers
// ========================================================================
async function loadVoxFile(url: string): Promise<{ model: VoxModel; voxels: VoxelEntry[] }> {
  const resp = await fetch(url + `?v=${Date.now()}`);
  if (!resp.ok) throw new Error(`Failed: ${url} (${resp.status})`);
  const model = parseVox(await resp.arrayBuffer());
  const voxels: VoxelEntry[] = model.voxels.map(v => {
    const col = model.palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
    return { x: v.x, y: v.y, z: v.z, r: col.r, g: col.g, b: col.b };
  });
  return { model, voxels };
}

function classifyVoxels(voxels: VoxelEntry[], partVoxels: Record<string, VoxelEntry[]>) {
  for (const v of voxels) {
    let assigned = false;
    for (const part of LIMB_PARTS) {
      if (part.name === 'torso') continue;
      if (part.classify(v.x, v.y, v.z)) { partVoxels[part.name].push(v); assigned = true; break; }
    }
    if (!assigned) partVoxels['torso'].push(v);
  }
}

const STORAGE_KEY = 'fbx-viewer-equip-config';

function loadEquipConfig(): EquipConfig | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function saveEquipConfig(config: EquipConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// ========================================================================
// Constants
// ========================================================================
const VOX_BODY_URL = '/box2/cyberpunk_elf_body_base.vox';
const VOX_PARTS_MANIFEST = '/box2/cyberpunk_elf_parts.json';


// ========================================================================
// Component
// ========================================================================
interface PartState { rotX: number; rotZ: number; }

export default function FbxViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const partNodesRef = useRef<Map<string, TransformNode>>(new Map());
  const partMeshesRef = useRef<Map<string, Mesh>>(new Map());
  const gravityNodesRef = useRef<Map<string, TransformNode>>(new Map());
  const bodyVoxelsRef = useRef<VoxelEntry[]>([]);
  const equipVoxelsRef = useRef<Map<string, VoxelEntry[]>>(new Map());
  const bodySizeRef = useRef<{ cx: number; cy: number }>({ cx: 0, cy: 0 });
  const [initialized, setInitialized] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partStates, setPartStates] = useState<Record<string, PartState>>(() => {
    const s: Record<string, PartState> = {};
    for (const p of LIMB_PARTS) s[p.name] = { rotX: 0, rotZ: 0 };
    return s;
  });
  const [partVoxelCounts, setPartVoxelCounts] = useState<Record<string, number>>({});
  const [equipList, setEquipList] = useState<EquipPart[]>([]);
  const [equipEnabled, setEquipEnabled] = useState<Record<string, boolean>>({});
  const [equipBehaviors, setEquipBehaviors] = useState<Record<string, EquipBehavior>>({});
  const [rebuildKey, setRebuildKey] = useState(0);

  // Init engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.12, 0.12, 0.18, 1);

    const ground = MeshBuilder.CreateGround('ground', { width: 6, height: 6 }, scene);
    const gMat = new StandardMaterial('gMat', scene);
    gMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
    gMat.alpha = 0.3; gMat.wireframe = true;
    ground.material = gMat;

    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 2.5, new Vector3(0, 0.5, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = 10; camera.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.7;

    sceneRef.current = scene;
    setInitialized(true);

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  // Load data
  useEffect(() => {
    if (!initialized) return;
    (async () => {
      try {
        const { model, voxels: bodyVoxels } = await loadVoxFile(VOX_BODY_URL);
        bodyVoxelsRef.current = bodyVoxels;
        bodySizeRef.current = { cx: model.sizeX / 2, cy: model.sizeY / 2 };

        const manifestResp = await fetch(VOX_PARTS_MANIFEST + `?v=${Date.now()}`);
        if (manifestResp.ok) {
          const parts: EquipPart[] = await manifestResp.json();
          const equipParts = parts.filter(p => p.key !== 'body');
          setEquipList(equipParts);

          // Load saved config or use defaults
          const saved = loadEquipConfig();
          const enabled: Record<string, boolean> = {};
          const behaviors: Record<string, EquipBehavior> = {};
          for (const p of equipParts) {
            enabled[p.key] = saved?.enabled[p.key] ?? p.default_on;
            behaviors[p.key] = saved?.behaviors[p.key] ?? 'synced';
          }
          setEquipEnabled(enabled);
          setEquipBehaviors(behaviors);

          const results = await Promise.all(
            equipParts.map(async p => {
              try { const { voxels } = await loadVoxFile(p.file); return { key: p.key, voxels }; }
              catch { return null; }
            })
          );
          const map = new Map<string, VoxelEntry[]>();
          for (const r of results) { if (r) map.set(r.key, r.voxels); }
          equipVoxelsRef.current = map;
        }
        setRebuildKey(1);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    })();
  }, [initialized]);

  // Build meshes
  useEffect(() => {
    if (rebuildKey === 0) return;
    const scene = sceneRef.current;
    if (!scene) return;

    const { cx, cy } = bodySizeRef.current;
    const bodyVoxels = bodyVoxelsRef.current;

    // Clear
    for (const m of partMeshesRef.current.values()) m.dispose();
    for (const n of partNodesRef.current.values()) n.dispose();
    for (const n of gravityNodesRef.current.values()) n.dispose();
    partMeshesRef.current.clear();
    partNodesRef.current.clear();
    gravityNodesRef.current.clear();

    // Classify body
    const partVoxels: Record<string, VoxelEntry[]> = {};
    for (const p of LIMB_PARTS) partVoxels[p.name] = [];
    classifyVoxels(bodyVoxels, partVoxels);

    // Classify equipment by behavior type
    // synced: merged into limb parts (current behavior)
    // surface/gravity: kept separate per equipment key, per limb
    const surfaceEquipByLimb: Record<string, Record<string, VoxelEntry[]>> = {};
    const gravityEquipByKey: Record<string, VoxelEntry[]> = {};

    for (const [key, voxels] of equipVoxelsRef.current) {
      if (!equipEnabled[key]) continue;
      const behavior = equipBehaviors[key] ?? 'synced';

      if (behavior === 'synced') {
        classifyVoxels(voxels, partVoxels);
      } else if (behavior === 'surface') {
        // Classify into limbs but keep separate
        const tempParts: Record<string, VoxelEntry[]> = {};
        for (const p of LIMB_PARTS) tempParts[p.name] = [];
        classifyVoxels(voxels, tempParts);
        for (const limbName of Object.keys(tempParts)) {
          if (tempParts[limbName].length === 0) continue;
          if (!surfaceEquipByLimb[limbName]) surfaceEquipByLimb[limbName] = {};
          surfaceEquipByLimb[limbName][key] = tempParts[limbName];
        }
      } else if (behavior === 'gravity') {
        gravityEquipByKey[key] = voxels;
      }
    }

    // Pyramid caps (only for synced voxels in partVoxels)
    const allOccupied = new Set<string>();
    const surfaceColorMap = new Map<string, { r: number; g: number; b: number }>();
    for (const v of bodyVoxels) {
      const k = `${v.x},${v.y},${v.z}`;
      allOccupied.add(k); surfaceColorMap.set(k, { r: v.r, g: v.g, b: v.b });
    }
    for (const voxels of Object.values(partVoxels)) {
      for (const v of voxels) allOccupied.add(`${v.x},${v.y},${v.z}`);
    }
    for (const voxels of Object.values(partVoxels)) {
      for (const v of voxels) {
        const k = `${v.x},${v.y},${v.z}`;
        const bc = surfaceColorMap.get(k);
        if (!bc || bc.r !== v.r || bc.g !== v.g || bc.b !== v.b) {
          surfaceColorMap.set(k, { r: v.r, g: v.g, b: v.b });
        }
      }
    }

    // Per-part pyramid cap generation
    for (const part of LIMB_PARTS) {
      const partName = part.name;
      const capLayers = part.capLayers;
      const thisSet = new Set<string>();
      for (const v of partVoxels[partName]) thisSet.add(`${v.x},${v.y},${v.z}`);

      interface BInfo { x: number; y: number; z: number; dx: number; dy: number; dz: number; r: number; g: number; b: number }
      const boundaries: BInfo[] = [];
      for (const v of partVoxels[partName]) {
        for (const [dx, dy, dz] of FACE_DIRS) {
          const nk = `${v.x + dx},${v.y + dy},${v.z + dz}`;
          if (allOccupied.has(nk) && !thisSet.has(nk)) {
            const sc = surfaceColorMap.get(`${v.x},${v.y},${v.z}`) ?? { r: v.r, g: v.g, b: v.b };
            boundaries.push({ x: v.x, y: v.y, z: v.z, dx, dy, dz, r: sc.r, g: sc.g, b: sc.b });
          }
        }
      }

      const dirGroups = new Map<string, BInfo[]>();
      for (const b of boundaries) {
        const dk = `${b.dx},${b.dy},${b.dz}`;
        if (!dirGroups.has(dk)) dirGroups.set(dk, []);
        dirGroups.get(dk)!.push(b);
      }

      const capVoxels: VoxelEntry[] = [];
      for (const [, group] of dirGroups) {
        const { dx, dy, dz } = group[0];
        let section = new Map<string, VoxelEntry>();
        for (const b of group) {
          const k = `${b.x},${b.y},${b.z}`;
          if (!section.has(k)) section.set(k, { x: b.x, y: b.y, z: b.z, r: b.r, g: b.g, b: b.b });
        }
        const perpDirs = FACE_DIRS.filter(([fx, fy, fz]) =>
          !(fx === dx && fy === dy && fz === dz) && !(fx === -dx && fy === -dy && fz === -dz)
        );
        let depth = 0;
        for (let stage = 0; stage < capLayers; stage++) {
          if (stage > 0) {
            const eroded = new Map<string, VoxelEntry>();
            for (const [k, v] of section) {
              let nc = 0;
              for (const [px, py, pz] of perpDirs) {
                if (section.has(`${v.x + px},${v.y + py},${v.z + pz}`)) nc++;
              }
              if (nc >= 3) eroded.set(k, v);
            }
            section = eroded;
          }
          if (section.size === 0) break;
          depth++;
          for (const [, v] of section) {
            const ck = `${v.x + dx * depth},${v.y + dy * depth},${v.z + dz * depth}`;
            if (!thisSet.has(ck)) {
              capVoxels.push({ x: v.x + dx * depth, y: v.y + dy * depth, z: v.z + dz * depth, r: v.r, g: v.g, b: v.b });
              thisSet.add(ck);
            }
          }
        }
      }
      partVoxels[partName].push(...capVoxels);
    }

    // Build meshes per limb
    const counts: Record<string, number> = {};
    for (const part of LIMB_PARTS) {
      const voxels = partVoxels[part.name];
      counts[part.name] = voxels.length;
      if (voxels.length === 0) continue;

      // Compute pivot
      let rpX = typeof part.pivotX === 'number' ? part.pivotX : 0;
      let rpZ = typeof part.pivotZ === 'number' ? part.pivotZ : 0;
      if (part.pivotX === 'auto' || part.pivotZ === 'auto') {
        const thisSet = new Set<string>();
        for (const v of voxels) thisSet.add(`${v.x},${v.y},${v.z}`);
        const bvs: VoxelEntry[] = [];
        for (const v of voxels) {
          for (const [dx, dy, dz] of FACE_DIRS) {
            if (allOccupied.has(`${v.x + dx},${v.y + dy},${v.z + dz}`) && !thisSet.has(`${v.x + dx},${v.y + dy},${v.z + dz}`)) {
              bvs.push(v); break;
            }
          }
        }
        if (bvs.length > 0) {
          if (part.pivotX === 'auto') { const xs = bvs.map(v => v.x); rpX = (Math.min(...xs) + Math.max(...xs) + 1) / 2; }
          if (part.pivotZ === 'auto') { const zs = bvs.map(v => v.z); rpZ = (Math.min(...zs) + Math.max(...zs) + 1) / 2; }
        }
      }

      const pivotX = (rpX - cx) * SCALE;
      const pivotY = rpZ * SCALE;

      const node = new TransformNode(`pivot_${part.name}`, scene);
      node.position = new Vector3(pivotX, pivotY, 0);

      const mesh = buildPartMesh(voxels, scene, `part_${part.name}`, cx, cy);
      mesh.position = new Vector3(-pivotX, -pivotY, 0);
      mesh.parent = node;

      // Surface-mounted equipment: attached to same node but rendered on top
      if (surfaceEquipByLimb[part.name]) {
        for (const [eqKey, eqVoxels] of Object.entries(surfaceEquipByLimb[part.name])) {
          const eqMesh = buildPartMesh(eqVoxels, scene, `surface_${part.name}_${eqKey}`, cx, cy);
          eqMesh.position = new Vector3(-pivotX, -pivotY, 0);
          eqMesh.renderingGroupId = 1; // render on top
          eqMesh.parent = node;
        }
      }

      // Restore rotation
      const st = partStates[part.name];
      if (st) {
        node.rotation.x = (st.rotX * Math.PI) / 180;
        node.rotation.z = (st.rotZ * Math.PI) / 180;
      }

      partNodesRef.current.set(part.name, node);
      partMeshesRef.current.set(part.name, mesh);
    }

    // Gravity-affected equipment: stays in world space, not attached to any limb
    for (const [key, voxels] of Object.entries(gravityEquipByKey)) {
      const gravNode = new TransformNode(`gravity_${key}`, scene);
      const mesh = buildPartMesh(voxels, scene, `gravity_mesh_${key}`, cx, cy);
      mesh.parent = gravNode;
      gravityNodesRef.current.set(key, gravNode);
    }

    setPartVoxelCounts(counts);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuildKey]);

  // Apply rotations
  useEffect(() => {
    for (const part of LIMB_PARTS) {
      const node = partNodesRef.current.get(part.name);
      if (!node) continue;
      const st = partStates[part.name];
      node.rotation.x = (st.rotX * Math.PI) / 180;
      node.rotation.z = (st.rotZ * Math.PI) / 180;
    }
  }, [partStates]);

  const updatePart = (name: string, field: keyof PartState, value: number) => {
    setPartStates(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));
  };

  const resetAll = () => {
    const s: Record<string, PartState> = {};
    for (const p of LIMB_PARTS) s[p.name] = { rotX: 0, rotZ: 0 };
    setPartStates(s);
  };

  const toggleEquip = (key: string) => {
    const next = { ...equipEnabled, [key]: !equipEnabled[key] };
    setEquipEnabled(next);
    saveEquipConfig({ enabled: next, behaviors: equipBehaviors });
    setRebuildKey(k => k + 1);
  };


  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      {/* Left panel */}
      <div style={{
        width: 320, minWidth: 320, background: '#0f0f23', color: '#ccc',
        borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        <div style={{ padding: '12px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', fontSize: 14 }}>Voxel Body Mover</span>
          <button onClick={resetAll} style={{
            padding: '4px 12px', borderRadius: 4, background: '#6a3a3a', color: '#eee',
            border: '1px solid #555', cursor: 'pointer', fontSize: 11,
          }}>Reset All</button>
        </div>

        {error && <div style={{ padding: 12, color: '#f88' }}>Error: {error}</div>}
        {!loaded && !error && <div style={{ padding: 12, color: '#88f' }}>Loading...</div>}

        {/* Equipment on/off toggles */}
        {equipList.length > 0 && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 'bold', fontSize: 13 }}>Equipment</span>
              <a href="/equip-config" target="_blank" style={{ fontSize: 10, color: '#68f', textDecoration: 'none' }}>
                Behavior Config →
              </a>
            </div>
            {equipList.map(ep => (
              <div key={ep.key} style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
              }}>
                <input
                  type="checkbox"
                  checked={equipEnabled[ep.key] ?? false}
                  onChange={() => toggleEquip(ep.key)}
                />
                <span style={{ fontSize: 11 }}>{ep.key}</span>
              </div>
            ))}
          </div>
        )}

        {/* Limb controls */}
        {loaded && LIMB_PARTS.filter(p => p.name !== 'torso').map(part => (
          <div key={part.name} style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, display: 'inline-block', background: part.color }} />
              <span style={{ fontWeight: 'bold', fontSize: 13 }}>{part.label}</span>
              <span style={{ color: '#888', fontSize: 11 }}>({partVoxelCounts[part.name] ?? 0})</span>
              <span style={{ color: '#666', fontSize: 9 }}>cap:{part.capLayers}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 70, fontSize: 11, color: '#aaa' }}>Forward/Back</span>
              <input type="range" min={-90} max={90} step={1}
                value={partStates[part.name].rotX}
                onChange={e => updatePart(part.name, 'rotX', Number(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ width: 36, fontSize: 11, textAlign: 'right' }}>{partStates[part.name].rotX}°</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 70, fontSize: 11, color: '#aaa' }}>Left/Right</span>
              <input type="range" min={-90} max={90} step={1}
                value={partStates[part.name].rotZ}
                onChange={e => updatePart(part.name, 'rotZ', Number(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ width: 36, fontSize: 11, textAlign: 'right' }}>{partStates[part.name].rotZ}°</span>
            </div>
          </div>
        ))}
      </div>

      <canvas ref={canvasRef} style={{ flex: 1, height: '100%', outline: 'none' }} />
    </div>
  );
}
