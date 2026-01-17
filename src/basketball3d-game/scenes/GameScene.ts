import {Scene, Engine, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3} from "@babylonjs/core";
import {Court} from "../entities/Court";
import {Player, HandPose} from "../entities/Player";
import {Ball} from "../entities/Ball";
import {CAMERA_CONFIG, LIGHT_CONFIG, COURT_CONFIG, BALL_CONFIG, PLAYER_CONFIG} from "../config/gameConfig";
import {ShootController} from "../controllers/ShootController";
import {CollisionHandler} from "../controllers/CollisionHandler";
import {MovementController} from "../controllers/MovementController";
import {DEFAULT_PLAYER_STATS} from "../entities/PlayerStats";
import {GameContextHelper} from "../actions/GameContextHelper";
import {DashAction} from "../actions/movement/DashAction";
import {JumpAction} from "../actions/movement/JumpAction";

/**
 * 3Dバスケットゲームのメインシーン
 */
export class GameScene {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private court: Court;
  private player1: Player;
  private player2: Player;
  private ball: Ball;
  private lastFrameTime: number = Date.now();

  // Player2の有効/無効フラグ（デフォルトはtrue）
  public player2Enabled: boolean = true;

  // コントローラー
  private shootController: ShootController;
  private collisionHandler: CollisionHandler;
  private movementController: MovementController;

  // プレイヤー1の手動アクション
  private player1DashAction: DashAction;
  private player1DashRequested: boolean = false;
  private player1JumpAction: JumpAction;
  private player1JumpRequested: boolean = false;

  // プレイヤー1の移動キー状態
  private keyW: boolean = false;
  private keyA: boolean = false;
  private keyS: boolean = false;
  private keyD: boolean = false;
  private keyQ: boolean = false;
  private keyE: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    // WebGLサポートチェック（テスト用キャンバスを使用して、実際のキャンバスのコンテキストを消費しない）
    const testCanvas = document.createElement("canvas");
    const webglSupported = !!(testCanvas.getContext("webgl2") || testCanvas.getContext("webgl"));
    if (!webglSupported) {
      throw new Error("WebGL is not supported in this browser. Please use a modern browser that supports WebGL.");
    }

    // エンジンの作成
    try {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
    } catch (error) {
      console.error("[GameScene] Engine creation failed:", error);
      throw new Error(`Failed to create Babylon.js engine: ${error}`);
    }

    // シーンの作成
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color3(0.1, 0.1, 0.15).toColor4();

    // カメラの設定
    this.camera = this.createCamera(canvas);

    // ライトの設定
    this.createLights();

    // コートの作成
    this.court = new Court(this.scene);

    // プレイヤーの作成
    this.player1 = this.createPlayer1();
    this.player2 = this.createPlayer2();

    // ボールの作成
    this.ball = this.createBall();

    // コントローラーの初期化
    this.shootController = new ShootController(this.ball, this.player1, this.player2);
    this.collisionHandler = new CollisionHandler(
      this.ball,
      this.player1,
      this.player2,
      this.player2Enabled,
      this.court.backboards,
      (_goalOwner) => this.resetBallToCenter(),
      (_playerId) => {
        // ボール拾得時のコールバック（必要に応じて処理を追加）
      }
    );
    this.movementController = new MovementController(this.player1, this.player2, this.player2Enabled);

    // プレイヤー1のアクション初期化
    this.player1DashAction = new DashAction(Vector3.Zero(), HandPose.NEUTRAL);
    this.player1JumpAction = new JumpAction(HandPose.NEUTRAL);

    // レンダーループの開始
    this.startRenderLoop();

    // ウィンドウリサイズ対応
    window.addEventListener("resize", () => {
      this.engine.resize();
    });

    // キーボードイベント（テスト用）
    this.setupKeyboardControls();

    // 重心デバッグモードを常に有効化
    this.movementDebugMode = true;
    this.player1.setMovementDebugMode(true);
    this.player2.setMovementDebugMode(true);

    console.log("[GameScene] 3Dバスケットゲーム初期化完了");
  }

  /**
   * キーボード操作をセットアップ（テスト用）
   */
  private setupKeyboardControls(): void {
    this.scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case 1: // KEYDOWN
          switch (kbInfo.event.key.toLowerCase()) {
            // 移動キー（WASD）
            case "w":
              this.keyW = true;
              break;
            case "a":
              this.keyA = true;
              break;
            case "s":
              this.keyS = true;
              break;
            case "d":
              this.keyD = true;
              break;
            // 回転キー（QE）
            case "q":
              this.keyQ = true;
              break;
            case "e":
              this.keyE = true;
              break;
          }
          switch (kbInfo.event.key) {
            case "1":
              // 通常ポーズ
              this.player1.setHandPose(HandPose.NEUTRAL);
              this.player2.setHandPose(HandPose.NEUTRAL);
              console.log("[GameScene] Hand Pose: NEUTRAL");
              break;
            case "2":
              // ドリブルポーズ
              this.player1.setHandPose(HandPose.DRIBBLE);
              this.player2.setHandPose(HandPose.DRIBBLE);
              console.log("[GameScene] Hand Pose: DRIBBLE");
              break;
            case "3":
              // ディフェンスポーズ
              this.player1.setHandPose(HandPose.DEFEND);
              this.player2.setHandPose(HandPose.DEFEND);
              console.log("[GameScene] Hand Pose: DEFEND");
              break;
            case "4":
              // シュートポーズ
              this.player1.setHandPose(HandPose.SHOOT);
              this.player2.setHandPose(HandPose.SHOOT);
              console.log("[GameScene] Hand Pose: SHOOT");
              break;
            case "5":
              // レイアップポーズ
              this.player1.setHandPose(HandPose.LAYUP);
              this.player2.setHandPose(HandPose.LAYUP);
              console.log("[GameScene] Hand Pose: LAYUP");
              break;
            case "6":
              // ジャンプ（Player1のみ、フレーム管理付き）
              if (!this.player1JumpAction.isInProgress()) {
                this.player1JumpRequested = true;
                console.log("[GameScene] JUMP requested!");
              }
              break;
            case "7":
              // ダッシュ（Player1のみ、フレーム管理付き）
              if (!this.player1DashAction.isInProgress()) {
                this.player1DashRequested = true;
                console.log("[GameScene] DASH requested!");
              }
              break;
            case "8":
              // 重心デバッグモードの切り替え
              this.toggleMovementDebugMode();
              break;
            case "9":
              // 移動可能範囲表示の切り替え
              this.toggleReachableRangeMode();
              break;
          }
          break;
        case 2: // KEYUP
          switch (kbInfo.event.key.toLowerCase()) {
            // 移動キー（WASD）
            case "w":
              this.keyW = false;
              break;
            case "a":
              this.keyA = false;
              break;
            case "s":
              this.keyS = false;
              break;
            case "d":
              this.keyD = false;
              break;
            // 回転キー（QE）
            case "q":
              this.keyQ = false;
              break;
            case "e":
              this.keyE = false;
              break;
          }
          break;
      }
    });
  }

  /**
   * Player1の手動移動処理（WASDQE）
   */
  private handlePlayer1ManualMovement(deltaTime: number): void {
    const rotationSpeed = 3.0; // 回転速度（ラジアン/秒）

    // 回転処理（Q: 左回転、E: 右回転）
    if (this.keyQ) {
      const currentDirection = this.player1.direction;
      this.player1.setDirection(currentDirection + rotationSpeed * deltaTime);
    }
    if (this.keyE) {
      const currentDirection = this.player1.direction;
      this.player1.setDirection(currentDirection - rotationSpeed * deltaTime);
    }

    // 移動処理（WASD）
    let moveX = 0;
    let moveZ = 0;

    if (this.keyW) {
      // 前進（プレイヤーの向いている方向）
      moveX += Math.sin(this.player1.direction);
      moveZ += Math.cos(this.player1.direction);
    }
    if (this.keyS) {
      // 後退（プレイヤーの向いている方向の逆）
      moveX -= Math.sin(this.player1.direction);
      moveZ -= Math.cos(this.player1.direction);
    }
    if (this.keyA) {
      // 左移動（プレイヤーの向いている方向の左）
      moveX -= Math.cos(this.player1.direction);
      moveZ += Math.sin(this.player1.direction);
    }
    if (this.keyD) {
      // 右移動（プレイヤーの向いている方向の右）
      moveX += Math.cos(this.player1.direction);
      moveZ -= Math.sin(this.player1.direction);
    }

    // 移動がある場合、目標位置を計算して移動
    if (moveX !== 0 || moveZ !== 0) {
      // 移動ベクトルを正規化
      const magnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= magnitude;
      moveZ /= magnitude;

      // 目標位置を計算（現在位置から少し先）
      const currentPos = this.player1.getPosition();
      const targetPos = new Vector3(
        currentPos.x + moveX * 10.0, // 10m先を目標に設定
        currentPos.y,
        currentPos.z + moveZ * 10.0
      );

      // 移動
      this.player1.moveTowards(targetPos, deltaTime);
    }
  }

  /**
   * 重心デバッグモードの切り替え
   */
  private movementDebugMode: boolean = false;
  private toggleMovementDebugMode(): void {
    this.movementDebugMode = !this.movementDebugMode;
    this.player1.setMovementDebugMode(this.movementDebugMode);
    this.player2.setMovementDebugMode(this.movementDebugMode);
    console.log(`[GameScene] Movement Debug Mode: ${this.movementDebugMode ? "ON" : "OFF"}`);
  }

  /**
   * 移動可能範囲表示モードの切り替え
   */
  private reachableRangeMode: boolean = false;
  private toggleReachableRangeMode(): void {
    this.reachableRangeMode = !this.reachableRangeMode;
    this.player1.setReachableRangeVisible(this.reachableRangeMode);
    this.player2.setReachableRangeVisible(this.reachableRangeMode);
    console.log(`[GameScene] Reachable Range Mode: ${this.reachableRangeMode ? "ON" : "OFF"}`);
  }

  /**
   * カメラを作成
   */
  private createCamera(canvas: HTMLCanvasElement): ArcRotateCamera {
    const {initialPosition, initialTarget} = CAMERA_CONFIG;

    // ArcRotateCamera（回転可能なカメラ）
    const camera = new ArcRotateCamera(
      "camera",
      0, // alpha（水平角度）
      0, // beta（垂直角度）
      1, // radius（距離）
      new Vector3(initialTarget.x, initialTarget.y, initialTarget.z),
      this.scene,
    );

    // カメラの初期位置を設定
    camera.setPosition(new Vector3(initialPosition.x, initialPosition.y, initialPosition.z));

    // カメラの制限
    camera.lowerRadiusLimit = 5; // 最小距離
    camera.upperRadiusLimit = 50; // 最大距離
    camera.lowerBetaLimit = 0.1; // 最小垂直角度
    camera.upperBetaLimit = Math.PI / 2 - 0.1; // 最大垂直角度（地面より下に行かない）

    // マウス/タッチ操作を有効化
    camera.attachControl(canvas, true);

    // カメラの速度調整
    camera.wheelPrecision = 50; // ズーム速度
    camera.panningSensibility = 100; // パン速度

    return camera;
  }

  /**
   * ライトを作成
   */
  private createLights(): void {
    // 環境光（ヘミスフェリックライト）
    const hemispheric = new HemisphericLight("hemispheric-light", new Vector3(LIGHT_CONFIG.hemispheric.direction.x, LIGHT_CONFIG.hemispheric.direction.y, LIGHT_CONFIG.hemispheric.direction.z), this.scene);
    hemispheric.intensity = LIGHT_CONFIG.hemispheric.intensity;

    // 太陽光（ディレクショナルライト）
    const directional = new DirectionalLight("directional-light", new Vector3(LIGHT_CONFIG.directional.direction.x, LIGHT_CONFIG.directional.direction.y, LIGHT_CONFIG.directional.direction.z), this.scene);
    directional.intensity = LIGHT_CONFIG.directional.intensity;
  }

  /**
   * プレイヤー1を作成（青色、左側スタート）
   * 軽量級（70kg）- 素早く動けるが押されやすい
   */
  private createPlayer1(): Player {
    const startPosition = new Vector3(
      0,
      0.95, // 地面からプレイヤーの半分の高さ
      -COURT_CONFIG.length / 4,
    );

    // 軽量プレイヤー: 素早く加速・減速するが、慣性が小さく押されやすい
    const stats = {
      ...DEFAULT_PLAYER_STATS,
      weight: 70, // 軽量（70kg）
    };

    const player1 = new Player(
      this.scene,
      1,
      "Player 1 (Light)",
      startPosition,
      new Color3(0, 0.5, 1), // 青色
      stats
    );

    console.log("[GameScene] Player 1 (70kg) 作成完了");
    return player1;
  }

  /**
   * プレイヤー2を作成（赤色、右側スタート）
   * 重量級（90kg）- 加速は遅いが慣性が大きく押されにくい
   */
  private createPlayer2(): Player {
    const startPosition = new Vector3(0, 0.95, COURT_CONFIG.length / 4);

    // 重量プレイヤー: 加速・減速は遅いが、慣性が大きく押されにくい
    const stats = {
      ...DEFAULT_PLAYER_STATS,
      weight: 90, // 重量（90kg）
    };

    const player2 = new Player(
      this.scene,
      2,
      "Player 2 (Heavy)",
      startPosition,
      new Color3(1, 0.2, 0), // 赤色
      stats
    );

    // Player2の初期向きを設定（コート中央に向ける = -Z方向）
    player2.setDirection(Math.PI); // 180度回転

    console.log("[GameScene] Player 2 (90kg) 作成完了");
    return player2;
  }

  /**
   * ボールを作成（コート中央）
   */
  private createBall(): Ball {
    const startPosition = new Vector3(
      0,
      BALL_CONFIG.radius, // 地面からボールの半径分の高さ（0.25m）
      0,
    );

    const ball = new Ball(this.scene, startPosition);

    console.log("[GameScene] ボール作成完了");
    return ball;
  }

  /**
   * レンダーループを開始
   */
  private startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      // デルタタイムを計算（秒単位）
      const currentTime = Date.now();
      const deltaTime = (currentTime - this.lastFrameTime) / 1000;
      this.lastFrameTime = currentTime;

      // ゲームロジックの更新
      this.update(deltaTime);

      // シーンをレンダリング
      this.scene.render();
    });
  }

  /**
   * プレイヤーに重力を適用
   * ジャンプ中は Player.updateJump() が処理するのでスキップ
   */
  private applyPlayerGravity(player: Player): void {
    // ジャンプ中は Player.updateJump() が重力を処理するのでスキップ
    if (player.isJumping) {
      return;
    }

    const position = player.getPosition();
    const height = PLAYER_CONFIG.height;
    const groundY = height / 2; // 0.95m

    // 地面より上にいる場合は地面に戻す（ジャンプ以外で浮いた場合の処理）
    if (position.y > groundY) {
      player.setPosition(new Vector3(position.x, groundY, position.z));
    }
  }

  /**
   * ゴール後の処理：ボールを最も近いプレイヤーに渡す
   */
  private resetBallToCenter(): void {
    // ボールの速度をゼロに
    this.ball.setVelocity(Vector3.Zero());

    // 最も近いプレイヤーを探す
    const ballPosition = this.ball.getPosition();
    const distanceToPlayer1 = Vector3.Distance(ballPosition, this.player1.getPosition());
    const distanceToPlayer2 = this.player2Enabled ? Vector3.Distance(ballPosition, this.player2.getPosition()) : Infinity;

    // 近い方のプレイヤーにボールを渡す
    if (distanceToPlayer1 <= distanceToPlayer2) {
      // Player1にボールを渡す
      this.player1.grabBall();
      this.ball.pickUp(this.player1.id);
      const player1HoldPosition = this.player1.getBallHoldPosition();
      this.ball.setPosition(player1HoldPosition);
      console.log("[GameScene] Ball given to Player1 after goal");
    } else {
      // Player2にボールを渡す
      this.player2.grabBall();
      this.ball.pickUp(this.player2.id);
      const player2HoldPosition = this.player2.getBallHoldPosition();
      this.ball.setPosition(player2HoldPosition);
      console.log("[GameScene] Ball given to Player2 after goal");
    }
  }

  /**
   * ゲームロジックを更新
   */
  private update(deltaTime: number): void {
    const ballPosition = this.ball.getPosition();

    // コートを更新（ネットの物理シミュレーション）
    this.court.update(deltaTime);

    // クールダウンを更新
    this.shootController.updateCooldowns(deltaTime);

    // プレイヤーのジャンプを更新
    this.player1.updateJump(deltaTime);
    if (this.player2Enabled) {
      this.player2.updateJump(deltaTime);
    }

    // プレイヤーのダッシュ状態を更新（クールダウン管理）
    this.player1.updateDash(deltaTime);
    if (this.player2Enabled) {
      this.player2.updateDash(deltaTime);
    }

    // レイアップジャンプ中の処理
    this.shootController.updateLayupJump(this.player1, 1, this.shootController.getLayupGoalZ(1));
    if (this.player2Enabled) {
      this.shootController.updateLayupJump(this.player2, 2, this.shootController.getLayupGoalZ(2));
    }

    // ========================================
    // 新システム：状態ベースの移動とアクション
    // ========================================

    // Player1用のGameContextを作成
    const player1GoalZ = this.movementController.getRimCenterZ("player2");
    const player1OpponentGoalZ = this.movementController.getRimCenterZ("player1");
    const player1Context = GameContextHelper.create(
      this.player1,
      this.player2Enabled ? this.player2 : null,
      this.ball,
      player1GoalZ,
      player1OpponentGoalZ,
      deltaTime,
      this.player2Enabled
    );

    // Player1の状態を更新（移動とアクションを自動実行）
    this.player1.stateManager.update(player1Context);

    // Player1の手動ダッシュ処理
    if (this.player1DashRequested || this.player1DashAction.isInProgress()) {
      // ダッシュ先の目標位置を設定（進行方向に5m先）
      const player1Pos = this.player1.getPosition();
      const direction = this.player1.direction;
      const dashTargetPos = new Vector3(
        player1Pos.x + Math.sin(direction) * 5.0,
        player1Pos.y,
        player1Pos.z + Math.cos(direction) * 5.0
      );
      this.player1DashAction.setTarget(dashTargetPos);

      // ダッシュアクションを実行
      if (this.player1DashAction.canExecute(this.player1, player1Context)) {
        this.player1DashAction.execute(this.player1, player1Context);
        this.player1DashRequested = false;
      }
    }

    // Player1の手動ジャンプ処理
    if (this.player1JumpRequested || this.player1JumpAction.isInProgress()) {
      // ジャンプアクションを実行
      if (this.player1JumpAction.canExecute(this.player1, player1Context)) {
        this.player1JumpAction.execute(this.player1, player1Context);
        this.player1JumpRequested = false;
      }
    }

    // Player1の手動移動処理（WASDQE）
    this.handlePlayer1ManualMovement(deltaTime);

    // Player2用のGameContextを作成（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      const player2GoalZ = this.movementController.getRimCenterZ("player1");
      const player2OpponentGoalZ = this.movementController.getRimCenterZ("player2");
      const player2Context = GameContextHelper.create(
        this.player2,
        this.player1,
        this.ball,
        player2GoalZ,
        player2OpponentGoalZ,
        deltaTime,
        this.player2Enabled
      );

      // Player2の状態を更新（移動とアクションを自動実行）
      this.player2.stateManager.update(player2Context);
    }

    // プレイヤー同士の衝突処理（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      this.collisionHandler.handlePlayerCollision();
    }

    // プレイヤー1とボールの衝突処理
    this.collisionHandler.handleBallCollision(this.player1, this.shootController.getPickupCooldown(1));

    // プレイヤー2とボールの衝突処理（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      this.collisionHandler.handleBallCollision(this.player2, this.shootController.getPickupCooldown(2));
    }

    // ボールスティール判定（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      this.collisionHandler.handleBallSteal();
    }

    // ドリブル更新
    this.updateDribble(deltaTime);

    // ボールを保持しているプレイヤーがいる場合、ボール位置を更新（ドリブル中は除く）
    if (this.player1.hasBall && !this.ball.isDribbling) {
      const ballHoldPosition = this.player1.getBallHoldPosition();
      this.ball.setPosition(ballHoldPosition);
    } else if (this.player2.hasBall && !this.ball.isDribbling) {
      const ballHoldPosition = this.player2.getBallHoldPosition();
      this.ball.setPosition(ballHoldPosition);
    }

    // ボールの物理演算（転がりと減速）
    this.ball.updatePhysics(deltaTime);

    // ネットとの衝突判定（ボールがネットを通過した場合、ネットを揺らす）
    this.updateNetCollisions();

    // リムとの衝突判定（ボールがフリーの場合のみ）
    if (this.ball.isFree()) {
      this.collisionHandler.handleRimCollisions();
    }

    // バックボードとの衝突判定（ボールがフリーの場合のみ）
    if (this.ball.isFree()) {
      this.collisionHandler.handleBackboardCollisions();
    }

    // 空中のボールとプレイヤーの物理的接触判定（シュートブロック）
    this.collisionHandler.handleBallPhysicalContact();

    // プレイヤーに重力を適用（地面に着地）
    this.applyPlayerGravity(this.player1);
    if (this.player2Enabled) {
      this.applyPlayerGravity(this.player2);
    }

    // プレイヤーを境界内に制限（壁・天井との衝突）
    this.collisionHandler.constrainPlayerToBounds(this.player1);
    this.collisionHandler.constrainPlayerToBounds(this.player2);

    // プレイヤーとバックボードの衝突判定
    this.collisionHandler.handlePlayerBackboardCollisions();

    // ボールがフリーの場合のみ、境界内に制限（保持中は頭の上なので制限不要）
    if (this.ball.isFree()) {
      this.collisionHandler.constrainBallToBounds();
    }
  }

  /**
   * ドリブル処理を更新
   */
  private updateDribble(deltaTime: number): void {
    // Player1のドリブル
    if (this.player1.updateDribble(deltaTime)) {
      // ドリブルバウンド開始
      this.ball.startDribble();
      const velocity = this.player1.getDribbleBallVelocity();
      this.ball.setVelocity(velocity);
      console.log(`[DRIBBLE] Player1 bouncing ball`);
    }

    // Player2のドリブル
    if (this.player2Enabled && this.player2.updateDribble(deltaTime)) {
      // ドリブルバウンド開始
      this.ball.startDribble();
      const velocity = this.player2.getDribbleBallVelocity();
      this.ball.setVelocity(velocity);
      console.log(`[DRIBBLE] Player2 bouncing ball`);
    }

    // ドリブル中のボールが地面に接触したら拾い直す
    if (this.ball.isDribbling) {
      const ballPosition = this.ball.getPosition();
      const isOnGround = ballPosition.y <= BALL_CONFIG.radius + 0.01;

      if (isOnGround) {
        // ボールをドリブル状態から通常保持状態に戻す
        this.ball.stopDribble();
        this.ball.setVelocity(Vector3.Zero());
        console.log(`[DRIBBLE] Ball caught after bounce`);
      }
    }
  }

  /**
   * シーンを取得
   */
  getScene(): Scene {
    return this.scene;
  }

  /**
   * Player2の有効/無効を設定
   */
  setPlayer2Enabled(enabled: boolean): void {
    this.player2Enabled = enabled;

    // Player2のメッシュの表示/非表示を切り替え
    this.player2.mesh.setEnabled(enabled);

    // Player2が無効の場合、ボールを持っていたら手放す
    if (!enabled && this.player2.hasBall) {
      this.player2.releaseBall();
      this.ball.release();
    }
  }

  /**
   * Player2が有効かどうかを取得
   */
  isPlayer2Enabled(): boolean {
    return this.player2Enabled;
  }

  /**
   * ネットとボールの衝突判定
   */
  private updateNetCollisions(): void {
    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();
    const ballRadius = 0.25; // BALL_CONFIG.radius

    // 各ネットとの衝突を確認
    for (const net of this.court.nets) {
      if (net.checkBallCollision(ballPosition, ballRadius)) {
        // ボールがネットを通過している場合、ネットに力を加える
        // 力の大きさはボールの速度に比例（軽く揺らす程度）
        const force = ballVelocity.scale(0.08); // 速度の8%の力（弱め）
        const influenceRadius = ballRadius * 1.5; // ボール半径の1.5倍の範囲に影響（狭め）
        net.applyForce(ballPosition, force, influenceRadius);
      }
    }
  }

  /**
   * クリーンアップ
   */
  dispose(): void {
    this.player1.dispose();
    this.player2.dispose();
    this.ball.dispose();
    this.court.dispose();
    this.scene.dispose();
    this.engine.dispose();
    window.removeEventListener("resize", () => {
      this.engine.resize();
    });
  }
}
