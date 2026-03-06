'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
// VOX parser + mesh builder
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
      else if (id === 'RGBA') { palette = []; for (let i = 0; i < 256; i++) { const r = readU8(), g = readU8(), b = readU8(); readU8(); palette.push({ r: r/255, g: g/255, b: b/255 }); } }
      offset = ce; if (ccs > 0) readChunks(offset + ccs);
    }
  };
  if (readStr(4) !== 'MAIN') throw new Error('Expected MAIN');
  const mc = readU32(); const mcc = readU32(); offset += mc;
  readChunks(offset + mcc);
  if (!palette) { palette = []; for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 }); }
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

const FACE_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FACE_VERTS = [
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], [[0,0,1],[0,1,1],[0,1,0],[0,0,0]],
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],
  [[0,0,1],[0,1,1],[1,1,1],[1,0,1]], [[1,0,0],[1,1,0],[0,1,0],[0,0,0]],
];
const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const SCALE = 0.010;

function buildVoxMesh(model: VoxModel, scene: Scene, name: string): Mesh {
  const occupied = new Set<string>();
  for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const cx = model.sizeX / 2, cy = model.sizeY / 2;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const voxel of model.voxels) {
    const col = model.palette[voxel.colorIndex-1] ?? {r:0.8,g:0.8,b:0.8};
    for (let f = 0; f < 6; f++) {
      const [dx,dy,dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x+dx},${voxel.y+dy},${voxel.z+dz}`)) continue;
      const bi = positions.length/3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        const rx = (voxel.x+fv[vi][0]-cx)*SCALE, ry = (voxel.y+fv[vi][1]-cy)*SCALE, rz = (voxel.z+fv[vi][2])*SCALE;
        positions.push(rx, rz, -ry); normals.push(fn[0], fn[2], -fn[1]); colors.push(col.r, col.g, col.b, 1);
      }
      indices.push(bi, bi+1, bi+2, bi, bi+2, bi+3);
    }
  }
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  return mesh;
}

async function loadVoxMesh(scene: Scene, url: string, name: string): Promise<Mesh> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  return buildVoxMesh(parseVox(await resp.arrayBuffer()), scene, name);
}

// ========================================================================
// Part categories
// ========================================================================

const CATEGORIES = {
  eyes:  ['normal', 'narrow', 'wide', 'almond', 'determined', 'hooded'],
  brows: ['thick', 'thin', 'angry', 'arched', 'flat', 'raised'],
  nose:  ['average', 'wide', 'narrow', 'broad', 'button'],
  mouth: ['neutral', 'grin', 'serious', 'smile', 'open', 'smirk'],
  hair:  ['buzz', 'short', 'fade', 'flat_top', 'afro', 'mohawk', 'cornrow', 'dreads', 'headband', 'bald'],
} as const;

type CatKey = keyof typeof CATEGORIES;

const CAT_LABELS: Record<CatKey, string> = {
  eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', hair: 'Hair',
};

function catUrl(cat: CatKey, name: string): string {
  const prefix: Record<CatKey, string> = {
    eyes: 'eyes/eyes', brows: 'brows/brows', nose: 'noses/nose', mouth: 'mouths/mouth', hair: 'hairs/hair',
  };
  return `/box2/${prefix[cat]}_${name}.vox`;
}

// Body assembly
interface PartDef { file: string; label: string; offset: [number, number, number]; }
// Assembly offsets calculated from part heights (SCALE=0.010):
// shoe=0.12, shin=0.26, thigh=0.28, hip=0.16, torso=0.40
// Ground=0 → shoe:0 → shin:0.12 → thigh:0.38 → hip:0.66 → torso:0.82 → top:1.22
const BODY_PARTS: PartDef[] = [
  { file: 'torso.vox',     label: 'Torso',      offset: [0, 0.82, 0] },
  { file: 'hip.vox',       label: 'Hip',         offset: [0, 0.66, 0] },
  { file: 'upper_arm.vox', label: 'UpperArmL',   offset: [0.19, 0.90, 0] },
  { file: 'forearm.vox',   label: 'ForearmL',    offset: [0.19, 0.72, 0] },
  { file: 'hand.vox',      label: 'HandL',       offset: [0.19, 0.62, 0] },
  { file: 'thigh.vox',     label: 'ThighL',      offset: [0.07, 0.38, 0] },
  { file: 'shin.vox',      label: 'ShinL',       offset: [0.07, 0.12, 0] },
  { file: 'shoe.vox',      label: 'ShoeL',       offset: [0.07, 0.0, 0.02] },
];
const MIRROR_PARTS: PartDef[] = [
  { file: 'upper_arm.vox', label: 'UpperArmR',   offset: [-0.19, 0.90, 0] },
  { file: 'forearm.vox',   label: 'ForearmR',    offset: [-0.19, 0.72, 0] },
  { file: 'hand.vox',      label: 'HandR',       offset: [-0.19, 0.62, 0] },
  { file: 'thigh.vox',     label: 'ThighR',      offset: [-0.07, 0.38, 0] },
  { file: 'shin.vox',      label: 'ShinR',       offset: [-0.07, 0.12, 0] },
  { file: 'shoe.vox',      label: 'ShoeR',       offset: [-0.07, 0.0, 0.02] },
];

const HEAD_Y = 1.15;

// ========================================================================
// Component
// ========================================================================

// Imported voxel models (body + hair separate)
const IMPORT_MODELS = [
  { name: 'CyberpunkElf', body: '/box2/cyberpunk_elf_body.vox', hair: '/box2/cyberpunk_elf_hair.vox' },
];

export default function VoxViewer2Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const matRef = useRef<StandardMaterial | null>(null);
  const bodyMeshesRef = useRef<Mesh[]>([]);
  const importBodyRef = useRef<Mesh | null>(null);
  const importHairRef = useRef<Mesh | null>(null);
  const [mode, setMode] = useState<'builder' | 'import'>('import');
  const [showHair, setShowHair] = useState(true);

  const headMeshes = useRef<Record<string, Mesh | null>>({
    base: null, eyes: null, brows: null, nose: null, mouth: null, hair: null,
  });

  const [selections, setSelections] = useState<Record<CatKey, string>>({
    eyes: 'normal', brows: 'thick', nose: 'average', mouth: 'neutral', hair: 'short',
  });

  const loadLayer = useCallback(async (cat: string, url: string) => {
    const scene = sceneRef.current;
    const mat = matRef.current;
    if (!scene || !mat) return;
    const old = headMeshes.current[cat];
    if (old) { old.dispose(); headMeshes.current[cat] = null; }
    try {
      const mesh = await loadVoxMesh(scene, url, `head_${cat}`);
      mesh.material = mat;
      mesh.position.y = HEAD_Y;
      headMeshes.current[cat] = mesh;
    } catch (e) {
      console.error(`Failed to load ${url}:`, e);
    }
  }, []);

  const handleChange = useCallback((cat: CatKey, value: string) => {
    setSelections(prev => ({ ...prev, [cat]: value }));
    loadLayer(cat, catUrl(cat, value));
  }, [loadLayer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.08, 0.08, 0.14, 1);

    const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0, new Vector3(0, 0.65, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3;
    camera.upperRadiusLimit = 10;
    camera.wheelPrecision = 100;

    // Lighting
    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new Color3(0.25, 0.25, 0.3);

    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.4;

    // Ground
    const ground = MeshBuilder.CreateGround('ground', { width: 8, height: 8, subdivisions: 40 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.15, 0.15, 0.2);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;

    // Vox material (vertex color based)
    const voxMat = new StandardMaterial('voxMat', scene);
    voxMat.emissiveColor = Color3.White();
    voxMat.disableLighting = true;
    voxMat.backFaceCulling = false;
    matRef.current = voxMat;

    // Load body parts
    const loadBody = async () => {
      const meshes: Mesh[] = [];
      for (const p of BODY_PARTS) {
        try {
          const m = await loadVoxMesh(scene, `/box2/${p.file}`, `body_${p.label}`);
          m.material = voxMat; m.position.set(...p.offset); meshes.push(m);
        } catch (e) { console.error(e); }
      }
      for (const p of MIRROR_PARTS) {
        try {
          const m = await loadVoxMesh(scene, `/box2/${p.file}`, `body_${p.label}`);
          m.material = voxMat; m.position.set(...p.offset); m.scaling.x = -1; meshes.push(m);
        } catch (e) { console.error(e); }
      }
      bodyMeshesRef.current = meshes;
    };

    // Load head layers
    const loadHead = async () => {
      try {
        const base = await loadVoxMesh(scene, '/box2/head_base.vox', 'head_base');
        base.material = voxMat; base.position.y = HEAD_Y;
        headMeshes.current.base = base;
      } catch (e) { console.error(e); }
      for (const cat of Object.keys(CATEGORIES) as CatKey[]) {
        await loadLayer(cat, catUrl(cat, selections[cat]));
      }
    };

    // Load import model (body + hair separate)
    const loadImport = async () => {
      try {
        const body = await loadVoxMesh(scene, IMPORT_MODELS[0].body, 'import_body');
        body.material = voxMat;
        importBodyRef.current = body;
      } catch (e) { console.error(e); }
      try {
        const hair = await loadVoxMesh(scene, IMPORT_MODELS[0].hair, 'import_hair');
        hair.material = voxMat;
        importHairRef.current = hair;
      } catch (e) { console.error(e); }
    };

    loadBody();
    loadHead();
    loadImport();

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

  const combos = Object.values(CATEGORIES).reduce((a, c) => a * c.length, 1);

  // Toggle visibility based on mode
  useEffect(() => {
    const showBuilder = mode === 'builder';
    for (const m of bodyMeshesRef.current) m.setEnabled(showBuilder);
    for (const m of Object.values(headMeshes.current)) if (m) m.setEnabled(showBuilder);
    if (importBodyRef.current) importBodyRef.current.setEnabled(!showBuilder);
    if (importHairRef.current) importHairRef.current.setEnabled(!showBuilder && showHair);
  }, [mode, showHair]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#12121f', display: 'flex' }}>
      {/* Side panel */}
      <div style={{
        width: 250, minWidth: 250, padding: '14px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.5)', color: '#ddd', fontFamily: 'monospace', fontSize: 12,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {(['import', 'builder'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 'bold',
              border: mode === m ? '2px solid #68f' : '1px solid #444', borderRadius: 4,
              background: mode === m ? 'rgba(60,60,180,0.4)' : 'rgba(30,30,50,0.5)',
              color: mode === m ? '#fff' : '#888', cursor: 'pointer',
            }}>
              {m === 'import' ? 'Imported' : 'Builder'}
            </button>
          ))}
        </div>

        {mode === 'import' ? (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, color: '#fff' }}>Voxelized Models</h2>
            {IMPORT_MODELS.map(m => (
              <div key={m.name} style={{
                padding: '8px 10px', background: 'rgba(60,60,180,0.2)',
                border: '1px solid rgba(100,100,255,0.3)', borderRadius: 6, marginBottom: 8,
              }}>
                <div style={{ color: '#aaf', fontWeight: 'bold', fontSize: 13 }}>{m.name}</div>
                <div style={{ opacity: 0.5, fontSize: 10, marginTop: 2 }}>body + hair</div>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#8af', fontSize: 13 }}>Parts</div>
              <button onClick={() => setShowHair(v => !v)} style={{
                padding: '5px 12px', fontSize: 12,
                border: showHair ? '2px solid #68f' : '1px solid #555', borderRadius: 4,
                background: showHair ? 'rgba(60,60,180,0.35)' : 'rgba(30,30,50,0.6)',
                color: showHair ? '#fff' : '#888', cursor: 'pointer',
              }}>
                Hair {showHair ? 'ON' : 'OFF'}
              </button>
            </div>
            <p style={{ opacity: 0.4, fontSize: 10, marginTop: 12, lineHeight: 1.5 }}>
              3D model voxelized with chibi deformation via Blender
            </p>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#fff' }}>
              Character Builder
            </h2>
            <p style={{ margin: '0 0 14px', opacity: 0.4, fontSize: 11 }}>
              {combos.toLocaleString()} combinations
            </p>
            {(Object.keys(CATEGORIES) as CatKey[]).map(cat => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#8af', fontSize: 13 }}>
                  {CAT_LABELS[cat]}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {CATEGORIES[cat].map(name => (
                    <button key={name} onClick={() => handleChange(cat, name)} style={{
                      padding: '4px 8px', fontSize: 11,
                      border: selections[cat] === name ? '2px solid #68f' : '1px solid #444',
                      borderRadius: 4,
                      background: selections[cat] === name ? 'rgba(60,60,180,0.35)' : 'rgba(30,30,50,0.6)',
                      color: selections[cat] === name ? '#fff' : '#999', cursor: 'pointer',
                    }}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
