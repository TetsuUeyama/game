import {
  Scene,
  Skeleton,
  TransformNode,
  AbstractMesh,
  Vector3,
  Ray,
  BoneIKController,
  MeshBuilder,
} from "@babylonjs/core";
import { CharacterMotionConfig } from "../types/CharacterMotionConfig";
import { findSkeletonBone } from "./AnimationFactory";

/**
 * 足IKシステム
 *
 * Babylon.js 組込み BoneIKController（2ボーンチェーン）を使用。
 *
 * 毎フレームの処理:
 * 1. 足ボーン位置からレイキャストで接地点を求める
 * 2. IKターゲットを接地点に設定
 * 3. ヒップ補正: 両足の接地差分に基づいてルートボーンYをオフセット
 *
 * Blend結果の後に実行すること（IK は Blend を上書きするため）。
 */
export class IKSystem {
  private _scene: Scene;
  private _skeleton: Skeleton | null = null;
  private _mesh: AbstractMesh | null = null;
  private _config: CharacterMotionConfig;

  private _leftIK: BoneIKController | null = null;
  private _rightIK: BoneIKController | null = null;

  private _leftTarget: TransformNode | null = null;
  private _rightTarget: TransformNode | null = null;
  private _leftPole: TransformNode | null = null;
  private _rightPole: TransformNode | null = null;

  /** ヒップ補正のY累積オフセット */
  private _hipOffset = 0;

  constructor(scene: Scene, config: CharacterMotionConfig) {
    this._scene = scene;
    this._config = config;
  }

  /**
   * スケルトンとメッシュを受け取り、IKコントローラーを初期化する。
   * GLBロード完了後に呼ぶこと。
   */
  initialize(skeleton: Skeleton, mesh: AbstractMesh): void {
    this._skeleton = skeleton;
    this._mesh = mesh;

    // Rigify DEF ボーンは分割セグメント（DEF-thigh.L → DEF-thigh.L.001 → DEF-shin.L）
    // のため BoneIKController の 2 ボーンチェーンに適合しない。IK をスキップ。
    if (skeleton.bones.some((b) => b.name.startsWith("DEF-"))) {
      return;
    }

    // 論理名でボーンを取得（Mixamo / プロシージャル）
    const leftLeg = findSkeletonBone(skeleton, "leftLeg");
    const rightLeg = findSkeletonBone(skeleton, "rightLeg");

    if (!leftLeg || !rightLeg) {
      console.warn("IKSystem: Could not find leg bones. IK disabled.");
      return;
    }

    // IKターゲット用の不可視ノードを作成
    this._leftTarget = this._createTargetNode("ik_left_target");
    this._rightTarget = this._createTargetNode("ik_right_target");

    // ポールターゲット（膝の前方向を制御）
    this._leftPole = this._createTargetNode("ik_left_pole");
    this._rightPole = this._createTargetNode("ik_right_pole");

    // BoneIKController: bone パラメータに下腿(Leg)を渡すと、
    // 自動的に上腿(UpLeg)を親としての2ボーンIKチェーンになる
    this._leftIK = new BoneIKController(mesh, leftLeg, {
      targetMesh: this._leftTarget,
      poleTargetMesh: this._leftPole,
      poleAngle: Math.PI,
      slerpAmount: this._config.ikWeight,
    });

    this._rightIK = new BoneIKController(mesh, rightLeg, {
      targetMesh: this._rightTarget,
      poleTargetMesh: this._rightPole,
      poleAngle: Math.PI,
      slerpAmount: this._config.ikWeight,
    });
  }

  /**
   * 毎フレーム呼び出し。
   * Blend後・レンダリング前に実行すること。
   */
  update(): void {
    if (!this._skeleton || !this._mesh || !this._leftIK || !this._rightIK) {
      return;
    }

    const leftFoot = findSkeletonBone(this._skeleton, "leftFoot");
    const rightFoot = findSkeletonBone(this._skeleton, "rightFoot");
    if (!leftFoot || !rightFoot) return;

    // 各足ボーンの現在ワールド位置を取得
    const leftFootPos = leftFoot.getAbsolutePosition(this._mesh);
    const rightFootPos = rightFoot.getAbsolutePosition(this._mesh);

    // レイキャストで接地点を求める
    const leftGround = this._raycastGround(leftFootPos);
    const rightGround = this._raycastGround(rightFootPos);

    // IKターゲットを接地点に設定
    if (this._leftTarget) {
      this._leftTarget.position.copyFrom(
        leftGround ?? leftFootPos
      );
    }
    if (this._rightTarget) {
      this._rightTarget.position.copyFrom(
        rightGround ?? rightFootPos
      );
    }

    // ポールターゲットを膝の前方に配置（メッシュの前方向）
    const forward = this._mesh.forward.scale(1.0);
    if (this._leftPole) {
      const leftKneePos = leftFootPos.add(new Vector3(0, 0.5, 0));
      this._leftPole.position.copyFrom(leftKneePos.add(forward));
    }
    if (this._rightPole) {
      const rightKneePos = rightFootPos.add(new Vector3(0, 0.5, 0));
      this._rightPole.position.copyFrom(rightKneePos.add(forward));
    }

    // ヒップ補正: 両足の接地差分に基づいてルートボーンYをオフセット
    if (leftGround && rightGround) {
      const hipBone = findSkeletonBone(this._skeleton, "hips");
      if (hipBone) {
        const leftDelta = leftGround.y - leftFootPos.y;
        const rightDelta = rightGround.y - rightFootPos.y;
        const targetOffset = Math.min(leftDelta, rightDelta);

        // 滑らかにオフセットを遷移
        this._hipOffset += (targetOffset - this._hipOffset) * 0.1;

        const hipPos = hipBone.getPosition(0);
        hipBone.setPosition(
          new Vector3(hipPos.x, hipPos.y + this._hipOffset, hipPos.z),
          0
        );
      }
    }

    // IK ソルバーを実行
    this._leftIK.update();
    this._rightIK.update();
  }

  /**
   * 上方からレイキャストして接地点を求める。
   * 地面メッシュにヒットしない場合は null を返す。
   */
  private _raycastGround(footPos: Vector3): Vector3 | null {
    const origin = new Vector3(
      footPos.x,
      footPos.y + this._config.stepHeight,
      footPos.z
    );
    const direction = Vector3.Down();
    const ray = new Ray(origin, direction, this._config.stepHeight * 4);

    const hit = this._scene.pickWithRay(ray, (mesh) => {
      return mesh.name === "ground";
    });

    if (hit?.hit && hit.pickedPoint) {
      return hit.pickedPoint;
    }
    return null;
  }

  /** IKターゲット用の不可視ノードを作成 */
  private _createTargetNode(name: string): TransformNode {
    const node = MeshBuilder.CreateSphere(
      name,
      { diameter: 0.05 },
      this._scene
    );
    node.isVisible = false;
    return node;
  }

  dispose(): void {
    this._leftTarget?.dispose();
    this._rightTarget?.dispose();
    this._leftPole?.dispose();
    this._rightPole?.dispose();
    this._leftIK = null;
    this._rightIK = null;
    this._skeleton = null;
    this._mesh = null;
  }
}
