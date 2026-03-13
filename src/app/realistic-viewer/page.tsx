'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
  Color4,
  Mesh,
  VertexData,
  StandardMaterial,
  MeshBuilder,
} from '@babylonjs/core';

// ========================================================================
// VOX parser + mesh builder (same as vox-viewer2)
// ========================================================================

interface VoxModel {
  sizeX: number; sizeY: number; sizeZ: number;
  voxels: { x: number; y: number; z: number; colorIndex: number }[];
  palette: { r: number; g: number; b: number }[];
}

function parseVox(buf: ArrayBuffer): VoxModel {
  const view = new DataView(buf);
  let offset = 0;
  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  const readU8 = () => { const v = view.getUint8(offset); offset += 1; return v; };
  const readStr = (n: number) => {
    let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
    offset += n; return s;
  };
  if (readStr(4) !== 'VOX ') throw new Error('Not a VOX file');
  readU32();
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels: VoxModel['voxels'] = [];
  let palette: VoxModel['palette'] | null = null;
  const readChunks = (end: number) => {
    while (offset < end) {
      const id = readStr(4); const cs = readU32(); const ccs = readU32(); const ce = offset + cs;
      if (id === 'SIZE') { sizeX = readU32(); sizeY = readU32(); sizeZ = readU32(); }
      else if (id === 'XYZI') { const n = readU32(); for (let i = 0; i < n; i++) voxels.push({ x: readU8(), y: readU8(), z: readU8(), colorIndex: readU8() }); }
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const r = readU8(), g = readU8(), b = readU8(); readU8(); palette.push({ r: r / 255, g: g / 255, b: b / 255 }); } }
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };
  if (readStr(4) !== 'MAIN') throw new Error('Expected MAIN');
  const mc = readU32(); const mcc = readU32(); offset += mc;
  readChunks(offset + mcc);
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 }); }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_VERTS = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]],
];
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SCALE = 0.010;

function buildVoxMesh(model: VoxModel, scene: Scene, name: string, scale: number = SCALE): Mesh {
  const occupied = new Set<string>();
  for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const cx = model.sizeX / 2, cy = model.sizeY / 2;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const voxel of model.voxels) {
    const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      const bi = positions.length / 3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        const rx = (voxel.x + fv[vi][0] - cx) * scale;
        const ry = (voxel.y + fv[vi][1] - cy) * scale;
        const rz = (voxel.z + fv[vi][2]) * scale;
        positions.push(rx, rz, -ry);
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(col.r, col.g, col.b, 1);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  return mesh;
}

const CACHE_BUST = `?v=${Date.now()}`;

async function loadVoxMesh(scene: Scene, url: string, name: string, scale: number = SCALE): Promise<Mesh> {
  const resp = await fetch(url + CACHE_BUST);
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  const model = parseVox(await resp.arrayBuffer());
  return buildVoxMesh(model, scene, name, scale);
}

// ========================================================================
// Part manifest type & character config
// ========================================================================

interface PartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
  meshes: string[];
  is_body: boolean;
}

interface GridInfo {
  voxel_size: number;
  gx: number;
  gy: number;
  gz: number;
}

interface CharacterConfig {
  label: string;
  manifest: string;
  gridJson: string;
}

const CHARACTERS: Record<string, CharacterConfig> = {
  cyberpunkelf: {
    label: 'CyberpunkElf',
    manifest: '/realistic/parts.json',
    gridJson: '/realistic/grid.json',
  },
  darkelfblader: {
    label: 'DarkElfBlader',
    manifest: '/realistic-darkelf/parts.json',
    gridJson: '/realistic-darkelf/grid.json',
  },
  highpriestess: {
    label: 'HighPriestess',
    manifest: '/realistic-highpriestess/parts.json',
    gridJson: '/realistic-highpriestess/grid.json',
  },
  pillarwoman: {
    label: 'PillarWoman',
    manifest: '/realistic-pillarwoman/parts.json',
    gridJson: '/realistic-pillarwoman/grid.json',
  },
  bunnyirelia: {
    label: 'BunnyIrelia',
    manifest: '/realistic-bunnyirelia/parts.json',
    gridJson: '/realistic-bunnyirelia/grid.json',
  },
  daemongirl: {
    label: 'DaemonGirl',
    manifest: '/realistic-daemongirl/parts.json',
    gridJson: '/realistic-daemongirl/grid.json',
  },
  daemongirl_default: {
    label: 'DaemonGirl Default',
    manifest: '/realistic-daemongirl-default/parts.json',
    gridJson: '/realistic-daemongirl-default/grid.json',
  },
  daemongirl_bunny: {
    label: 'DaemonGirl Bunny',
    manifest: '/realistic-daemongirl-bunny/parts.json',
    gridJson: '/realistic-daemongirl-bunny/grid.json',
  },
  daemongirl_bunnysuit: {
    label: 'DaemonGirl BunnySuit',
    manifest: '/realistic-daemongirl-bunnysuit/parts.json',
    gridJson: '/realistic-daemongirl-bunnysuit/grid.json',
  },
  daemongirl_ponytail: {
    label: 'DaemonGirl Ponytail',
    manifest: '/realistic-daemongirl-ponytail/parts.json',
    gridJson: '/realistic-daemongirl-ponytail/grid.json',
  },
  primrose_egypt: {
    label: 'Primrose Egypt',
    manifest: '/realistic-primrose-egypt/parts.json',
    gridJson: '/realistic-primrose-egypt/grid.json',
  },
  primrose_officelady: {
    label: 'Primrose OfficeLady',
    manifest: '/realistic-primrose-officelady/parts.json',
    gridJson: '/realistic-primrose-officelady/grid.json',
  },
  primrose_bunnysuit: {
    label: 'Primrose Bunnysuit',
    manifest: '/realistic-primrose-bunnysuit/parts.json',
    gridJson: '/realistic-primrose-bunnysuit/grid.json',
  },
  primrose_swimsuit: {
    label: 'Primrose Swimsuit',
    manifest: '/realistic-primrose-swimsuit/parts.json',
    gridJson: '/realistic-primrose-swimsuit/grid.json',
  },
  primrose_milkapron: {
    label: 'Primrose MilkApron',
    manifest: '/realistic-primrose-milkapron/parts.json',
    gridJson: '/realistic-primrose-milkapron/grid.json',
  },
};

// ========================================================================
// Component
// ========================================================================

export default function RealisticViewerWrapper() {
  return (
    <Suspense fallback={<div style={{ background: '#12121f', width: '100vw', height: '100vh' }} />}>
      <RealisticViewerPage />
    </Suspense>
  );
}

function RealisticViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const bodyMatRef = useRef<StandardMaterial | null>(null);
  const partMatRef = useRef<StandardMaterial | null>(null);

  const meshesRef = useRef<Record<string, Mesh>>({});

  const [charKey, setCharKey] = useState('darkelfblader');
  const [parts, setParts] = useState<PartEntry[]>([]);
  const [partVisibility, setPartVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Toggle individual part
  const togglePart = useCallback((key: string) => {
    setPartVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const mesh = meshesRef.current[key];
      if (mesh) mesh.setEnabled(next[key]);
      return next;
    });
  }, []);

  // Toggle all parts
  const toggleAll = useCallback((on: boolean) => {
    setPartVisibility(prev => {
      const next: Record<string, boolean> = {};
      for (const key in prev) {
        next[key] = on;
        const mesh = meshesRef.current[key];
        if (mesh) mesh.setEnabled(on);
      }
      return next;
    });
  }, []);

  // Toggle body only / parts only
  const toggleCategory = useCallback((isBody: boolean, on: boolean) => {
    setPartVisibility(prev => {
      const next = { ...prev };
      for (const p of parts) {
        if (p.is_body === isBody) {
          next[p.key] = on;
          const mesh = meshesRef.current[p.key];
          if (mesh) mesh.setEnabled(on);
        }
      }
      return next;
    });
  }, [parts]);

  // Initialize scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.06, 0.06, 0.10, 1);

    const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0, new Vector3(0, 0.8, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3;
    camera.upperRadiusLimit = 15;
    camera.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);

    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10, subdivisions: 50 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;

    // Body material
    const bodyMat = new StandardMaterial('bodyMat', scene);
    bodyMat.emissiveColor = Color3.White();
    bodyMat.disableLighting = true;
    bodyMat.backFaceCulling = false;
    bodyMatRef.current = bodyMat;

    // Part material (renders on top of body)
    const partMat = new StandardMaterial('partMat', scene);
    partMat.emissiveColor = Color3.White();
    partMat.disableLighting = true;
    partMat.backFaceCulling = false;
    partMat.zOffset = -2;
    partMatRef.current = partMat;

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load character parts when charKey changes
  useEffect(() => {
    const scene = sceneRef.current;
    const bodyMat = bodyMatRef.current;
    const partMat = partMatRef.current;
    if (!scene || !bodyMat || !partMat) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      // Dispose old meshes
      for (const mesh of Object.values(meshesRef.current)) {
        mesh.dispose();
      }
      meshesRef.current = {};

      const config = CHARACTERS[charKey];
      if (!config) {
        setError(`Unknown character: ${charKey}`);
        setLoading(false);
        return;
      }

      try {
        // Load grid.json to get voxel_size for correct physical scale
        const gridResp = await fetch(config.gridJson + CACHE_BUST);
        let voxelScale = SCALE;
        if (gridResp.ok) {
          const grid: GridInfo = await gridResp.json();
          // Use voxel_size directly so characters render at correct relative sizes
          voxelScale = grid.voxel_size;
        }

        const resp = await fetch(config.manifest + CACHE_BUST);
        if (!resp.ok) {
          setError(`${config.label}: parts.json not found. Run the voxelization pipeline first.`);
          setLoading(false);
          return;
        }
        const allParts: PartEntry[] = await resp.json();
        if (cancelled) return;
        setParts(allParts);

        const vis: Record<string, boolean> = {};
        for (const part of allParts) {
          vis[part.key] = part.default_on;
          try {
            const mesh = await loadVoxMesh(scene, part.file, `part_${part.key}`, voxelScale);
            if (cancelled) { mesh.dispose(); return; }
            // Eyes need partMat (zOffset) to render in front of body
            mesh.material = (part.is_body && part.key !== 'eyes') ? bodyMat : partMat;
            mesh.setEnabled(part.default_on);
            meshesRef.current[part.key] = mesh;
          } catch (e) {
            console.error(`Failed to load ${part.file}:`, e);
          }
        }
        setPartVisibility(vis);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('Failed to load parts manifest');
          setLoading(false);
          console.error(e);
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey]);

  const partLabel = (key: string) => {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      .replace('  ', ' ').trim();
  };

  const bodyParts = parts.filter(p => p.is_body);
  const clothingParts = parts.filter(p => !p.is_body);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#101018', display: 'flex' }}>
      {/* Side panel */}
      <div style={{
        width: 280, minWidth: 280, padding: '14px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.55)', color: '#ddd', fontFamily: 'monospace', fontSize: 12,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#fff' }}>
          Realistic Viewer
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 10, color: '#888' }}>
          Original proportions - no deformation
        </p>

        {/* Character selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {Object.entries(CHARACTERS).map(([key, config]) => (
            <button key={key} onClick={() => setCharKey(key)} style={{
              flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: charKey === key ? 'bold' : 'normal',
              border: charKey === key ? '2px solid #fa0' : '1px solid #555',
              borderRadius: 4,
              background: charKey === key ? 'rgba(180,120,0,0.25)' : 'rgba(40,40,60,0.4)',
              color: charKey === key ? '#fda' : '#999',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {config.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ color: '#8af', fontSize: 13, padding: '20px 0' }}>
            Loading parts...
          </div>
        )}

        {error && (
          <div style={{ color: '#f88', fontSize: 12, padding: '10px', background: 'rgba(200,50,50,0.15)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Master toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              <button onClick={() => toggleAll(true)} style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
                border: '1px solid #4a4', borderRadius: 4,
                background: 'rgba(40,80,40,0.3)', color: '#afa', cursor: 'pointer',
              }}>
                All ON
              </button>
              <button onClick={() => toggleAll(false)} style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
                border: '1px solid #a44', borderRadius: 4,
                background: 'rgba(80,40,40,0.3)', color: '#faa', cursor: 'pointer',
              }}>
                All OFF
              </button>
            </div>

            {/* Body section */}
            {bodyParts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', color: '#8c8', fontSize: 13 }}>
                    Body ({bodyParts.length})
                  </span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => toggleCategory(true, true)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #4a4', borderRadius: 3,
                      background: 'transparent', color: '#8c8', cursor: 'pointer',
                    }}>ON</button>
                    <button onClick={() => toggleCategory(true, false)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                      background: 'transparent', color: '#c88', cursor: 'pointer',
                    }}>OFF</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
                  {bodyParts.map(part => (
                    <button key={part.key} onClick={() => togglePart(part.key)} style={{
                      padding: '5px 10px', fontSize: 11, textAlign: 'left',
                      border: partVisibility[part.key] ? '2px solid #6a6' : '1px solid #444',
                      borderRadius: 4,
                      background: partVisibility[part.key] ? 'rgba(40,80,40,0.35)' : 'rgba(30,30,50,0.6)',
                      color: partVisibility[part.key] ? '#cec' : '#666',
                      cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{partLabel(part.key)}</span>
                      <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Clothing/Accessories section */}
            {clothingParts.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', color: '#8af', fontSize: 13 }}>
                    Parts ({clothingParts.length})
                  </span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => toggleCategory(false, true)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #48f', borderRadius: 3,
                      background: 'transparent', color: '#8af', cursor: 'pointer',
                    }}>ON</button>
                    <button onClick={() => toggleCategory(false, false)} style={{
                      padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                      background: 'transparent', color: '#c88', cursor: 'pointer',
                    }}>OFF</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {clothingParts.map(part => (
                    <button key={part.key} onClick={() => togglePart(part.key)} style={{
                      padding: '5px 10px', fontSize: 11, textAlign: 'left',
                      border: partVisibility[part.key] ? '2px solid #68f' : '1px solid #444',
                      borderRadius: 4,
                      background: partVisibility[part.key] ? 'rgba(60,60,180,0.35)' : 'rgba(30,30,50,0.6)',
                      color: partVisibility[part.key] ? '#fff' : '#666',
                      cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span>{partLabel(part.key)}</span>
                        {part.meshes.length > 1 && (
                          <span style={{ fontSize: 9, opacity: 0.4 }}>
                            {part.meshes.join(', ')}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{
              marginTop: 16, paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: 10, opacity: 0.4, lineHeight: 1.6,
            }}>
              Total: {parts.reduce((s, p) => s + p.voxels, 0).toLocaleString()} voxels
              <br />
              Click parts to toggle on/off
            </div>
          </>
        )}

        <div style={{
          marginTop: 20, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          opacity: 0.4, fontSize: 10, lineHeight: 1.6,
        }}>
          Drag to rotate / Scroll to zoom / Right-drag to pan
        </div>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ flex: 1, height: '100%' }} />
    </div>
  );
}
