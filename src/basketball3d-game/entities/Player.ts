import {Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh} from "@babylonjs/core";
import {PLAYER_CONFIG} from "../config/gameConfig";
import {PlayerStats, DEFAULT_PLAYER_STATS} from "./PlayerStats";
import {PlayerMovement} from "./PlayerMovement";
import {Arm, HandPose} from "./Arm";
import {StateManager} from "../states/StateManager";

// HandPoseを再エクスポート（他のファイルからアクセス可能にする）
export {HandPose};

/**
 * 3Dプレイヤーエンティティ
 */
export class Player {
  public scene: Scene; // シーン（PlayerMovementなど外部からアクセスするためpublic）
  public mesh: Mesh; // 体（カプセル）
  public neckMesh: Mesh; // 首（ゴールを見上げる時に傾ける）
  private faceMesh: Mesh; // 顔（白い板）

  // 腕（1本の長いカプセル、ポーズに応じて角度を変える）
  public leftArm: Arm; // 左腕（衝突判定用にpublic）
  public rightArm: Arm; // 右腕（衝突判定用にpublic）

  // 視野
  private visionConeMesh: Mesh; // 視野コーン（可視化用）
  public visionAngle: number; // 視野角（度）
  public visionRange: number; // 視野範囲（m）

  public id: number;
  public name: string;
  public hasBall: boolean = false; // ボールを保持しているか
  public direction: number = 0; // 向き（ラジアン、Y軸周り）
  private currentPose: HandPose = HandPose.NEUTRAL;

  // ドリブル関連
  public isDribbling: boolean = false; // ドリブル中か
  private dribbleTimer: number = 0; // ドリブルタイマー（秒）
  private readonly DRIBBLE_INTERVAL = 0.6; // ドリブル間隔（秒）

  // ジャンプ状態
  public isJumping: boolean = false; // ジャンプ中か
  public jumpVelocity: number = 0; // 垂直方向の速度（m/s）
  private groundY: number = 0; // 地面のY座標

  // プレイヤーの能力値
  public stats: PlayerStats;

  // 移動管理
  private movement: PlayerMovement;

  // 状態管理（新システム）
  public stateManager: StateManager;

  // 状態インジケーター（頭上の球）
  private stateIndicator: Mesh;
  private stateIndicatorMaterial: StandardMaterial;

  constructor(scene: Scene, id: number, name: string, position: Vector3, color: Color3, stats?: PlayerStats) {
    this.scene = scene;
    this.id = id;
    this.name = name;

    // 能力値を設定（指定がなければデフォルト）
    this.stats = stats || {...DEFAULT_PLAYER_STATS};

    // 視野設定を初期化
    this.visionAngle = PLAYER_CONFIG.visionAngle;
    this.visionRange = PLAYER_CONFIG.visionRange;

    this.mesh = this.createPlayer(position, color);

    // 移動管理を初期化（meshを作成した後に初期化）
    this.movement = new PlayerMovement(this);
    this.neckMesh = this.createNeck();
    this.faceMesh = this.createFace();

    // 腕の作成（Armクラスを使用）
    this.leftArm = new Arm(this.scene, "left", this.id, color);
    this.rightArm = new Arm(this.scene, "right", this.id, color);

    // 視野コーンの作成
    this.visionConeMesh = this.createVisionCone(color);

    // 状態インジケーター球の作成
    this.stateIndicator = this.createStateIndicator();

    // 顔を首に親子関係で紐付け
    this.faceMesh.parent = this.neckMesh;

    // 腕を体に紐付け
    this.leftArm.mesh.parent = this.mesh;
    this.rightArm.mesh.parent = this.mesh;

    // 視野コーンを首に紐付け（首の傾きに連動）
    this.visionConeMesh.parent = this.neckMesh;

    // 状態インジケーターを体に紐付け
    this.stateIndicator.parent = this.mesh;

    // 初期ポーズを設定
    this.setHandPose(HandPose.NEUTRAL);

    // 状態管理を初期化（新システム）
    this.stateManager = new StateManager(this);
  }

  /**
   * プレイヤーメッシュを作成（カプセル形状）
   */
  private createPlayer(position: Vector3, color: Color3): Mesh {
    // カプセル（円柱 + 半球）を組み合わせて作成
    const capsule = MeshBuilder.CreateCapsule(
      `player-${this.id}`,
      {
        radius: PLAYER_CONFIG.radius,
        height: PLAYER_CONFIG.height,
        tessellation: 16,
      },
      this.scene,
    );

    capsule.position = position;

    // マテリアル
    const material = new StandardMaterial(`player-material-${this.id}`, this.scene);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    material.emissiveColor = color.scale(0.1); // 少し光る
    material.alpha = 0.5; // 半透明
    capsule.material = material;

    return capsule;
  }

  /**
   * 首を作成（ゴールを見上げる時に傾ける用）
   */
  private createNeck(): Mesh {
    // 首は小さな透明なメッシュ（見た目には表示されない）
    const neck = MeshBuilder.CreateBox(
      `neck-${this.id}`,
      {
        width: 0.2,
        height: 0.3,
        depth: 0.2,
      },
      this.scene,
    );

    // 首の位置（体の上部）
    neck.position = new Vector3(
      0,
      PLAYER_CONFIG.height / 2 - 1.0, // 頭の少し下
      0,
    );

    // 透明にする
    neck.isVisible = false;

    // 首を体の子にする
    neck.parent = this.mesh;

    return neck;
  }

  /**
   * 顔（白い板）を作成
   */
  private createFace(): Mesh {
    const face = MeshBuilder.CreateBox(
      `face-${this.id}`,
      {
        width: 0.5,
        height: 0.5,
        depth: 0.05,
      },
      this.scene,
    );

    // 顔の位置（体の上部、前方）
    face.position = new Vector3(
      0,
      PLAYER_CONFIG.height / 2 - 0.2, // 上部
      PLAYER_CONFIG.radius + 0.025, // 前方
    );

    // 白い板のマテリアル
    const material = new StandardMaterial(`face-material-${this.id}`, this.scene);
    material.diffuseColor = new Color3(1, 1, 1); // 白
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    face.material = material;

    return face;
  }

  /**
   * 視野コーン（円錐形）を作成
   */
  private createVisionCone(playerColor: Color3): Mesh {
    // ========================================
    // 1. 円錐の底面半径を計算
    // ========================================
    // 視野角の半分をラジアンに変換
    const halfAngleRad = (this.visionAngle / 2) * (Math.PI / 180);
    // 視野範囲と視野角から底面の半径を三角関数で計算
    // tan(半角) = 底面半径 / 視野範囲
    const coneRadius = this.visionRange * Math.tan(halfAngleRad);

    // ========================================
    // 2. 円錐メッシュを作成
    // ========================================
    const visionCone = MeshBuilder.CreateCylinder(
      `vision-cone-${this.id}`,
      {
        diameterTop: coneRadius * 0.5, // 底面（広がった部分）の直径
        diameterBottom: 0.5, // 頂点（尖った部分）の直径 = 0
        height: this.visionRange, // 円錐の高さ = 視野範囲
        tessellation: 16, // 円錐の滑らかさ（ポリゴン数）
      },
      this.scene,
    );

    // ========================================
    // 3. 円錐の向きを設定（回転）
    // ========================================
    // デフォルトでは円錐はY軸方向（上向き）に作成される
    // X軸周りに90度回転して、Z軸方向（前方）を向くようにする
    visionCone.rotation = new Vector3(Math.PI / 2, 0, 0);

    // ========================================
    // 4. 円錐の位置を設定
    // ========================================
    // 顔の前面のZ座標を計算
    const faceZ = PLAYER_CONFIG.radius + 0.025;

    visionCone.position = new Vector3(
      0, // X座標: 体の中心（左右中央）
      PLAYER_CONFIG.height / 2 - 0.2, // Y座標: 顔の高さ
      faceZ + this.visionRange / 2, // Z座標: 頂点が顔の位置に来るように中心を前方にずらす
    );

    // ========================================
    // 5. マテリアル（見た目）を設定
    // ========================================
    const material = new StandardMaterial(`vision-cone-material-${this.id}`, this.scene);
    material.diffuseColor = playerColor; // プレイヤーと同じ色
    material.alpha = 0.15; // 透明度（0=完全透明、1=完全不透明）
    material.wireframe = false; // ワイヤーフレーム表示しない
    visionCone.material = material;

    return visionCone;
  }

  /**
   * 状態インジケーター球を作成
   */
  private createStateIndicator(): Mesh {
    // 小さな球を作成
    const sphere = MeshBuilder.CreateSphere(
      `state-indicator-${this.id}`,
      {
        diameter: 0.3, // 直径30cm
        segments: 16,
      },
      this.scene
    );

    // プレイヤーの頭上に配置
    const headTopY = PLAYER_CONFIG.height / 2 + 0.3; // 頭頂部から30cm上
    sphere.position = new Vector3(0, headTopY, 0);

    // マテリアルを作成（初期色はグレー）
    this.stateIndicatorMaterial = new StandardMaterial(`state-indicator-material-${this.id}`, this.scene);
    this.stateIndicatorMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5); // グレー
    this.stateIndicatorMaterial.emissiveColor = new Color3(0.3, 0.3, 0.3); // 発光
    sphere.material = this.stateIndicatorMaterial;

    // 衝突判定を無効化
    sphere.isPickable = false;
    sphere.checkCollisions = false;

    return sphere;
  }

  /**
   * 状態インジケーターの色を設定
   * @param color 色
   */
  public setStateIndicatorColor(color: Color3): void {
    this.stateIndicatorMaterial.diffuseColor = color;
    this.stateIndicatorMaterial.emissiveColor = color.scale(0.6); // 発光色は少し暗めに
  }

  /**
   * 位置を取得
   */
  getPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  /**
   * 位置を設定
   */
  setPosition(position: Vector3): void {
    // プレイヤーの最小Y座標（地面に接する高さ）
    // カプセルの中心から底までの距離 = height/2
    const minY = PLAYER_CONFIG.height / 2;

    // Y座標が地面より下にならないように制限
    const clampedPosition = new Vector3(position.x, Math.max(position.y, minY), position.z);

    this.mesh.position = clampedPosition;
  }

  /**
   * 向きを設定（ラジアン）
   */
  setDirection(angle: number): void {
    this.movement.setDirection(angle);
  }

  /**
   * ターゲット位置に向かって移動する
   * @param targetPosition 目標位置
   * @param deltaTime フレーム時間（秒）
   * @returns 移動したかどうか
   */
  moveTowards(targetPosition: Vector3, deltaTime: number): boolean {
    return this.movement.moveTowards(targetPosition, deltaTime);
  }

  /**
   * 左右に移動（ストレイフ）
   * @param direction 移動方向（"left" または "right"）
   * @param deltaTime フレーム時間（秒）
   */
  moveSideways(direction: "left" | "right", deltaTime: number): void {
    this.movement.moveSideways(direction, deltaTime);
  }

  /**
   * ジャンプを開始
   */
  startJump(): void {
    if (!this.isJumping) {
      this.isJumping = true;
      this.jumpVelocity = 4.0; // 初速度4m/s（ジャンプ高さ約0.8m）
      this.groundY = PLAYER_CONFIG.height / 2; // 地面の高さを記録
      console.log(`[Player ${this.id}] ジャンプ開始！velocity=${this.jumpVelocity}, groundY=${this.groundY}`);
    }
  }

  /**
   * ジャンプの物理演算を更新
   * @param deltaTime フレーム時間（秒）
   */
  updateJump(deltaTime: number): void {
    if (!this.isJumping) {
      return;
    }

    const gravity = 9.81; // 重力加速度（m/s²）

    // 速度を更新（重力を適用）
    this.jumpVelocity -= gravity * deltaTime;

    // 位置を更新
    const currentPosition = this.getPosition();
    const oldY = currentPosition.y;
    const newY = currentPosition.y + this.jumpVelocity * deltaTime;

    console.log(`[Player ${this.id} JUMP] velocity: ${this.jumpVelocity.toFixed(2)}, oldY: ${oldY.toFixed(2)}, newY: ${newY.toFixed(2)}, groundY: ${this.groundY.toFixed(2)}`);

    // 地面に着地したかチェック
    if (newY <= this.groundY) {
      this.mesh.position.y = this.groundY;
      this.isJumping = false;
      this.jumpVelocity = 0;

      // ブロック・レイアップポーズから通常ポーズに戻す
      if (this.currentPose === HandPose.BLOCK || this.currentPose === HandPose.LAYUP) {
        this.setHandPose(HandPose.NEUTRAL);
      }

      console.log(`[Player ${this.id}] 着地！`);
    } else {
      this.mesh.position.y = newY;
      console.log(`[Player ${this.id} JUMP] Set mesh.position.y to ${this.mesh.position.y.toFixed(2)}`);
    }

    // 重心デバッグメッシュを更新（ジャンプ時のY座標変化を反映）
    this.movement.updateDebugMesh();
  }

  /**
   * ダッシュ状態を更新（クールダウン管理）
   * @param deltaTime フレーム時間（秒）
   */
  updateDash(deltaTime: number): void {
    this.movement.updateDash(deltaTime);
  }

  /**
   * 腕を伸ばした時のボール保持位置の高さを取得
   * @returns ボール保持位置（腕を上に伸ばした状態）
   */
  getExtendedArmBallPosition(): Vector3 {
    const position = this.getPosition();
    // 腕を上に伸ばした高さ = プレイヤーの高さ + 腕の長さ
    const armExtension = 0.7; // 腕を伸ばした時の追加高さ（m）
    return new Vector3(
      position.x,
      position.y + armExtension,
      position.z
    );
  }

  /**
   * ボールを保持する
   */
  grabBall(): void {
    this.hasBall = true;
  }

  /**
   * ボールを手放す
   */
  releaseBall(): void {
    this.hasBall = false;
    this.isDribbling = false;
  }

  /**
   * ドリブル更新（外部から呼ぶ）
   * @returns ボールをバウンドさせるべきか
   */
  updateDribble(deltaTime: number): boolean {
    if (!this.hasBall || this.currentPose !== HandPose.DRIBBLE) {
      this.isDribbling = false;
      this.dribbleTimer = 0;
      return false;
    }

    this.isDribbling = true;
    this.dribbleTimer += deltaTime;

    // ドリブル間隔に達したらバウンド
    if (this.dribbleTimer >= this.DRIBBLE_INTERVAL) {
      this.dribbleTimer = 0;
      return true; // ボールをバウンドさせる
    }

    return false;
  }

  /**
   * ドリブル時のボール速度を取得
   */
  getDribbleBallVelocity(): Vector3 {
    // プレイヤーの移動速度を取得
    const playerVelocity = this.movement.getCenterOfMassVelocity();

    // 下向きの速度 + プレイヤーの水平速度
    return new Vector3(
      playerVelocity.x, // 水平方向X（プレイヤーと一緒に移動）
      -4.0,             // 垂直方向（下向き）
      playerVelocity.z  // 水平方向Z（プレイヤーと一緒に移動）
    );
  }

  /**
   * ボールを保持している際のボール位置を取得（体の前）
   * @returns ボールの位置
   */
  getBallHoldPosition(): Vector3 {
    // ドリブル、シュート、レイアップポーズの場合は右手の先端位置
    if (this.currentPose === HandPose.DRIBBLE || this.currentPose === HandPose.SHOOT || this.currentPose === HandPose.LAYUP) {
      return this.rightArm.getTipPosition();
    }

    // ボールキープ（左）の場合は左手の先端位置
    if (this.currentPose === HandPose.BALL_KEEP_LEFT) {
      return this.leftArm.getTipPosition();
    }

    // ボールキープ（右）の場合は右手の先端位置
    if (this.currentPose === HandPose.BALL_KEEP_RIGHT) {
      return this.rightArm.getTipPosition();
    }

    // それ以外は体の前
    const playerPosition = this.getPosition();

    // プレイヤーの前方方向を計算
    const forwardX = Math.sin(this.direction);
    const forwardZ = Math.cos(this.direction);

    // 体の前、高さは身長の半分、横は横幅の半分
    return new Vector3(
      playerPosition.x + forwardX * PLAYER_CONFIG.radius, // 前方に横幅の半分
      playerPosition.y, // 身長の半分（プレイヤーの中心位置）
      playerPosition.z + forwardZ * PLAYER_CONFIG.radius
    );
  }

  /**
   * 手のポーズを変更（腕の角度を制御）
   */
  setHandPose(pose: HandPose): void {
    this.currentPose = pose;
    this.leftArm.setPose(pose);
    this.rightArm.setPose(pose);
  }

  /**
   * 現在の手のポーズを取得
   */
  getHandPose(): HandPose {
    return this.currentPose;
  }

  /**
   * 視野コーンの表示/非表示を切り替え
   */
  setVisionVisible(visible: boolean): void {
    this.visionConeMesh.isVisible = visible;
  }

  /**
   * 指定した位置が視野内にあるかを判定
   * @param targetPosition 対象の位置
   * @returns 視野内にある場合はtrue
   */
  isInVision(targetPosition: Vector3): boolean {
    const playerPosition = this.getPosition();

    // 顔の位置（視野の始点）
    const faceHeight = PLAYER_CONFIG.height / 2 - 0.2;
    const visionStartPosition = new Vector3(playerPosition.x, playerPosition.y + faceHeight, playerPosition.z);

    // 対象までの距離
    const distance = Vector3.Distance(visionStartPosition, targetPosition);

    // 視野範囲外ならfalse
    if (distance > this.visionRange) {
      return false;
    }

    // プレイヤーの向き（顔の正面方向）
    const forwardDirection = new Vector3(Math.sin(this.direction), 0, Math.cos(this.direction));

    // 対象への方向ベクトル
    const toTarget = targetPosition.subtract(visionStartPosition);
    toTarget.y = 0; // Y軸（高さ）は無視して水平面で判定
    toTarget.normalize();

    // 内積から角度を計算
    const dotProduct = Vector3.Dot(forwardDirection, toTarget);
    const angleToTarget = Math.acos(dotProduct);

    // 視野角の半分（ラジアン）
    const halfVisionAngleRad = (this.visionAngle / 2) * (Math.PI / 180);

    // 視野角内ならtrue
    return angleToTarget <= halfVisionAngleRad;
  }

  /**
   * 別のプレイヤーが視野内にいるかを判定
   */
  canSeePlayer(otherPlayer: Player): boolean {
    return this.isInVision(otherPlayer.getPosition());
  }

  /**
   * ボールが視野内にあるかを判定
   * ボールは常に位置を把握できるため、常にtrueを返す
   * （視野コーンは相手プレイヤーの把握用）
   */
  canSeeBall(_ballPosition: Vector3): boolean {
    // ボールの位置は常に把握している
    return true;
  }

  /**
   * デバッグ情報
   */
  showDebugInfo(): string {
    return `${this.name} | Position: (${this.mesh.position.x.toFixed(1)}, ${this.mesh.position.z.toFixed(1)}) | HasBall: ${this.hasBall}`;
  }

  /**
   * 重心のデバッグ表示を設定
   */
  setMovementDebugMode(enabled: boolean): void {
    this.movement.setDebugMode(enabled, this.scene);
  }

  /**
   * 移動可能範囲の表示を設定
   */
  setReachableRangeVisible(enabled: boolean): void {
    this.movement.setReachableRangeVisible(enabled, this.scene);
  }

  /**
   * ダッシュを開始
   */
  startDash(): boolean {
    return this.movement.startDash();
  }

  /**
   * ダッシュ中かどうかを取得
   */
  isDashing(): boolean {
    return this.movement.getIsDashing();
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.movement.dispose();
    this.visionConeMesh.dispose();
    this.faceMesh.dispose();
    this.leftArm.dispose(); // Armクラスのdisposeを呼ぶ
    this.rightArm.dispose(); // Armクラスのdisposeを呼ぶ
    this.mesh.dispose();
  }
}
