import {
  Scene,
  Skeleton,
  Bone,
  Vector3,
  Quaternion,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Color3,
  Space,
  DynamicTexture,
} from "@babylonjs/core";
import { createProceduralHumanoid, ProceduralHumanoidResult } from "@/GamePlay/GameSystem/CharacterModel/Character/ProceduralHumanoid";
import { SkeletonAdapter } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonAdapter";
import { CharacterState, CHARACTER_STATE_COLORS } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";
import { GLBModelLoader, GLBCloneData } from "@/GamePlay/GameSystem/CharacterModel/Character/GLBModelLoader";

type RenderMode = 'procedural' | 'glb';

/**
 * 試合モード用のキャラクターモデル。
 * ProceduralHumanoid（ボックス/球の簡易モデル）または GLB 3Dモデルをラップし、
 * Character.ts が必要とするインターフェースを提供する。
 *
 * FK パイプライン:
 * SkeletonAdapter が実行時にレスト回転をキャプチャし、左右対称補正を計算する。
 *
 * GLB モード:
 * - skeleton.prepare() は無効化しない（GPU スキニングに必要）
 * - ボーン書き込みは TransformNode.rotationQuaternion 経由（MotionController が対応済み）
 * - rootMesh は rotationQuaternion を使用（GLB ローダーが設定する）
 * - updateVisuals() は no-op（SkinnedMesh が自動変形）
 */
export class MatchCharacterModel {
  private _renderMode: RenderMode;

  // ── Procedural モード用 ──
  private humanoid: ProceduralHumanoidResult | null = null;

  // ── GLB モード用 ──
  private _glbClone: GLBCloneData | null = null;
  /** GLB rootMesh の初期 rotationQuaternion（GLB ローダーが設定する回転、通常 RotY(π)） */
  private _glbInitialRotation: Quaternion | null = null;

  // ── 共通 ──
  private _adapter: SkeletonAdapter;
  private _wrapperMesh: Mesh;
  private _stateIndicator: Mesh;
  private _visionCone: Mesh;
  private _heightOffset: number;
  /** ヒップボーンのレストポーズ位置（IKリセット用） */
  private _hipRestPos: Vector3;

  /**
   * Procedural モードのコンストラクタ（既存互換）
   */
  constructor(
    scene: Scene,
    config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } },
    state: CharacterState,
    position: Vector3,
  ) {
    this._renderMode = 'procedural';
    this._glbInitialRotation = null;

    // ProceduralHumanoid を生成
    this.humanoid = createProceduralHumanoid(scene);

    // SkeletonAdapter を生成
    this._adapter = new SkeletonAdapter(this.humanoid.skeleton, this.humanoid.rootMesh);

    // ラッパーメッシュを作成
    this._wrapperMesh = new Mesh("character_wrapper", scene);
    this._wrapperMesh.position.copyFrom(position);
    this._heightOffset = config.physical.height / 2;

    // ProceduralHumanoid のアニメーションを停止
    this.humanoid.idleAnimation.stop();
    this.humanoid.walkAnimation.stop();

    // AnimationGroup 残留を除去
    for (const bone of this._adapter.skeleton.bones) {
      bone.animations = [];
    }

    // skeleton.prepare() 無効化（Procedural は GPU スキニング不使用）
    this._adapter.skeleton.prepare = () => {};

    // 全ボーンの内部 TRS をレスト回転で初期化
    this._adapter.initializeAllBones();

    // ヒップボーンのレストポーズ位置をキャッシュ
    const hipBone = this._adapter.findBone("hips");
    this._hipRestPos = new Vector3();
    if (hipBone) {
      hipBone.getRestPose().decompose(undefined, undefined, this._hipRestPos);
    }

    // rootMesh のトランスフォームを初期同期
    this.syncRootMeshTransform();

    // インジケーター配置
    const headLocalY = this.computeHeadLocalY();
    this._stateIndicator = this.createStateIndicator(scene, state);
    this._stateIndicator.parent = this._wrapperMesh;
    this._stateIndicator.position = new Vector3(0, headLocalY + 0.40, 0);

    this._visionCone = this.createVisionCone(
      scene, config.vision.visionAngle, config.vision.visionRange, state,
    );
    this._visionCone.parent = this._wrapperMesh;
    this._visionCone.position = new Vector3(
      0,
      headLocalY + 0.03,
      config.vision.visionRange / 2,
    );
  }

  /**
   * GLB モードのファクトリメソッド。
   * GLBModelLoader からクローンを取得し、GLB ベースの MatchCharacterModel を構築する。
   */
  static createFromGLB(
    scene: Scene,
    config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } },
    state: CharacterState,
    position: Vector3,
  ): MatchCharacterModel {
    const loader = GLBModelLoader.getInstance();
    const clone = loader.createClone(scene);

    const model = Object.create(MatchCharacterModel.prototype) as MatchCharacterModel;
    model._renderMode = 'glb';
    model.humanoid = null;
    model._glbClone = clone;

    // GLB rootMesh の初期回転を保存（通常 RotY(π)、ローダーが設定）
    model._glbInitialRotation = clone.rootMesh.rotationQuaternion?.clone() ?? null;

    // SkeletonAdapter を GLB skeleton から生成
    model._adapter = new SkeletonAdapter(clone.skeleton, clone.rootMesh);

    // ラッパーメッシュ
    model._wrapperMesh = new Mesh("character_wrapper_glb", scene);
    model._wrapperMesh.position.copyFrom(position);
    model._heightOffset = config.physical.height / 2;

    // ★ GLB: skeleton.prepare() は無効化しない ★
    // GPU スキニング（SkinnedMesh）が正しく描画されるために prepare() が必要。
    // Procedural モードでは prepare() を無効化するが、GLB モードでは残す。
    // prepare() はボーン回転を上書きしない（読み取って GPU 行列を計算するだけ）。

    // GLB ボーンの TransformNode に rotationQuaternion を初期化
    // （MotionPlayer / MotionController が property setter で書き込むために必要）
    for (const bone of model._adapter.skeleton.bones) {
      const node = bone.getTransformNode();
      if (node && !node.rotationQuaternion) {
        node.rotationQuaternion = Quaternion.Identity();
      }
    }

    // ヒップボーンのレストポーズ位置をキャッシュ
    const hipBone = model._adapter.findBone("hips");
    model._hipRestPos = new Vector3();
    if (hipBone) {
      hipBone.getRestPose().decompose(undefined, undefined, model._hipRestPos);
    }

    // rootMesh のトランスフォームを初期同期
    model.syncRootMeshTransform();

    // インジケーター配置
    const headLocalY = model.computeHeadLocalY();
    model._stateIndicator = model.createStateIndicator(scene, state);
    model._stateIndicator.parent = model._wrapperMesh;
    model._stateIndicator.position = new Vector3(0, headLocalY + 0.40, 0);

    model._visionCone = model.createVisionCone(
      scene, config.vision.visionAngle, config.vision.visionRange, state,
    );
    model._visionCone.parent = model._wrapperMesh;
    model._visionCone.position = new Vector3(
      0,
      headLocalY + 0.03,
      config.vision.visionRange / 2,
    );

    return model;
  }

  /** レンダーモードを取得 */
  getRenderMode(): RenderMode {
    return this._renderMode;
  }

  // ─── Root / Skeleton ────────────────────────────────────

  getRootMesh(): Mesh {
    return this._wrapperMesh;
  }

  getSkeletonMesh(): Mesh {
    if (this._renderMode === 'glb' && this._glbClone) {
      return this._glbClone.rootMesh;
    }
    return this.humanoid!.rootMesh;
  }

  getSkeleton(): Skeleton {
    return this._adapter.skeleton;
  }

  /** SkeletonAdapter を返す（MotionPlayer / テストシーン統合用） */
  getAdapter(): SkeletonAdapter {
    return this._adapter;
  }

  // ─── FK 書き込み ─────────────────────────────────────────

  setBoneAnimationRotation(jointName: string, animEuler: Vector3): void {
    this._adapter.applyFKRotationByJoint(jointName, animEuler);
  }

  // ─── フレーム準備 ─────────────────────────────────────

  /**
   * 毎フレーム開始時に呼ぶ。IK が前フレームで変更したヒップ位置をリセットする。
   * GLB: TransformNode.position 経由でリセット（Bone API は TransformNode に効かない）
   * Procedural: Bone API 経由でリセット
   */
  prepareFrame(): void {
    const hipBone = this._adapter.findBone("hips");
    if (!hipBone) return;

    if (this._renderMode === 'glb') {
      const node = hipBone.getTransformNode();
      if (node) {
        node.position.copyFrom(this._hipRestPos);
      }
    } else {
      hipBone.setPosition(this._hipRestPos, Space.LOCAL);
    }
  }

  // ─── ビジュアル更新 ─────────────────────────────────────

  syncTransform(): void {
    this.syncRootMeshTransform();
  }

  /**
   * ビジュアルメッシュをボーン位置に同期。
   * GLB モードでは SkinnedMesh が自動変形するため no-op。
   */
  updateVisuals(): void {
    if (this._renderMode === 'procedural' && this.humanoid) {
      this.humanoid.updateVisuals();
    }
    // GLB: SkinnedMesh が自動変形 → no-op
  }

  // ─── ボーン位置クエリ ────────────────────────────────────

  private _getSkeletonRootMesh(): Mesh {
    if (this._renderMode === 'glb' && this._glbClone) {
      return this._glbClone.rootMesh;
    }
    return this.humanoid!.rootMesh;
  }

  /**
   * GLB: 全ボーンの TransformNode ワールド行列を強制再計算する。
   * FK は TransformNode.rotationQuaternion に書き込むが、bone._localMatrix は
   * skeleton.prepare()（レンダーループ内）まで更新されない。
   * ボーン位置クエリ前にこのメソッドを呼び、TransformNode 経由で正確な位置を取得する。
   */
  private _forceGLBWorldMatrixUpdate(): void {
    this._glbClone!.rootMesh.computeWorldMatrix(true);
    for (const bone of this._adapter.skeleton.bones) {
      const node = bone.getTransformNode();
      if (node) node.computeWorldMatrix(true);
    }
  }

  /**
   * ボーンのワールド座標を取得する。
   * GLB: TransformNode のワールド座標を直接読む（FK 書き込みが即時反映される）。
   * Procedural: bone API (computeAbsoluteMatrices + getAbsolutePosition) を使用。
   */
  private _getBoneWorldPosition(bone: Bone): Vector3 {
    if (this._renderMode === 'glb') {
      const node = bone.getTransformNode();
      if (node) return node.absolutePosition.clone();
      return Vector3.Zero();
    }
    return bone.getAbsolutePosition(this._getSkeletonRootMesh());
  }

  getFootBonePositions(): { leftY: number; rightY: number } {
    if (this._renderMode === 'glb') {
      this._forceGLBWorldMatrixUpdate();
    } else {
      this._adapter.skeleton.computeAbsoluteMatrices(true);
    }
    const lFoot = this._adapter.findBone("leftFoot");
    const rFoot = this._adapter.findBone("rightFoot");
    const leftY = lFoot ? this._getBoneWorldPosition(lFoot).y : 0;
    const rightY = rFoot ? this._getBoneWorldPosition(rFoot).y : 0;
    return { leftY, rightY };
  }

  getHandBonePosition(side: 'left' | 'right'): Vector3 {
    const bone = this._adapter.findBone(side === 'left' ? "leftHand" : "rightHand");
    if (!bone) return Vector3.Zero();
    if (this._renderMode === 'glb') {
      this._forceGLBWorldMatrixUpdate();
      return this._getBoneWorldPosition(bone);
    }
    return bone.getAbsolutePosition(this._getSkeletonRootMesh());
  }

  getWaistBonePosition(): Vector3 {
    const bone = this._adapter.findBone("hips");
    if (!bone) return Vector3.Zero();
    if (this._renderMode === 'glb') {
      this._forceGLBWorldMatrixUpdate();
      return this._getBoneWorldPosition(bone);
    }
    return bone.getAbsolutePosition(this._getSkeletonRootMesh());
  }

  getBoneForJoint(jointName: string): Bone | null {
    return this._adapter.findBoneByJointName(jointName);
  }

  // ─── ビジュアル操作 ─────────────────────────────────────

  setColor(r: number, g: number, b: number): void {
    if (this._renderMode === 'glb' && this._glbClone) {
      this._setGLBColor(r, g, b);
    } else if (this.humanoid) {
      const color = new Color3(r, g, b);
      for (const mesh of this.humanoid.getAllVisualMeshes()) {
        if (mesh.material instanceof StandardMaterial) {
          mesh.material.diffuseColor = color;
        }
      }
    }
  }

  setBodyColor(r: number, g: number, b: number): void {
    if (this._renderMode === 'glb' && this._glbClone) {
      this._setGLBBodyColor(r, g, b);
    } else if (this.humanoid) {
      const color = new Color3(r, g, b);
      const torso = this.humanoid.getSegmentMeshByName("torso_vis");
      if (torso?.material instanceof StandardMaterial) {
        torso.material.diffuseColor = color;
      }
    }
  }

  getAllVisualMeshes(): Mesh[] {
    if (this._renderMode === 'glb' && this._glbClone) {
      return this._glbClone.allMeshes.filter(m => m instanceof Mesh) as Mesh[];
    }
    return this.humanoid!.getAllVisualMeshes();
  }

  hideAllParts(): void {
    if (this._renderMode === 'glb' && this._glbClone) {
      for (const m of this._glbClone.allMeshes) {
        m.isVisible = false;
      }
      for (const m of this._glbClone.hairMeshes) {
        m.isVisible = false;
      }
    } else if (this.humanoid) {
      for (const mesh of this.humanoid.getAllVisualMeshes()) {
        mesh.isVisible = false;
      }
    }
  }

  setVisible(visible: boolean): void {
    if (this._renderMode === 'glb' && this._glbClone) {
      for (const m of this._glbClone.allMeshes) {
        m.setEnabled(visible);
      }
      if (this._glbClone.hairRootMesh) {
        this._glbClone.hairRootMesh.setEnabled(visible);
      }
      for (const m of this._glbClone.hairMeshes) {
        m.setEnabled(visible);
      }
    } else if (this.humanoid) {
      for (const mesh of this.humanoid.getAllVisualMeshes()) {
        mesh.setEnabled(visible);
      }
    }
  }

  // ─── インジケーター ─────────────────────────────────────

  getStateIndicator(): Mesh {
    return this._stateIndicator;
  }

  getVisionCone(): Mesh {
    return this._visionCone;
  }

  // ─── 顔・ジャージー ─────────────────────────────────────

  getFaceMeshes(): Mesh[] {
    if (this._renderMode === 'glb') {
      return [];
    }
    const result: Mesh[] = [];
    const headMesh = this.humanoid!.getPointMeshByName("head_vis");
    if (headMesh) result.push(headMesh);
    const eyeL = this.humanoid!.getPointMeshByName("eye_L");
    if (eyeL) result.push(eyeL);
    const eyeR = this.humanoid!.getPointMeshByName("eye_R");
    if (eyeR) result.push(eyeR);
    const nose = this.humanoid!.getPointMeshByName("nose");
    if (nose) result.push(nose);
    return result;
  }

  applyJerseyNumber(number: number, teamColor: Color3): void {
    if (this._renderMode === 'glb') {
      this._applyGLBJerseyNumber(number, teamColor);
      return;
    }

    const torso = this.humanoid!.getSegmentMeshByName("torso_vis");
    if (!torso) return;

    const scene = this.humanoid!.rootMesh.getScene();
    const plane = MeshBuilder.CreatePlane(
      `jerseyNumber_${number}`,
      { width: 0.28, height: 0.28 },
      scene,
    );
    plane.parent = torso;
    plane.position = new Vector3(0, 0, -0.11);

    this._createJerseyPlane(plane, number, teamColor, scene);
  }

  // ─── 下半身メッシュ（オフセット用） ──────────────────────

  getHipsMesh(): Mesh | null {
    if (this._renderMode === 'glb') {
      return null;
    }
    return this.humanoid!.getPointMeshByName("hips_vis");
  }

  // ─── Dispose ────────────────────────────────────────────

  dispose(): void {
    this._stateIndicator.dispose();
    this._visionCone.dispose();

    if (this._renderMode === 'glb' && this._glbClone) {
      for (const m of this._glbClone.allMeshes) {
        m.dispose();
      }
      if (this._glbClone.hairRootMesh) {
        this._glbClone.hairRootMesh.dispose();
      }
      for (const m of this._glbClone.hairMeshes) {
        m.dispose();
      }
    } else if (this.humanoid) {
      this.humanoid.dispose();
    }

    this._wrapperMesh.dispose();
  }

  // ─── Private helpers ────────────────────────────────────

  /** 頭ボーンのローカルY高さを計算 */
  private computeHeadLocalY(): number {
    if (this._renderMode === 'glb') {
      this._forceGLBWorldMatrixUpdate();
      const headBone = this._adapter.findBone("head");
      const headWorldY = headBone
        ? this._getBoneWorldPosition(headBone).y
        : 1.56;
      return headWorldY - this._wrapperMesh.position.y;
    }
    this._adapter.skeleton.computeAbsoluteMatrices(true);
    const headBone = this._adapter.findBone("head");
    const headWorldY = headBone
      ? headBone.getAbsolutePosition(this._getSkeletonRootMesh()).y
      : 1.56;
    return headWorldY - this._wrapperMesh.position.y;
  }

  /**
   * wrapperMesh のトランスフォームを rootMesh に手動コピーする。
   * Y座標は wrapperMesh（体の中心）から -heightOffset して足元基準にする。
   *
   * GLB: rootMesh は rotationQuaternion を使用（GLB ローダーが設定するため）。
   *   キャラクターの向き（w.rotation.y）と GLB の初期回転を合成する。
   * Procedural: rotation.y を直接設定。
   */
  private syncRootMeshTransform(): void {
    const w = this._wrapperMesh;
    const r = this._getSkeletonRootMesh();
    r.position.x = w.position.x;
    r.position.y = w.position.y - this._heightOffset * w.scaling.y;
    r.position.z = w.position.z;
    r.scaling.copyFrom(w.scaling);

    if (this._renderMode === 'glb' && this._glbInitialRotation) {
      // GLB: キャラクターの向き × GLB 初期回転（通常 RotY(π)）
      const yawQ = Quaternion.FromEulerAngles(0, w.rotation.y, 0);
      r.rotationQuaternion = yawQ.multiply(this._glbInitialRotation);
    } else if (this._renderMode === 'glb') {
      // GLB で初期回転なし（フォールバック）
      r.rotationQuaternion = Quaternion.FromEulerAngles(0, w.rotation.y, 0);
    } else {
      // Procedural: rotation.y を直接設定
      r.rotation.y = w.rotation.y;
    }

    r.computeWorldMatrix(true);

    // GLB: 髪モデルも同期
    if (this._renderMode === 'glb' && this._glbClone?.hairRootMesh) {
      const h = this._glbClone.hairRootMesh;
      h.position.copyFrom(r.position);

      // 髪も rotationQuaternion を使用
      if (r.rotationQuaternion) {
        h.rotationQuaternion = r.rotationQuaternion.clone();
      }

      h.scaling.copyFrom(r.scaling);
      const HAIR_SCALE_RATIO = 96.37 / 209.15;
      h.scaling.scaleInPlace(HAIR_SCALE_RATIO);
      h.computeWorldMatrix(true);
    }
  }

  /** GLB メッシュ全体のカラー変更 */
  private _setGLBColor(r: number, g: number, b: number): void {
    if (!this._glbClone) return;
    const color = new Color3(r, g, b);
    for (const mesh of this._glbClone.allMeshes) {
      if (mesh.material) {
        if (!mesh.material.name.includes("_cloned")) {
          mesh.material = mesh.material.clone(mesh.material.name + "_cloned")!;
        }
        if (mesh.material instanceof StandardMaterial) {
          mesh.material.diffuseColor = color;
        } else if (mesh.material instanceof PBRMaterial) {
          mesh.material.albedoColor = color;
        }
      }
    }
  }

  /** GLB 胴体部分のカラー変更（Ch42_Body メッシュ） */
  private _setGLBBodyColor(r: number, g: number, b: number): void {
    if (!this._glbClone) return;
    const color = new Color3(r, g, b);
    for (const mesh of this._glbClone.allMeshes) {
      const baseName = mesh.name.replace(/_clone_.*$/, "");
      if (baseName === "Ch42_Body" || baseName === "Ch42_body") {
        if (mesh.material) {
          if (!mesh.material.name.includes("_cloned")) {
            mesh.material = mesh.material.clone(mesh.material.name + "_cloned")!;
          }
          if (mesh.material instanceof StandardMaterial) {
            mesh.material.diffuseColor = color;
          } else if (mesh.material instanceof PBRMaterial) {
            mesh.material.albedoColor = color;
          }
        }
      }
    }
  }

  /** GLB モードでの背番号適用 */
  private _applyGLBJerseyNumber(number: number, teamColor: Color3): void {
    if (!this._glbClone) return;

    const scene = this._glbClone.rootMesh.getScene();

    const spine2Bone = this._adapter.findBone("spine2");
    if (!spine2Bone) return;
    const spine2Node = spine2Bone.getTransformNode();
    if (!spine2Node) return;

    const plane = MeshBuilder.CreatePlane(
      `jerseyNumber_${number}`,
      { width: 0.28, height: 0.28 },
      scene,
    );
    plane.parent = spine2Node;
    plane.position = new Vector3(0, 0, -0.11);

    this._createJerseyPlane(plane, number, teamColor, scene);
  }

  /** 背番号テクスチャ+マテリアルを作成（共通ヘルパー） */
  private _createJerseyPlane(plane: Mesh, number: number, teamColor: Color3, scene: Scene): void {
    const texSize = 256;
    const tex = new DynamicTexture(`jerseyTex_${number}`, texSize, scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

    const rr = Math.round(teamColor.r * 255);
    const gg = Math.round(teamColor.g * 255);
    const bb = Math.round(teamColor.b * 255);
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    ctx.fillRect(0, 0, texSize, texSize);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 180px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), texSize / 2, texSize / 2);
    tex.update();

    const mat = new StandardMaterial(`jerseyMat_${number}`, scene);
    mat.diffuseTexture = tex;
    mat.diffuseColor = Color3.White();
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    mat.backFaceCulling = false;
    plane.material = mat;
  }

  private createStateIndicator(scene: Scene, state: CharacterState): Mesh {
    const indicator = MeshBuilder.CreateSphere(
      "state-indicator",
      { diameter: 0.2, segments: 16 },
      scene,
    );
    const material = new StandardMaterial("state-indicator-material", scene);
    const color = CHARACTER_STATE_COLORS[state];
    material.diffuseColor = new Color3(color.r, color.g, color.b);
    material.emissiveColor = new Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
    indicator.material = material;
    return indicator;
  }

  private createVisionCone(
    scene: Scene,
    visionAngle: number,
    visionRange: number,
    state: CharacterState,
  ): Mesh {
    const halfAngleRad = (visionAngle / 2) * (Math.PI / 180);
    const coneRadius = visionRange * Math.tan(halfAngleRad);

    const visionCone = MeshBuilder.CreateCylinder(
      "vision-cone",
      {
        diameterTop: coneRadius * 2,
        diameterBottom: 0,
        height: visionRange,
        tessellation: 16,
      },
      scene,
    );
    visionCone.rotation = new Vector3(Math.PI / 2, 0, 0);

    const material = new StandardMaterial("vision-cone-material", scene);
    const color = CHARACTER_STATE_COLORS[state];
    material.diffuseColor = new Color3(color.r, color.g, color.b);
    material.alpha = 0.15;
    visionCone.material = material;
    visionCone.isVisible = false;

    return visionCone;
  }
}
