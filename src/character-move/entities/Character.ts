import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  AbstractMesh,
  LinesMesh,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import { CharacterPhysicsManager } from "./CharacterPhysicsManager";
import { CharacterBlockJumpController } from "./CharacterBlockJumpController";
import { CHARACTER_CONFIG, FIELD_CONFIG } from "../config/gameConfig";
import { MotionController } from "../controllers/MotionController";
import { ActionController } from "../controllers/action/ActionController";
import { MotionData } from "../types/MotionTypes";
import { CharacterState, CHARACTER_STATE_COLORS } from "../types/CharacterState";
import { CharacterConfig, DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { PlayerData } from "../types/PlayerData";
import { FaceConfig, DEFAULT_FACE_CONFIG } from "../types/FaceConfig";
import { OffenseRole, DefenseRole } from "../state/PlayerStateTypes";
import { BallAction, FACE_ACTIONS } from "../types/BallAction";
import { OffenseStrategy, OFFENSE_STRATEGY_FACES } from "../types/OffenseStrategy";
import { CharacterBodyParts } from "./CharacterBodyParts";
import { DirectionCircle } from "./DirectionCircle";
import { DRIBBLE_CONFIG, DribbleUtils } from "../config/DribbleConfig";
import { BalanceController } from "../controllers/BalanceController";
import { DominantHand, HoldingHand, BallHoldingUtils, BALL_HOLDING_CONFIG } from "../config/BallHoldingConfig";
import { getBallHoldingMotion } from "../motion/BallHoldingMotion";
import { AdvantageStatus, AdvantageUtils, ADVANTAGE_CONFIG } from "../config/action/OneOnOneBattleConfig";
import { normalizeAngle, isInFieldOfView2D } from "../utils/CollisionUtils";
import { FieldGridUtils } from "../config/FieldGridConfig";

/**
 * 3Dキャラクターエンティティ
 */
export class Character {
  public scene: Scene;
  public mesh: Mesh; // ルートメッシュ（親メッシュ）
  public model: AbstractMesh | null = null; // 読み込んだ3Dモデル

  // 身体パーツ
  private headMesh: Mesh; // 頭
  private upperBodyMesh: Mesh; // 胴体上半身
  private lowerBodyMesh: Mesh; // 胴体下半身
  private waistJointMesh: Mesh; // 腰関節（上半身と下半身の接続）
  private lowerBodyConnectionMesh: Mesh; // 下半身の接続点（回転可能）
  private leftShoulderMesh: Mesh; // 左肩
  private rightShoulderMesh: Mesh; // 右肩
  private leftUpperArmMesh: Mesh; // 左上腕
  private rightUpperArmMesh: Mesh; // 右上腕
  private leftElbowMesh: Mesh; // 左肘
  private rightElbowMesh: Mesh; // 右肘
  private leftForearmMesh: Mesh; // 左前腕
  private rightForearmMesh: Mesh; // 右前腕
  private leftHandMesh: Mesh; // 左手のひら
  private rightHandMesh: Mesh; // 右手のひら
  private leftHipMesh: Mesh; // 左股関節
  private rightHipMesh: Mesh; // 右股関節
  private leftThighMesh: Mesh; // 左太もも
  private rightThighMesh: Mesh; // 右太もも
  private leftKneeMesh: Mesh; // 左膝
  private rightKneeMesh: Mesh; // 右膝
  private leftShinMesh: Mesh; // 左すね
  private rightShinMesh: Mesh; // 右すね
  private leftFootMesh: Mesh; // 左足
  private rightFootMesh: Mesh; // 右足

  // 顔のパーツ
  private leftEyeMesh: Mesh; // 左目
  private rightEyeMesh: Mesh; // 右目
  private mouthMesh: Mesh; // 口
  private hairMesh: Mesh | null = null; // 髪
  private beardMesh: Mesh | null = null; // 髭

  // 状態インジケーター（頭上の球体）
  private stateIndicator: Mesh;

  // 視野
  private visionConeMesh: Mesh; // 視野コーン（可視化用）
  public visionAngle: number; // 視野角（度）
  public visionRange: number; // 視野範囲（m）

  public position: Vector3; // 位置
  public rotation: number = 0; // Y軸周りの回転（ラジアン）
  public velocity: Vector3 = Vector3.Zero(); // 速度ベクトル

  private groundY: number; // 地面のY座標
  private motionOffsetY: number = 0; // モーションによるY軸オフセット

  // 衝突判定（footCircleRadiusで統一）

  // キャラクターの状態
  private state: CharacterState = CharacterState.BALL_LOST;

  // チーム識別（味方か敵か）
  public team: "ally" | "enemy" = "ally"; // デフォルトは味方チーム

  // キャラクター設定
  public config: CharacterConfig;

  // モーションコントローラー
  private motionController: MotionController;

  // アクションコントローラー
  private actionController: ActionController;

  // 選手データ
  public playerData: PlayerData | null = null;
  public playerPosition: 'PG' | 'SG' | 'SF' | 'PF' | 'C' | null = null;
  public offenseRole: OffenseRole | null = null;
  public defenseRole: DefenseRole | null = null;
  public shotPriority: number | null = null;

  // 名前表示用
  private nameLabel: Mesh | null = null;
  private nameLabelTexture: AdvancedDynamicTexture | null = null;

  // 表示状態
  private isVisible: boolean = true;

  // 足元の円（方向サークル）
  private directionCircle: DirectionCircle;
  private footCircle: LinesMesh | null = null;
  private footCircleRadius: number = 1.0; // 足元の円の半径（初期値1m）

  // 身体パーツファクトリー
  private bodyPartsFactory: CharacterBodyParts;

  // ボール保持位置設定
  private ballHoldingFaces: number[] = [0, 1, 2, 6, 7]; // 使用する8角形の面番号（前方5箇所）
  private currentBallHoldingIndex: number = 0; // 現在のボール保持位置インデックス（0-4）

  // 利き腕・ボール保持関連
  private dominantHand: DominantHand = 'right'; // 利き腕（デフォルトは右）
  private currentHoldingHand: HoldingHand = 'right'; // 現在ボールを持っている手
  private oppositeFrequency: number = 4; // 非利き腕使用頻度（1〜8）
  private oppositeAccuracy: number = 4; // 非利き腕精度（1〜8）

  // 1対1有利/不利状態（GameSceneから更新される）
  private advantageStatus: AdvantageStatus = {
    state: 'neutral',
    difference: 0,
    multiplier: 0,
  };

  // オフェンス戦術
  private offenseStrategy: OffenseStrategy = OffenseStrategy.HIGH_RISK; // デフォルトはハイリスク

  // AI移動制御（1on1バトル中のランダム移動など）
  private aiMovementDirection: Vector3 | null = null; // AI移動方向
  private aiMovementSpeed: number = 0; // AI移動速度
  private aiMovementStartTime: number = 0; // AI移動開始時刻（ミリ秒）
  private aiMovementDelay: number = 0; // AI移動開始までの遅延時間（ミリ秒）

  // 無力化フラグ（1on1勝負で負けた場合など）
  private defeated: boolean = false;

  // ドリブル突破制御
  private isDribbleBreakthrough: boolean = false; // ドリブル突破中かどうか
  private breakthroughDirection: Vector3 | null = null; // 突破方向
  private breakthroughStartTime: number = 0; // 突破開始時刻

  // ブロックジャンプコントローラー
  private blockJumpController: CharacterBlockJumpController;

  // 重心コントローラー
  private balanceController: BalanceController;

  // 移動による重心への影響追跡
  private previousMoveDirection: Vector3 | null = null; // 前回の移動方向
  private previousMoveSpeed: number = 0; // 前回の移動速度
  private lastMoveTime: number = 0; // 最後に移動した時刻（ミリ秒）

  // 重心球の可視化
  private balanceSphereMesh: Mesh | null = null;
  private balanceSphereVisible: boolean = false;

  // 半透明モード
  private isBodyTransparent: boolean = false;
  private originalMaterialAlphas: Map<Mesh, number> = new Map();

  // Havok物理ボディマネージャー
  private physicsManager: CharacterPhysicsManager;

  // スローインスロワー制御
  // スロワーは外枠の固定位置から移動できないが、向きは変更可能
  private isThrowInThrower: boolean = false;
  private throwInFixedPosition: Vector3 | null = null;

  constructor(scene: Scene, position: Vector3, config?: CharacterConfig) {
    this.scene = scene;
    this.position = position.clone();

    // 設定を初期化（指定がなければデフォルト）
    this.config = config || DEFAULT_CHARACTER_CONFIG;

    // 身長に応じて地面のY座標を設定
    this.groundY = this.config.physical.height / 2;

    // 視野設定を初期化
    this.visionAngle = this.config.vision.visionAngle;
    this.visionRange = this.config.vision.visionRange;

    // 身体パーツファクトリーを初期化
    this.bodyPartsFactory = new CharacterBodyParts(scene, this.config, this.state);

    // ルートメッシュを作成（透明な親メッシュ）
    this.mesh = this.bodyPartsFactory.createRootMesh(this.position);

    // 身体パーツを作成（ファクトリーを使用）
    this.headMesh = this.bodyPartsFactory.createHead();
    this.waistJointMesh = this.bodyPartsFactory.createWaistJoint();
    this.upperBodyMesh = this.bodyPartsFactory.createUpperBody();
    this.lowerBodyConnectionMesh = this.bodyPartsFactory.createLowerBodyConnection();
    this.lowerBodyMesh = this.bodyPartsFactory.createLowerBody();
    this.leftShoulderMesh = this.bodyPartsFactory.createShoulder("left");
    this.rightShoulderMesh = this.bodyPartsFactory.createShoulder("right");
    this.leftUpperArmMesh = this.bodyPartsFactory.createUpperArm("left");
    this.rightUpperArmMesh = this.bodyPartsFactory.createUpperArm("right");
    this.leftElbowMesh = this.bodyPartsFactory.createElbow("left");
    this.rightElbowMesh = this.bodyPartsFactory.createElbow("right");
    this.leftForearmMesh = this.bodyPartsFactory.createForearm("left");
    this.rightForearmMesh = this.bodyPartsFactory.createForearm("right");
    this.leftHandMesh = this.bodyPartsFactory.createHand("left");
    this.rightHandMesh = this.bodyPartsFactory.createHand("right");
    this.leftHipMesh = this.bodyPartsFactory.createHip("left");
    this.rightHipMesh = this.bodyPartsFactory.createHip("right");
    this.leftThighMesh = this.bodyPartsFactory.createThigh("left");
    this.rightThighMesh = this.bodyPartsFactory.createThigh("right");
    this.leftKneeMesh = this.bodyPartsFactory.createKnee("left");
    this.rightKneeMesh = this.bodyPartsFactory.createKnee("right");
    this.leftShinMesh = this.bodyPartsFactory.createShin("left");
    this.rightShinMesh = this.bodyPartsFactory.createShin("right");
    this.leftFootMesh = this.bodyPartsFactory.createFoot("left");
    this.rightFootMesh = this.bodyPartsFactory.createFoot("right");

    // 顔のパーツを作成（ファクトリーを使用）
    this.leftEyeMesh = this.bodyPartsFactory.createEye("left");
    this.rightEyeMesh = this.bodyPartsFactory.createEye("right");
    this.mouthMesh = this.bodyPartsFactory.createMouth();

    // パーツの親子関係を設定
    // 腰関節はルートの子（接続位置、固定）
    this.waistJointMesh.parent = this.mesh;

    // 上半身は腰関節の子（腰関節を回転すると上半身全体が回転）
    this.upperBodyMesh.parent = this.waistJointMesh;

    // 下半身の接続点もルートの子（上半身とは独立してY回転可能）
    this.lowerBodyConnectionMesh.parent = this.mesh;

    // 下半身ボックスは接続点の子（ローカルXでオフセット）
    this.lowerBodyMesh.parent = this.lowerBodyConnectionMesh;

    // 頭：上半身に固定
    this.headMesh.parent = this.upperBodyMesh;

    // 顔のパーツ：頭に固定
    this.leftEyeMesh.parent = this.headMesh;
    this.rightEyeMesh.parent = this.headMesh;
    this.mouthMesh.parent = this.headMesh;

    // 左腕：肩を上半身に固定し、肩を基点とした階層構造
    this.leftShoulderMesh.parent = this.upperBodyMesh; // 上半身の子
    this.leftUpperArmMesh.parent = this.leftShoulderMesh; // 肩の子
    this.leftElbowMesh.parent = this.leftShoulderMesh; // 肩の子
    this.leftForearmMesh.parent = this.leftElbowMesh; // 肘の子
    this.leftHandMesh.parent = this.leftForearmMesh; // 前腕の子

    // 右腕：肩を上半身に固定し、肩を基点とした階層構造
    this.rightShoulderMesh.parent = this.upperBodyMesh; // 上半身の子
    this.rightUpperArmMesh.parent = this.rightShoulderMesh; // 肩の子
    this.rightElbowMesh.parent = this.rightShoulderMesh; // 肩の子
    this.rightForearmMesh.parent = this.rightElbowMesh; // 肘の子
    this.rightHandMesh.parent = this.rightForearmMesh; // 前腕の子

    // 左脚：股関節を下半身に固定し、股関節を基点とした階層構造
    this.leftHipMesh.parent = this.lowerBodyMesh; // 下半身の子
    this.leftThighMesh.parent = this.leftHipMesh; // 股関節の子
    this.leftKneeMesh.parent = this.leftHipMesh; // 股関節の子
    this.leftShinMesh.parent = this.leftKneeMesh; // 膝の子
    this.leftFootMesh.parent = this.leftShinMesh; // すねの子

    // 右脚：股関節を下半身に固定し、股関節を基点とした階層構造
    this.rightHipMesh.parent = this.lowerBodyMesh; // 下半身の子
    this.rightThighMesh.parent = this.rightHipMesh; // 股関節の子
    this.rightKneeMesh.parent = this.rightHipMesh; // 股関節の子
    this.rightShinMesh.parent = this.rightKneeMesh; // 膝の子
    this.rightFootMesh.parent = this.rightShinMesh; // すねの子

    // 状態インジケーター球体を作成（ファクトリーを使用）
    this.stateIndicator = this.bodyPartsFactory.createStateIndicator();
    this.stateIndicator.parent = this.headMesh;

    // 視野コーンを作成（ファクトリーを使用）
    this.visionConeMesh = this.bodyPartsFactory.createVisionCone();
    this.visionConeMesh.parent = this.headMesh;

    // 方向サークルを初期化（8方向ごとに異なる半径を設定）
    this.directionCircle = new DirectionCircle(
      scene,
      () => this.getPosition(),
      () => this.getRotation(),
      [1.0, 0.9, 0.8, 0.6, 0.3, 0.6, 0.8, 0.9]
    );

    // 足元の円を作成（DirectionCircleを使用）
    this.footCircle = this.directionCircle.createFootCircle();

    // 足元の円の色分けセグメントを作成
    this.directionCircle.createFootCircleFaceSegments();

    // モーションコントローラーを初期化
    this.motionController = new MotionController(this);

    // アクションコントローラーを初期化
    this.actionController = new ActionController(this);

    // 重心コントローラーを初期化
    this.balanceController = new BalanceController();
    this.balanceController.setPlayerData(
      this.config.physical.weight,
      this.config.physical.height
    );

    // アクションコントローラーに重心コントローラーを設定
    this.actionController.setBalanceController(this.balanceController);

    // 物理マネージャーを初期化
    this.physicsManager = new CharacterPhysicsManager(scene, this.team, this.config);

    // ブロックジャンプコントローラーを初期化
    this.blockJumpController = new CharacterBlockJumpController();
  }

  /**
   * 3Dモデルを設定
   * @param model ロードした3Dモデル
   */
  public setModel(model: AbstractMesh): void {
    // 既存の身体パーツを非表示に
    this.headMesh.isVisible = false;
    this.leftEyeMesh.isVisible = false;
    this.rightEyeMesh.isVisible = false;
    this.mouthMesh.isVisible = false;
    this.upperBodyMesh.isVisible = false;
    this.lowerBodyMesh.isVisible = false;
    this.waistJointMesh.isVisible = false;
    this.leftShoulderMesh.isVisible = false;
    this.rightShoulderMesh.isVisible = false;
    this.leftUpperArmMesh.isVisible = false;
    this.rightUpperArmMesh.isVisible = false;
    this.leftElbowMesh.isVisible = false;
    this.rightElbowMesh.isVisible = false;
    this.leftForearmMesh.isVisible = false;
    this.rightForearmMesh.isVisible = false;
    this.leftHandMesh.isVisible = false;
    this.rightHandMesh.isVisible = false;
    this.leftHipMesh.isVisible = false;
    this.rightHipMesh.isVisible = false;
    this.leftThighMesh.isVisible = false;
    this.rightThighMesh.isVisible = false;
    this.leftKneeMesh.isVisible = false;
    this.rightKneeMesh.isVisible = false;
    this.leftShinMesh.isVisible = false;
    this.rightShinMesh.isVisible = false;
    this.leftFootMesh.isVisible = false;
    this.rightFootMesh.isVisible = false;

    // モデルをルートメッシュの子として追加
    this.model = model;
    this.model.parent = this.mesh;

    // モデルの位置をルートメッシュの中心に配置
    // （3Dモデルの原点がキャラクターの足元にある場合は調整が必要）
    this.model.position = new Vector3(0, -CHARACTER_CONFIG.height / 2, 0);
  }

  /**
   * 下半身ボックスメッシュを取得（オフセット調整用）
   */
  public getLowerBodyMesh(): Mesh {
    return this.lowerBodyMesh;
  }

  /**
   * 関節メッシュを取得
   */
  public getJoint(jointName: string): Mesh | null {
    switch (jointName) {
      case "head":
        return this.headMesh;
      case "upperBody":
        // 上半身を動かす = 腰関節を回転させる
        return this.waistJointMesh;
      case "lowerBody":
        // 下半身を動かす = 接続点を回転させる
        return this.lowerBodyConnectionMesh;
      case "leftShoulder":
        return this.leftShoulderMesh;
      case "rightShoulder":
        return this.rightShoulderMesh;
      case "leftElbow":
        return this.leftElbowMesh;
      case "rightElbow":
        return this.rightElbowMesh;
      case "leftHip":
        return this.leftHipMesh;
      case "rightHip":
        return this.rightHipMesh;
      case "leftKnee":
        return this.leftKneeMesh;
      case "rightKnee":
        return this.rightKneeMesh;
      default:
        return null;
    }
  }

  /**
   * 顔のメッシュ（頭・目・口）を取得（キャプチャ用）
   * stateIndicator, visionCone は除外
   */
  public getFaceMeshes(): Mesh[] {
    const meshes: Mesh[] = [this.headMesh];
    for (const child of this.headMesh.getChildMeshes(false)) {
      if (child.name.includes('eye') || child.name.includes('mouth') ||
          child.name.includes('hair') || child.name.includes('beard')) {
        meshes.push(child as Mesh);
      }
    }
    return meshes;
  }

  /**
   * 頭上の状態インジケーターメッシュを取得
   */
  public getStateIndicator(): Mesh {
    return this.stateIndicator;
  }

  /**
   * 視野コーンメッシュを取得
   */
  public getVisionCone(): Mesh {
    return this.visionConeMesh;
  }

  /**
   * 位置を取得（モーションオフセットを除いた基準位置）
   */
  public getPosition(): Vector3 {
    return this.position.clone();
  }

  /**
   * ビジュアル位置を取得（モーションオフセットを含む実際の位置）
   * ジャンプ中の実際の高さを取得したい場合に使用
   */
  public getVisualPosition(): Vector3 {
    return new Vector3(
      this.position.x,
      this.position.y + this.motionOffsetY,
      this.position.z
    );
  }

  /**
   * 現在のモーションオフセットYを取得
   */
  public getMotionOffsetY(): number {
    return this.motionOffsetY;
  }

  /**
   * 位置を設定
   * @param position 設定する位置
   * @param skipBoundaryClamp trueの場合、フィールド境界へのクランプをスキップ（スローイン時など）
   */
  public setPosition(position: Vector3, skipBoundaryClamp: boolean = false): void {
    // Y座標が地面より下にならないように制限
    let clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, this.groundY),
      position.z
    );

    // フィールド境界内にクランプ（スキップオプションがない場合のみ）
    if (!skipBoundaryClamp) {
      clampedPosition = this.clampToFieldBoundary(clampedPosition);
    }

    // モーションオフセットを加算してメッシュ位置を設定
    this.mesh.position = new Vector3(
      clampedPosition.x,
      clampedPosition.y + this.motionOffsetY,
      clampedPosition.z
    );
    this.position = clampedPosition;
  }

  /**
   * 位置をフィールド境界内にクランプ
   * コート外に出ないように制約する（A列〜O列、1行目〜30行目）
   */
  private clampToFieldBoundary(position: Vector3): Vector3 {
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 15m
    const margin = 0.3; // 境界からのマージン（キャラクターの半径分）

    // 境界値を計算
    const minX = -halfWidth + margin;   // -7.2m (A列の内側)
    const maxX = halfWidth - margin;    // 7.2m (O列の内側)
    const minZ = -halfLength + margin;  // -14.7m (1行目の内側)
    const maxZ = halfLength - margin;   // 14.7m (30行目の内側)

    // 位置をクランプ
    const clampedX = Math.max(minX, Math.min(maxX, position.x));
    const clampedZ = Math.max(minZ, Math.min(maxZ, position.z));

    return new Vector3(clampedX, position.y, clampedZ);
  }

  /**
   * モーションによるY軸オフセットを設定
   * 注意: setPosition()を呼び出すと境界クランプが再実行されてしまうため、
   * メッシュのY位置のみを直接更新する
   */
  public setMotionOffsetY(offset: number): void {
    this.motionOffsetY = offset;
    // メッシュのY位置のみを直接更新（境界クランプをトリガーしない）
    this.mesh.position.y = this.position.y + this.motionOffsetY;
  }

  /**
   * 向きを設定（ラジアン）
   */
  public setRotation(angle: number): void {
    this.rotation = angle;
    this.mesh.rotation.y = angle;
  }

  /**
   * 向きを取得（ラジアン）
   */
  public getRotation(): number {
    return this.rotation;
  }

  /**
   * 前方方向ベクトルを取得
   */
  public getForwardDirection(): Vector3 {
    return new Vector3(
      Math.sin(this.rotation),
      0,
      Math.cos(this.rotation)
    );
  }

  /**
   * 右方向ベクトルを取得
   */
  public getRightDirection(): Vector3 {
    return new Vector3(
      Math.cos(this.rotation),
      0,
      -Math.sin(this.rotation)
    );
  }

  /**
   * 指定方向に移動
   * @param direction 移動方向ベクトル（正規化済み）
   * @param deltaTime フレーム時間（秒）
   * @param isRunning 走行中かどうか（オプション）
   * @param isDashing ダッシュ中かどうか（オプション）
   */
  public move(
    direction: Vector3,
    deltaTime: number,
    isRunning: boolean = false,
    isDashing: boolean = false
  ): void {
    const now = Date.now();
    const speed = CHARACTER_CONFIG.speed;

    // 正規化された方向ベクトルを確保
    const normalizedDir = direction.length() > 0.01
      ? direction.normalize()
      : direction.clone();

    // === 移動による重心への影響 ===

    // 静止時間を確認（300ms以上静止していたら「移動開始」）
    const idleTime = (now - this.lastMoveTime) / 1000;
    const isMovementStart = idleTime > 0.3 && this.previousMoveDirection === null;

    if (isMovementStart) {
      // 移動開始時の重心力
      this.balanceController.applyMovementStartForce(normalizedDir);
    } else if (this.previousMoveDirection !== null) {
      // 方向転換のチェック
      const dot = this.previousMoveDirection.x * normalizedDir.x +
                  this.previousMoveDirection.z * normalizedDir.z;

      // 方向が変わった場合（cos(30°) ≈ 0.866 以下で方向転換とみなす）
      if (dot < 0.866) {
        this.balanceController.applyDirectionChangeForce(
          this.previousMoveDirection,
          normalizedDir,
          this.previousMoveSpeed
        );
      }
    }

    // 継続的な移動による重心力
    this.balanceController.applyMovementForce(normalizedDir, speed, isRunning, isDashing);

    // 移動状態を記録
    this.previousMoveDirection = normalizedDir.clone();
    this.previousMoveSpeed = speed;
    this.lastMoveTime = now;

    // === 実際の移動処理 ===

    // 速度を計算
    this.velocity = direction.scale(speed);

    // 新しい位置を計算（モーションオフセットを除いた基準位置を使用）
    const newPosition = this.position.add(this.velocity.scale(deltaTime));

    // 位置を更新
    this.setPosition(newPosition);
  }

  /**
   * 移動を停止する際に呼び出す
   * 急停止の重心力を適用
   */
  public stopMovement(): void {
    // 移動中だった場合のみ処理
    if (this.previousMoveDirection !== null && this.previousMoveSpeed > 0) {
      // 急停止の重心力を適用
      this.balanceController.applySuddenStopForce(
        this.previousMoveDirection,
        this.previousMoveSpeed
      );
    }

    // 移動状態をリセット
    this.previousMoveDirection = null;
    this.previousMoveSpeed = 0;
    this.velocity = Vector3.Zero();
  }

  /**
   * ターゲット位置を向く
   * @param targetPosition ターゲット位置
   */
  public lookAt(targetPosition: Vector3): void {
    const direction = targetPosition.subtract(this.mesh.position);
    direction.y = 0; // Y軸は無視（水平面での回転のみ）

    if (direction.length() > 0.01) {
      const angle = Math.atan2(direction.x, direction.z);
      this.setRotation(angle);
    }
  }

  /**
   * スムーズに回転（補間）
   * @param targetRotation ターゲット回転（ラジアン）
   * @param deltaTime フレーム時間（秒）
   */
  public rotateTowards(targetRotation: number, deltaTime: number): void {
    // quicknessベースの回転速度（2〜10 rad/s）
    const quickness = this.playerData?.stats.quickness ?? 50;
    const rotationSpeed = 2 + (quickness / 100) * 8;

    // 角度差を計算（-π から π の範囲に正規化）
    const diff = normalizeAngle(targetRotation - this.rotation);

    // 回転量を計算（速度を考慮）
    const maxRotation = rotationSpeed * deltaTime;
    const rotation = Math.max(-maxRotation, Math.min(maxRotation, diff));

    // 回転を適用
    this.setRotation(this.rotation + rotation);
  }

  /**
   * 更新
   * @param _deltaTime フレーム時間（秒）
   */
  public update(deltaTime: number): void {
    // モーションコントローラーを更新
    this.motionController.update(deltaTime);

    // アクションコントローラーを更新
    this.actionController.update(deltaTime);

    // 重心コントローラーを更新
    this.balanceController.update(deltaTime);

    // 重心球の位置を更新（表示中のみ）
    if (this.balanceSphereVisible) {
      this.updateBalanceSpherePosition();
    }

    // ブロックジャンプの横移動を更新
    this.updateBlockJump(deltaTime);

    // 方向サークルを更新
    this.directionCircle.update();

    // Havok物理ボディの位置を更新（手のアニメーションに追従）
    this.updatePhysicsBodyPositions();
  }

  /**
   * AI移動を適用（衝突判定付き）
   * @param deltaTime フレーム時間（秒）
   * @param otherCharacters 他のキャラクターのリスト
   * @returns 衝突が発生した場合はtrue
   */
  public applyAIMovementWithCollision(deltaTime: number, otherCharacters: Character[]): boolean {
    if (this.aiMovementDirection === null || this.aiMovementSpeed <= 0) {
      return false;
    }

    // 遅延時間が経過していない場合は移動しない（reflexesベースの反応時間）
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.aiMovementStartTime;
    if (elapsedTime < this.aiMovementDelay) {
      return false; // まだ反応時間中
    }

    // 重心が安定していない場合は移動しない（重心システム）
    if (!this.balanceController.canTransition()) {
      return false; // 重心が不安定
    }

    // 移動先の位置を計算
    const speed = CHARACTER_CONFIG.speed;
    const scaledDirection = this.aiMovementDirection.scale(this.aiMovementSpeed);
    const velocity = scaledDirection.scale(speed);
    const targetPosition = this.position.add(velocity.scale(deltaTime));

    // 衝突判定
    if (!this.checkCollisionWithCharacters(targetPosition, otherCharacters)) {
      // 衝突しない場合のみ移動
      this.move(scaledDirection, deltaTime);
      return false; // 衝突なし
    } else {
      // 衝突あり
      return true;
    }
  }

  /**
   * AI移動を適用（衝突判定なし）
   * 接触中のオフェンスが前進する際に使用
   * @param deltaTime フレーム時間（秒）
   */
  public applyAIMovementWithoutCollision(deltaTime: number): void {
    if (this.aiMovementDirection === null || this.aiMovementSpeed <= 0) {
      return;
    }

    // 遅延時間が経過していない場合は移動しない（reflexesベースの反応時間）
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.aiMovementStartTime;
    if (elapsedTime < this.aiMovementDelay) {
      return; // まだ反応時間中
    }

    // 重心が安定していない場合は移動しない（重心システム）
    if (!this.balanceController.canTransition()) {
      return; // 重心が不安定
    }

    // 衝突判定をスキップして移動を実行
    const scaledDirection = this.aiMovementDirection.scale(this.aiMovementSpeed);
    this.move(scaledDirection, deltaTime);
  }

  /**
   * モーションを再生
   */
  public playMotion(motion: MotionData, speed: number = 1.0, blendDuration: number = 0.3): void {
    this.motionController.play(motion, speed, blendDuration);
  }

  /**
   * 位置オフセットをスケールしてモーションを再生
   */
  public playMotionWithScale(motion: MotionData, positionScale: number, speed: number = 1.0, blendDuration: number = 0.3): void {
    this.motionController.playWithScale(motion, positionScale, speed, blendDuration);
  }

  /**
   * モーションを停止
   */
  public stopMotion(): void {
    this.motionController.stop();
  }

  /**
   * モーションを一時停止
   */
  public pauseMotion(): void {
    this.motionController.pause();
  }

  /**
   * モーションを再開
   */
  public resumeMotion(): void {
    this.motionController.resume();
  }

  /**
   * モーションの再生時間を直接設定
   * @param time 設定する時間（秒）
   */
  public setMotionTime(time: number): void {
    this.motionController.setCurrentTime(time);
  }

  /**
   * モーションの基準位置を更新（ジャンプ中の慣性移動などで使用）
   */
  public updateMotionBasePosition(position: Vector3): void {
    this.motionController.updateBasePosition({x: position.x, y: position.y, z: position.z});
  }

  /**
   * モーションが再生中かどうか
   */
  public isPlayingMotion(): boolean {
    return this.motionController.isPlaying();
  }

  /**
   * 現在再生中のモーション名を取得
   */
  public getCurrentMotionName(): string | null {
    return this.motionController.getCurrentMotionName();
  }

  /**
   * モーションコントローラーを取得
   */
  public getMotionController(): MotionController {
    return this.motionController;
  }

  /**
   * アクションコントローラーを取得
   */
  public getActionController(): ActionController {
    return this.actionController;
  }

  /**
   * キャラクターの色を変更
   * @param r 赤 (0.0 - 1.0)
   * @param g 緑 (0.0 - 1.0)
   * @param b 青 (0.0 - 1.0)
   */
  public setColor(r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);

    // 全ての身体パーツの色を変更
    const bodyParts = [
      this.headMesh,
      this.upperBodyMesh,
      this.lowerBodyMesh,
      this.leftShoulderMesh,
      this.rightShoulderMesh,
      this.leftUpperArmMesh,
      this.rightUpperArmMesh,
      this.leftElbowMesh,
      this.rightElbowMesh,
      this.leftForearmMesh,
      this.rightForearmMesh,
      this.leftHandMesh,
      this.rightHandMesh,
      this.leftHipMesh,
      this.rightHipMesh,
      this.leftThighMesh,
      this.rightThighMesh,
      this.leftKneeMesh,
      this.rightKneeMesh,
      this.leftShinMesh,
      this.rightShinMesh,
      this.leftFootMesh,
      this.rightFootMesh,
    ];

    bodyParts.forEach((mesh) => {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseColor = color;
      }
    });
  }

  /**
   * 胴体の色を変更（肩を含む）
   * @param r 赤 (0.0 - 1.0)
   * @param g 緑 (0.0 - 1.0)
   * @param b 青 (0.0 - 1.0)
   */
  public setBodyColor(r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);

    // 胴体と肩パーツの色を変更
    const bodyParts = [
      this.upperBodyMesh,
      this.lowerBodyMesh,
      this.leftShoulderMesh,
      this.rightShoulderMesh,
    ];

    bodyParts.forEach((mesh) => {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseColor = color;
      }
    });
  }

  /**
   * キャラクターの表示/非表示を切り替え
   * @param visible 表示する場合true
   */
  public setVisible(visible: boolean): void {
    this.isVisible = visible;

    // ルートメッシュを含む全パーツの表示を切り替え
    this.mesh.setEnabled(visible);

    // 足元の円（オクタゴン）
    if (this.footCircle) {
      this.footCircle.setEnabled(visible);
    }
    this.directionCircle.setFootCircleVisible(visible);

    // 名前ラベル
    if (this.nameLabel) {
      this.nameLabel.setEnabled(visible);
    }

    // 重心球
    if (this.balanceSphereMesh) {
      this.balanceSphereMesh.setEnabled(visible);
    }
  }

  /**
   * キャラクターが表示されているかどうかを取得
   */
  public getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * バランス状態をリセット（ゲームリセット時などに使用）
   * 重心球を基準位置に戻し、速度をゼロにする
   */
  public resetBalance(): void {
    if (this.balanceController) {
      this.balanceController.reset();
    }
    // アクションも中断
    this.actionController.cancelAction();
  }

  /**
   * 右手のひらの先端位置を取得（ワールド座標）
   */
  public getRightHandPosition(): Vector3 {
    // 右手のひらのワールド座標を取得
    const handWorldPosition = this.rightHandMesh.getAbsolutePosition();

    // 手のひらの半径分下に移動（手のひらの先端）
    const handRadius = 0.07;
    const handTipOffset = new Vector3(0, -handRadius, 0);

    // ワールド座標系での手のひらの先端位置を返す
    return handWorldPosition.add(handTipOffset);
  }

  /**
   * 左手のひらの先端位置を取得（ワールド座標）
   */
  public getLeftHandPosition(): Vector3 {
    // 左手のひらのワールド座標を取得
    const handWorldPosition = this.leftHandMesh.getAbsolutePosition();

    // 手のひらの半径分下に移動（手のひらの先端）
    const handRadius = 0.07;
    const handTipOffset = new Vector3(0, -handRadius, 0);

    // ワールド座標系での手のひらの先端位置を返す
    return handWorldPosition.add(handTipOffset);
  }

  /**
   * 両手の中間位置を取得（ブロック判定用）
   */
  public getHandsCenterPosition(): Vector3 {
    const rightHand = this.getRightHandPosition();
    const leftHand = this.getLeftHandPosition();

    return new Vector3(
      (rightHand.x + leftHand.x) / 2,
      (rightHand.y + leftHand.y) / 2,
      (rightHand.z + leftHand.z) / 2
    );
  }

  /**
   * 手を上げた状態での手の位置を取得（ジャンプなし）
   * シュートブロックのヒットボックス用
   */
  public getBlockingHandPosition(): Vector3 {
    const pos = this.getPosition();
    const height = this.config.physical.height;
    const rotation = this.getRotation();

    // 手を上げた状態の高さ（身長 + 0.3m）
    const handHeight = height + 0.3;

    // 前方0.3mにオフセット
    const forwardOffset = 0.3;
    const handX = pos.x + Math.sin(rotation) * forwardOffset;
    const handZ = pos.z + Math.cos(rotation) * forwardOffset;

    return new Vector3(handX, pos.y + handHeight * 0.5, handZ);
  }

  /**
   * キャラクターの状態を取得
   */
  public getState(): CharacterState {
    return this.state;
  }

  /**
   * キャラクターの状態を設定
   */
  public setState(state: CharacterState): void {
    this.state = state;

    // 状態の色を取得
    const color = CHARACTER_STATE_COLORS[state];

    // 状態インジケーターの色を更新
    if (this.stateIndicator.material && this.stateIndicator.material instanceof StandardMaterial) {
      this.stateIndicator.material.diffuseColor = new Color3(color.r, color.g, color.b);
      this.stateIndicator.material.emissiveColor = new Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
    }

    // 視野コーンの色も更新
    if (this.visionConeMesh.material && this.visionConeMesh.material instanceof StandardMaterial) {
      this.visionConeMesh.material.diffuseColor = new Color3(color.r, color.g, color.b);
    }

    // 足元の円の色を更新
    this.updateFootCircleColor();
  }

  /**
   * 足元の円の色を状態に応じて更新
   */
  private updateFootCircleColor(): void {
    this.directionCircle.updateFootCircleColor(this.state);
  }

  /**
   * 足元の円の表示/非表示を設定
   */
  public setFootCircleVisible(visible: boolean): void {
    this.directionCircle.setFootCircleVisible(visible);
  }

  /**
   * 足元の円のサイズを設定
   * @param radius 半径（メートル）
   */
  public setFootCircleRadius(radius: number): void {
    this.footCircleRadius = Math.max(0, radius);
    this.directionCircle.setFootCircleRadius(radius);
    this.footCircle = this.directionCircle.getFootCircle();
  }

  /**
   * 足元の円の半径を取得
   * @returns 半径（メートル）
   */
  public getFootCircleRadius(): number {
    return this.directionCircle.getFootCircleRadius();
  }

  /**
   * ワールド座標での方向から足元の円の半径を取得（接触判定用）
   * 8方向ごとに異なる半径を考慮
   * @param worldDirection ワールド座標での方向ベクトル
   * @returns その方向での半径
   */
  public getFootCircleRadiusInDirection(worldDirection: { x: number; z: number }): number {
    return this.directionCircle.getRadiusInWorldDirection(worldDirection);
  }

  /**
   * 8角形の頂点位置を取得（ワールド座標）
   * @param vertexIndex 頂点番号（0-7）
   * @returns 頂点のワールド座標
   *
   * 頂点の配置（上から見て時計回り）：
   * 辺0がキャラクターの正面に来るように配置
   *    7   0
   *   /     \
   *  6       1
   *  |       |
   *  5       2
   *   \     /
   *    4   3
   */
  public getOctagonVertexPosition(vertexIndex: number): Vector3 {
    return this.directionCircle.getOctagonVertexPosition(vertexIndex);
  }

  /**
   * 方向の中心位置を取得（ワールド座標）
   * @param faceIndex 方向インデックス（0-7）
   */
  public getFaceCenter(faceIndex: number): Vector3 {
    return this.directionCircle.getFaceCenter(faceIndex);
  }

  /**
   * ワールド座標の角度から方向インデックス（0-7）を計算
   * @param worldAngle ワールド座標での角度（ラジアン）
   * @returns 方向インデックス（0-7）
   */
  public getFaceIndexFromWorldAngle(worldAngle: number): number {
    return this.directionCircle.getFaceIndexFromWorldAngle(worldAngle);
  }

  /**
   * 接触点から方向インデックス（0-7）を計算
   * @param contactPoint 接触点のワールド座標
   * @returns 方向インデックス（0-7）
   */
  public getFaceIndexFromContactPoint(contactPoint: Vector3): number {
    return this.directionCircle.getFaceIndexFromContactPoint(contactPoint);
  }

  /**
   * 8角形の面（三角形）を色分けして表示（デバッグ用）
   * @deprecated showDirectionColorsを使用してください
   */
  public showOctagonVertexNumbers(): void {
    this.directionCircle.showOctagonVertexNumbers();
  }

  /**
   * 方向を色分けして表示（デバッグ用）
   */
  public showDirectionColors(): void {
    this.directionCircle.showDirectionColors();
  }

  /**
   * 8角形の頂点番号を非表示（デバッグ用）
   */
  public hideOctagonVertexNumbers(): void {
    this.directionCircle.hideOctagonVertexNumbers();
  }

  /**
   * ボール保持位置に使用する面を設定
   * @param faceIndices 使用する面の番号配列（0-7）。最大5つまで。
   */
  public setBallHoldingFaces(faceIndices: number[]): void {
    if (faceIndices.length > 5) {
      console.warn('[Character] ボール保持位置は最大5箇所までです。最初の5つを使用します。');
      this.ballHoldingFaces = faceIndices.slice(0, 5);
    } else {
      this.ballHoldingFaces = faceIndices;
    }

    // インデックスをリセット
    this.currentBallHoldingIndex = 0;
  }

  /**
   * ボール保持位置に使用する面を取得
   * @returns 使用する面の番号配列
   */
  public getBallHoldingFaces(): number[] {
    return [...this.ballHoldingFaces];
  }

  /**
   * 現在のボール保持位置インデックスを設定
   * @param index ボール保持位置インデックス（0～使用面数-1）
   */
  public setBallHoldingPositionIndex(index: number): void {
    if (index < 0 || index >= this.ballHoldingFaces.length) {
      console.warn(`[Character] ボール保持位置インデックスは0～${this.ballHoldingFaces.length - 1}の範囲で指定してください。`);
      return;
    }

    const previousIndex = this.currentBallHoldingIndex;
    this.currentBallHoldingIndex = index;

    // 方向が変わった場合、ボール保持モーションを再生
    if (previousIndex !== index) {
      this.updateBallHoldingMotion();
    }
  }

  /**
   * ボール保持モーションを更新
   * 現在の保持方向に応じた腕のモーションを再生
   */
  private updateBallHoldingMotion(): void {
    const faceIndex = this.ballHoldingFaces[this.currentBallHoldingIndex];
    const newHoldingHand = BallHoldingUtils.getHoldingHand(faceIndex, this.dominantHand);

    // 持ち替えが必要な場合のチェック
    if (newHoldingHand !== this.currentHoldingHand) {
      // 持ち替えは正面（方向0）でのみ可能
      if (!BallHoldingUtils.canSwitchHand(faceIndex)) {
        console.warn(`[Character] 方向${faceIndex}では持ち替えができません（正面でのみ可能）`);
        // 持ち替えなしで、現在の手でできる方向に制限される
        // ただし、モーションは再生する（手は変わらない）
      } else {
        this.currentHoldingHand = newHoldingHand;
      }
    }

    // ボール保持モーションを再生
    const motion = getBallHoldingMotion(this.dominantHand, faceIndex);
    this.playMotion(motion, 1.0, BALL_HOLDING_CONFIG.ARM_BLEND_DURATION);
  }

  /**
   * 現在のボール保持位置インデックスを取得
   * @returns 現在のインデックス
   */
  public getBallHoldingPositionIndex(): number {
    return this.currentBallHoldingIndex;
  }

  /**
   * 現在のボール保持位置（ワールド座標）を取得
   * 現在ボールを持っている手の位置を返す
   * @returns ボール保持位置のワールド座標
   */
  public getBallHoldingPosition(): Vector3 {
    // 現在ボールを持っている手の位置を返す
    if (this.currentHoldingHand === 'right') {
      return this.getRightHandPosition();
    } else {
      return this.getLeftHandPosition();
    }
  }

  /**
   * 現在のボール保持位置（サークルの方向中心）を取得
   * 従来の実装（互換性のため残す）
   * @returns ボール保持位置のワールド座標
   */
  public getBallHoldingPositionLegacy(): Vector3 {
    if (this.ballHoldingFaces.length === 0) {
      console.warn('[Character] ボール保持位置が設定されていません。キャラクター位置を返します。');
      return this.position.clone();
    }

    // 現在選択されている面の番号を取得
    const faceIndex = this.ballHoldingFaces[this.currentBallHoldingIndex];

    // その方向の中心位置を取得（円周上の点）
    const faceCenter = this.getFaceCenter(faceIndex);

    // 円周上の点からキャラクター中心方向へのベクトル
    const towardsCenterX = this.position.x - faceCenter.x;
    const towardsCenterZ = this.position.z - faceCenter.z;

    // ベクトルの長さを計算
    const vectorLength = Math.sqrt(towardsCenterX * towardsCenterX + towardsCenterZ * towardsCenterZ);

    // 長さが0の場合は中心位置を返す
    if (vectorLength < 0.001) {
      const ballY = this.waistJointMesh.getAbsolutePosition().y;
      return new Vector3(this.position.x, ballY, this.position.z);
    }

    // 単位ベクトル化
    const unitX = towardsCenterX / vectorLength;
    const unitZ = towardsCenterZ / vectorLength;

    // 円周から内側に0.3m入った位置
    const insetDistance = 0.3;
    const ballX = faceCenter.x + unitX * insetDistance;
    const ballZ = faceCenter.z + unitZ * insetDistance;

    // ボールは腰関節の高さに配置（上半身と下半身の境界）
    const ballY = this.waistJointMesh.getAbsolutePosition().y;

    return new Vector3(ballX, ballY, ballZ);
  }

  /**
   * 利き腕を設定
   * @param hand 利き腕（'right' または 'left'）
   */
  public setDominantHand(hand: DominantHand): void {
    this.dominantHand = hand;
    // 初期状態では利き腕でボールを持つ
    this.currentHoldingHand = hand;
    // 現在のボール保持位置に応じたモーションを更新
    this.updateBallHoldingMotion();
  }

  /**
   * 利き腕を取得
   * @returns 利き腕
   */
  public getDominantHand(): DominantHand {
    return this.dominantHand;
  }

  /**
   * 現在ボールを持っている手を取得
   * @returns 現在ボールを持っている手
   */
  public getCurrentHoldingHand(): HoldingHand {
    return this.currentHoldingHand;
  }

  /**
   * 非利き腕使用頻度を設定
   * @param frequency 頻度（1〜8）
   */
  public setOppositeFrequency(frequency: number): void {
    this.oppositeFrequency = Math.max(BALL_HOLDING_CONFIG.STAT_MIN,
      Math.min(BALL_HOLDING_CONFIG.STAT_MAX, frequency));
  }

  /**
   * 非利き腕使用頻度を取得
   * @returns 頻度（1〜8）
   */
  public getOppositeFrequency(): number {
    return this.oppositeFrequency;
  }

  /**
   * 非利き腕精度を設定
   * @param accuracy 精度（1〜8）
   */
  public setOppositeAccuracy(accuracy: number): void {
    this.oppositeAccuracy = Math.max(BALL_HOLDING_CONFIG.STAT_MIN,
      Math.min(BALL_HOLDING_CONFIG.STAT_MAX, accuracy));
  }

  /**
   * 非利き腕精度を取得
   * @returns 精度（1〜8）
   */
  public getOppositeAccuracy(): number {
    return this.oppositeAccuracy;
  }

  /**
   * 現在非利き腕でボールを持っているかどうかを判定
   * @returns 非利き腕で持っている場合はtrue
   */
  public isUsingOppositeHand(): boolean {
    return this.currentHoldingHand !== this.dominantHand;
  }

  /**
   * 非利き腕使用時のアクション精度係数を取得
   * @returns 精度係数（0.5〜1.0）、利き腕使用時は1.0
   */
  public getHandAccuracyMultiplier(): number {
    if (!this.isUsingOppositeHand()) {
      return 1.0;
    }
    return BallHoldingUtils.calculateOppositeHandAccuracy(this.oppositeAccuracy);
  }

  /**
   * 1対1有利/不利状態を設定（GameSceneから呼び出される）
   * @param status 有利/不利状態
   */
  public setAdvantageStatus(status: AdvantageStatus): void {
    this.advantageStatus = status;
  }

  /**
   * 1対1有利/不利状態を取得
   * @returns 有利/不利状態
   */
  public getAdvantageStatus(): AdvantageStatus {
    return this.advantageStatus;
  }

  /**
   * 有利/不利を考慮したアクション成功率を計算
   * @param baseRate 基本成功率（0.0〜1.0）
   * @param actionType アクションの種類
   * @param isOffenseAction オフェンス側のアクションかどうか
   * @returns 調整後の成功率
   */
  public getAdjustedSuccessRate(
    baseRate: number,
    actionType: keyof typeof ADVANTAGE_CONFIG.ACTION_FACTORS,
    isOffenseAction: boolean
  ): number {
    return AdvantageUtils.adjustSuccessRate(
      baseRate,
      this.advantageStatus,
      actionType,
      isOffenseAction
    );
  }

  /**
   * 足元の8角形を相手の方向に向けて、辺が一致するように回転させる
   * 注意: サークルの回転はupdate()で頂点を再計算する際にキャラクターの回転に追従するため、
   *       このメソッドは互換性のために残しています
   * @param targetPosition 相手の位置
   */
  public alignFootCircleToTarget(targetPosition: Vector3): void {
    // キャラクター自体を相手方向に向ける（サークルは自動的に追従する）
    this.lookAt(targetPosition);
  }

  /**
   * チームを設定
   */
  public setTeam(team: "ally" | "enemy"): void {
    this.team = team;
  }

  /**
   * 身長を設定（メートル単位）
   * @param heightInMeters 身長（メートル）
   */
  public setHeight(heightInMeters: number): void {
    // 身長を更新
    this.config.physical.height = heightInMeters;
    this.groundY = heightInMeters / 2;

    // 基準身長（1.8m）に対するスケール比率を計算
    const baseHeight = 1.8;
    const scale = heightInMeters / baseHeight;

    // ルートメッシュのスケーリングを更新（メッシュが存在する場合のみ）
    if (this.mesh) {
      this.mesh.scaling = new Vector3(scale, scale, scale);

      // キャラクターの位置を更新（新しいgroundYに合わせる）
      // 現在のXZ座標を保持し、Y座標だけを新しいgroundYに更新
      this.setPosition(new Vector3(this.position.x, this.groundY, this.position.z));
    }

    // 重心コントローラーを更新（身長変更に伴い重心位置を再計算）
    this.balanceController.setPlayerData(
      this.config.physical.weight,
      heightInMeters
    );

    // 重心球のメッシュを再作成（サイズが変わるため）
    if (this.balanceSphereMesh) {
      this.balanceSphereMesh.dispose();
      this.balanceSphereMesh = null;
      if (this.balanceSphereVisible) {
        this.createBalanceSphereMesh();
      }
    }
  }

  /**
   * 視野コーンの表示/非表示を切り替え
   */
  public setVisionVisible(visible: boolean): void {
    this.visionConeMesh.isVisible = visible;
  }

  /**
   * 指定した位置が視野内にあるかを判定
   * @param targetPosition 対象の位置
   * @returns 視野内にある場合はtrue
   */
  public isInVision(targetPosition: Vector3): boolean {
    const characterPosition = this.getPosition();

    // 視野角の半分（ラジアン）
    const halfVisionAngleRad = (this.visionAngle / 2) * (Math.PI / 180);

    // CollisionUtils の共通関数を使用
    return isInFieldOfView2D(
      characterPosition,
      this.rotation,
      targetPosition,
      halfVisionAngleRad,
      this.visionRange
    );
  }

  /**
   * 別のキャラクターが視野内にいるかを判定
   */
  public canSeeCharacter(otherCharacter: Character): boolean {
    return this.isInVision(otherCharacter.getPosition());
  }

  /**
   * ボールが視野内にあるかを判定
   */
  public canSeeBall(ballPosition: Vector3): boolean {
    return this.isInVision(ballPosition);
  }

  /**
   * 選手データを設定する
   */
  public setPlayerData(playerData: PlayerData, position: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): void {
    this.playerData = playerData;
    this.playerPosition = position;

    // 利き腕を設定（「右」または「左」から変換）
    if (playerData.basic.dominanthand === '左') {
      this.setDominantHand('left');
    } else {
      this.setDominantHand('right');
    }

    // 非利き腕パラメータを設定
    if (playerData.stats.oppositefrequency !== undefined) {
      this.setOppositeFrequency(playerData.stats.oppositefrequency);
    }
    if (playerData.stats.oppositeaccuracy !== undefined) {
      this.setOppositeAccuracy(playerData.stats.oppositeaccuracy);
    }

    // 名前ラベルを作成
    this.createNameLabel();

    // 顔設定を適用
    const fc = playerData.faceConfig ?? DEFAULT_FACE_CONFIG;
    this.applyFaceConfig(fc);
  }

  /**
   * 顔設定を適用（マテリアル色・位置の更新、髪・髭メッシュの生成）
   */
  public applyFaceConfig(fc: FaceConfig): void {
    // ファクトリーのFaceConfigを更新（createHair/createBeard用）
    this.bodyPartsFactory.setFaceConfig(fc);

    // 頭の肌色を更新
    const headMat = this.headMesh.material as StandardMaterial;
    if (headMat) {
      headMat.diffuseColor = new Color3(fc.skinColor.r, fc.skinColor.g, fc.skinColor.b);
    }

    // 目メッシュを再作成（EyeStyleで形状が変わるため）
    const leftEyeParent = this.leftEyeMesh.parent;
    const rightEyeParent = this.rightEyeMesh.parent;
    this.leftEyeMesh.dispose();
    this.rightEyeMesh.dispose();
    this.leftEyeMesh = this.bodyPartsFactory.createEye("left");
    this.rightEyeMesh = this.bodyPartsFactory.createEye("right");
    this.leftEyeMesh.parent = leftEyeParent;
    this.rightEyeMesh.parent = rightEyeParent;

    // 口メッシュを再作成（MouthStyleで形状が変わるため）
    const mouthParent = this.mouthMesh.parent;
    this.mouthMesh.dispose();
    this.mouthMesh = this.bodyPartsFactory.createMouth();
    this.mouthMesh.parent = mouthParent;

    // 腕・手の肌色を更新
    const skinMeshes = [
      this.leftUpperArmMesh, this.rightUpperArmMesh,
      this.leftElbowMesh, this.rightElbowMesh,
      this.leftForearmMesh, this.rightForearmMesh,
      this.leftHandMesh, this.rightHandMesh,
    ];
    for (const mesh of skinMeshes) {
      const mat = mesh.material as StandardMaterial;
      if (mat) {
        mat.diffuseColor = new Color3(fc.skinColor.r, fc.skinColor.g, fc.skinColor.b);
      }
    }

    // 既存の髪メッシュを削除
    if (this.hairMesh) {
      this.hairMesh.dispose();
      this.hairMesh = null;
    }
    // 新しい髪メッシュを生成
    this.hairMesh = this.bodyPartsFactory.createHair();
    if (this.hairMesh) {
      this.hairMesh.parent = this.headMesh;
    }

    // 既存の髭メッシュを削除
    if (this.beardMesh) {
      this.beardMesh.dispose();
      this.beardMesh = null;
    }
    // 新しい髭メッシュを生成
    this.beardMesh = this.bodyPartsFactory.createBeard();
    if (this.beardMesh) {
      this.beardMesh.parent = this.headMesh;
    }
  }

  /**
   * 名前ラベルを作成
   */
  private createNameLabel(): void {
    if (!this.playerData) return;

    // 既存のラベルがあれば削除
    if (this.nameLabel) {
      this.nameLabel.dispose();
      this.nameLabel = null;
    }

    // ラベル用の平面メッシュを作成（幅を広くして長い名前に対応）
    this.nameLabel = MeshBuilder.CreatePlane(
      `nameLabel_${this.playerData.basic.ID}`,
      { width: 5, height: 2.5 },
      this.scene
    );

    // ラベルを頭上に配置（キャラクターの子として設定）
    // 位置を低く調整（身長の65%の高さ）
    this.nameLabel.parent = this.mesh;
    this.nameLabel.position = new Vector3(0, this.config.physical.height * 0.65, 0);
    this.nameLabel.billboardMode = Mesh.BILLBOARDMODE_ALL; // 常にカメラの方を向く

    // GUI用のテクスチャを作成
    this.nameLabelTexture = AdvancedDynamicTexture.CreateForMesh(this.nameLabel);

    // テキストブロックを作成（名前のみ表示）
    const textBlock = new TextBlock();
    textBlock.text = this.playerData.basic.NAME;
    textBlock.color = "white";
    textBlock.fontSize = 50;
    textBlock.fontFamily = "Arial";
    textBlock.fontWeight = "bold";
    textBlock.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
    textBlock.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;

    // テキストに影（アウトライン）を追加
    textBlock.outlineWidth = 5;
    textBlock.outlineColor = "black";

    this.nameLabelTexture.addControl(textBlock);
  }

  /**
   * 無力化フラグを設定
   */
  public setDefeated(defeated: boolean): void {
    this.defeated = defeated;
  }

  /**
   * 無力化フラグを取得
   */
  public isDefeated(): boolean {
    return this.defeated;
  }

  /**
   * スローインスロワーとして設定
   * @param fixedPosition 固定位置（外枠マス）、nullで解除
   */
  public setAsThrowInThrower(fixedPosition: Vector3 | null): void {
    if (fixedPosition) {
      this.isThrowInThrower = true;
      this.throwInFixedPosition = fixedPosition.clone();
    } else {
      this.isThrowInThrower = false;
      this.throwInFixedPosition = null;
    }
  }

  /**
   * スローインスロワーかどうかを取得
   */
  public getIsThrowInThrower(): boolean {
    return this.isThrowInThrower;
  }

  /**
   * スローインスロワーの固定位置を取得
   */
  public getThrowInFixedPosition(): Vector3 | null {
    return this.throwInFixedPosition;
  }

  /**
   * 現在のボール保持面で取れる行動を取得
   * @returns 利用可能な行動の配列
   */
  public getAvailableActions(): BallAction[] {
    if (this.ballHoldingFaces.length === 0) return [];

    const currentFace = this.ballHoldingFaces[this.currentBallHoldingIndex];
    const actions = FACE_ACTIONS[currentFace] || [];

    return actions;
  }

  /**
   * 現在のボール保持面の番号を取得
   * @returns 現在の面番号（0-7）
   */
  public getCurrentBallFace(): number {
    if (this.ballHoldingFaces.length === 0) return 0;
    return this.ballHoldingFaces[this.currentBallHoldingIndex];
  }

  /**
   * 指定した面にボールを移動する（ボールハンドリング用）
   * @param targetFace 目標の面番号（0-7）
   * @returns 移動成功したかどうか
   */
  public handleBallToFace(targetFace: number): boolean {
    // 面番号の妥当性チェック
    if (targetFace < 0 || targetFace > 7) {
      console.warn(`[Character] 無効な面番号: ${targetFace}`);
      return false;
    }

    // 目標の面が使用可能な面リストに含まれているかチェック
    const targetIndex = this.ballHoldingFaces.indexOf(targetFace);
    if (targetIndex === -1) {
      console.warn(`[Character] 面${targetFace}は使用可能な面リストに含まれていません`);
      return false;
    }

    // ボール保持位置を変更
    this.setBallHoldingPositionIndex(targetIndex);
    return true;
  }

  /**
   * オフェンス戦術を設定
   * @param strategy オフェンス戦術
   */
  public setOffenseStrategy(strategy: OffenseStrategy): void {
    this.offenseStrategy = strategy;

    // 戦術に応じて使用する面を設定
    const faces = OFFENSE_STRATEGY_FACES[strategy];
    this.setBallHoldingFaces(faces);
  }

  /**
   * 現在のオフェンス戦術を取得
   * @returns オフェンス戦術
   */
  public getOffenseStrategy(): OffenseStrategy {
    return this.offenseStrategy;
  }

  /**
   * ボール保持位置をランダムに変更（1on1バトル時）
   */
  public randomizeBallPosition(): void {
    if (this.ballHoldingFaces.length === 0) return;

    const randomIndex = Math.floor(Math.random() * this.ballHoldingFaces.length);
    this.setBallHoldingPositionIndex(randomIndex);
  }

  /**
   * AI移動を設定（1on1バトル中のランダム移動など）
   * @param direction 移動方向（正規化済みのベクトル）
   * @param speed 移動速度
   * @param delayMs 移動開始までの遅延時間（ミリ秒）、デフォルトは0（即座に開始）
   */
  public setAIMovement(direction: Vector3, speed: number, delayMs: number = 0): void {
    this.aiMovementDirection = direction.clone().normalize();
    this.aiMovementSpeed = speed;
    this.aiMovementStartTime = Date.now();
    this.aiMovementDelay = delayMs;
  }

  /**
   * AI移動をクリア
   */
  public clearAIMovement(): void {
    this.aiMovementDirection = null;
    this.aiMovementSpeed = 0;
    this.aiMovementStartTime = 0;
    this.aiMovementDelay = 0;
  }

  /**
   * 他のキャラクターとの衝突判定（footCircle基準）
   * @param targetPosition 移動先の位置
   * @param otherCharacters 他のキャラクターのリスト
   * @returns 衝突する場合はtrue
   */
  public checkCollisionWithCharacters(targetPosition: Vector3, otherCharacters: Character[]): boolean {
    for (const other of otherCharacters) {
      if (other === this) continue; // 自分自身は除外

      const otherPos = other.getPosition();
      const distance = Vector3.Distance(
        new Vector3(targetPosition.x, 0, targetPosition.z),
        new Vector3(otherPos.x, 0, otherPos.z)
      );

      // footCircleの半径を使った衝突判定
      const minDistance = this.footCircleRadius + other.getFootCircleRadius();
      if (distance < minDistance) {
        return true; // 衝突あり
      }
    }
    return false; // 衝突なし
  }

  /**
   * ドリブル突破を開始
   * @param direction 突破方向（'left' = 左斜め前、'right' = 右斜め前）
   * @returns 突破を開始できた場合はtrue
   */
  public startDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    const currentFace = this.getCurrentBallFace();

    // DribbleUtilsを使用して突破可能かチェック
    if (!DribbleUtils.canStartBreakthrough(currentFace, this.isDribbleBreakthrough)) {
      return false;
    }

    // DribbleUtilsを使用して突破角度を計算
    const breakthroughAngle = DribbleUtils.calculateBreakthroughAngle(this.rotation, direction);

    this.breakthroughDirection = new Vector3(
      Math.sin(breakthroughAngle),
      0,
      Math.cos(breakthroughAngle)
    ).normalize();

    this.isDribbleBreakthrough = true;
    this.breakthroughStartTime = Date.now();

    return true;
  }

  /**
   * ドリブル突破中かどうかを取得
   */
  public isInDribbleBreakthrough(): boolean {
    return this.isDribbleBreakthrough;
  }

  /**
   * ドリブル突破の残り時間を取得（ミリ秒）
   */
  public getBreakthroughRemainingTime(): number {
    if (!this.isDribbleBreakthrough) return 0;
    const elapsed = Date.now() - this.breakthroughStartTime;
    return Math.max(0, DRIBBLE_CONFIG.BREAKTHROUGH_DURATION - elapsed);
  }

  /**
   * ドリブル突破を終了
   */
  public endDribbleBreakthrough(): void {
    this.isDribbleBreakthrough = false;
    this.breakthroughDirection = null;
  }

  /**
   * ドリブル突破の移動を適用（衝突判定無視）
   * @param deltaTime フレーム時間（秒）
   * @returns 突破が終了した場合はtrue
   */
  public applyBreakthroughMovement(deltaTime: number): boolean {
    if (!this.isDribbleBreakthrough || !this.breakthroughDirection) {
      return false;
    }

    // 突破時間が経過したかチェック
    const elapsed = Date.now() - this.breakthroughStartTime;
    if (elapsed >= DRIBBLE_CONFIG.BREAKTHROUGH_DURATION) {
      return true; // 突破終了
    }

    // DribbleUtilsを使用して突破速度を計算
    const speed = DribbleUtils.calculateBreakthroughSpeed(
      CHARACTER_CONFIG.speed,
      this.playerData?.stats.dribblingspeed
    );
    const velocity = this.breakthroughDirection.scale(speed);
    const newPosition = this.position.add(velocity.scale(deltaTime));
    this.setPosition(newPosition);

    return false; // まだ突破中
  }

  /**
   * 押し返し（ボディバランス計算）を適用
   * @param other 衝突した相手キャラクター
   * @returns 押し返しベクトル（自分が押される方向と距離）
   */
  public calculatePushback(other: Character): { selfPush: Vector3; otherPush: Vector3 } {
    // 自分がオフェンスかディフェンスかを判定
    const myState = this.getState();
    const isOffense = myState === 'ON_BALL_PLAYER';

    // オフェンス側はオフェンス能力、ディフェンス側はディフェンス能力を使用
    let myStrength: number;
    let otherStrength: number;

    if (isOffense) {
      // 自分がオフェンス → 自分のオフェンス能力 vs 相手のディフェンス能力
      myStrength = this.playerData?.stats.offense ?? 50;
      // 相手のディフェンス値に位置係数を適用（自軍ゴールに近いほど高い）
      const otherBaseDefense = other.playerData?.stats.defense ?? 50;
      otherStrength = FieldGridUtils.applyDefenseCoefficient(otherBaseDefense, other.getPosition().z, other.team);
    } else {
      // 自分がディフェンス → 自分のディフェンス能力 vs 相手のオフェンス能力
      // 自分のディフェンス値に位置係数を適用（自軍ゴールに近いほど高い）
      const myBaseDefense = this.playerData?.stats.defense ?? 50;
      myStrength = FieldGridUtils.applyDefenseCoefficient(myBaseDefense, this.getPosition().z, this.team);
      otherStrength = other.playerData?.stats.offense ?? 50;
    }

    // 1対1有利/不利による押し込み力の調整
    myStrength = AdvantageUtils.adjustPushPower(myStrength, this.advantageStatus, isOffense);
    otherStrength = AdvantageUtils.adjustPushPower(otherStrength, other.getAdvantageStatus(), !isOffense);

    // 能力差を計算（-100〜+100の範囲）
    const strengthDiff = myStrength - otherStrength;
    const pushRatio = strengthDiff / 100; // -1〜+1

    // 現在の距離と最小距離（サークルが重ならない距離）を計算
    const myPos = this.getPosition();
    const otherPos = other.getPosition();
    const currentDistance = Vector3.Distance(
      new Vector3(myPos.x, 0, myPos.z),
      new Vector3(otherPos.x, 0, otherPos.z)
    );
    const minDistance = this.footCircleRadius + other.getFootCircleRadius();

    // 押し返し方向を計算（自分から相手へのベクトル）
    const pushDirection = otherPos.subtract(myPos);
    pushDirection.y = 0;
    if (pushDirection.length() > 0.01) {
      pushDirection.normalize();
    } else {
      // 同じ位置にいる場合はランダムな方向に押し返す
      const randomAngle = Math.random() * Math.PI * 2;
      pushDirection.x = Math.sin(randomAngle);
      pushDirection.z = Math.cos(randomAngle);
    }

    // 1. 重なり解消のための分離（サークルが重ならない距離まで離す）
    const overlap = Math.max(0, minDistance - currentDistance);
    const separationPush = overlap + 0.02; // 0.02mの余裕を追加

    // 2. 能力差による追加の押し込み力（接触中は常に発生）
    // pushRatio > 0: 自分の能力が高い → 相手を押し込む
    // pushRatio < 0: 相手の能力が高い → 自分が押し込まれる
    // 毎フレーム最大0.08m（60fpsで約4.8m/秒）の押し込み
    const pushForce = 0.08 * pushRatio;

    // 分離は能力差に応じて分配
    const selfSeparation = separationPush * (0.5 - pushRatio * 0.5);
    const otherSeparation = separationPush * (0.5 + pushRatio * 0.5);

    // 押し込み力を追加（能力が高い側が相手を押し込む）
    // pushForce > 0: 自分が強い → 相手を押す（otherに+）、自分は動かない
    // pushForce < 0: 相手が強い → 自分が押される（selfに+）
    const selfPushAmount = selfSeparation + Math.max(0, -pushForce);
    const otherPushAmount = otherSeparation + Math.max(0, pushForce);

    const selfPush = pushDirection.scale(-selfPushAmount); // 自分は相手の反対方向に押される
    const otherPush = pushDirection.scale(otherPushAmount); // 相手は押し返される

    return { selfPush, otherPush };
  }

  // ==========================================================================
  // 重心システム
  // ==========================================================================

  /**
   * 重心コントローラーを取得
   */
  public getBalanceController(): BalanceController {
    return this.balanceController;
  }

  /**
   * 重心球の可視化を作成
   */
  private createBalanceSphereMesh(): void {
    if (this.balanceSphereMesh) return;

    const state = this.balanceController.getState();

    // 重心球を作成
    this.balanceSphereMesh = MeshBuilder.CreateSphere(
      `${this.team}_balance_sphere`,
      { diameter: state.radius * 2, segments: 16 },
      this.scene
    );

    // マテリアルを設定（チームカラーで半透明）
    const material = new StandardMaterial(`${this.team}_balance_material`, this.scene);
    if (this.team === 'ally') {
      material.diffuseColor = new Color3(0.2, 0.5, 1.0); // 青
      material.emissiveColor = new Color3(0.1, 0.2, 0.5);
    } else {
      material.diffuseColor = new Color3(1.0, 0.3, 0.2); // 赤
      material.emissiveColor = new Color3(0.5, 0.1, 0.1);
    }
    material.alpha = 0.8;
    this.balanceSphereMesh.material = material;

    // 初期位置（キャラクターの重心位置）
    this.updateBalanceSpherePosition();
  }

  /**
   * 重心球の位置を更新
   * キャラクターの足元位置 + BalanceControllerの重心位置
   */
  private updateBalanceSpherePosition(): void {
    if (!this.balanceSphereMesh) return;

    const characterPos = this.getPosition();
    const state = this.balanceController.getState();

    // キャラクターの足元位置（ワールド座標）
    // characterPos.y はキャラクターの中心（height/2）なので、足元は characterPos.y - height/2
    const footY = characterPos.y - this.config.physical.height / 2;

    // 重心球の位置 = 足元 + BalanceControllerの重心位置
    // state.position はキャラクターローカル座標系での重心位置（足元基準）
    this.balanceSphereMesh.position = new Vector3(
      characterPos.x + state.position.x,
      footY + state.position.y,
      characterPos.z + state.position.z
    );
  }

  /**
   * 重心球の表示/非表示を設定
   */
  public setBalanceSphereVisible(visible: boolean): void {
    this.balanceSphereVisible = visible;

    if (visible) {
      if (!this.balanceSphereMesh) {
        this.createBalanceSphereMesh();
      }
      this.balanceSphereMesh!.isVisible = true;
    } else {
      if (this.balanceSphereMesh) {
        this.balanceSphereMesh.isVisible = false;
      }
    }
  }

  /**
   * 身体の透明度を設定
   * @param alpha 透明度（0.0 = 完全透明, 1.0 = 不透明）
   */
  public setBodyTransparency(alpha: number): void {
    const meshes = this.getAllBodyMeshes();

    if (alpha < 1.0 && !this.isBodyTransparent) {
      // 半透明モードに入る: 元のアルファ値を保存
      this.isBodyTransparent = true;
      for (const mesh of meshes) {
        const material = mesh.material as StandardMaterial;
        if (material) {
          this.originalMaterialAlphas.set(mesh, material.alpha);
          material.alpha = alpha;
          // 透明度を正しく描画するための設定
          material.needDepthPrePass = true;
        }
      }
    } else if (alpha >= 1.0 && this.isBodyTransparent) {
      // 不透明モードに戻る: 元のアルファ値を復元
      this.isBodyTransparent = false;
      for (const mesh of meshes) {
        const material = mesh.material as StandardMaterial;
        if (material) {
          const originalAlpha = this.originalMaterialAlphas.get(mesh) ?? 1.0;
          material.alpha = originalAlpha;
          material.needDepthPrePass = false;
        }
      }
      this.originalMaterialAlphas.clear();
    } else if (this.isBodyTransparent) {
      // 透明度を更新
      for (const mesh of meshes) {
        const material = mesh.material as StandardMaterial;
        if (material) {
          material.alpha = alpha;
        }
      }
    }
  }

  /**
   * すべての身体メッシュを取得
   */
  private getAllBodyMeshes(): Mesh[] {
    return [
      this.headMesh,
      this.upperBodyMesh,
      this.lowerBodyMesh,
      this.waistJointMesh,
      this.lowerBodyConnectionMesh,
      this.leftShoulderMesh,
      this.rightShoulderMesh,
      this.leftUpperArmMesh,
      this.rightUpperArmMesh,
      this.leftElbowMesh,
      this.rightElbowMesh,
      this.leftForearmMesh,
      this.rightForearmMesh,
      this.leftHandMesh,
      this.rightHandMesh,
      this.leftHipMesh,
      this.rightHipMesh,
      this.leftThighMesh,
      this.rightThighMesh,
      this.leftKneeMesh,
      this.rightKneeMesh,
      this.leftShinMesh,
      this.rightShinMesh,
      this.leftFootMesh,
      this.rightFootMesh,
    ];
  }

  // ==========================================================================
  // Havok物理システム（ボールとの衝突用）
  // ==========================================================================

  /**
   * Havok物理ボディを初期化
   * GameSceneで物理エンジン初期化後に呼び出す
   */
  public initializePhysics(): void {
    this.physicsManager.initialize();
    // 初期位置を同期
    this.updatePhysicsBodyPositions();
  }

  /**
   * 物理ボディの位置を更新
   * キャラクターの位置・手の位置に物理メッシュを追従させる
   */
  public updatePhysicsBodyPositions(): void {
    if (!this.physicsManager.isInitialized()) {
      return;
    }

    this.physicsManager.updatePositions({
      position: this.getPosition(),
      rotation: this.rotation,
      leftHandPosition: this.getLeftHandPosition(),
      rightHandPosition: this.getRightHandPosition(),
    });
  }

  /**
   * 物理ボディの衝突を一時的に無効化/再有効化
   */
  public setPhysicsEnabled(enabled: boolean): void {
    this.physicsManager.setPhysicsEnabled(enabled);
  }

  /**
   * パスレシーバーモードを設定
   * 反発係数を0にしてボールが弾かれないようにする
   * @param enabled true=レシーバーモード有効（反発なし）、false=通常モード
   */
  public setPassReceiverMode(enabled: boolean): void {
    this.physicsManager.setPassReceiverMode(enabled);
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 物理ボディを破棄
    this.physicsManager.dispose();

    // 身体パーツを破棄
    this.headMesh.dispose();
    this.leftEyeMesh.dispose();
    this.rightEyeMesh.dispose();
    this.mouthMesh.dispose();
    if (this.hairMesh) {
      this.hairMesh.dispose();
      this.hairMesh = null;
    }
    if (this.beardMesh) {
      this.beardMesh.dispose();
      this.beardMesh = null;
    }
    this.upperBodyMesh.dispose();
    this.lowerBodyMesh.dispose();
    this.waistJointMesh.dispose();
    this.leftShoulderMesh.dispose();
    this.rightShoulderMesh.dispose();
    this.leftUpperArmMesh.dispose();
    this.rightUpperArmMesh.dispose();
    this.leftElbowMesh.dispose();
    this.rightElbowMesh.dispose();
    this.leftForearmMesh.dispose();
    this.rightForearmMesh.dispose();
    this.leftHandMesh.dispose();
    this.rightHandMesh.dispose();
    this.leftHipMesh.dispose();
    this.rightHipMesh.dispose();
    this.leftThighMesh.dispose();
    this.rightThighMesh.dispose();
    this.leftKneeMesh.dispose();
    this.rightKneeMesh.dispose();
    this.leftShinMesh.dispose();
    this.rightShinMesh.dispose();
    this.leftFootMesh.dispose();
    this.rightFootMesh.dispose();

    // 状態インジケーターを破棄
    this.stateIndicator.dispose();

    // 視野コーンを破棄
    this.visionConeMesh.dispose();

    // 方向サークルを破棄
    this.directionCircle.dispose();

    // 重心球を破棄
    if (this.balanceSphereMesh) {
      this.balanceSphereMesh.dispose();
      this.balanceSphereMesh = null;
    }

    // 名前ラベルを破棄
    if (this.nameLabel) {
      this.nameLabel.dispose();
      this.nameLabel = null;
    }
    if (this.nameLabelTexture) {
      this.nameLabelTexture.dispose();
      this.nameLabelTexture = null;
    }

    // 3Dモデルを破棄
    if (this.model) {
      this.model.dispose();
    }

    // ルートメッシュを破棄
    if (this.mesh) {
      this.mesh.dispose();
    }
  }

  /**
   * ブロックジャンプのターゲットを設定
   * シューターの向きからシュート軌道を予測し、横移動方向を計算
   * 面0同士が接している場合はサークル縮小分だけ前方に飛ぶ
   */
  public setBlockJumpTarget(target: Character | null): void {
    this.blockJumpController.setTarget(
      target,
      this.getPosition(),
      this.footCircleRadius
    );
  }

  /**
   * ブロックジャンプ中の移動を更新
   * block_shotアクションのstartupまたはactiveフェーズ中に呼び出す
   * 横移動（ボール軌道への移動）と前方移動（サークル縮小分）を適用
   */
  public updateBlockJump(deltaTime: number): void {
    const movement = this.blockJumpController.update(deltaTime, {
      currentAction: this.actionController.getCurrentAction(),
      currentPhase: this.actionController.getCurrentPhase(),
      isBalanceStable: this.actionController.isBalanceStable(),
    });

    // 移動がある場合のみ適用
    if (movement !== null) {
      const newPosition = this.position.add(movement);
      this.setPosition(newPosition);
    }
  }

  /**
   * ブロックジャンプのターゲットを取得
   */
  public getBlockJumpTarget(): Character | null {
    return this.blockJumpController.getTarget() as Character | null;
  }
}
