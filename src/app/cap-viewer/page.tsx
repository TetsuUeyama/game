'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, Mesh, VertexData,
} from '@babylonjs/core';
import { loadVoxFile, SCALE, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import { createUnlitMaterial } from '@/lib/voxel-skeleton';
import type { VoxelEntry } from '@/lib/vox-parser';

const BODY_VOX = '/box2/cyberpunk_elf_body_base_hires_sym.vox';
const CAP_VOX = '/box2/knit_cap.vox';
const HAIR_VOX = '/box2/cyberpunk_elf_hair_hires_processed.vox';
// hires body is ~2x resolution of standard body, so use half scale
const DISPLAY_SCALE = SCALE * 0.5;

function buildVoxelMesh(
  voxels: VoxelEntry[], scene: Scene, name: string, scale: number,
  centerX: number, centerY: number,
): Mesh {
  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (const voxel of voxels) {
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;

      const bi = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        positions.push(
          (voxel.x + fv[vi][0] - centerX) * scale,
          (voxel.z + fv[vi][2]) * scale,
          -(voxel.y + fv[vi][1] - centerY) * scale,
        );
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(voxel.r, voxel.g, voxel.b, 1);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }

  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  mesh.material = createUnlitMaterial(scene, name + '_mat');
  return mesh;
}

export default function CapViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capVisible, setCapVisible] = useState(true);
  const [hairVisible, setHairVisible] = useState(true);
  const capMeshRef = useRef<Mesh | null>(null);
  const hairMeshRef = useRef<Mesh | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.12, 0.12, 0.18, 1);

    const camera = new ArcRotateCamera('cam',
      Math.PI / 2, Math.PI / 3, 2.5,
      new Vector3(0, 0.4, 0), scene,
    );
    camera.lowerRadiusLimit = 0.8;
    camera.upperRadiusLimit = 6;
    camera.wheelPrecision = 80;        // higher = slower zoom per scroll tick
    camera.pinchPrecision = 150;       // slower pinch zoom on touch
    camera.panningSensibility = 2000;   // slower panning
    camera.angularSensibilityX = 1500;  // slower horizontal rotation
    camera.angularSensibilityY = 1500;  // slower vertical rotation
    camera.attachControl(canvas, true);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    hemi.groundColor = new Color3(0.1, 0.1, 0.15);
    const dir = new DirectionalLight('dir', new Vector3(-1, -2, 1), scene);
    dir.intensity = 0.5;

    (async () => {
      try {
        const [bodyData, capData, hairData] = await Promise.all([
          loadVoxFile(BODY_VOX),
          loadVoxFile(CAP_VOX),
          loadVoxFile(HAIR_VOX),
        ]);
        if (disposed) return;

        // Compute body center — used for all meshes so they align
        let cxSum = 0, cySum = 0;
        for (const v of bodyData.voxels) { cxSum += v.x; cySum += v.y; }
        const bodyCx = bodyData.voxels.length > 0 ? cxSum / bodyData.voxels.length : 0;
        const bodyCy = bodyData.voxels.length > 0 ? cySum / bodyData.voxels.length : 0;

        // Build body mesh
        buildVoxelMesh(bodyData.voxels, scene, 'body', DISPLAY_SCALE, bodyCx, bodyCy);

        // Build cap mesh using the SAME center as body
        const capMesh = buildVoxelMesh(capData.voxels, scene, 'cap', DISPLAY_SCALE, bodyCx, bodyCy);
        capMeshRef.current = capMesh;

        // Build hair mesh using the SAME center as body
        const hairMesh = buildVoxelMesh(hairData.voxels, scene, 'hair', DISPLAY_SCALE, bodyCx, bodyCy);
        hairMeshRef.current = hairMesh;

        setLoading(false);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      engine.dispose();
    };
  }, []);

  // Toggle cap visibility
  useEffect(() => {
    if (capMeshRef.current) {
      capMeshRef.current.isVisible = capVisible;
    }
  }, [capVisible]);

  // Toggle hair visibility
  useEffect(() => {
    if (hairMeshRef.current) {
      hairMeshRef.current.isVisible = hairVisible;
    }
  }, [hairVisible]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#1a1a2e' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />

      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          color: '#fff', fontSize: 18,
        }}>
          Loading...
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          color: '#f44', fontSize: 16,
        }}>
          Error: {error}
        </div>
      )}

      <div style={{
        position: 'absolute', top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <a href="/" style={{ color: '#aaa', textDecoration: 'none', fontSize: 14 }}>
          &larr; Home
        </a>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 18 }}>
          Cap Viewer (Hires Body)
        </h2>
        <label style={{ color: '#ccc', fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={capVisible}
            onChange={e => setCapVisible(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Knit Cap
        </label>
        <label style={{ color: '#ccc', fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={hairVisible}
            onChange={e => setHairVisible(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Hair
        </label>
      </div>
    </div>
  );
}
