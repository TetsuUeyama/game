

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
  VoxelCloth, MIXAMO_HUMANOID_CAPSULES, DEFAULT_ANCHOR_BONES,
} from '@/lib/cloth';
import { loadOutfitAsCloth, loadGridInfo } from '@/lib/cloth-outfit-loader';
import type { GridInfo } from '@/lib/cloth';

if (typeof window !== 'undefined') {
  DracoCompression.Configuration = {
    decoder: {
      wasmUrl: 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js',
      wasmBinaryUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm',
      fallbackUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.js',
    },
  };
}

const BODY_GLB = 'qm_skinned.glb';
const OUTFIT_SET_KEY = 'special__qm_default';
const GRID_URL = '/api/vox/female/realistic-queenmarika-default/grid.json';

/** 外力テスト用の方向プリセット（単位ベクトル） */
const FORCE_DIRECTIONS = [
  { label: '+X (右)',  x:  1, y:  0, z:  0, color: '#f88' },
  { label: '-X (左)',  x: -1, y:  0, z:  0, color: '#f88' },
  { label: '+Y (上)',  x:  0, y:  1, z:  0, color: '#8f8' },
  { label: '-Y (下)',  x:  0, y: -1, z:  0, color: '#8f8' },
  { label: '+Z (前)',  x:  0, y:  0, z:  1, color: '#88f' },
  { label: '-Z (後)',  x:  0, y:  0, z: -1, color: '#88f' },
];

export default function ClothTestPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const skeletonRef = useRef<Skeleton | null>(null);
  const rootNodeRef = useRef<AbstractMesh | TransformNode | null>(null);
  const animGroupsRef = useRef<AnimationGroup[]>([]);
  const activeAnimRef = useRef<AnimationGroup | null>(null);
  const clothRef = useRef<VoxelCloth | null>(null);
  const gridRef = useRef<GridInfo | null>(null);

  const [info, setInfo] = useState<{ faceCount: number; boneCount: number } | null>(null);
  const [availableAnims, setAvailableAnims] = useState<string[]>([]);
  const [activeMotion, setActiveMotion] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [glbReady, setGlbReady] = useState(false);
  const [clothReady, setClothReady] = useState(false);
  const [clothError, setClothError] = useState<string | null>(null);
  const [clothStats, setClothStats] = useState<{
    voxelCount: number; pinnedCount: number;
    stretchConstraints: number; bendingConstraints: number;
  } | null>(null);
  const [hideBody, setHideBody] = useState(false);

  // 外力: 方向 × 強さ。slider 値は 0..1、実際の force は magnitude * unitScale
  const [activeDir, setActiveDir] = useState<number | null>(null);
  const [forceMag, setForceMag] = useState(0.003);  // frame^2 単位
  const [gravityOn, setGravityOn] = useState(true);

  // ---- Scene init ----
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

  // ---- Body GLB load ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    setGlbReady(false);
    (async () => {
      const glbUrl = `/demo/${BODY_GLB}?v=${Date.now()}`;
      const result = await SceneLoader.ImportMeshAsync('', '', glbUrl, scene);
      const groups = result.animationGroups.slice();
      for (const ag of groups) { ag.stop(); ag.reset(); }
      animGroupsRef.current = groups;
      activeAnimRef.current = null;

      let faceCount = 0;
      result.meshes.forEach((m: AbstractMesh) => {
        faceCount += Math.floor((m.getTotalIndices?.() ?? 0) / 3);
      });

      if (result.skeletons.length > 0) {
        skeletonRef.current = result.skeletons[0];
        const rootNode = result.meshes.find(m => m.name === '__root__') ?? result.meshes[0];
        rootNodeRef.current = rootNode ?? null;
      }
      setInfo({ faceCount, boneCount: skeletonRef.current?.bones.length ?? 0 });
      setAvailableAnims(groups.map(g => g.name));
      setGlbReady(true);
    })();
  }, []);

  // ---- Cloth build (once per GLB load) ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !glbReady || !skeletonRef.current) return;

    let cancelled = false;
    setClothReady(false);
    setClothError(null);

    (async () => {
      try {
        if (!gridRef.current) {
          gridRef.current = await loadGridInfo(GRID_URL);
        }
        const { voxels } = await loadOutfitAsCloth(OUTFIT_SET_KEY);
        if (cancelled) return;
        if (voxels.length === 0) throw new Error('outfit has no voxels');

        // 旧 cloth 片付け
        if (clothRef.current) { clothRef.current.dispose(); clothRef.current = null; }

        const cloth = new VoxelCloth(scene, {
          name: 'cloth_test',
          voxels,
          grid: gridRef.current,
          skeleton: skeletonRef.current!,
          anchorVoxelSet: new Set(),  // 布のみ — 非布近接 pin は不要
          anchorBones: [...DEFAULT_ANCHOR_BONES],  // 胴体系のみ pin 候補
          capsules: MIXAMO_HUMANOID_CAPSULES,
          gravity: -0.0002,
          damping: 0.96,
          iterations: 16,
        });
        if (rootNodeRef.current) cloth.mesh.parent = rootNodeRef.current;

        if (cancelled) { cloth.dispose(); return; }
        clothRef.current = cloth;
        setClothStats({
          voxelCount: cloth.stats.voxelCount,
          pinnedCount: cloth.stats.pinnedCount,
          stretchConstraints: cloth.stats.stretchConstraints,
          bendingConstraints: cloth.stats.bendingConstraints,
        });
        setClothReady(true);
      } catch (e) {
        if (!cancelled) setClothError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { cancelled = true; };
  }, [glbReady]);

  // ---- Body visibility ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const m of scene.meshes) {
      if (m.name === 'ground') continue;
      if (m.name === 'cloth_test') continue;
      m.isVisible = !hideBody;
    }
  }, [hideBody, glbReady, clothReady]);

  // ---- External force application ----
  useEffect(() => {
    const cloth = clothRef.current;
    if (!cloth || !clothReady) return;
    if (activeDir === null) {
      cloth.setExternalForce(0, 0, 0);
    } else {
      const d = FORCE_DIRECTIONS[activeDir];
      cloth.setExternalForce(d.x * forceMag, d.y * forceMag, d.z * forceMag);
    }
  }, [activeDir, forceMag, clothReady]);

  // ---- Gravity toggle ----
  useEffect(() => {
    const cloth = clothRef.current;
    if (!cloth || !clothReady) return;
    cloth.setGravity(gravityOn ? -0.0002 : 0);
  }, [gravityOn, clothReady]);

  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    if (activeAnimRef.current) activeAnimRef.current.speedRatio = speedRef.current;
  }, [speed]);

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
    group.speedRatio = speedRef.current;
    group.start(true, 1.0, group.from, group.to);
    activeAnimRef.current = group;
    setActiveMotion(name);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh',
                  background: '#12121f', color: '#ddd', fontFamily: 'monospace' }}>
      {/* 左: ビューア */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)',
                      borderBottom: '1px solid #333' }}>
          <span style={{ color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
            QM Cloth Simulation Test
          </span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
            Entire QM outfit is treated as cloth (PBD). Apply external force to verify.
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
              {clothStats && (
                <>
                  <div style={{ color: '#8af', margin: '8px 0 4px' }}>Cloth</div>
                  <div>Voxels: <b>{clothStats.voxelCount}</b></div>
                  <div>Pinned: <b>{clothStats.pinnedCount}</b></div>
                  <div>Stretch: <b>{clothStats.stretchConstraints}</b></div>
                  <div>Bending: <b>{clothStats.bendingConstraints}</b></div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右: 外力 + モーション */}
      <div style={{ width: 260, padding: 12, background: 'rgba(0,0,0,0.4)',
                    borderLeft: '1px solid #333', overflowY: 'auto' }}>
        <h3 style={{ fontSize: 13, margin: '0 0 8px', color: '#8fa' }}>Cloth</h3>
        {!clothReady && !clothError && (
          <div style={{ fontSize: 10, color: '#8af' }}>
            {glbReady ? 'Building cloth...' : 'Waiting for body...'}
          </div>
        )}
        {clothError && (
          <div style={{ fontSize: 10, color: '#f88', marginBottom: 6 }}>{clothError}</div>
        )}

        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
          fontSize: 10, color: '#aaa', cursor: 'pointer', userSelect: 'none',
        }}>
          <input type="checkbox" checked={hideBody}
            onChange={(e) => setHideBody(e.target.checked)} />
          Hide Body
        </label>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
          fontSize: 10, color: '#aaa', cursor: 'pointer', userSelect: 'none',
        }}>
          <input type="checkbox" checked={gravityOn}
            onChange={(e) => setGravityOn(e.target.checked)} />
          Gravity ON
        </label>

        <h3 style={{ fontSize: 13, margin: '12px 0 8px', color: '#fa8' }}>External Force</h3>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>
          強さ: {forceMag.toFixed(4)}
        </div>
        <input type="range" min={0} max={0.01} step={0.0005} value={forceMag}
          onChange={e => setForceMag(parseFloat(e.target.value))}
          style={{ width: '100%', marginBottom: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
          {FORCE_DIRECTIONS.map((d, i) => {
            const active = activeDir === i;
            return (
              <button key={d.label}
                disabled={!clothReady}
                onClick={() => setActiveDir(active ? null : i)}
                style={{
                  padding: '6px 4px', fontSize: 10,
                  cursor: clothReady ? 'pointer' : 'default',
                  border: active ? `2px solid ${d.color}` : '1px solid #444',
                  borderRadius: 3,
                  background: active ? `rgba(255,150,50,0.25)` : 'rgba(30,30,50,0.6)',
                  color: active ? '#fff' : d.color,
                  fontFamily: 'monospace', opacity: clothReady ? 1 : 0.4,
                }}>
                {d.label}
              </button>
            );
          })}
        </div>
        <button onClick={() => setActiveDir(null)} disabled={activeDir === null}
          style={{
            width: '100%', padding: '6px 0', fontSize: 10,
            border: '1px solid #a44', borderRadius: 3,
            background: 'rgba(80,40,40,0.3)', color: '#faa',
            cursor: activeDir === null ? 'default' : 'pointer',
            fontFamily: 'monospace', opacity: activeDir === null ? 0.4 : 1,
          }}>
          Clear Force
        </button>

        <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#fa8' }}>Motion</h3>
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
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
            Speed: {speed.toFixed(1)}x
          </div>
          <input type="range" min={0.2} max={3.0} step={0.1} value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
            style={{ width: '100%' }} />
        </div>
        <button onClick={stopMotion} style={{
          marginTop: 10, width: '100%', padding: '6px 0', fontSize: 11,
          border: '1px solid #a44', borderRadius: 3,
          background: 'rgba(80,40,40,0.3)', color: '#faa', cursor: 'pointer',
          fontFamily: 'monospace',
        }}>Stop Motion</button>

        <div style={{ marginTop: 20, padding: 8, fontSize: 10,
                      background: 'rgba(0,0,0,0.3)', borderRadius: 4, color: '#888' }}>
          Body: qm_skinned.glb<br/>
          Outfit: QM default (all voxels as cloth)<br/>
          Sim: PBD (Verlet + distance constraints)
        </div>
      </div>
    </div>
  );
}
