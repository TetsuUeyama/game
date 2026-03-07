'use client';

import { useEffect, useRef } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, Color3, Color4, Mesh, VertexData, StandardMaterial, MeshBuilder,
} from '@babylonjs/core';

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

const BUST = `?v=${Date.now()}`;

export default function VoxComparePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.12, 0.12, 0.18, 1);

    const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 2.5, new Vector3(0, 0.4, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3;
    camera.upperRadiusLimit = 8;
    camera.wheelPrecision = 120;

    const light = new HemisphericLight('light', new Vector3(0.3, 1, 0.5), scene);
    light.intensity = 1.2;
    light.groundColor = new Color3(0.3, 0.3, 0.35);

    const ground = MeshBuilder.CreateGround('ground', { width: 6, height: 6, subdivisions: 30 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.2, 0.2, 0.25);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;

    const voxMat = new StandardMaterial('voxMat', scene);
    voxMat.emissiveColor = Color3.White();
    voxMat.disableLighting = true;
    voxMat.backFaceCulling = false;

    const load = async () => {
      // Load CyberpunkElf body - left side
      try {
        const resp = await fetch('/box-compare/ce_body.vox' + BUST);
        const model = parseVox(await resp.arrayBuffer());
        const mesh = buildVoxMesh(model, scene, 'ce_body');
        mesh.material = voxMat;
        mesh.position.x = -0.6; // Left
        console.log(`CE body: ${model.sizeX}x${model.sizeY}x${model.sizeZ}, ${model.voxels.length} voxels`);
      } catch (e) { console.error('CE body load failed', e); }

      // Load HighPriestess body - right side
      try {
        const resp = await fetch('/box-compare/hp_body.vox' + BUST);
        const model = parseVox(await resp.arrayBuffer());
        const mesh = buildVoxMesh(model, scene, 'hp_body');
        mesh.material = voxMat;
        mesh.position.x = 0.6; // Right
        console.log(`HP body: ${model.sizeX}x${model.sizeY}x${model.sizeZ}, ${model.voxels.length} voxels`);
      } catch (e) { console.error('HP body load failed', e); }
    };

    load();
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#1a1a2e', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center',
        color: '#fff', fontFamily: 'monospace', fontSize: 14, pointerEvents: 'none',
      }}>
        <span style={{ color: '#88f', marginRight: 40 }}>← CyberpunkElf Body (96x22x102)</span>
        <span style={{ color: '#f88' }}>HighPriestess Body (58x21x102) →</span>
      </div>
      <div style={{
        position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center',
        color: '#888', fontFamily: 'monospace', fontSize: 11, pointerEvents: 'none',
      }}>
        Both use body-only bbox for deformation. Same chibi algorithm. Drag to rotate / Scroll to zoom
      </div>
    </div>
  );
}
