import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, AbstractMesh, LinesMesh } from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import { CHARACTER_CONFIG, FIELD_CONFIG } from "../config/gameConfig";
import { MotionController } from "../controllers/MotionController";
import { ActionController } from "../controllers/action/ActionController";
import { MotionData } from "../types/MotionTypes";
import { CharacterState, CHARACTER_STATE_COLORS } from "../types/CharacterState";
import { CharacterConfig, DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { PlayerData } from "../types/PlayerData";
import { BallAction, FACE_ACTIONS } from "../types/BallAction";
import { OffenseStrategy, OFFENSE_STRATEGY_FACES } from "../types/OffenseStrategy";
import { CharacterBodyParts } from "./CharacterBodyParts";
import { DirectionCircle } from "./DirectionCircle";
import { DRIBBLE_CONFIG, DribbleUtils } from "../config/DribbleConfig";
import { BASE_CIRCLE_SIZE } from "../config/CircleSizeConfig";

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

  // 衝突判定
  public collisionRadius: number = 0.3; // 衝突半径（m）

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

  // 名前表示用
  private nameLabel: Mesh | null = null;
  private nameLabelTexture: AdvancedDynamicTexture | null = null;

  // 足元の円（方向サークル）
  private directionCircle: DirectionCircle;
  private footCircle: LinesMesh | null = null;
  private footCircleRadius: number = 1.0; // 足元の円の半径（初期値1m）

  // 身体パーツファクトリー
  private bodyPartsFactory: CharacterBodyParts;

  // ボール保持位置設定
  private ballHoldingFaces: number[] = [0, 1, 2, 6, 7]; // 使用する8角形の面番号（前方5箇所）
  private currentBallHoldingIndex: number = 0; // 現在のボール保持位置インデックス（0-4）

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

  // ブロックジャンプ制御
  private blockJumpTarget: Character | null = null; // ブロック対象のシューター
  private blockLateralDirection: Vector3 | null = null; // 横移動方向（ボール軌道への移動）
  private blockLateralSpeed: number = 3.0; // 横移動速度（m/s）
  private blockForwardDirection: Vector3 | null = null; // 前方移動方向（サークル縮小分）
  private blockForwardSpeed: number = 0; // 前方移動速度（m/s）

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

    // 方向サークルを初期化
    this.directionCircle = new DirectionCircle(
      scene,
      () => this.getPosition(),
      () => this.getRotation(),
      this.footCircleRadius
    );

    // 足元の円を作成（DirectionCircleを使用）
    this.footCircle = this.directionCircle.createFootCircle();

    // 足元の円の色分けセグメントを作成
    this.directionCircle.createFootCircleFaceSegments();

    // モーションコントローラーを初期化
    this.motionController = new MotionController(this);

    // アクションコントローラーを初期化
    this.actionController = new ActionController(this);
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
   * 位置を取得（モーションオフセットを除いた基準位置）
   */
  public getPosition(): Vector3 {
    return this.position.clone();
  }

  /**
   * 位置を設定
   */
  public setPosition(position: Vector3): void {
    // Y座標が地面より下にならないように制限
    let clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, this.groundY),
      position.z
    );

    // フィールド境界内にクランプ（A列〜O列、1行目〜30行目）
    clampedPosition = this.clampToFieldBoundary(clampedPosition);

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
   */
  public setMotionOffsetY(offset: number): void {
    this.motionOffsetY = offset;
    // 現在位置を再設定してオフセットを反映
    this.setPosition(this.position);
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
   */
  public move(direction: Vector3, deltaTime: number): void {
    // 速度を計算
    const speed = CHARACTER_CONFIG.speed;
    this.velocity = direction.scale(speed);

    // 新しい位置を計算（モーションオフセットを除いた基準位置を使用）
    const newPosition = this.position.add(this.velocity.scale(deltaTime));

    // 位置を更新
    this.setPosition(newPosition);
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
    const rotationSpeed = CHARACTER_CONFIG.rotationSpeed;

    // 角度差を計算（-π から π の範囲に正規化）
    let diff = targetRotation - this.rotation;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

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

    // ブロックジャンプの横移動を更新
    this.updateBlockJump(deltaTime);

    // 方向サークルを更新
    this.directionCircle.update();
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

    // 遅延時間が経過していない場合は移動しない
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.aiMovementStartTime;
    if (elapsedTime < this.aiMovementDelay) {
      return false; // まだ遅延時間中
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
   * 8角形の面（三角形）を色分けして表示（デバッグ用）
   */
  public showOctagonVertexNumbers(): void {
    this.directionCircle.showOctagonVertexNumbers();
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
    this.currentBallHoldingIndex = index;
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
   * 8角形の面の中心位置を返す
   * @returns ボール保持位置のワールド座標
   */
  public getBallHoldingPosition(): Vector3 {
    if (this.ballHoldingFaces.length === 0) {
      console.warn('[Character] ボール保持位置が設定されていません。キャラクター位置を返します。');
      return this.position.clone();
    }

    // 現在選択されている面の番号を取得
    const faceIndex = this.ballHoldingFaces[this.currentBallHoldingIndex];

    // その面の頂点2つを取得
    const vertex1 = this.getOctagonVertexPosition(faceIndex);
    const vertex2 = this.getOctagonVertexPosition((faceIndex + 1) % 8);

    // 辺の中点を計算
    const edgeMidX = (vertex1.x + vertex2.x) / 2;
    const edgeMidZ = (vertex1.z + vertex2.z) / 2;

    // 辺の中点からキャラクター中心方向へのベクトル
    const towardsCenterX = this.position.x - edgeMidX;
    const towardsCenterZ = this.position.z - edgeMidZ;

    // ベクトルの長さを計算
    const vectorLength = Math.sqrt(towardsCenterX * towardsCenterX + towardsCenterZ * towardsCenterZ);

    // 単位ベクトル化
    const unitX = towardsCenterX / vectorLength;
    const unitZ = towardsCenterZ / vectorLength;

    // 辺から内側に0.3m入った位置（面の中心付近）
    const insetDistance = 0.3;
    const ballX = edgeMidX + unitX * insetDistance;
    const ballZ = edgeMidZ + unitZ * insetDistance;

    // ボールは腰関節の高さに配置（上半身と下半身の境界）
    const ballY = this.waistJointMesh.getAbsolutePosition().y;

    return new Vector3(ballX, ballY, ballZ);
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

    // 目の位置（視野の始点）
    const headOffsetY = 0.6; // 上半身の中心から頭までのオフセット
    const eyeY = 0.03; // 頭の中心から目までのオフセット
    const visionStartPosition = new Vector3(
      characterPosition.x,
      characterPosition.y + headOffsetY + eyeY,
      characterPosition.z
    );

    // 対象までの距離
    const distance = Vector3.Distance(visionStartPosition, targetPosition);

    // 視野範囲外ならfalse
    if (distance > this.visionRange) {
      return false;
    }

    // キャラクターの向き（正面方向）
    const forwardDirection = new Vector3(
      Math.sin(this.rotation),
      0,
      Math.cos(this.rotation)
    );

    // 対象への方向ベクトル
    const toTarget = targetPosition.subtract(visionStartPosition);
    toTarget.y = 0; // Y軸（高さ）は無視して水平面で判定
    toTarget.normalize();

    // 内積から角度を計算
    const dotProduct = Vector3.Dot(forwardDirection, toTarget);
    const angleToTarget = Math.acos(Math.max(-1, Math.min(1, dotProduct))); // clampして安全に

    // 視野角の半分（ラジアン）
    const halfVisionAngleRad = (this.visionAngle / 2) * (Math.PI / 180);

    // 視野角内ならtrue
    return angleToTarget <= halfVisionAngleRad;
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

    // 名前ラベルを作成
    this.createNameLabel();
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
    // power値を取得（デフォルトは50）
    const myPower = this.playerData?.stats.power ?? 50;
    const otherPower = other.playerData?.stats.power ?? 50;

    // power差を計算（-100〜+100の範囲）
    const powerDiff = myPower - otherPower;
    const pushRatio = powerDiff / 100; // -1〜+1

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

    // 押し返し量を計算（サークルが重ならない距離まで離す + 少し余裕）
    const overlap = Math.max(0, minDistance - currentDistance);
    const totalPush = overlap + 0.1; // 0.1mの余裕を追加

    // power差に応じて押し返し量を分配
    // pushRatio > 0: 自分の方がパワーがある → 相手が多く押される
    // pushRatio < 0: 相手の方がパワーがある → 自分が多く押される
    const selfPushAmount = totalPush * (0.5 - pushRatio * 0.5); // pushRatio=1なら0、pushRatio=-1なら1
    const otherPushAmount = totalPush * (0.5 + pushRatio * 0.5); // pushRatio=1なら1、pushRatio=-1なら0

    const selfPush = pushDirection.scale(-selfPushAmount); // 自分は相手の反対方向に押される
    const otherPush = pushDirection.scale(otherPushAmount); // 相手は押し返される

    return { selfPush, otherPush };
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 身体パーツを破棄
    this.headMesh.dispose();
    this.leftEyeMesh.dispose();
    this.rightEyeMesh.dispose();
    this.mouthMesh.dispose();
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
    this.blockJumpTarget = target;

    if (target === null) {
      this.blockLateralDirection = null;
      this.blockForwardDirection = null;
      this.blockForwardSpeed = 0;
      return;
    }

    const shooterPos = target.getPosition();
    const myPos = this.getPosition();
    const shooterRotation = target.getRotation();

    // シューターの向いている方向を計算（シュート方向）
    const shootDirection = new Vector3(
      Math.sin(shooterRotation),
      0,
      Math.cos(shooterRotation)
    ).normalize();

    // シューターからディフェンダーへのベクトル
    const toDefender = myPos.subtract(shooterPos);
    toDefender.y = 0; // 水平面のみ考慮

    // シュート軌道上のディフェンダーに最も近い点を計算
    // 点から直線への最短距離の公式を使用
    const dot = Vector3.Dot(toDefender, shootDirection);
    const closestPointOnTrajectory = shooterPos.add(shootDirection.scale(dot));

    // ディフェンダーから軌道への横方向ベクトル
    const lateralOffset = closestPointOnTrajectory.subtract(myPos);
    lateralOffset.y = 0;

    const lateralDistance = lateralOffset.length();

    // 横方向のずれが小さい場合は真っ直ぐ飛ぶ（横移動なし）
    if (lateralDistance < 0.3) {
      this.blockLateralDirection = null;
    } else if (lateralDistance > 2.0) {
      // 横方向のずれが大きすぎる場合はブロック不可
      this.blockLateralDirection = null;
    } else {
      // 横移動方向を正規化
      this.blockLateralDirection = lateralOffset.normalize();
      // 移動速度は横方向のずれに応じて調整
      // ジャンプの最高点到達時間（約0.35秒）を目安に計算
      const jumpPeakTime = 0.35;
      this.blockLateralSpeed = lateralDistance / jumpPeakTime;
    }

    // 面0同士が接しているかチェックし、前方移動を計算
    const distanceToShooter = toDefender.length();
    const myCircleRadius = this.footCircleRadius;
    const shooterCircleRadius = target.getFootCircleRadius();
    const contactDistance = myCircleRadius + shooterCircleRadius;

    // サークル接触判定（余裕を持って0.2m以内なら接触とみなす）
    const isCircleContact = distanceToShooter <= contactDistance + 0.2;

    if (isCircleContact) {
      // サークルの縮小分を計算（defense_marking: 1.0m → blocking: 0.3m）
      const normalCircleSize = BASE_CIRCLE_SIZE.defense_marking;
      const blockingCircleSize = BASE_CIRCLE_SIZE.blocking;
      const circleShrinkage = normalCircleSize - blockingCircleSize; // 0.7m

      // シューターへの方向（前方移動方向）
      const toShooter = shooterPos.subtract(myPos);
      toShooter.y = 0;
      if (toShooter.length() > 0.01) {
        this.blockForwardDirection = toShooter.normalize();
        // ジャンプの最高点到達時間（約0.35秒）を目安に計算
        const jumpPeakTime = 0.35;
        this.blockForwardSpeed = circleShrinkage / jumpPeakTime;
      }
    } else {
      this.blockForwardDirection = null;
      this.blockForwardSpeed = 0;
    }
  }

  /**
   * ブロックジャンプ中の移動を更新
   * block_shotアクションのstartupまたはactiveフェーズ中に呼び出す
   * 横移動（ボール軌道への移動）と前方移動（サークル縮小分）を適用
   */
  public updateBlockJump(deltaTime: number): void {
    const currentAction = this.actionController.getCurrentAction();
    const phase = this.actionController.getCurrentPhase();

    // block_shotアクションのstartupまたはactiveフェーズ中のみ移動
    const isBlockJumping = currentAction === 'block_shot' && (phase === 'startup' || phase === 'active');

    if (!isBlockJumping) {
      // アクションが終了または別フェーズになったらターゲットをクリア
      if (this.blockJumpTarget !== null && phase !== 'recovery') {
        this.blockJumpTarget = null;
        this.blockLateralDirection = null;
        this.blockForwardDirection = null;
        this.blockForwardSpeed = 0;
      }
      return;
    }

    // 移動量を計算
    let totalMovement = Vector3.Zero();

    // 横移動を計算
    if (this.blockLateralDirection !== null) {
      const lateralMovement = this.blockLateralDirection.scale(this.blockLateralSpeed * deltaTime);
      totalMovement = totalMovement.add(lateralMovement);
    }

    // 前方移動を計算（サークル縮小分）
    if (this.blockForwardDirection !== null && this.blockForwardSpeed > 0) {
      const forwardMovement = this.blockForwardDirection.scale(this.blockForwardSpeed * deltaTime);
      totalMovement = totalMovement.add(forwardMovement);
    }

    // 移動がある場合のみ適用
    if (totalMovement.length() > 0.001) {
      const newPosition = this.position.add(totalMovement);
      this.setPosition(newPosition);
    }
  }

  /**
   * ブロックジャンプのターゲットを取得
   */
  public getBlockJumpTarget(): Character | null {
    return this.blockJumpTarget;
  }
}
