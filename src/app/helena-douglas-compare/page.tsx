'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

const OUTFIT_SOURCE = '/api/box5/helena_douglas_compare/helena_qm';

const PANELS = [
  { key: 'qm',        label: 'QM (QueenMarika)',     base: '/api/box5/helena_qm_compare/qm',
    accent: '#fc8', showOutfits: true },
  { key: 'helena',    label: 'Helena Douglas (orig)', base: '/api/box5/helena_douglas_compare/helena',
    accent: '#fa8', showOutfits: false },
  { key: 'helena_qm', label: 'Helena Douglas + QM',   base: '/api/box5/helena_douglas_compare/helena_qm',
    accent: '#8cf', showOutfits: true },
] as const;

type PanelKey = (typeof PANELS)[number]['key'];

const OUTFITS = [
  { key: 'hair_long',          label: 'Hair Long',          color: '#fa8' },
  { key: 'default_dress',      label: 'Default Dress',      color: '#f48' },
  { key: 'default_shin_guard', label: 'Default Shin Guard', color: '#cca' },
] as const;

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

interface PanelState {
  engine?: Engine;
  scene?: Scene;
  cam?: ArcRotateCamera;
  bodyMesh?: Mesh | null;
  boneLines?: LinesMesh | null;
  outfitMeshes?: Map<string, Mesh>;
  grid?: Grid;
  skeleton?: Skeleton;
  breastMarkers?: { left?: Mesh; right?: Mesh };
}

const bToB = (bx: number, by: number, bz: number): [number, number, number] => [bx, bz, -by];

// Blender (Z-up) point → Babylon (Y-up RH): (x, z, -y)
const blenderToBabylonVec3 = (p: [number, number, number]): [number, number, number] =>
  [p[0], p[2], -p[1]];

// Babylon (Y-up RH) → Blender (Z-up): (x, -z, y)
const babylonToBlenderVec3 = (p: [number, number, number]): [number, number, number] =>
  [p[0], -p[2], p[1]];

export default function HelenaDouglasComparePage() {
  const canvasRefs = useRef<Record<PanelKey, HTMLCanvasElement | null>>({
    qm: null, helena: null, helena_qm: null,
  });
  const panelStateRef = useRef<Record<PanelKey, PanelState>>({
    qm: {}, helena: {}, helena_qm: {},
  });
  const syncingRef = useRef(false);

  const [showMesh, setShowMesh] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [outfitVisible, setOutfitVisible] = useState<Record<string, boolean>>({});
  const [status, setStatusMap] = useState<Record<PanelKey, string>>({
    qm: '...', helena: '...', helena_qm: '...',
  });

  // Breast tip pick state
  // Positions are in Babylon world coords (Y-up).
  type Tip = { x: number; y: number; z: number };
  const [breastTipL, setBreastTipL] = useState<Tip | null>(null);
  const [breastTipR, setBreastTipR] = useState<Tip | null>(null);
  // Pick mode: which side to set on next click
  const [pickMode, setPickMode] = useState<'off' | 'left' | 'right'>('off');
  const pickModeRef = useRef(pickMode);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  const [adjustStatus, setAdjustStatus] = useState<string>('');
  const setStatus = useCallback((k: PanelKey, msg: string) => {
    setStatusMap(s => ({ ...s, [k]: msg }));
  }, []);

  const syncOthers = useCallback((source: ArcRotateCamera, sourceKey: PanelKey) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    for (const p of PANELS) {
      if (p.key === sourceKey) continue;
      const t = panelStateRef.current[p.key].cam;
      if (!t) continue;
      t.alpha = source.alpha;
      t.beta = source.beta;
      t.radius = source.radius;
      t.target.copyFrom(source.target);
    }
    syncingRef.current = false;
  }, []);

  const buildVoxelMesh = useCallback((
    scene: Scene, name: string, voxels: ReturnType<typeof parseVox>['voxels'],
    palette: ReturnType<typeof parseVox>['palette'],
    origin: [number, number, number], voxelSize: number,
  ): Mesh => {
    const occ = new Set<string>();
    for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (const v of voxels) {
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
    const lm = MeshBuilder.CreateLineSystem(name, {
      lines, colors: colorArr, updatable: false,
    }, scene);
    lm.isPickable = false;
    return lm;
  }, []);

  const initPanel = useCallback((canvas: HTMLCanvasElement, key: PanelKey) => {
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.07, 0.07, 0.11, 1);
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
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;
    ground.position.y = -0.005;

    engine.runRenderLoop(() => scene.render());
    cam.onViewMatrixChangedObservable.add(() => syncOthers(cam, key));

    // Click pick handler for breast tip SOURCE — only on helena (orig) panel
    // The picked point is a position on Helena's original mesh that should
    // map to QM's breast tip after deformation.
    if (key === 'helena') {
      scene.onPointerDown = (evt) => {
        if (pickModeRef.current === 'off') return;
        if (evt.button !== 0) return;
        const pickResult = scene.pick(scene.pointerX, scene.pointerY,
          (m) => !!m && m.name.startsWith('body_'));
        if (!pickResult || !pickResult.hit || !pickResult.pickedPoint) return;
        const p = pickResult.pickedPoint;
        const tip = { x: p.x, y: p.y, z: p.z };
        if (pickModeRef.current === 'left') {
          setBreastTipL(tip);
        } else if (pickModeRef.current === 'right') {
          setBreastTipR(tip);
        }
        setPickMode('off');
      };
    }

    return { engine, scene, cam };
  }, [syncOthers]);

  // Update breast tip markers in helena (orig) scene
  useEffect(() => {
    const st = panelStateRef.current.helena;
    if (!st.scene) return;
    const updateMarker = (side: 'left' | 'right', tip: Tip | null) => {
      const key = `breast_marker_${side}`;
      const existing = st.scene!.getMeshByName(key) as Mesh | null;
      if (!tip) {
        if (existing) existing.dispose();
        return;
      }
      let mesh = existing;
      if (!mesh) {
        mesh = MeshBuilder.CreateSphere(key, { diameter: 0.025 }, st.scene!);
        const mat = new StandardMaterial(`${key}_mat`, st.scene!);
        mat.disableLighting = true;
        mat.emissiveColor = side === 'left'
          ? new Color3(1, 0.4, 0.4)
          : new Color3(0.4, 0.6, 1);
        mesh.material = mat;
        mesh.isPickable = false;
      }
      mesh.position = new Vector3(tip.x, tip.y, tip.z);
    };
    updateMarker('left', breastTipL);
    updateMarker('right', breastTipR);
  }, [breastTipL, breastTipR]);

  // Apply breast adjustment via API
  const applyBreastAdjust = useCallback(async () => {
    if (!breastTipL || !breastTipR) {
      setAdjustStatus('error: set both left and right tip');
      return;
    }
    setAdjustStatus('processing... (~1-3 min)');
    try {
      // Convert Babylon coords back to Blender (Z-up)
      const left = babylonToBlenderVec3([breastTipL.x, breastTipL.y, breastTipL.z]);
      const right = babylonToBlenderVec3([breastTipR.x, breastTipR.y, breastTipR.z]);
      const resp = await fetch('/api/adjust-breast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ left, right }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setAdjustStatus(`error: ${data.error ?? 'unknown'}`);
        return;
      }
      setAdjustStatus('done. reloading body voxel...');
      // Reload helena_qm body voxel only
      const panel = PANELS.find(p => p.key === 'helena_qm');
      const scene = panelStateRef.current.helena_qm.scene;
      if (panel && scene) {
        const oldMesh = panelStateRef.current.helena_qm.bodyMesh;
        if (oldMesh) oldMesh.dispose();
        await loadPanel(panel, scene);
      }
      setAdjustStatus('reloaded ✓');
    } catch (e) {
      setAdjustStatus(`error: ${(e as Error).message}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breastTipL, breastTipR]);

  const loadPanel = useCallback(async (
    panel: typeof PANELS[number], scene: Scene,
  ) => {
    setStatus(panel.key, 'loading...');
    try {
      const bust = `?v=${Date.now()}`;
      const [gridResp, voxResp, skelResp] = await Promise.all([
        fetch(`${panel.base}/grid.json${bust}`),
        fetch(`${panel.base}/body.vox${bust}`),
        fetch(`${panel.base}/skeleton.json${bust}`),
      ]);
      if (!gridResp.ok || !voxResp.ok) {
        setStatus(panel.key, 'missing voxel/grid');
        return;
      }
      const grid: Grid = await gridResp.json();
      panelStateRef.current[panel.key].grid = grid;
      const model = parseVox(await voxResp.arrayBuffer());

      const mesh = buildVoxelMesh(
        scene, `body_${panel.key}`, model.voxels, model.palette,
        grid.grid_origin, grid.voxel_size,
      );
      panelStateRef.current[panel.key].bodyMesh = mesh;

      let nBones = 0;
      if (skelResp.ok) {
        const skel: Skeleton = await skelResp.json();
        nBones = skel.bones.length;
        const lm = buildBoneLines(scene, `bones_${panel.key}`, skel, panel.accent);
        panelStateRef.current[panel.key].boneLines = lm;
        panelStateRef.current[panel.key].skeleton = skel;
        // Initialize breast tip default positions from helena (orig) skeleton
        // (DEF-breast.L tail = Helena breast tip in Helena rest pose)
        if (panel.key === 'helena' && breastTipL === null && breastTipR === null) {
          const bL = skel.bones.find(b => b.name === 'DEF-breast.L');
          const bR = skel.bones.find(b => b.name === 'DEF-breast.R');
          if (bL) {
            const [x, y, z] = blenderToBabylonVec3(bL.tail_rest);
            setBreastTipL({ x, y, z });
          }
          if (bR) {
            const [x, y, z] = blenderToBabylonVec3(bR.tail_rest);
            setBreastTipR({ x, y, z });
          }
        }
      }

      const outfitMeshes = new Map<string, Mesh>();
      let outfitVoxTotal = 0;
      if (panel.showOutfits) {
        const ofGridResp = await fetch(`${OUTFIT_SOURCE}/grid.json${bust}`);
        const ofGrid: Grid = ofGridResp.ok ? await ofGridResp.json() : grid;
        for (const o of OUTFITS) {
          try {
            const r = await fetch(`${OUTFIT_SOURCE}/${o.key}.vox${bust}`);
            if (!r.ok) continue;
            const ofModel = parseVox(await r.arrayBuffer());
            if (ofModel.voxels.length === 0) continue;
            const om = buildVoxelMesh(
              scene, `outfit_${panel.key}_${o.key}`,
              ofModel.voxels, ofModel.palette,
              ofGrid.grid_origin, ofGrid.voxel_size,
            );
            om.isVisible = !!outfitVisible[o.key];
            outfitMeshes.set(o.key, om);
            outfitVoxTotal += ofModel.voxels.length;
          } catch (e) {
            console.warn(`outfit ${o.key} failed`, e);
          }
        }
      }
      panelStateRef.current[panel.key].outfitMeshes = outfitMeshes;

      let mnX = Infinity, mxX = -Infinity;
      let mnY = Infinity, mxY = -Infinity;
      let mnZ = Infinity, mxZ = -Infinity;
      for (const v of model.voxels) {
        if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
        if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
        if (v.z < mnZ) mnZ = v.z; if (v.z > mxZ) mxZ = v.z;
      }
      const wMm = ((mxX - mnX + 1) * grid.voxel_size * 1000).toFixed(0);
      const dMm = ((mxY - mnY + 1) * grid.voxel_size * 1000).toFixed(0);
      const hMm = ((mxZ - mnZ + 1) * grid.voxel_size * 1000).toFixed(0);
      const outfitTag = outfitMeshes.size
        ? ` · ${outfitMeshes.size} outfits (${outfitVoxTotal})`
        : '';
      setStatus(panel.key,
        `body ${model.voxels.length} · ${wMm}×${dMm}×${hMm}mm${nBones ? ` · ${nBones} bones` : ''}${outfitTag}`);
    } catch (e) {
      console.error(`load ${panel.key} failed`, e);
      setStatus(panel.key, `error: ${(e as Error).message ?? e}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildVoxelMesh, buildBoneLines, setStatus]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const p of PANELS) {
      const c = canvasRefs.current[p.key];
      if (!c) continue;
      const { engine, scene, cam } = initPanel(c, p.key);
      panelStateRef.current[p.key] = { engine, scene, cam };
      void loadPanel(p, scene);
      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);
      cleanups.push(() => {
        window.removeEventListener('resize', onResize);
        const st = panelStateRef.current[p.key];
        st.bodyMesh?.dispose();
        st.boneLines?.dispose();
        st.outfitMeshes?.forEach(m => m.dispose());
        engine.dispose();
        panelStateRef.current[p.key] = {};
      });
    }
    return () => { for (const f of cleanups) f(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    for (const p of PANELS) {
      const m = panelStateRef.current[p.key].bodyMesh;
      if (m) m.isVisible = showMesh;
    }
  }, [showMesh]);
  useEffect(() => {
    for (const p of PANELS) {
      const lm = panelStateRef.current[p.key].boneLines;
      if (lm) lm.isVisible = showSkeleton;
    }
  }, [showSkeleton]);
  useEffect(() => {
    for (const p of PANELS) {
      const ms = panelStateRef.current[p.key].outfitMeshes;
      if (!ms) continue;
      ms.forEach((m, key) => { m.isVisible = !!outfitVisible[key]; });
    }
  }, [outfitVisible]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0c0c14', color: '#ddd', fontFamily: 'monospace',
    }}>
      <div style={{
        padding: '8px 14px', background: 'rgba(0,0,0,0.4)',
        borderBottom: '1px solid #333', display: 'flex',
        alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <span style={{ color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
          QM / Helena Douglas (Rigify) / Helena Douglas + QM Bones
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showMesh}
            onChange={e => setShowMesh(e.target.checked)} />
          Show body voxels
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showSkeleton}
            onChange={e => setShowSkeleton(e.target.checked)} />
          Show skeleton
        </label>
        <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto' }}>
          drag to rotate · all 3 cameras synced
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {PANELS.map(p => (
          <div key={p.key} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #222', minWidth: 0,
          }}>
            <div style={{
              padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
              borderBottom: '1px solid #222',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
            }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                background: p.accent, borderRadius: 2,
              }} />
              <span style={{ color: p.accent, fontWeight: 'bold' }}>{p.label}</span>
              <span style={{ color: '#888', marginLeft: 'auto', fontSize: 10 }}>
                {status[p.key]}
              </span>
            </div>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <canvas
                ref={el => { canvasRefs.current[p.key] = el; }}
                style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '6px 14px', background: 'rgba(0,0,0,0.35)',
        borderTop: '1px solid #333', display: 'flex',
        alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#8fa', fontWeight: 'bold' }}>
          Outfits (QM + Helena Douglas+QM):
        </span>
        {OUTFITS.map(o => (
          <label key={o.key} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '2px 6px',
            background: 'rgba(30,30,50,0.6)', borderRadius: 3,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={!!outfitVisible[o.key]}
              onChange={e => setOutfitVisible(s => ({ ...s, [o.key]: e.target.checked }))} />
            <span style={{
              display: 'inline-block', width: 8, height: 8,
              background: o.color, borderRadius: 2,
            }} />
            {o.label}
          </label>
        ))}
      </div>

      {/* Breast tip pick UI */}
      <div style={{
        padding: '6px 14px', background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid #333', display: 'flex',
        alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11,
      }}>
        <span style={{ color: '#fac', fontWeight: 'bold' }}>
          Breast Tip Source (Helena orig panel):
        </span>
        <button
          onClick={() => setPickMode(pickMode === 'left' ? 'off' : 'left')}
          style={{
            padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            background: pickMode === 'left' ? '#a44' : '#332',
            color: '#fcc', border: '1px solid #a44', borderRadius: 3,
            fontFamily: 'monospace',
          }}>
          {pickMode === 'left' ? '◉ Click body to set Left' : 'Set Left Tip'}
        </button>
        <button
          onClick={() => setPickMode(pickMode === 'right' ? 'off' : 'right')}
          style={{
            padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            background: pickMode === 'right' ? '#44a' : '#223',
            color: '#ccf', border: '1px solid #44a', borderRadius: 3,
            fontFamily: 'monospace',
          }}>
          {pickMode === 'right' ? '◉ Click body to set Right' : 'Set Right Tip'}
        </button>
        <span style={{ fontSize: 10, color: '#aaa' }}>
          {breastTipL ? `L=(${breastTipL.x.toFixed(3)}, ${breastTipL.y.toFixed(3)}, ${breastTipL.z.toFixed(3)})` : 'L: none'}
        </span>
        <span style={{ fontSize: 10, color: '#aaa' }}>
          {breastTipR ? `R=(${breastTipR.x.toFixed(3)}, ${breastTipR.y.toFixed(3)}, ${breastTipR.z.toFixed(3)})` : 'R: none'}
        </span>
        <button
          onClick={applyBreastAdjust}
          disabled={!breastTipL || !breastTipR || adjustStatus.includes('processing')}
          style={{
            padding: '3px 14px', fontSize: 11,
            cursor: (breastTipL && breastTipR) ? 'pointer' : 'not-allowed',
            background: (breastTipL && breastTipR) ? '#262' : '#222',
            color: '#cfc', border: '1px solid #4a4', borderRadius: 3,
            fontFamily: 'monospace', fontWeight: 'bold',
          }}>
          Apply Adjustment
        </button>
        <span style={{ fontSize: 10, color: adjustStatus.startsWith('error') ? '#f88' : '#8f8' }}>
          {adjustStatus}
        </span>
      </div>

      <div style={{
        padding: '6px 14px', background: 'rgba(0,0,0,0.3)',
        borderTop: '1px solid #333', fontSize: 10, color: '#888',
      }}>
        Helena_Douglas_1.10.blend (Rigify rig) → QM ARP rig pipeline test.
        Default tip = QM breast bone tail. Click body in helena_qm panel to override.
      </div>
    </div>
  );
}
