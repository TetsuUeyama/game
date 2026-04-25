'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

const BASE = '/box5/darkelfblader';

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

/** DarkElfBlader のパーツ構成 */
const PART_GROUPS: Array<{ group: string; parts: Array<{ key: string; label: string; color: string }> }> = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'body',  label: 'Body',  color: '#faa' },
      { key: 'hair',  label: 'Hair',  color: '#fa8' },
      { key: 'eyes',  label: 'Eyes',  color: '#fff' },
      { key: 'lips',  label: 'Lips',  color: '#f66' },
      { key: 'mask',  label: 'Mask',  color: '#a8f' },
      { key: 'earrings', label: 'Earrings', color: '#faf' },
    ],
  },
  {
    group: 'Armor',
    parts: [
      { key: 'armor_suit',       label: 'Suit',            color: '#f8f' },
      { key: 'armor_suit_bra',   label: 'Suit Bra',        color: '#fcf' },
      { key: 'armor_suit_plates',label: 'Suit Plates',     color: '#faf' },
      { key: 'armor_arms',       label: 'Arms',            color: '#8ff' },
      { key: 'armor_legs',       label: 'Legs',            color: '#8af' },
      { key: 'armor_shoulders',  label: 'Shoulders',       color: '#88f' },
      { key: 'armor_clavice',    label: 'Shoulders Clav.', color: '#aaf' },
      { key: 'armor_belt_inner', label: 'Belt Inner',      color: '#ff8' },
      { key: 'armor_belt_outer', label: 'Belt Outer',      color: '#fc8' },
      { key: 'armor_belt_cape',  label: 'Belt Cape',       color: '#fa8' },
      { key: 'armor_belt_scabbards', label: 'Belt Scabbards', color: '#f88' },
      { key: 'armor_cape',       label: 'Cape',            color: '#f66' },
    ],
  },
  {
    group: 'Extras',
    parts: [
      { key: 'stockings',        label: 'Stockings',       color: '#8f8' },
      { key: 'pubes',            label: 'Pubes',           color: '#afa' },
      { key: 'weapon_a_scabbard', label: 'Weapon A Scbd.', color: '#ccc' },
      { key: 'weapon_b_scabbard', label: 'Weapon B Scbd.', color: '#bbb' },
    ],
  },
  {
    group: 'QM-retargeted (QM → DE)',
    parts: [
      { key: 'qm_hair', label: 'QM Hair (braid)', color: '#f84' },
    ],
  },
];
const PARTS = PART_GROUPS.flatMap(g => g.parts);

export default function DarkElfBladerPreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const boneLinesRef = useRef<LinesMesh | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [skel, setSkel] = useState<Skeleton | null>(null);
  const [partInfo, setPartInfo] = useState<Record<string, { voxels: number } | 'missing'>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(PARTS.map(p => [p.key,
      p.key !== 'lips' && p.key !== 'pubes' && p.key !== 'stockings'
    ]))
  );
  const [showBones, setShowBones] = useState(true);
  const [boneFilter, setBoneFilter] = useState('');
  const [subGridForwardMm, setSubGridForwardMm] = useState(5);  // サブグリッドの前方オフセット (mm)

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
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
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

  // ---- Parts raw data cache (loaded once) ----
  type PartGrid = Grid & {
    scale_factor?: number;
    chunks?: Array<{ vox_file: string; grid_origin: [number, number, number]; gx: number; gy: number; gz: number; voxel_count?: number }>;
  };
  type ChunkData = {
    gridOrigin: [number, number, number];
    model: ReturnType<typeof parseVox>;
  };
  type PartData = { partGrid: PartGrid | null; chunks: ChunkData[] };
  const partsDataRef = useRef<Map<string, PartData>>(new Map());
  const [partsReady, setPartsReady] = useState(false);

  // ---- Phase 1: Load all parts raw data (once per grid) ----
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
        partsData.set(p.key, { partGrid, chunks });
      }));
      partsDataRef.current = partsData;
      setPartsReady(true);
    })();
  }, [grid]);

  // ---- Build/rebuild meshes (body rebuild on visible change, clothing built once) ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !grid || !partsReady) return;

    // Blender (Z-up) → Babylon (Y-up, 右手系): (bx, bz, -by)
    const bToB = (bx: number, by: number, bz: number): [number, number, number] =>
      [bx, bz, -by];

    const info: Record<string, { voxels: number } | 'missing'> = {};
    const partsData = partsDataRef.current;

    // body-hide set: 「visible で body-grid の clothing」voxel 位置
    // → body mesh 構築時にこれらの位置は skip する (clothing が表示されているときだけ隠す)
    const bodyHideSet = new Set<string>();
    for (const p of PARTS) {
      if (p.key === 'body') continue;
      if (!visible[p.key]) continue;  // ← 非表示 clothing は hide-set に含めない
      const data = partsData.get(p.key);
      if (!data || data.partGrid !== null) continue;
      for (const chunk of data.chunks) {
        for (const v of chunk.model.voxels) {
          bodyHideSet.add(`${v.x},${v.y},${v.z}`);
        }
      }
    }

    for (const p of PARTS) {
      const data = partsData.get(p.key);
      if (!data || data.chunks.length === 0) {
        info[p.key] = 'missing';
        continue;
      }
      const isBody = p.key === 'body';
      // clothing は一度だけ構築、body は hide-set 変化のたびに再構築
      if (!isBody && meshMapRef.current.has(p.key)) {
        // 既存: voxel count 情報だけ残す
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

      for (const chunk of data.chunks) {
        const { model, gridOrigin: origin } = chunk;
        const occupied = new Set<string>();
        for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);

        for (const voxel of model.voxels) {
          if (isBody && bodyHideSet.has(`${voxel.x},${voxel.y},${voxel.z}`)) continue;
          const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
          for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = FACE_DIRS[f];
            if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
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
            }
            indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
          }
        }
        totalVoxels += model.voxels.length;
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
      vd.applyToMesh(mesh);

      const mat = new StandardMaterial(`mat_${p.key}`, scene);
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);
      if (isSubGrid) {
        mat.zOffset = -2;
        mesh.metadata = { isSubGrid: true };
      } else if (!isBody) {
        mat.zOffset = -1;
      }
      mesh.material = mat;

      const prev = meshMapRef.current.get(p.key);
      if (prev) prev.dispose();
      meshMapRef.current.set(p.key, mesh);
      mesh.isVisible = visible[p.key] ?? true;

      info[p.key] = { voxels: totalVoxels };
    }
    setPartInfo(prev => ({ ...prev, ...info }));
  }, [grid, partsReady, visible]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      meshMapRef.current.forEach(m => m.dispose());
      meshMapRef.current.clear();
    };
  }, []);

  // ---- Toggle part visibility ----
  useEffect(() => {
    meshMapRef.current.forEach((m, key) => { m.isVisible = !!visible[key]; });
  }, [visible, partInfo]);

  // ---- Apply sub-grid forward offset ----
  useEffect(() => {
    const dz = subGridForwardMm / 1000;  // mm → m
    meshMapRef.current.forEach(m => {
      if (m.metadata?.isSubGrid) m.position.z = dz;
    });
  }, [subGridForwardMm, partInfo]);

  // ---- Draw bones ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !skel) return;
    if (boneLinesRef.current) {
      boneLinesRef.current.dispose();
      boneLinesRef.current = null;
    }
    if (!showBones) return;

    // Blender (Z-up) → Babylon (Y-up): (bx, bz, -by)
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
      // カラーコード: hair/dress/belt/cage 関連は目立つ色
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

  // ボーン name のクイック統計
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
            DarkElfBlader Preview
          </span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
            public/box5/darkelfblader/
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
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <button
            onClick={() => setVisible(Object.fromEntries(
              PARTS.map(p => [p.key, p.key === 'body' || p.key === 'hair'])
            ))}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 10,
              border: '1px solid #555', borderRadius: 3,
              background: 'rgba(60,40,80,0.5)', color: '#fcf',
              cursor: 'pointer', fontFamily: 'monospace',
            }}>
            Body + Hair only
          </button>
          <button
            onClick={() => setVisible(Object.fromEntries(
              PARTS.map(p => [p.key,
                p.key !== 'lips' && p.key !== 'pubes' && p.key !== 'stockings' && !p.key.startsWith('qm_')
              ])
            ))}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 10,
              border: '1px solid #555', borderRadius: 3,
              background: 'rgba(40,60,80,0.5)', color: '#cff',
              cursor: 'pointer', fontFamily: 'monospace',
            }}>
            Default Set
          </button>
        </div>
        {PART_GROUPS.map(g => (
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
          Files under <b>public/box5/darkelfblader/</b>.<br/>
          Reload (Ctrl+Shift+R) after adding new parts.
        </div>
      </div>
    </div>
  );
}
