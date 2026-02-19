import {
  Scene,
  Skeleton,
  Bone,
  Vector3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Space,
  DynamicTexture,
} from "@babylonjs/core";
import { createProceduralHumanoid, ProceduralHumanoidResult } from "@/GamePlay/GameSystem/CharacterModel/Character/ProceduralHumanoid";
import { SkeletonAdapter } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonAdapter";
import { CharacterState, CHARACTER_STATE_COLORS } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";

/**
 * 試合モード用のキャラクターモデル。
 * ProceduralHumanoid をラップし、Character.ts が必要とするインターフェースを提供する。
 *
 * FK パイプライン:
 * SkeletonAdapter が実行時にレスト回転をキャプチャし、左右対称補正を計算する。
 * setBoneAnimationRotation() は restQ × correction × eq(offset) × correction⁻¹ で
 * ボーンに書き込み、テストシーン（AnimationFactory）と同一の数学を使用する。
 *
 * 座標系:
 * - _wrapperMesh: Character.ts の mesh として使用。position.y = groundY（体の中心）
 * - humanoid.rootMesh: 親なし（テストシーンと同じ構成）。syncRootMeshTransform() で毎フレーム同期
 * - ビジュアルメッシュ: ワールド空間（親なし）。updateVisuals() でボーン位置に毎フレーム配置
 *
 * データフロー:
 * MotionController → setBoneAnimationRotation() → IK → updateVisuals() → ボーン位置からメッシュ配置
 */
export class MatchCharacterModel {
  private humanoid: ProceduralHumanoidResult;
  private _adapter: SkeletonAdapter;
  private _wrapperMesh: Mesh;
  private _stateIndicator: Mesh;
  private _visionCone: Mesh;
  private _heightOffset: number;
  /** ヒップボーンのレストポーズ位置（IKリセット用） */
  private _hipRestPos: Vector3;

  constructor(
    scene: Scene,
    config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } },
    state: CharacterState,
    position: Vector3,
  ) {
    // ProceduralHumanoid を生成
    this.humanoid = createProceduralHumanoid(scene);

    // SkeletonAdapter を生成（実行時レスト回転キャプチャ + リグ判別 + 左右補正計算）
    this._adapter = new SkeletonAdapter(this.humanoid.skeleton, this.humanoid.rootMesh);

    // ラッパーメッシュを作成（Character.ts の mesh として使用）
    this._wrapperMesh = new Mesh("character_wrapper", scene);
    this._wrapperMesh.position.copyFrom(position);

    // rootMesh は wrapperMesh の子にしない（テストシーンと同じ構成）。
    // BoneIKController が WORLD 空間で回転を書き込むため、親があると計算がずれる。
    this._heightOffset = config.physical.height / 2;

    // ProceduralHumanoid のアニメーションを停止（MotionController で制御するため）
    this.humanoid.idleAnimation.stop();
    this.humanoid.walkAnimation.stop();

    // AnimationGroup 残留を除去（stop() 後も bone.animations に残る）
    for (const bone of this._adapter.skeleton.bones) {
      bone.animations = [];
    }

    // シーン描画ループの skeleton.prepare() を無効化（手動管理のボーン行列を上書き防止）
    this._adapter.skeleton.prepare = () => {};

    // 全ボーンの内部 TRS をレスト回転で初期化（非 FK 駆動ボーン含む）
    this._adapter.initializeAllBones();

    // ヒップボーンのレストポーズ位置をキャッシュ（IK による位置変更を毎フレームリセットするため）
    const hipBone = this._adapter.findBone("hips");
    this._hipRestPos = new Vector3();
    if (hipBone) {
      hipBone.getRestPose().decompose(undefined, undefined, this._hipRestPos);
    }

    // rootMesh のトランスフォームを初期同期
    this.syncRootMeshTransform();

    // レストポーズでの頭ボーン高さを取得（インジケーター配置用）
    this._adapter.skeleton.computeAbsoluteMatrices(true);
    const headBone = this._adapter.findBone("head");
    const headWorldY = headBone
      ? headBone.getAbsolutePosition(this.humanoid.rootMesh).y
      : 1.56;
    const headLocalY = headWorldY - this._wrapperMesh.position.y;

    // 状態インジケーターを作成（wrapper の子 → 自動追従）
    this._stateIndicator = this.createStateIndicator(scene, state);
    this._stateIndicator.parent = this._wrapperMesh;
    this._stateIndicator.position = new Vector3(0, headLocalY + 0.40, 0);

    // 視野コーンを作成（wrapper の子 → Y回転が自動追従）
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

  // ─── Root / Skeleton ────────────────────────────────────

  getRootMesh(): Mesh {
    return this._wrapperMesh;
  }

  getSkeletonMesh(): Mesh {
    return this.humanoid.rootMesh;
  }

  getSkeleton(): Skeleton {
    return this._adapter.skeleton;
  }

  /** SkeletonAdapter を返す（MotionPlayer / テストシーン統合用） */
  getAdapter(): SkeletonAdapter {
    return this._adapter;
  }

  // ─── FK 書き込み ─────────────────────────────────────────

  /**
   * FK回転（アニメーション回転）をボーンに書き込む。
   * SkeletonAdapter 経由で restQ × correction × eq(offset) × correction⁻¹ を適用。
   * テストシーン（AnimationFactory.eulerKeysToQuatKeys）と同一の数学。
   */
  setBoneAnimationRotation(jointName: string, animEuler: Vector3): void {
    this._adapter.applyFKRotationByJoint(jointName, animEuler);
  }

  // ─── フレーム準備 ─────────────────────────────────────

  /**
   * 毎フレーム開始時に呼ぶ。IK が前フレームで変更したヒップ位置をリセットする。
   */
  prepareFrame(): void {
    const hipBone = this._adapter.findBone("hips");
    if (hipBone) {
      hipBone.setPosition(this._hipRestPos, Space.LOCAL);
    }
  }

  // ─── ビジュアル更新 ─────────────────────────────────────

  syncTransform(): void {
    this.syncRootMeshTransform();
  }

  /**
   * ビジュアルメッシュをボーン位置に同期。
   * 呼び出し前に syncTransform() で rootMesh を同期済みであること。
   */
  updateVisuals(): void {
    this.humanoid.updateVisuals();
  }

  // ─── ボーン位置クエリ ────────────────────────────────────

  getFootBonePositions(): { leftY: number; rightY: number } {
    this._adapter.skeleton.computeAbsoluteMatrices(true);
    const lFoot = this._adapter.findBone("leftFoot");
    const rFoot = this._adapter.findBone("rightFoot");
    const root = this.humanoid.rootMesh;
    const leftY = lFoot ? lFoot.getAbsolutePosition(root).y : 0;
    const rightY = rFoot ? rFoot.getAbsolutePosition(root).y : 0;
    return { leftY, rightY };
  }

  getHandBonePosition(side: 'left' | 'right'): Vector3 {
    const bone = this._adapter.findBone(side === 'left' ? "leftHand" : "rightHand");
    if (!bone) return Vector3.Zero();
    return bone.getAbsolutePosition(this.humanoid.rootMesh);
  }

  getWaistBonePosition(): Vector3 {
    const bone = this._adapter.findBone("hips");
    if (!bone) return Vector3.Zero();
    return bone.getAbsolutePosition(this.humanoid.rootMesh);
  }

  getBoneForJoint(jointName: string): Bone | null {
    return this._adapter.findBoneByJointName(jointName);
  }

  // ─── ビジュアル操作 ─────────────────────────────────────

  setColor(r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);
    for (const mesh of this.humanoid.getAllVisualMeshes()) {
      if (mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseColor = color;
      }
    }
  }

  setBodyColor(r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);
    const torso = this.humanoid.getSegmentMeshByName("torso_vis");
    if (torso?.material instanceof StandardMaterial) {
      torso.material.diffuseColor = color;
    }
  }

  getAllVisualMeshes(): Mesh[] {
    return this.humanoid.getAllVisualMeshes();
  }

  hideAllParts(): void {
    for (const mesh of this.humanoid.getAllVisualMeshes()) {
      mesh.isVisible = false;
    }
  }

  setVisible(visible: boolean): void {
    for (const mesh of this.humanoid.getAllVisualMeshes()) {
      mesh.setEnabled(visible);
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
    const result: Mesh[] = [];
    const headMesh = this.humanoid.getPointMeshByName("head_vis");
    if (headMesh) result.push(headMesh);
    const eyeL = this.humanoid.getPointMeshByName("eye_L");
    if (eyeL) result.push(eyeL);
    const eyeR = this.humanoid.getPointMeshByName("eye_R");
    if (eyeR) result.push(eyeR);
    const nose = this.humanoid.getPointMeshByName("nose");
    if (nose) result.push(nose);
    return result;
  }

  applyJerseyNumber(number: number, teamColor: Color3): void {
    const torso = this.humanoid.getSegmentMeshByName("torso_vis");
    if (!torso) return;

    const scene = this.humanoid.rootMesh.getScene();
    const plane = MeshBuilder.CreatePlane(
      `jerseyNumber_${number}`,
      { width: 0.28, height: 0.28 },
      scene,
    );
    plane.parent = torso;
    plane.position = new Vector3(0, 0, -0.11);

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

  // ─── 下半身メッシュ（オフセット用） ──────────────────────

  getHipsMesh(): Mesh | null {
    return this.humanoid.getPointMeshByName("hips_vis");
  }

  // ─── Dispose ────────────────────────────────────────────

  dispose(): void {
    this._stateIndicator.dispose();
    this._visionCone.dispose();
    this.humanoid.dispose();
    this._wrapperMesh.dispose();
  }

  // ─── Private helpers ────────────────────────────────────

  /**
   * wrapperMesh のトランスフォームを rootMesh に手動コピーする。
   * Y座標は wrapperMesh（体の中心）から -heightOffset して足元基準にする。
   */
  private syncRootMeshTransform(): void {
    const w = this._wrapperMesh;
    const r = this.humanoid.rootMesh;
    r.position.x = w.position.x;
    r.position.y = w.position.y - this._heightOffset * w.scaling.y;
    r.position.z = w.position.z;
    r.rotation.y = w.rotation.y;
    r.scaling.copyFrom(w.scaling);
    // ワールド行列を即座に再計算（キャッシュ済み古い行列の参照を防止）
    r.computeWorldMatrix(true);
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
