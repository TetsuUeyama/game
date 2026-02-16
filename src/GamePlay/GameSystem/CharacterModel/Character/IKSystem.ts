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
import { CharacterMotionConfig } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";
import { findSkeletonBone } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";

/**
 * IKシステム（足IK + 腕IK）
 *
 * Babylon.js 組込み BoneIKController（2ボーンチェーン）を使用。
 *
 * 足IK（自動）:
 * 1. 足ボーン位置からレイキャストで接地点を求める
 * 2. IKターゲットを接地点に設定
 * 3. ヒップ補正: 両足の接地差分に基づいてルートボーンYをオフセット
 *
 * 腕IK（手動）:
 * - setArmTarget() で外部オブジェクトをターゲットに指定
 * - null で解除 → FK姿勢に戻る
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

  // ── 腕IK ──
  private _leftArmIK: BoneIKController | null = null;
  private _rightArmIK: BoneIKController | null = null;
  private _leftArmTarget: TransformNode | null = null;
  private _rightArmTarget: TransformNode | null = null;
  private _leftArmPole: TransformNode | null = null;
  private _rightArmPole: TransformNode | null = null;
  /** 外部から設定された腕IKターゲット（null=IK無効） */
  private _leftArmExternalTarget: TransformNode | null = null;
  private _rightArmExternalTarget: TransformNode | null = null;

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

    // ── 腕IK初期化 ──
    const leftForeArm = findSkeletonBone(skeleton, "leftForeArm");
    const rightForeArm = findSkeletonBone(skeleton, "rightForeArm");

    if (leftForeArm && rightForeArm) {
      this._leftArmTarget = this._createTargetNode("ik_left_arm_target");
      this._rightArmTarget = this._createTargetNode("ik_right_arm_target");
      this._leftArmPole = this._createTargetNode("ik_left_arm_pole");
      this._rightArmPole = this._createTargetNode("ik_right_arm_pole");

      // BoneIKController: bone に ForeArm を渡すと親の Arm を自動検出して2ボーンチェーン
      this._leftArmIK = new BoneIKController(mesh, leftForeArm, {
        targetMesh: this._leftArmTarget,
        poleTargetMesh: this._leftArmPole,
        poleAngle: Math.PI,
        slerpAmount: this._config.ikWeight,
      });

      this._rightArmIK = new BoneIKController(mesh, rightForeArm, {
        targetMesh: this._rightArmTarget,
        poleTargetMesh: this._rightArmPole,
        poleAngle: Math.PI,
        slerpAmount: this._config.ikWeight,
      });
    }
  }

  /**
   * 腕IKターゲットを設定する。
   * @param side "left" | "right"
   * @param target シーン内のTransformNode（ボール等）。null で解除 → FK姿勢に戻る。
   */
  setArmTarget(side: "left" | "right", target: TransformNode | null): void {
    if (side === "left") {
      this._leftArmExternalTarget = target;
    } else {
      this._rightArmExternalTarget = target;
    }
  }

  /**
   * 毎フレーム呼び出し。
   * Blend後・レンダリング前に実行すること。
   * @param speed 現在の移動速度（0=静止）。静止中は足IKをスキップしてFK姿勢を維持する。
   */
  update(speed = 1): void {
    if (!this._skeleton || !this._mesh) {
      return;
    }

    // ── 足IK（移動中のみ） ──
    if (speed >= 0.01 && this._leftIK && this._rightIK) {
      this._updateFootIK();
    }

    // ── 腕IK（ターゲットが設定されている腕のみ） ──
    this._updateArmIK();
  }

  /** 足IKの更新処理 */
  private _updateFootIK(): void {
    const leftFoot = findSkeletonBone(this._skeleton!, "leftFoot");
    const rightFoot = findSkeletonBone(this._skeleton!, "rightFoot");
    if (!leftFoot || !rightFoot) return;

    const mesh = this._mesh!;

    // 各足ボーンの現在ワールド位置を取得
    const leftFootPos = leftFoot.getAbsolutePosition(mesh);
    const rightFootPos = rightFoot.getAbsolutePosition(mesh);

    // レイキャストで接地点を求める
    const leftGround = this._raycastGround(leftFootPos);
    const rightGround = this._raycastGround(rightFootPos);

    // IKターゲットを接地点に設定
    if (this._leftTarget) {
      this._leftTarget.position.copyFrom(leftGround ?? leftFootPos);
    }
    if (this._rightTarget) {
      this._rightTarget.position.copyFrom(rightGround ?? rightFootPos);
    }

    // ポールターゲットを膝の前方に配置（メッシュの前方向）
    const forward = mesh.forward.scale(1.0);
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
      const hipBone = findSkeletonBone(this._skeleton!, "hips");
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

    // 足IK ソルバーを実行
    this._leftIK!.update();
    this._rightIK!.update();
  }

  /** 腕IKの更新処理（ターゲットが設定されている腕のみ実行） */
  private _updateArmIK(): void {
    const mesh = this._mesh;
    if (!mesh) return;

    // 左腕
    if (this._leftArmExternalTarget && this._leftArmIK && this._leftArmTarget && this._leftArmPole) {
      // ターゲット位置を外部オブジェクトから取得
      this._leftArmTarget.position.copyFrom(
        this._leftArmExternalTarget.getAbsolutePosition()
      );
      // ポールターゲット: 肘が後方〜下方に曲がるようメッシュ後方に配置
      const elbowPos = this._leftArmTarget.position.add(new Vector3(0, 0.3, 0));
      const backward = mesh.forward.scale(-1.0);
      this._leftArmPole.position.copyFrom(elbowPos.add(backward));
      this._leftArmIK.update();
    }

    // 右腕
    if (this._rightArmExternalTarget && this._rightArmIK && this._rightArmTarget && this._rightArmPole) {
      this._rightArmTarget.position.copyFrom(
        this._rightArmExternalTarget.getAbsolutePosition()
      );
      const elbowPos = this._rightArmTarget.position.add(new Vector3(0, 0.3, 0));
      const backward = mesh.forward.scale(-1.0);
      this._rightArmPole.position.copyFrom(elbowPos.add(backward));
      this._rightArmIK.update();
    }
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

    this._leftArmTarget?.dispose();
    this._rightArmTarget?.dispose();
    this._leftArmPole?.dispose();
    this._rightArmPole?.dispose();
    this._leftArmIK = null;
    this._rightArmIK = null;
    this._leftArmExternalTarget = null;
    this._rightArmExternalTarget = null;

    this._skeleton = null;
    this._mesh = null;
  }
}
