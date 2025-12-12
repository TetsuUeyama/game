import {Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh} from "@babylonjs/core";
import {PLAYER_CONFIG} from "../config/gameConfig";
import {PlayerStats, DEFAULT_PLAYER_STATS} from "./PlayerStats";

/**
 * 手のポーズタイプ
 */
export enum HandPose {
  NEUTRAL = "neutral", // 通常（両サイド）
  DRIBBLE = "dribble", // ドリブル（片手前）
  DEFEND = "defend", // ディフェンス（両手前に広げる）
  SHOOT = "shoot", // シュート（両手上）
}

/**
 * 3Dプレイヤーエンティティ
 */
export class Player {
  private scene: Scene;
  public mesh: Mesh; // 体（カプセル）
  public neckMesh: Mesh; // 首（ゴールを見上げる時に傾ける）
  private faceMesh: Mesh; // 顔（白い板）

  // 左腕（上腕 + 前腕）
  private leftUpperArmMesh: Mesh; // 左上腕
  private leftForearmMesh: Mesh; // 左前腕

  // 右腕（上腕 + 前腕）
  private rightUpperArmMesh: Mesh; // 右上腕
  private rightForearmMesh: Mesh; // 右前腕

  // 手
  public leftHand: Mesh; // 左手（衝突判定用）
  public rightHand: Mesh; // 右手（衝突判定用）

  // 視野
  private visionConeMesh: Mesh; // 視野コーン（可視化用）
  public visionAngle: number; // 視野角（度）
  public visionRange: number; // 視野範囲（m）

  public id: number;
  public name: string;
  public hasBall: boolean = false; // ボールを保持しているか
  public direction: number = 0; // 向き（ラジアン、Y軸周り）
  private currentPose: HandPose = HandPose.NEUTRAL;

  // ジャンプ状態
  public isJumping: boolean = false; // ジャンプ中か
  public jumpVelocity: number = 0; // 垂直方向の速度（m/s）
  private groundY: number = 0; // 地面のY座標

  // プレイヤーの能力値
  public stats: PlayerStats;

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
    this.neckMesh = this.createNeck();
    this.faceMesh = this.createFace();

    // 左腕の作成
    this.leftUpperArmMesh = this.createUpperArm("left");
    this.leftForearmMesh = this.createForearm("left");

    // 右腕の作成
    this.rightUpperArmMesh = this.createUpperArm("right");
    this.rightForearmMesh = this.createForearm("right");

    // 手の作成
    this.leftHand = this.createHand("left");
    this.rightHand = this.createHand("right");

    // 視野コーンの作成
    this.visionConeMesh = this.createVisionCone(color);

    // 顔を首に親子関係で紐付け
    this.faceMesh.parent = this.neckMesh;

    // 上腕を体に紐付け
    this.leftUpperArmMesh.parent = this.mesh;
    this.rightUpperArmMesh.parent = this.mesh;

    // 前腕を上腕に紐付け（関節構造）
    this.leftForearmMesh.parent = this.leftUpperArmMesh;
    this.rightForearmMesh.parent = this.rightUpperArmMesh;

    // 手を前腕に紐付け
    this.leftHand.parent = this.leftForearmMesh;
    this.rightHand.parent = this.rightForearmMesh;

    // 視野コーンを首に紐付け（首の傾きに連動）
    this.visionConeMesh.parent = this.neckMesh;
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
      PLAYER_CONFIG.height / 2 - 0.35, // 頭の少し下
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
   * 上腕（shoulder to elbow）を作成
   */
  private createUpperArm(side: "left" | "right"): Mesh {
    const upperArm = MeshBuilder.CreateCapsule(
      `upper-arm-${side}-${this.id}`,
      {
        radius: 0.15, // 太くした
        height: 0.6, // 上腕の長さ
        tessellation: 8,
      },
      this.scene,
    );

    // 上腕の初期位置（肩の位置）
    const xOffset = side === "left" ? -0.35 : 0.35;
    upperArm.position = new Vector3(
      xOffset,
      0.3, // 肩の高さ
      0,
    );

    // 初期角度：10度斜め下に傾ける
    const angleDown = Math.PI / 18; // 10度 = π/18 ラジアン
    upperArm.rotation = new Vector3(
      0,
      0,
      side === "left" ? -angleDown : angleDown, // 左は左斜め下、右は右斜め下
    );

    // マテリアル（体と同じ色）
    const material = new StandardMaterial(`upper-arm-material-${side}-${this.id}`, this.scene);
    material.diffuseColor = this.mesh.material ? (this.mesh.material as StandardMaterial).diffuseColor.clone() : new Color3(0.5, 0.5, 0.5);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    upperArm.material = material;

    return upperArm;
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
   * 前腕（elbow to wrist）を作成
   */
  private createForearm(side: "left" | "right"): Mesh {
    const forearm = MeshBuilder.CreateCapsule(
      `forearm-${side}-${this.id}`,
      {
        radius: 0.13, // 前腕は少し細い
        height: 0.6, // 前腕の長さ
        tessellation: 8,
      },
      this.scene,
    );

    // 前腕の初期位置（上腕の下端、肘の位置）
    // 親が上腕なので、ローカル座標で指定
    forearm.position = new Vector3(
      0,
      -0.3, // 上腕の下端
      0,
    );

    // マテリアル（体と同じ色）
    const material = new StandardMaterial(`forearm-material-${side}-${this.id}`, this.scene);
    material.diffuseColor = this.mesh.material ? (this.mesh.material as StandardMaterial).diffuseColor.clone() : new Color3(0.5, 0.5, 0.5);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    forearm.material = material;

    return forearm;
  }

  /**
   * 手（hand）を作成（衝突判定用）
   */
  private createHand(side: "left" | "right"): Mesh {
    const hand = MeshBuilder.CreateSphere(
      `hand-${side}-${this.id}`,
      {
        diameter: 0.2, // 手のサイズ
        segments: 8,
      },
      this.scene,
    );

    // 手の初期位置（前腕の先端）
    // 親が前腕なので、ローカル座標で指定
    hand.position = new Vector3(
      0,
      -0.35, // 前腕の先端（前腕の長さ0.6の半分 + 手の半径）
      0,
    );

    // マテリアル（体と同じ色）
    const material = new StandardMaterial(`hand-material-${side}-${this.id}`, this.scene);
    material.diffuseColor = this.mesh.material ? (this.mesh.material as StandardMaterial).diffuseColor.clone() : new Color3(0.5, 0.5, 0.5);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    hand.material = material;

    return hand;
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
    this.direction = angle;
    this.mesh.rotation.y = angle;
  }

  /**
   * ターゲット位置に向かって移動する
   * @param targetPosition 目標位置
   * @param deltaTime フレーム時間（秒）
   * @returns 移動したかどうか
   */
  moveTowards(targetPosition: Vector3, deltaTime: number): boolean {
    const currentPosition = this.getPosition();

    // 水平方向（XZ平面）のみの方向ベクトルを計算（Y座標は無視）
    const dx = targetPosition.x - currentPosition.x;
    const dz = targetPosition.z - currentPosition.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // すでに十分近い場合は移動しない
    if (horizontalDistance < 0.5) {
      return false;
    }

    // 水平方向の単位ベクトル
    const directionX = dx / horizontalDistance;
    const directionZ = dz / horizontalDistance;

    // 移動速度を計算（m/s）
    const speed = PLAYER_CONFIG.speed;
    const moveDistance = speed * deltaTime;

    // 実際の移動距離を制限（ターゲットを超えないように）
    const actualMoveDistance = Math.min(moveDistance, horizontalDistance);

    // 新しい位置を計算（Y座標は現在の値を保持）
    const newPosition = new Vector3(
      currentPosition.x + directionX * actualMoveDistance,
      currentPosition.y, // Y座標は変更しない（ジャンプ中の高さを保持）
      currentPosition.z + directionZ * actualMoveDistance
    );
    this.setPosition(newPosition);

    // プレイヤーの向きを移動方向に設定
    const angle = Math.atan2(directionX, directionZ);
    this.setDirection(angle);

    return true;
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
      console.log(`[Player ${this.id}] 着地！`);
    } else {
      this.mesh.position.y = newY;
      console.log(`[Player ${this.id} JUMP] Set mesh.position.y to ${this.mesh.position.y.toFixed(2)}`);
    }
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
  }

  /**
   * ボールを保持している際のボール位置を取得（体の前）
   * @returns ボールの位置
   */
  getBallHoldPosition(): Vector3 {
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
   * 手のポーズを変更（上腕と前腕の関節を制御）
   */
  setHandPose(pose: HandPose): void {
    this.currentPose = pose;

    switch (pose) {
      case HandPose.NEUTRAL:
        // 通常：両サイド、軽く曲げた状態
        // 左上腕
        this.leftUpperArmMesh.position = new Vector3(-0.35, 0.3, 0);
        this.leftUpperArmMesh.rotation = new Vector3(0, 0, Math.PI / 8);
        // 左前腕（肘で少し曲げる）
        this.leftForearmMesh.rotation = new Vector3(0, 0, Math.PI / 6);

        // 右上腕
        this.rightUpperArmMesh.position = new Vector3(0.35, 0.3, 0);
        this.rightUpperArmMesh.rotation = new Vector3(0, 0, -Math.PI / 8);
        // 右前腕（肘で少し曲げる）
        this.rightForearmMesh.rotation = new Vector3(0, 0, -Math.PI / 6);
        break;

      case HandPose.DRIBBLE:
        // ドリブル：右手を前に出して肘を曲げる、左手はサイド
        // 左上腕（サイド）
        this.leftUpperArmMesh.position = new Vector3(-0.35, 0.3, 0);
        this.leftUpperArmMesh.rotation = new Vector3(0, 0, Math.PI / 8);
        this.leftForearmMesh.rotation = new Vector3(0, 0, Math.PI / 6);

        // 右上腕（前方に伸ばす）
        this.rightUpperArmMesh.position = new Vector3(0.2, 0.15, 0);
        this.rightUpperArmMesh.rotation = new Vector3(Math.PI / 3, 0, -Math.PI / 12);
        // 右前腕（肘を大きく曲げてドリブル）
        this.rightForearmMesh.rotation = new Vector3(Math.PI / 2, 0, 0);
        break;

      case HandPose.DEFEND:
        // ディフェンス：両手を前に広げて、肘を少し曲げる
        // 左上腕（前方＆左）
        this.leftUpperArmMesh.position = new Vector3(-0.4, 0.35, 0);
        this.leftUpperArmMesh.rotation = new Vector3(Math.PI / 6, 0, Math.PI / 6);
        // 左前腕（肘で少し曲げる）
        this.leftForearmMesh.rotation = new Vector3(Math.PI / 8, 0, Math.PI / 8);

        // 右上腕（前方＆右）
        this.rightUpperArmMesh.position = new Vector3(0.4, 0.35, 0);
        this.rightUpperArmMesh.rotation = new Vector3(Math.PI / 6, 0, -Math.PI / 6);
        // 右前腕（肘で少し曲げる）
        this.rightForearmMesh.rotation = new Vector3(Math.PI / 8, 0, -Math.PI / 8);
        break;

      case HandPose.SHOOT:
        // シュート：両手を上に上げて、肘を曲げる
        // 左上腕（上に上げる）
        this.leftUpperArmMesh.position = new Vector3(-0.25, 0.4, 0);
        this.leftUpperArmMesh.rotation = new Vector3(-Math.PI / 4, 0, Math.PI / 12);
        // 左前腕（肘を曲げてボールを持つ）
        this.leftForearmMesh.rotation = new Vector3(-Math.PI / 3, 0, 0);

        // 右上腕（上に上げる）
        this.rightUpperArmMesh.position = new Vector3(0.25, 0.4, 0);
        this.rightUpperArmMesh.rotation = new Vector3(-Math.PI / 4, 0, -Math.PI / 12);
        // 右前腕（肘を曲げてボールを持つ）
        this.rightForearmMesh.rotation = new Vector3(-Math.PI / 3, 0, 0);
        break;
    }
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
   */
  canSeeBall(ballPosition: Vector3): boolean {
    return this.isInVision(ballPosition);
  }

  /**
   * デバッグ情報
   */
  showDebugInfo(): string {
    return `${this.name} | Position: (${this.mesh.position.x.toFixed(1)}, ${this.mesh.position.z.toFixed(1)}) | HasBall: ${this.hasBall}`;
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.visionConeMesh.dispose();
    this.faceMesh.dispose();
    this.leftUpperArmMesh.dispose();
    this.leftForearmMesh.dispose();
    this.rightUpperArmMesh.dispose();
    this.rightForearmMesh.dispose();
    this.leftHand.dispose();
    this.rightHand.dispose();
    this.mesh.dispose();
  }
}
