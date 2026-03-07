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

function buildVoxMesh(model: VoxModel, scene: Scene, name: string, scale: number = SCALE): Mesh {
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
        const rx = (voxel.x+fv[vi][0]-cx)*scale, ry = (voxel.y+fv[vi][1]-cy)*scale, rz = (voxel.z+fv[vi][2])*scale;
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

const CACHE_BUST = `?v=${Date.now()}`;

async function loadVoxMesh(scene: Scene, url: string, name: string, scale: number = SCALE): Promise<Mesh> {
  const resp = await fetch(url + CACHE_BUST);
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  const model = parseVox(await resp.arrayBuffer());
  return buildVoxMesh(model, scene, name, scale);
}

// ========================================================================
// Character configurations
// ========================================================================

interface ImportPart {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
}

interface CharacterConfig {
  label: string;
  manifest: string;          // parts manifest (clothing/accessories)
  offset: [number, number, number];  // viewer-space offset to align with CE body
}

// Face part variant: one per character per face slot
interface FacePartVariant {
  source: string;   // character key (display label)
  file: string;
  scale?: number;
  offset?: [number, number, number];
}

// Face part slots (ears, eyes, nose, mouth) with per-character variants
interface FacePartSlot {
  key: string;
  label: string;
  variants: FacePartVariant[];
}

// Face parts float slightly forward to avoid z-fighting with base body
const FACE_FLOAT: [number, number, number] = [0, 0, 0.004];

const BODY_PARTS: FacePartSlot[] = [
  {
    key: 'ears', label: 'Ears',
    variants: [
      { source: 'CE', file: '/box2/cyberpunk_elf_body_ears_x2.vox', scale: SCALE / 2, offset: FACE_FLOAT },
    ],
  },
  {
    key: 'face', label: 'Face',
    variants: [
      { source: 'QM', file: '/box4/queenmarika_face.vox', scale: SCALE / 2, offset: FACE_FLOAT },
    ],
  },
  {
    key: 'hair', label: 'Hair',
    variants: [
      { source: 'CE', file: '/box2/cyberpunk_elf_hair.vox', offset: [0, 0, 0] },
      { source: 'HP', file: '/box3-new/highpriestess_blender_rigged_hair.vox', offset: [0.179, -0.022, -0.100] },
      { source: 'QM', file: '/box4/queenmarika_rigged_mustardui_hair.vox', offset: [-0.002, -0.006, 0.007] },
      { source: 'DE', file: '/box4/darkelfblader_arp_hair.vox', offset: [-0.159, 0.017, -0.096] },
    ],
  },
];

const CHARACTERS: Record<string, CharacterConfig> = {
  cyberpunk: {
    label: 'CyberpunkElf',
    manifest: '/box2/cyberpunk_elf_parts.json',
    offset: [0, 0, 0],  // same grid as body — no offset
  },
  priestess: {
    label: 'HighPriestess',
    manifest: '/box3-new/highpriestess_blender_rigged_parts.json',
    offset: [0.179, -0.022, -0.100],  // computed from body centroid alignment
  },
  marika: {
    label: 'QueenMarika',
    manifest: '/box4/queenmarika_rigged_mustardui_parts.json',
    offset: [-0.002, -0.006, 0.007],
  },
  darkelf: {
    label: 'DarkElfBlader',
    manifest: '/box4/darkelfblader_arp_parts.json',
    offset: [-0.159, 0.017, -0.096],
  },
};

// ========================================================================
// Component
// ========================================================================

export default function VoxViewer2Wrapper() {
  return (
    <Suspense fallback={<div style={{ background: '#12121f', width: '100vw', height: '100vh' }} />}>
      <VoxViewer2Page />
    </Suspense>
  );
}

function VoxViewer2Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const matRef = useRef<StandardMaterial | null>(null);

  // Base body mesh
  const baseMeshRef = useRef<Mesh | null>(null);
  // Face part meshes (one per slot, swapped on variant change)
  const faceMeshesRef = useRef<Record<string, Mesh>>({});
  // Face part selected variant index per slot (-1 = off, 0+ = variant index)
  const [faceSelection, setFaceSelection] = useState<Record<string, number>>(() => {
    const sel: Record<string, number> = {};
    for (const fp of BODY_PARTS) sel[fp.key] = fp.key === 'face' ? -1 : 0; // face defaults to OFF
    return sel;
  });
  // Current character's clothing meshes
  const clothingMeshesRef = useRef<Record<string, Mesh>>({});

  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [clothingParts, setClothingParts] = useState<ImportPart[]>([]);
  const [partVisibility, setPartVisibility] = useState<Record<string, boolean>>({});

  // Dispose all clothing meshes
  const disposeClothing = useCallback(() => {
    for (const mesh of Object.values(clothingMeshesRef.current)) {
      mesh.dispose();
    }
    clothingMeshesRef.current = {};
    setClothingParts([]);
    setPartVisibility({});
  }, []);

  // Load character's clothing (body stays unchanged)
  const loadCharacterClothing = useCallback(async (charKey: string) => {
    const scene = sceneRef.current;
    const mat = matRef.current;
    if (!scene || !mat) return;

    disposeClothing();

    const config = CHARACTERS[charKey];
    if (!config) return;

    try {
      const resp = await fetch(config.manifest + CACHE_BUST);
      if (!resp.ok) return;
      const allParts: ImportPart[] = await resp.json();

      // Filter out body and face parts — they are in the Body Parts section
      const faceKeys = new Set(BODY_PARTS.map(fp => fp.key));
      const clothing = allParts.filter(p => p.key !== 'body' && !faceKeys.has(p.key));
      setClothingParts(clothing);

      const [ox, oy, oz] = config.offset;
      const vis: Record<string, boolean> = {};
      for (const part of clothing) {
        vis[part.key] = part.default_on;
        try {
          const m = await loadVoxMesh(scene, part.file, `clothing_${part.key}`);
          m.material = mat;
          m.position.set(ox, oy, oz);
          m.setEnabled(part.default_on);
          clothingMeshesRef.current[part.key] = m;
        } catch (e) {
          console.error(`Failed: ${part.file}`, e);
        }
      }
      setPartVisibility(vis);
    } catch (e) {
      console.error('Failed to load parts manifest', e);
    }
  }, [disposeClothing]);

  // Select character (body never changes, only clothing)
  const selectCharacter = useCallback((charKey: string) => {
    if (selectedChar === charKey) {
      // Deselect → back to body only
      setSelectedChar(null);
      disposeClothing();
    } else {
      setSelectedChar(charKey);
      loadCharacterClothing(charKey);
    }
  }, [selectedChar, disposeClothing, loadCharacterClothing]);

  const togglePart = useCallback((key: string) => {
    setPartVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const mesh = clothingMeshesRef.current[key];
      if (mesh) mesh.setEnabled(next[key]);
      return next;
    });
  }, []);

  // Switch face part variant (cycle: variant0 → variant1 → ... → OFF → variant0)
  const switchFaceVariant = useCallback(async (slotKey: string, variantIdx: number) => {
    const scene = sceneRef.current;
    const mat = matRef.current;
    if (!scene || !mat) return;

    // Dispose current mesh for this slot
    const oldMesh = faceMeshesRef.current[slotKey];
    if (oldMesh) {
      oldMesh.dispose();
      delete faceMeshesRef.current[slotKey];
    }

    setFaceSelection(prev => ({ ...prev, [slotKey]: variantIdx }));

    // -1 = OFF
    if (variantIdx < 0) return;

    const slot = BODY_PARTS.find(fp => fp.key === slotKey);
    if (!slot || variantIdx >= slot.variants.length) return;

    const variant = slot.variants[variantIdx];
    try {
      const mesh = await loadVoxMesh(scene, variant.file, `face_${slotKey}`, variant.scale ?? SCALE);
      mesh.material = mat;
      if (variant.offset) {
        mesh.position.set(variant.offset[0], variant.offset[1], variant.offset[2]);
      }
      faceMeshesRef.current[slotKey] = mesh;
    } catch (e) {
      console.error(`Failed to load face part ${slotKey}:`, e);
    }
  }, []);

  // Toggle all clothing on/off
  const toggleAllClothing = useCallback((on: boolean) => {
    setPartVisibility(prev => {
      const next: Record<string, boolean> = {};
      for (const key in prev) {
        next[key] = on;
        const mesh = clothingMeshesRef.current[key];
        if (mesh) mesh.setEnabled(on);
      }
      return next;
    });
  }, []);

  // Initialize scene
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

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new Color3(0.25, 0.25, 0.3);

    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.4;

    const ground = MeshBuilder.CreateGround('ground', { width: 8, height: 8, subdivisions: 40 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.15, 0.15, 0.2);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;

    const voxMat = new StandardMaterial('voxMat', scene);
    voxMat.emissiveColor = Color3.White();
    voxMat.disableLighting = true;
    voxMat.backFaceCulling = false;
    matRef.current = voxMat;

    // Initial: load base body + default face parts (first variant each)
    (async () => {
      try {
        const base = await loadVoxMesh(scene, '/box2/cyberpunk_elf_body_base.vox', 'body_base');
        base.material = voxMat;
        baseMeshRef.current = base;
      } catch (e) {
        console.error('Failed to load base body:', e);
      }
      for (const slot of BODY_PARTS) {
        if (slot.variants.length === 0) continue;
        const v = slot.variants[0];
        try {
          const mesh = await loadVoxMesh(scene, v.file, `face_${slot.key}`, v.scale ?? SCALE);
          mesh.material = voxMat;
          if (v.offset) mesh.position.set(v.offset[0], v.offset[1], v.offset[2]);
          faceMeshesRef.current[slot.key] = mesh;
        } catch (e) {
          console.error(`Failed to load face part ${slot.key}:`, e);
        }
      }
    })();

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

  const partLabel = (key: string) => {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      .replace('.001', ' 2').replace('  ', ' ').trim();
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#12121f', display: 'flex' }}>
      {/* Side panel */}
      <div style={{
        width: 260, minWidth: 260, padding: '14px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.5)', color: '#ddd', fontFamily: 'monospace', fontSize: 12,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Title */}
        <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#fff' }}>
          Dress-Up Viewer
        </h2>

        {/* Character selector */}
        <div style={{ marginBottom: 6, color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
          Character
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {Object.entries(CHARACTERS).map(([k, v]) => (
            <button key={k} onClick={() => selectCharacter(k)} style={{
              flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 'bold', textAlign: 'center',
              border: selectedChar === k ? '2px solid #f84' : '1px solid #444', borderRadius: 4,
              background: selectedChar === k ? 'rgba(180,60,40,0.3)' : 'rgba(30,30,50,0.5)',
              color: selectedChar === k ? '#fff' : '#888',
              cursor: 'pointer',
            }}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Body parts */}
        <div style={{ marginBottom: 6, color: '#8c8', fontSize: 13, fontWeight: 'bold' }}>
          Body Parts
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
          {/* Base body (always on) */}
          <div style={{
            padding: '4px 10px', fontSize: 11,
            border: '2px solid #6a6', borderRadius: 4,
            background: 'rgba(40,80,40,0.35)', color: '#cec', opacity: 0.7,
          }}>
            Body (fixed)
          </div>
          {/* Face part slots with variant buttons */}
          {BODY_PARTS.map(slot => (
            <div key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 42, fontSize: 10, color: '#999', flexShrink: 0 }}>{slot.label}</span>
              {slot.variants.map((v, vi) => (
                <button key={vi} onClick={() => switchFaceVariant(slot.key, vi)} style={{
                  flex: 1, padding: '3px 0', fontSize: 10, textAlign: 'center',
                  border: faceSelection[slot.key] === vi ? '2px solid #6a6' : '1px solid #444',
                  borderRadius: 3,
                  background: faceSelection[slot.key] === vi ? 'rgba(40,80,40,0.4)' : 'rgba(30,30,50,0.6)',
                  color: faceSelection[slot.key] === vi ? '#cec' : '#777',
                  cursor: 'pointer',
                }}>
                  {v.source}
                </button>
              ))}
              <button onClick={() => switchFaceVariant(slot.key, -1)} style={{
                padding: '3px 6px', fontSize: 10, textAlign: 'center',
                border: faceSelection[slot.key] === -1 ? '2px solid #a66' : '1px solid #444',
                borderRadius: 3,
                background: faceSelection[slot.key] === -1 ? 'rgba(80,40,40,0.4)' : 'rgba(30,30,50,0.6)',
                color: faceSelection[slot.key] === -1 ? '#ecc' : '#777',
                cursor: 'pointer',
              }}>
                OFF
              </button>
            </div>
          ))}
        </div>

        {/* Clothing parts */}
        {selectedChar ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 'bold', color: '#8af', fontSize: 13 }}>
                {CHARACTERS[selectedChar]?.label} Parts ({clothingParts.length})
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={Object.values(partVisibility).some(v => v)}
                  onChange={(e) => toggleAllClothing(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: '#aaa' }}>All</span>
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {clothingParts.map(part => (
                <button key={part.key} onClick={() => togglePart(part.key)} style={{
                  padding: '4px 10px', fontSize: 11, textAlign: 'left',
                  border: partVisibility[part.key] ? '2px solid #68f' : '1px solid #444',
                  borderRadius: 4,
                  background: partVisibility[part.key] ? 'rgba(60,60,180,0.35)' : 'rgba(30,30,50,0.6)',
                  color: partVisibility[part.key] ? '#fff' : '#666',
                  cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>{partLabel(part.key)}</span>
                  <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
                </button>
              ))}
            </div>
            <p style={{ opacity: 0.4, fontSize: 10, marginTop: 12, lineHeight: 1.5 }}>
              Click parts to toggle on/off.
              Click character again to undress.
            </p>
          </>
        ) : (
          <div style={{ opacity: 0.5, fontSize: 11, lineHeight: 1.6, marginTop: 8 }}>
            Select a character above to load clothing and accessories.
          </div>
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
