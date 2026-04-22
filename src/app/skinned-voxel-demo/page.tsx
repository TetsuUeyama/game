'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial,
  AbstractMesh, Skeleton, AnimationGroup, TransformNode,
} from '@babylonjs/core';
import { DracoCompression } from '@babylonjs/core/Meshes/Compression/dracoCompression';
import '@babylonjs/loaders/glTF';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import {
  loadBehaviorOverlay, outfitKeyToSetKey, detectSkeletonAxes,
  type BehaviorOverlayHandle, type GridInfo,
} from '@/lib/behavior-overlay';
import { BEHAVIOR_INFO_LIST } from '@/types/equip';

if (typeof window !== 'undefined') {
  DracoCompression.Configuration = {
    decoder: {
      wasmUrl: 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js',
      wasmBinaryUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm',
      fallbackUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.js',
    },
  };
}

// 衣装選択 — body GLB は常に qm_skinned.glb を使い、衣装は voxel overlay で描画
const OUTFIT_LIST = [
  { key: 'nude',           label: 'QM Base (nude)' },
  { key: 'qm_default',     label: 'QM Default (dress + hair)' },
  { key: 'nina_t8',        label: 'Nina T8 + Hair' },
  { key: 'nina_casual',    label: 'Nina Casual + Hair' },
  { key: 'nina_wedding',   label: 'Nina Wedding' },
  { key: 'nina_biker',     label: 'Nina Biker + Hair' },
  { key: 'nina_lingerie',  label: 'Nina Lingerie' },
  { key: 'helena_witch',   label: 'Helena Witch + Long' },
  { key: 'helena_bunny',   label: 'Helena Bunny' },
  { key: 'helena_default', label: 'Helena Default' },
  { key: 'helena_summer',  label: 'Helena Summer' },
];

const BODY_GLB = 'qm_skinned.glb';

export default function SkinnedVoxelDemoPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const skeletonRef = useRef<Skeleton | null>(null);
  const rootNodeRef = useRef<AbstractMesh | TransformNode | null>(null);
  const animGroupsRef = useRef<AnimationGroup[]>([]);
  const activeAnimRef = useRef<AnimationGroup | null>(null);

  const [info, setInfo] = useState<{
    faceCount: number; boneCount: number; fileSize: string;
  } | null>(null);
  const [activeMotion, setActiveMotion] = useState<string | null>(null);
  const [availableAnims, setAvailableAnims] = useState<string[]>([]);
  const [speed, setSpeed] = useState(1.0);
  const [outfit, setOutfit] = useState<string>('nude');
  const overlayRef = useRef<BehaviorOverlayHandle | null>(null);
  const gridRef = useRef<GridInfo | null>(null);
  const [overlayStats, setOverlayStats] = useState<BehaviorOverlayHandle['stats'] | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [glbReady, setGlbReady] = useState<boolean>(false);
  const [hideBody, setHideBody] = useState<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.06, 0.06, 0.10, 1);
    sceneRef.current = scene;

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.5,
      new Vector3(0, 0.85, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.5;
    cam.upperRadiusLimit = 15;
    cam.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);

    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10, subdivisions: 10 }, scene);
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

  // Body GLB は一度だけロード。衣装は voxel overlay 側で管理する。
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    setGlbReady(false);
    setOverlayStats(null);

    (async () => {
      const glbUrl = `/demo/${BODY_GLB}?v=${Date.now()}`;
      let fileSize = '?';
      try {
        const h = await fetch(glbUrl, { method: 'HEAD' });
        const len = h.headers.get('content-length');
        if (len) fileSize = `${(parseInt(len) / 1024).toFixed(1)} KB`;
      } catch { /* noop */ }

      const result = await SceneLoader.ImportMeshAsync('', '', glbUrl, scene);
      const groups = result.animationGroups.slice();
      for (const ag of groups) { ag.stop(); ag.reset(); }
      animGroupsRef.current = groups;
      activeAnimRef.current = null;

      let faceCount = 0;
      result.meshes.forEach((m: AbstractMesh) => {
        faceCount += Math.floor((m.getTotalIndices?.() ?? 0) / 3);
      });
      let boneCount = 0;
      if (result.skeletons.length > 0) {
        const skel: Skeleton = result.skeletons[0];
        skeletonRef.current = skel;
        boneCount = skel.bones.length;

        // 実装前チェック: root ノードの向き & skeleton forward を console 出力
        const rootNode = result.meshes.find(m => m.name === '__root__') ?? result.meshes[0];
        if (rootNode) {
          rootNodeRef.current = rootNode;
          const wm = rootNode.getWorldMatrix();
          console.log('[skinned-voxel-demo] GLB root node:');
          console.log(`  name     = ${rootNode.name}`);
          console.log(`  rotation = (${rootNode.rotation.x.toFixed(3)}, ${rootNode.rotation.y.toFixed(3)}, ${rootNode.rotation.z.toFixed(3)})`);
          console.log(`  scaling  = (${rootNode.scaling.x.toFixed(3)}, ${rootNode.scaling.y.toFixed(3)}, ${rootNode.scaling.z.toFixed(3)})`);
          console.log(`  worldMat row0 = ${wm.m[0].toFixed(3)}, ${wm.m[1].toFixed(3)}, ${wm.m[2].toFixed(3)}, ${wm.m[3].toFixed(3)}`);
          console.log(`  worldMat row1 = ${wm.m[4].toFixed(3)}, ${wm.m[5].toFixed(3)}, ${wm.m[6].toFixed(3)}, ${wm.m[7].toFixed(3)}`);
          console.log(`  worldMat row2 = ${wm.m[8].toFixed(3)}, ${wm.m[9].toFixed(3)}, ${wm.m[10].toFixed(3)}, ${wm.m[11].toFixed(3)}`);
          console.log(`  scene handedness = ${scene.useRightHandedSystem ? 'right-handed' : 'left-handed (default)'}`);
        }
        const axes = detectSkeletonAxes(skel);
        if (axes) {
          const f = (v: Vector3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
          console.log('[skinned-voxel-demo] detected skeleton forward/up/right (world):');
          console.log(`  up      = ${f(axes.up)}`);
          console.log(`  right   = ${f(axes.right)}`);
          console.log(`  forward = ${f(axes.forward)}  (絶対ルール: +Z であるべき)`);
        }
      }
      setInfo({ faceCount, boneCount, fileSize });
      setAvailableAnims(groups.map(g => g.name));
      setActiveMotion(null);
      setGlbReady(true);
    })();
  }, []);

  // 再生速度変更を現アニメに反映
  useEffect(() => {
    if (activeAnimRef.current) {
      activeAnimRef.current.speedRatio = speed;
    }
  }, [speed]);

  // 衣装 voxel overlay。Body (GLB) がロード完了後、選択中の outfit に合わせて構築
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (overlayRef.current) { overlayRef.current.dispose(); overlayRef.current = null; }
    setOverlayStats(null);
    setOverlayError(null);

    if (!glbReady) return;
    const setKey = outfitKeyToSetKey(outfit);
    if (!setKey) return;  // nude: no clothing
    if (!skeletonRef.current) { setOverlayError('Skeleton not ready'); return; }

    let cancelled = false;
    setOverlayLoading(true);
    (async () => {
      try {
        if (!gridRef.current) {
          const gridResp = await fetch('/api/vox/female/realistic-queenmarika-default/grid.json');
          if (!gridResp.ok) throw new Error('grid.json not found');
          gridRef.current = await gridResp.json();
        }
        const handle = await loadBehaviorOverlay(
          scene, setKey, gridRef.current!, skeletonRef.current,
          { parentNode: rootNodeRef.current ?? undefined },
        );
        if (cancelled) { handle.dispose(); return; }
        overlayRef.current = handle;
        setOverlayStats(handle.stats);
      } catch (e) {
        if (!cancelled) setOverlayError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setOverlayLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [outfit, glbReady]);

  // Body GLB の表示/非表示
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const m of scene.meshes) {
      if (m.name === 'ground') continue;
      if (m.name.startsWith('overlay_')) continue;
      m.isVisible = !hideBody;
    }
  }, [hideBody, glbReady, overlayStats]);

  const stopMotion = useCallback(() => {
    if (activeAnimRef.current) {
      activeAnimRef.current.stop();
      activeAnimRef.current.reset();
      activeAnimRef.current = null;
    }
    setActiveMotion(null);
  }, []);

  const playMotion = useCallback((name: string) => {
    const group = animGroupsRef.current.find(g => g.name === name);
    if (!group) return;
    for (const g of animGroupsRef.current) {
      if (g !== group) { g.stop(); g.reset(); }
    }
    group.speedRatio = speed;
    group.start(true, 1.0, group.from, group.to);
    activeAnimRef.current = group;
    setActiveMotion(name);
  }, [speed]);

  return (
    <div style={{ display: 'flex', height: '100vh',
                  background: '#12121f', color: '#ddd', fontFamily: 'monospace' }}>
      {/* 左: ビューア */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)',
                      borderBottom: '1px solid #333' }}>
          <span style={{ color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
            QM Body × Clothing Voxel Overlay
          </span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
            Body follows motion / clothing respects behavior (synced = follow, gravity = stay)
          </span>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          {info && (
            <div style={{
              position: 'absolute', top: 12, right: 12, padding: 10,
              background: 'rgba(0,0,0,0.6)', border: '1px solid #444',
              borderRadius: 4, fontSize: 11, minWidth: 180,
            }}>
              <div style={{ color: '#8af', marginBottom: 6 }}>Body</div>
              <div>Faces: <b>{info.faceCount.toLocaleString()}</b></div>
              <div>Bones: <b>{info.boneCount}</b></div>
              <div>Size: <b>{info.fileSize}</b></div>
            </div>
          )}
        </div>
      </div>

      {/* 右: 衣装 + モーション選択 */}
      <div style={{ width: 240, padding: 12, background: 'rgba(0,0,0,0.4)',
                    borderLeft: '1px solid #333', overflowY: 'auto' }}>
        <h3 style={{ fontSize: 13, margin: '0 0 8px', color: '#8fa' }}>Outfit (clothing overlay)</h3>
        <select value={outfit} onChange={e => setOutfit(e.target.value)}
          style={{ width: '100%', padding: 6, fontSize: 11,
                   background: '#222', color: '#ddd',
                   border: '1px solid #444', borderRadius: 3,
                   fontFamily: 'monospace', marginBottom: 8 }}>
          {OUTFIT_LIST.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
          fontSize: 10, color: '#aaa', cursor: 'pointer', userSelect: 'none',
        }}>
          <input
            type="checkbox" checked={hideBody}
            onChange={(e) => setHideBody(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Hide Body (clothing overlay only)
        </label>

        {overlayLoading && <div style={{ fontSize: 10, color: '#8af', marginBottom: 6 }}>Loading clothing voxels...</div>}
        {overlayError && <div style={{ fontSize: 10, color: '#f88', marginBottom: 6 }}>{overlayError}</div>}
        {overlayStats && (
          <div style={{
            padding: 6, marginBottom: 10, fontSize: 10,
            background: 'rgba(0,0,0,0.3)', borderRadius: 3, lineHeight: 1.5,
          }}>
            {BEHAVIOR_INFO_LIST.map(info => (
              <div key={info.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10,
                  background: info.color, borderRadius: 2,
                }} />
                <span style={{ color: '#bbb' }}>{info.label}</span>
                <span style={{ color: '#888', marginLeft: 'auto' }}>
                  {overlayStats[info.value]}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              Total: {overlayStats.total} voxels
            </div>
          </div>
        )}

        <h3 style={{ fontSize: 13, margin: '0 0 8px', color: '#fa8' }}>Motion</h3>
        <p style={{ fontSize: 10, color: '#666', margin: '0 0 8px' }}>
          Blender で作成・GLB 内蔵のモーション。
        </p>
        {availableAnims.length === 0 && (
          <div style={{ fontSize: 10, color: '#666' }}>Loading...</div>
        )}
        {availableAnims.map(name => {
          const isActive = activeMotion === name;
          return (
            <button key={name}
              onClick={() => isActive ? stopMotion() : playMotion(name)}
              style={{
                display: 'block', width: '100%', padding: '6px 10px', marginBottom: 4,
                fontSize: 11, textAlign: 'left', cursor: 'pointer',
                border: isActive ? '2px solid #fa8' : '1px solid #444',
                borderRadius: 3,
                background: isActive ? 'rgba(255,150,50,0.2)' : 'rgba(30,30,50,0.6)',
                color: isActive ? '#fff' : '#aaa',
                fontFamily: 'monospace',
              }}>
              {isActive ? '■ ' : '▶ '}{name}
            </button>
          );
        })}

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
            Speed: {speed.toFixed(1)}x
          </div>
          <input type="range" min={0.2} max={3.0} step={0.1} value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
            style={{ width: '100%' }} />
        </div>

        <button onClick={stopMotion} style={{
          marginTop: 14, width: '100%', padding: '6px 0', fontSize: 11,
          border: '1px solid #a44', borderRadius: 3,
          background: 'rgba(80,40,40,0.3)', color: '#faa', cursor: 'pointer',
          fontFamily: 'monospace',
        }}>Stop / Reset</button>

        <div style={{ marginTop: 20, padding: 8, fontSize: 10,
                      background: 'rgba(0,0,0,0.3)', borderRadius: 4, color: '#888' }}>
          Body: qm_skinned.glb (naked)<br/>
          Clothing: voxel overlay with behavior classification
        </div>
      </div>
    </div>
  );
}
