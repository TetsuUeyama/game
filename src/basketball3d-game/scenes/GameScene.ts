import {
  Scene,
  Engine,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color3,
} from '@babylonjs/core';
import { Court } from '../entities/Court';
import { Player, HandPose } from '../entities/Player';
import { Ball } from '../entities/Ball';
import { CAMERA_CONFIG, LIGHT_CONFIG, COURT_CONFIG, BALL_CONFIG, PLAYER_CONFIG } from '../config/gameConfig';

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

  constructor(canvas: HTMLCanvasElement) {
    // WebGLサポートチェック
    if (!canvas.getContext('webgl') && !canvas.getContext('webgl2')) {
      throw new Error('WebGL is not supported in this browser. Please use a modern browser that supports WebGL.');
    }

    // エンジンの作成
    try {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
    } catch (error) {
      console.error('[GameScene] Engine creation failed:', error);
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

    // レンダーループの開始
    this.startRenderLoop();

    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    // キーボードイベント（テスト用）
    this.setupKeyboardControls();

    console.log('[GameScene] 3Dバスケットゲーム初期化完了');
  }

  /**
   * キーボード操作をセットアップ（テスト用）
   */
  private setupKeyboardControls(): void {
    this.scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case 1: // KEYDOWN
          switch (kbInfo.event.key) {
            case '1':
              // 通常ポーズ
              this.player1.setHandPose(HandPose.NEUTRAL);
              this.player2.setHandPose(HandPose.NEUTRAL);
              console.log('[GameScene] Hand Pose: NEUTRAL');
              break;
            case '2':
              // ドリブルポーズ
              this.player1.setHandPose(HandPose.DRIBBLE);
              this.player2.setHandPose(HandPose.DRIBBLE);
              console.log('[GameScene] Hand Pose: DRIBBLE');
              break;
            case '3':
              // ディフェンスポーズ
              this.player1.setHandPose(HandPose.DEFEND);
              this.player2.setHandPose(HandPose.DEFEND);
              console.log('[GameScene] Hand Pose: DEFEND');
              break;
            case '4':
              // シュートポーズ
              this.player1.setHandPose(HandPose.SHOOT);
              this.player2.setHandPose(HandPose.SHOOT);
              console.log('[GameScene] Hand Pose: SHOOT');
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
    const { initialPosition, initialTarget, fov, minZ, maxZ } = CAMERA_CONFIG;

    // ArcRotateCamera（回転可能なカメラ）
    const camera = new ArcRotateCamera(
      'camera',
      0, // alpha（水平角度）
      0, // beta（垂直角度）
      1, // radius（距離）
      new Vector3(initialTarget.x, initialTarget.y, initialTarget.z),
      this.scene
    );

    // カメラの初期位置を設定
    camera.setPosition(
      new Vector3(initialPosition.x, initialPosition.y, initialPosition.z)
    );

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
    const hemispheric = new HemisphericLight(
      'hemispheric-light',
      new Vector3(
        LIGHT_CONFIG.hemispheric.direction.x,
        LIGHT_CONFIG.hemispheric.direction.y,
        LIGHT_CONFIG.hemispheric.direction.z
      ),
      this.scene
    );
    hemispheric.intensity = LIGHT_CONFIG.hemispheric.intensity;

    // 太陽光（ディレクショナルライト）
    const directional = new DirectionalLight(
      'directional-light',
      new Vector3(
        LIGHT_CONFIG.directional.direction.x,
        LIGHT_CONFIG.directional.direction.y,
        LIGHT_CONFIG.directional.direction.z
      ),
      this.scene
    );
    directional.intensity = LIGHT_CONFIG.directional.intensity;
  }

  /**
   * プレイヤー1を作成（青色、左側スタート）
   */
  private createPlayer1(): Player {
    const startPosition = new Vector3(
      0,
      0.95, // 地面からプレイヤーの半分の高さ
      -COURT_CONFIG.length / 4
    );

    const player1 = new Player(
      this.scene,
      1,
      'Player 1',
      startPosition,
      new Color3(0, 0.5, 1) // 青色
    );

    console.log('[GameScene] Player 1 作成完了');
    return player1;
  }

  /**
   * プレイヤー2を作成（赤色、右側スタート）
   */
  private createPlayer2(): Player {
    const startPosition = new Vector3(
      0,
      0.95,
      COURT_CONFIG.length / 4
    );

    const player2 = new Player(
      this.scene,
      2,
      'Player 2',
      startPosition,
      new Color3(1, 0.2, 0) // 赤色
    );

    console.log('[GameScene] Player 2 作成完了');
    return player2;
  }

  /**
   * ボールを作成（コート中央）
   */
  private createBall(): Ball {
    const startPosition = new Vector3(
      0,
      BALL_CONFIG.radius, // 地面からボールの半径分の高さ（0.25m）
      0
    );

    const ball = new Ball(this.scene, startPosition);

    console.log('[GameScene] ボール作成完了');
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

    // 天井の高さ
    const ceilingHeight = COURT_CONFIG.rimHeight + 2;
    const maxY = ceilingHeight - height / 2;

    // 位置を境界内に制限
    const clampedPosition = new Vector3(
      Math.max(minX, Math.min(maxX, position.x)),
      Math.max(height / 2, Math.min(maxY, position.y)),
      Math.max(minZ, Math.min(maxZ, position.z))
    );

    // 位置が変わった場合のみ更新
    if (!position.equals(clampedPosition)) {
      player.setPosition(clampedPosition);
    }
  }

  /**
   * ボールがコートの境界内に収まるように位置を制限
   */
  private constrainBallToBounds(): void {
    const position = this.ball.getPosition();
    const radius = BALL_CONFIG.radius;

    // 壁の境界
    const minX = -COURT_CONFIG.width / 2 + radius;
    const maxX = COURT_CONFIG.width / 2 - radius;
    const minZ = -COURT_CONFIG.length / 2 + radius;
    const maxZ = COURT_CONFIG.length / 2 - radius;

    // 天井の高さ
    const ceilingHeight = COURT_CONFIG.rimHeight + 2;
    const maxY = ceilingHeight - radius;

    // 位置を境界内に制限
    const clampedPosition = new Vector3(
      Math.max(minX, Math.min(maxX, position.x)),
      Math.max(radius, Math.min(maxY, position.y)),
      Math.max(minZ, Math.min(maxZ, position.z))
    );

    // 位置が変わった場合のみ更新
    if (!position.equals(clampedPosition)) {
      this.ball.setPosition(clampedPosition);
    }
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
      const newPlayer1Pos = new Vector3(
        player1Pos.x - directionX * pushDistance,
        player1Pos.y,
        player1Pos.z - directionZ * pushDistance
      );
      this.player1.setPosition(newPlayer1Pos);

      // プレイヤー2を前に押す
      const newPlayer2Pos = new Vector3(
        player2Pos.x + directionX * pushDistance,
        player2Pos.y,
        player2Pos.z + directionZ * pushDistance
      );
      this.player2.setPosition(newPlayer2Pos);
    }
  }

  /**
   * プレイヤーとボールの衝突を処理
   */
  private handleBallCollision(player: Player, deltaTime: number): void {
    // ボールが既に誰かに保持されている場合は何もしない
    if (!this.ball.isFree()) {
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
      console.log(`[GameScene] Player ${player.id} picked up the ball!`);
    }
  }

  /**
   * ゲームロジックを更新
   */
  private update(deltaTime: number): void {
    const ballPosition = this.ball.getPosition();

    // ボールがフリーの場合のみ、プレイヤーがボールに向かって移動
    if (this.ball.isFree()) {
      // プレイヤー1の視野判定と移動
      if (this.player1.canSeeBall(ballPosition)) {
        this.player1.moveTowards(ballPosition, deltaTime);
      }

      // プレイヤー2の視野判定と移動
      if (this.player2.canSeeBall(ballPosition)) {
        this.player2.moveTowards(ballPosition, deltaTime);
      }
    }

    // プレイヤー同士の衝突処理
    this.handlePlayerCollision();

    // プレイヤー1とボールの衝突処理
    this.handleBallCollision(this.player1, deltaTime);

    // プレイヤー2とボールの衝突処理
    this.handleBallCollision(this.player2, deltaTime);

    // ボールを保持しているプレイヤーがいる場合、ボール位置を更新
    if (this.player1.hasBall) {
      const ballHoldPosition = this.player1.getBallHoldPosition();
      this.ball.setPosition(ballHoldPosition);
    } else if (this.player2.hasBall) {
      const ballHoldPosition = this.player2.getBallHoldPosition();
      this.ball.setPosition(ballHoldPosition);
    }

    // プレイヤーを境界内に制限（壁・天井との衝突）
    this.constrainPlayerToBounds(this.player1);
    this.constrainPlayerToBounds(this.player2);

    // ボールがフリーの場合のみ、境界内に制限（保持中は頭の上なので制限不要）
    if (this.ball.isFree()) {
      this.constrainBallToBounds();
    }
  }

  /**
   * シーンを取得
   */
  getScene(): Scene {
    return this.scene;
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
    window.removeEventListener('resize', () => {
      this.engine.resize();
    });
  }
}
