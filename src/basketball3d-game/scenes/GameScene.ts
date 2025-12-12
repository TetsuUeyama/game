import {Scene, Engine, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3} from "@babylonjs/core";
import {Court} from "../entities/Court";
import {Player, HandPose} from "../entities/Player";
import {Ball} from "../entities/Ball";
import {CAMERA_CONFIG, LIGHT_CONFIG, COURT_CONFIG, BALL_CONFIG, PLAYER_CONFIG} from "../config/gameConfig";
import {calculateFumbleChance} from "../entities/PlayerStats";
import {calculateShootTrajectory, isShootPhysicallyPossible} from "../utils/shootCalculator";

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

  // シュート関連の状態
  private player1ShootCooldown: number = 0; // シュートのクールダウン（秒）
  private player2ShootCooldown: number = 0;
  private player1BallHoldTime: number = 0; // ボール保持時間（秒）
  private player2BallHoldTime: number = 0;
  private player1PickupCooldown: number = 0; // ボール拾得のクールダウン（秒）
  private player2PickupCooldown: number = 0; // ボール拾得のクールダウン（秒）
  private readonly SHOOT_COOLDOWN_TIME = 2.0; // シュート後のクールダウン（秒）
  private readonly PICKUP_COOLDOWN_TIME = 1.0; // シュート後にボールを拾えるようになるまでの時間（秒）
  private readonly SHOOT_DISTANCE = 8.0; // シュート判定距離（m）
  private readonly SHOOT_HOLD_TIME = 2.0; // ボール保持後のシュートまでの時間（秒）

  // レイアップジャンプ関連の状態
  private player1LayupInProgress: boolean = false; // レイアップジャンプ中か
  private player2LayupInProgress: boolean = false;
  private player1LayupGoalZ: number = 0; // レイアップ時のゴールZ座標
  private player2LayupGoalZ: number = 0;

  // リム判定用
  private ballPreviousY: number = 0; // 前フレームのボールY座標（上から下への移動判定用）

  constructor(canvas: HTMLCanvasElement) {
    // WebGLサポートチェック
    if (!canvas.getContext("webgl") && !canvas.getContext("webgl2")) {
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

    // ボールのY座標を初期化
    this.ballPreviousY = this.ball.getPosition().y;

    // レンダーループの開始
    this.startRenderLoop();

    // ウィンドウリサイズ対応
    window.addEventListener("resize", () => {
      this.engine.resize();
    });

    // キーボードイベント（テスト用）
    this.setupKeyboardControls();

    console.log("[GameScene] 3Dバスケットゲーム初期化完了");
  }

  /**
   * キーボード操作をセットアップ（テスト用）
   */
  private setupKeyboardControls(): void {
    this.scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case 1: // KEYDOWN
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
          }
          break;
      }
    });
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
   */
  private createPlayer1(): Player {
    const startPosition = new Vector3(
      0,
      0.95, // 地面からプレイヤーの半分の高さ
      -COURT_CONFIG.length / 4,
    );

    const player1 = new Player(
      this.scene,
      1,
      "Player 1",
      startPosition,
      new Color3(0, 0.5, 1), // 青色
    );

    console.log("[GameScene] Player 1 作成完了");
    return player1;
  }

  /**
   * プレイヤー2を作成（赤色、右側スタート）
   */
  private createPlayer2(): Player {
    const startPosition = new Vector3(0, 0.95, COURT_CONFIG.length / 4);

    const player2 = new Player(
      this.scene,
      2,
      "Player 2",
      startPosition,
      new Color3(1, 0.2, 0), // 赤色
    );

    // Player2の初期向きを設定（コート中央に向ける = -Z方向）
    player2.setDirection(Math.PI); // 180度回転

    console.log("[GameScene] Player 2 作成完了");
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
   * プレイヤーがコートの境界内に収まるように位置を制限
   */
  private constrainPlayerToBounds(player: Player): void {
    const position = player.getPosition();
    const radius = PLAYER_CONFIG.radius;
    const height = PLAYER_CONFIG.height;

    // 壁の境界
    const minX = -COURT_CONFIG.width / 2 + radius;
    const maxX = COURT_CONFIG.width / 2 - radius;
    const minZ = -COURT_CONFIG.length / 2 + radius;
    const maxZ = COURT_CONFIG.length / 2 - radius;

    // 地面の高さ（プレイヤーの中心Y座標）
    const groundY = height / 2; // 0.95m

    // 天井の高さ（将来のジャンプ機能用）
    const ceilingHeight = COURT_CONFIG.rimHeight + 10; // 13.05m
    const maxY = ceilingHeight - height / 2;

    // 位置を境界内に制限
    const clampedPosition = new Vector3(
      Math.max(minX, Math.min(maxX, position.x)),
      Math.max(groundY, Math.min(maxY, position.y)), // 地面と天井の間
      Math.max(minZ, Math.min(maxZ, position.z)),
    );

    // 位置が変わった場合のみ更新
    if (!position.equals(clampedPosition)) {
      player.setPosition(clampedPosition);
    }
  }

  /**
   * プレイヤーに重力を適用
   * ジャンプ中は Player.updateJump() が処理するのでスキップ
   */
  private applyPlayerGravity(player: Player, deltaTime: number): void {
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
   * ボールがコートの境界とバウンドする処理
   */
  private constrainBallToBounds(): void {
    const position = this.ball.getPosition();
    const velocity = this.ball.getVelocity();
    const radius = BALL_CONFIG.radius;

    // 壁の境界
    const minX = -COURT_CONFIG.width / 2 + radius;
    const maxX = COURT_CONFIG.width / 2 - radius;
    const minZ = -COURT_CONFIG.length / 2 + radius;
    const maxZ = COURT_CONFIG.length / 2 - radius;

    // 天井の高さ（Court.tsと同じ値）
    const ceilingHeight = COURT_CONFIG.rimHeight + 10; // 13.05m
    const maxY = ceilingHeight - radius;

    const newVelocity = velocity.clone();
    let didBounce = false;

    // X軸の壁との衝突（左右の壁）
    if (position.x <= minX && velocity.x < 0) {
      newVelocity.x = -velocity.x * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(minX, position.y, position.z));
      didBounce = true;
    } else if (position.x >= maxX && velocity.x > 0) {
      newVelocity.x = -velocity.x * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(maxX, position.y, position.z));
      didBounce = true;
    }

    // Z軸の壁との衝突（前後の壁）
    if (position.z <= minZ && velocity.z < 0) {
      newVelocity.z = -velocity.z * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(position.x, position.y, minZ));
      didBounce = true;
    } else if (position.z >= maxZ && velocity.z > 0) {
      newVelocity.z = -velocity.z * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(position.x, position.y, maxZ));
      didBounce = true;
    }

    // 天井との衝突
    if (position.y >= maxY && velocity.y > 0) {
      newVelocity.y = -velocity.y * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(position.x, maxY, position.z));
      didBounce = true;
    }

    // バウンドした場合は速度を更新
    if (didBounce) {
      this.ball.setVelocity(newVelocity);
      console.log(`[BOUNCE] Ball bounced! New velocity: (${newVelocity.x.toFixed(2)}, ${newVelocity.y.toFixed(2)}, ${newVelocity.z.toFixed(2)})`);
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
   * リムの中心位置（XZ平面）を取得
   * @param side 'player1' = -Z側のゴール, 'player2' = +Z側のゴール
   * @returns リムリング中心のZ座標
   */
  private getRimCenterZ(side: "player1" | "player2"): number {
    // バックボードの位置
    const backboardZ = side === "player1" ? -COURT_CONFIG.length / 2 + COURT_CONFIG.backboardDistance : COURT_CONFIG.length / 2 - COURT_CONFIG.backboardDistance;

    // リムの中心はバックボードからrimOffset分離れた位置（コート内側）
    // player1側（-Z）: バックボード + rimOffset
    // player2側（+Z）: バックボード - rimOffset
    const rimCenterZ = side === "player1" ? backboardZ + COURT_CONFIG.rimOffset : backboardZ - COURT_CONFIG.rimOffset;

    return rimCenterZ;
  }

  /**
   * ゴールリム（両方）との衝突判定とゴール判定
   */
  private handleRimCollisions(): void {
    // Player1のゴール（-Z側）
    const player1RimZ = this.getRimCenterZ("player1");
    this.handleRimCollision(player1RimZ, 1);

    // Player2のゴール（+Z側）
    const player2RimZ = this.getRimCenterZ("player2");
    this.handleRimCollision(player2RimZ, 2);
  }

  /**
   * 1つのゴールリムとの衝突判定とゴール判定
   * @param rimZ リムのZ座標
   * @param goalOwner ゴールの所有者（1 or 2）
   */
  private handleRimCollision(rimZ: number, goalOwner: number): void {
    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();
    const ballRadius = BALL_CONFIG.radius;

    // リムの位置と半径
    const rimPosition = new Vector3(0, COURT_CONFIG.rimHeight, rimZ);
    const rimRadius = COURT_CONFIG.rimDiameter / 2; // 0.225m
    const rimThickness = 0.02; // リムの太さ

    // ボールがリムの高さ付近にいるかチェック
    const heightDiff = Math.abs(ballPosition.y - rimPosition.y);
    if (heightDiff > ballRadius + rimThickness) {
      return; // リムから遠すぎる
    }

    // ボールからリムの中心（XZ平面）への水平距離
    const dx = ballPosition.x - rimPosition.x;
    const dz = ballPosition.z - rimPosition.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // リムの円周上の最も近い点までの距離
    const distanceFromRimCircle = Math.abs(horizontalDistance - rimRadius);

    // ゴール判定：ボールがリムを通過した（上から下へ）
    if (
      horizontalDistance < rimRadius - ballRadius && // ボールがリムの内側にいる
      ballPosition.y < COURT_CONFIG.rimHeight && // リムより下にいる
      this.ballPreviousY >= COURT_CONFIG.rimHeight && // 前フレームではリムより上か同じ高さ
      ballVelocity.y < 0 // 下向きに移動中
    ) {
      console.log(`[GOAL!] ★★★ Ball passed through rim ${goalOwner}! ★★★`);

      // ゴール後の処理：ボールをコート中央にリセット
      this.resetBallToCenter();
      return;
    }

    // リムとの衝突判定
    if (distanceFromRimCircle <= ballRadius + rimThickness) {
      // リムに当たった！
      console.log(`[RIM HIT] Ball hit the rim ${goalOwner}!`);

      // リムの円周上の最も近い点を計算
      const angle = Math.atan2(dz, dx);
      const rimPointX = rimPosition.x + rimRadius * Math.cos(angle);
      const rimPointZ = rimPosition.z + rimRadius * Math.sin(angle);

      // ボールからリム接触点への方向
      const toRimPoint = new Vector3(
        rimPointX - ballPosition.x,
        0, // 水平方向のみ
        rimPointZ - ballPosition.z,
      );
      toRimPoint.normalize();

      // 速度を反射（水平方向のみ、垂直方向はそのまま）
      const horizontalVelocity = new Vector3(ballVelocity.x, 0, ballVelocity.z);
      const velocityAlongNormal = Vector3.Dot(horizontalVelocity, toRimPoint);

      // 反射ベクトルを計算
      const reflection = toRimPoint.scale(velocityAlongNormal * 2);
      const newHorizontalVelocity = horizontalVelocity.subtract(reflection);

      // 新しい速度（垂直成分はそのまま、水平成分は反射）
      const newVelocity = new Vector3(
        newHorizontalVelocity.x * BALL_CONFIG.bounciness,
        ballVelocity.y * BALL_CONFIG.bounciness, // 垂直方向も減衰
        newHorizontalVelocity.z * BALL_CONFIG.bounciness,
      );

      this.ball.setVelocity(newVelocity);

      // ボールをリムから離す
      const separation = toRimPoint.scale(-(ballRadius + rimThickness - distanceFromRimCircle));
      const newPosition = ballPosition.add(separation);
      this.ball.setPosition(newPosition);
    }
  }

  /**
   * ディフェンスの最適な位置を計算
   * @param offensePosition オフェンスプレイヤーの位置
   * @param goalZ ディフェンドするゴールのZ座標
   * @returns ディフェンスの目標位置
   */
  private calculateDefensePosition(offensePosition: Vector3, goalZ: number): Vector3 {
    // ゴールの位置（リムリング中心）
    const goalPosition = new Vector3(0, 0.95, goalZ);

    // オフェンスからゴールへの方向ベクトル
    const offenseToGoal = goalPosition.subtract(offensePosition);
    const horizontalDistance = Math.sqrt(offenseToGoal.x * offenseToGoal.x + offenseToGoal.z * offenseToGoal.z);

    // オフェンスとゴールの間に位置取る
    // defenseBias = 0.6 なら、オフェンスから60%の位置（ゴール寄り）
    const defenseDistance = horizontalDistance * PLAYER_CONFIG.defenseBias;

    // 距離の制限を適用
    const clampedDistance = Math.max(PLAYER_CONFIG.defenseMinDistance, Math.min(PLAYER_CONFIG.defenseMaxDistance, defenseDistance));

    // オフェンスからゴールへの方向を正規化
    const directionX = offenseToGoal.x / horizontalDistance;
    const directionZ = offenseToGoal.z / horizontalDistance;

    // ディフェンスの位置を計算
    const defensePosition = new Vector3(
      offensePosition.x + directionX * clampedDistance,
      0.95, // 地面の高さ
      offensePosition.z + directionZ * clampedDistance,
    );

    return defensePosition;
  }

  /**
   * プレイヤー同士の衝突を処理
   */
  private handlePlayerCollision(): void {
    const player1Pos = this.player1.getPosition();
    const player2Pos = this.player2.getPosition();

    // プレイヤー同士の距離を計算
    const dx = player2Pos.x - player1Pos.x;
    const dz = player2Pos.z - player1Pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 衝突判定（プレイヤー1の半径 + プレイヤー2の半径）
    const collisionDistance = PLAYER_CONFIG.radius * 2;

    if (distance < collisionDistance && distance > 0) {
      // 重なっている！お互いを押し離す

      // プレイヤー1からプレイヤー2への方向ベクトル
      const directionX = dx / distance;
      const directionZ = dz / distance;

      // 重なりの深さ
      const overlap = collisionDistance - distance;

      // 両プレイヤーを半分ずつ押し離す
      const pushDistance = overlap / 2;

      // プレイヤー1を後ろに押す
      const newPlayer1Pos = new Vector3(player1Pos.x - directionX * pushDistance, player1Pos.y, player1Pos.z - directionZ * pushDistance);
      this.player1.setPosition(newPlayer1Pos);

      // プレイヤー2を前に押す
      const newPlayer2Pos = new Vector3(player2Pos.x + directionX * pushDistance, player2Pos.y, player2Pos.z + directionZ * pushDistance);
      this.player2.setPosition(newPlayer2Pos);
    }
  }

  /**
   * プレイヤーとボールの衝突を処理
   */
  private handleBallCollision(player: Player): void {
    // ボールが既に誰かに保持されている場合は何もしない
    if (!this.ball.isFree()) {
      return;
    }

    // プレイヤーのボール拾得クールダウン中は拾えない
    const pickupCooldown = player.id === 1 ? this.player1PickupCooldown : this.player2PickupCooldown;
    if (pickupCooldown > 0) {
      return;
    }

    const playerPosition = player.getPosition();
    const ballPosition = this.ball.getPosition();

    // プレイヤーとボールの距離を計算
    const dx = ballPosition.x - playerPosition.x;
    const dz = ballPosition.z - playerPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 衝突判定（プレイヤーの半径 + ボールの半径）
    const collisionDistance = PLAYER_CONFIG.radius + BALL_CONFIG.radius;

    if (distance < collisionDistance) {
      // 衝突した！ボールを保持する
      player.grabBall();
      this.ball.pickUp(player.id);
      console.log(`[PICKUP] Player ${player.id} picked up the ball! Distance: ${distance.toFixed(2)}, ball.owner=${this.ball.owner}, ball.isFree=${this.ball.isFree()}`);

      // テスト：ボールを拾った時にジャンプ
      console.log(`[TEST] Player ${player.id} jumping on pickup!`);
      player.startJump();
    }
  }

  /**
   * ボールスティール判定（手・体のメッシュとボールの衝突判定）
   */
  private handleBallSteal(): void {
    // Player1がボール保持中、Player2がディフェンダー
    if (this.player1.hasBall && !this.player2.hasBall) {
      // Player2がディフェンドポーズの場合のみスティール可能
      if (this.player2.getHandPose() === HandPose.DEFEND) {
        // Player2の両手・体とボールの衝突判定
        const isHandContact = this.player2.leftHand.intersectsMesh(this.ball.mesh, false) || this.player2.rightHand.intersectsMesh(this.ball.mesh, false);

        const isBodyContact = this.player2.mesh.intersectsMesh(this.ball.mesh, false);

        if (isHandContact || isBodyContact) {
          // ファンブル判定
          const fumbleChance = calculateFumbleChance(this.player1.stats.ballHandling, this.player2.stats.steal);

          // 確率判定
          if (Math.random() < fumbleChance) {
            this.causeFumble(this.player1, this.player2);
          }
        }
      }
    }

    // Player2がボール保持中、Player1がディフェンダー
    if (this.player2.hasBall && !this.player1.hasBall) {
      // Player1がディフェンドポーズの場合のみスティール可能
      if (this.player1.getHandPose() === HandPose.DEFEND) {
        // Player1の両手・体とボールの衝突判定
        const isHandContact = this.player1.leftHand.intersectsMesh(this.ball.mesh, false) || this.player1.rightHand.intersectsMesh(this.ball.mesh, false);

        const isBodyContact = this.player1.mesh.intersectsMesh(this.ball.mesh, false);

        if (isHandContact || isBodyContact) {
          // ファンブル判定
          const fumbleChance = calculateFumbleChance(this.player2.stats.ballHandling, this.player1.stats.steal);

          // 確率判定
          if (Math.random() < fumbleChance) {
            this.causeFumble(this.player2, this.player1);
          }
        }
      }
    }
  }

  /**
   * ファンブルを発生させる（ボールを手放して転がす）
   * @param offense ボール保持者（オフェンス）
   * @param defense ディフェンダー
   */
  private causeFumble(offense: Player, defense: Player): void {
    console.log(`[GameScene] Player ${offense.id} fumbled! Player ${defense.id} caused the fumble!`);

    // ボールを手放す
    offense.releaseBall();
    this.ball.release();

    // ボールの位置を取得
    const ballPosition = this.ball.getPosition();

    // オフェンスの進行方向を取得
    const offenseDirection = offense.direction;
    const forwardX = Math.sin(offenseDirection);
    const forwardZ = Math.cos(offenseDirection);

    // ボールの速度を設定（進行方向の逆 + ランダムな横方向）
    const backwardSpeed = 3.0; // 後方への速度（m/s）
    const sidewaysSpeed = (Math.random() - 0.5) * 2.0; // ランダムな横方向（-1.0 ~ 1.0 m/s）

    // 横方向のベクトル（進行方向に対して垂直）
    const sidewaysX = -forwardZ; // 90度回転
    const sidewaysZ = forwardX;

    // 最終的な速度ベクトル
    const velocityX = -forwardX * backwardSpeed + sidewaysX * sidewaysSpeed;
    const velocityZ = -forwardZ * backwardSpeed + sidewaysZ * sidewaysSpeed;

    const fumbleVelocity = new Vector3(velocityX, 0, velocityZ);
    this.ball.setVelocity(fumbleVelocity);

    console.log(`[GameScene] Ball velocity: (${velocityX.toFixed(2)}, 0, ${velocityZ.toFixed(2)})`);
  }

  /**
   * シュート判定（ゴールまでの距離をチェック）
   * @param player プレイヤー
   * @param goalZ ゴールのZ座標
   * @returns シュート可能かどうか
   */
  private canShoot(player: Player, goalZ: number): boolean {
    if (!player.hasBall) return false;

    const playerPosition = player.getPosition();

    // ゴールまでの距離を計算
    const dx = 0 - playerPosition.x; // ゴールのX座標は0（コート中央）
    const dz = goalZ - playerPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    return distance <= this.SHOOT_DISTANCE;
  }

  /**
   * レイアップジャンプ中の処理を更新
   * @param player プレイヤー
   * @param playerId プレイヤーID（1または2）
   * @param goalZ ゴールのZ座標
   */
  private updateLayupJump(player: Player, playerId: number, goalZ: number): void {
    const isLayupInProgress = playerId === 1 ? this.player1LayupInProgress : this.player2LayupInProgress;

    if (!isLayupInProgress || !player.isJumping) {
      return;
    }

    // ジャンプの頂点に達したか（速度が負=下降中）、またはある程度の高さに達したかチェック
    const shouldRelease = player.jumpVelocity <= 1.0; // 速度が1m/s以下（ほぼ頂点）

    if (shouldRelease && player.hasBall) {
      console.log(`[LAYUP] Player ${playerId} releasing ball at jump peak!`);

      // ボールを手放す
      player.releaseBall();
      this.ball.release();

      // シュートポーズに切り替え
      player.setHandPose(HandPose.SHOOT);

      // ターゲット（リムリング中心）の位置
      const targetPosition = new Vector3(0, COURT_CONFIG.rimHeight, goalZ);

      // 腕を伸ばした位置からリリース
      const shooterPosition = player.getExtendedArmBallPosition();

      // ボールを腕を伸ばした位置に移動
      this.ball.setPosition(shooterPosition);

      console.log(`[LAYUP] Shooter: ${shooterPosition.toString()}`);
      console.log(`[LAYUP] Target: ${targetPosition.toString()}`);

      // シュート軌道を計算
      const shootCalculation = calculateShootTrajectory(shooterPosition, targetPosition);

      console.log(`[LAYUP] Angle: ${shootCalculation.angle.toFixed(1)}°`);
      console.log(`[LAYUP] Initial Speed: ${shootCalculation.initialSpeed.toFixed(2)} m/s`);

      // 計算された速度をボールに設定
      this.ball.setVelocity(shootCalculation.velocity);

      // クールダウンを設定
      if (playerId === 1) {
        this.player1ShootCooldown = this.SHOOT_COOLDOWN_TIME;
        this.player1PickupCooldown = this.PICKUP_COOLDOWN_TIME;
        this.player1LayupInProgress = false;
      } else {
        this.player2ShootCooldown = this.SHOOT_COOLDOWN_TIME;
        this.player2PickupCooldown = this.PICKUP_COOLDOWN_TIME;
        this.player2LayupInProgress = false;
      }
    }
  }

  /**
   * シュートを実行
   * @param player シュートするプレイヤー
   * @param goalZ ゴールのZ座標
   */
  private performShoot(player: Player, goalZ: number): void {
    console.log(`[GameScene] ★★★ Player ${player.id} is SHOOTING! ★★★`);

    // ターゲット（リムリング中心）の位置
    const targetPosition = new Vector3(0, COURT_CONFIG.rimHeight, goalZ); // goalZはリムリング中心のZ座標

    // ゴールまでの水平距離を計算
    const playerPosition = player.getPosition();
    const dx = targetPosition.x - playerPosition.x;
    const dz = targetPosition.z - playerPosition.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // レイアップ判定：極近距離（1.5m以内）の場合
    const isLayup = horizontalDistance < 1.5;
    console.log(`[SHOOT DEBUG] Player ${player.id} distance to goal: ${horizontalDistance.toFixed(2)}m, isLayup: ${isLayup}`);

    if (isLayup) {
      // レイアップシュート：ジャンプを開始してボールを保持したまま
      console.log(`[LAYUP] Player ${player.id} starting layup jump! Distance: ${horizontalDistance.toFixed(2)}m`);
      player.startJump();
      player.setHandPose(HandPose.SHOOT);

      // レイアップ状態を記録
      if (player.id === 1) {
        this.player1LayupInProgress = true;
        this.player1LayupGoalZ = goalZ;
      } else {
        this.player2LayupInProgress = true;
        this.player2LayupGoalZ = goalZ;
      }

      // レイアップの場合はここで終了（ジャンプ中に updateLayupJump でボールをリリース）
      return;
    }

    // 通常のジャンプシュート：即座にボールをリリース
    // シュートポーズに切り替え
    player.setHandPose(HandPose.SHOOT);

    // ボールを手放す
    player.releaseBall();
    this.ball.release();

    const ballPosition = this.ball.getPosition();

    // 通常のシュート：現在のボール位置から
    const shooterPosition = ballPosition;

    console.log(`[GameScene] Shooter: ${shooterPosition.toString()}`);
    console.log(`[GameScene] Target: ${targetPosition.toString()}`);
    console.log(`[GameScene] Distance: ${horizontalDistance.toFixed(2)}m, Type: JUMP SHOT`);

    // シュートが物理的に可能かチェック
    if (!isShootPhysicallyPossible(shooterPosition, targetPosition)) {
      console.warn("[GameScene] Shot is physically impossible! Using maximum power.");
    }

    // シュート軌道を計算（角度は自動調整）
    const shootCalculation = calculateShootTrajectory(shooterPosition, targetPosition);

    console.log(`[SHOOT] Angle: ${shootCalculation.angle.toFixed(1)}°`);
    console.log(`[SHOOT] Initial Speed: ${shootCalculation.initialSpeed.toFixed(2)} m/s`);
    console.log(`[SHOOT] Flight Time: ${shootCalculation.flightTime.toFixed(2)}s`);
    console.log(`[SHOOT] Max Height: ${shootCalculation.maxHeight.toFixed(2)}m`);
    console.log(`[SHOOT] Velocity: (${shootCalculation.velocity.x.toFixed(2)}, ${shootCalculation.velocity.y.toFixed(2)}, ${shootCalculation.velocity.z.toFixed(2)})`);

    // 計算された速度をボールに設定
    this.ball.setVelocity(shootCalculation.velocity);

    // クールダウンを設定
    if (player.id === 1) {
      this.player1ShootCooldown = this.SHOOT_COOLDOWN_TIME;
      this.player1PickupCooldown = this.PICKUP_COOLDOWN_TIME; // シュート後1秒間は拾えない
    } else {
      this.player2ShootCooldown = this.SHOOT_COOLDOWN_TIME;
      this.player2PickupCooldown = this.PICKUP_COOLDOWN_TIME; // シュート後1秒間は拾えない
    }
  }

  /**
   * ゲームロジックを更新
   */
  private update(deltaTime: number): void {
    const ballPosition = this.ball.getPosition();

    // クールダウンを更新
    if (this.player1ShootCooldown > 0) {
      this.player1ShootCooldown -= deltaTime;
    }
    if (this.player2ShootCooldown > 0) {
      this.player2ShootCooldown -= deltaTime;
    }
    if (this.player1PickupCooldown > 0) {
      this.player1PickupCooldown -= deltaTime;
    }
    if (this.player2PickupCooldown > 0) {
      this.player2PickupCooldown -= deltaTime;
    }

    // プレイヤーのジャンプを更新
    this.player1.updateJump(deltaTime);
    if (this.player2Enabled) {
      this.player2.updateJump(deltaTime);
    }

    // レイアップジャンプ中の処理
    this.updateLayupJump(this.player1, 1, this.player1LayupGoalZ);
    if (this.player2Enabled) {
      this.updateLayupJump(this.player2, 2, this.player2LayupGoalZ);
    }

    // プレイヤーのポーズを自動切り替え
    this.updatePlayerPoses();

    // プレイヤーの移動判定
    if (this.ball.isFree()) {
      // ボールがフリーの場合：ボールに向かって移動
      // ただし、シュートクールダウン中は移動しない
      if (this.player1ShootCooldown <= 0 && this.player1.canSeeBall(ballPosition)) {
        this.player1.moveTowards(ballPosition, deltaTime);
      }

      if (this.player2Enabled && this.player2ShootCooldown <= 0 && this.player2.canSeeBall(ballPosition)) {
        this.player2.moveTowards(ballPosition, deltaTime);
      }
    } else {
      // ボールが保持されている場合：オフェンス・ディフェンスの動き
      if (this.player1.hasBall) {
        // ボール保持時間をカウント
        this.player1BallHoldTime += deltaTime;

        // Player1が狙うゴール（+Z方向、Player2側）- リムリング中心の位置
        const player1GoalZ = this.getRimCenterZ("player2");

        // 相手（Player2）が視野内にいるかチェック
        const canSeeOpponent = this.player2Enabled && this.player1.canSeePlayer(this.player2);

        // シュート判定（距離チェックまたは保持時間で判定）
        const canShootByDistance = this.player1ShootCooldown <= 0 && this.canShoot(this.player1, player1GoalZ);
        const canShootByTime = this.player1BallHoldTime >= this.SHOOT_HOLD_TIME;
        const shouldShoot = canShootByDistance || canShootByTime;

        // デバッグ用（1秒ごとに表示）
        if (Math.floor(this.player1BallHoldTime * 10) % 10 === 0) {
          console.log(`[P1] HoldTime: ${this.player1BallHoldTime.toFixed(1)}s, CanShootDist: ${canShootByDistance}, CanShootTime: ${canShootByTime}`);
        }

        if (shouldShoot) {
          this.performShoot(this.player1, player1GoalZ);
          this.player1BallHoldTime = 0; // リセット
        } else if (!this.player1LayupInProgress) {
          // レイアップジャンプ中でない場合のみ移動
          // ゴール直下まで移動（レイアップのため）
          const player1Goal = new Vector3(0, 0.95, player1GoalZ - 0.5); // ゴールから0.5m手前
          this.player1.moveTowards(player1Goal, deltaTime);

          // 相手が視野内にいない場合はゴール方向を向く（上下も含めて）
          if (!canSeeOpponent) {
            // リムリング中心の位置
            const rimPosition = new Vector3(0, COURT_CONFIG.rimHeight, player1GoalZ);

            // プレイヤーの目の位置（顔の高さ）を計算
            const playerPos = this.player1.getPosition();
            const eyeHeightOffset = PLAYER_CONFIG.height / 2 - 0.2; // 顔の位置オフセット
            const eyePosition = new Vector3(playerPos.x, playerPos.y + eyeHeightOffset, playerPos.z);

            // 目の位置からリムリング中心への方向ベクトル
            const toRim = rimPosition.subtract(eyePosition);

            // 水平方向の角度（Y軸周り）
            const angleToRimY = Math.atan2(toRim.x, toRim.z);
            this.player1.setDirection(angleToRimY);

            // 上下方向の角度（X軸周り、ピッチ）- 首だけを傾ける
            const horizontalDistance = Math.sqrt(toRim.x * toRim.x + toRim.z * toRim.z);
            const angleToRimX = Math.atan2(toRim.y, horizontalDistance);
            this.player1.neckMesh.rotation.x = -angleToRimX; // 上向きは負の値
          } else {
            // 相手が視野内にいる場合は首を水平に戻す
            this.player1.neckMesh.rotation.x = 0;
          }
        }

        // Player2がディフェンス：Player1とゴールの間に位置取る
        if (this.player2Enabled) {
          const player1Position = this.player1.getPosition();

          // Player2が守るゴール（-Z側、Player2のゴール）のZ座標
          const player2GoalZ = this.getRimCenterZ("player2");

          // ディフェンスの最適な位置を計算
          const defensePosition = this.calculateDefensePosition(player1Position, player2GoalZ);

          if (this.player2.canSeePlayer(this.player1)) {
            this.player2.moveTowards(defensePosition, deltaTime);
          }
        }
      } else {
        // ボールを持っていない場合はタイマーと首の向き、レイアップ状態をリセット
        if (this.player1BallHoldTime > 0) {
          console.log(`[DEBUG] P1 lost ball! HoldTime was ${this.player1BallHoldTime.toFixed(2)}s`);
        }
        this.player1BallHoldTime = 0;
        this.player1.neckMesh.rotation.x = 0; // 首を水平に戻す
        this.player1LayupInProgress = false; // レイアップ状態をリセット
      }

      if (this.player2Enabled && this.player2.hasBall) {
        // ボール保持時間をカウント
        this.player2BallHoldTime += deltaTime;

        // Player2が狙うゴール（-Z方向、Player1側）- リムリング中心の位置
        const player2GoalZ = this.getRimCenterZ("player1");

        // 相手（Player1）が視野内にいるかチェック
        const canSeeOpponent = this.player2.canSeePlayer(this.player1);

        // シュート判定（距離チェックまたは保持時間で判定）
        const shouldShoot = (this.player2ShootCooldown <= 0 && this.canShoot(this.player2, player2GoalZ)) || this.player2BallHoldTime >= this.SHOOT_HOLD_TIME;

        if (shouldShoot) {
          this.performShoot(this.player2, player2GoalZ);
          this.player2BallHoldTime = 0; // リセット
        } else if (!this.player2LayupInProgress) {
          // レイアップジャンプ中でない場合のみ移動
          // ゴール直下まで移動（レイアップのため）
          const player2Goal = new Vector3(0, 0.95, player2GoalZ + 0.5); // ゴールから0.5m手前
          this.player2.moveTowards(player2Goal, deltaTime);

          // 相手が視野内にいない場合はゴール方向を向く（上下も含めて）
          if (!canSeeOpponent) {
            // リムリング中心の位置
            const rimPosition = new Vector3(0, COURT_CONFIG.rimHeight, player2GoalZ);

            // プレイヤーの目の位置（顔の高さ）を計算
            const playerPos = this.player2.getPosition();
            const eyeHeightOffset = PLAYER_CONFIG.height / 2 - 0.2; // 顔の位置オフセット
            const eyePosition = new Vector3(playerPos.x, playerPos.y + eyeHeightOffset, playerPos.z);

            // 目の位置からリムリング中心への方向ベクトル
            const toRim = rimPosition.subtract(eyePosition);

            // 水平方向の角度（Y軸周り）
            const angleToRimY = Math.atan2(toRim.x, toRim.z);
            this.player2.setDirection(angleToRimY);

            // 上下方向の角度（X軸周り、ピッチ）- 首だけを傾ける
            const horizontalDistance = Math.sqrt(toRim.x * toRim.x + toRim.z * toRim.z);
            const angleToRimX = Math.atan2(toRim.y, horizontalDistance);
            this.player2.neckMesh.rotation.x = -angleToRimX; // 上向きは負の値
          } else {
            // 相手が視野内にいる場合は首を水平に戻す
            this.player2.neckMesh.rotation.x = 0;
          }
        }

        // Player1がディフェンス：Player2とゴールの間に位置取る
        const player2Position = this.player2.getPosition();

        // Player1が守るゴール（-Z側、Player1のゴール）のZ座標
        const player1GoalZ = this.getRimCenterZ("player1");

        // ディフェンスの最適な位置を計算
        const defensePosition = this.calculateDefensePosition(player2Position, player1GoalZ);

        if (this.player1.canSeePlayer(this.player2)) {
          this.player1.moveTowards(defensePosition, deltaTime);
        }
      } else {
        // ボールを持っていない場合はタイマーと首の向き、レイアップ状態をリセット
        this.player2BallHoldTime = 0;
        this.player2.neckMesh.rotation.x = 0;
        this.player2LayupInProgress = false; // レイアップ状態をリセット
      }
    }

    // プレイヤー同士の衝突処理（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      this.handlePlayerCollision();
    }

    // プレイヤー1とボールの衝突処理
    this.handleBallCollision(this.player1);

    // プレイヤー2とボールの衝突処理（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      this.handleBallCollision(this.player2);
    }

    // ボールスティール判定（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      this.handleBallSteal();
    }

    // ボールを保持しているプレイヤーがいる場合、ボール位置を更新
    if (this.player1.hasBall) {
      const ballHoldPosition = this.player1.getBallHoldPosition();
      this.ball.setPosition(ballHoldPosition);
    } else if (this.player2.hasBall) {
      const ballHoldPosition = this.player2.getBallHoldPosition();
      this.ball.setPosition(ballHoldPosition);
    }

    // ボールの物理演算（転がりと減速）
    this.ball.updatePhysics(deltaTime);

    // リムとの衝突判定（ボールがフリーの場合のみ）
    if (this.ball.isFree()) {
      this.handleRimCollisions();
    }

    // プレイヤーに重力を適用（地面に着地）
    this.applyPlayerGravity(this.player1, deltaTime);
    if (this.player2Enabled) {
      this.applyPlayerGravity(this.player2, deltaTime);
    }

    // プレイヤーを境界内に制限（壁・天井との衝突）
    this.constrainPlayerToBounds(this.player1);
    this.constrainPlayerToBounds(this.player2);

    // ボールがフリーの場合のみ、境界内に制限（保持中は頭の上なので制限不要）
    if (this.ball.isFree()) {
      this.constrainBallToBounds();
    }

    // 次フレーム用に現在のボールY座標を保存
    this.ballPreviousY = this.ball.getPosition().y;
  }

  /**
   * プレイヤーのポーズを自動的に切り替え
   */
  private updatePlayerPoses(): void {
    // Player1のポーズ
    if (this.player1ShootCooldown > 0) {
      // シュートクールダウン中はシュートポーズを維持
      this.player1.setHandPose(HandPose.SHOOT);
    } else if (this.player1.hasBall) {
      // ボール保持中はドリブルポーズ
      this.player1.setHandPose(HandPose.DRIBBLE);
    } else if (this.player2Enabled && this.player2.hasBall) {
      // 相手がボール保持中はディフェンドポーズ
      this.player1.setHandPose(HandPose.DEFEND);
    } else {
      // ボールがフリーの場合はニュートラル
      this.player1.setHandPose(HandPose.NEUTRAL);
    }

    // Player2のポーズ（Player2が有効な場合のみ）
    if (this.player2Enabled) {
      if (this.player2ShootCooldown > 0) {
        // シュートクールダウン中はシュートポーズを維持
        this.player2.setHandPose(HandPose.SHOOT);
      } else if (this.player2.hasBall) {
        // ボール保持中はドリブルポーズ
        this.player2.setHandPose(HandPose.DRIBBLE);
      } else if (this.player1.hasBall) {
        // 相手がボール保持中はディフェンドポーズ
        this.player2.setHandPose(HandPose.DEFEND);
      } else {
        // ボールがフリーの場合はニュートラル
        this.player2.setHandPose(HandPose.NEUTRAL);
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
