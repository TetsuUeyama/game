/**
 * 顔パーツメッシュ生成ファクトリ
 *
 * FaceParams に基づいて目・眉・鼻・口のメッシュを生成する。
 * useHumanoidControl（メインシーン用）と FacePreviewCanvas（プレビュー用）で共有。
 */
import {
  Scene,
  AbstractMesh,
  Node,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  VertexData,
  DynamicTexture,
} from "@babylonjs/core";
import {
  FaceParams,
  EyePreset,
  EyebrowPreset,
  NosePreset,
  MouthPreset,
} from "../ui/CheckModeTypes";

/** FaceParams に基づいて顔パーツ（目・眉・鼻・口）を生成 */
export function createFacePartsFromParams(
  scene: Scene,
  rootMesh: Node,
  params: FaceParams,
  index: number,
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];

  // 目（DynamicTexture で白目+黒目を1枚のディスクに描画、白目外は自然にクリップ）
  const ep: EyePreset = params.eye;
  const scleraR = ep.diameter / 2;

  // 黒目の中心位置クランプ（白目内に中心を収める）
  const bSemi = scleraR * ep.scaleY;
  const clampedOffY = Math.max(-bSemi, Math.min(bSemi, ep.pupilOffsetY));

  // テクスチャに白目+黒目を描画
  const texSize = 128;
  const half = texSize / 2;
  const eyeTex = new DynamicTexture(`eyeTex_${index}`, texSize, scene, true);
  const ctx = eyeTex.getContext() as unknown as CanvasRenderingContext2D;

  // 白背景（ディスクメッシュの形状が白目の輪郭を定義）
  ctx.fillStyle = "#F2F2F2";
  ctx.fillRect(0, 0, texSize, texSize);

  // 黒目: メッシュスケール補正で画面上は円に見える楕円を描画
  const pxRX = (ep.pupilRatio * half) / ep.scaleX;
  const pxRY = (ep.pupilRatio * half) / ep.scaleY;
  const pxOffY = (clampedOffY / (ep.scaleY * scleraR)) * half;

  ctx.fillStyle = "#0D0D0D";
  ctx.beginPath();
  ctx.ellipse(half, half - pxOffY, pxRX, pxRY, 0, 0, Math.PI * 2);
  ctx.fill();
  eyeTex.update();

  const eyeMat = new StandardMaterial(`eyeMat_${index}`, scene);
  eyeMat.diffuseTexture = eyeTex;
  eyeMat.backFaceCulling = false;

  // 左目
  const eyeL = MeshBuilder.CreateDisc(`eyeL_${index}`, { radius: scleraR, tessellation: 24 }, scene);
  eyeL.material = eyeMat;
  eyeL.parent = rootMesh;
  eyeL.position.set(-ep.spacing, ep.y, ep.z);
  eyeL.scaling.set(ep.scaleX, ep.scaleY, 1.0);
  eyeL.rotation.z = ep.angle;

  // 右目（同じテクスチャを共有）
  const eyeR = MeshBuilder.CreateDisc(`eyeR_${index}`, { radius: scleraR, tessellation: 24 }, scene);
  eyeR.material = eyeMat;
  eyeR.parent = rootMesh;
  eyeR.position.set(ep.spacing, ep.y, ep.z);
  eyeR.scaling.set(ep.scaleX, ep.scaleY, 1.0);
  eyeR.rotation.z = -ep.angle;

  // 眉毛
  const eb: EyebrowPreset = params.eyebrow;
  const browMat = new StandardMaterial(`browMat_${index}`, scene);
  browMat.diffuseColor = new Color3(0.15, 0.1, 0.08);

  const browL = MeshBuilder.CreateBox(`browL_${index}`, {
    width: eb.width, height: eb.height, depth: eb.depth,
  }, scene);
  browL.material = browMat;
  browL.parent = rootMesh;
  browL.position.set(-eb.spacing, eb.y, eb.z);
  browL.rotation.z = eb.angle;

  const browR = MeshBuilder.CreateBox(`browR_${index}`, {
    width: eb.width, height: eb.height, depth: eb.depth,
  }, scene);
  browR.material = browMat;
  browR.parent = rootMesh;
  browR.position.set(eb.spacing, eb.y, eb.z);
  browR.rotation.z = -eb.angle;

  // 鼻
  const np: NosePreset = params.nose;
  const skinMat = new StandardMaterial(`skinMat_${index}`, scene);
  skinMat.diffuseColor = new Color3(0.85, 0.7, 0.55);
  skinMat.backFaceCulling = false;

  const nose = np.shape === "halfCone"
    ? createHalfConeNose(`nose_${index}`, np.width, np.height, np.depth, scene, np.topRatio ?? 0)
    : np.shape === "wedge"
    ? createWedgeNose(`nose_${index}`, np.width, np.height, np.depth, scene)
    : MeshBuilder.CreateBox(`nose_${index}`, {
        width: np.width, height: np.height, depth: np.depth,
      }, scene);
  nose.material = skinMat;
  nose.parent = rootMesh;
  nose.position.set(0, np.y, np.z);

  // 口（左右2本線）
  const mp: MouthPreset = params.mouth;
  const mouthMat = new StandardMaterial(`mouthMat_${index}`, scene);
  mouthMat.diffuseColor = new Color3(0.6, 0.3, 0.3);

  const mouthL = MeshBuilder.CreateBox(`mouthL_${index}`, {
    width: mp.halfWidth, height: mp.height, depth: mp.depth,
  }, scene);
  mouthL.material = mouthMat;
  mouthL.parent = rootMesh;
  mouthL.position.set(-mp.halfWidth / 2, mp.y, mp.z);
  mouthL.setPivotPoint(new Vector3(mp.halfWidth / 2, 0, 0));
  mouthL.rotation.z = mp.angle;

  const mouthR = MeshBuilder.CreateBox(`mouthR_${index}`, {
    width: mp.halfWidth, height: mp.height, depth: mp.depth,
  }, scene);
  mouthR.material = mouthMat;
  mouthR.parent = rootMesh;
  mouthR.position.set(mp.halfWidth / 2, mp.y, mp.z);
  mouthR.setPivotPoint(new Vector3(-mp.halfWidth / 2, 0, 0));
  mouthR.rotation.z = -mp.angle;

  meshes.push(eyeL, eyeR, browL, browR, nose, mouthL, mouthR);
  return meshes;
}

// ── 鼻用カスタムメッシュ ──────────────────────────────────

/**
 * 直角三角形の断面を持つ楔形メッシュを生成（鼻用）
 */
function createWedgeNose(
  name: string, width: number, height: number, depth: number, scene: Scene,
): Mesh {
  const mesh = new Mesh(name, scene);
  const w = width / 2;
  const h = height / 2;
  const d = depth / 2;

  const positions = [
    -w, -h, -d,   w, -h, -d,   w, -h,  d,  -w, -h,  d,
    -w, -h, -d,  -w,  h, -d,   w,  h, -d,   w, -h, -d,
    -w,  h, -d,  -w, -h,  d,   w, -h,  d,   w,  h, -d,
    -w, -h, -d,  -w, -h,  d,  -w,  h, -d,
     w, -h, -d,   w,  h, -d,   w, -h,  d,
  ];

  const indices = [
    0, 1, 2,   0, 2, 3,
    4, 5, 6,   4, 6, 7,
    8, 9, 10,  8, 10, 11,
    12, 13, 14,
    15, 16, 17,
  ];

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);

  return mesh;
}

/**
 * 半円錐 / 半円錐台メッシュを生成（鼻用）
 */
function createHalfConeNose(
  name: string, width: number, height: number, depth: number, scene: Scene,
  topRatio: number = 0, segments: number = 12,
): Mesh {
  const mesh = new Mesh(name, scene);
  const w = width / 2;
  const h = height / 2;
  const tr = Math.max(0, Math.min(1, topRatio));

  function makeHalfCircle(
    halfW: number, y: number, d: number,
  ): [number, number, number][] {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI * i) / segments;
      pts.push([halfW * Math.cos(angle), y, d * Math.sin(angle)]);
    }
    return pts;
  }

  const bottom = makeHalfCircle(w, -h, depth);

  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;

  function push3(p: [number, number, number]) {
    positions.push(p[0], p[1], p[2]);
  }

  if (tr === 0) {
    const apex: [number, number, number] = [0, h, 0];
    for (let i = 0; i < segments; i++) {
      push3(apex); push3(bottom[i]); push3(bottom[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
    push3(apex); push3(bottom[segments]); push3(bottom[0]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;
  } else {
    const top = makeHalfCircle(w * tr, h, depth * tr);
    for (let i = 0; i < segments; i++) {
      push3(top[i]); push3(bottom[i]); push3(bottom[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
      push3(top[i]); push3(bottom[i + 1]); push3(top[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
    push3(top[segments]); push3(bottom[segments]); push3(bottom[0]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;
    push3(top[segments]); push3(bottom[0]); push3(top[0]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;
    const topC: [number, number, number] = [0, h, 0];
    for (let i = 0; i < segments; i++) {
      push3(topC); push3(top[i]); push3(top[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
  }

  const botC: [number, number, number] = [0, -h, 0];
  for (let i = 0; i < segments; i++) {
    push3(botC); push3(bottom[i + 1]); push3(bottom[i]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);

  return mesh;
}
