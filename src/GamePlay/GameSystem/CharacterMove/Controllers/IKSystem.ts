import {
  Scene,
  Skeleton,
  Bone,
  TransformNode,
  AbstractMesh,
  Vector3,
  Quaternion,
  Matrix,
  Ray,
  Space,
  BoneIKController,
  MeshBuilder,
} from "@babylonjs/core";
import { CharacterMotionConfig } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";
import { findSkeletonBone } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/SkeletonUtils";
import { SkeletonAdapter } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonAdapter";

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
 * IK デッドゾーン（メートル）。
 * FK 足位置と接地点の垂直距離がこの値以下なら IK ウェイト = 0（FK をそのまま保持）。
 * 平らなコートで IK ソルバーが FK ボーン角度を不必要に変更するのを防ぐ。
 */
const IK_DEAD_ZONE = 0.03;
/**
 * IK フルゾーン（メートル）。
 * FK 足位置と接地点の垂直距離がこの値以上なら IK ウェイト = baseWeight（フル補正）。
 * デッドゾーンとフルゾーンの間はリニア補間。
 */
const IK_FULL_ZONE = 0.15;

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
  /**
   * GLB モード: ボーンに TransformNode がリンクされている場合 true。
   * GLB では FK が TransformNode に書き込み、bone._localMatrix は skeleton.prepare() まで
   * 更新されないため、IK 前後で手動同期が必要。
   */
  private _isGLB = false;
  /** SkeletonAdapter（外部から渡された場合、ボーンワールド座標取得に使用） */
  private _adapter: SkeletonAdapter | null = null;

  /** IK が変更したボーンのセット（_syncTransformNodesFromBones で使用） */
  private _modifiedBones: Set<Bone> = new Set();

  /** 足ボーンの FK ローカル回転を保存（IK 後の復元用） */
  private _savedFootLocalQ: { left: Quaternion | null; right: Quaternion | null } = {
    left: null,
    right: null,
  };

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

  // ── キャッシュ済みボーン参照（initialize で設定） ──
  private _hipBone: Bone | null = null;
  private _leftFootBone: Bone | null = null;
  private _rightFootBone: Bone | null = null;
  private _leftLegBone: Bone | null = null;
  private _rightLegBone: Bone | null = null;
  private _leftForeArmBone: Bone | null = null;
  private _rightForeArmBone: Bone | null = null;
  private _neckBone: Bone | null = null;
  private _headBone: Bone | null = null;

  constructor(scene: Scene, config: CharacterMotionConfig) {
    this._scene = scene;
    this._config = config;
  }

  /**
   * スケルトンとメッシュを受け取り、IKコントローラーを初期化する。
   * GLBロード完了後に呼ぶこと。
   */
  initialize(skeleton: Skeleton, mesh: AbstractMesh, hipRestPos?: Vector3, adapter?: SkeletonAdapter): void {
    this._skeleton = skeleton;
    this._mesh = mesh;
    this._adapter = adapter ?? null;

    // GLB 判定: ボーンに TransformNode がリンクされている場合 GLB モード。
    // ProceduralHumanoid のボーンには TransformNode がリンクされていない。
    this._isGLB = skeleton.bones.some((b) => b.getTransformNode() !== null);

    // Rigify DEF ボーンは分割セグメント（DEF-thigh.L → DEF-thigh.L.001 → DEF-shin.L）
    // のため BoneIKController の 2 ボーンチェーンに適合しない。IK をスキップ。
    if (skeleton.bones.some((b) => b.name.startsWith("DEF-"))) {
      return;
    }

    // ── ボーン参照をキャッシュ（毎フレームの検索を排除） ──
    this._hipBone = findSkeletonBone(skeleton, "hips");
    this._leftFootBone = findSkeletonBone(skeleton, "leftFoot");
    this._rightFootBone = findSkeletonBone(skeleton, "rightFoot");
    this._leftLegBone = findSkeletonBone(skeleton, "leftLeg");
    this._rightLegBone = findSkeletonBone(skeleton, "rightLeg");
    this._leftForeArmBone = findSkeletonBone(skeleton, "leftForeArm");
    this._rightForeArmBone = findSkeletonBone(skeleton, "rightForeArm");
    this._neckBone = findSkeletonBone(skeleton, "neck");
    this._headBone = findSkeletonBone(skeleton, "head");

    // ── ヒップレスト位置キャッシュ（足IKヒップ補正の蓄積防止用） ──
    if (hipRestPos) {
      this._hipRestPos = hipRestPos.clone();
    } else if (this._hipBone) {
      this._hipRestPos = new Vector3();
      this._hipBone.getRestPose().decompose(undefined, undefined, this._hipRestPos);
    }

    // ── 足IK初期化 ──
    if (this._leftLegBone && this._rightLegBone) {
      this._leftTarget = this._createTargetNode("ik_left_target");
      this._rightTarget = this._createTargetNode("ik_right_target");
      this._leftPole = this._createTargetNode("ik_left_pole");
      this._rightPole = this._createTargetNode("ik_right_pole");

      this._leftIK = new BoneIKController(mesh, this._leftLegBone, {
        targetMesh: this._leftTarget,
        poleTargetMesh: this._leftPole,
        poleAngle: 0,
        slerpAmount: this._config.ikWeight,
      });

      this._rightIK = new BoneIKController(mesh, this._rightLegBone, {
        targetMesh: this._rightTarget,
        poleTargetMesh: this._rightPole,
        poleAngle: 0,
        slerpAmount: this._config.ikWeight,
      });
    }

    // ── 腕IK初期化 ──
    if (this._leftForeArmBone && this._rightForeArmBone) {
      this._leftArmTarget = this._createTargetNode("ik_left_arm_target");
      this._rightArmTarget = this._createTargetNode("ik_right_arm_target");
      this._leftArmPole = this._createTargetNode("ik_left_arm_pole");
      this._rightArmPole = this._createTargetNode("ik_right_arm_pole");

      this._leftArmIK = new BoneIKController(mesh, this._leftForeArmBone, {
        targetMesh: this._leftArmTarget,
        poleTargetMesh: this._leftArmPole,
        poleAngle: Math.PI,
        slerpAmount: this._config.ikWeight,
      });

      this._rightArmIK = new BoneIKController(mesh, this._rightForeArmBone, {
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

    // IK 変更ボーンのトラッキングをリセット
    this._modifiedBones.clear();

    // GLB: FK は TransformNode に書き込むが bone._localMatrix は未同期。
    // IK 前に bone._localMatrix を TransformNode から同期し、
    // BoneIKController が正確なボーン位置を読めるようにする。
    if (this._isGLB) {
      this._syncBoneMatricesFromTransformNodes();
    }

    // ── 足 FK ローカル回転を保存（IK 後に復元するため） ──
    if (this._isGLB) {
      this._saveFootLocalRotations();
    }

    // ── 足IK（常時実行） ──
    if (this._leftIK && this._rightIK) {
      this._updateFootIK(airborne);
    }

    // ── 腕IK（ターゲットが設定されている腕のみ） ──
    this._updateArmIK();

    // ── 頭部ルックアット ──
    this._updateHeadIK();

    // GLB: IK が bone API 経由で書いた回転/位置を TransformNode に反映。
    // IK が変更したボーンのみ同期する（非 IK ボーンの FK 値を保護するため）。
    if (this._isGLB) {
      this._syncTransformNodesFromBones();
      // 足ボーンの FK ローカル回転を復元（IK が親チェーンを変更しても FK と同一の角度を維持）
      this._restoreFootLocalRotations();
    }
  }

  // ════════════════════════════════════════
  // GLB ボーン同期
  // ════════════════════════════════════════

  /**
   * TransformNode → bone._localMatrix 同期（IK 前に呼ぶ）。
   * FK が TransformNode.rotationQuaternion / position に書き込んだ値を
   * bone._localMatrix に反映し、computeAbsoluteMatrices で正確な位置が得られるようにする。
   */
  private _syncBoneMatricesFromTransformNodes(): void {
    const skeleton = this._skeleton!;
    const mesh = this._mesh!;

    // 全 TransformNode のワールド行列を更新（ルート→リーフ順）
    mesh.computeWorldMatrix(true);
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode();
      if (node) node.computeWorldMatrix(true);
    }

    // TransformNode のローカル変換を bone._localMatrix にコピー
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode();
      if (!node) continue;
      const q = node.rotationQuaternion ?? Quaternion.Identity();
      const p = node.position;
      const s = node.scaling;
      const localMatrix = Matrix.Compose(s, q, p);
      bone.updateMatrix(localMatrix, false, true);
    }

    // 絶対行列を再計算（BoneIKController が bone.getAbsolutePosition() で使用）
    skeleton.computeAbsoluteMatrices(true);
  }

  /**
   * bone._localMatrix → TransformNode 同期（IK 後に呼ぶ）。
   * BoneIKController が bone API 経由で書いた回転/位置変更を TransformNode に反映し、
   * skeleton.prepare()（レンダーループ）で IK 結果が GPU スキニングに適用されるようにする。
   *
   * _modifiedBones に登録されたボーンのみ同期する。
   * IK が変更していないボーン（足ボーン等）は FK が TransformNode に書いた値をそのまま保持し、
   * bone matrix round-trip による値の変化を防ぐ。
   */
  private _syncTransformNodesFromBones(): void {
    for (const bone of this._modifiedBones) {
      const node = bone.getTransformNode();
      if (!node) continue;
      const s = new Vector3();
      const q = new Quaternion();
      const p = new Vector3();
      bone.getLocalMatrix().decompose(s, q, p);
      node.rotationQuaternion = q;
      node.position.copyFrom(p);
    }
  }

  /**
   * 足ボーンの FK ローカル回転を保存する（IK 前に呼ぶ）。
   * IK は太もも・すねを変更するが足ボーン自体は変更しない。
   * しかし _syncTransformNodesFromBones 等の間接的影響を防ぐため、
   * FK が書いたローカル回転を保存して IK 後に復元する。
   * ローカル回転保存により、モーションチェックモード（純粋FK）と同一の足角度を保証する。
   */
  private _saveFootLocalRotations(): void {
    this._savedFootLocalQ.left = this._getNodeLocalRotation(this._leftFootBone);
    this._savedFootLocalQ.right = this._getNodeLocalRotation(this._rightFootBone);
  }

  /**
   * 足ボーンの FK ローカル回転を復元する（IK + sync 後に呼ぶ）。
   * FK が書いたローカル回転をそのまま書き戻すため、
   * ワールド空間の変換ロスが発生しない。
   */
  private _restoreFootLocalRotations(): void {
    if (this._leftFootBone && this._savedFootLocalQ.left) {
      const node = this._leftFootBone.getTransformNode();
      if (node) node.rotationQuaternion = this._savedFootLocalQ.left;
    }
    if (this._rightFootBone && this._savedFootLocalQ.right) {
      const node = this._rightFootBone.getTransformNode();
      if (node) node.rotationQuaternion = this._savedFootLocalQ.right;
    }
  }

  /** TransformNode のローカル回転を取得 */
  private _getNodeLocalRotation(bone: Bone | null): Quaternion | null {
    if (!bone) return null;
    const node = bone.getTransformNode();
    if (!node || !node.rotationQuaternion) return null;
    return node.rotationQuaternion.clone();
  }

  // ════════════════════════════════════════
  // 足IK
  // ════════════════════════════════════════

  /** 足IKの更新処理 */
  private _updateFootIK(airborne: boolean): void {
    if (!this._leftFootBone || !this._rightFootBone) return;

    const mesh = this._mesh!;

    // 各足ボーンの現在ワールド位置を取得（FK 適用後）
    const leftFootPos = this._getBoneWorldPos(this._leftFootBone);
    const rightFootPos = this._getBoneWorldPos(this._rightFootBone);

    // レイキャスト距離: 空中時は長めに（ジャンプの高さをカバー）
    const rayMultiplier = airborne ? AIRBORNE_RAY_MULTIPLIER : GROUNDED_RAY_MULTIPLIER;

    // レイキャストで接地点を求める
    const leftGround = this._raycastGround(leftFootPos, rayMultiplier);
    const rightGround = this._raycastGround(rightFootPos, rayMultiplier);

    // ── 足ごとの IK ウェイト計算 ──
    // FK 足位置と接地点の垂直距離に基づく:
    // - デッドゾーン内 (< IK_DEAD_ZONE): weight=0 → FK をそのまま保持
    // - フルゾーン以上 (> IK_FULL_ZONE): weight=baseWeight → フル IK 補正
    // - 中間: リニア補間
    // - stepHeight 超（スイング脚）: weight=0 → FK 保持
    const heightThreshold = this._config.stepHeight;
    const baseWeight = this._config.ikWeight;

    const leftDist = leftGround ? Math.abs(leftFootPos.y - leftGround.y) : Infinity;
    const rightDist = rightGround ? Math.abs(rightFootPos.y - rightGround.y) : Infinity;

    const leftWeight = leftGround
      ? this._calcIKWeight(leftDist, heightThreshold, baseWeight)
      : 0;
    const rightWeight = rightGround
      ? this._calcIKWeight(rightDist, heightThreshold, baseWeight)
      : 0;

    const leftActive = leftWeight > 0;
    const rightActive = rightWeight > 0;

    // IK が必要な脚のみターゲット・ポール設定＆ソルバー実行
    const forward = mesh.forward;

    if (leftActive && this._leftTarget && this._leftPole) {
      this._leftTarget.position.copyFrom(leftGround!);
      const leftKneePos = leftFootPos.add(new Vector3(0, 0.5, 0));
      this._leftPole.position.copyFrom(leftKneePos.add(forward));
    }
    if (rightActive && this._rightTarget && this._rightPole) {
      this._rightTarget.position.copyFrom(rightGround!);
      const rightKneePos = rightFootPos.add(new Vector3(0, 0.5, 0));
      this._rightPole.position.copyFrom(rightKneePos.add(forward));
    }

    // ヒップ補正: 両足とも IK アクティブな場合のみ
    if (!airborne && leftActive && rightActive && leftGround && rightGround) {
      if (this._hipBone && this._hipRestPos) {
        const leftDelta = leftGround.y - leftFootPos.y;
        const rightDelta = rightGround.y - rightFootPos.y;
        const targetOffset = Math.min(leftDelta, rightDelta);

        this._hipOffset += (targetOffset - this._hipOffset) * HIP_CORRECTION_LERP;

        this._hipBone.setPosition(
          new Vector3(this._hipRestPos.x, this._hipRestPos.y + this._hipOffset, this._hipRestPos.z),
          0
        );
        this._modifiedBones.add(this._hipBone);
      }
    } else {
      this._hipOffset *= (1 - HIP_CORRECTION_LERP);
    }

    // IK ソルバー実行（アクティブな脚のみ）
    if (leftActive) {
      this._leftIK!.slerpAmount = leftWeight;
      this._leftIK!.update();

      if (this._leftLegBone) {
        this._modifiedBones.add(this._leftLegBone);
        const parent = this._leftLegBone.getParent();
        if (parent) this._modifiedBones.add(parent);
      }
    }
    if (rightActive) {
      this._rightIK!.slerpAmount = rightWeight;
      this._rightIK!.update();

      if (this._rightLegBone) {
        this._modifiedBones.add(this._rightLegBone);
        const parent = this._rightLegBone.getParent();
        if (parent) this._modifiedBones.add(parent);
      }
    }
  }

  /**
   * IK ウェイトを計算する。
   * デッドゾーン内は 0、フルゾーン以上は baseWeight、中間はリニア補間。
   * stepHeight 超（スイング脚）は 0。
   */
  private _calcIKWeight(dist: number, heightThreshold: number, baseWeight: number): number {
    if (dist >= heightThreshold) return 0; // スイング脚
    if (dist <= IK_DEAD_ZONE) return 0;    // FK で十分正確
    if (dist >= IK_FULL_ZONE) return baseWeight; // フル補正
    // デッドゾーン〜フルゾーン間のリニア補間
    return ((dist - IK_DEAD_ZONE) / (IK_FULL_ZONE - IK_DEAD_ZONE)) * baseWeight;
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

      if (this._leftForeArmBone) {
        this._modifiedBones.add(this._leftForeArmBone);
        const parent = this._leftForeArmBone.getParent();
        if (parent) this._modifiedBones.add(parent);
      }
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

      if (this._rightForeArmBone) {
        this._modifiedBones.add(this._rightForeArmBone);
        const parent = this._rightForeArmBone.getParent();
        if (parent) this._modifiedBones.add(parent);
      }
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
    if (!this._neckBone || !this._headBone) return;

    if (this._lookAtTarget) {
      // ターゲット方向を計算
      const headWorldPos = this._getBoneWorldPos(this._headBone);
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
    this._neckBone.getRestPose().decompose(undefined, neckRestQuat, undefined);
    const neckLookQuat = Quaternion.FromEulerAngles(-neckPitch, neckYaw, 0);
    this._neckBone.setRotationQuaternion(neckRestQuat.multiply(neckLookQuat), Space.LOCAL);
    this._modifiedBones.add(this._neckBone);

    const headRestQuat = new Quaternion();
    this._headBone.getRestPose().decompose(undefined, headRestQuat, undefined);
    const headLookQuat = Quaternion.FromEulerAngles(-headPitch, headYaw, 0);
    this._headBone.setRotationQuaternion(headRestQuat.multiply(headLookQuat), Space.LOCAL);
    this._modifiedBones.add(this._headBone);
  }

  // ════════════════════════════════════════
  // ユーティリティ
  // ════════════════════════════════════════

  /** ボーンのワールド座標を取得（adapter 経由で GLB/Procedural を自動判別） */
  private _getBoneWorldPos(bone: Bone | null): Vector3 {
    if (!bone) return Vector3.Zero();
    if (this._adapter) return this._adapter.getBoneWorldPosition(bone);
    // adapter なし（テストシーン等）: 従来のフォールバック
    if (this._isGLB) {
      const node = bone.getTransformNode();
      if (node) return node.absolutePosition.clone();
    }
    return bone.getAbsolutePosition(this._mesh!);
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

    this._lookAtTarget = null;

    this._skeleton = null;
    this._mesh = null;
    this._adapter = null;
  }
}
