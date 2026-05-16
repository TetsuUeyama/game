'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

const BASE = '/box5/rachel_native';

interface OutfitDef {
  key: string;
  label: string;
  color: string;
}
const OUTFITS: OutfitDef[] = [
  // Hair & face
  { key: 'hair',           label: 'Hair',           color: '#fa8' },
  { key: 'brows',          label: 'Brows',          color: '#532' },
  { key: 'eyeslashes',     label: 'Eyelashes',      color: '#222' },
  // Underwear
  { key: 'casual_thong',   label: 'Casual Thong',   color: '#1a1a1a' },
  { key: 'casual_bra',     label: 'Casual Bra',     color: '#1a1a1a' },
  { key: 'panties2',       label: 'Panties (2)',    color: '#8a6eb3' },
  // Chest covers
  { key: 'breasts_top',    label: 'Breasts Top',    color: '#8b62b3' },
  { key: 'chest_cover',    label: 'Chest Cover',    color: '#825fb3' },
  // Arms
  { key: 'gloves_l',       label: 'Gloves L',       color: '#404040' },
  { key: 'gloves_r',       label: 'Gloves R',       color: '#404040' },
  { key: 'arm_r',          label: 'Arm R (jewel)',  color: '#c80' },
  { key: 'arms',           label: 'Arms (cloth)',   color: '#888' },
  { key: 'shoulder_strap', label: 'Shoulder Strap', color: '#474040' },
  { key: 'shoulder',       label: 'Shoulder',       color: '#444' },
  // Torso / waist
  { key: 'belt',           label: 'Belt',           color: '#727272' },
  { key: 'neck',           label: 'Neck',           color: '#666' },
  { key: 'suit',           label: 'Suit',           color: '#553' },
  { key: 'suit2',          label: 'Suit (2)',       color: '#553' },
  { key: 'su_uniform',     label: 'SU Uniform',     color: '#883' },
  // Legs / feet
  { key: 'boots',          label: 'Boots',          color: '#321' },
  { key: 'botforts',       label: 'Botforts',       color: '#432' },
  // Accessories
  { key: 'rings',          label: 'Rings',          color: '#fc8' },
  { key: 'rings3',         label: 'Rings (3)',      color: '#fc8' },
  { key: 'headgear',       label: 'Headgear',       color: '#864' },
  { key: 'headgear2',      label: 'Headgear (2)',   color: '#864' },
  { key: 'item_l',         label: 'Item L',         color: '#532' },
  { key: 'item_r',         label: 'Item R',         color: '#532' },
  { key: 'gem',            label: 'Gem',            color: '#c4c' },
];

interface Grid {
  voxel_size: number;
  grid_origin: [number, number, number];
  gx: number; gy: number; gz: number;
}

interface SkeletonBone {
  name: string;
  parent: string | null;
  use_deform: boolean;
  head_rest: [number, number, number];
  tail_rest: [number, number, number];
}
interface Skeleton {
  armature: string;
  bone_count: number;
  bones: SkeletonBone[];
}

// Blender (Z-up, right-handed) → Babylon (Y-up, right-handed): (bx, bz, -by)
const bToB = (bx: number, by: number, bz: number): [number, number, number] => [bx, bz, -by];

export default function RachelNativePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<{
    engine?: Engine;
    scene?: Scene;
    cam?: ArcRotateCamera;
    bodyMesh?: Mesh | null;
    boneLines?: LinesMesh | null;
    outfitMeshes?: Map<string, Mesh>;
    grid?: Grid;
    bodyVoxRaw?: ReturnType<typeof parseVox>;
    outfitCells?: Map<string, Set<string>>;
  }>({});

  const [showMesh, setShowMesh] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [outfitVisible, setOutfitVisible] = useState<Record<string, boolean>>(() => ({}));
  const [status, setStatus] = useState('loading...');

  // ---- Build voxel mesh ----
  const buildVoxelMesh = useCallback((
    scene: Scene, name: string, voxels: ReturnType<typeof parseVox>['voxels'],
    palette: ReturnType<typeof parseVox>['palette'],
    origin: [number, number, number], voxelSize: number,
    excludeCells?: Set<string>,
  ): Mesh => {
    const occ = new Set<string>();
    for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (const v of voxels) {
      if (excludeCells && excludeCells.has(`${v.x},${v.y},${v.z}`)) continue;
      const col = palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = FACE_DIRS[f];
        if (occ.has(`${v.x + dx},${v.y + dy},${v.z + dz}`)) continue;
        const bi = positions.length / 3;
        const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
        const [nx, ny, nz] = bToB(fn[0], fn[1], fn[2]);
        for (let vi = 0; vi < 4; vi++) {
          const [lx, ly, lz] = fv[vi];
          const bx = origin[0] + (v.x + lx) * voxelSize;
          const by = origin[1] + (v.y + ly) * voxelSize;
          const bz = origin[2] + (v.z + lz) * voxelSize;
          const [wx, wy, wz] = bToB(bx, by, bz);
          positions.push(wx, wy, wz);
          normals.push(nx, ny, nz);
          colors.push(col.r, col.g, col.b, 1);
        }
        indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
      }
    }

    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.colors = colors;
    vd.indices = indices;
    const mesh = new Mesh(name, scene);
    vd.applyToMesh(mesh);
    const mat = new StandardMaterial(`${name}_mat`, scene);
    mat.disableLighting = true;
    mat.emissiveColor = Color3.White();
    mat.backFaceCulling = false;
    mat.specularColor = Color3.Black();
    mesh.material = mat;
    return mesh;
  }, []);

  const buildBoneLines = useCallback((
    scene: Scene, name: string, skel: Skeleton, accent: string,
  ): LinesMesh => {
    const toBabylon = (p: [number, number, number]) => new Vector3(p[0], p[2], -p[1]);
    const lines: Vector3[][] = [];
    const colorArr: Color4[][] = [];
    const accentRGB = Color3.FromHexString(accent);
    const ac = new Color4(accentRGB.r, accentRGB.g, accentRGB.b, 1);
    for (const b of skel.bones) {
      lines.push([toBabylon(b.head_rest), toBabylon(b.tail_rest)]);
      colorArr.push([ac, ac]);
    }
    const lm = MeshBuilder.CreateLineSystem(name, { lines, colors: colorArr, updatable: false }, scene);
    lm.isPickable = false;
    return lm;
  }, []);

  // ---- Init scene + load voxels ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.78, 0.80, 0.84, 1);
    scene.useRightHandedSystem = true;

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0,
      new Vector3(0, 0.95, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.3;
    cam.upperRadiusLimit = 15;
    cam.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.5;

    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4, subdivisions: 8 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.55, 0.57, 0.62);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;
    ground.position.y = -0.005;

    engine.runRenderLoop(() => scene.render());
    sceneRef.current = { engine, scene, cam };

    const load = async () => {
      try {
        const bust = `?v=${Date.now()}`;
        const [gridResp, voxResp, skelResp] = await Promise.all([
          fetch(`${BASE}/grid.json${bust}`),
          fetch(`${BASE}/body.vox${bust}`),
          fetch(`${BASE}/skeleton.json${bust}`),
        ]);
        if (!gridResp.ok || !voxResp.ok) {
          setStatus('missing body voxel/grid'); return;
        }
        const grid: Grid = await gridResp.json();
        sceneRef.current.grid = grid;
        const voxBody = parseVox(await voxResp.arrayBuffer());
        sceneRef.current.bodyVoxRaw = voxBody;

        const bodyMesh = buildVoxelMesh(
          scene, 'body', voxBody.voxels, voxBody.palette,
          grid.grid_origin, grid.voxel_size,
        );
        sceneRef.current.bodyMesh = bodyMesh;

        let nBones = 0;
        if (skelResp.ok) {
          const skel: Skeleton = await skelResp.json();
          nBones = skel.bones.length;
          const lm = buildBoneLines(scene, 'bones', skel, '#fda');
          lm.isVisible = false;
          sceneRef.current.boneLines = lm;
        }

        // Load outfits
        const outfitMeshes = new Map<string, Mesh>();
        const outfitCells = new Map<string, Set<string>>();
        for (const o of OUTFITS) {
          try {
            const r = await fetch(`${BASE}/${o.key}.vox${bust}`);
            if (!r.ok) continue;
            const ofModel = parseVox(await r.arrayBuffer());
            if (ofModel.voxels.length === 0) continue;
            const om = buildVoxelMesh(
              scene, `outfit_${o.key}`,
              ofModel.voxels, ofModel.palette,
              grid.grid_origin, grid.voxel_size,
            );
            om.isVisible = false;
            outfitMeshes.set(o.key, om);
            // Hair excluded from body-hide (sits above body)
            const isHair = o.key === 'hair';
            if (!isHair) {
              const cells = new Set<string>();
              for (const v of ofModel.voxels) cells.add(`${v.x},${v.y},${v.z}`);
              outfitCells.set(o.key, cells);
            }
          } catch (e) {
            console.warn(`outfit ${o.key} failed`, e);
          }
        }
        sceneRef.current.outfitMeshes = outfitMeshes;
        sceneRef.current.outfitCells = outfitCells;

        // Status
        let mnX = Infinity, mxX = -Infinity;
        let mnY = Infinity, mxY = -Infinity;
        let mnZ = Infinity, mxZ = -Infinity;
        for (const v of voxBody.voxels) {
          if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
          if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
          if (v.z < mnZ) mnZ = v.z; if (v.z > mxZ) mxZ = v.z;
        }
        const wMm = ((mxX - mnX + 1) * grid.voxel_size * 1000).toFixed(0);
        const dMm = ((mxY - mnY + 1) * grid.voxel_size * 1000).toFixed(0);
        const hMm = ((mxZ - mnZ + 1) * grid.voxel_size * 1000).toFixed(0);
        setStatus(
          `body ${voxBody.voxels.length} · ${wMm}×${dMm}×${hMm}mm` +
          (nBones ? ` · ${nBones} bones` : '') +
          ` · ${outfitMeshes.size} outfits`
        );
      } catch (e) {
        console.error('load failed', e);
        setStatus(`error: ${(e as Error).message ?? e}`);
      }
    };
    void load();

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      sceneRef.current.bodyMesh?.dispose();
      sceneRef.current.boneLines?.dispose();
      sceneRef.current.outfitMeshes?.forEach(m => m.dispose());
      engine.dispose();
      sceneRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Toggle body visibility ----
  useEffect(() => {
    const m = sceneRef.current.bodyMesh;
    if (m) m.isVisible = showMesh;
  }, [showMesh]);

  // ---- Toggle skeleton visibility ----
  useEffect(() => {
    const lm = sceneRef.current.boneLines;
    if (lm) lm.isVisible = showSkeleton;
  }, [showSkeleton]);

  // ---- Toggle outfit visibility + body hide ----
  useEffect(() => {
    const state = sceneRef.current;
    if (state.outfitMeshes) {
      state.outfitMeshes.forEach((m, key) => { m.isVisible = !!outfitVisible[key]; });
    }
    if (state.bodyVoxRaw && state.outfitCells && state.scene && state.grid) {
      const exclusion = new Set<string>();
      state.outfitCells.forEach((cells, key) => {
        if (outfitVisible[key]) cells.forEach(c => exclusion.add(c));
      });
      state.bodyMesh?.dispose();
      const newMesh = buildVoxelMesh(
        state.scene, 'body',
        state.bodyVoxRaw.voxels, state.bodyVoxRaw.palette,
        state.grid.grid_origin, state.grid.voxel_size,
        exclusion,
      );
      newMesh.isVisible = showMesh;
      state.bodyMesh = newMesh;
    }
  }, [outfitVisible, buildVoxelMesh, showMesh]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#c7ccd6', color: '#1a1a1a', fontFamily: 'monospace',
    }}>
      <div style={{
        padding: '8px 14px', background: 'rgba(255,255,255,0.5)',
        borderBottom: '1px solid #999', display: 'flex',
        alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <span style={{ color: '#234', fontSize: 13, fontWeight: 'bold' }}>
          Rachel Native Voxelization
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showMesh}
            onChange={e => setShowMesh(e.target.checked)} />
          Show body
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showSkeleton}
            onChange={e => setShowSkeleton(e.target.checked)} />
          Show skeleton (909 bones)
        </label>
        <span style={{ fontSize: 10, color: '#456', marginLeft: 'auto' }}>
          {status} · drag to rotate · wheel to zoom
        </span>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
        />
      </div>

      <div style={{
        padding: '6px 14px', background: 'rgba(255,255,255,0.45)',
        borderTop: '1px solid #999', display: 'flex',
        alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#234', fontWeight: 'bold' }}>
          Outfits / Hair:
        </span>
        {OUTFITS.map(o => (
          <label key={o.key} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '2px 6px',
            background: 'rgba(255,255,255,0.55)', borderRadius: 3,
            cursor: 'pointer', border: '1px solid #aaa',
          }}>
            <input type="checkbox" checked={!!outfitVisible[o.key]}
              onChange={e => setOutfitVisible(s => ({ ...s, [o.key]: e.target.checked }))} />
            <span style={{
              display: 'inline-block', width: 8, height: 8,
              background: o.color, borderRadius: 2,
              border: '1px solid #888',
            }} />
            {o.label}
          </label>
        ))}
      </div>

      <div style={{
        padding: '6px 14px', background: 'rgba(255,255,255,0.4)',
        borderTop: '1px solid #999', fontSize: 10, color: '#456',
      }}>
        Voxels @ resolution=250, multi-sample 8, native Rachel proportions (no retargeting).{' '}
        Source: <code>E:/レイチェル/Rachel_Rework.blend</code> · Files under{' '}
        <code>public{BASE}/</code>
      </div>
    </div>
  );
}
