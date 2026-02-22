import {
  Scene,
  Skeleton,
  Vector3,
  Quaternion,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Color3,
  DynamicTexture,
} from "@babylonjs/core";
import { createProceduralHumanoid, ProceduralHumanoidResult } from "@/GamePlay/GameSystem/CharacterModel/Character/ProceduralHumanoid";
import { SkeletonAdapter } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonAdapter";
import { CharacterState, CHARACTER_STATE_COLORS } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";
import { GLBModelLoader, GLBCloneData, HAIR_SCALE_RATIO } from "@/GamePlay/GameSystem/CharacterModel/Character/GLBModelLoader";

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
  /** GLB __root__ の初期回転（GLTF ハンドネス変換: RotY(180°)） */
  private _glbBaseRotation: Quaternion = Quaternion.Identity();
  /** GLB __root__ の初期スケール（GLTF ハンドネス変換: (1,1,-1)） */
  private _glbBaseScale: Vector3 = new Vector3(1, 1, 1);

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

    // GLB __root__ の初期 transform をキャプチャ（GLTF ハンドネス変換を保持するため）
    // Babylon.js GLTF ローダーは __root__ に RotY(180°) + Scale(1,1,-1) を設定し、
    // 右手系→左手系変換を行う。合成効果は X 軸ミラー（左右反転）。
    // syncRootMeshTransform でこれを維持しないと左右が反転する。
    model._glbBaseRotation = clone.rootMesh.rotationQuaternion?.clone() ?? Quaternion.Identity();
    model._glbBaseScale = clone.rootMesh.scaling.clone();

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

    // GLB ボーンの TransformNode を rest pose で初期化。
    // 目的:
    //   1. rotationQuaternion を確保（MotionPlayer/MotionController が property setter で書き込むため）
    //   2. 全ボーンを FK パイプラインと同じ Q_rest 状態にする。
    //      ゲームモーションには足ボーン等のキーフレームがないため、FK が書き込まない
    //      ボーンは初期値がそのまま残る。GLB クローンの初期値と Q_rest の微妙な差異が
    //      IK 経由で足の向きに影響するのを防ぐ。
    for (const bone of model._adapter.skeleton.bones) {
      const node = bone.getTransformNode();
      if (!node) continue;
      const restQ = model._adapter.getRestQuaternion(bone);
      node.rotationQuaternion = restQ ? restQ.clone() : Quaternion.Identity();
    }
    // bone 内部の _localRotation も初期化（IK の bone API が正確に動作するため）
    model._adapter.initializeAllBones();

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

  /** ヒップボーンのレストポーズ位置を返す（IKSystem 共有用） */
  getHipRestPos(): Vector3 {
    return this._hipRestPos;
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
    this._adapter.forceWorldMatrixUpdate();
    const headBone = this._adapter.findBone("head");
    const headWorldY = headBone
      ? this._adapter.getBoneWorldPosition(headBone).y
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
    const r = this.getSkeletonMesh();
    r.position.x = w.position.x;
    r.position.y = w.position.y - this._heightOffset * w.scaling.y;
    r.position.z = w.position.z;

    if (this._renderMode === 'glb') {
      // GLB: キャラクターの Y 回転と GLTF ハンドネス変換を合成。
      // _glbBaseRotation = RotY(180°)、_glbBaseScale = (1,1,-1) が典型値。
      // 合成効果は X 軸ミラー（右手系→左手系変換）。
      // これを消すと左右が反転するため、必ず保持する。
      const charQ = Quaternion.RotationAxis(Vector3.Up(), w.rotation.y);
      r.rotationQuaternion = charQ.multiply(this._glbBaseRotation);
      r.scaling.x = w.scaling.x * this._glbBaseScale.x;
      r.scaling.y = w.scaling.y * this._glbBaseScale.y;
      r.scaling.z = w.scaling.z * this._glbBaseScale.z;
    } else {
      // Procedural: rotation.y を直接設定
      r.scaling.copyFrom(w.scaling);
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
            mesh.material.diffuseTexture = null;
          } else if (mesh.material instanceof PBRMaterial) {
            mesh.material.albedoColor = color;
            mesh.material.albedoTexture = null;
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
