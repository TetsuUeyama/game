'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh, TransformNode,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

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
type PartGrid = Grid & {
  scale_factor?: number;
  chunks?: Array<{ vox_file: string; grid_origin: [number, number, number] }>;
};
type ChunkData = {
  gridOrigin: [number, number, number];
  model: ReturnType<typeof parseVox>;
};
type PartData = { partGrid: PartGrid | null; chunks: ChunkData[] };

interface CharacterDef {
  id: string;
  label: string;
  base: string;          // /box5/qm_mustardui
  xOffset: number;       // world X offset
  parts: Array<{ key: string; label: string }>;
  defaultOff?: string[]; // parts initially hidden
}

const CHARACTERS: CharacterDef[] = [
  {
    id: 'qm',
    label: 'QM MustardUI',
    base: '/box5/qm_mustardui',
    xOffset: -1.4,
    parts: [
      { key: 'body', label: 'Body' }, { key: 'hair', label: 'Hair' },
      { key: 'eyes', label: 'Eyes' }, { key: 'lips', label: 'Lips' },
      { key: 'dress', label: 'Dress' }, { key: 'belt', label: 'Belt' },
      { key: 'panties', label: 'Panties' },
      { key: 'thigh_strap_l', label: 'Thigh Strap L' },
      { key: 'thigh_strap_r', label: 'Thigh Strap R' },
      { key: 'heels', label: 'Heels' }, { key: 'armband', label: 'Armband' },
      { key: 'bracelet', label: 'Bracelet' }, { key: 'circlet', label: 'Circlet' },
      { key: 'necklace', label: 'Necklace' },
      { key: 'bikini_bra', label: 'Bikini Bra' },
      { key: 'bikini_panties', label: 'Bikini Panties' },
      { key: 'de_body_as_qm', label: 'DE Body (resized)' },
      { key: 'de_armor_suit_bra', label: 'DE Suit Bra (resized)' },
      { key: 'de_armor_suit', label: 'DE Suit (resized)' },
      { key: 'de_armor_suit_plates', label: 'DE Suit Plates (resized)' },
      { key: 'de_armor_legs', label: 'DE Legs (resized)' },
      { key: 'de_armor_arms', label: 'DE Arms (resized)' },
      { key: 'de_armor_shoulders', label: 'DE Shoulders (resized)' },
      { key: 'de_armor_clavice', label: 'DE Clavice (resized)' },
      { key: 'de_armor_belt_inner', label: 'DE Belt Inner (resized)' },
      { key: 'de_armor_belt_outer', label: 'DE Belt Outer (resized)' },
      { key: 'de_armor_belt_cape', label: 'DE Belt Cape (resized)' },
      { key: 'de_armor_belt_scabbards', label: 'DE Belt Scabbards (resized)' },
      { key: 'de_armor_cape', label: 'DE Cape (resized)' },
      { key: 'de_armor_earrings', label: 'DE Earrings (resized)' },
      { key: 'de_mask', label: 'DE Mask (resized)' },
      { key: 'de_hair', label: 'DE Hair (retargeted)' },
      { key: 'helena_dress', label: 'Helena Dress (retargeted)' },
      { key: 'helena_shinguard', label: 'Helena Shin Guard (retargeted)' },
      { key: 'helena_shoes', label: 'Helena Shoes (retargeted)' },
      { key: 'helena_earings', label: 'Helena Earrings (retargeted)' },
    ],
    defaultOff: ['lips', 'bikini_bra', 'bikini_panties',
                  'de_body_as_qm', 'de_armor_suit_bra', 'de_armor_suit',
                  'de_armor_suit_plates', 'de_armor_legs', 'de_armor_arms',
                  'de_armor_shoulders', 'de_armor_clavice',
                  'de_armor_belt_inner', 'de_armor_belt_outer',
                  'de_armor_belt_cape', 'de_armor_belt_scabbards',
                  'de_armor_cape', 'de_armor_earrings',
                  'de_mask', 'de_hair',
                  'helena_dress', 'helena_shinguard', 'helena_shoes', 'helena_earings'],
  },
  {
    id: 'de',
    label: 'DarkElfBlader',
    base: '/box5/darkelfblader',
    xOffset: 0,
    parts: [
      { key: 'body', label: 'Body' }, { key: 'hair', label: 'Hair' },
      { key: 'eyes', label: 'Eyes' }, { key: 'lips', label: 'Lips' },
      { key: 'mask', label: 'Mask' }, { key: 'earrings', label: 'Earrings' },
      { key: 'armor_suit', label: 'Suit' },
      { key: 'armor_suit_bra', label: 'Suit Bra' },
      { key: 'armor_suit_plates', label: 'Suit Plates' },
      { key: 'armor_arms', label: 'Arms' },
      { key: 'armor_legs', label: 'Legs' },
      { key: 'armor_shoulders', label: 'Shoulders' },
      { key: 'armor_clavice', label: 'Shoulders Clav.' },
      { key: 'armor_belt_inner', label: 'Belt Inner' },
      { key: 'armor_belt_outer', label: 'Belt Outer' },
      { key: 'armor_belt_cape', label: 'Belt Cape' },
      { key: 'armor_belt_scabbards', label: 'Belt Scabbards' },
      { key: 'armor_cape', label: 'Cape' },
      { key: 'stockings', label: 'Stockings' },
      { key: 'pubes', label: 'Pubes' },
      { key: 'weapon_a_scabbard', label: 'Weapon A Scbd.' },
      { key: 'weapon_b_scabbard', label: 'Weapon B Scbd.' },
    ],
    defaultOff: ['pubes', 'stockings'],
  },
  {
    id: 'helena',
    label: 'Helena Douglas',
    base: '/box5/helena',
    xOffset: 1.4,
    parts: [
      { key: 'body', label: 'Body' },
      { key: 'hair_braid', label: 'Hair (Braided)' },
      { key: 'default_dress', label: 'Default Dress' },
      { key: 'default_shinguard', label: 'Default Shin Guard' },
      { key: 'default_shoes', label: 'Default Shoes' },
      { key: 'default_earings', label: 'Default Earrings' },
    ],
  },
];

interface CharacterState {
  grid: Grid | null;
  skel: Skeleton | null;
  partsData: Map<string, PartData>;
  ready: boolean;
}

export default function CharactersPreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  // Per character: mesh map + root transform node
  const meshMapsRef = useRef<Map<string, Map<string, Mesh>>>(new Map());
  const rootNodesRef = useRef<Map<string, TransformNode>>(new Map());
  const boneLinesRef = useRef<Map<string, LinesMesh>>(new Map());

  const [charStates, setCharStates] = useState<Record<string, CharacterState>>(
    Object.fromEntries(CHARACTERS.map(c => [c.id, {
      grid: null, skel: null, partsData: new Map(), ready: false,
    }]))
  );
  const [visibleByChar, setVisibleByChar] = useState<Record<string, Record<string, boolean>>>(
    Object.fromEntries(CHARACTERS.map(c => [
      c.id,
      Object.fromEntries(c.parts.map(p => [p.key, !c.defaultOff?.includes(p.key)])),
    ]))
  );
  const [showBones, setShowBones] = useState(false);
  const [subGridForwardMm, setSubGridForwardMm] = useState(5);

  // ---- Scene init ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.08, 0.12, 1);
    scene.useRightHandedSystem = true;
    sceneRef.current = scene;

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 6.5,
      new Vector3(0, 0.85, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.3;
    cam.upperRadiusLimit = 20;
    cam.wheelPrecision = 60;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    const ground = MeshBuilder.CreateGround('ground', { width: 8, height: 4, subdivisions: 16 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;

    // Per-character root TransformNode
    for (const c of CHARACTERS) {
      const root = new TransformNode(`root_${c.id}`, scene);
      root.position.x = c.xOffset;
      rootNodesRef.current.set(c.id, root);
      meshMapsRef.current.set(c.id, new Map());
    }

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ---- Load grid + skeleton per character ----
  useEffect(() => {
    CHARACTERS.forEach(async c => {
      const gr = await fetch(`${c.base}/grid.json`).then(r => r.ok ? r.json() : null);
      const sk = await fetch(`${c.base}/skeleton.json`).then(r => r.ok ? r.json() : null);
      setCharStates(s => ({ ...s, [c.id]: { ...s[c.id], grid: gr, skel: sk } }));
    });
  }, []);

  // ---- Load parts per character (once per grid) ----
  useEffect(() => {
    CHARACTERS.forEach(async c => {
      const st = charStates[c.id];
      if (!st.grid || st.ready) return;
      const pd = new Map<string, PartData>();
      await Promise.all(c.parts.map(async p => {
        const gridResp = await fetch(`${c.base}/${p.key}.grid.json?v=${Date.now()}`);
        const partGrid = gridResp.ok ? await gridResp.json() as PartGrid : null;
        const useGrid = partGrid ?? st.grid!;
        const specs = partGrid?.chunks
          ? partGrid.chunks.map(x => ({ vox_file: x.vox_file, grid_origin: x.grid_origin }))
          : [{ vox_file: `${p.key}.vox`, grid_origin: useGrid.grid_origin }];
        const chunks: ChunkData[] = [];
        for (const s of specs) {
          const r = await fetch(`${c.base}/${s.vox_file}?v=${Date.now()}`);
          if (!r.ok) continue;
          chunks.push({ gridOrigin: s.grid_origin, model: parseVox(await r.arrayBuffer()) });
        }
        pd.set(p.key, { partGrid, chunks });
      }));
      setCharStates(s => ({ ...s, [c.id]: { ...s[c.id], partsData: pd, ready: true } }));
    });
  }, [charStates]);

  // ---- Build/rebuild meshes per character (body rebuild on visible change) ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const bToB = (bx: number, by: number, bz: number): [number, number, number] =>
      [bx, bz, -by];

    for (const c of CHARACTERS) {
      const st = charStates[c.id];
      if (!st.ready || !st.grid) continue;
      const visible = visibleByChar[c.id];
      const meshMap = meshMapsRef.current.get(c.id)!;
      const root = rootNodesRef.current.get(c.id)!;

      // body-hide set
      const hide = new Set<string>();
      for (const p of c.parts) {
        if (p.key === 'body') continue;
        if (!visible[p.key]) continue;
        const d = st.partsData.get(p.key);
        if (!d || d.partGrid) continue;
        for (const ch of d.chunks) for (const v of ch.model.voxels) hide.add(`${v.x},${v.y},${v.z}`);
      }

      for (const p of c.parts) {
        const d = st.partsData.get(p.key);
        if (!d || d.chunks.length === 0) continue;
        const isBody = p.key === 'body';
        if (!isBody && meshMap.has(p.key)) continue;  // clothing built once

        const partGrid = d.partGrid;
        const useGrid = partGrid ?? st.grid;
        const vs = useGrid.voxel_size;
        const isSub = partGrid !== null;
        const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];

        for (const chunk of d.chunks) {
          const { model, gridOrigin: origin } = chunk;
          const occupied = new Set<string>();
          for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);
          for (const voxel of model.voxels) {
            if (isBody && hide.has(`${voxel.x},${voxel.y},${voxel.z}`)) continue;
            const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
            for (let f = 0; f < 6; f++) {
              const [dx, dy, dz] = FACE_DIRS[f];
              if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
              const bi = positions.length / 3;
              const fv = FACE_VERTS[f]; const fn = FACE_NORMALS[f];
              const [nx, ny, nz] = bToB(fn[0], fn[1], fn[2]);
              for (let vi = 0; vi < 4; vi++) {
                const [lx, ly, lz] = fv[vi];
                const bx = origin[0] + (voxel.x + lx) * vs;
                const by = origin[1] + (voxel.y + ly) * vs;
                const bz = origin[2] + (voxel.z + lz) * vs;
                const [wx, wy, wz] = bToB(bx, by, bz);
                positions.push(wx, wy, wz); normals.push(nx, ny, nz);
                colors.push(col.r, col.g, col.b, 1);
              }
              indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
            }
          }
        }
        if (positions.length === 0) continue;
        const vd = new VertexData();
        vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
        const mesh = new Mesh(`${c.id}_${p.key}`, scene);
        vd.applyToMesh(mesh);
        mesh.parent = root;
        const mat = new StandardMaterial(`${c.id}_${p.key}_mat`, scene);
        mat.backFaceCulling = false; mat.specularColor = new Color3(0, 0, 0);
        if (isSub) {
          mat.zOffset = -2;
          mesh.metadata = { isSubGrid: true };
        } else if (!isBody) {
          mat.zOffset = -1;
        }
        mesh.material = mat;
        const prev = meshMap.get(p.key);
        if (prev) prev.dispose();
        meshMap.set(p.key, mesh);
        mesh.isVisible = visible[p.key] ?? true;
      }
    }
  }, [charStates, visibleByChar]);

  // ---- Visibility toggle ----
  useEffect(() => {
    for (const c of CHARACTERS) {
      const meshMap = meshMapsRef.current.get(c.id);
      if (!meshMap) continue;
      const vis = visibleByChar[c.id];
      meshMap.forEach((m, key) => { m.isVisible = !!vis[key]; });
    }
  }, [visibleByChar]);

  // ---- Sub-grid forward offset ----
  useEffect(() => {
    const dz = subGridForwardMm / 1000;
    meshMapsRef.current.forEach(mm => {
      mm.forEach(m => { if (m.metadata?.isSubGrid) m.position.z = dz; });
    });
  }, [subGridForwardMm]);

  // ---- Bone lines ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    boneLinesRef.current.forEach(l => l.dispose());
    boneLinesRef.current.clear();
    if (!showBones) return;
    const toB = (p: [number, number, number]) => new Vector3(p[0], p[2], -p[1]);
    for (const c of CHARACTERS) {
      const skel = charStates[c.id]?.skel;
      if (!skel) continue;
      const root = rootNodesRef.current.get(c.id)!;
      const lines: Vector3[][] = [];
      for (const b of skel.bones) lines.push([toB(b.head_rest), toB(b.tail_rest)]);
      const lm = MeshBuilder.CreateLineSystem(`bones_${c.id}`, { lines, updatable: false }, scene);
      lm.parent = root;
      lm.isPickable = false;
      lm.color = new Color3(0.5, 0.9, 0.6);
      boneLinesRef.current.set(c.id, lm);
    }
  }, [charStates, showBones]);

  const toggle = (charId: string, key: string, val: boolean) => {
    setVisibleByChar(s => ({ ...s, [charId]: { ...s[charId], [key]: val } }));
  };

  return (
    <div style={{ display: 'flex', height: '100vh',
                  background: '#12121f', color: '#ddd', fontFamily: 'monospace' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)',
                      borderBottom: '1px solid #333' }}>
          <span style={{ color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
            Characters Side-by-Side Preview
          </span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
            QM ← | DE | → Helena
          </span>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      <div style={{ width: 320, padding: 12, background: 'rgba(0,0,0,0.4)',
                    borderLeft: '1px solid #333', overflowY: 'auto' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 11, color: '#aaa', marginBottom: 10 }}>
          <input type="checkbox" checked={showBones}
            onChange={e => setShowBones(e.target.checked)} />
          Show bones (both)
        </label>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>
          Sub-grid Forward: {subGridForwardMm.toFixed(1)} mm
        </div>
        <input type="range" min={-10} max={20} step={0.5} value={subGridForwardMm}
          onChange={e => setSubGridForwardMm(parseFloat(e.target.value))}
          style={{ width: '100%', marginBottom: 12 }} />

        {CHARACTERS.map(c => {
          const st = charStates[c.id];
          const ready = st?.ready;
          return (
            <div key={c.id} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, margin: '0 0 6px', color: '#8fa',
                           borderBottom: '1px solid #334', paddingBottom: 2 }}>
                {c.label} {ready ? '' : '(loading...)'}
              </h3>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <button
                  onClick={() => setVisibleByChar(s => ({
                    ...s,
                    [c.id]: Object.fromEntries(
                      c.parts.map(p => [p.key, p.key === 'body' || p.key === 'hair' || p.key === 'hair_braid'])
                    ),
                  }))}
                  style={{
                    flex: 1, padding: '4px 6px', fontSize: 9,
                    border: '1px solid #555', borderRadius: 2,
                    background: 'rgba(60,40,80,0.5)', color: '#fcf',
                    cursor: 'pointer', fontFamily: 'monospace',
                  }}>
                  Body+Hair only
                </button>
                <button
                  onClick={() => setVisibleByChar(s => ({
                    ...s,
                    [c.id]: Object.fromEntries(
                      c.parts.map(p => [p.key, !c.defaultOff?.includes(p.key)])
                    ),
                  }))}
                  style={{
                    flex: 1, padding: '4px 6px', fontSize: 9,
                    border: '1px solid #555', borderRadius: 2,
                    background: 'rgba(40,60,80,0.5)', color: '#cff',
                    cursor: 'pointer', fontFamily: 'monospace',
                  }}>
                  Default Set
                </button>
              </div>
              {c.parts.map(p => {
                const d = st?.partsData?.get(p.key);
                const exists = d && d.chunks.length > 0;
                const vCount = exists ? d.chunks.reduce((a, ch) => a + ch.model.voxels.length, 0) : 0;
                return (
                  <label key={p.key} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
                    padding: '3px 5px', marginBottom: 1, borderRadius: 2,
                    background: exists ? 'rgba(30,30,50,0.5)' : 'rgba(40,20,20,0.3)',
                    opacity: exists ? 1 : 0.5,
                    cursor: exists ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}>
                    <input type="checkbox" disabled={!exists}
                      checked={!!visibleByChar[c.id]?.[p.key]}
                      onChange={e => toggle(c.id, p.key, e.target.checked)} />
                    <span style={{ flex: 1 }}>{p.label}</span>
                    <span style={{ color: '#666', fontSize: 9 }}>
                      {exists ? vCount : '–'}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
