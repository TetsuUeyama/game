import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  AbstractMesh,
  LinesMesh,
  Bone,
  TransformNode,
  Space,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import { CharacterPhysicsManager } from "@/GamePlay/Object/Physics/Collision/CharacterPhysicsManager";
import { CharacterBlockJumpController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/CharacterBlockJumpController";
import { FIELD_CONFIG } from "@/GamePlay/GameSystem/FieldSystem/FieldGridConfig";

// キャラクター設定
export const CHARACTER_CONFIG = {
  height: 1.8, // キャラクターの身長（m）
  radius: 0.3, // キャラクターの半径（m）
  speed: 5, // 移動速度（m/s）
  rotationSpeed: 3, // 回転速度（rad/s）
  mass: 70, // 質量（kg）

  // 視野設定
  visionAngle: 60, // 視野角（度）
  visionRange: 5, // 視野範囲（m）
};
import { MotionController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/MotionController";
import { ActionController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/ActionController";
import { CharacterState, CHARACTER_STATE_COLORS } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";
import { CHARACTER_COLLISION_CONFIG } from "@/GamePlay/Object/Physics/Collision/CollisionConfig";
import { CharacterConfig, DEFAULT_CHARACTER_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterStats";
import { PlayerData } from "@/GamePlay/Management/Types/PlayerData";
import { FaceConfig, DEFAULT_FACE_CONFIG } from "@/GamePlay/GameSystem/CharacterModel/Types/FaceConfig";
import { OffenseRole, DefenseRole } from "@/GamePlay/GameSystem/StatusCheckSystem/PlayerStateTypes";
import { BallAction, FACE_ACTIONS } from "@/GamePlay/GameSystem/BallHandlingSystem/BallAction";
import { DirectionCircle } from "@/GamePlay/GameSystem/CircleSystem/DirectionCircle";
import { DRIBBLE_BREAKTHROUGH_CONFIG, DribbleBreakthroughUtils } from "@/GamePlay/GameSystem/OneOnOneBattleSystem/DribbleBreakthroughConfig";
import { DashSpeedUtils } from "@/GamePlay/GameSystem/CharacterMove/Config/DashSpeedConfig";
import { getDashDirectionMultiplier, getWalkDirectionMultiplier } from "@/GamePlay/GameSystem/CharacterMove/Config/MotionConfig";
import { BalanceController } from "@/GamePlay/GameSystem/MarbleSimulation/Balance/BalanceController";
import { MOVEMENT_BALANCE } from "@/GamePlay/GameSystem/MarbleSimulation/Balance/BalanceConfig";
import { DominantHand, HoldingHand, BallHoldingUtils, BALL_HOLDING_CONFIG } from "@/GamePlay/GameSystem/BallHandlingSystem/BallHoldingConfig";
import { getBallHoldingMotion } from "@/GamePlay/GameSystem/CharacterMove/Motion/BallHoldingMotion";
import { AdvantageStatus, AdvantageUtils, ADVANTAGE_CONFIG } from "@/GamePlay/GameSystem/OneOnOneBattleSystem/OneOnOneBattleConfig";
import { normalizeAngle, isInFieldOfView2D } from "@/GamePlay/Object/Physics/Spatial/SpatialUtils";
import { FieldGridUtils } from "@/GamePlay/GameSystem/FieldSystem/FieldGridConfig";
import { MatchCharacterModel } from "@/GamePlay/GameSystem/CharacterModel/Character/MatchCharacterModel";
import { GLBModelLoader } from "@/GamePlay/GameSystem/CharacterModel/Character/GLBModelLoader";
import { SkeletonAdapter } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonAdapter";
import { IKSystem } from "@/GamePlay/GameSystem/CharacterMove/Controllers/IKSystem";
import { DEFAULT_MOTION_CONFIG } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";

// ポジション → 背番号マッピング
const POSITION_NUMBER_MAP: Record<string, number> = {
  PG: 1, SG: 2, SF: 3, PF: 4, C: 5,
};

/**
 * 3Dキャラクターエンティティ
 */
export class Character {
  public scene: Scene;
  public mesh: Mesh; // ルートメッシュ（親メッシュ）
  public model: AbstractMesh | null = null; // 読み込んだ3Dモデル

  // 身体モデル
  private characterModel: MatchCharacterModel;
  /** 骨格アダプター（骨格データの唯一の所有者） */
  private _adapter!: SkeletonAdapter;
  /** ヒップボーンのレストポーズ位置（IKリセット用） */
  private _hipRestPos!: Vector3;
  public visionAngle: number; // 視野角（度）
  public visionRange: number; // 視野範囲（m）

  public position: Vector3; // 位置
  public rotation: number = 0; // Y軸周りの回転（ラジアン）
  private targetRotation: number = 0; // 目標回転角度（ラジアン）
  public velocity: Vector3 = Vector3.Zero(); // 速度ベクトル

  private groundY: number; // 地面のY座標
  private motionOffsetY: number = 0; // モーションによるY軸オフセット
  /** 自動接地: レスト姿勢（関節回転0）での足のY座標（mesh基準の相対値） */
  private footRestRelativeY: number | null = null;
  /** 自動接地: 前フレームの結果（デルタクランプ用） */
  private _prevAutoGround: number = 0;
  private upperBodyYawOffset: number = 0; // 上半身のYaw回転オフセット（パス時に使用）

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
  public jerseyNumber: number | null = null;

  // 個人ゲームスタッツ（得点・アシスト）
  public gameStats = { points: 0, assists: 0 };

  // 名前表示用
  private nameLabel: Mesh | null = null;
  private nameLabelTexture: AdvancedDynamicTexture | null = null;

  // 表示状態
  private isVisible: boolean = true;

  // メニューからの表示設定（ユーザー操作による非表示が優先される）
  private _stateIndicatorsEnabled: boolean = false; // 状態インジケーター（球+サークル）
  private _nameLabelEnabled: boolean = false; // 選手名ラベル

  // 足元の円（方向サークル）
  private directionCircle: DirectionCircle;
  private footCircle: LinesMesh | null = null;
  private footCircleRadius: number = 1.0; // 足元の円の半径（初期値1m）


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

  // ダッシュ加速状態
  private dashStartTime: number | null = null; // ダッシュ開始時刻（null = 非ダッシュ）
  private _dashAcceleration: number = 0; // 現在の加速率（0.0〜1.0）

  // 重心球の可視化
  private balanceSphereMesh: Mesh | null = null;
  private balanceSphereVisible: boolean = false;

  // 半透明モード
  private isBodyTransparent: boolean = false;
  private originalMaterialAlphas: Map<Mesh, number> = new Map();

  // Havok物理ボディマネージャー
  private physicsManager: CharacterPhysicsManager;

  // IKSystem
  private ikSystem: IKSystem | null = null;

  constructor(scene: Scene, position: Vector3, config?: CharacterConfig, team?: 'ally' | 'enemy') {
    this.scene = scene;
    this.position = position.clone();

    // チームを先に設定（GLB モデル選択に必要）
    if (team) {
      this.team = team;
    }

    // 設定を初期化（指定がなければデフォルト）
    this.config = config || DEFAULT_CHARACTER_CONFIG;

    // 身長に応じて地面のY座標を設定
    this.groundY = this.config.physical.height / 2;

    // 視野設定を初期化
    this.visionAngle = this.config.vision.visionAngle;
    this.visionRange = this.config.vision.visionRange;

    // 身体モデルを構築（GLB ロード済みなら GLB、それ以外は ProceduralHumanoid）
    if (GLBModelLoader.getInstance().isReady()) {
      this.characterModel = MatchCharacterModel.createFromGLB(scene, this.config, this.state, this.position);
    } else {
      this.characterModel = new MatchCharacterModel(scene, this.config, this.state, this.position);
    }
    this.mesh = this.characterModel.getRootMesh();

    // 骨格データを Character に直接保持（骨格の唯一の所有者）
    this._adapter = this.characterModel.getAdapter();
    this._hipRestPos = this.characterModel.getHipRestPos().clone();

    // 方向サークルを初期化（均一円形、状況に応じてCircleSizeControllerが比率を変更）
    this.directionCircle = new DirectionCircle(
      scene,
      () => this.getPosition(),
      () => this.getRotation(),
      1.0
    );

    // 足元の円を作成（DirectionCircleを使用）
    this.footCircle = this.directionCircle.createFootCircle();

    // 足元の円の色分けセグメントを作成
    this.directionCircle.createFootCircleFaceSegments();

    // デフォルトで状態インジケーターを非表示（メニューで有効化可能）
    this.characterModel.getStateIndicator().isVisible = this._stateIndicatorsEnabled;
    this.directionCircle.setFootCircleVisible(this._stateIndicatorsEnabled);

    // モーションコントローラーを初期化
    this.motionController = new MotionController(this);

    // 自動接地: レスト姿勢での足の基準Y座標をキャプチャ
    this.captureFootRestY();

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
    this.characterModel.hideAllParts();

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
  public getLowerBodyMesh(): Mesh | null {
    return this.characterModel.getHipsMesh();
  }

  /**
   * 関節メッシュを取得
   * @deprecated MatchCharacterModel ではメッシュ階層がないため null を返す。
   * setBoneAnimationRotation() を使用してください。
   */
  public getJoint(_jointName: string): Mesh | null {
    return null;
  }

  /**
   * 関節名に対応するスケルトンボーンを取得
   */
  public getBoneForJoint(jointName: string): Bone | null {
    return this._adapter.findBoneByJointName(jointName);
  }

  /**
   * FK回転（アニメーション回転）をボーンに書き込む。
   * レスト回転と合成してボーンに設定する。
   */
  public setBoneAnimationRotation(jointName: string, animEuler: Vector3): void {
    this._adapter.applyFKRotationByJoint(jointName, animEuler);
  }

  /**
   * SkeletonAdapter を取得する（MotionController 統合用）。
   */
  public getSkeletonAdapter(): SkeletonAdapter {
    return this._adapter;
  }

  /**
   * Skeleton Bridge + IKSystem を初期化する。
   * Mesh階層と並行してSkeletonを生成し、BoneIKControllerベースのIKを有効化する。
   * 初回呼び出し時のみ生成される（2回目以降は何もしない）。
   */
  public initializeIK(): void {
    if (this.ikSystem) return;
    this.ikSystem = new IKSystem(this.scene, DEFAULT_MOTION_CONFIG);
    this.ikSystem.initialize(
      this._adapter.skeleton,
      this.characterModel.getSkeletonMesh(),
      this._hipRestPos,
      this._adapter,
    );
  }

  /**
   * IKSystem を取得する（initializeIK() 未呼び出しの場合は null）。
   * 外部から腕IKターゲットを設定する場合などに使用。
   */
  public getIKSystem(): IKSystem | null {
    return this.ikSystem;
  }

  /**
   * 頭部ルックアットのターゲットを設定する。
   * @param target シーン内のTransformNode（ボール等）。null で解除。
   */
  public setLookAtTarget(target: TransformNode | null): void {
    if (this.ikSystem) {
      this.ikSystem.setLookAtTarget(target);
    }
  }

  /**
   * 顔のメッシュ（頭・目・口）を取得（キャプチャ用）
   * stateIndicator, visionCone は除外
   */
  public getFaceMeshes(): Mesh[] {
    return this.characterModel.getFaceMeshes();
  }

  /**
   * 頭上の状態インジケーターメッシュを取得
   */
  public getStateIndicator(): Mesh {
    return this.characterModel.getStateIndicator();
  }

  /**
   * 視野コーンメッシュを取得
   */
  public getVisionCone(): Mesh {
    return this.characterModel.getVisionCone();
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
   * 現在のダッシュ加速率を取得（0.0〜1.0）
   * 0 = 非ダッシュまたはダッシュ開始直後、1.0 = トップスピード到達
   */
  public getDashAcceleration(): number {
    return this._dashAcceleration;
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

  /** ヒップ位置をレストポーズにリセットする（IK が前フレームで変更した分を戻す） */
  private _resetHipPosition(): void {
    const hipBone = this._adapter.findBone("hips");
    if (!hipBone) return;
    const node = hipBone.getTransformNode();
    if (node) {
      node.position.copyFrom(this._hipRestPos);
    } else {
      hipBone.setPosition(this._hipRestPos, Space.LOCAL);
    }
  }

  /** ヒップボーンのワールドY座標を取得する */
  private _getHipWorldY(): number {
    this._adapter.forceWorldMatrixUpdate();
    const hipBone = this._adapter.findBone("hips");
    return hipBone ? this._adapter.getBoneWorldPosition(hipBone).y : 0;
  }

  /** 足ボーンのワールドY座標を取得する */
  private _getFootBoneYPositions(): { leftY: number; rightY: number } {
    this._adapter.forceWorldMatrixUpdate();
    const lFoot = this._adapter.findBone("leftFoot");
    const rFoot = this._adapter.findBone("rightFoot");
    const leftY = lFoot ? this._adapter.getBoneWorldPosition(lFoot).y : 0;
    const rightY = rFoot ? this._adapter.getBoneWorldPosition(rFoot).y : 0;
    return { leftY, rightY };
  }

  /**
   * レスト姿勢（関節回転0）での足のY座標をキャプチャする。
   * コンストラクタおよびスケール変更時（setHeight）から呼ばれる。
   */
  private captureFootRestY(): void {
    // rootMesh を最新の wrapperMesh トランスフォームに同期してからキャプチャ
    this._resetHipPosition();
    this.characterModel.syncTransform();
    const meshY = this.mesh.getAbsolutePosition().y;
    const { leftY, rightY } = this._getFootBoneYPositions();
    this.footRestRelativeY = Math.min(leftY - meshY, rightY - meshY);
    this._prevAutoGround = 0;
  }

  /**
   * 現在の関節回転から、足を地面に着けるために必要なY補正値を計算する。
   * 関節回転適用後、motionOffsetY設定前に呼ぶこと。
   * @returns 自動接地オフセット（通常は0以下の値）
   */
  public getAutoGroundOffset(): number {
    if (this.footRestRelativeY === null) return 0;
    // IK が前フレームで設定したヒップオフセットをリセットしてから足位置を計算する。
    // FK は回転のみ設定するため、IK のヒップ位置変更が次フレームの足位置計算に残り、
    // autoGround → wrapperMesh.y → rootMesh.y の発散（腕ズレ）を引き起こす。
    // リセット後は IK が再度正しいヒップオフセットを計算するため問題ない。
    this._resetHipPosition();
    // wrapperMesh → rootMesh 同期 + ボーン位置を更新（足位置の正確な計算のため）
    this.characterModel.syncTransform();
    this.characterModel.updateVisuals();
    const meshY = this.mesh.getAbsolutePosition().y;
    const { leftY, rightY } = this._getFootBoneYPositions();
    const lowestFootRelY = Math.min(leftY - meshY, rightY - meshY);
    const raw = this.footRestRelativeY - lowestFootRelY;

    // フレーム間デルタクランプ: 1フレームあたりの変化量を制限して
    // 初期化時やIK干渉による足位置異常値が連鎖崩壊を引き起こすのを防止する。
    // 0.02/frame = 60fps で最大 1.2/s（歩行サイクルの足位置変化 ≈ 0.003/frame に十分）。
    const MAX_DELTA = 0.02;
    const result = Math.max(
      this._prevAutoGround - MAX_DELTA,
      Math.min(this._prevAutoGround + MAX_DELTA, raw),
    );
    this._prevAutoGround = result;

    return result;
  }

  /** 上半身のYaw回転オフセットを設定（ラジアン） */
  public setUpperBodyYawOffset(offset: number): void {
    this.upperBodyYawOffset = offset;
  }

  /** 上半身のYaw回転オフセットを取得（ラジアン） */
  public getUpperBodyYawOffset(): number {
    return this.upperBodyYawOffset;
  }

  /**
   * 向きを設定（ラジアン）— ターゲットベース
   * 実際の回転は update() で重心ベースの速度制限付きで補間される
   */
  public setRotation(angle: number): void {
    this.targetRotation = angle;
  }

  /**
   * 向きを即時設定（ラジアン）
   * 初期化・失敗時の復元など、即座に反映が必要な場合に使用。
   * GLB rootMesh にも即座に反映する（syncTransform）。
   */
  public setRotationImmediate(angle: number): void {
    this.rotation = angle;
    this.targetRotation = angle;
    this.mesh.rotation.y = angle;
    this.characterModel.syncTransform();
  }

  /**
   * 向きを取得（ラジアン）— 実際の回転角度
   */
  public getRotation(): number {
    return this.rotation;
  }

  /**
   * 目標向きを取得（ラジアン）
   */
  public getTargetRotation(): number {
    return this.targetRotation;
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
    let speed = CHARACTER_CONFIG.speed;

    // ダッシュ加速の処理
    if (isDashing) {
      if (this.dashStartTime === null) {
        this.dashStartTime = now;
      }
      const elapsed = (now - this.dashStartTime) / 1000;
      this._dashAcceleration = DashSpeedUtils.calculateAcceleration(elapsed);
      speed *= DashSpeedUtils.calculateSpeedMultiplier(this._dashAcceleration);

      // 方向別速度乗数（角度に応じて線形補間）
      const forward = this.getForwardDirection();
      const dotForward = forward.x * direction.x + forward.z * direction.z;
      speed *= getDashDirectionMultiplier(dotForward);
    } else {
      this.dashStartTime = null;
      this._dashAcceleration = 0;

      // 通常移動でも方向別速度乗数を適用（歩行/走行）
      const forward = this.getForwardDirection();
      const dotForward = forward.x * direction.x + forward.z * direction.z;
      speed *= getWalkDirectionMultiplier(dotForward);
    }

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

        // 方向転換時はダッシュ加速をリセット（再加速が必要）
        if (isDashing && this.dashStartTime !== null) {
          this.dashStartTime = now;
          this._dashAcceleration = 0;
        }
      }
    }

    // 継続的な移動による重心力
    this.balanceController.applyMovementForce(normalizedDir, speed, isRunning, isDashing);

    // 移動状態を記録
    this.previousMoveDirection = normalizedDir.clone();
    this.previousMoveSpeed = speed;
    this.lastMoveTime = now;

    // === 実際の移動処理 ===

    // 重心ボールの慣性による移動速度制限
    // ボールが同じ方向に動いていればフルスピード、違う方向なら減速
    const balanceSpeedFactor = this.balanceController.getMovementSpeedFactor(normalizedDir);

    // 速度を計算（重心制限を適用）
    this.velocity = direction.scale(speed * balanceSpeedFactor);

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

    // ダッシュ加速もリセット
    this.dashStartTime = null;
    this._dashAcceleration = 0;
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
   * スムーズに回転（ターゲット設定のみ）
   * 実際の回転補間は update() で重心ベースの速度制限付きで行われる
   * @param targetRotation ターゲット回転（ラジアン）
   * @param _deltaTime フレーム時間（互換性のため残存、未使用）
   */
  public rotateTowards(targetRotation: number, _deltaTime: number): void {
    this.setRotation(targetRotation);
  }

  /**
   * 更新
   * @param _deltaTime フレーム時間（秒）
   */
  public update(deltaTime: number): void {
    // FK→ボーン
    this.motionController.update(deltaTime);

    // アクション状態
    this.actionController.update(deltaTime);

    // rootMesh トランスフォームを IK 実行前に同期（最新位置で IK 計算するため）
    this.characterModel.syncTransform();

    // BoneIKController（ボーン上でIK解決: 足IK + 腕IK + 頭部ルックアット）
    if (this.ikSystem) {
      const airborne = this.motionOffsetY > 0.01;
      this.ikSystem.update(airborne);
    }

    // ボーン位置からビジュアルメッシュを更新
    this.characterModel.updateVisuals();

    // 重心コントローラーを更新
    this.balanceController.update(deltaTime);

    // === 重心ベースの回転補間 ===
    this.updateRotation(deltaTime);

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

    // 衝突判定をスキップして移動を実行
    const scaledDirection = this.aiMovementDirection.scale(this.aiMovementSpeed);
    this.move(scaledDirection, deltaTime);
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
    this.characterModel.setColor(r, g, b);
  }

  /**
   * 胴体の色を変更（肩を含む）
   * @param r 赤 (0.0 - 1.0)
   * @param g 緑 (0.0 - 1.0)
   * @param b 青 (0.0 - 1.0)
   */
  public setBodyColor(r: number, g: number, b: number): void {
    this.characterModel.setBodyColor(r, g, b);
  }

  /**
   * 背番号を胴体の背面に表示
   * upperBody の -Z 面（背中側）に平面メッシュを貼り付ける
   * @param teamColor チームカラー（背景色として使用）
   */
  public applyJerseyNumber(teamColor: Color3): void {
    if (this.jerseyNumber == null) return;
    this.characterModel.applyJerseyNumber(this.jerseyNumber, teamColor);
  }

  /**
   * キャラクターの表示/非表示を切り替え
   * @param visible 表示する場合true
   */
  public setVisible(visible: boolean): void {
    this.isVisible = visible;

    // ルートメッシュを含む全パーツの表示を切り替え
    this.mesh.setEnabled(visible);

    // ビジュアルメッシュは wrapper の子ではないため、明示的に制御
    this.characterModel.setVisible(visible);

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
    this._adapter.forceWorldMatrixUpdate();
    const bone = this._adapter.findBone("rightHand");
    const handWorldPosition = bone ? this._adapter.getBoneWorldPosition(bone) : Vector3.Zero();
    const handRadius = 0.07;
    return handWorldPosition.add(new Vector3(0, -handRadius, 0));
  }

  /**
   * 左手のひらの先端位置を取得（ワールド座標）
   */
  public getLeftHandPosition(): Vector3 {
    this._adapter.forceWorldMatrixUpdate();
    const bone = this._adapter.findBone("leftHand");
    const handWorldPosition = bone ? this._adapter.getBoneWorldPosition(bone) : Vector3.Zero();
    const handRadius = 0.07;
    return handWorldPosition.add(new Vector3(0, -handRadius, 0));
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
    const indicator = this.characterModel.getStateIndicator();
    if (indicator.material && indicator.material instanceof StandardMaterial) {
      indicator.material.diffuseColor = new Color3(color.r, color.g, color.b);
      indicator.material.emissiveColor = new Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
    }

    // 視野コーンの色も更新
    const visionCone = this.characterModel.getVisionCone();
    if (visionCone.material && visionCone.material instanceof StandardMaterial) {
      visionCone.material.diffuseColor = new Color3(color.r, color.g, color.b);
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
   * メニューで非表示に設定されている場合は常に非表示
   */
  public setFootCircleVisible(visible: boolean): void {
    this.directionCircle.setFootCircleVisible(visible && this._stateIndicatorsEnabled);
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
   * 足元の円の8方向比率を設定
   * @param radii 8方向の比率配列（scale との積が実効半径）
   */
  public setAllDirectionRadii(radii: number[]): void {
    this.directionCircle.setAllDirectionRadii(radii);
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
    this.motionController.play(motion, 1.0, BALL_HOLDING_CONFIG.ARM_BLEND_DURATION);
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
      const ballY = this._getHipWorldY();
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
    const ballY = this._getHipWorldY();

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
    // TODO: 腕位置ズレの切り分けのため一時無効化
    // this.updateBallHoldingMotion();
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

      // スケール変更後に自動接地のベースラインを再キャプチャ
      // （captureFootRestY はコンストラクタでデフォルトスケールで取得済みだが、
      //   setHeight でスケールが変わるため再取得が必要）
      this.captureFootRestY();
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
   * 状態インジケーター（頭上の球+足元サークル）の表示を有効/無効にする
   * メニューからのトグル用。無効時はゲームロジックからの表示も抑制される
   */
  public setStateIndicatorsEnabled(enabled: boolean): void {
    this._stateIndicatorsEnabled = enabled;
    this.characterModel.getStateIndicator().isVisible = enabled;
    this.directionCircle.setFootCircleVisible(enabled);
  }

  /**
   * 選手名ラベルの表示を有効/無効にする
   * メニューからのトグル用
   */
  public setNameLabelEnabled(enabled: boolean): void {
    this._nameLabelEnabled = enabled;
    if (this.nameLabel) {
      this.nameLabel.setEnabled(enabled);
    }
  }

  /**
   * 視野コーンの表示/非表示を切り替え
   */
  public setVisionVisible(visible: boolean): void {
    this.characterModel.getVisionCone().isVisible = visible;
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

    // 背番号を設定（テクスチャ適用はチームカラー設定後に行う）
    this.jerseyNumber = POSITION_NUMBER_MAP[position] ?? null;

    // 顔設定を適用
    const fc = playerData.faceConfig ?? DEFAULT_FACE_CONFIG;
    this.applyFaceConfig(fc);
  }

  /**
   * 顔設定を適用（マテリアル色・位置の更新、髪・髭メッシュの生成）
   */
  public applyFaceConfig(_fc: FaceConfig): void {
    // ProceduralHumanoid は固定の顔パーツを持つため、FaceConfig 適用は不要
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

    // メニュー設定に従って表示/非表示
    this.nameLabel.setEnabled(this._nameLabelEnabled);
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
    const myState = this.getState();
    const myRadius = myState === CharacterState.ON_BALL_PLAYER
      ? this.footCircleRadius
      : CHARACTER_COLLISION_CONFIG.BODY_COLLISION_RADIUS;

    for (const other of otherCharacters) {
      if (other === this) continue; // 自分自身は除外

      const otherPos = other.getPosition();
      const distance = Vector3.Distance(
        new Vector3(targetPosition.x, 0, targetPosition.z),
        new Vector3(otherPos.x, 0, otherPos.z)
      );

      // ON_BALL_PLAYERはサークル半径、それ以外はボディ衝突半径
      const otherState = other.getState();
      const otherRadius = otherState === CharacterState.ON_BALL_PLAYER
        ? other.getFootCircleRadius()
        : CHARACTER_COLLISION_CONFIG.BODY_COLLISION_RADIUS;
      const minDistance = myRadius + otherRadius;
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
    if (!DribbleBreakthroughUtils.canStartBreakthrough(currentFace, this.isDribbleBreakthrough)) {
      return false;
    }

    // DribbleUtilsを使用して突破角度を計算
    const breakthroughAngle = DribbleBreakthroughUtils.calculateBreakthroughAngle(this.rotation, direction);

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
    return Math.max(0, DRIBBLE_BREAKTHROUGH_CONFIG.BREAKTHROUGH_DURATION - elapsed);
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
    if (elapsed >= DRIBBLE_BREAKTHROUGH_CONFIG.BREAKTHROUGH_DURATION) {
      return true; // 突破終了
    }

    // DribbleUtilsを使用して突破速度を計算
    const speed = DribbleBreakthroughUtils.calculateBreakthroughSpeed(
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
    // ON_BALL_PLAYERはサークル半径、それ以外はボディ衝突半径
    const myRadius = isOffense
      ? this.footCircleRadius
      : CHARACTER_COLLISION_CONFIG.BODY_COLLISION_RADIUS;
    const otherRadius = !isOffense
      ? other.getFootCircleRadius()
      : CHARACTER_COLLISION_CONFIG.BODY_COLLISION_RADIUS;
    const minDistance = myRadius + otherRadius;

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
    return this.characterModel.getAllVisualMeshes();
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
    // IKSystem を破棄
    if (this.ikSystem) {
      this.ikSystem.dispose();
      this.ikSystem = null;
    }

    // 物理ボディを破棄
    this.physicsManager.dispose();

    // キャラクターモデルを破棄
    this.characterModel.dispose();

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
   * 重心ベースの回転補間
   * targetRotation に向かって、重心の安定度に応じた速度で回転する
   * 回転時は重心ボールに力が加わる
   */
  private updateRotation(deltaTime: number): void {
    // 目標と現在の角度差を計算
    const diff = normalizeAngle(this.targetRotation - this.rotation);

    // 差がほぼゼロなら何もしない
    if (Math.abs(diff) < 0.001) {
      return;
    }

    // quickness ベースの基本回転速度
    const quickness = this.playerData?.stats.quickness ?? 50;
    const maxTurnRate = MOVEMENT_BALANCE.BASE_TURN_RATE
      + (quickness / 100) * MOVEMENT_BALANCE.TURN_RATE_QUICKNESS_BONUS;

    // 重心安定度による係数
    const balanceFactor = this.balanceController.getTurnSpeedFactor();

    // 実効回転速度
    const effectiveTurnRate = maxTurnRate * balanceFactor;

    // このフレームで回転できる最大量
    const maxRotation = effectiveTurnRate * deltaTime;
    const turnAmount = Math.max(-maxRotation, Math.min(maxRotation, diff));

    // 回転を適用
    this.rotation += turnAmount;
    this.mesh.rotation.y = this.rotation;

    // 回転による重心力を適用
    this.balanceController.applyTurnForce(turnAmount, this.rotation);
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
