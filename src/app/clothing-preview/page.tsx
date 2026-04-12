'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, Mesh, StandardMaterial, MeshBuilder,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { SCALE } from '@/lib/vox-parser';
import { loadVoxMesh } from '@/lib/vox-mesh';

const VOX_API = '/api/vox';
const QM_DIR = 'female/realistic-queenmarika-default';

// ========================================================================
// 部位定義
// ========================================================================
const BONE_REGIONS = [
  'head', 'neck',
  'shoulder_l', 'shoulder_r',
  'upper_torso', 'lower_torso',
  'hips',
  'upper_arm_l', 'upper_arm_r',
  'forearm_l', 'forearm_r',
  'hand_l', 'hand_r',
  'thigh_l', 'thigh_r',
  'shin_l', 'shin_r',
  'foot_l', 'foot_r',
] as const;

const REGION_COLORS: Record<string, string> = {
  head: '#ffc8c8', neck: '#ff9696',
  shoulder_l: '#c8c8ff', shoulder_r: '#9696ff',
  upper_torso: '#ffff96', lower_torso: '#ffdc64',
  hips: '#ffb450',
  upper_arm_l: '#64c8ff', upper_arm_r: '#32b4ff',
  forearm_l: '#64ffc8', forearm_r: '#32e6b4',
  hand_l: '#96ff96', hand_r: '#64dc64',
  thigh_l: '#ff96ff', thigh_r: '#e664e6',
  shin_l: '#c864ff', shin_r: '#b450e6',
  foot_l: '#ff6464', foot_r: '#dc5050',
};

// ========================================================================
// 型定義
// ========================================================================
interface PreviewManifest {
  model: string;
  mode: string;
  body_glb: string;
  parts: { name: string; file: string }[];
  regions: string[];
}

interface GridInfo {
  voxel_size: number;
}

// ========================================================================
// コンポーネント
// ========================================================================
export default function ClothingPreviewPage() {
  // 左パネル（QMボクセル）
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const leftSceneRef = useRef<Scene | null>(null);
  const leftCamRef = useRef<ArcRotateCamera | null>(null);

  // 右パネル（3Dモデル）
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightSceneRef = useRef<Scene | null>(null);
  const rightCamRef = useRef<ArcRotateCamera | null>(null);
  const rightMeshesRef = useRef<Record<string, Mesh[]>>({});

  const [manifest, setManifest] = useState<PreviewManifest | null>(null);
  const [partVisibility, setPartVisibility] = useState<Record<string, boolean>>({});
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const syncingRef = useRef(false);

  // カメラ同期
  const syncCameras = useCallback((source: ArcRotateCamera, target: ArcRotateCamera) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    target.alpha = source.alpha;
    target.beta = source.beta;
    target.radius = source.radius;
    target.target.copyFrom(source.target);
    syncingRef.current = false;
  }, []);

  // シーン初期化（共通）
  const initScene = useCallback((canvas: HTMLCanvasElement, isLeft: boolean) => {
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.06, 0.06, 0.10, 1);

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0,
      new Vector3(0, 0.8, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.3;
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

    // カメラ同期イベント
    cam.onViewMatrixChangedObservable.add(() => {
      const otherCam = isLeft ? rightCamRef.current : leftCamRef.current;
      if (otherCam) syncCameras(cam, otherCam);
    });

    return { engine, scene, cam };
  }, [syncCameras]);

  // 左パネル: QMボクセル Body (部位色分け)
  useEffect(() => {
    const canvas = leftCanvasRef.current;
    if (!canvas) return;

    const { engine, scene, cam } = initScene(canvas, true);
    leftSceneRef.current = scene;
    leftCamRef.current = cam;

    // QM body_regions_combined.vox をロード
    (async () => {
      try {
        const gridResp = await fetch(`${VOX_API}/${QM_DIR}/grid.json?v=${Date.now()}`);
        let voxelScale = SCALE;
        if (gridResp.ok) {
          const grid: GridInfo = await gridResp.json();
          voxelScale = grid.voxel_size;
        }
        const mesh = await loadVoxMesh(scene,
          `${VOX_API}/${QM_DIR}/body/body_regions_combined.vox`,
          'qm_body', voxelScale);
        const mat = new StandardMaterial('bodyMat', scene);
        mat.emissiveColor = Color3.White();
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mesh.material = mat;
      } catch (e) {
        console.error('Failed to load QM body:', e);
      }
    })();

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      leftSceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 右パネル: 3Dモデル
  useEffect(() => {
    const canvas = rightCanvasRef.current;
    if (!canvas) return;

    const { engine, scene, cam } = initScene(canvas, false);
    rightSceneRef.current = scene;
    rightCamRef.current = cam;

    // マニフェスト読み込み & GLBロード
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const manifestUrl = `${VOX_API}/${QM_DIR}/preview_models/helena_witch/manifest.json?v=${Date.now()}`;
        const resp = await fetch(manifestUrl);
        if (!resp.ok) {
          setError('manifest.json not found');
          setLoading(false);
          return;
        }
        const mf: PreviewManifest = await resp.json();
        setManifest(mf);

        const baseUrl = `${VOX_API}/${QM_DIR}/preview_models/helena_witch`;
        const bust = `?v=${Date.now()}`;

        // Body GLB（GLTFローダーのPBRマテリアルが頂点カラーを自動表示）
        await SceneLoader.ImportMeshAsync('', '', `${baseUrl}/${mf.body_glb}${bust}`, scene);

        // 衣装パーツ GLB
        const vis: Record<string, boolean> = {};
        for (const part of mf.parts) {
          try {
            const partResult = await SceneLoader.ImportMeshAsync('', '', `${baseUrl}/${part.file}${bust}`, scene);
            const meshes: Mesh[] = [];
            for (const m of partResult.meshes) {
              if (m instanceof Mesh) {
                const pmat = new StandardMaterial(`mat_${part.name}`, scene);
                pmat.diffuseColor = new Color3(0.85, 0.85, 0.95);
                pmat.alpha = 0.5;
                pmat.backFaceCulling = false;
                m.material = pmat;
                m.setEnabled(false);
                meshes.push(m);
              }
            }
            rightMeshesRef.current[part.name] = meshes;
            vis[part.name] = false;
          } catch {
            console.error(`Failed to load part: ${part.name}`);
          }
        }
        setPartVisibility(vis);
        setLoading(false);
      } catch (e) {
        setError(`Failed: ${e}`);
        setLoading(false);
      }
    })();

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      rightSceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePart = useCallback((name: string) => {
    setPartVisibility(prev => {
      const next = { ...prev, [name]: !prev[name] };
      const meshes = rightMeshesRef.current[name];
      if (meshes) meshes.forEach(m => m.setEnabled(next[name]));
      return next;
    });
  }, []);

  const toggleRegion = useCallback((region: string) => {
    setSelectedRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  }, []);

  const copyBones = useCallback(() => {
    navigator.clipboard.writeText(Array.from(selectedRegions).join(','));
  }, [selectedRegions]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#12121f', color: '#ddd', fontFamily: 'monospace' }}>
      {/* 左パネル: QMボクセルBody */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '2px solid #333' }}>
        <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', fontSize: 12, color: '#8af' }}>
          QM Base Body (Voxel - Region Colors)
        </div>
        <canvas ref={leftCanvasRef} style={{ flex: 1 }} />
      </div>

      {/* 右パネル: 3Dモデル */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', fontSize: 12, color: '#fa8' }}>
          Source 3D Model ({manifest?.model || 'Loading...'})
        </div>
        <canvas ref={rightCanvasRef} style={{ flex: 1 }} />
      </div>

      {/* 右サイドバー */}
      <div style={{
        width: 240, minWidth: 240, padding: '10px',
        overflowY: 'auto', background: 'rgba(0,0,0,0.4)',
        borderLeft: '1px solid #333',
      }}>
        {/* 衣装パーツ */}
        <h3 style={{ fontSize: 13, margin: '0 0 8px', color: '#fa8' }}>Clothing Parts</h3>
        {loading && <div style={{ color: '#8af', fontSize: 11 }}>Loading...</div>}
        {error && <div style={{ color: '#f88', fontSize: 11 }}>{error}</div>}
        {manifest?.parts.map(p => (
          <button
            key={p.name}
            onClick={() => togglePart(p.name)}
            style={{
              display: 'block', width: '100%', padding: '5px 8px', marginBottom: 3,
              fontSize: 10, textAlign: 'left', cursor: 'pointer',
              border: partVisibility[p.name] ? '2px solid #fa8' : '1px solid #444',
              borderRadius: 4,
              background: partVisibility[p.name] ? 'rgba(255,150,50,0.2)' : 'rgba(30,30,50,0.6)',
              color: partVisibility[p.name] ? '#fff' : '#888',
            }}
          >
            {p.name}
          </button>
        ))}

        {/* 部位選択 */}
        <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#8af' }}>Body Regions</h3>
        <p style={{ fontSize: 9, color: '#666', margin: '0 0 6px' }}>
          Select regions this clothing covers
        </p>
        {BONE_REGIONS.map(region => (
          <button
            key={region}
            onClick={() => toggleRegion(region)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', padding: '4px 6px', marginBottom: 2,
              fontSize: 10, textAlign: 'left', cursor: 'pointer',
              border: selectedRegions.has(region) ? `2px solid ${REGION_COLORS[region]}` : '1px solid #333',
              borderRadius: 3,
              background: selectedRegions.has(region) ? `${REGION_COLORS[region]}33` : 'transparent',
              color: selectedRegions.has(region) ? '#fff' : '#666',
            }}
          >
            <span style={{
              width: 12, height: 12, borderRadius: 2, flexShrink: 0,
              background: REGION_COLORS[region],
              border: selectedRegions.has(region) ? '2px solid #fff' : '1px solid #444',
            }} />
            {region}
          </button>
        ))}

        {selectedRegions.size > 0 && (
          <div style={{ marginTop: 12, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
            <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>
              --bones value ({selectedRegions.size}):
            </div>
            <div style={{ fontSize: 11, color: '#8f8', wordBreak: 'break-all', marginBottom: 6 }}>
              {Array.from(selectedRegions).join(',')}
            </div>
            <button
              onClick={copyBones}
              style={{
                width: '100%', padding: '5px 0', fontSize: 10,
                border: '1px solid #4a4', borderRadius: 3,
                background: 'rgba(40,80,40,0.3)', color: '#afa', cursor: 'pointer',
              }}
            >
              Copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
