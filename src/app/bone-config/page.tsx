'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, Color4, Mesh, VertexData, ShaderMaterial, Effect,
  MeshBuilder, StandardMaterial, Color3, Plane, PointerEventTypes,
} from '@babylonjs/core';
import { loadVoxFile, SCALE, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { VoxelEntry } from '@/lib/vox-parser';

// ========================================================================
// Key Markers
// ========================================================================
interface MarkerDef {
  name: string;
  label: string;
  color: string;
  side: 'center' | 'left' | 'right'; // center=単体, left/right=対
  mirrorOf?: string; // right側のみ: 対応するleft側のname
}

const MARKER_DEFS: MarkerDef[] = [
  { name: 'Chin',        label: 'Chin (顎)',          color: '#ffee44', side: 'center' },
  { name: 'Groin',       label: 'Groin (股間)',        color: '#ff4444', side: 'center' },
  { name: 'LeftWrist',   label: 'L.Wrist (左手首)',    color: '#4444ff', side: 'left' },
  { name: 'LeftElbow',   label: 'L.Elbow (左肘)',      color: '#4488ff', side: 'left' },
  { name: 'LeftKnee',    label: 'L.Knee (左膝)',       color: '#44ff66', side: 'left' },
  { name: 'RightWrist',  label: 'R.Wrist (右手首)',    color: '#ff4466', side: 'right', mirrorOf: 'LeftWrist' },
  { name: 'RightElbow',  label: 'R.Elbow (右肘)',      color: '#ff4488', side: 'right', mirrorOf: 'LeftElbow' },
  { name: 'RightKnee',   label: 'R.Knee (右膝)',       color: '#88ff44', side: 'right', mirrorOf: 'LeftKnee' },
];

interface Vec3 { x: number; y: number; z: number; }
type MarkerData = Record<string, Vec3>;

// ========================================================================
// Bone definitions (20 Mixamo bones)
// ========================================================================
interface BoneDef {
  name: string;
  label: string;
  parent: string | null;
  color: string;
}

const BONE_DEFS: BoneDef[] = [
  { name: 'Hips',           label: 'Hips',       parent: null,             color: '#ff4444' },
  { name: 'Spine',          label: 'Spine',      parent: 'Hips',           color: '#ff6644' },
  { name: 'Spine1',         label: 'Spine1',     parent: 'Spine',          color: '#ff8844' },
  { name: 'Spine2',         label: 'Spine2',     parent: 'Spine1',         color: '#ffaa44' },
  { name: 'Neck',           label: 'Neck',       parent: 'Spine2',         color: '#ffcc44' },
  { name: 'Head',           label: 'Head',       parent: 'Neck',           color: '#ffee44' },
  { name: 'LeftShoulder',   label: 'L.Shoulder', parent: 'Spine2',         color: '#44aaff' },
  { name: 'LeftArm',        label: 'L.Arm',      parent: 'LeftShoulder',   color: '#4488ff' },
  { name: 'LeftForeArm',    label: 'L.ForeArm',  parent: 'LeftArm',        color: '#4466ff' },
  { name: 'LeftHand',       label: 'L.Hand',     parent: 'LeftForeArm',    color: '#4444ff' },
  { name: 'RightShoulder',  label: 'R.Shoulder', parent: 'Spine2',         color: '#ff44aa' },
  { name: 'RightArm',       label: 'R.Arm',      parent: 'RightShoulder',  color: '#ff4488' },
  { name: 'RightForeArm',   label: 'R.ForeArm',  parent: 'RightArm',       color: '#ff4466' },
  { name: 'RightHand',      label: 'R.Hand',     parent: 'RightForeArm',   color: '#ff4444' },
  { name: 'LeftUpLeg',      label: 'L.UpLeg',    parent: 'Hips',           color: '#44ff88' },
  { name: 'LeftLeg',        label: 'L.Leg',      parent: 'LeftUpLeg',      color: '#44ff66' },
  { name: 'LeftFoot',       label: 'L.Foot',     parent: 'LeftLeg',        color: '#44ff44' },
  { name: 'RightUpLeg',     label: 'R.UpLeg',    parent: 'Hips',           color: '#aaff44' },
  { name: 'RightLeg',       label: 'R.Leg',      parent: 'RightUpLeg',     color: '#88ff44' },
  { name: 'RightFoot',      label: 'R.Foot',     parent: 'RightLeg',       color: '#66ff44' },
];

// ========================================================================
// Fixed camera views
// ========================================================================
type ViewDirection = 'front' | 'right' | 'back' | 'left';

interface ViewDef {
  key: ViewDirection;
  label: string;
  alpha: number;
  dragAxes: ('x' | 'y' | 'z')[];
  axisLabels: string;
}

const VIEW_DEFS: ViewDef[] = [
  { key: 'front', label: '正面',  alpha: Math.PI / 2,     dragAxes: ['x', 'z'], axisLabels: 'X(左右) + Z(高さ)' },
  { key: 'right', label: '右',    alpha: 0,               dragAxes: ['y', 'z'], axisLabels: 'Y(前後) + Z(高さ)' },
  { key: 'back',  label: '背面',  alpha: Math.PI * 3 / 2, dragAxes: ['x', 'z'], axisLabels: 'X(左右) + Z(高さ)' },
  { key: 'left',  label: '左',    alpha: Math.PI,         dragAxes: ['y', 'z'], axisLabels: 'Y(前後) + Z(高さ)' },
];

// ========================================================================
// Auto-calculation: markers → 20 bones
// ========================================================================
function calculateAllBones(
  markers: MarkerData, bodyMaxZ: number,
): Record<string, Vec3> {
  const chin = markers['Chin'];
  const groin = markers['Groin'];
  const lWrist = markers['LeftWrist'];
  const lElbow = markers['LeftElbow'];
  const lKnee = markers['LeftKnee'];
  const rWrist = markers['RightWrist'];
  const rElbow = markers['RightElbow'];
  const rKnee = markers['RightKnee'];

  const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });

  // Center chain
  const hips: Vec3 = { x: groin.x, y: groin.y, z: groin.z };
  const neck: Vec3 = { x: chin.x, y: chin.y, z: chin.z - 4 };
  const head: Vec3 = { x: chin.x, y: chin.y, z: Math.min(chin.z + 8, bodyMaxZ) };

  const spine  = lerp3(hips, neck, 0.25);
  const spine1 = lerp3(hips, neck, 0.50);
  const spine2 = lerp3(hips, neck, 0.75);

  // Left arm
  const lShoulderOffset = (lElbow.x - spine2.x) * 0.35;
  const lShoulder: Vec3 = { x: spine2.x + lShoulderOffset, y: spine2.y, z: spine2.z + 2 };
  const lArm = lerp3(lShoulder, lElbow, 0.3);
  const lForeArm: Vec3 = { ...lElbow };
  const lHand: Vec3 = { ...lWrist };

  // Right arm (independent)
  const rShoulderOffset = (rElbow.x - spine2.x) * 0.35;
  const rShoulder: Vec3 = { x: spine2.x + rShoulderOffset, y: spine2.y, z: spine2.z + 2 };
  const rArm = lerp3(rShoulder, rElbow, 0.3);
  const rForeArm: Vec3 = { ...rElbow };
  const rHand: Vec3 = { ...rWrist };

  // Left leg
  const lLegOffsetX = (lKnee.x - groin.x) * 0.8;
  const lUpLeg: Vec3 = { x: groin.x + lLegOffsetX, y: groin.y, z: groin.z };
  const lLeg: Vec3 = { ...lKnee };
  const lFoot: Vec3 = { x: lKnee.x, y: Math.max(lKnee.y - 4, 0), z: 2 };

  // Right leg (independent)
  const rLegOffsetX = (rKnee.x - groin.x) * 0.8;
  const rUpLeg: Vec3 = { x: groin.x + rLegOffsetX, y: groin.y, z: groin.z };
  const rLeg: Vec3 = { ...rKnee };
  const rFoot: Vec3 = { x: rKnee.x, y: Math.max(rKnee.y - 4, 0), z: 2 };

  return {
    Hips: hips, Spine: spine, Spine1: spine1, Spine2: spine2,
    Neck: neck, Head: head,
    LeftShoulder: lShoulder, LeftArm: lArm, LeftForeArm: lForeArm, LeftHand: lHand,
    RightShoulder: rShoulder, RightArm: rArm, RightForeArm: rForeArm, RightHand: rHand,
    LeftUpLeg: lUpLeg, LeftLeg: lLeg, LeftFoot: lFoot,
    RightUpLeg: rUpLeg, RightLeg: rLeg, RightFoot: rFoot,
  };
}

// Mirror a left-side marker using Chin/Groin center
function mirrorMarker(leftPos: Vec3, mirrorCenterX: number): Vec3 {
  return { x: mirrorCenterX + (mirrorCenterX - leftPos.x), y: leftPos.y, z: leftPos.z };
}

function getDefaultMarkers(centerX: number): MarkerData {
  const left: MarkerData = {
    Chin:       { x: centerX, y: 13, z: 82 },
    Groin:      { x: centerX, y: 13, z: 31 },
    LeftWrist:  { x: 10, y: 13, z: 34 },
    LeftElbow:  { x: 14, y: 13, z: 48 },
    LeftKnee:   { x: 24, y: 13, z: 17 },
  };
  // Default right = mirrored from left
  left['RightWrist'] = mirrorMarker(left['LeftWrist'], centerX);
  left['RightElbow'] = mirrorMarker(left['LeftElbow'], centerX);
  left['RightKnee']  = mirrorMarker(left['LeftKnee'], centerX);
  return left;
}

// ========================================================================
// Helpers
// ========================================================================
const VOX_BODY_URL = '/box5/vagrant_rig_vagrant_body.vox';

function createUnlitMaterial(scene: Scene, name: string): ShaderMaterial {
  Effect.ShadersStore[name + 'VertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec4 color;
    uniform mat4 worldViewProjection;
    varying vec4 vColor;
    void main() { gl_Position = worldViewProjection * vec4(position, 1.0); vColor = color; }
  `;
  Effect.ShadersStore[name + 'FragmentShader'] = `
    precision highp float;
    varying vec4 vColor;
    void main() { gl_FragColor = vColor; }
  `;
  const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, {
    attributes: ['position', 'color'], uniforms: ['worldViewProjection'],
    needAlphaBlending: true,
  });
  mat.backFaceCulling = false;
  return mat;
}

function buildBodyMesh(voxels: VoxelEntry[], scene: Scene, cx: number, cy: number, alpha: number): Mesh {
  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const voxel of voxels) {
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      const bi = positions.length / 3;
      const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        positions.push(
          (voxel.x + fv[vi][0] - cx) * SCALE,
          (voxel.z + fv[vi][2]) * SCALE,
          -(voxel.y + fv[vi][1] - cy) * SCALE,
        );
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(voxel.r * 0.6, voxel.g * 0.6, voxel.b * 0.6, alpha);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh('body', scene);
  vd.applyToMesh(mesh);
  mesh.material = createUnlitMaterial(scene, 'body_unlit');
  mesh.isPickable = false;
  return mesh;
}

function voxelToViewer(vx: number, vy: number, vz: number, cx: number, cy: number): Vector3 {
  return new Vector3((vx - cx) * SCALE, vz * SCALE, -(vy - cy) * SCALE);
}

function viewerToVoxel(viewerPos: Vector3, cx: number, cy: number): Vec3 {
  return {
    x: viewerPos.x / SCALE + cx,
    y: -(viewerPos.z / SCALE) + cy,
    z: viewerPos.y / SCALE,
  };
}

function r1(n: number): number { return Math.round(n * 10) / 10; }

// ========================================================================
// Component
// ========================================================================
export default function BoneConfigPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const bodyMeshRef = useRef<Mesh | null>(null);
  const jointSpheresRef = useRef<Map<string, Mesh>>(new Map());
  const markerSpheresRef = useRef<Map<string, Mesh>>(new Map());
  const boneLineMeshesRef = useRef<Mesh[]>([]);
  const centerLineMeshRef = useRef<Mesh | null>(null);
  const centerRef = useRef({ cx: 0, cy: 0, maxZ: 103 });
  const draggingRef = useRef<{ markerName: string; plane: Plane; offset: Vector3 } | null>(null);
  const viewRef = useRef<ViewDirection>('front');
  const autoMirrorRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<MarkerData>(() => getDefaultMarkers(35));
  const [calculatedBones, setCalculatedBones] = useState<Record<string, Vec3>>({});
  const [selectedMarker, setSelectedMarker] = useState<string>('Chin');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showBody, setShowBody] = useState(true);
  const [showBones, setShowBones] = useState(true);
  const [tab, setTab] = useState<'markers' | 'bones'>('markers');
  const [viewDir, setViewDir] = useState<ViewDirection>('front');
  const [autoMirror, setAutoMirror] = useState(true);

  // Keep refs in sync
  useEffect(() => { autoMirrorRef.current = autoMirror; }, [autoMirror]);

  // Compute mirror center from Chin/Groin X
  const getMirrorCenterX = useCallback(() => {
    const chin = markers['Chin'];
    const groin = markers['Groin'];
    return (chin.x + groin.x) / 2;
  }, [markers]);

  // Apply auto-mirror: sync right markers from left when enabled
  const applyAutoMirror = useCallback((m: MarkerData): MarkerData => {
    const mcx = (m['Chin'].x + m['Groin'].x) / 2;
    return {
      ...m,
      RightWrist: mirrorMarker(m['LeftWrist'], mcx),
      RightElbow: mirrorMarker(m['LeftElbow'], mcx),
      RightKnee:  mirrorMarker(m['LeftKnee'], mcx),
    };
  }, []);

  const setCameraView = useCallback((dir: ViewDirection) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const vDef = VIEW_DEFS.find(v => v.key === dir)!;
    camera.alpha = vDef.alpha;
    camera.beta = Math.PI / 2;
    viewRef.current = dir;
  }, []);

  const switchView = useCallback((dir: ViewDirection) => {
    setViewDir(dir);
    setCameraView(dir);
  }, [setCameraView]);

  // Recalculate bones whenever markers change
  useEffect(() => {
    const { maxZ } = centerRef.current;
    const bones = calculateAllBones(markers, maxZ);
    setCalculatedBones(bones);
  }, [markers]);

  // Get visible markers based on autoMirror state
  const getVisibleMarkers = useCallback((): MarkerDef[] => {
    if (autoMirror) {
      // Show only center + left markers
      return MARKER_DEFS.filter(m => m.side !== 'right');
    }
    return MARKER_DEFS;
  }, [autoMirror]);

  // Build all visuals
  const rebuildVisuals = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const { cx, cy } = centerRef.current;

    // Clear old
    for (const m of jointSpheresRef.current.values()) m.dispose();
    jointSpheresRef.current.clear();
    for (const m of markerSpheresRef.current.values()) m.dispose();
    markerSpheresRef.current.clear();
    for (const m of boneLineMeshesRef.current) m.dispose();
    boneLineMeshesRef.current = [];
    if (centerLineMeshRef.current) { centerLineMeshRef.current.dispose(); centerLineMeshRef.current = null; }

    // Center line based on Chin/Groin
    const mcx = getMirrorCenterX();
    const clP1 = voxelToViewer(mcx, cy, 0, cx, cy);
    const clP2 = voxelToViewer(mcx, cy, centerRef.current.maxZ, cx, cy);
    const cl = MeshBuilder.CreateTube('centerLine', {
      path: [clP1, clP2], radius: 0.003, tessellation: 4, updatable: false,
    }, scene);
    const clMat = new StandardMaterial('clMat', scene);
    clMat.diffuseColor = new Color3(1, 1, 0);
    clMat.emissiveColor = new Color3(0.5, 0.5, 0);
    clMat.alpha = 0.3;
    clMat.disableLighting = true;
    cl.material = clMat;
    cl.isPickable = false;
    centerLineMeshRef.current = cl;

    // Marker spheres
    const visibleMarkers = getVisibleMarkers();
    for (const mDef of visibleMarkers) {
      const pos = markers[mDef.name];
      if (!pos) continue;

      const sphere = MeshBuilder.CreateSphere(`marker_${mDef.name}`, { diameter: 0.06 }, scene);
      sphere.position = voxelToViewer(pos.x, pos.y, pos.z, cx, cy);
      const mat = new StandardMaterial(`mmat_${mDef.name}`, scene);
      const c = Color3.FromHexString(mDef.color);
      mat.diffuseColor = c;
      mat.emissiveColor = mDef.name === selectedMarker ? c : c.scale(0.6);
      mat.disableLighting = true;
      sphere.material = mat;
      sphere.isPickable = true;
      sphere.metadata = { markerName: mDef.name };
      if (mDef.name === selectedMarker) {
        sphere.scaling = new Vector3(1.8, 1.8, 1.8);
      }
      markerSpheresRef.current.set(mDef.name, sphere);
    }

    // Ghost markers for auto-mirrored right side
    if (autoMirror) {
      for (const mDef of MARKER_DEFS.filter(m => m.side === 'right' && m.mirrorOf)) {
        const pos = markers[mDef.name];
        if (!pos) continue;
        const sphere = MeshBuilder.CreateSphere(`marker_${mDef.name}_ghost`, { diameter: 0.06 }, scene);
        sphere.position = voxelToViewer(pos.x, pos.y, pos.z, cx, cy);
        const mat = new StandardMaterial(`mmat_${mDef.name}_ghost`, scene);
        const c = Color3.FromHexString(mDef.color);
        mat.diffuseColor = c;
        mat.emissiveColor = c.scale(0.3);
        mat.alpha = 0.4;
        mat.disableLighting = true;
        sphere.material = mat;
        sphere.isPickable = false;
        markerSpheresRef.current.set(mDef.name + '_ghost', sphere);
      }
    }

    // Bone joints and lines
    if (showBones && Object.keys(calculatedBones).length > 0) {
      for (const bone of BONE_DEFS) {
        const pos = calculatedBones[bone.name];
        if (!pos) continue;
        const sphere = MeshBuilder.CreateSphere(`joint_${bone.name}`, { diameter: 0.03 }, scene);
        sphere.position = voxelToViewer(pos.x, pos.y, pos.z, cx, cy);
        const mat = new StandardMaterial(`jmat_${bone.name}`, scene);
        const c = Color3.FromHexString(bone.color);
        mat.diffuseColor = c;
        mat.emissiveColor = c.scale(0.4);
        mat.alpha = 0.7;
        mat.disableLighting = true;
        sphere.material = mat;
        sphere.isPickable = false;
        jointSpheresRef.current.set(bone.name, sphere);
      }

      for (const bone of BONE_DEFS) {
        if (!bone.parent) continue;
        const childPos = calculatedBones[bone.name];
        const parentPos = calculatedBones[bone.parent];
        if (!childPos || !parentPos) continue;
        const p1 = voxelToViewer(parentPos.x, parentPos.y, parentPos.z, cx, cy);
        const p2 = voxelToViewer(childPos.x, childPos.y, childPos.z, cx, cy);
        if (Vector3.Distance(p1, p2) < 0.001) continue;

        const line = MeshBuilder.CreateTube(`bone_${bone.name}`, {
          path: [p1, p2], radius: 0.005, tessellation: 6, updatable: false,
        }, scene);
        const mat = new StandardMaterial(`bmat_${bone.name}`, scene);
        const c = Color3.FromHexString(bone.color);
        mat.diffuseColor = c;
        mat.emissiveColor = c.scale(0.3);
        mat.alpha = 0.6;
        mat.disableLighting = true;
        line.material = mat;
        line.isPickable = false;
        boneLineMeshesRef.current.push(line);
      }
    }
  }, [markers, calculatedBones, selectedMarker, showBones, autoMirror, getMirrorCenterX, getVisibleMarkers]);

  // Init engine
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

    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 2, 2.5, new Vector3(0, 0.5, 0), scene);
    camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = 8; camera.wheelPrecision = 80;
    camera.inputs.clear();
    camera.inputs.addMouseWheel();
    cameraRef.current = camera;

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.5;

    // --- Drag & drop ---
    scene.onPointerObservable.add((pointerInfo) => {
      const { cx, cy } = centerRef.current;
      const currentView = VIEW_DEFS.find(v => v.key === viewRef.current)!;

      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN: {
          const pickResult = scene.pick(scene.pointerX, scene.pointerY);
          if (pickResult?.hit && pickResult.pickedMesh?.metadata?.markerName) {
            const markerName = pickResult.pickedMesh.metadata.markerName as string;
            const meshPos = pickResult.pickedMesh.position;
            const cameraDir = camera.position.subtract(camera.target).normalize();
            const dragPlane = Plane.FromPositionAndNormal(meshPos, cameraDir);
            const pickPoint = pickResult.pickedPoint!;
            const offset = meshPos.subtract(pickPoint);
            draggingRef.current = { markerName, plane: dragPlane, offset };
            setSelectedMarker(markerName);
            setTab('markers');
          }
          break;
        }
        case PointerEventTypes.POINTERMOVE: {
          if (!draggingRef.current) break;
          const { markerName, plane, offset } = draggingRef.current;

          const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, camera);
          const denom = Vector3.Dot(ray.direction, plane.normal);
          if (Math.abs(denom) < 1e-6) break;
          const t = -(Vector3.Dot(ray.origin, plane.normal) + plane.d) / denom;
          if (t < 0) break;
          const hitPoint = ray.origin.add(ray.direction.scale(t)).add(offset);
          const newVox = viewerToVoxel(hitPoint, cx, cy);

          setMarkers(prev => {
            const old = prev[markerName];
            const updated = { ...old };

            if (currentView.dragAxes.includes('x')) {
              updated.x = Math.max(0, Math.min(85, Math.round(newVox.x * 2) / 2));
            }
            if (currentView.dragAxes.includes('y')) {
              updated.y = Math.max(0, Math.min(34, Math.round(newVox.y * 2) / 2));
            }
            if (currentView.dragAxes.includes('z')) {
              updated.z = Math.max(0, Math.min(103, Math.round(newVox.z * 2) / 2));
            }

            let next = { ...prev, [markerName]: updated };

            // Auto-mirror: if editing a left marker, sync right
            if (autoMirrorRef.current) {
              const mDef = MARKER_DEFS.find(m => m.name === markerName);
              if (mDef?.side === 'left') {
                const rightName = MARKER_DEFS.find(m => m.mirrorOf === markerName)?.name;
                if (rightName) {
                  const mcx = (next['Chin'].x + next['Groin'].x) / 2;
                  next[rightName] = mirrorMarker(updated, mcx);
                }
              }
              // If editing Chin or Groin (center changes), re-mirror all
              if (markerName === 'Chin' || markerName === 'Groin') {
                const mcx = (next['Chin'].x + next['Groin'].x) / 2;
                next['RightWrist'] = mirrorMarker(next['LeftWrist'], mcx);
                next['RightElbow'] = mirrorMarker(next['LeftElbow'], mcx);
                next['RightKnee']  = mirrorMarker(next['LeftKnee'], mcx);
              }
            }

            return next;
          });
          setDirty(true);
          break;
        }
        case PointerEventTypes.POINTERUP: {
          if (draggingRef.current) {
            draggingRef.current = null;
          }
          break;
        }
      }
    });

    sceneRef.current = scene;
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  // Load body + saved config
  useEffect(() => {
    if (!sceneRef.current) return;
    (async () => {
      try {
        const { model, voxels } = await loadVoxFile(VOX_BODY_URL);
        const cx = model.sizeX / 2;
        const cy = model.sizeY / 2;
        const maxZ = model.sizeZ;
        centerRef.current = { cx, cy, maxZ };

        bodyMeshRef.current = buildBodyMesh(voxels, sceneRef.current!, cx, cy, 0.25);

        try {
          const resp = await fetch('/api/bone-config');
          if (resp.ok) {
            const data = await resp.json();
            if (data?.markers && typeof data.markers === 'object') {
              setMarkers(prev => ({ ...prev, ...data.markers }));
              if (data.autoMirror === false) setAutoMirror(false);
            } else if (data && typeof data === 'object' && !data.markers) {
              setMarkers(getDefaultMarkers(cx));
            }
          }
        } catch { /* use defaults */ }

        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
  }, []);

  // Rebuild visuals
  useEffect(() => {
    if (!loading) rebuildVisuals();
  }, [loading, rebuildVisuals]);

  // Toggle body visibility
  useEffect(() => {
    if (bodyMeshRef.current) bodyMeshRef.current.setEnabled(showBody);
  }, [showBody]);

  const updateMarker = useCallback((markerName: string, axis: 'x' | 'y' | 'z', value: number) => {
    setMarkers(prev => {
      let next = { ...prev, [markerName]: { ...prev[markerName], [axis]: value } };

      if (autoMirrorRef.current) {
        const mDef = MARKER_DEFS.find(m => m.name === markerName);
        if (mDef?.side === 'left') {
          const rightName = MARKER_DEFS.find(m => m.mirrorOf === markerName)?.name;
          if (rightName) {
            const mcx = (next['Chin'].x + next['Groin'].x) / 2;
            next[rightName] = mirrorMarker(next[markerName], mcx);
          }
        }
        if (markerName === 'Chin' || markerName === 'Groin') {
          const mcx = (next['Chin'].x + next['Groin'].x) / 2;
          next['RightWrist'] = mirrorMarker(next['LeftWrist'], mcx);
          next['RightElbow'] = mirrorMarker(next['LeftElbow'], mcx);
          next['RightKnee']  = mirrorMarker(next['LeftKnee'], mcx);
        }
      }

      return next;
    });
    setDirty(true);
  }, []);

  // Toggle auto-mirror
  const toggleAutoMirror = useCallback(() => {
    setAutoMirror(prev => {
      const next = !prev;
      if (next) {
        // Turning ON: sync right from left immediately
        setMarkers(m => applyAutoMirror(m));
      }
      // If selected marker is a right-side marker and we're turning mirror ON, switch to left
      const selDef = MARKER_DEFS.find(m => m.name === selectedMarker);
      if (next && selDef?.side === 'right' && selDef.mirrorOf) {
        setSelectedMarker(selDef.mirrorOf);
      }
      setDirty(true);
      return next;
    });
  }, [selectedMarker, applyAutoMirror]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const resp = await fetch('/api/bone-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markers, bones: calculatedBones, autoMirror }),
      });
      if (!resp.ok) throw new Error('Save failed');
      setDirty(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }, [markers, calculatedBones, autoMirror]);

  const resetToDefaults = useCallback(() => {
    const { cx } = centerRef.current;
    setMarkers(getDefaultMarkers(cx));
    setAutoMirror(true);
    setDirty(true);
  }, []);

  const selMarker = MARKER_DEFS.find(m => m.name === selectedMarker);
  const selPos = selectedMarker ? markers[selectedMarker] : null;
  const currentViewDef = VIEW_DEFS.find(v => v.key === viewDir)!;
  const visibleMarkers = getVisibleMarkers();
  const mirrorCenterX = getMirrorCenterX();

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      {/* Sidebar */}
      <div style={{
        width: 320, minWidth: 320, background: '#0f0f23', color: '#ccc',
        borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 'bold', fontSize: 16 }}>Bone Config</span>
            <Link href="/" style={{ color: '#888', fontSize: 11, textDecoration: 'none' }}>Top</Link>
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>マーカーで20ボーンを自動配置</div>
        </div>

        {error && <div style={{ padding: 12, color: '#f88', fontSize: 12 }}>Error: {error}</div>}
        {loading && <div style={{ padding: 12, color: '#88f', fontSize: 12 }}>Loading...</div>}

        {/* View direction */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>View Direction</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {VIEW_DEFS.map(vDef => {
              const active = viewDir === vDef.key;
              return (
                <button
                  key={vDef.key}
                  onClick={() => switchView(vDef.key)}
                  style={{
                    flex: 1, padding: '6px 0', border: 'none', borderRadius: 4, cursor: 'pointer',
                    fontSize: 12, fontWeight: 'bold',
                    background: active ? '#3a3a8e' : '#1a1a3e',
                    color: active ? '#fff' : '#888',
                    outline: active ? '2px solid #66f' : '1px solid #333',
                  }}
                >{vDef.label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
            ドラッグ軸: {currentViewDef.axisLabels}
          </div>
        </div>

        {/* Toggles */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showBody} onChange={() => setShowBody(!showBody)} />
            Body
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showBones} onChange={() => setShowBones(!showBones)} />
            Bones
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={autoMirror} onChange={toggleAutoMirror} />
            <span style={{ color: autoMirror ? '#88f' : '#888' }}>左右対称</span>
          </label>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
          <button
            onClick={() => setTab('markers')}
            style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
              background: tab === 'markers' ? '#2a2a5e' : 'transparent',
              color: tab === 'markers' ? '#fff' : '#888',
              borderBottom: tab === 'markers' ? '2px solid #88f' : '2px solid transparent',
            }}
          >Markers ({autoMirror ? 5 : 8})</button>
          <button
            onClick={() => setTab('bones')}
            style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
              background: tab === 'bones' ? '#2a2a5e' : 'transparent',
              color: tab === 'bones' ? '#fff' : '#888',
              borderBottom: tab === 'bones' ? '2px solid #88f' : '2px solid transparent',
            }}
          >Auto Bones (20)</button>
        </div>

        {/* Markers tab */}
        {tab === 'markers' && (
          <>
            {selMarker && selPos && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #333', background: '#11112a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: selMarker.color, display: 'inline-block', border: '2px solid #fff' }} />
                  <span style={{ fontWeight: 'bold', fontSize: 14 }}>{selMarker.label}</span>
                  {selMarker.side === 'left' && autoMirror && (
                    <span style={{ fontSize: 10, color: '#88f', background: '#1a1a4e', padding: '1px 6px', borderRadius: 8 }}>L/R auto</span>
                  )}
                </div>

                {(['x', 'y', 'z'] as const).map(axis => {
                  const max = axis === 'x' ? 85 : axis === 'y' ? 34 : 103;
                  const labels = { x: 'X (左右)', y: 'Y (前後)', z: 'Z (高さ)' };
                  const isDragAxis = currentViewDef.dragAxes.includes(axis);
                  return (
                    <div key={axis} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 70, fontSize: 11, color: isDragAxis ? '#ddd' : '#666' }}>
                          {labels[axis]}
                        </span>
                        <input type="range" min={0} max={max} step={0.5}
                          value={selPos[axis]}
                          onChange={e => updateMarker(selectedMarker, axis, Number(e.target.value))}
                          style={{ flex: 1 }} />
                        <input type="number" min={0} max={max} step={0.5}
                          value={selPos[axis]}
                          onChange={e => updateMarker(selectedMarker, axis, Number(e.target.value))}
                          style={{
                            width: 50, fontSize: 11, background: '#1a1a3e', color: '#ccc',
                            border: '1px solid #444', borderRadius: 3, padding: '2px 4px', textAlign: 'right',
                          }} />
                      </div>
                    </div>
                  );
                })}

                {autoMirror && selMarker.side === 'left' && (
                  <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                    Right auto: X={r1(mirrorCenterX + (mirrorCenterX - selPos.x))}
                    {' '}(center: {r1(mirrorCenterX)})
                  </div>
                )}
                {(selMarker.name === 'Chin' || selMarker.name === 'Groin') && autoMirror && (
                  <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                    Mirror center X: {r1(mirrorCenterX)} (Chin+Groin)/2
                  </div>
                )}
              </div>
            )}

            {/* Marker list */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: '6px 12px', fontSize: 11, color: '#888', borderBottom: '1px solid #222' }}>
                マーカー一覧 (ドラッグ / クリックで選択)
              </div>
              {visibleMarkers.map(mDef => {
                const isSelected = mDef.name === selectedMarker;
                const pos = markers[mDef.name];
                return (
                  <div
                    key={mDef.name}
                    onClick={() => setSelectedMarker(mDef.name)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                      background: isSelected ? '#2a2a5e' : 'transparent',
                      borderLeft: isSelected ? `3px solid ${mDef.color}` : '3px solid transparent',
                      color: isSelected ? '#fff' : '#aaa',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span style={{
                      width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                      background: mDef.color, display: 'inline-block',
                      border: isSelected ? '2px solid #fff' : '1px solid #666',
                    }} />
                    <span style={{ flex: 1 }}>{mDef.label}</span>
                    {pos && (
                      <span style={{ fontSize: 10, color: '#666' }}>
                        ({r1(pos.x)}, {r1(pos.y)}, {r1(pos.z)})
                      </span>
                    )}
                    {autoMirror && mDef.side === 'left' && <span style={{ fontSize: 9, color: '#558' }}>L/R</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Bones tab */}
        {tab === 'bones' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ padding: '6px 12px', fontSize: 11, color: '#888', borderBottom: '1px solid #222' }}>
              自動計算されたボーン (読み取り専用)
            </div>
            {BONE_DEFS.map(bone => {
              const pos = calculatedBones[bone.name];
              const depth = getDepth(bone.name);
              return (
                <div
                  key={bone.name}
                  style={{
                    padding: '4px 12px', paddingLeft: 12 + depth * 14,
                    fontSize: 11, color: '#999',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: bone.color, display: 'inline-block',
                  }} />
                  <span style={{ flex: 1 }}>{bone.label}</span>
                  {pos && (
                    <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
                      {r1(pos.x)}, {r1(pos.y)}, {r1(pos.z)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={resetToDefaults} style={{
            padding: '6px 0', borderRadius: 4, cursor: 'pointer',
            background: '#3a2a2a', color: '#ccc', border: '1px solid #555', fontSize: 11,
          }}>Reset to Defaults</button>
          <button onClick={handleSave} disabled={saving || !dirty} style={{
            padding: '10px 0', borderRadius: 4,
            cursor: dirty ? 'pointer' : 'default',
            background: dirty ? '#4a6' : '#1a1a2e',
            color: dirty ? '#fff' : '#444',
            border: dirty ? '2px solid #5b7' : '1px solid #333',
            fontSize: 13, fontWeight: 'bold',
          }}>
            {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 14px',
          background: 'rgba(50, 50, 140, 0.8)', borderRadius: 6, fontSize: 14, color: '#fff', fontWeight: 'bold',
        }}>
          {currentViewDef.label}
        </div>

        {dirty && (
          <div style={{
            position: 'absolute', top: 12, right: 12, padding: '4px 10px',
            background: 'rgba(255, 130, 50, 0.8)', borderRadius: 4, fontSize: 12, color: '#fff',
          }}>Unsaved changes</div>
        )}

        <div style={{
          position: 'absolute', bottom: 12, left: 12, padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.6)', borderRadius: 6, fontSize: 11, color: '#aaa',
        }}>
          <div>● マーカーをドラッグして配置</div>
          <div>マウスホイールでズーム</div>
          <div style={{ marginTop: 4, color: '#666' }}>
            {autoMirror
              ? `左右対称 ON (center: X=${r1(mirrorCenterX)})`
              : '左右対称 OFF (左右独立)'}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDepth(boneName: string): number {
  let depth = 0;
  let current = BONE_DEFS.find(b => b.name === boneName);
  while (current?.parent) {
    depth++;
    current = BONE_DEFS.find(b => b.name === current!.parent);
  }
  return depth;
}
