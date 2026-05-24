'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh, VertexBuffer,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import { buildExteriorOracle } from '@/lib/vox-mesh';

const BASE = '/api/box5/qm_mustardui';

export interface MustardUIPart {
  key: string;
  label: string;
  color: string;
}

export interface MustardUIPartGroup {
  group: string;
  parts: MustardUIPart[];
}

interface Grid {
  voxel_size: number;
  grid_origin: [number, number, number];
  gx: number; gy: number; gz: number;
}

interface Skeleton {
  armature: string;
  bone_count: number;
  bones: Array<{
    name: string;
    parent: string | null;
    use_deform: boolean;
    head_rest: [number, number, number];
    tail_rest: [number, number, number];
  }>;
}

export interface QuickPreset {
  label: string;
  /** keys that should be visible. If function, called with all keys to compute. */
  visibleKeys: (allKeys: string[]) => string[];
  /** button background color override (rgba ok) */
  bg?: string;
  /** button text color override */
  fg?: string;
}

export interface MustardUIPreviewProps {
  /** Display title in header */
  title: string;
  /** Grouped parts to render in the side panel */
  partGroups: MustardUIPartGroup[];
  /** Keys that are visible by default (others start hidden) */
  defaultVisibleKeys: string[];
  /** Quick-select buttons above the part list (optional) */
  quickPresets?: QuickPreset[];
  /** Parts considered "inside body" — skip zOffset adjustment so they stay behind body */
  insideBodyParts?: Set<string>;
  /** Per-part forward (Z) offset in meters */
  partForwardOffset?: Record<string, number>;
  /** Per-part list of MustardUI effect slot file names (loaded as <part>.<slot>.json) */
  effectSlotsPerPart?: Record<string, string[]>;
  /** Render the QM-specific MustardUI Effects panel (Blush/Tattoo/Dress) */
  showMustardUIEffects?: boolean;
  /** Key of the "body" part for exterior-oracle / effect base computations. Defaults to "body". */
  bodyKey?: string;
  /** Key of the "dress" part for dress texture number effect. Defaults to "dress". */
  dressKey?: string;
}

const DEFAULT_INSIDE_BODY_PARTS = new Set<string>();
const DEFAULT_PART_FORWARD_OFFSET: Record<string, number> = {};
const DEFAULT_EFFECT_SLOTS: Record<string, string[]> = {};

export default function MustardUIPreview({
  title,
  partGroups,
  defaultVisibleKeys,
  quickPresets,
  insideBodyParts = DEFAULT_INSIDE_BODY_PARTS,
  partForwardOffset = DEFAULT_PART_FORWARD_OFFSET,
  effectSlotsPerPart = DEFAULT_EFFECT_SLOTS,
  showMustardUIEffects = false,
  bodyKey = 'body',
  dressKey = 'dress',
}: MustardUIPreviewProps) {
  const PARTS = partGroups.flatMap(g => g.parts);
  const defaultVisibleSet = new Set(defaultVisibleKeys);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const boneLinesRef = useRef<LinesMesh | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [skel, setSkel] = useState<Skeleton | null>(null);
  const [partInfo, setPartInfo] = useState<Record<string, { voxels: number } | 'missing'>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(PARTS.map(p => [p.key, defaultVisibleSet.has(p.key)]))
  );
  const [showBones, setShowBones] = useState(false);
  const [boneFilter, setBoneFilter] = useState('');
  const [subGridForwardMm, setSubGridForwardMm] = useState(-2);

  const [blushSlider, setBlushSlider] = useState(0);
  const [tattooSlider, setTattooSlider] = useState(0);
  const [dressTexNum, setDressTexNum] = useState(1);

  const partVoxelIdxRef = useRef<Map<string, Int32Array>>(new Map());
  const partBaseColorsRef = useRef<Map<string, Float32Array>>(new Map());

  // ---- Scene init ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.08, 0.12, 1);
    scene.useRightHandedSystem = true;
    sceneRef.current = scene;

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.5,
      new Vector3(0, 0.85, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.3;
    cam.upperRadiusLimit = 15;
    cam.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4, subdivisions: 8 }, scene);
    ground.position.y = -0.014;
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    ground.material = gm;

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ---- Load grid + skeleton ----
  useEffect(() => {
    (async () => {
      const gr = await fetch(`${BASE}/grid.json`).then(r => r.ok ? r.json() : null);
      const sk = await fetch(`${BASE}/skeleton.json`).then(r => r.ok ? r.json() : null);
      setGrid(gr);
      setSkel(sk);
    })();
  }, []);

  // ---- Parts raw data cache ----
  type PartGrid = Grid & {
    scale_factor?: number;
    chunks?: Array<{ vox_file: string; grid_origin: [number, number, number]; gx: number; gy: number; gz: number; voxel_count?: number }>;
  };
  type ChunkData = {
    gridOrigin: [number, number, number];
    model: ReturnType<typeof parseVox>;
  };
  type EffectSamples = Map<string, [number, number, number, number]>;
  type PartData = {
    partGrid: PartGrid | null;
    chunks: ChunkData[];
    internalVoxelWorldCenters?: Array<[number, number, number]>;
    effects?: { [slot: string]: EffectSamples };
  };
  const partsDataRef = useRef<Map<string, PartData>>(new Map());
  const [partsReady, setPartsReady] = useState(false);

  // ---- Phase 1: Load all parts raw data ----
  useEffect(() => {
    if (!grid) return;
    setPartsReady(false);

    (async () => {
      const partsData = new Map<string, PartData>();
      await Promise.all(PARTS.map(async p => {
        const partGridResp = await fetch(`${BASE}/${p.key}.grid.json?v=${Date.now()}`);
        const partGrid = partGridResp.ok ? await partGridResp.json() as PartGrid : null;
        const useGrid = partGrid ?? grid;
        const chunkSpecs = partGrid?.chunks
          ? partGrid.chunks.map(c => ({ vox_file: c.vox_file, grid_origin: c.grid_origin }))
          : [{ vox_file: `${p.key}.vox`, grid_origin: useGrid.grid_origin }];
        const chunks: ChunkData[] = [];
        for (const cs of chunkSpecs) {
          const resp = await fetch(`${BASE}/${cs.vox_file}?v=${Date.now()}`);
          if (!resp.ok) continue;
          const model = parseVox(await resp.arrayBuffer());
          chunks.push({ gridOrigin: cs.grid_origin, model });
        }
        let internalVoxelWorldCenters: Array<[number, number, number]> | undefined;
        let effects: { [slot: string]: EffectSamples } | undefined;
        if (p.key === bodyKey) {
          try {
            const ivResp = await fetch(`${BASE}/${p.key}.internal_voxels.json?v=${Date.now()}`);
            if (ivResp.ok) {
              const iv = await ivResp.json() as {
                voxel_size: number;
                grid_origin: [number, number, number];
                internal_voxels: number[][];
              };
              const [gox, goy, goz] = iv.grid_origin;
              const ivs = iv.voxel_size;
              internalVoxelWorldCenters = iv.internal_voxels.map(([ix, iy, iz]) => [
                gox + (ix + 0.5) * ivs,
                goy + (iy + 0.5) * ivs,
                goz + (iz + 0.5) * ivs,
              ] as [number, number, number]);
            }
          } catch { /* skip */ }
        }

        const slots = effectSlotsPerPart[p.key];
        if (slots && slots.length > 0) {
          effects = {};
          for (const slot of slots) {
            try {
              const r = await fetch(`${BASE}/${p.key}.${slot}.json?v=${Date.now()}`);
              if (!r.ok) continue;
              const data = await r.json() as { samples: number[][] };
              const map: EffectSamples = new Map();
              for (const s of data.samples) {
                map.set(`${s[0]},${s[1]},${s[2]}`, [s[3], s[4], s[5], s[6]]);
              }
              effects[slot] = map;
            } catch { /* skip */ }
          }
        }

        partsData.set(p.key, { partGrid, chunks, internalVoxelWorldCenters, effects });
      }));
      partsDataRef.current = partsData;
      setPartsReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  // ---- Build meshes ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !grid || !partsReady) return;

    const bToB = (bx: number, by: number, bz: number): [number, number, number] =>
      [bx, bz, -by];

    const info: Record<string, { voxels: number } | 'missing'> = {};
    const partsData = partsDataRef.current;
    const bodyHideSet = new Set<string>();

    for (const p of PARTS) {
      const data = partsData.get(p.key);
      if (!data || data.chunks.length === 0) {
        info[p.key] = 'missing';
        continue;
      }
      const isBody = p.key === bodyKey;
      if (meshMapRef.current.has(p.key)) {
        let c = 0;
        for (const ch of data.chunks) c += ch.model.voxels.length;
        info[p.key] = { voxels: c };
        continue;
      }

      const partGrid = data.partGrid;
      const useGrid = partGrid ?? grid;
      const vs = useGrid.voxel_size;
      const isSubGrid = partGrid !== null;

      let totalVoxels = 0;
      const positions: number[] = [];
      const normals: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];

      const bodyOracle = isBody
        ? buildExteriorOracle(
            data.chunks.map(ch => ({ origin: ch.gridOrigin, voxels: ch.model.voxels })),
            vs,
            2,
            data.internalVoxelWorldCenters,
          )
        : null;

      const hasEffects = !!(data.effects && Object.keys(data.effects).length > 0);
      const partVoxelIdx: number[] = hasEffects ? [] : (null as unknown as number[]);
      const subGridOrigin: [number, number, number] = [
        useGrid.grid_origin[0], useGrid.grid_origin[1], useGrid.grid_origin[2],
      ];

      for (const chunk of data.chunks) {
        const { model, gridOrigin: origin } = chunk;
        const occupied = new Set<string>();
        for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);

        const chunkOfx = Math.round((origin[0] - subGridOrigin[0]) / vs);
        const chunkOfy = Math.round((origin[1] - subGridOrigin[1]) / vs);
        const chunkOfz = Math.round((origin[2] - subGridOrigin[2]) / vs);

        for (const voxel of model.voxels) {
          if (isBody && bodyHideSet.has(`${voxel.x},${voxel.y},${voxel.z}`)) continue;
          const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
          const fullIx = voxel.x + chunkOfx;
          const fullIy = voxel.y + chunkOfy;
          const fullIz = voxel.z + chunkOfz;
          for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = FACE_DIRS[f];
            if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
            if (bodyOracle) {
              const nwx = origin[0] + (voxel.x + dx + 0.5) * vs;
              const nwy = origin[1] + (voxel.y + dy + 0.5) * vs;
              const nwz = origin[2] + (voxel.z + dz + 0.5) * vs;
              if (!bodyOracle.isExteriorWorldCell(nwx, nwy, nwz)) continue;
            }
            const bi = positions.length / 3;
            const fv = FACE_VERTS[f];
            const fn = FACE_NORMALS[f];
            const [nx, ny, nz] = bToB(fn[0], fn[1], fn[2]);
            for (let vi = 0; vi < 4; vi++) {
              const [lx, ly, lz] = fv[vi];
              const bx = origin[0] + (voxel.x + lx) * vs;
              const by = origin[1] + (voxel.y + ly) * vs;
              const bz = origin[2] + (voxel.z + lz) * vs;
              const [wx, wy, wz] = bToB(bx, by, bz);
              positions.push(wx, wy, wz);
              normals.push(nx, ny, nz);
              colors.push(col.r, col.g, col.b, 1);
              if (hasEffects) partVoxelIdx.push(fullIx, fullIy, fullIz);
            }
            indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
          }
        }
        totalVoxels += model.voxels.length;
      }

      if (hasEffects) {
        partVoxelIdxRef.current.set(p.key, new Int32Array(partVoxelIdx));
        partBaseColorsRef.current.set(p.key, new Float32Array(colors));
      }

      if (totalVoxels === 0 || positions.length === 0) {
        info[p.key] = 'missing';
        continue;
      }

      const vd = new VertexData();
      vd.positions = positions;
      vd.normals = normals;
      vd.colors = colors;
      vd.indices = indices;

      const mesh = new Mesh(`part_${p.key}`, scene);
      vd.applyToMesh(mesh, hasEffects);

      const mat = new StandardMaterial(`mat_${p.key}`, scene);
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);
      if (isBody) {
        mat.disableLighting = true;
        mat.emissiveColor = Color3.White();
      }
      const isInside = insideBodyParts.has(p.key);
      if (!isInside) {
        if (isSubGrid) {
          mat.zOffset = -2;
          mesh.metadata = { isSubGrid: true };
        } else if (!isBody) {
          mat.zOffset = -1;
        }
      }
      mesh.material = mat;

      const fwd = partForwardOffset[p.key];
      if (fwd) mesh.position.z = fwd;

      const prev = meshMapRef.current.get(p.key);
      if (prev) prev.dispose();
      meshMapRef.current.set(p.key, mesh);
      mesh.isVisible = visible[p.key] ?? true;

      info[p.key] = { voxels: totalVoxels };
    }
    setPartInfo(prev => ({ ...prev, ...info }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, partsReady]);

  // ---- Cleanup ----
  useEffect(() => {
    return () => {
      meshMapRef.current.forEach(m => m.dispose());
      meshMapRef.current.clear();
    };
  }, []);

  // ---- Toggle visibility ----
  useEffect(() => {
    meshMapRef.current.forEach((m, key) => { m.isVisible = !!visible[key]; });
  }, [visible, partInfo]);

  // ---- MustardUI Blush/Tattoo ----
  useEffect(() => {
    if (!showMustardUIEffects) return;
    const mesh = meshMapRef.current.get(bodyKey);
    const baseColors = partBaseColorsRef.current.get(bodyKey);
    const voxelIdx = partVoxelIdxRef.current.get(bodyKey);
    if (!mesh || !baseColors || !voxelIdx) return;
    const effects = partsDataRef.current.get(bodyKey)?.effects;
    if (!effects) return;

    const blush = effects.blush_color;
    const tattoo = effects.tattoo_color;
    const numVerts = baseColors.length / 4;
    const newColors = new Float32Array(baseColors.length);
    const blushOn = blush && blushSlider > 0;
    const tattooOn = tattoo && tattooSlider > 0;

    for (let i = 0; i < numVerts; i++) {
      let r = baseColors[i * 4], g = baseColors[i * 4 + 1], b = baseColors[i * 4 + 2];
      const a = baseColors[i * 4 + 3];
      if (blushOn || tattooOn) {
        const key = `${voxelIdx[i * 3]},${voxelIdx[i * 3 + 1]},${voxelIdx[i * 3 + 2]}`;
        if (blushOn) {
          const s = blush!.get(key);
          if (s) {
            const aMask = (s[3] / 255) * blushSlider;
            r = r * (1 - aMask) + (s[0] / 255) * aMask;
            g = g * (1 - aMask) + (s[1] / 255) * aMask;
            b = b * (1 - aMask) + (s[2] / 255) * aMask;
          }
        }
        if (tattooOn) {
          const s = tattoo!.get(key);
          if (s) {
            const aMask = (s[3] / 255) * tattooSlider;
            r = r * (1 - aMask) + (s[0] / 255) * aMask;
            g = g * (1 - aMask) + (s[1] / 255) * aMask;
            b = b * (1 - aMask) + (s[2] / 255) * aMask;
          }
        }
      }
      newColors[i * 4] = r; newColors[i * 4 + 1] = g; newColors[i * 4 + 2] = b; newColors[i * 4 + 3] = a;
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true);
  }, [blushSlider, tattooSlider, partInfo, showMustardUIEffects, bodyKey]);

  // ---- Dress Texture Number ----
  useEffect(() => {
    if (!showMustardUIEffects) return;
    const mesh = meshMapRef.current.get(dressKey);
    const baseColors = partBaseColorsRef.current.get(dressKey);
    const voxelIdx = partVoxelIdxRef.current.get(dressKey);
    if (!mesh || !baseColors || !voxelIdx) return;
    const effects = partsDataRef.current.get(dressKey)?.effects;

    const numVerts = baseColors.length / 4;
    const newColors = new Float32Array(baseColors.length);

    const variant = dressTexNum === 2 ? effects?.dress_color_red
                  : dressTexNum === 3 ? effects?.dress_color_white
                  : null;

    if (!variant) {
      newColors.set(baseColors);
    } else {
      for (let i = 0; i < numVerts; i++) {
        const r0 = baseColors[i * 4], g0 = baseColors[i * 4 + 1], b0 = baseColors[i * 4 + 2];
        const a0 = baseColors[i * 4 + 3];
        const key = `${voxelIdx[i * 3]},${voxelIdx[i * 3 + 1]},${voxelIdx[i * 3 + 2]}`;
        const s = variant.get(key);
        if (s && s[3] > 0) {
          newColors[i * 4] = s[0] / 255;
          newColors[i * 4 + 1] = s[1] / 255;
          newColors[i * 4 + 2] = s[2] / 255;
          newColors[i * 4 + 3] = a0;
        } else {
          newColors[i * 4] = r0; newColors[i * 4 + 1] = g0; newColors[i * 4 + 2] = b0; newColors[i * 4 + 3] = a0;
        }
      }
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true);
  }, [dressTexNum, partInfo, showMustardUIEffects, dressKey]);

  // ---- Sub-grid forward offset ----
  useEffect(() => {
    const dz = subGridForwardMm / 1000;
    meshMapRef.current.forEach(m => {
      if (m.metadata?.isSubGrid) m.position.z = dz;
    });
  }, [subGridForwardMm, partInfo]);

  // ---- Bones ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !skel) return;
    if (boneLinesRef.current) {
      boneLinesRef.current.dispose();
      boneLinesRef.current = null;
    }
    if (!showBones) return;

    const toBabylon = (p: [number, number, number]) =>
      new Vector3(p[0], p[2], -p[1]);

    const filter = boneFilter.trim().toLowerCase();
    const lines: Vector3[][] = [];
    const colorArr: Color4[][] = [];
    for (const b of skel.bones) {
      if (filter && !b.name.toLowerCase().includes(filter)) continue;
      const h = toBabylon(b.head_rest);
      const t = toBabylon(b.tail_rest);
      lines.push([h, t]);
      let c = new Color4(0.5, 0.9, 0.6, 1);
      const ln = b.name.toLowerCase();
      if (ln.includes('hair_braid')) c = new Color4(1, 0.6, 0.2, 1);
      else if (ln.includes('dress_front')) c = new Color4(1, 0.4, 0.9, 1);
      else if (ln.includes('belt_tail')) c = new Color4(1, 1, 0.4, 1);
      else if (ln.includes('breast')) c = new Color4(1, 0.5, 0.7, 1);
      else if (ln.includes('butt') || ln.includes('genital')) c = new Color4(0.8, 0.5, 1, 1);
      else if (ln.includes('simplicage')) c = new Color4(0.4, 0.7, 1, 1);
      colorArr.push([c, c]);
    }
    const lm = MeshBuilder.CreateLineSystem('bone_lines', {
      lines, colors: colorArr, updatable: false,
    }, scene);
    lm.isPickable = false;
    boneLinesRef.current = lm;
  }, [skel, showBones, boneFilter]);

  const boneStats = (() => {
    if (!skel) return null;
    let hair = 0, dress = 0, belt = 0, breast = 0, butt = 0, cage = 0, other = 0;
    for (const b of skel.bones) {
      const n = b.name.toLowerCase();
      if (n.includes('hair_braid')) hair++;
      else if (n.includes('dress_front') || n.includes('dress_back')) dress++;
      else if (n.includes('belt_tail')) belt++;
      else if (n.includes('breast') || n.includes('nipple')) breast++;
      else if (n.includes('butt') || n.includes('genital')) butt++;
      else if (n.includes('simplicage')) cage++;
      else other++;
    }
    return { hair, dress, belt, breast, butt, cage, other, total: skel.bones.length };
  })();

  return (
    <div style={{ display: 'flex', height: '100vh',
                  background: '#12121f', color: '#ddd', fontFamily: 'monospace' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)',
                      borderBottom: '1px solid #333' }}>
          <span style={{ color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
            {title}
          </span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
            game-assets/vox-model/box5/qm_mustardui/
          </span>
          {grid && (
            <span style={{ fontSize: 10, color: '#666', marginLeft: 12 }}>
              grid: {grid.gx}×{grid.gy}×{grid.gz}, size={grid.voxel_size.toFixed(5)}
            </span>
          )}
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      <div style={{ width: 280, padding: 12, background: 'rgba(0,0,0,0.4)',
                    borderLeft: '1px solid #333', overflowY: 'auto' }}>
        {quickPresets && quickPresets.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {quickPresets.map((preset, i) => (
              <button
                key={i}
                onClick={() => {
                  const allKeys = PARTS.map(p => p.key);
                  const onSet = new Set(preset.visibleKeys(allKeys));
                  setVisible(Object.fromEntries(allKeys.map(k => [k, onSet.has(k)])));
                }}
                style={{
                  flex: 1, minWidth: 100, padding: '6px 8px', fontSize: 10,
                  border: '1px solid #555', borderRadius: 3,
                  background: preset.bg ?? 'rgba(60,40,80,0.5)',
                  color: preset.fg ?? '#fcf',
                  cursor: 'pointer', fontFamily: 'monospace',
                }}>
                {preset.label}
              </button>
            ))}
          </div>
        )}
        {partGroups.map(g => (
          <div key={g.group} style={{ marginBottom: 10 }}>
            <h3 style={{
              fontSize: 12, margin: '0 0 6px', color: '#8fa',
              borderBottom: '1px solid #334', paddingBottom: 2,
            }}>{g.group}</h3>
            {g.parts.map(p => {
              const info = partInfo[p.key];
              const exists = info && info !== 'missing';
              return (
                <label key={p.key} style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  padding: '4px 6px', marginBottom: 2,
                  borderRadius: 3,
                  background: exists ? 'rgba(30,30,50,0.6)' : 'rgba(40,20,20,0.4)',
                  opacity: exists ? 1 : 0.5,
                  cursor: exists ? 'pointer' : 'default',
                  userSelect: 'none',
                }}>
                  <input type="checkbox" disabled={!exists}
                    checked={!!visible[p.key]}
                    onChange={e => setVisible(v => ({ ...v, [p.key]: e.target.checked }))} />
                  <span style={{
                    display: 'inline-block', width: 10, height: 10,
                    background: p.color, borderRadius: 2,
                  }} />
                  <span style={{ flex: 1 }}>{p.label}</span>
                  <span style={{ color: '#666', fontSize: 10 }}>
                    {exists ? `${info.voxels}` : '–'}
                  </span>
                </label>
              );
            })}
          </div>
        ))}

        <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#fa8' }}>Bones</h3>
        {boneStats && (
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 8, lineHeight: 1.6 }}>
            Total: <b>{boneStats.total}</b> deform bones<br />
            hair_braid: <b>{boneStats.hair}</b> (orange)<br />
            dress_front/back: <b>{boneStats.dress}</b> (magenta)<br />
            belt_tail: <b>{boneStats.belt}</b> (yellow)<br />
            breast/nipple: <b>{boneStats.breast}</b> (pink)<br />
            butt/genital: <b>{boneStats.butt}</b> (purple)<br />
            simplicage: <b>{boneStats.cage}</b> (cyan)<br />
            other body: <b>{boneStats.other}</b> (green)
          </div>
        )}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
          color: '#aaa', cursor: 'pointer', marginBottom: 6,
        }}>
          <input type="checkbox" checked={showBones}
            onChange={e => setShowBones(e.target.checked)} />
          Show bones
        </label>
        <input type="text" placeholder="filter name (e.g., hair, dress, belt)"
          value={boneFilter} onChange={e => setBoneFilter(e.target.value)}
          style={{
            width: '100%', padding: 5, fontSize: 10,
            background: '#222', color: '#ddd', border: '1px solid #444',
            borderRadius: 3, fontFamily: 'monospace',
          }} />

        {showMustardUIEffects && (
          <>
            <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#fa8' }}>MustardUI Effects</h3>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>
              頂点色を per-voxel ベイクテクスチャと lerp ブレンド
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#ddd', marginBottom: 2 }}>
                Blush (Head): <b>{blushSlider.toFixed(2)}</b>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={blushSlider}
                onChange={e => setBlushSlider(parseFloat(e.target.value))}
                style={{ width: '100%' }} />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#ddd', marginBottom: 2 }}>
                Tattoo Color (Body): <b>{tattooSlider.toFixed(2)}</b>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={tattooSlider}
                onChange={e => setTattooSlider(parseFloat(e.target.value))}
                style={{ width: '100%' }} />
            </div>

            <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
              ※ Tattoo Emissive は per-voxel emissive 描画が必要 (Phase 2-D, スキップ)
            </div>

            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334' }}>
              <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
                Dress Texture Number (要 Dress 表示):
              </div>
              {[
                { num: 1, label: '1: Default' },
                { num: 2, label: '2: Red' },
                { num: 3, label: '3: White' },
              ].map(({ num, label }) => (
                <label key={num} style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  padding: '2px 4px', cursor: 'pointer',
                }}>
                  <input type="radio" name="dress_tex_num"
                    checked={dressTexNum === num}
                    onChange={() => setDressTexNum(num)} />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}

        <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#fa8' }}>Sub-grid Offset</h3>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>
          顔パーツ (x2/x4) を character 前方 (+Z) に押し出す量
        </div>
        <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
          Forward: <b>{subGridForwardMm.toFixed(1)} mm</b>
        </div>
        <input type="range" min={-20} max={30} step={0.5} value={subGridForwardMm}
          onChange={e => setSubGridForwardMm(parseFloat(e.target.value))}
          style={{ width: '100%' }} />

        <div style={{ marginTop: 20, padding: 8, fontSize: 10,
                      background: 'rgba(0,0,0,0.3)', borderRadius: 4, color: '#888' }}>
          Files under <b>game-assets/vox-model/box5/qm_mustardui/</b>.<br/>
          Reload (Ctrl+Shift+R) after adding new parts.
        </div>
      </div>
    </div>
  );
}
