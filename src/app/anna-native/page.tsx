'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

const BASE = '/box5/anna_native';

interface OutfitDef {
  key: string;
  label: string;
  color: string;
  group: string;
}
const OUTFITS: OutfitDef[] = [
  // Hair / face
  { key: 'hair_classic',       label: 'Hair (Classic)',   color: '#2a1a14', group: 'Hair/Face' },
  { key: 'hair_t8',            label: 'Hair (T8)',        color: '#3a1410', group: 'Hair/Face' },
  { key: 'eyebrows',           label: 'Eyebrows',         color: '#321',    group: 'Hair/Face' },
  { key: 'eyelashes',          label: 'Eyelashes',        color: '#211',    group: 'Hair/Face' },
  // Blackmottled
  { key: 'blackmottled_top',   label: 'Blackmottled Top',    color: '#444', group: 'Blackmottled' },
  { key: 'blackmottled_pants', label: 'Blackmottled Pants',  color: '#333', group: 'Blackmottled' },
  { key: 'blackmottled_gloves',label: 'Blackmottled Gloves', color: '#322', group: 'Blackmottled' },
  { key: 'blackmottled_boots', label: 'Blackmottled Boots',  color: '#211', group: 'Blackmottled' },
  // T8
  { key: 't8_top',             label: 'T8 Top',           color: '#a82',    group: 'T8' },
  { key: 't8_pants',           label: 'T8 Pants',         color: '#642',    group: 'T8' },
  { key: 't8_coat',            label: 'T8 Coat',          color: '#864',    group: 'T8' },
  { key: 't8_gloves',          label: 'T8 Gloves',        color: '#643',    group: 'T8' },
  { key: 't8_boots',           label: 'T8 Boots',         color: '#321',    group: 'T8' },
  { key: 't8_choker',          label: 'T8 Choker',        color: '#888',    group: 'T8' },
  { key: 't8_thong',           label: 'T8 Thong',         color: '#643',    group: 'T8' },
  // Suit
  { key: 'suit_top',           label: 'Suit Top',         color: '#88a',    group: 'Suit' },
  { key: 'suit_skirt',         label: 'Suit Skirt',       color: '#668',    group: 'Suit' },
  { key: 'suit_pantyhose',     label: 'Suit Pantyhose',   color: '#665',    group: 'Suit' },
  { key: 'suit_gloves',        label: 'Suit Gloves',      color: '#88a',    group: 'Suit' },
  { key: 'suit_boots',         label: 'Suit Boots',       color: '#321',    group: 'Suit' },
  { key: 'suit_hat',           label: 'Suit Hat',         color: '#88a',    group: 'Suit' },
  // Gym
  { key: 'gym_hoodie',         label: 'Gym Hoodie',       color: '#cca',    group: 'Gym' },
  { key: 'gym_croptop',        label: 'Gym Croptop',      color: '#fc8',    group: 'Gym' },
  { key: 'gym_shorts',         label: 'Gym Shorts',       color: '#aaa',    group: 'Gym' },
  { key: 'gym_shoes',          label: 'Gym Shoes',        color: '#caa',    group: 'Gym' },
  // Lingerie
  { key: 'lingerie_bra',       label: 'Lingerie Bra',     color: '#fcc',    group: 'Lingerie' },
  { key: 'lingerie_thong',     label: 'Lingerie Thong',   color: '#fcc',    group: 'Lingerie' },
  { key: 'lingerie_stockings', label: 'Lingerie Stockings',color: '#fdd',   group: 'Lingerie' },
  { key: 'lingerie_sleeves',   label: 'Lingerie Sleeves', color: '#fcc',    group: 'Lingerie' },
  { key: 'lingerie_heels',     label: 'Lingerie Heels',   color: '#fcc',    group: 'Lingerie' },
  { key: 'lingerie_pasties',   label: 'Lingerie Pasties', color: '#f88',    group: 'Lingerie' },
  { key: 'lingerie_choker',    label: 'Lingerie Choker',  color: '#aaa',    group: 'Lingerie' },
  // Swimsuit
  { key: 'swimsuit_top',       label: 'Swimsuit Top',     color: '#cef',    group: 'Swimsuit' },
  { key: 'swimsuit_bottom',    label: 'Swimsuit Bottom',  color: '#cef',    group: 'Swimsuit' },
  // Accessories
  { key: 'sunglasses',         label: 'Sunglasses',       color: '#222',    group: 'Accessories' },
  { key: 'head_accessory',     label: 'Head Accessory',   color: '#864',    group: 'Accessories' },
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

const bToB = (bx: number, by: number, bz: number): [number, number, number] => [bx, bz, -by];

export default function AnnaNativePage() {
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
        if (!gridResp.ok || !voxResp.ok) { setStatus('missing body/grid'); return; }
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
          const lm = buildBoneLines(scene, 'bones', skel, '#fc6');
          lm.isVisible = false;
          sceneRef.current.boneLines = lm;
        }

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
            const isHair = o.key.startsWith('hair');
            if (!isHair) {
              const cells = new Set<string>();
              for (const v of ofModel.voxels) cells.add(`${v.x},${v.y},${v.z}`);
              outfitCells.set(o.key, cells);
            }
          } catch (e) { console.warn(`outfit ${o.key} failed`, e); }
        }
        sceneRef.current.outfitMeshes = outfitMeshes;
        sceneRef.current.outfitCells = outfitCells;

        let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity;
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
          ` · ${outfitMeshes.size} items`
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

  useEffect(() => {
    const m = sceneRef.current.bodyMesh;
    if (m) m.isVisible = showMesh;
  }, [showMesh]);

  useEffect(() => {
    const lm = sceneRef.current.boneLines;
    if (lm) lm.isVisible = showSkeleton;
  }, [showSkeleton]);

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

  // Group outfits for UI
  const groups: Record<string, OutfitDef[]> = {};
  for (const o of OUTFITS) {
    if (!groups[o.group]) groups[o.group] = [];
    groups[o.group].push(o);
  }

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
          Anna Native Voxelization
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showMesh}
            onChange={e => setShowMesh(e.target.checked)} />
          Show body
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showSkeleton}
            onChange={e => setShowSkeleton(e.target.checked)} />
          Show skeleton
        </label>
        <span style={{ fontSize: 10, color: '#456', marginLeft: 'auto' }}>
          {status}
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
        alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
        maxHeight: '36vh', overflowY: 'auto',
      }}>
        {Object.entries(groups).map(([groupName, items]) => (
          <div key={groupName} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 140 }}>
            <span style={{ fontSize: 10, color: '#234', fontWeight: 'bold', borderBottom: '1px solid #888' }}>
              {groupName}
            </span>
            {items.map(o => (
              <label key={o.key} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, padding: '1px 4px',
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
        ))}
      </div>

      <div style={{
        padding: '6px 14px', background: 'rgba(255,255,255,0.4)',
        borderTop: '1px solid #999', fontSize: 10, color: '#456',
      }}>
        Voxels @ resolution=250, multi-sample 8 (hair: 27), Anna native proportions.
        Source: <code>E:/ANNA/Anna_Williams_T8_by_Mokujinh/Anna_Williams_(T8)_by_Mokujinh.blend</code>
      </div>
    </div>
  );
}
