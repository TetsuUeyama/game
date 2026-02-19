import {
  Scene,
  Skeleton,
  TransformNode,
  AbstractMesh,
  Vector3,
  Quaternion,
  Ray,
  Space,
  BoneIKController,
  MeshBuilder,
} from "@babylonjs/core";
import { CharacterMotionConfig } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";
import { findSkeletonBone } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";

// ── 頭部ルックアット設定 ──
/** 水平方向（Yaw）の最大回転角（ラジアン）±70° */
const LOOK_MAX_YAW = 70 * Math.PI / 180;
/** 垂直方向（Pitch）の最大回転角（ラジアン）±40° */
const LOOK_MAX_PITCH = 40 * Math.PI / 180;
/** ルックアット補間速度（0〜1、大きいほど速い） */
const LOOK_LERP = 0.08;
/** 首への回転配分（残りが頭） */
const NECK_RATIO = 0.6;
/** ルックアット回転の無視閾値（ラジアン） */
const LOOK_EPSILON = 0.001;

// ── 足IK設定 ──
/** 空中時のレイキャスト距離倍率（stepHeight × この値） */
const AIRBORNE_RAY_MULTIPLIER = 10;
/** 接地時のレイキャスト距離倍率 */
const GROUNDED_RAY_MULTIPLIER = 4;
/** ヒップ補正の補間速度 */
const HIP_CORRECTION_LERP = 0.1;

/**
 * IKシステム（足IK + 腕IK + 頭部ルックアットIK）
 *
 * Babylon.js 組込み BoneIKController（2ボーンチェーン）を使用。
 *
 * 足IK（自動）:
 * 1. 足ボーン位置からレイキャストで接地点を求める
 * 2. IKターゲットを接地点に設定
 * 3. ヒップ補正: 接地時のみ、両足の差分でルートボーンYをオフセット
 * 4. 空中: レイキャストで地面を探索し、足が自然に垂れる/着地に備える
 *
 * 腕IK（手動）:
 * - setArmTarget() で外部オブジェクトをターゲットに指定
 * - null で解除 → FK姿勢に戻る
 *
 * 頭部ルックアット（手動）:
 * - setLookAtTarget() でターゲットを指定
 * - 首(60%) + 頭(40%) にYaw/Pitchを加算分配
 * - null で解除 → FK姿勢にスムーズ復帰
 *
 * FK書き込み後に実行すること（IK は FK を上書きするため）。
 */
export class IKSystem {
  private _scene: Scene;
  private _skeleton: Skeleton | null = null;
  private _mesh: AbstractMesh | null = null;
  private _config: CharacterMotionConfig;

  // ── 足IK ──
  private _leftIK: BoneIKController | null = null;
  private _rightIK: BoneIKController | null = null;
  private _leftTarget: TransformNode | null = null;
  private _rightTarget: TransformNode | null = null;
  private _leftPole: TransformNode | null = null;
  private _rightPole: TransformNode | null = null;
  /** ヒップ補正のY累積オフセット */
  private _hipOffset = 0;
  /** ヒップボーンのレストポーズ位置（蓄積防止用） */
  private _hipRestPos: Vector3 | null = null;

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

  // ── 頭部ルックアット ──
  private _lookAtTarget: TransformNode | null = null;
  /** 補間済みのYaw回転量（ラジアン） */
  private _currentLookYaw = 0;
  /** 補間済みのPitch回転量（ラジアン） */
  private _currentLookPitch = 0;

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

    // ── ヒップレスト位置キャッシュ（足IKヒップ補正の蓄積防止用） ──
    const hipBone = findSkeletonBone(skeleton, "hips");
    if (hipBone) {
      this._hipRestPos = new Vector3();
      hipBone.getRestPose().decompose(undefined, undefined, this._hipRestPos);
    }

    // ── 足IK初期化 ──
    const leftLeg = findSkeletonBone(skeleton, "leftLeg");
    const rightLeg = findSkeletonBone(skeleton, "rightLeg");

    if (leftLeg && rightLeg) {
      this._leftTarget = this._createTargetNode("ik_left_target");
      this._rightTarget = this._createTargetNode("ik_right_target");
      this._leftPole = this._createTargetNode("ik_left_pole");
      this._rightPole = this._createTargetNode("ik_right_pole");

      this._leftIK = new BoneIKController(mesh, leftLeg, {
        targetMesh: this._leftTarget,
        poleTargetMesh: this._leftPole,
        poleAngle: 0,
        slerpAmount: this._config.ikWeight,
      });

      this._rightIK = new BoneIKController(mesh, rightLeg, {
        targetMesh: this._rightTarget,
        poleTargetMesh: this._rightPole,
        poleAngle: 0,
        slerpAmount: this._config.ikWeight,
      });
    }

    // ── 腕IK初期化 ──
    const leftForeArm = findSkeletonBone(skeleton, "leftForeArm");
    const rightForeArm = findSkeletonBone(skeleton, "rightForeArm");

    if (leftForeArm && rightForeArm) {
      this._leftArmTarget = this._createTargetNode("ik_left_arm_target");
      this._rightArmTarget = this._createTargetNode("ik_right_arm_target");
      this._leftArmPole = this._createTargetNode("ik_left_arm_pole");
      this._rightArmPole = this._createTargetNode("ik_right_arm_pole");

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

  // ════════════════════════════════════════
  // 公開API
  // ════════════════════════════════════════

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
   * 頭部ルックアットのターゲットを設定する。
   * @param target シーン内のTransformNode（ボール等）。null で解除 → FK姿勢にスムーズ復帰。
   */
  setLookAtTarget(target: TransformNode | null): void {
    this._lookAtTarget = target;
  }

  /**
   * 毎フレーム呼び出し。
   * FK書き込み後・syncSkeletonToMesh前に実行すること。
   * @param airborne 空中にいるか（true: ヒップ補正スキップ、レイキャスト長延長）
   */
  update(airborne: boolean): void {
    if (!this._skeleton || !this._mesh) {
      return;
    }

    // ── 足IK（常時実行） ──
    if (this._leftIK && this._rightIK) {
      this._updateFootIK(airborne);
    }

    // ── 腕IK（ターゲットが設定されている腕のみ） ──
    this._updateArmIK();

    // ── 頭部ルックアット ──
    this._updateHeadIK();
  }

  // ════════════════════════════════════════
  // 足IK
  // ════════════════════════════════════════

  /** 足IKの更新処理 */
  private _updateFootIK(airborne: boolean): void {
    const leftFoot = findSkeletonBone(this._skeleton!, "leftFoot");
    const rightFoot = findSkeletonBone(this._skeleton!, "rightFoot");
    if (!leftFoot || !rightFoot) return;

    const mesh = this._mesh!;

    // 各足ボーンの現在ワールド位置を取得
    const leftFootPos = leftFoot.getAbsolutePosition(mesh);
    const rightFootPos = rightFoot.getAbsolutePosition(mesh);

    // レイキャスト距離: 空中時は長めに（ジャンプの高さをカバー）
    const rayMultiplier = airborne ? AIRBORNE_RAY_MULTIPLIER : GROUNDED_RAY_MULTIPLIER;

    // レイキャストで接地点を求める
    const leftGround = this._raycastGround(leftFootPos, rayMultiplier);
    const rightGround = this._raycastGround(rightFootPos, rayMultiplier);

    // IKターゲットを接地点に設定
    // 空中: 地面が見つかれば足が地面に向かって自然に伸びる
    // 接地: 足が正確に地面に着く
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

    // ヒップ補正: 接地時のみ（空中ではスキップ）
    if (!airborne && leftGround && rightGround) {
      const hipBone = findSkeletonBone(this._skeleton!, "hips");
      if (hipBone && this._hipRestPos) {
        const leftDelta = leftGround.y - leftFootPos.y;
        const rightDelta = rightGround.y - rightFootPos.y;
        const targetOffset = Math.min(leftDelta, rightDelta);

        // 滑らかにオフセットを遷移
        this._hipOffset += (targetOffset - this._hipOffset) * HIP_CORRECTION_LERP;

        // レストポーズ位置を基準にオフセットを適用（蓄積防止）
        // MotionController の setRotationQuaternion(LOCAL) が前フレームの position を
        // 保持するため、getPosition + add だと毎フレーム蓄積してしまう
        hipBone.setPosition(
          new Vector3(this._hipRestPos.x, this._hipRestPos.y + this._hipOffset, this._hipRestPos.z),
          0
        );
      }
    } else if (airborne) {
      // 空中: ヒップオフセットを0に向かって減衰
      this._hipOffset *= (1 - HIP_CORRECTION_LERP);
    }

    // 足IK ソルバーを実行
    this._leftIK!.update();
    this._rightIK!.update();
  }

  /**
   * 上方からレイキャストして接地点を求める。
   * 地面メッシュにヒットしない場合は null を返す。
   */
  private _raycastGround(footPos: Vector3, rayMultiplier: number): Vector3 | null {
    const origin = new Vector3(
      footPos.x,
      footPos.y + this._config.stepHeight,
      footPos.z
    );
    const direction = Vector3.Down();
    const ray = new Ray(origin, direction, this._config.stepHeight * rayMultiplier);

    const hit = this._scene.pickWithRay(ray, (m) => {
      return m.name === "field-ground";
    });

    if (hit?.hit && hit.pickedPoint) {
      return hit.pickedPoint;
    }
    return null;
  }

  // ════════════════════════════════════════
  // 腕IK
  // ════════════════════════════════════════

  /** 腕IKの更新処理（ターゲットが設定されている腕のみ実行） */
  private _updateArmIK(): void {
    const mesh = this._mesh;
    if (!mesh) return;

    // 左腕
    if (this._leftArmExternalTarget && this._leftArmIK && this._leftArmTarget && this._leftArmPole) {
      this._leftArmTarget.position.copyFrom(
        this._leftArmExternalTarget.getAbsolutePosition()
      );
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

  // ════════════════════════════════════════
  // 頭部ルックアットIK
  // ════════════════════════════════════════

  /**
   * 頭部ルックアットの更新処理
   *
   * 仕組み:
   * 1. ターゲットへの方向をキャラクターローカル座標に変換
   * 2. Yaw（水平）とPitch（垂直）を計算
   * 3. 角度制限（±70°/±40°）を適用
   * 4. スムーズ補間でFK姿勢の上に加算
   * 5. 首(60%) + 頭(40%) に分配
   *
   * ターゲットがnullの場合: Yaw/Pitchを0に減衰 → FK姿勢に復帰
   */
  private _updateHeadIK(): void {
    if (!this._skeleton || !this._mesh) return;

    const neckBone = findSkeletonBone(this._skeleton, "neck");
    const headBone = findSkeletonBone(this._skeleton, "head");
    if (!neckBone || !headBone) return;

    if (this._lookAtTarget) {
      // ターゲット方向を計算
      const headWorldPos = headBone.getAbsolutePosition(this._mesh);
      const targetPos = this._lookAtTarget.getAbsolutePosition();
      const direction = targetPos.subtract(headWorldPos);

      // キャラクターのローカル座標系に射影
      const meshForward = this._mesh.forward;
      const meshRight = this._mesh.right;

      const localForward = Vector3.Dot(direction, meshForward);
      const localRight = Vector3.Dot(direction, meshRight);
      const localUp = direction.y;

      // Yaw: 水平方向の回転（右が正）
      let targetYaw = Math.atan2(localRight, Math.max(0.01, localForward));
      // Pitch: 垂直方向の回転（上が正）
      const horizontalDist = Math.sqrt(localForward * localForward + localRight * localRight);
      let targetPitch = Math.atan2(localUp, Math.max(0.01, horizontalDist));

      // ターゲットが後方にある場合はルックアットを無効化（前方180°のみ）
      if (localForward < 0) {
        targetYaw = 0;
        targetPitch = 0;
      }

      // 角度制限
      targetYaw = Math.max(-LOOK_MAX_YAW, Math.min(LOOK_MAX_YAW, targetYaw));
      targetPitch = Math.max(-LOOK_MAX_PITCH, Math.min(LOOK_MAX_PITCH, targetPitch));

      // スムーズ補間
      this._currentLookYaw += (targetYaw - this._currentLookYaw) * LOOK_LERP;
      this._currentLookPitch += (targetPitch - this._currentLookPitch) * LOOK_LERP;
    } else {
      // ターゲットなし: FK姿勢に向かってスムーズ減衰
      this._currentLookYaw *= (1 - LOOK_LERP);
      this._currentLookPitch *= (1 - LOOK_LERP);

      // 十分小さくなったらスキップ
      if (Math.abs(this._currentLookYaw) < LOOK_EPSILON &&
          Math.abs(this._currentLookPitch) < LOOK_EPSILON) {
        return;
      }
    }

    // 首(60%) + 頭(40%) にYaw/Pitchを加算分配
    const neckYaw = this._currentLookYaw * NECK_RATIO;
    const neckPitch = this._currentLookPitch * NECK_RATIO;
    const headYaw = this._currentLookYaw * (1 - NECK_RATIO);
    const headPitch = this._currentLookPitch * (1 - NECK_RATIO);

    // 首・頭: レスト回転をベースにルックアット回転を加算
    // getRotationQuaternionを読み戻すと前フレームの回転が残り毎フレーム蓄積してしまう。
    // 不変のレストポーズを基準にすることで蓄積を防止する。
    const neckRestQuat = new Quaternion();
    neckBone.getRestPose().decompose(undefined, neckRestQuat, undefined);
    const neckLookQuat = Quaternion.FromEulerAngles(-neckPitch, neckYaw, 0);
    neckBone.setRotationQuaternion(neckRestQuat.multiply(neckLookQuat), Space.LOCAL);

    const headRestQuat = new Quaternion();
    headBone.getRestPose().decompose(undefined, headRestQuat, undefined);
    const headLookQuat = Quaternion.FromEulerAngles(-headPitch, headYaw, 0);
    headBone.setRotationQuaternion(headRestQuat.multiply(headLookQuat), Space.LOCAL);
  }

  // ════════════════════════════════════════
  // ユーティリティ
  // ════════════════════════════════════════

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

    this._lookAtTarget = null;

    this._skeleton = null;
    this._mesh = null;
  }
}
