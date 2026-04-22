'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, Color4, Mesh, VertexData,
  MeshBuilder, StandardMaterial, Color3,
} from '@babylonjs/core';
import { loadVoxFile, SCALE, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { VoxelEntry } from '@/types/vox';
import type { EquipBehavior, BehaviorData, EquipManifestEntry } from '@/types/equip';
import { BEHAVIOR_COLORS } from '@/types/equip';
import { createUnlitMaterial } from '@/lib/vox-mesh';
import { ToolModePanelTmp } from '@/templates/voxel-editor/ToolModePanelTmp';
import { BehaviorPaintPanelTmp } from '@/templates/voxel-editor/BehaviorPaintPanelTmp';
import { VoxelStatsTmp } from '@/templates/voxel-editor/VoxelStatsTmp';

type ToolMode = 'navigate' | 'paint' | 'box';

function buildEditorMesh(
  voxels: VoxelEntry[],
  behaviorMap: Map<string, EquipBehavior>,
  scene: Scene,
  cx: number, cy: number,
): { mesh: Mesh; faceToVoxelIdx: number[] } {
  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const faceToVoxelIdx: number[] = [];

  for (let vi = 0; vi < voxels.length; vi++) {
    const voxel = voxels[vi];
    const key = `${voxel.x},${voxel.y},${voxel.z}`;
    const behavior = behaviorMap.get(key) ?? 'synced';
    const bc = BEHAVIOR_COLORS[behavior];

    const cr = voxel.r * 0.5 + bc.r * 0.5;
    const cg = voxel.g * 0.5 + bc.g * 0.5;
    const cb = voxel.b * 0.5 + bc.b * 0.5;

    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;

      const bi = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];
      for (let fvi = 0; fvi < 4; fvi++) {
        positions.push(
          (voxel.x + fv[fvi][0] - cx) * SCALE,
          (voxel.z + fv[fvi][2]) * SCALE,
          -(voxel.y + fv[fvi][1] - cy) * SCALE,
        );
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(cr, cg, cb, 1);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
      faceToVoxelIdx.push(vi);
      faceToVoxelIdx.push(vi);
    }
  }

  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh('editor_part', scene);
  vd.applyToMesh(mesh);
  mesh.material = createUnlitMaterial(scene, 'editor_unlit_' + Date.now());
  return { mesh, faceToVoxelIdx };
}

export default function VoxelBehaviorEditorView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const partKey = params.partKey as string;
  const setKey = searchParams.get('set');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const faceMapRef = useRef<number[]>([]);

  const voxelsRef = useRef<VoxelEntry[]>([]);
  const behaviorMapRef = useRef<Map<string, EquipBehavior>>(new Map());
  const undoStackRef = useRef<Map<string, EquipBehavior>[]>([]);
  const centerRef = useRef({ cx: 0, cy: 0 });

  const [partInfo, setPartInfo] = useState<EquipManifestEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>('navigate');
  const [paintBehavior, setPaintBehavior] = useState<EquipBehavior>('synced');
  const [stats, setStats] = useState({ synced: 0, surface: 0, gravity: 0 });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);

  const boxStartRef = useRef<{ x: number; y: number } | null>(null);
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const isPaintingRef = useRef(false);

  const computeStats = useCallback(() => {
    const map = behaviorMapRef.current;
    const total = voxelsRef.current.length;
    let surface = 0, gravity = 0;
    for (const b of map.values()) {
      if (b === 'surface') surface++;
      else if (b === 'gravity') gravity++;
    }
    setStats({ synced: total - surface - gravity, surface, gravity });
  }, []);

  const rebuildMesh = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || voxelsRef.current.length === 0) return;
    if (meshRef.current) meshRef.current.dispose();
    const { cx, cy } = centerRef.current;
    const { mesh, faceToVoxelIdx } = buildEditorMesh(
      voxelsRef.current, behaviorMapRef.current, scene, cx, cy,
    );
    meshRef.current = mesh;
    faceMapRef.current = faceToVoxelIdx;
    computeStats();
  }, [computeStats]);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(new Map(behaviorMapRef.current));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setCanUndo(true);
  }, []);

  const performUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    behaviorMapRef.current = stack.pop()!;
    setCanUndo(stack.length > 0);
    setDirty(true);
    rebuildMesh();
  }, [rebuildMesh]);

  const setVoxelBehavior = useCallback((voxelIdx: number, behavior: EquipBehavior) => {
    const v = voxelsRef.current[voxelIdx];
    if (!v) return;
    const key = `${v.x},${v.y},${v.z}`;
    const current = behaviorMapRef.current.get(key) ?? 'synced';
    if (current === behavior) return;
    if (behavior === 'synced') {
      behaviorMapRef.current.delete(key);
    } else {
      behaviorMapRef.current.set(key, behavior);
    }
    setDirty(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.10, 0.10, 0.16, 1);

    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4 }, scene);
    const gMat = new StandardMaterial('gMat', scene);
    gMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
    gMat.alpha = 0.3; gMat.wireframe = true;
    ground.material = gMat;
    ground.isPickable = false;

    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 2.0, new Vector3(0, 0.4, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3; camera.upperRadiusLimit = 8; camera.wheelPrecision = 80;
    cameraRef.current = camera;

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.5;

    sceneRef.current = scene;
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  useEffect(() => {
    if (!sceneRef.current || !partKey) return;
    (async () => {
      try {
        if (!setKey) throw new Error('Missing ?set= query parameter');
        const manifestUrl = `/api/equip-manifest?set=${setKey}&v=${Date.now()}`;
        const manifestResp = await fetch(manifestUrl);
        if (!manifestResp.ok) throw new Error(`Failed to load manifest: ${manifestUrl}`);
        const parts: EquipManifestEntry[] = await manifestResp.json();
        const part = parts.find(p => p.key === partKey);
        if (!part) throw new Error(`Part "${partKey}" not found in set "${setKey}"`);
        setPartInfo(part);

        const { model, voxels } = await loadVoxFile(part.file);
        voxelsRef.current = voxels;
        centerRef.current = { cx: model.sizeX / 2, cy: model.sizeY / 2 };

        const behResp = await fetch(`/api/equip-behavior?partKey=${partKey}&setKey=${setKey}`);
        if (behResp.ok) {
          const data: BehaviorData = await behResp.json();
          const map = new Map<string, EquipBehavior>();
          for (const k of data.surface ?? []) map.set(k, 'surface');
          for (const k of data.gravity ?? []) map.set(k, 'gravity');
          behaviorMapRef.current = map;
        }

        rebuildMesh();
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
  }, [partKey, setKey, rebuildMesh]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '1') setPaintBehavior('synced');
      else if (e.key === '2') setPaintBehavior('surface');
      else if (e.key === '3') setPaintBehavior('gravity');
      else if (e.key === 'q' || e.key === 'Q') setToolMode('navigate');
      else if (e.key === 'w' || e.key === 'W') setToolMode('paint');
      else if (e.key === 'e' || e.key === 'E') setToolMode('box');
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); performUndo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performUndo]);

  useEffect(() => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;
    if (toolMode === 'navigate') {
      camera.attachControl(canvas, true);
    } else {
      camera.detachControl();
    }
  }, [toolMode]);

  const pickVoxel = useCallback((x: number, y: number): number | null => {
    const scene = sceneRef.current;
    if (!scene) return null;
    const pick = scene.pick(x, y, (m) => m === meshRef.current);
    if (!pick?.hit || pick.faceId < 0) return null;
    return faceMapRef.current[pick.faceId] ?? null;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (toolMode === 'navigate') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (toolMode === 'paint') {
      pushUndo();
      isPaintingRef.current = true;
      const idx = pickVoxel(x, y);
      if (idx !== null) { setVoxelBehavior(idx, paintBehavior); rebuildMesh(); }
    } else if (toolMode === 'box') {
      boxStartRef.current = { x: e.clientX, y: e.clientY };
      setBoxRect(null);
    }
  }, [toolMode, paintBehavior, pushUndo, pickVoxel, setVoxelBehavior, rebuildMesh]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!isPaintingRef.current && !boxStartRef.current) {
      const idx = pickVoxel(x, y);
      if (idx !== null) {
        const v = voxelsRef.current[idx];
        const key = `${v.x},${v.y},${v.z}`;
        const beh = behaviorMapRef.current.get(key) ?? 'synced';
        setHoverInfo(`[${v.x}, ${v.y}, ${v.z}] = ${beh}`);
      } else {
        setHoverInfo(null);
      }
    }

    if (toolMode === 'paint' && isPaintingRef.current) {
      const idx = pickVoxel(x, y);
      if (idx !== null) setVoxelBehavior(idx, paintBehavior);
    } else if (toolMode === 'box' && boxStartRef.current) {
      const sx = boxStartRef.current.x;
      const sy = boxStartRef.current.y;
      setBoxRect({
        x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
        w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy),
      });
    }
  }, [toolMode, paintBehavior, pickVoxel, setVoxelBehavior]);

  const rebuildTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPaintingRef.current) return;
    if (rebuildTimerRef.current) return;
    rebuildTimerRef.current = window.setInterval(() => {
      if (isPaintingRef.current) rebuildMesh();
    }, 120);
    return () => {
      if (rebuildTimerRef.current) { clearInterval(rebuildTimerRef.current); rebuildTimerRef.current = null; }
    };
  }, [toolMode, rebuildMesh]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (toolMode === 'paint' && isPaintingRef.current) {
      isPaintingRef.current = false;
      rebuildMesh();
    } else if (toolMode === 'box' && boxStartRef.current) {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!scene || !camera || !canvas) { boxStartRef.current = null; setBoxRect(null); return; }

      const rect = canvas.getBoundingClientRect();
      const sx = Math.min(boxStartRef.current.x, e.clientX) - rect.left;
      const sy = Math.min(boxStartRef.current.y, e.clientY) - rect.top;
      const ex = Math.max(boxStartRef.current.x, e.clientX) - rect.left;
      const ey = Math.max(boxStartRef.current.y, e.clientY) - rect.top;

      if (ex - sx < 5 && ey - sy < 5) {
        const idx = pickVoxel((sx + ex) / 2, (sy + ey) / 2);
        if (idx !== null) { pushUndo(); setVoxelBehavior(idx, paintBehavior); rebuildMesh(); }
      } else {
        pushUndo();
        const { cx, cy } = centerRef.current;
        const engine = scene.getEngine();
        const vpW = engine.getRenderWidth();
        const vpH = engine.getRenderHeight();
        const vm = scene.getViewMatrix();
        const pm = scene.getProjectionMatrix();
        const viewport = camera.viewport.toGlobal(vpW, vpH);

        for (let i = 0; i < voxelsRef.current.length; i++) {
          const v = voxelsRef.current[i];
          const worldPos = new Vector3(
            (v.x + 0.5 - cx) * SCALE, (v.z + 0.5) * SCALE, -(v.y + 0.5 - cy) * SCALE,
          );
          const screenPos = Vector3.Project(worldPos, vm, pm, viewport);
          if (screenPos.x >= sx && screenPos.x <= ex && screenPos.y >= sy && screenPos.y <= ey) {
            setVoxelBehavior(i, paintBehavior);
          }
        }
        rebuildMesh();
      }

      boxStartRef.current = null;
      setBoxRect(null);
    }
  }, [toolMode, paintBehavior, pushUndo, pickVoxel, setVoxelBehavior, rebuildMesh]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const surface: string[] = [];
      const gravity: string[] = [];
      for (const [k, b] of behaviorMapRef.current) {
        if (b === 'surface') surface.push(k);
        else if (b === 'gravity') gravity.push(k);
      }
      const resp = await fetch('/api/equip-behavior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partKey, setKey, behaviors: { surface, gravity } }),
      });
      if (!resp.ok) throw new Error('Save failed');
      setDirty(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }, [partKey, setKey]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      <div style={{
        width: 280, minWidth: 280, background: '#0f0f23', color: '#ccc',
        borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Link href="/equip-config" style={{ color: '#68f', fontSize: 12, textDecoration: 'none' }}>← Back</Link>
            <span style={{ fontSize: 10, color: '#555' }}>Voxel Behavior Editor</span>
          </div>
          <div style={{ fontWeight: 'bold', fontSize: 18 }}>{partKey}</div>
          {setKey && <div style={{ fontSize: 11, color: '#8af' }}>{setKey}</div>}
          {partInfo && <div style={{ fontSize: 11, color: '#888' }}>{partInfo.voxels} voxels</div>}
        </div>

        {error && <div style={{ padding: 12, color: '#f88', fontSize: 12 }}>Error: {error}</div>}
        {loading && <div style={{ padding: 12, color: '#88f', fontSize: 12 }}>Loading...</div>}

        <ToolModePanelTmp toolMode={toolMode} onToolModeChange={setToolMode} />
        <BehaviorPaintPanelTmp paintBehavior={paintBehavior} onPaintBehaviorChange={setPaintBehavior} />
        <VoxelStatsTmp stats={stats} totalVoxels={voxelsRef.current.length} />

        {hoverInfo && (
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#aaa', borderBottom: '1px solid #222' }}>
            Hover: {hoverInfo}
          </div>
        )}

        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={performUndo} disabled={!canUndo} style={{
            padding: '8px 0', borderRadius: 4, cursor: canUndo ? 'pointer' : 'default',
            background: canUndo ? '#3a3a5e' : '#1a1a2e', color: canUndo ? '#ccc' : '#444',
            border: '1px solid #444', fontSize: 12,
          }}>
            Undo (Ctrl+Z)
          </button>
          <button onClick={handleSave} disabled={saving || !dirty} style={{
            padding: '10px 0', borderRadius: 4, cursor: dirty ? 'pointer' : 'default',
            background: dirty ? '#4a6' : '#1a1a2e', color: dirty ? '#fff' : '#444',
            border: dirty ? '2px solid #5b7' : '1px solid #333', fontSize: 13, fontWeight: 'bold',
          }}>
            {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>

        <div style={{ padding: '10px 12px', marginTop: 'auto', borderTop: '1px solid #222' }}>
          <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>
            <div><b>Q</b> Navigate / <b>W</b> Paint / <b>E</b> Box Select</div>
            <div><b>1</b> Synced / <b>2</b> Surface / <b>3</b> Gravity</div>
            <div><b>Ctrl+Z</b> Undo</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%', height: '100%', outline: 'none',
            cursor: toolMode === 'navigate' ? 'grab' : 'crosshair',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {boxRect && (
          <div style={{
            position: 'fixed', left: boxRect.x, top: boxRect.y,
            width: boxRect.w, height: boxRect.h,
            border: '2px dashed #8af', background: 'rgba(100, 150, 255, 0.15)',
            pointerEvents: 'none', zIndex: 10,
          }} />
        )}

        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '4px 10px',
          background: 'rgba(0,0,0,0.6)', borderRadius: 4, fontSize: 12, color: '#aaa',
        }}>
          {toolMode === 'navigate' ? 'Navigate' : toolMode === 'paint' ? `Paint: ${paintBehavior}` : 'Box Select'}
          {dirty && <span style={{ color: '#f84', marginLeft: 8 }}>*unsaved</span>}
        </div>
      </div>
    </div>
  );
}
