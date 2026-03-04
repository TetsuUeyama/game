import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMotionType,
  PhysicsMaterialCombineMode,
  TransformNode,
  Quaternion,
  Matrix,
  Bone,
} from "@babylonjs/core";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Character = any;
import { PhysicsConstants } from "@/GamePlay/Object/Physics/PhysicsConfig";
import { ParabolaUtils } from "@/GamePlay/Object/Physics/Trajectory/ParabolaUtils";
import { DeterministicTrajectory, type Vec3 } from "@/GamePlay/Object/Physics/Trajectory/DeterministicTrajectory";

/**
 * 3Dバスケットボールエンティティ
 * Havok物理エンジンを使用した物理演算
 *
 * 物理特性（NBA規定準拠）:
 * - 重力: 9.81 m/s² (Havokが自動適用)
 * - 反発係数: 0.83 (1.8mから落として約1.25mバウンド)
 * - 質量: 0.62 kg
 * - 摩擦係数: 0.6 (ゴム表面)
 */
export class Ball {
  private scene: Scene;
  public mesh: Mesh;
  private holder: Character | null = null;

  // 物理ボディ
  private physicsAggregate: PhysicsAggregate | null = null;

  // 物理モード管理
  private isKinematicMode: boolean = true;

  // 飛行中の状態管理
  private inFlight: boolean = false;
  private flightTime: number = 0;

  // シューターのクールダウン（tickベース、秒単位）
  private lastShooter: Character | null = null;
  private shooterCooldown: number = 0;
  private static readonly SHOOTER_COOLDOWN_TIME = 3.0;

  // パス送信者のクールダウン（tickベース、秒単位）
  // IMPROVEMENT_PLAN.md: バグ1修正 - スロワーが自分の投げたボールにぶつかる問題
  private lastPasser: Character | null = null;
  private passerCooldown: number = 0;
  private static readonly PASSER_COOLDOWN_TIME = 0.5; // 約30フレーム

  // 弾き後のクールダウン（tickベース、秒単位）
  private deflectionCooldown: number = 0;
  private static readonly DEFLECTION_COOLDOWN_TIME = 0.3;

  // ── ボール保持エリア ──
  // 手のひらの先にある保持ゾーン。IKで手がボールに向かい、
  // 保持エリアがボールに触れた瞬間に保持が成立する。
  /** IKがどうしても届かない場合の安全フォールバック(秒) */
  private static readonly CATCH_SAFETY_TIMEOUT = 0.5;
  /** キャッチ完了の最小時間(秒) — 腕が十分伸びる時間を確保 */
  private static readonly CATCH_MIN_TIME = 0.15;
  /** 腕slerpがこの値以上でキャッチ完了判定 */
  private static readonly CATCH_SLERP_THRESHOLD = 0.85;
  /** プレキャッチ対象（キャッチ中はholderをまだ設定しない） */
  private _preCatchTarget: Character | null = null;
  /** IKで手を伸ばしている最中か（保持エリア到達待ち） */
  private _catching = false;
  /** キャッチ時のボール位置（キャラクター相対オフセット） */
  private _catchOffset = Vector3.Zero();
  /** キャッチ経過時間（安全タイムアウト用） */
  private _catchElapsed = 0;
  /** IKを設定した腕 */
  private _catchArm: 'left' | 'right' | null = null;
  /** IKターゲット用の軽量ノード */
  private _catchTargetNode: TransformNode | null = null;
  /** 腕IKのslerp増加速度(/秒) */
  private static readonly CATCH_SLERP_SPEED = 6.0;
  /** ボール→保持位置への収束速度(/秒) — 遅めにしてIKが手を伸ばす時間を確保 */
  private static readonly CATCH_CONVERGE_SPEED = 1.0;
  /** 体幹調整の補間速度(/秒) */
  private static readonly CATCH_OVERLAY_LERP = 10.0;
  /** 腕slerpの現在値 */
  private _catchSlerp = 0;
  /** 体幹調整: 現在のspine pitch */
  private _currentSpinePitch = 0;
  /** 体幹調整: 現在のspine roll */
  private _currentSpineRoll = 0;

  // 最後にボールに触れた選手
  private lastToucher: Character | null = null;

  // アシスト候補（パスした選手を記録。得点時にアシストとして帰属させる）
  private pendingAssistFrom: Character | null = null;

  // パスのターゲット（キャッチ判定用）
  private passTarget: Character | null = null;

  // バウンスパス用の状態
  private isBouncePass: boolean = false;
  private bouncePassFinalTarget: Vector3 | null = null;
  private hasBounced: boolean = false;

  // カーブパス用の状態
  private curveForce: Vector3 = Vector3.Zero();
  private isCurvePass: boolean = false;

  /**
   * パスターゲットを取得
   */
  public getPassTarget(): Character | null {
    return this.passTarget;
  }

  /**
   * バウンスパスかどうかを取得
   */
  public getIsBouncePass(): boolean {
    return this.isBouncePass;
  }

  /**
   * バウンスパスがバウンド済みかどうかを取得
   */
  public getHasBounced(): boolean {
    return this.hasBounced;
  }

  /**
   * パスターゲットをクリア
   */
  public clearPassTarget(): void {
    // 前のパスターゲットのレシーバーモードを無効化
    if (this.passTarget) {
      this.passTarget.setPassReceiverMode(false);
    }
    this.passTarget = null;
  }

  /**
   * パスターゲットを設定
   * @param target パスの受け手キャラクター
   */
  private setPassTarget(target: Character | null): void {
    // 前のパスターゲットのレシーバーモードを無効化
    if (this.passTarget && this.passTarget !== target) {
      this.passTarget.setPassReceiverMode(false);
    }

    this.passTarget = target;

    // 新しいパスターゲットのレシーバーモードを有効化
    if (target) {
      target.setPassReceiverMode(true);
    }
  }

  // 決定論的軌道計算
  private currentTrajectory: DeterministicTrajectory | null = null;
  private currentTick: number = 0;          // 現在のフレームカウント
  private static readonly FIXED_DT = 1 / 60; // 固定タイムステップ

  // シュートID（決定論的シード生成用）
  private shootCounter: number = 0;

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.mesh = this.createBall(position);
    this.initializePhysics();
  }

  /**
   * ボールメッシュを作成
   */
  private createBall(position: Vector3): Mesh {
    const ball = MeshBuilder.CreateSphere(
      "ball",
      {
        diameter: PhysicsConstants.BALL.RADIUS * 2,
        segments: 32,
      },
      this.scene
    );

    ball.position = position;

    const material = new StandardMaterial("ball-material", this.scene);
    material.diffuseColor = new Color3(1, 0.4, 0);
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    material.emissiveColor = new Color3(0.5, 0.2, 0);
    ball.material = material;

    return ball;
  }

  /**
   * 物理ボディを初期化
   * Havok物理エンジンでボールの物理特性を設定
   */
  private initializePhysics(): void {
    // シーンに物理エンジンが有効化されているか確認
    // Havok物理エンジンは非同期で初期化されるため、後でreinitializePhysics()が呼ばれる
    if (!this.scene.getPhysicsEngine()) {
      return;
    }

    try {
      // PhysicsAggregateを作成（Havok用）
      // 重力はシーンレベルで設定されているため、DYNAMICモードで自動適用される
      this.physicsAggregate = new PhysicsAggregate(
        this.mesh,
        PhysicsShapeType.SPHERE,
        {
          mass: PhysicsConstants.BALL.MASS,           // 0.62kg
          restitution: PhysicsConstants.BALL.RESTITUTION, // 0.83 (NBA規定)
          friction: PhysicsConstants.BALL.FRICTION,   // 0.6
        },
        this.scene
      );

      // マテリアル設定: 反発係数を両オブジェクトの積で計算
      // これにより、リム(0.7) × ボール(0.83) = 0.581 で反発する
      this.physicsAggregate.shape.material = {
        restitution: PhysicsConstants.BALL.RESTITUTION,
        restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
        friction: PhysicsConstants.BALL.FRICTION,
        frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      };

      // ダンピング（空気抵抗・回転減衰）を設定
      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 初期状態はANIMATED（キネマティック）モード
      // 保持されている間は手動で位置を制御
      this.isKinematicMode = true;
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregate.body.disablePreStep = false;

    } catch (error) {
      console.warn("[Ball] Failed to initialize physics:", error);
      this.physicsAggregate = null;
    }
  }

  /**
   * キネマティックモードを設定（物理演算を無効/有効）
   * @param isKinematic true=ANIMATED（手動制御）、false=DYNAMIC（物理エンジン制御）
   */
  private setKinematic(isKinematic: boolean): void {
    this.isKinematicMode = isKinematic;

    if (!this.physicsAggregate) return;

    if (isKinematic) {
      // ANIMATEDモード: メッシュ位置を物理ボディに同期
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.physicsAggregate.body.disablePreStep = false;
    } else {
      // DYNAMICモード: 物理エンジンが位置を制御（重力・衝突が適用される）
      // 重要: disablePreStep = false のまま DYNAMIC に切り替える
      // 速度設定後に finalizeDynamicMode() を呼ぶ必要がある
      this.physicsAggregate.body.disablePreStep = false;
      this.physicsAggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    }
  }

  /**
   * DYNAMICモードの最終化（速度設定後に呼ぶ）
   * 物理エンジンが位置を制御するようにする
   */
  private finalizeDynamicMode(): void {
    if (this.physicsAggregate && !this.isKinematicMode) {
      this.physicsAggregate.body.disablePreStep = true;
    }
  }

  /**
   * 外部から力を加える（継続的な力、例: 風）
   * Havok物理エンジンを使用
   * @param force 力ベクトル（ニュートン）
   * @param point 力を加える点（省略時は重心）
   */
  public applyForce(force: Vector3, point?: Vector3): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for applyForce");
      return;
    }

    // DYNAMICモードでのみ力を適用
    if (!this.isKinematicMode) {
      const applyPoint = point ?? this.physicsAggregate.body.getObjectCenterWorld();
      this.physicsAggregate.body.applyForce(force, applyPoint);
    }
  }

  /**
   * 外部からインパルス（衝撃）を加える（瞬間的な力、例: 衝突、シュート）
   * Havok物理エンジンを使用
   * @param impulse インパルスベクトル（kg·m/s = N·s）
   * @param point インパルスを加える点（省略時は重心）
   */
  public applyImpulse(impulse: Vector3, point?: Vector3): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for applyImpulse");
      return;
    }

    // DYNAMICモードでのみインパルスを適用
    if (!this.isKinematicMode) {
      const applyPoint = point ?? this.physicsAggregate.body.getObjectCenterWorld();
      this.physicsAggregate.body.applyImpulse(impulse, applyPoint);
    }
  }

  /**
   * 角運動量（回転インパルス）を加える
   * @param angularImpulse 角運動量ベクトル（kg·m²/s）
   */
  public applyAngularImpulse(angularImpulse: Vector3): void {
    if (!this.physicsAggregate || this.isKinematicMode) return;

    // 現在の角速度を取得して加算
    const currentAngular = this.physicsAggregate.body.getAngularVelocity();
    const newAngular = currentAngular.add(angularImpulse);
    this.physicsAggregate.body.setAngularVelocity(newAngular);
  }

  /**
   * 物理演算を有効化してダイナミックモードに切り替え
   * 重力・衝突・外部力が適用されるようになる
   */
  public enablePhysics(): void {
    this.setKinematic(false);
  }

  /**
   * 物理演算を無効化してキネマティックモードに切り替え
   * 手動で位置を制御する
   */
  public disablePhysics(): void {
    this.setKinematic(true);
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
      this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
    }
  }

  /**
   * 物理エンジンが有効（DYNAMICモード）かどうか
   */
  public isPhysicsEnabled(): boolean {
    return !this.isKinematicMode;
  }

  /**
   * 位置を取得
   * DYNAMICモードでは物理ボディの位置を返す
   */
  getPosition(): Vector3 {
    // DYNAMICモードで物理ボディがある場合は物理ボディの位置を使用
    if (!this.isKinematicMode && this.physicsAggregate) {
      const transformNode = this.physicsAggregate.transformNode;
      if (transformNode) {
        return transformNode.position.clone();
      }
    }
    return this.mesh.position.clone();
  }

  /**
   * 位置を設定
   * @param position 新しい位置
   * @param resetVelocity 速度をリセットするかどうか（デフォルト: false）
   */
  setPosition(position: Vector3, resetVelocity: boolean = false): void {
    if (this.holder) return;

    const minY = PhysicsConstants.BALL.RADIUS;
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, minY),
      position.z
    );

    this.mesh.position = clampedPosition;

    // 物理ボディの位置も更新
    if (this.physicsAggregate) {
      this.physicsAggregate.body.disablePreStep = false;

      if (resetVelocity) {
        this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
        this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
      }
    }
  }

  /**
   * ボールが保持されているかどうか
   */
  isHeld(): boolean {
    return this.holder !== null || this._preCatchTarget !== null;
  }

  /**
   * IKで手を伸ばしている最中か（保持エリア到達待ち）
   */
  public isCatching(): boolean {
    return this._catching;
  }

  /**
   * キャッチ中のIK解除と状態リセット（shoot/pass等からも呼ばれる）
   */
  private _endCatch(): void {
    // プレキャッチ中なら先にキャンセル
    if (this._preCatchTarget) {
      this._cancelPreCatch();
      return;
    }
    if (!this._catching) return;
    this._catching = false;
    this._catchElapsed = 0;
    this._catchArm = null;
    this._catchSlerp = 0;
    this._currentSpinePitch = 0;
    this._currentSpineRoll = 0;
  }

  /**
   * プレキャッチ完了 → holderを設定してボールを保持位置へ
   */
  private _completeCatch(): void {
    const character = this._preCatchTarget;
    if (!character) return;

    // ルックアット/overlay クリーンアップ
    const ik = character.getIKSystem();
    if (ik) {
      ik.setLookAtTarget(null);
    }
    character.clearCatchBodyOverlay();

    // ここで初めて holder を設定（ゲームロジック上の保持成立）
    this.holder = character;
    this.mesh.position = character.getBallHoldingPosition();

    // プレキャッチ状態をクリア
    this._preCatchTarget = null;
    this._catching = false;
    this._catchElapsed = 0;
    this._catchArm = null;
    this._catchSlerp = 0;
    this._currentSpinePitch = 0;
    this._currentSpineRoll = 0;
  }

  /**
   * プレキャッチをキャンセル（スティール、ボール解放等）
   */
  private _cancelPreCatch(): void {
    const character = this._preCatchTarget;
    if (!character) return;

    const ik = character.getIKSystem();
    if (ik) {
      ik.setLookAtTarget(null);
    }
    character.clearCatchBodyOverlay();

    this._preCatchTarget = null;
    this._catching = false;
    this._catchElapsed = 0;
    this._catchArm = null;
    this._catchSlerp = 0;
    this._currentSpinePitch = 0;
    this._currentSpineRoll = 0;
  }

  /**
   * character.update() の後に呼び出し、プレキャッチ中のキャラクターの腕を
   * ボール方向にワールドスペース直接回転で伸ばす。
   * CatchPoseCheckPanel と同じ手法（FK結果を上書き）。
   */
  applyPreCatchArmOverlay(): void {
    if (!this._preCatchTarget || !this._catching || this._catchSlerp <= 0) return;
    if (!this._catchArm) return;

    const character = this._preCatchTarget;
    const adapter = character.getSkeletonAdapter();
    if (!adapter) return;

    const ballPos = this.mesh.position;
    const isRight = this._catchArm === 'right';

    const upperArmBone = adapter.findBone(isRight ? 'rightArm' : 'leftArm');
    const foreArmBone = adapter.findBone(isRight ? 'rightForeArm' : 'leftForeArm');
    const handBone = adapter.findBone(isRight ? 'rightHand' : 'leftHand');
    const upperArmNode = upperArmBone?.getTransformNode();
    const foreArmNode = foreArmBone?.getTransformNode();
    const handNode = handBone?.getTransformNode();

    if (!upperArmBone || !foreArmBone || !upperArmNode || !foreArmNode) return;

    // ── 肩回転: upperArm → ボール方向 ──
    // cross/dot で計算した回転はワールドスペースなので sign 補正不要
    // （applyWorldRotationToBone の親Q変換が mirror を正しく処理する）
    adapter.forceWorldMatrixUpdate();

    const armWorldPos = upperArmNode.absolutePosition.clone();
    const elbowWorldPos = foreArmNode.absolutePosition.clone();
    const restArmDir = elbowWorldPos.subtract(armWorldPos).normalize();
    const targetDir = ballPos.subtract(armWorldPos).normalize();
    const cross = Vector3.Cross(restArmDir, targetDir);
    const dot = Vector3.Dot(restArmDir, targetDir);

    if (cross.length() > 0.001) {
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      const axis = cross.normalize();
      const worldDeltaQ = Quaternion.RotationAxis(axis, angle * this._catchSlerp);

      const parentBone = upperArmBone.getParent();
      const parentNode = parentBone?.getTransformNode();
      if (parentNode) {
        Ball._applyWorldRotationToBone(upperArmBone, upperArmNode, parentNode, worldDeltaQ);
      }
    }

    // ── 前腕回転: foreArm → ボール方向 ──
    adapter.skeleton.computeAbsoluteMatrices(true);
    adapter.forceWorldMatrixUpdate();

    if (handBone && handNode) {
      const elbowWorldPos2 = foreArmNode.absolutePosition.clone();
      const wristWorldPos = handNode.absolutePosition.clone();
      const restForearmDir = wristWorldPos.subtract(elbowWorldPos2).normalize();
      const targetDir2 = ballPos.subtract(elbowWorldPos2).normalize();
      const cross2 = Vector3.Cross(restForearmDir, targetDir2);
      const dot2 = Vector3.Dot(restForearmDir, targetDir2);

      if (cross2.length() > 0.001) {
        const angle2 = Math.acos(Math.max(-1, Math.min(1, dot2)));
        const axis2 = cross2.normalize();
        const worldDeltaQ2 = Quaternion.RotationAxis(axis2, angle2 * this._catchSlerp);
        Ball._applyWorldRotationToBone(foreArmBone, foreArmNode, upperArmNode, worldDeltaQ2);
      }
    }

    // 最終ワールド行列更新
    adapter.skeleton.computeAbsoluteMatrices(true);
    adapter.forceWorldMatrixUpdate();
  }

  /**
   * ワールドスペース回転をボーンローカルに変換して適用 + bone matrix同期
   */
  private static _applyWorldRotationToBone(
    bone: Bone,
    node: TransformNode,
    parentNode: TransformNode,
    worldDeltaQ: Quaternion,
  ): void {
    const parentWorldQ = new Quaternion();
    parentNode.getWorldMatrix().decompose(undefined, parentWorldQ, undefined);
    const pInv = Quaternion.Inverse(parentWorldQ);
    const localDelta = pInv.multiply(worldDeltaQ).multiply(parentWorldQ);
    const currentQ = node.rotationQuaternion!.clone();
    node.rotationQuaternion = localDelta.multiply(currentQ);
    const mat = Matrix.Compose(node.scaling, node.rotationQuaternion, node.position);
    bone.updateMatrix(mat, false, true);
  }

  /**
   * ボールの保持者を設定
   * @param character 新しい保持者（nullで解放）
   *
   * IKが有効な場合はプレキャッチフェーズを開始:
   * - holderはまだ設定しない（ゲームロジック上は未保持）
   * - ボールは実際の位置に留まり、キャラクターが体を合わせる
   * - 手がボールに届いた時点でholderを設定（保持成立）
   */
  setHolder(character: Character | null): void {
    // 別のキャラクターへ切り替わる場合、進行中のプレキャッチ/キャッチを解除
    if (this._preCatchTarget && this._preCatchTarget !== character) {
      this._cancelPreCatch();
    }
    if (this._catching && this.holder && this.holder !== character) {
      this._endCatch();
    }

    if (character !== null) {
      // 同じキャラクターで既にプレキャッチ中なら何もしない
      if (this._preCatchTarget === character) return;

      this.lastToucher = character;
      // チーム変更時はアシスト候補をクリア（ターンオーバー）
      if (this.pendingAssistFrom && character.team !== this.pendingAssistFrom.team) {
        this.pendingAssistFrom = null;
      }
      // パスターゲットをクリア（レシーバーモードも無効化）
      this.clearPassTarget();
      // バウンスパス状態をリセット
      this.isBouncePass = false;
      this.bouncePassFinalTarget = null;
      this.hasBounced = false;
      // カーブパス状態をリセット
      this.isCurvePass = false;
      this.curveForce = Vector3.Zero();
      // ボールサイズを元に戻す
      this.mesh.scaling = Vector3.One();

      // 飛行停止・キネマティックに切り替え
      this.inFlight = false;
      this.setKinematic(true);
      if (this.physicsAggregate) {
        this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
        this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
      }

      const ik = character.getIKSystem();
      if (ik) {
        // ── プレキャッチ開始: holderはまだ設定しない ──
        this._preCatchTarget = character;
        this._catchArm = character.getCurrentHoldingHand();

        // ボールの実際の位置をそのまま維持（クランプしない）
        const charPos = character.getPosition();
        this._catchOffset.copyFrom(this.mesh.position).subtractInPlace(charPos);

        this._catching = true;
        this._catchElapsed = 0;
        this._catchSlerp = 0;
        this._currentSpinePitch = 0;
        this._currentSpineRoll = 0;

        // IKターゲットノード（頭部ルックアット用）
        if (!this._catchTargetNode) {
          this._catchTargetNode = new TransformNode("ball_catch_target", this.scene);
        }
        this._catchTargetNode.position.copyFrom(this.mesh.position);

        // 頭部ルックアット開始（腕IKはpostUpdate方式で適用）
        ik.setLookAtTarget(this._catchTargetNode);
      } else {
        // IK未初期化 → 即座に保持
        this.holder = character;
        this.mesh.position = character.getBallHoldingPosition();
      }

      if (this.physicsAggregate) {
        this.physicsAggregate.body.disablePreStep = false;
      }
    } else {
      // 解放
      if (this._preCatchTarget) {
        this._cancelPreCatch();
      }
      this.holder = null;
      this._catching = false;
      this._catchElapsed = 0;
      this._catchArm = null;
      this._catchSlerp = 0;
      this._currentSpinePitch = 0;
      this._currentSpineRoll = 0;
    }
  }

  /**
   * ボールの保持者を取得
   */
  getHolder(): Character | null {
    return this.holder;
  }

  /**
   * 更新処理
   * @param _deltaTime フレーム間の経過時間（秒）- 非推奨、tickベースを使用
   *
   * 決定論的更新:
   * - フレームカウント（tick）ベースの時間管理
   * - 固定タイムステップ（FIXED_DT）を使用
   */
  update(_deltaTime: number): void {
    // tickをインクリメント
    this.currentTick++;

    // クールダウン更新（tickベース）
    if (this.shooterCooldown > 0) {
      this.shooterCooldown -= Ball.FIXED_DT;
    }

    // シュータークールダウンの確認（tickベース）
    if (this.lastShooter !== null && this.shooterCooldown <= 0) {
      this.lastShooter = null;
    }

    if (this.deflectionCooldown > 0) {
      this.deflectionCooldown -= Ball.FIXED_DT;
    }

    // パス送信者クールダウン更新（tickベース）
    // IMPROVEMENT_PLAN.md: バグ1修正
    if (this.passerCooldown > 0) {
      this.passerCooldown -= Ball.FIXED_DT;
    }
    if (this.lastPasser !== null && this.passerCooldown <= 0) {
      this.lastPasser = null;
    }

    if (this._preCatchTarget && this._catching) {
      // ── プレキャッチ中: ボールは実位置、キャラクターが体を合わせる ──
      const character = this._preCatchTarget;
      this._catchElapsed += Ball.FIXED_DT;

      // ボールをキャラクター相対で移動に追従
      const charPos = character.getPosition();
      this.mesh.position.copyFrom(charPos).addInPlace(this._catchOffset);

      // ボールを保持位置に向かって徐々に収束（手とボールが出会う）
      const holdPos = character.getBallHoldingPosition();
      const toHold = holdPos.subtract(this.mesh.position);
      this.mesh.position.addInPlace(toHold.scale(Ball.CATCH_CONVERGE_SPEED * Ball.FIXED_DT));
      // 収束後の位置でオフセットを更新
      this._catchOffset.copyFrom(this.mesh.position).subtractInPlace(charPos);

      // IKターゲットをボール位置に設定（手がボールに向かう）
      if (this._catchTargetNode) {
        this._catchTargetNode.position.copyFrom(this.mesh.position);
      }

      // ── 腕slerp徐々に増加（applyPreCatchArmOverlay で使用） ──
      this._catchSlerp = Math.min(this._catchSlerp + Ball.CATCH_SLERP_SPEED * Ball.FIXED_DT, 1.0);

      // ── 体幹調整の目標値を計算 ──
      const ballY = this.mesh.position.y;
      const charY = charPos.y;
      const relHeight = ballY - charY;
      const charHeight = character.config.physical.height;
      const heightRatio = relHeight / charHeight;  // 0=足元, 1.0=頭上

      let targetPitch = 0;
      if (heightRatio > 1.0) {
        targetPitch = -0.15;  // 頭上: 軽い後傾 ~-8°
      } else if (heightRatio > 0.6) {
        targetPitch = 0.08;   // 胸〜肩: わずかな前傾 ~5°
      } else if (heightRatio > 0.3) {
        targetPitch = 0.30;   // 腰〜胸: 前傾 ~17°
      } else if (heightRatio > 0.1) {
        targetPitch = 0.45;   // 膝〜腰: 深い前傾 ~26°
      } else {
        targetPitch = 0.55;   // 地面付近: 最大前傾 ~32°
      }

      // 目標 spine roll（横傾き）
      let targetRoll = 0;
      const charForward = character.getForwardDirection();
      const toBall = this.mesh.position.subtract(charPos);
      toBall.y = 0;
      if (toBall.length() > 0.1) {
        toBall.normalize();
        const cross = charForward.x * toBall.z - charForward.z * toBall.x;
        targetRoll = Math.max(-0.25, Math.min(0.25, cross * 0.5));
      }

      // スムーズ補間
      const lerpRate = Ball.CATCH_OVERLAY_LERP * Ball.FIXED_DT;
      this._currentSpinePitch += (targetPitch - this._currentSpinePitch) * lerpRate;
      this._currentSpineRoll += (targetRoll - this._currentSpineRoll) * lerpRate;

      character.setCatchBodyOverlay({
        spinePitch: this._currentSpinePitch,
        spineRoll: this._currentSpineRoll,
      });

      // ── キャッチ完了判定: 腕IKが十分到達 + 最小時間経過 ──
      if ((this._catchSlerp >= Ball.CATCH_SLERP_THRESHOLD && this._catchElapsed >= Ball.CATCH_MIN_TIME) ||
          this._catchElapsed >= Ball.CATCH_SAFETY_TIMEOUT) {
        this._completeCatch();
      }

      if (this.physicsAggregate) {
        this.physicsAggregate.body.disablePreStep = false;
      }
    } else if (this.holder) {
      // ── 保持中: ボールは保持位置に追従 ──
      this.mesh.position = this.holder.getBallHoldingPosition();

      if (this.physicsAggregate) {
        this.physicsAggregate.body.disablePreStep = false;
      }
    } else if (this.inFlight) {
      // 飛行中の物理処理
      this.flightTime += Ball.FIXED_DT;
      this.updateFlightPhysics();
    } else if (!this.isKinematicMode && this.physicsAggregate) {
      // ルーズボール時（飛行終了後、地面を転がっている状態）
      // 速度が十分小さくなったらキネマティックモードに切り替え
      const velocity = this.physicsAggregate.body.getLinearVelocity();
      const speed = velocity.length();
      if (speed < 0.3) {
        this.setKinematic(true);
        this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
        this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
        // ボールが停止したらパスターゲットをクリア（パス失敗確定）
        this.clearPassTarget();
      }
    }
  }

  /**
   * 飛行中の物理処理
   * Havok物理エンジンが衝突・重力・減衰を自動処理
   */
  private updateFlightPhysics(): void {
    if (!this.physicsAggregate) {
      console.error("[Ball] Havok physics engine required but not available");
      this.inFlight = false;
      this.clearPassTarget();
      return;
    }

    // カーブパスの横力を毎フレーム適用
    if (this.isCurvePass && this.physicsAggregate) {
      const center = this.physicsAggregate.body.getObjectCenterWorld();
      this.physicsAggregate.body.applyForce(this.curveForce, center);
    }

    const velocity = this.physicsAggregate.body.getLinearVelocity();
    const position = this.getPosition();
    const speed = velocity.length();
    const isOnGround = position.y <= PhysicsConstants.BALL.RADIUS + 0.1;

    // バウンスパスの処理: 地面に当たったら第2セグメントの速度を適用
    if (this.isBouncePass && !this.hasBounced && isOnGround && this.bouncePassFinalTarget) {
      this.hasBounced = true;

      // 第2セグメント: バウンド点からレシーバーへの軌道を計算
      const bouncePos = position.clone();
      bouncePos.y = PhysicsConstants.BALL.RADIUS + 0.05; // 床の高さに調整

      const target = this.bouncePassFinalTarget;

      // 水平距離
      const dx = target.x - bouncePos.x;
      const dz = target.z - bouncePos.z;
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

      // 第2セグメント用のアーチ高さ（バウンド後は低め）
      const arcHeight = Math.max(0.3, horizontalDistance * 0.08);

      // 第2セグメントの軌道を計算
      const segment2Trajectory = new DeterministicTrajectory({
        start: { x: bouncePos.x, y: bouncePos.y, z: bouncePos.z },
        target: { x: target.x, y: target.y, z: target.z },
        arcHeight,
        gravity: PhysicsConstants.GRAVITY_MAGNITUDE,
        damping: PhysicsConstants.BALL.LINEAR_DAMPING,
      });

      // 新しい速度を適用
      const newVel = segment2Trajectory.getInitialVelocity();
      this.physicsAggregate.body.setLinearVelocity(new Vector3(newVel.x, newVel.y, newVel.z));
      return;
    }

    // 地面で垂直方向の速度が十分小さい場合は飛行終了
    // 水平方向の転がりは飛行とは見なさない（地面にいれば状態更新が行われる）
    if (isOnGround && Math.abs(velocity.y) < PhysicsConstants.BALL.MIN_BOUNCE_VELOCITY) {
      // バウンスパスでまだバウンドしていない場合は継続
      if (this.isBouncePass && !this.hasBounced) {
        return;
      }

      this.inFlight = false;
      // 注意: ここではpassTargetをクリアしない
      // 理由: ball.update()がcollisionHandler.update()より先に実行されるため、
      // ここでpassTargetをクリアすると、衝突判定でレシーバーがpassTargetとして認識されず、
      // キャッチに失敗する可能性がある。
      // passTargetは以下の場合にクリアされる:
      // - ボールがキャッチされた時（setHolder内）
      // - ボールが完全に停止した時（speed < 0.5でキネマティックモードになる時）
      // - endFlight()が明示的に呼ばれた時
      // - GameSceneでスローイン状態がクリアされた時

      // バウンスパス状態をリセット
      this.isBouncePass = false;
      this.bouncePassFinalTarget = null;
      this.hasBounced = false;
      // カーブパス状態をリセット
      this.isCurvePass = false;
      this.curveForce = Vector3.Zero();
      // 水平方向の速度は維持（転がり続ける）、垂直方向のみ停止
      if (speed < 0.5) {
        // 完全に停止している場合のみキネマティックモードに
        this.setKinematic(true);
        this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
        this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
        // 注意: ここではpassTargetをクリアしない
        // 理由: ball.update()がcollisionHandler.update()より先に実行されるため、
        // ここでpassTargetをクリアすると、BallCatchSystemでレシーバーが
        // キャッチに失敗する可能性がある。
        // passTargetはルーズボール時のupdate()（speed < 0.3）でクリアされる。
      }
    }
  }

  /**
   * シュートを開始
   * @param targetPosition 目標位置
   * @param launchAngle 発射角度（ラジアン）
   * @param overrideStartPosition 開始位置のオーバーライド
   * @param curveValue シューターのcurve値（0-99、バックスピンの強さに影響）
   */
  public shoot(
    targetPosition: Vector3,
    launchAngle: number = Math.PI * 55 / 180,
    overrideStartPosition?: Vector3,
    curveValue: number = 50
  ): boolean {
    if (this.inFlight) return false;

    const previousHolder = this.holder;
    this._endCatch();
    this.holder = null;

    if (previousHolder) {
      this.lastToucher = previousHolder;
    }

    const startPosition = overrideStartPosition
      ? overrideStartPosition.clone()
      : this.mesh.position.clone();

    // メッシュの位置を設定
    this.mesh.position = startPosition.clone();

    // 初速度を計算
    const velocity = this.calculateInitialVelocity(startPosition, targetPosition, launchAngle);

    // バックスピンを計算
    // curve値が高いほど強いバックスピン（5〜25 rad/s）
    const backspinStrength = 5 + (curveValue / 99) * 20;
    const angularVelocity = this.calculateBackspin(startPosition, targetPosition, backspinStrength);

    // Havok物理エンジンが必須
    if (this.physicsAggregate) {
      // 物理ボディを一度破棄して新しい位置で再作成
      this.physicsAggregate.dispose();
      this.mesh.position = startPosition.clone();

      // 新しい物理ボディを作成（DYNAMIC）
      this.physicsAggregate = new PhysicsAggregate(
        this.mesh,
        PhysicsShapeType.SPHERE,
        {
          mass: PhysicsConstants.BALL.MASS,
          restitution: PhysicsConstants.BALL.RESTITUTION,
          friction: PhysicsConstants.BALL.FRICTION,
        },
        this.scene
      );

      // マテリアル設定: 反発係数を両オブジェクトの積で計算
      // これにより、リム(0.7) × ボール(0.83) = 0.581 で反発する
      this.physicsAggregate.shape.material = {
        restitution: PhysicsConstants.BALL.RESTITUTION,
        restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
        friction: PhysicsConstants.BALL.FRICTION,
        frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      };

      // ダンピングを設定
      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 速度を設定
      this.physicsAggregate.body.setLinearVelocity(velocity);
      this.physicsAggregate.body.setAngularVelocity(angularVelocity);

      // 重要: disablePreStep = true で物理エンジンがボールの位置を完全に制御
      // false のままだとメッシュ位置が物理ボディに同期され続け、軌道が正しく計算されない
      this.physicsAggregate.body.disablePreStep = true;

      this.isKinematicMode = false;
    } else {
      // 物理エンジンなしの場合はエラー
      console.error("[Ball] Havok physics engine required for shoot");
      return false;
    }

    this.inFlight = true;
    this.flightTime = 0;

    // クールダウン設定（tickベース）
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME;

    return true;
  }

  /**
   * シュートを開始（アーチ高さベースの放物線計算）
   *
   * 決定論的軌道計算を使用:
   * - BaseTrajectory: 解析解による完全決定的な基準軌道
   * - NoiseLayer: seed付き乱数による揺らぎ（オプション）
   *
   * @param targetPosition 目標位置（リング中央上）
   * @param arcHeight アーチ高さ（直線からの最大高さ、メートル）
   * @param overrideStartPosition 開始位置のオーバーライド
   * @param curveValue シューターのcurve値（0-99、バックスピンの強さに影響）
   * @param radiusAdjust ボール半径の調整値（正の値で小さくなる）
   * @param noiseSeed ノイズのシード（省略時はノイズなし）
   */
  public shootWithArcHeight(
    targetPosition: Vector3,
    arcHeight: number,
    overrideStartPosition?: Vector3,
    curveValue: number = 50,
    radiusAdjust: number = 0,
    noiseSeed?: number
  ): boolean {
    if (this.inFlight) return false;

    const previousHolder = this.holder;
    this._endCatch();
    this.holder = null;

    if (previousHolder) {
      this.lastToucher = previousHolder;
    }

    const startPosition = overrideStartPosition
      ? overrideStartPosition.clone()
      : this.mesh.position.clone();

    // メッシュの位置を設定
    this.mesh.position = startPosition.clone();

    // シュートカウンターをインクリメント（決定論的シード生成用）
    this.shootCounter++;

    // 決定論的軌道を作成
    const startVec3: Vec3 = { x: startPosition.x, y: startPosition.y, z: startPosition.z };
    const targetVec3: Vec3 = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };

    this.currentTrajectory = new DeterministicTrajectory({
      start: startVec3,
      target: targetVec3,
      arcHeight,
      gravity: PhysicsConstants.GRAVITY_MAGNITUDE,
      damping: PhysicsConstants.BALL.LINEAR_DAMPING,
      noiseSeed: noiseSeed,
      noiseAmplitude: noiseSeed !== undefined ? 0.005 : undefined,
    });

    // 決定論的軌道から初速度を取得
    const initialVel = this.currentTrajectory.getInitialVelocity();
    const velocity = new Vector3(initialVel.x, initialVel.y, initialVel.z);

    // バックスピンを計算
    // curve値が高いほど強いバックスピン（5〜25 rad/s）
    const backspinStrength = 5 + (curveValue / 99) * 20;
    const angularVelocity = this.calculateBackspin(startPosition, targetPosition, backspinStrength);

    // Havok物理エンジンが必須
    if (this.physicsAggregate) {
      // 物理ボディを一度破棄して新しい位置で再作成
      this.physicsAggregate.dispose();
      this.mesh.position = startPosition.clone();

      // ボールサイズの調整（選手データに基づく）
      const baseRadius = PhysicsConstants.BALL.RADIUS;
      const adjustedRadius = Math.max(baseRadius - radiusAdjust, baseRadius * 0.5); // 最小で元の50%
      const scale = adjustedRadius / baseRadius;
      this.mesh.scaling = new Vector3(scale, scale, scale);

      // 新しい物理ボディを作成（DYNAMIC）
      this.physicsAggregate = new PhysicsAggregate(
        this.mesh,
        PhysicsShapeType.SPHERE,
        {
          mass: PhysicsConstants.BALL.MASS,
          restitution: PhysicsConstants.BALL.RESTITUTION,
          friction: PhysicsConstants.BALL.FRICTION,
        },
        this.scene
      );

      // マテリアル設定: 反発係数を両オブジェクトの積で計算
      this.physicsAggregate.shape.material = {
        restitution: PhysicsConstants.BALL.RESTITUTION,
        restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
        friction: PhysicsConstants.BALL.FRICTION,
        frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      };

      // ダンピングを設定
      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 速度を設定（Havok物理エンジンが軌道を計算）
      this.physicsAggregate.body.setLinearVelocity(velocity);
      this.physicsAggregate.body.setAngularVelocity(angularVelocity);

      // DYNAMICモード: Havok物理エンジンがボールの位置を制御
      this.physicsAggregate.body.disablePreStep = true;

      this.isKinematicMode = false;
    } else {
      // 物理エンジンなしの場合はエラー
      console.error("[Ball] Havok physics engine required for shoot");
      return false;
    }

    this.inFlight = true;
    this.flightTime = 0;

    // クールダウン設定（tickベース）
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME;

    return true;
  }

  /**
   * バックスピンの角速度を計算
   * シュート方向に対して逆回転（進行方向と逆向きに回転）
   * @param start 開始位置
   * @param target 目標位置
   * @param strength 回転の強さ（rad/s）
   */
  private calculateBackspin(start: Vector3, target: Vector3, strength: number): Vector3 {
    // シュート方向（水平成分のみ）
    const direction = new Vector3(
      target.x - start.x,
      0,
      target.z - start.z
    );

    if (direction.length() < 0.01) {
      // 真上へのシュートの場合、X軸周りのバックスピン
      return new Vector3(-strength, 0, 0);
    }

    direction.normalize();

    // バックスピンの回転軸は進行方向に対して垂直（右手方向）
    // 進行方向が(dx, 0, dz)の場合、回転軸は(-dz, 0, dx)を90度回転
    // バックスピンは進行方向の反対側に回転するので、
    // 回転軸はシュート方向を左に90度回転した方向
    const rotationAxis = new Vector3(-direction.z, 0, direction.x);

    // バックスピンは上から見て時計回りに回転（進行方向に対して後ろ側が上がる）
    // これにより、着地時にボールが後ろに戻る効果がある
    return rotationAxis.scale(strength);
  }

  /**
   * 目標位置に到達するための初速度を計算
   * 放物線公式: v₀² = (g * x²) / (2 * cos²(θ) * (x * tan(θ) - y))
   */
  private calculateInitialVelocity(start: Vector3, target: Vector3, angle: number): Vector3 {
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    const dy = target.y - start.y;

    const g = PhysicsConstants.GRAVITY_MAGNITUDE;
    const tanAngle = Math.tan(angle);
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    // 水平距離がほぼ0の場合（真上にシュート）
    if (horizontalDistance < 0.01) {
      const vVertical = dy > 0 ? Math.sqrt(2 * g * dy) * 1.5 : 5;
      return new Vector3(0, vVertical, 0);
    }

    // 放物線の公式で初速度を計算
    const numerator = g * horizontalDistance * horizontalDistance;
    const denominator = 2 * cosAngle * cosAngle * (horizontalDistance * tanAngle - dy);

    let v0: number;
    if (denominator <= 0) {
      // 分母が負または0の場合、フォールバック計算
      v0 = Math.sqrt(horizontalDistance * horizontalDistance + dy * dy) * 2;
    } else {
      v0 = Math.sqrt(numerator / denominator);
    }

    // NaN/Infinityチェック
    if (!isFinite(v0) || isNaN(v0)) {
      v0 = 10;
    }

    // 速度を成分に分解
    const vHorizontal = v0 * cosAngle;
    const vVertical = v0 * sinAngle;

    // 水平方向の単位ベクトル
    const directionXZ = new Vector3(dx, 0, dz);
    const dirLength = directionXZ.length();
    if (dirLength > 0) {
      directionXZ.scaleInPlace(1 / dirLength);
    }

    const velocity = new Vector3(
      directionXZ.x * vHorizontal,
      vVertical,
      directionXZ.z * vHorizontal
    );

    return velocity;
  }

  /**
   * 飛行中かどうかを取得
   */
  public isInFlight(): boolean {
    return this.inFlight;
  }

  /**
   * 飛行を終了
   * 物理演算を停止し、ANIMATEDモードに切り替え
   */
  public endFlight(): void {
    this.inFlight = false;
    this.setKinematic(true);
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
      this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());
    }
    // パスターゲットをクリア（レシーバーモードも無効化）
    this.clearPassTarget();
    // バウンスパス状態をリセット
    this.isBouncePass = false;
    this.bouncePassFinalTarget = null;
    this.hasBounced = false;
    // カーブパス状態をリセット
    this.isCurvePass = false;
    this.curveForce = Vector3.Zero();
  }

  /**
   * 飛行を開始/再開
   * 物理演算を有効化し、DYNAMICモードに切り替え
   */
  public startFlight(): void {
    this.inFlight = true;
    this.setKinematic(false);
    this.finalizeDynamicMode();
  }

  /**
   * パスを実行（レガシー、低角度計算）
   * @param targetPosition 目標位置
   * @param targetCharacter パス先のキャラクター（ログ用）
   * @deprecated passWithArc を使用してください
   */
  public pass(targetPosition: Vector3, _targetCharacter?: Character, curveDirection: number = 0): boolean {
    // 新しいpassWithArcにリダイレクト
    return this.passWithArc(targetPosition, _targetCharacter, 'chest', curveDirection);
  }

  /**
   * パスを実行（アーチ高さベースの弾道計算）
   * シュートと同様の弾道計算を使用するが、パスに適した低いアーチで飛ぶ
   *
   * @param targetPosition 目標位置（レシーバーの胸の高さ）
   * @param targetCharacter パス先のキャラクター
   * @param passType パスの種類（chest: チェストパス、bounce: バウンドパス、overhead: オーバーヘッド）
   */
  public passWithArc(
    targetPosition: Vector3,
    targetCharacter?: Character,
    passType: 'chest' | 'bounce' | 'overhead' = 'chest',
    curveDirection: number = 0  // -1=左, 0=直線, +1=右
  ): boolean {
    if (!this.holder) return false;
    if (this.inFlight) return false;

    const previousHolder = this.holder;
    this._endCatch();
    this.holder = null;

    if (previousHolder) {
      this.lastToucher = previousHolder;
    }

    // パスターゲットを設定（キャッチ判定で使用、レシーバーモードも有効化）
    this.setPassTarget(targetCharacter ?? null);

    // パサーの胸の高さからスタート
    // キャラクターのposition.yはheight/2にあるため、胸の高さ(height*0.65)までのオフセットはheight*0.15
    const passerHeight = previousHolder.config.physical.height;
    const startPosition = new Vector3(
      previousHolder.getPosition().x,
      previousHolder.getPosition().y + passerHeight * 0.15, // 胸の高さ
      previousHolder.getPosition().z
    );

    // レシーバーの胸の高さを目標に（指定されていなければ引数の位置をそのまま使用）
    let adjustedTargetPosition = targetPosition.clone();
    if (targetCharacter) {
      const receiverHeight = targetCharacter.config.physical.height;
      adjustedTargetPosition = new Vector3(
        targetCharacter.getPosition().x,
        targetCharacter.getPosition().y + receiverHeight * 0.15, // 胸の高さ
        targetCharacter.getPosition().z
      );
    }

    // 水平距離を計算
    const horizontalDistance = ParabolaUtils.getHorizontalDistance(
      { x: startPosition.x, z: startPosition.z },
      { x: adjustedTargetPosition.x, z: adjustedTargetPosition.z }
    );

    // パスタイプに応じたアーチ高さを決定
    let arcHeight: number;
    // バウンスパス用の状態をリセット
    this.isBouncePass = false;
    this.bouncePassFinalTarget = null;
    this.hasBounced = false;

    switch (passType) {
      case 'chest':
        // チェストパス: 距離に応じてアーチ高さを調整（速い球にするため低めに）
        // 短距離（〜5m）: 0.2〜0.4m
        // 中距離（5〜10m）: 0.4〜0.8m
        // 長距離（10m〜）: 0.8〜2.0m（スローイン等で必要）
        if (horizontalDistance <= 5) {
          arcHeight = Math.max(0.2, horizontalDistance * 0.08);
        } else if (horizontalDistance <= 10) {
          arcHeight = 0.4 + (horizontalDistance - 5) * 0.08;
        } else {
          // 長距離: 0.8m + 距離に応じた追加（最大2.0m）
          arcHeight = Math.min(2.0, 0.8 + (horizontalDistance - 10) * 0.12);
        }
        break;
      case 'bounce':
        // バウンドパス: 2セグメント軌道（パサー→バウンド点→レシーバー）
        // 最終目標を保存
        this.bouncePassFinalTarget = adjustedTargetPosition.clone();
        this.isBouncePass = true;
        this.hasBounced = false;

        // バウンド点を計算（中間点の床）
        const bounceX = startPosition.x + (adjustedTargetPosition.x - startPosition.x) * 0.5;
        const bounceZ = startPosition.z + (adjustedTargetPosition.z - startPosition.z) * 0.5;
        adjustedTargetPosition = new Vector3(bounceX, PhysicsConstants.BALL.RADIUS + 0.05, bounceZ);

        // 第1セグメント用のアーチ高さ
        arcHeight = 0.3;
        break;
      case 'overhead':
        // オーバーヘッドパス: 高めのアーチ（長距離対応）
        // 短距離: 0.8〜1.5m
        // 長距離: 1.5〜3.0m
        if (horizontalDistance <= 10) {
          arcHeight = Math.max(0.8, Math.min(1.5, horizontalDistance * 0.15));
        } else {
          arcHeight = Math.min(3.0, 1.5 + (horizontalDistance - 10) * 0.15);
        }
        break;
      default:
        arcHeight = 0.5;
    }

    // メッシュの位置を設定
    this.mesh.position = startPosition.clone();

    // 決定論的軌道を作成
    const startVec3: Vec3 = { x: startPosition.x, y: startPosition.y, z: startPosition.z };
    const targetVec3: Vec3 = { x: adjustedTargetPosition.x, y: adjustedTargetPosition.y, z: adjustedTargetPosition.z };

    this.currentTrajectory = new DeterministicTrajectory({
      start: startVec3,
      target: targetVec3,
      arcHeight,
      gravity: PhysicsConstants.GRAVITY_MAGNITUDE,
      damping: PhysicsConstants.BALL.LINEAR_DAMPING,
    });

    // カーブパス設定
    this.isCurvePass = false;
    this.curveForce = Vector3.Zero();
    let curveCompensation = Vector3.Zero();

    if (curveDirection !== 0 && passType !== 'bounce' && previousHolder.playerData) {
      const curveStat = previousHolder.playerData.stats.curve ?? 50;
      // カーブ力: 1N (curve=0) 〜 8N (curve=99)
      const forceMagnitude = curveDirection * (1 + (curveStat / 100) * 7);

      // パス方向の水平ベクトル
      const passDir = new Vector3(
        adjustedTargetPosition.x - startPosition.x, 0,
        adjustedTargetPosition.z - startPosition.z
      ).normalize();

      // 横方向（右手法則: passDir × Y_up）
      const lateralDir = new Vector3(passDir.z, 0, -passDir.x);

      this.curveForce = lateralDir.scale(forceMagnitude);
      this.isCurvePass = true;

      // 到着地点を合わせるための初速補償
      const T = this.currentTrajectory!.getFlightTime();
      const compensatingSpeed = -0.5 * (forceMagnitude / PhysicsConstants.BALL.MASS) * T;
      curveCompensation = lateralDir.scale(compensatingSpeed);
    }

    // 軌道から初速度を取得
    const initialVel = this.currentTrajectory.getInitialVelocity();
    const velocity = new Vector3(
      initialVel.x + curveCompensation.x,
      initialVel.y,
      initialVel.z + curveCompensation.z
    );

    // Havok物理エンジンを設定
    if (this.physicsAggregate) {
      // 物理ボディを再作成
      this.physicsAggregate.dispose();
      this.mesh.position = startPosition.clone();

      this.physicsAggregate = new PhysicsAggregate(
        this.mesh,
        PhysicsShapeType.SPHERE,
        {
          mass: PhysicsConstants.BALL.MASS,
          restitution: PhysicsConstants.BALL.RESTITUTION,
          friction: PhysicsConstants.BALL.FRICTION,
        },
        this.scene
      );

      this.physicsAggregate.shape.material = {
        restitution: PhysicsConstants.BALL.RESTITUTION,
        restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
        friction: PhysicsConstants.BALL.FRICTION,
        frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      };

      this.physicsAggregate.body.setLinearDamping(PhysicsConstants.BALL.LINEAR_DAMPING);
      this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

      // 速度を設定
      this.physicsAggregate.body.setLinearVelocity(velocity);
      this.physicsAggregate.body.disablePreStep = true;

      this.isKinematicMode = false;
    } else {
      console.error("[Ball] Havok physics engine required for pass");
      return false;
    }

    this.inFlight = true;
    this.flightTime = 0;

    // パサーのクールダウン（シュートより短め）
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME * 0.3;

    // パス送信者を記録（スロワー衝突バグ修正）
    // IMPROVEMENT_PLAN.md: バグ1修正 - パス送信者が自分のボールに当たらないようにする
    this.lastPasser = previousHolder;
    this.passerCooldown = Ball.PASSER_COOLDOWN_TIME;

    // アシスト候補を記録（パスした選手）
    this.pendingAssistFrom = previousHolder;

    return true;
  }

  /**
   * 現在の速度を取得
   * Havok物理エンジンから取得
   */
  public getVelocity(): Vector3 {
    if (this.physicsAggregate && !this.isKinematicMode) {
      return this.physicsAggregate.body.getLinearVelocity();
    }
    // Havok物理エンジンが必須
    return Vector3.Zero();
  }

  /**
   * 速度を設定
   * Havok物理エンジンを使用
   */
  public setVelocity(velocity: Vector3): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for setVelocity");
      return;
    }
    this.physicsAggregate.body.setLinearVelocity(velocity);
  }

  /**
   * 角速度を取得
   */
  public getAngularVelocity(): Vector3 {
    if (this.physicsAggregate && !this.isKinematicMode) {
      return this.physicsAggregate.body.getAngularVelocity();
    }
    return Vector3.Zero();
  }

  /**
   * 角速度を設定
   */
  public setAngularVelocity(angularVelocity: Vector3): void {
    if (this.physicsAggregate) {
      this.physicsAggregate.body.setAngularVelocity(angularVelocity);
    }
  }

  /**
   * ボールの半径を取得
   */
  public getRadius(): number {
    return PhysicsConstants.BALL.RADIUS;
  }

  /**
   * 指定したキャラクターがボールをキャッチできるかどうか
   * 決定論的: tickベースのクールダウン判定
   *
   * IMPROVEMENT_PLAN.md: バグ1修正 - パス送信者（スロワー含む）のクールダウンチェック追加
   */
  public canBeCaughtBy(character: Character): boolean {
    // 弾き後のクールダウン（tickベース）
    if (this.deflectionCooldown > 0) {
      return false;
    }

    // シュータークールダウン（tickベース）
    if (this.lastShooter === character && this.shooterCooldown > 0) {
      return false;
    }

    // パス送信者クールダウン（tickベース）
    // スローイン時のスロワーが自分の投げたボールに当たる問題を防止
    if (this.lastPasser === character && this.passerCooldown > 0) {
      return false;
    }

    return true;
  }

  /**
   * 弾き後のクールダウンを設定（tickベース）
   */
  public setDeflectionCooldown(): void {
    this.deflectionCooldown = Ball.DEFLECTION_COOLDOWN_TIME;
  }

  /**
   * 最後にボールに触れた選手を取得
   */
  public getLastToucher(): Character | null {
    return this.lastToucher;
  }

  /**
   * 最後にボールに触れた選手をリセット
   */
  public clearLastToucher(): void {
    this.lastToucher = null;
  }

  /**
   * アシスト候補（最後にパスした選手）を取得
   */
  public getPendingAssistFrom(): Character | null {
    return this.pendingAssistFrom;
  }

  /**
   * 物理エンジンを再初期化
   * Havokが後から有効になった場合に呼び出す
   */
  public reinitializePhysics(): void {
    // 既存の物理ボディがあれば破棄
    if (this.physicsAggregate) {
      this.physicsAggregate.dispose();
      this.physicsAggregate = null;
    }

    // ボールサイズを元に戻す
    this.mesh.scaling = Vector3.One();

    // 物理エンジンを再初期化
    this.initializePhysics();
  }

  /**
   * ジャンプボール時にボールをチップ（弾く）
   *
   * @param direction チップ方向の単位ベクトル
   * @param force チップの力（m/s単位の速度）
   */
  public tipBall(direction: Vector3, force: number): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for tipBall");
      return;
    }

    // 方向を正規化
    const normalizedDirection = direction.normalize();

    // 速度を設定
    const velocity = normalizedDirection.scale(force);
    this.physicsAggregate.body.setLinearVelocity(velocity);

    // 飛行状態にする
    this.inFlight = true;
    this.flightTime = 0;
    this.setKinematic(false);
    this.physicsAggregate.body.disablePreStep = true;
  }

  /**
   * ジャンプボール用にボールを投げ上げる
   * ボールはセンターサークル中心から真上に投げ上げられる
   *
   * @param position ボール開始位置（センターサークル中心）
   * @param height 投げ上げる高さ（m）
   */
  public tossForJumpBall(position: Vector3, height: number): void {
    if (!this.physicsAggregate) {
      console.warn("[Ball] Havok physics required for tossForJumpBall");
      return;
    }

    // ホルダーをクリア（setPositionが動作するように先にクリア）
    this._endCatch();
    this.holder = null;

    // ボールの位置を正確にセンターに設定（X=0, Z=0）
    const centerPosition = new Vector3(0, position.y, 0);

    // まずキネマティックモードにして位置を確実に設定
    this.setKinematic(true);
    this.physicsAggregate.body.setLinearVelocity(Vector3.Zero());
    this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());

    // メッシュ位置を設定
    this.mesh.position = centerPosition.clone();

    // 物理ボディの位置を同期（disablePreStep = false で次のステップでメッシュに追従）
    this.physicsAggregate.body.disablePreStep = false;

    // ダンピングを設定（空気抵抗による減速を最小化）
    this.physicsAggregate.body.setLinearDamping(0); // ジャンプボール中は減衰なし
    this.physicsAggregate.body.setAngularDamping(PhysicsConstants.BALL.ANGULAR_DAMPING);

    // DYNAMICモードに切り替え
    this.physicsAggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    this.isKinematicMode = false;

    // 投げ上げる速度を計算（v = sqrt(2gh)）
    // 純粋に垂直方向のみ（水平成分なし）
    const tossVelocity = Math.sqrt(2 * PhysicsConstants.GRAVITY_MAGNITUDE * height) * 1.05;

    // 速度を設定（純粋に垂直のみ）
    this.physicsAggregate.body.setLinearVelocity(new Vector3(0, tossVelocity, 0));
    this.physicsAggregate.body.setAngularVelocity(Vector3.Zero());

    // 物理エンジンが位置を制御するようにする
    this.physicsAggregate.body.disablePreStep = true;

    // 飛行状態にする
    this.inFlight = true;
    this.flightTime = 0;
  }

  /**
   * 破棄
   */
  dispose(): void {
    if (this.physicsAggregate) {
      this.physicsAggregate.dispose();
    }
    this._catchTargetNode?.dispose();
    this.mesh.dispose();
  }
}
