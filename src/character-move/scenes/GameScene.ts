import {
  Scene,
  Engine,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
  MeshBuilder,
  Color3,
  LinesMesh,
} from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Field } from "../entities/Field";
import { Ball } from "../entities/Ball";
import { InputController } from "../controllers/InputController";
import { JointController } from "../controllers/JointController";
import { CollisionHandler } from "../controllers/CollisionHandler";
import { CharacterAI } from "../controllers/CharacterAI";
import { OneOnOneBattleController } from "../controllers/action/OneOnOneBattleController";
import { ShootingController } from "../controllers/action/ShootingController";
import { ContestController } from "../controllers/ContestController";
import { CircleSizeController } from "../controllers/CircleSizeController";
import { FeintController } from "../controllers/action/FeintController";
import { ShotClockController } from "../controllers/ShotClockController";
import { DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { CharacterState } from "../types/CharacterState";
import { IDLE_MOTION } from "../motion/IdleMotion";
import { JUMP_BALL_MOTION } from "../motion/JumpMotion";
import { GameTeamConfig } from "../loaders/TeamConfigLoader";
import { PlayerData } from "../types/PlayerData";
import { PhysicsManager } from "../../physics/PhysicsManager";
// import { ModelLoader } from "../loaders/ModelLoader"; // 一旦無効化
import {
  CAMERA_CONFIG,
  LIGHT_CONFIG,
  FIELD_CONFIG,
  GOAL_CONFIG,
  // MODEL_CONFIG, // 一旦無効化
} from "../config/gameConfig";
import { PassTrajectoryVisualizer } from "../visualization/PassTrajectoryVisualizer";
import { ShootTrajectoryVisualizer } from "../visualization/ShootTrajectoryVisualizer";
import { DribblePathVisualizer } from "../visualization/DribblePathVisualizer";
import { PassCheckController, DefenderPlacement } from "../controllers/check/PassCheckController";
import { ThrowInCheckController } from "../controllers/check/ThrowInCheckController";
import { FieldGridUtils, CellCoord } from "../config/FieldGridConfig";
import { FormationUtils } from "../config/FormationConfig";
import { getAllOuterCells, getValidReceiverCells, OuterCellInfo, THROW_IN_CHECK_CONFIG } from "../config/check/ThrowInCheckConfig";
import {
  CENTER_CIRCLE,
  JUMP_BALL_POSITIONS,
  JUMP_BALL_TIMING,
  JUMP_BALL_PHYSICS,
  JumpBallInfo,
  DEFAULT_JUMP_BALL_INFO,
} from "../config/JumpBallConfig";
import { getDistance2D } from "../utils/CollisionUtils";

/**
 * ゲームモード
 */
export type GameMode = 'game' | 'dribble_check' | 'shoot_check' | 'pass_check' | 'throw_in_check';

/**
 * character-moveゲームのメインシーン
 */
export class GameScene {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private field: Field;
  private ball: Ball;
  private inputController?: InputController;
  private jointController?: JointController;
  private collisionHandler?: CollisionHandler;

  // ゲームモード
  private gameMode: GameMode = 'game';

  // キャラクター（5対5）
  private allyCharacters: Character[] = []; // 味方チーム5人
  private enemyCharacters: Character[] = []; // 敵チーム5人

  // AIで動くキャラクターのインデックス
  private aiCharacterIndices: Set<Character> = new Set();

  // AIコントローラー
  private characterAIs: CharacterAI[] = [];

  // カメラターゲット切り替え用
  private currentTargetTeam: 'ally' | 'enemy' = 'ally';
  private currentTargetIndex: number = 0;

  // カメラモード（on_ball: オンボールプレイヤー自動追従, manual: 手動選択）
  private cameraMode: 'on_ball' | 'manual' = 'on_ball';

  private lastFrameTime: number = Date.now();

  // 1on1バトルコントローラー
  private oneOnOneBattleController?: OneOnOneBattleController;

  // シュートコントローラー
  private shootingController?: ShootingController;

  // 競り合いコントローラー
  private contestController?: ContestController;

  // サークルサイズコントローラー
  private circleSizeController?: CircleSizeController;

  // フェイントコントローラー
  private feintController?: FeintController;

  // シュートクロックコントローラー
  private shotClockController?: ShotClockController;

  // パス軌道可視化
  private passTrajectoryVisualizer?: PassTrajectoryVisualizer;

  // シュート軌道可視化
  private shootTrajectoryVisualizer?: ShootTrajectoryVisualizer;

  // ドリブル導線可視化
  private dribblePathVisualizer?: DribblePathVisualizer;

  // パスチェックモード用距離表示ライン
  private passCheckDistanceLine?: LinesMesh;
  private passCheckPasser?: Character;
  private passCheckReceiver?: Character;

  // シュートクロック違反後のリセット待機状態
  private pendingShotClockViolationReset: boolean = false;
  private shotClockViolationResetTimer: number = 0;
  private shotClockViolatingTeam: 'ally' | 'enemy' | null = null;
  private readonly shotClockViolationResetDelay: number = 1.5;

  // アウトオブバウンズ時のボール位置
  private outOfBoundsBallPosition: Vector3 | null = null;

  // シュートクロック用：前フレームのボール保持者
  private previousBallHolder: Character | null = null;

  // スローイン実行中フラグと関連情報
  private isThrowInPending: boolean = false;
  private throwInTimer: number = 0;
  private throwInThrower: Character | null = null;
  private throwInReceiver: Character | null = null;
  private throwInPosition: Vector3 | null = null; // スロワーの固定位置（外側マスの中心）
  private readonly throwInDelay: number = 3.0; // スローインまでの遅延（秒）- 他の選手がポジション移動する時間

  // スローイン5秒ルール（フリースロークロック）
  private throwInViolationTimer: number = 0;
  private isThrowInViolationTimerRunning: boolean = false;
  private readonly throwInTimeLimit: number = 5.0; // 5秒以内に投げ入れる

  // モーション確認モード（入力とモーション再生を停止）
  private isMotionConfirmationMode: boolean = false;

  // 一時停止状態（シュートチェックモードなど他のモードが動作中）
  private isPaused: boolean = false;

  // 初期化完了フラグ（物理エンジン・ジャンプボール設定完了まで更新をスキップ）
  private isInitialized: boolean = false;

  // チーム設定とプレイヤーデータ（キャラクター再作成用）
  private savedTeamConfig: GameTeamConfig | null = null;
  private savedPlayerData: Record<string, PlayerData> | null = null;

  // スコア管理
  private allyScore: number = 0;
  private enemyScore: number = 0;
  private readonly winningScore: number = 5; // 勝利に必要な得点
  private winner: 'ally' | 'enemy' | null = null; // 勝者

  // ゴール後のリセット待機状態
  private pendingGoalReset: boolean = false;
  private pendingGoalScoringTeam: 'ally' | 'enemy' | null = null;
  private goalResetTimer: number = 0;
  private readonly goalResetDelay: number = 3.0; // ゴール後のリセットまでの最大待機時間（秒）

  // アウトオブバウンズ後のリセット待機状態
  private pendingOutOfBoundsReset: boolean = false;
  private outOfBoundsResetTimer: number = 0;
  private readonly outOfBoundsResetDelay: number = 1.5; // アウトオブバウンズ後のリセット待機時間（秒）

  // ボールの前フレーム位置（アウトオブバウンズの方向判定用）
  private previousBallPosition: Vector3 | null = null;

  // スローイン: スロワーがボールを投げたかどうか（投げた後は移動可能）
  private throwInBallThrown: boolean = false;

  // ジャンプボール関連
  private jumpBallInfo: JumpBallInfo = { ...DEFAULT_JUMP_BALL_INFO };
  private jumpBallAllyJumper: Character | null = null;
  private jumpBallEnemyJumper: Character | null = null;
  private jumpBallTimer: number = 0;

  // ルーズボール関連（誰もボールを保持していない状態のタイマー）
  private looseBallTimer: number = 0;
  private readonly LOOSE_BALL_JUMP_BALL_THRESHOLD: number = 10.0; // 10秒でジャンプボール

  constructor(canvas: HTMLCanvasElement, options?: {
    showAdditionalCharacters?: boolean;
    teamConfig?: GameTeamConfig;
    playerData?: Record<string, PlayerData>;
  }) {
    const showAdditionalCharacters = options?.showAdditionalCharacters ?? true;
    const teamConfig = options?.teamConfig;
    const playerData = options?.playerData;

    // WebGLサポートチェック（テスト用キャンバスを使用して、実際のキャンバスのコンテキストを消費しない）
    const testCanvas = document.createElement("canvas");
    const webglSupported = !!(testCanvas.getContext("webgl2") || testCanvas.getContext("webgl"));
    if (!webglSupported) {
      throw new Error(
        "WebGL is not supported in this browser. Please use a modern browser that supports WebGL."
      );
    }

    // エンジンの作成
    try {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
    } catch (error: unknown) {
      console.error("[GameScene] Engine creation failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create Babylon.js engine: ${errorMessage}`);
    }

    // シーンの作成
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.5, 0.7, 0.9, 1.0); // 空色の背景

    // Havok物理エンジンの初期化（非同期で実行）
    this.initializePhysicsAsync();

    // カメラの設定
    this.camera = this.createCamera(canvas);

    // ライトの設定
    this.createLights();

    // フィールドの作成
    this.field = new Field(this.scene);

    // ボールの作成
    this.ball = this.createBall();

    // チーム設定とプレイヤーデータを保存（キャラクター再作成用）
    if (teamConfig && playerData) {
      this.savedTeamConfig = teamConfig;
      this.savedPlayerData = playerData;
    }

    // キャラクターの作成（6対6）
    if (showAdditionalCharacters && teamConfig && playerData) {
      this.createTeams(teamConfig, playerData);
    } else if (!showAdditionalCharacters) {
      // モーション確認モードの場合、デフォルトキャラクターを1体作成
      const defaultCharacter = this.createCharacter();
      this.allyCharacters.push(defaultCharacter);
    }

    // 全キャラクターのリスト
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];

    // 衝突判定コントローラーの初期化（キャラクターが存在する場合のみ）
    if (allCharacters.length > 0) {
      this.collisionHandler = new CollisionHandler(this.ball, allCharacters);
    }

    // AIコントローラーの初期化（hasAI: trueのキャラクターのみ）
    if (showAdditionalCharacters) {
      for (const character of allCharacters) {
        // AIで動くキャラクターのみAIコントローラーを設定
        if (this.aiCharacterIndices.has(character)) {
          const ai = new CharacterAI(character, this.ball, allCharacters, this.field);
          this.characterAIs.push(ai);
        }
      }
    }

    // 1on1バトルコントローラーの初期化
    if (allCharacters.length > 0) {
      this.oneOnOneBattleController = new OneOnOneBattleController(
        this.ball,
        () => [...this.allyCharacters, ...this.enemyCharacters]
      );
    }

    // 競り合いコントローラーの初期化
    if (allCharacters.length > 0) {
      this.contestController = new ContestController(
        () => [...this.allyCharacters, ...this.enemyCharacters],
        this.ball
      );
    }

    // サークルサイズコントローラーの初期化
    if (allCharacters.length > 0) {
      this.circleSizeController = new CircleSizeController(
        () => [...this.allyCharacters, ...this.enemyCharacters],
        this.ball
      );
    }

    // フェイントコントローラーの初期化
    if (allCharacters.length > 0) {
      this.feintController = new FeintController(
        () => [...this.allyCharacters, ...this.enemyCharacters],
        this.ball
      );
    }

    // シュートクロックコントローラーの初期化
    this.shotClockController = new ShotClockController(this.ball);
    this.shotClockController.setViolationCallback((offendingTeam, ballPosition) => {
      this.handleShotClockViolation(offendingTeam, ballPosition);
    });

    // シュートコントローラーの初期化
    if (allCharacters.length > 0) {
      this.shootingController = new ShootingController(
        this.scene,
        this.ball,
        this.field,
        () => [...this.allyCharacters, ...this.enemyCharacters]
      );

      // ゴール時のコールバックを設定
      this.shootingController.setOnGoalCallback((scoringTeam) => {
        this.resetAfterGoal(scoringTeam);
      });

      // シュート試行時のコールバックを設定（ショットクロック用）
      this.shootingController.setOnShotAttemptCallback(() => {
        if (this.shotClockController) {
          this.shotClockController.onShotAttempted();
        }
      });

      // 全AIコントローラーにShootingControllerを設定
      for (const ai of this.characterAIs) {
        ai.setShootingController(this.shootingController);
      }

      // 全AIコントローラーにFeintControllerを設定
      if (this.feintController) {
        for (const ai of this.characterAIs) {
          ai.setFeintController(this.feintController);
        }
      }

      // 全AIコントローラーにShotClockControllerを設定
      if (this.shotClockController) {
        for (const ai of this.characterAIs) {
          ai.setShotClockController(this.shotClockController);
        }
      }

      // 全AIコントローラーにパスコールバックを設定
      for (const ai of this.characterAIs) {
        ai.setPassCallback((passer, target, passType) => {
          return this.performPass(passer, passType, target);
        });
      }

      // パス軌道可視化の初期化
      this.passTrajectoryVisualizer = new PassTrajectoryVisualizer(
        this.scene,
        this.ball,
        allCharacters
      );

      // 全AIコントローラーにパス軌道可視化を設定
      for (const ai of this.characterAIs) {
        ai.setPassTrajectoryVisualizer(this.passTrajectoryVisualizer);
      }

      // シュート軌道可視化の初期化
      this.shootTrajectoryVisualizer = new ShootTrajectoryVisualizer(
        this.scene,
        this.ball,
        this.field,
        allCharacters
      );

      // ドリブル導線可視化の初期化
      this.dribblePathVisualizer = new DribblePathVisualizer(
        this.scene,
        this.ball,
        this.field,
        allCharacters
      );
      // デフォルトで有効化
      this.dribblePathVisualizer.setEnabled(true);
    }

    // 入力コントローラーの初期化（プレイヤーキャラクター）
    if (allCharacters.length > 0) {
      this.inputController = new InputController(this.scene, allCharacters[0]);
      // 関節操作コントローラーの初期化（モーション選択UI含む）
      this.jointController = new JointController(this.scene, allCharacters[0]);
    }

    // 3Dモデルのロード（オプション）
    // this.loadCharacterModel(); // 一旦無効化

    // レンダーループの開始
    this.startRenderLoop();

    // ウィンドウリサイズ対応
    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }

  /**
   * カメラを作成
   */
  private createCamera(canvas: HTMLCanvasElement): ArcRotateCamera {
    // アークローテートカメラ（キャラクターを中心に回転）
    const camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2, // 初期水平角度（キャラクターの後ろ）
      Math.PI / 3, // 初期垂直角度（やや上から見下ろす）
      10, // 初期距離
      Vector3.Zero(), // 初期ターゲット
      this.scene
    );

    // カメラの制限
    camera.lowerRadiusLimit = 3; // 最小距離
    camera.upperRadiusLimit = 30; // 最大距離
    camera.lowerBetaLimit = 0.1; // 最小垂直角度（真上を防ぐ）
    camera.upperBetaLimit = Math.PI / 2.2; // 最大垂直角度（真下を防ぐ）

    // マウス操作を有効化
    camera.attachControl(canvas, true);

    return camera;
  }

  /**
   * ライトを作成
   */
  private createLights(): void {
    // 環境光（Hemispheric Light）
    const hemisphericLight = new HemisphericLight(
      "hemispheric-light",
      new Vector3(0, 1, 0),
      this.scene
    );
    hemisphericLight.intensity = LIGHT_CONFIG.ambient.intensity;

    // 太陽光（Directional Light）
    const directionalLight = new DirectionalLight(
      "directional-light",
      new Vector3(
        LIGHT_CONFIG.directional.direction.x,
        LIGHT_CONFIG.directional.direction.y,
        LIGHT_CONFIG.directional.direction.z
      ),
      this.scene
    );
    directionalLight.intensity = LIGHT_CONFIG.directional.intensity;
  }

  /**
   * チーム設定に基づいてキャラクターを作成（5対5）
   */
  private createTeams(teamConfig: GameTeamConfig, playerData: Record<string, PlayerData>): void {
    // 味方チーム作成
    for (const playerConfig of teamConfig.allyTeam.players) {
      const player = playerData[playerConfig.playerId];
      if (!player) {
        console.warn(`[GameScene] 選手ID ${playerConfig.playerId} のデータが見つかりません`);
        continue;
      }

      const config = DEFAULT_CHARACTER_CONFIG;
      const position = new Vector3(playerConfig.x, config.physical.height / 2, playerConfig.z);

      const character = new Character(this.scene, position, config);
      character.team = "ally";
      character.setPlayerData(player, playerConfig.position);

      // 選手の身長を反映（cm → m）
      const heightInMeters = player.basic.height / 100;
      character.setHeight(heightInMeters);

      // 味方チームの胴体を青くする
      character.setBodyColor(0.0, 0.4, 1.0);

      this.allyCharacters.push(character);

      // AIで動くキャラクターを記録（hasAI省略時はtrue扱い）
      if (playerConfig.hasAI !== false) {
        this.aiCharacterIndices.add(character);
      }
    }

    // 敵チーム作成
    for (const playerConfig of teamConfig.enemyTeam.players) {
      const player = playerData[playerConfig.playerId];
      if (!player) {
        console.warn(`[GameScene] 選手ID ${playerConfig.playerId} のデータが見つかりません`);
        continue;
      }

      const config = DEFAULT_CHARACTER_CONFIG;
      const position = new Vector3(playerConfig.x, config.physical.height / 2, playerConfig.z);

      const character = new Character(this.scene, position, config);
      character.team = "enemy";
      character.setPlayerData(player, playerConfig.position);

      // 選手の身長を反映（cm → m）
      const heightInMeters = player.basic.height / 100;
      character.setHeight(heightInMeters);

      // 敵チームの胴体を赤くする
      character.setBodyColor(1.0, 0.0, 0.0);

      this.enemyCharacters.push(character);

      // AIで動くキャラクターを記録（hasAI省略時はtrue扱い）
      if (playerConfig.hasAI !== false) {
        this.aiCharacterIndices.add(character);
      }
    }
  }

  /**
   * キャラクターを作成（プレイヤー）- 旧バージョン（使用しない）
   */
  private createCharacter(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // 初期位置（フィールドの中央）
    const initialPosition = new Vector3(0, config.physical.height / 2, 0);

    const character = new Character(this.scene, initialPosition, config);

    // プレイヤーは味方チーム
    character.setTeam("ally");

    return character;
  }

  /**
   * ボールを作成
   */
  private createBall(): Ball {
    // プレイヤーの前方に配置（半径0.25mなので、地面からの高さは0.25m）
    const initialPosition = new Vector3(0, 0.25, 2);

    const ball = new Ball(this.scene, initialPosition);

    return ball;
  }

  /**
   * Havok物理エンジンを非同期で初期化
   * ボールやキャラクターの物理演算に使用される
   */
  private async initializePhysicsAsync(): Promise<void> {
    try {
      const physicsManager = PhysicsManager.getInstance();
      await physicsManager.initialize(this.scene);

      // 地面に静的物理ボディを追加（ボールが床を通り抜けないように）
      if (this.field) {
        this.field.initializePhysics();
      }

      // 物理エンジン初期化後にボールの物理を再初期化
      if (this.ball) {
        this.ball.reinitializePhysics();
      }

      // 全キャラクターの物理ボディを初期化（ボールとの衝突用）
      const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
      for (const character of allCharacters) {
        character.initializePhysics();
      }

      // 物理エンジン初期化後、ゲームモードの場合はジャンプボールを開始
      if (this.gameMode === 'game' && this.allyCharacters.length > 0 && this.enemyCharacters.length > 0) {
        this.setupJumpBall();
      }

      // 初期化完了フラグを設定
      this.isInitialized = true;
    } catch (error) {
      console.error("[GameScene] Havok physics initialization failed:", error);
      throw new Error("Havok physics engine is required but failed to initialize");
    }
  }

  /**
   * 3Dモデルをロード（オプション）
   * 現在は無効化中（@babylonjs/loadersパッケージが必要）

  private async loadCharacterModel(): Promise<void> {
    try {
      // モデルパスを取得
      const modelPath = MODEL_CONFIG.defaultModelPath;

      // モデルをロード
      const model = await ModelLoader.loadGLTF(this.scene, modelPath);

      // スケールを設定
      ModelLoader.setScale(model, MODEL_CONFIG.scale);

      // 回転を設定
      ModelLoader.setRotation(
        model,
        MODEL_CONFIG.rotationOffset.x,
        MODEL_CONFIG.rotationOffset.y,
        MODEL_CONFIG.rotationOffset.z
      );

      // キャラクターにモデルを設定
      this.character.setModel(model);

      this.modelLoaded = true;
    } catch (error) {
      console.warn(
        "[GameScene] 3Dモデルのロードに失敗しました。仮のメッシュを使用します。",
        error
      );
      // モデルのロードに失敗した場合は、仮のメッシュをそのまま使用
      this.modelLoaded = false;
    }
  }
  */

  /**
   * レンダーループを開始
   */
  private startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      // デルタタイムを計算
      const currentTime = Date.now();
      const deltaTime = (currentTime - this.lastFrameTime) / 1000;
      this.lastFrameTime = currentTime;

      // 更新処理
      this.update(deltaTime);

      // シーンをレンダリング
      this.scene.render();
    });
  }

  /**
   * 更新処理（毎フレーム）
   */
  private update(deltaTime: number): void {
    // 初期化完了前はゲームロジックをスキップ（物理エンジン・ジャンプボール設定待ち）
    if (!this.isInitialized) {
      return;
    }

    // 一時停止中はゲームロジックをすべてスキップ（レンダリングのみ継続）
    if (this.isPaused) {
      return;
    }

    // ジャンプボール中の更新
    if (this.isJumpBallActive()) {
      this.updateJumpBall(deltaTime);
      // ジャンプボール中もキャラクター、ボール、フィールドは更新
      const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
      for (const character of allCharacters) {
        character.update(deltaTime);
      }
      this.ball.update(deltaTime);
      this.field.update(deltaTime);
      // ジャンプボール中の衝突判定
      if (this.collisionHandler) {
        this.collisionHandler.update(deltaTime);
      }
      // カメラ更新
      this.updateCamera(deltaTime);
      return;
    }

    // モーション確認モードでは入力とモーション再生をスキップ
    if (!this.isMotionConfirmationMode) {
      // 入力コントローラーを更新
      if (this.inputController) {
        this.inputController.update(deltaTime);
      }

      // 全キャラクターを更新
      const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
      for (const character of allCharacters) {
        character.update(deltaTime);
      }

      // 競り合いコントローラーの更新（キャラクター同士の押し合い）
      if (this.contestController) {
        this.contestController.update(deltaTime);
      }

      // サークルサイズコントローラーの更新（状況に応じたサークルサイズ変更）
      if (this.circleSizeController) {
        this.circleSizeController.update(deltaTime);
      }

      // フェイントコントローラーの更新
      if (this.feintController) {
        this.feintController.update(deltaTime);
      }

      // スローイン中の位置強制（衝突判定前に実行してレシーバー位置を正確にする）
      this.enforceThrowInPositions();

      // ボールを更新（キャラクター位置が確定した後にボール位置を更新）
      // 衝突判定より先に実行して、正しいボール位置で判定する
      this.ball.update(deltaTime);

      // ボール衝突判定（ボールキャッチ処理）を状態更新前に実行
      // これにより、ボールをキャッチした瞬間に正しい状態が設定される
      if (this.collisionHandler) {
        this.collisionHandler.update(deltaTime);
      }

      // キャラクターの状態を更新（AI更新前に実行して正しい状態でAIが動作するようにする）
      if (this.collisionHandler) {
        this.collisionHandler.updateStates();
      }

      // 1on1バトルコントローラーの更新（状態更新後に実行して正しい状態で動作）
      if (this.oneOnOneBattleController) {
        this.oneOnOneBattleController.updateDribbleBreakthrough(deltaTime);
        this.oneOnOneBattleController.update1on1Movement(deltaTime);
      }

      // 全AIコントローラーを更新
      // 1on1接触中はオンボールプレイヤー/ディフェンダーのAIをスキップ
      const circlesInContact = this.oneOnOneBattleController?.isCirclesInContact() ?? false;
      for (const ai of this.characterAIs) {
        const character = ai.getCharacter();
        const state = character.getState();

        // ボールが飛行中でレシーバーがまだ受け取っていない場合はAI更新をスキップ
        // （THROW_IN_RECEIVER状態のままなのでスローインAIは不要）
        if (this.throwInReceiver && this.ball.isInFlight() && character === this.throwInReceiver) {
          continue;
        }

        // 1on1接触中はオンボールプレイヤー/ディフェンダーのAIをスキップ
        if (circlesInContact) {
          if (state === CharacterState.ON_BALL_PLAYER || state === CharacterState.ON_BALL_DEFENDER) {
            continue; // 接触中は1on1ペアのAI更新をスキップ
          }
        }

        ai.update(deltaTime);
      }

      // カメラをプレイヤーキャラクターに追従させる
      this.updateCamera(deltaTime);

      // パス軌道可視化を更新
      if (this.passTrajectoryVisualizer) {
        this.passTrajectoryVisualizer.update((character) => {
          // キャラクターのAIコントローラーを取得して目標位置を取得
          const ai = this.characterAIs.find(a => a.getCharacter() === character);
          if (ai) {
            return ai.getOffBallOffenseAI().getCurrentTargetPosition();
          }
          return null;
        });
      }

      // シュート軌道可視化を更新
      if (this.shootTrajectoryVisualizer) {
        this.shootTrajectoryVisualizer.update();
      }

      // ドリブル導線可視化を更新
      if (this.dribblePathVisualizer) {
        this.dribblePathVisualizer.update();
      }
    }

    // モーション確認モードの場合のみボールを更新（通常モードは上で更新済み）
    if (this.isMotionConfirmationMode) {
      this.ball.update(deltaTime);
    }

    // フィールドを更新（ネットの物理シミュレーション）
    this.field.update(deltaTime);

    // 関節操作コントローラーは常に更新（Ctrl+ドラッグ用）
    if (this.jointController) {
      this.jointController.update(deltaTime);
    }

    // 1on1状態の変化をチェック
    if (this.oneOnOneBattleController) {
      this.oneOnOneBattleController.check1on1Battle();

      // 有利/不利状態をオンボールプレイヤーとディフェンダーに反映
      const advantageStatus = this.oneOnOneBattleController.getAdvantageStatus();
      const onBallPlayer = this.oneOnOneBattleController.findOnBallPlayer();
      const onBallDefender = this.oneOnOneBattleController.findOnBallDefender();
      if (onBallPlayer) {
        onBallPlayer.setAdvantageStatus(advantageStatus);
      }
      if (onBallDefender) {
        onBallDefender.setAdvantageStatus(advantageStatus);
      }
    }

    // シュートコントローラーの更新（ゴール判定）
    if (this.shootingController) {
      this.shootingController.update(deltaTime);
    }

    // ゴール後のリセット待機中の処理
    if (this.pendingGoalReset) {
      this.goalResetTimer -= deltaTime;

      // ボールが地面でバウンドした（飛行終了）か、タイムアウトした場合にリセット
      if (!this.ball.isInFlight() || this.goalResetTimer <= 0) {
        this.executeGoalReset();
      }
    }

    // ボール保持者の変更を検出してシュートクロックに通知
    const currentBallHolder = this.ball.getHolder();
    if (currentBallHolder !== this.previousBallHolder) {
      if (this.shotClockController) {
        this.shotClockController.onPossessionChange(currentBallHolder);
      }
      this.previousBallHolder = currentBallHolder;

      // スローインが完了したかチェック（ボールを誰かが受け取った）
      // 新設計: 特定のレシーバーではなく、スロワー以外の誰かがボールを持ったら完了
      // isThrowInPendingに関係なく、スロワー以外がボールを持ったらスローイン完了
      if (this.throwInThrower && currentBallHolder && currentBallHolder !== this.throwInThrower) {
        // 5秒違反タイマーを停止
        this.isThrowInViolationTimerRunning = false;
        this.throwInViolationTimer = 0;

        // スローイン待機中フラグもクリア
        this.isThrowInPending = false;
        this.throwInTimer = 0;

        // シュートクロックを開始（スローインが成功したのでここで開始）
        if (this.shotClockController) {
          this.shotClockController.reset(currentBallHolder.team);
        }

        // スロワーのスローインフラグを解除
        this.throwInThrower.setAsThrowInThrower(null);
        this.throwInThrower = null;
        this.throwInReceiver = null;
        this.throwInPosition = null;
        // 状態は既にCollisionHandlerが通常状態に設定しているはず
      }
    }

    // スローイン後、ボールがルーズ状態（誰も保持せず、飛行中でもない）になった場合
    // passTargetをクリアして、誰でもLOOSE_BALLとしてキャッチできるようにする
    // isThrowInThrowerフラグは残す（スロワーがキャッチできないようにするため）
    if (this.throwInThrower && !currentBallHolder && !this.ball.isInFlight()) {
      const lastToucher = this.ball.getLastToucher();
      if (lastToucher === this.throwInThrower && this.ball.getPassTarget()) {
        // passTargetをクリア（スローイン保護を解除し、誰でもキャッチできるようにする）
        this.ball.clearPassTarget();
      }
    }

    // アウトオブバウンズ判定（ゴール後・アウトオブバウンズのリセット待機中・スローイン中・ジャンプボール中は判定しない）
    // スローイン中はボールが外側マスから投げられるため、判定をスキップ
    // ジャンプボール中はボールがセンターで上下するため、判定をスキップ
    // ただし、ボールが投げられて着地した後（飛行中でなく、誰も保持していない）は判定を有効にする
    const ballHolder = this.ball.getHolder();
    const ballInFlight = this.ball.isInFlight();
    const isThrowInBeforeThrow = this.isThrowInPending || (this.throwInThrower !== null && (ballHolder === this.throwInThrower || ballInFlight));
    const isJumpBallInProgress = this.isJumpBallActive();
    if (!this.pendingGoalReset && !this.pendingOutOfBoundsReset && !isThrowInBeforeThrow && !isJumpBallInProgress && this.checkOutOfBounds()) {
      // リセットを予約（遅延実行）
      this.pendingOutOfBoundsReset = true;
      this.outOfBoundsResetTimer = this.outOfBoundsResetDelay;
      // アウトオブバウンズ時のボール位置を記録
      this.outOfBoundsBallPosition = this.ball.getPosition().clone();
    }

    // アウトオブバウンズリセット待機処理
    if (this.pendingOutOfBoundsReset) {
      this.outOfBoundsResetTimer -= deltaTime;
      if (this.outOfBoundsResetTimer <= 0) {
        this.resetAfterOutOfBounds();
        this.pendingOutOfBoundsReset = false;
      }
    }

    // シュートクロック更新
    if (this.shotClockController) {
      this.shotClockController.update(deltaTime);
    }

    // ルーズボールタイマー更新（誰もボールを保持していない状態を追跡）
    // ゴールリセット待機中、アウトオブバウンズ待機中、スローイン中は追跡しない
    if (!this.pendingGoalReset && !this.pendingOutOfBoundsReset && !this.isThrowInPending && !this.throwInThrower) {
      if (!currentBallHolder && !this.ball.isInFlight()) {
        // ルーズボール状態
        this.looseBallTimer += deltaTime;

        // 10秒経過したらジャンプボールで再開
        if (this.looseBallTimer >= this.LOOSE_BALL_JUMP_BALL_THRESHOLD) {
          this.looseBallTimer = 0;
          this.setupJumpBall();
          return; // ジャンプボール開始のため、以降の処理をスキップ
        }
      } else {
        // ボールが保持されているか飛行中の場合、タイマーをリセット
        this.looseBallTimer = 0;
      }
    } else {
      // 特殊状態中はタイマーをリセット
      this.looseBallTimer = 0;
    }

    // シュートクロック違反リセット待機処理
    if (this.pendingShotClockViolationReset) {
      this.shotClockViolationResetTimer -= deltaTime;
      if (this.shotClockViolationResetTimer <= 0) {
        this.executeShotClockViolationReset();
        this.pendingShotClockViolationReset = false;
      }
    }

    // スローイン待機処理
    if (this.isThrowInPending) {
      // スロワーの位置を固定（毎フレーム）、向きはAIに任せる
      if (this.throwInThrower && this.throwInPosition) {
        this.throwInThrower.setPosition(this.throwInPosition, true); // 外側マスなのでクランプをスキップ
        // 新設計: 向きはAI（OnBallOffenseAI.updateThrowInThrower）が制御
        // 待機中もAIがサーベイを行うので、向きを上書きしない

        // ボールがスロワーに保持されていることを確認
        // ボールが誰にも保持されておらず、飛行中でもない場合のみスロワーに戻す
        // （誰かがキャッチした場合や、パス中は戻さない）
        // 注意: lastToucherがスロワーの場合、スロワーが既にボールを投げた後なので戻さない
        const currentHolder = this.ball.getHolder();
        const lastToucher = this.ball.getLastToucher();
        const throwerAlreadyThrew = lastToucher === this.throwInThrower && currentHolder !== this.throwInThrower;
        if (currentHolder === null && !this.ball.isInFlight() && !throwerAlreadyThrew) {
          this.ball.setHolder(this.throwInThrower);
        }
      }
      // 新設計: 特定のレシーバー位置固定は不要（全員が自由に動いてパスを受ける位置に移動）

      this.throwInTimer -= deltaTime;
      if (this.throwInTimer <= 0) {
        this.executeThrowIn();
      }
    } else if (this.throwInThrower && this.throwInPosition) {
      // スローイン実行フェーズ

      // スロワーがボールを投げたかチェック
      const lastToucher = this.ball.getLastToucher();
      const throwerHasBall = this.ball.getHolder() === this.throwInThrower;
      const throwerHasThrown = lastToucher === this.throwInThrower && !throwerHasBall;

      if (throwerHasThrown) {
        // ボールを投げた後: スロワーはフィールド内に移動可能
        // isThrowInThrowerフラグを解除して通常のプレイヤーとして動けるようにする
        if (!this.throwInBallThrown) {
          this.throwInBallThrown = true;
          this.throwInThrower.setAsThrowInThrower(null);
          // throwInThrower参照は保持（スローイン完了判定に必要）
        }
        // 位置固定を解除、自由に移動可能
      } else {
        // ボールを投げる前: 位置を固定
        this.throwInThrower.setPosition(this.throwInPosition, true);
        this.throwInThrower.stopMovement();
      }

      // 5秒スローイン違反タイマーのチェック（投げる前のみ）
      if (!throwerHasThrown && this.isThrowInViolationTimerRunning) {
        this.throwInViolationTimer -= deltaTime;
        if (this.throwInViolationTimer <= 0) {
          this.handleThrowInViolation();
        }
      }
    }

    // ボールの前フレーム位置を更新（アウトオブバウンズ方向判定用）
    this.previousBallPosition = this.ball.getPosition().clone();
  }

  /**
   * スローイン5秒違反を処理（相手ボールに）
   */
  private handleThrowInViolation(): void {
    if (!this.throwInThrower) return;

    const violatingTeam = this.throwInThrower.team;

    // 同じ位置から相手チームのスローインを開始
    const throwInPosition = this.throwInPosition?.clone() || this.ball.getPosition().clone();

    // 違反したチームのスロワーフラグを解除
    this.throwInThrower.setAsThrowInThrower(null);

    // スローイン状態をクリア（5秒タイマーも含む）
    this.isThrowInViolationTimerRunning = false;
    this.throwInViolationTimer = 0;
    this.clearThrowInState();

    // 相手チームのスローインを実行（違反したチームをoffendingTeamとして渡す）
    this.executeThrowInReset(violatingTeam, throwInPosition);
  }

  /**
   * スローインを実行（待機フェーズから実行フェーズへ移行）
   * 新設計: AIがパスを実行するので、ここでは移行処理のみ
   */
  private executeThrowIn(): void {
    // 新設計: throwInReceiverは不要（全員がレシーバー候補）
    if (!this.throwInThrower || !this.throwInPosition) {
      console.warn('[GameScene] スローイン情報が不足しています');
      this.clearThrowInState();
      return;
    }

    // ボールがスローイン担当者に保持されているか確認
    // 注意: AIが待機フェーズ中に既にボールを投げた場合もある（正常動作）
    const holder = this.ball.getHolder();
    const ballAlreadyThrown = holder === null && (this.ball.isInFlight() || this.ball.getLastToucher() === this.throwInThrower);

    if (holder !== this.throwInThrower && !ballAlreadyThrown) {
      // ボールが別の人に渡っている場合はエラー
      console.warn('[GameScene] スローイン担当者がボールを持っていません');
      this.clearThrowInState();
      return;
    }

    // スロワーを外側マスの固定位置に固定し続ける
    this.throwInThrower.setPosition(this.throwInPosition, true); // 外側マスなのでクランプをスキップ

    // ボールが既に投げられている場合は5秒違反タイマーは不要（パスは既に実行済み）
    // まだ投げていない場合のみタイマーを開始
    if (!ballAlreadyThrown) {
      // 5秒スローイン違反タイマーを開始（ショットクロックではなくフリースロークロック）
      this.throwInViolationTimer = this.throwInTimeLimit;
      this.isThrowInViolationTimerRunning = true;
    }

    // シュートクロックは停止したまま（スローインが完了してから再開）
    if (this.shotClockController) {
      this.shotClockController.stop();
    }

    // スローインロックを解除（新設計では全員がレシーバー候補なのでロック不要）
    this.ball.clearThrowInLock();

    // スローイン待機状態はクリアするが、スロワー情報は保持
    // AIがパスを実行し、誰かがキャッチするまでスロワーは外側マスに固定
    this.isThrowInPending = false;
    this.throwInTimer = 0;
    // throwInThrowerはボール受け取りまで保持（位置固定のため）
  }

  /**
   * スローイン状態を完全にクリア
   */
  private clearThrowInState(): void {
    this.isThrowInPending = false;
    this.throwInTimer = 0;
    this.throwInThrower = null;
    this.throwInReceiver = null;
    this.throwInPosition = null;
    this.throwInBallThrown = false; // スロワー投げ済みフラグをリセット
    // 5秒違反タイマーもクリア
    this.isThrowInViolationTimerRunning = false;
    this.throwInViolationTimer = 0;
    // スローインロックを解除
    this.ball.clearThrowInLock();
    // キャラクターのスローイン状態もクリア
    this.clearAllThrowInCharacterStates();
  }

  /**
   * スローイン中のキャラクター位置を強制（衝突判定前に呼び出す）
   * 新設計: スロワーの位置のみ固定、向きはAIが制御
   * 特定のレシーバーは設定しない（全員がパス対象）
   */
  private enforceThrowInPositions(): void {
    // ボールを投げた後は位置固定しない（フィールド内に入れる）
    if (this.throwInBallThrown) {
      return;
    }

    // スローイン待機中の場合
    if (this.isThrowInPending) {
      if (this.throwInThrower && this.throwInPosition) {
        // 位置のみ固定、向きはAI（OnBallOffenseAI.updateThrowInThrower）が制御
        this.throwInThrower.setPosition(this.throwInPosition, true);
      }
      // 新設計: 特定のレシーバー位置固定は不要（全員が自由に動ける）
    }
    // スローイン実行中の場合（待機終了後、投げる前）
    else if (this.throwInThrower && this.throwInPosition) {
      // スロワーの位置のみ固定（向きはAIが制御するので変更しない）
      this.throwInThrower.setPosition(this.throwInPosition, true);
      this.throwInThrower.stopMovement();
      // 新設計: 特定のレシーバーは設定しないので、位置固定も不要
    }
  }

  /**
   * 全キャラクターのスローイン状態をクリアしてBALL_LOSTに戻す
   * （CollisionHandlerが次のフレームで適切な状態を設定する）
   */
  private clearAllThrowInCharacterStates(): void {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const char of allCharacters) {
      const state = char.getState();
      if (state === CharacterState.THROW_IN_THROWER ||
          state === CharacterState.THROW_IN_RECEIVER ||
          state === CharacterState.THROW_IN_OTHER) {
        // 一時的にBALL_LOSTに戻す（CollisionHandlerが次フレームで正しく設定する）
        char.setState(CharacterState.BALL_LOST);
      }
    }
  }

  // ==============================
  // ジャンプボール関連メソッド
  // ==============================

  /**
   * ジャンプボールをセットアップ
   * 両チームからジャンパーを選択し、選手を配置
   */
  private setupJumpBall(): void {

    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    if (allCharacters.length < 2) {
      console.warn('[GameScene] ジャンプボールに必要な選手が不足');
      return;
    }

    // ジャンパーを選択（センターまたは最も背の高い選手）
    this.jumpBallAllyJumper = this.selectJumper(this.allyCharacters);
    this.jumpBallEnemyJumper = this.selectJumper(this.enemyCharacters);

    if (!this.jumpBallAllyJumper || !this.jumpBallEnemyJumper) {
      console.warn('[GameScene] ジャンパーを選択できませんでした');
      return;
    }


    // ジャンパーをセンターサークル中央に配置
    const allyJumperPos = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      this.jumpBallAllyJumper.config.physical.height / 2,
      CENTER_CIRCLE.CENTER_Z - JUMP_BALL_POSITIONS.JUMPER_OFFSET_Z
    );
    const enemyJumperPos = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      this.jumpBallEnemyJumper.config.physical.height / 2,
      CENTER_CIRCLE.CENTER_Z + JUMP_BALL_POSITIONS.JUMPER_OFFSET_Z
    );

    this.jumpBallAllyJumper.setPosition(allyJumperPos);
    this.jumpBallEnemyJumper.setPosition(enemyJumperPos);

    // ジャンパーが向かい合うように設定
    this.jumpBallAllyJumper.lookAt(enemyJumperPos);
    this.jumpBallEnemyJumper.lookAt(allyJumperPos);

    // 他の選手をセンターサークル外側に配置
    this.positionOtherPlayersForJumpBall();

    // 全選手にジャンプボール状態を設定
    this.setJumpBallStates();

    // ボールをセンターサークル上空に配置（審判位置）
    const ballStartPos = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      JUMP_BALL_POSITIONS.BALL_START_HEIGHT, // 300cmの高さから開始
      CENTER_CIRCLE.CENTER_Z
    );
    this.ball.setPosition(ballStartPos, true);
    this.ball.endFlight();

    // ジャンプボール情報を初期化
    this.jumpBallInfo = {
      phase: 'preparing',
      allyJumper: this.jumpBallAllyJumper.playerPosition || null,
      enemyJumper: this.jumpBallEnemyJumper.playerPosition || null,
      elapsedTime: 0,
      ballTipped: false,
    };
    this.jumpBallTimer = JUMP_BALL_TIMING.PREPARATION_TIME;

    // シュートクロックを停止
    if (this.shotClockController) {
      this.shotClockController.stop();
    }

  }

  /**
   * チームからジャンパーを選択
   * センター（C）を優先、いなければ最も背の高い選手
   */
  private selectJumper(team: Character[]): Character | null {
    if (team.length === 0) return null;

    // センターを探す
    const center = team.find(c => c.playerPosition === 'C');
    if (center) return center;

    // センターがいない場合は最も背の高い選手
    let tallest = team[0];
    for (const char of team) {
      if (char.config.physical.height > tallest.config.physical.height) {
        tallest = char;
      }
    }
    return tallest;
  }

  /**
   * ジャンプボール時に他の選手を配置
   * - 各チーム1人だけサークル付近に配置
   * - それ以外は自陣のランダムな位置に配置
   */
  private positionOtherPlayersForJumpBall(): void {
    const minDistance = JUMP_BALL_POSITIONS.OTHER_PLAYER_MIN_DISTANCE;
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 14m

    // 味方チームの配置
    let allyCirclePlayerPlaced = false;
    for (const char of this.allyCharacters) {
      if (char === this.jumpBallAllyJumper) continue;

      let x: number, z: number;

      if (!allyCirclePlayerPlaced) {
        // 最初の1人はサークル付近（左側）に配置
        const angle = -Math.PI / 2; // 左側
        x = CENTER_CIRCLE.CENTER_X + minDistance * Math.cos(angle);
        z = CENTER_CIRCLE.CENTER_Z + minDistance * Math.sin(angle);
        allyCirclePlayerPlaced = true;
      } else {
        // それ以外は自陣（-Z側）のランダムな位置に配置
        x = (Math.random() - 0.5) * (halfWidth * 1.5); // -5.6 ~ 5.6m
        z = -halfLength * 0.3 - Math.random() * (halfLength * 0.5); // -4.2 ~ -11.2m
      }

      char.setPosition(new Vector3(x, char.config.physical.height / 2, z));
      char.lookAt(new Vector3(CENTER_CIRCLE.CENTER_X, 0, CENTER_CIRCLE.CENTER_Z));
    }

    // 敵チームの配置
    let enemyCirclePlayerPlaced = false;
    for (const char of this.enemyCharacters) {
      if (char === this.jumpBallEnemyJumper) continue;

      let x: number, z: number;

      if (!enemyCirclePlayerPlaced) {
        // 最初の1人はサークル付近（右側）に配置
        const angle = Math.PI / 2; // 右側
        x = CENTER_CIRCLE.CENTER_X + minDistance * Math.cos(angle);
        z = CENTER_CIRCLE.CENTER_Z + minDistance * Math.sin(angle);
        enemyCirclePlayerPlaced = true;
      } else {
        // それ以外は自陣（+Z側）のランダムな位置に配置
        x = (Math.random() - 0.5) * (halfWidth * 1.5); // -5.6 ~ 5.6m
        z = halfLength * 0.3 + Math.random() * (halfLength * 0.5); // 4.2 ~ 11.2m
      }

      char.setPosition(new Vector3(x, char.config.physical.height / 2, z));
      char.lookAt(new Vector3(CENTER_CIRCLE.CENTER_X, 0, CENTER_CIRCLE.CENTER_Z));
    }
  }

  /**
   * ジャンプボール状態を設定
   */
  private setJumpBallStates(): void {
    // 全キャラクターの状態をリセット
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const char of allCharacters) {
      char.stopMovement();
      char.playMotion(IDLE_MOTION);
      const actionController = char.getActionController();
      if (actionController) {
        actionController.cancelAction();
      }
    }

    // ジャンパーにJUMP_BALL_JUMPER状態を設定
    if (this.jumpBallAllyJumper) {
      this.jumpBallAllyJumper.setState(CharacterState.JUMP_BALL_JUMPER);
    }
    if (this.jumpBallEnemyJumper) {
      this.jumpBallEnemyJumper.setState(CharacterState.JUMP_BALL_JUMPER);
    }

    // 他の選手にJUMP_BALL_OTHER状態を設定
    for (const char of allCharacters) {
      if (char !== this.jumpBallAllyJumper && char !== this.jumpBallEnemyJumper) {
        char.setState(CharacterState.JUMP_BALL_OTHER);
      }
    }
  }

  /**
   * ジャンプボールを更新（メインループから呼び出し）
   */
  private updateJumpBall(deltaTime: number): void {
    if (this.jumpBallInfo.phase === 'idle' || this.jumpBallInfo.phase === 'completed') {
      return;
    }

    this.jumpBallInfo.elapsedTime += deltaTime;

    switch (this.jumpBallInfo.phase) {
      case 'preparing':
        this.jumpBallTimer -= deltaTime;
        if (this.jumpBallTimer <= 0) {
          this.executeJumpBallToss();
        }
        break;

      case 'tossing':
        // ボールの水平速度をゼロに強制（垂直落下を保証）
        this.enforceVerticalBallMotion();
        // ボールが適切な高さに達したらジャンプフェーズへ
        const ballHeight = this.ball.getPosition().y;
        if (ballHeight >= JUMP_BALL_TIMING.TIP_ENABLED_MIN_HEIGHT) {
          this.jumpBallInfo.phase = 'jumping';
          this.triggerJumperJumps();
        }
        break;

      case 'jumping':
        // ボールがチップされていない場合
        if (!this.jumpBallInfo.ballTipped) {
          // 垂直運動を強制（チップされるまで）
          this.enforceVerticalBallMotion();
          // チップ処理を試行
          this.tryTipBall();
        }
        // ボールが誰かに保持されたら完了
        if (this.ball.isHeld()) {
          this.completeJumpBall();
        }
        // チップ後、ボールが低くなったら（地面に近い）完了
        // これにより通常のルーズボール状態へ移行
        else if (this.jumpBallInfo.ballTipped) {
          const currentBallHeight = this.ball.getPosition().y;
          if (currentBallHeight < 1.0) {
            this.completeJumpBall();
          }
        }
        break;
    }
  }

  /**
   * ジャンプボール中のボールを垂直運動に強制
   * 水平方向の速度を0に、位置もセンターに固定
   */
  private enforceVerticalBallMotion(): void {
    const ballPos = this.ball.getPosition();
    const ballVel = this.ball.getVelocity();

    // 水平位置がセンターからずれていたら補正
    if (Math.abs(ballPos.x) > 0.01 || Math.abs(ballPos.z) > 0.01) {
      this.ball.setPosition(new Vector3(0, ballPos.y, 0), false);
    }

    // 水平速度があれば除去（垂直速度のみ維持）
    if (Math.abs(ballVel.x) > 0.01 || Math.abs(ballVel.z) > 0.01) {
      this.ball.setVelocity(new Vector3(0, ballVel.y, 0));
    }
  }

  /**
   * ジャンプボールのボール投げ上げを実行
   */
  private executeJumpBallToss(): void {

    // ボールを投げ上げる（300cmの高さから上に投げ上げる）
    const tossPosition = new Vector3(
      CENTER_CIRCLE.CENTER_X,
      JUMP_BALL_POSITIONS.BALL_START_HEIGHT, // 300cmの高さから開始
      CENTER_CIRCLE.CENTER_Z
    );
    this.ball.tossForJumpBall(tossPosition, JUMP_BALL_POSITIONS.BALL_TOSS_HEIGHT);

    this.jumpBallInfo.phase = 'tossing';
  }

  /**
   * ジャンパーにジャンプを指示
   */
  private triggerJumperJumps(): void {

    // 各ジャンパーにジャンプアクションを実行させる
    if (this.jumpBallAllyJumper) {
      const actionController = this.jumpBallAllyJumper.getActionController();
      if (actionController) {
        actionController.startAction('jump_ball');
      }
      // ジャンプボールモーションを再生
      this.jumpBallAllyJumper.playMotion(JUMP_BALL_MOTION);
    }

    if (this.jumpBallEnemyJumper) {
      const actionController = this.jumpBallEnemyJumper.getActionController();
      if (actionController) {
        actionController.startAction('jump_ball');
      }
      // ジャンプボールモーションを再生
      this.jumpBallEnemyJumper.playMotion(JUMP_BALL_MOTION);
    }
  }

  /**
   * ボールをチップできるか試行
   * ジャンパーがボールに到達可能な場合、チップを実行
   */
  private tryTipBall(): void {
    const ballPos = this.ball.getPosition();
    const ballHeight = ballPos.y;

    // ボールがチップ可能な高さ範囲にあるかチェック
    if (ballHeight < JUMP_BALL_TIMING.TIP_ENABLED_MIN_HEIGHT ||
        ballHeight > JUMP_BALL_TIMING.TIP_ENABLED_MAX_HEIGHT) {
      return;
    }

    // ジャンパーがいない場合は何もしない
    if (!this.jumpBallAllyJumper || !this.jumpBallEnemyJumper) {
      return;
    }

    // 各ジャンパーとボールの水平距離を計算
    const allyPos = this.jumpBallAllyJumper.getPosition();
    const enemyPos = this.jumpBallEnemyJumper.getPosition();

    const allyHorizontalDist = getDistance2D(ballPos, allyPos);
    const enemyHorizontalDist = getDistance2D(ballPos, enemyPos);

    // リーチ範囲（ジャンプ時に手が届く範囲）- 余裕を持たせる
    const reachRange = 1.5;

    // どちらかがリーチ範囲内にいるかチェック
    const allyCanReach = allyHorizontalDist <= reachRange;
    const enemyCanReach = enemyHorizontalDist <= reachRange;

    if (!allyCanReach && !enemyCanReach) {
      return;
    }

    // チップの勝者を決定（身長とランダム要素）
    let winner: 'ally' | 'enemy';
    if (allyCanReach && !enemyCanReach) {
      winner = 'ally';
    } else if (!allyCanReach && enemyCanReach) {
      winner = 'enemy';
    } else {
      // 両方がリーチ範囲内：身長差とランダム要素で決定
      const allyHeight = this.jumpBallAllyJumper.config.physical.height;
      const enemyHeight = this.jumpBallEnemyJumper.config.physical.height;
      const heightAdvantage = (allyHeight - enemyHeight) * 0.1; // 身長10cmで10%のアドバンテージ
      const randomFactor = Math.random() - 0.5; // -0.5 to 0.5
      winner = (heightAdvantage + randomFactor) > 0 ? 'ally' : 'enemy';
    }

    // チップ方向を決定（勝者のチームの方向）
    // ally: -Z方向（手前）、enemy: +Z方向（奥）
    const tipDirection = new Vector3(
      (Math.random() - 0.5) * JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO, // 横方向のランダム要素
      JUMP_BALL_PHYSICS.TIP_VERTICAL_RATIO, // 少し上向き
      winner === 'ally'
        ? -JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO
        : JUMP_BALL_PHYSICS.TIP_HORIZONTAL_RATIO
    ).normalize();

    // ボールをチップ
    this.ball.tipBall(tipDirection, JUMP_BALL_PHYSICS.TIP_BALL_SPEED);
    this.jumpBallInfo.ballTipped = true;

  }

  /**
   * ジャンプボールを完了
   */
  private completeJumpBall(): void {

    this.jumpBallInfo.phase = 'completed';
    this.jumpBallInfo.ballTipped = true;

    // 全選手のジャンプボール状態をクリア
    this.clearJumpBallStates();

    // ボール保持者のチームでシュートクロック開始
    const holder = this.ball.getHolder();
    if (holder && this.shotClockController) {
      this.shotClockController.reset(holder.team);
    }

    // ジャンプボール情報をリセット
    this.jumpBallAllyJumper = null;
    this.jumpBallEnemyJumper = null;
  }

  /**
   * ジャンプボール状態をクリア
   */
  private clearJumpBallStates(): void {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const char of allCharacters) {
      const state = char.getState();
      if (state === CharacterState.JUMP_BALL_JUMPER ||
          state === CharacterState.JUMP_BALL_OTHER) {
        // BALL_LOSTに戻す（CollisionHandlerが次フレームで正しく設定する）
        char.setState(CharacterState.BALL_LOST);
      }
    }
  }

  /**
   * ジャンプボールがアクティブかどうか
   */
  public isJumpBallActive(): boolean {
    return this.jumpBallInfo.phase !== 'idle' && this.jumpBallInfo.phase !== 'completed';
  }

  /**
   * ジャンプボール情報を取得
   */
  public getJumpBallInfo(): JumpBallInfo {
    return { ...this.jumpBallInfo };
  }

  /**
   * カメラの追従更新
   */
  private updateCamera(_deltaTime: number): void {
    // 現在のターゲットキャラクターを取得
    const targetCharacter = this.getCurrentTargetCharacter();
    if (!targetCharacter) return;

    // キャラクターの位置を取得
    const characterPosition = targetCharacter.getPosition();

    // カメラのターゲットをスムーズに移動
    const followSpeed = CAMERA_CONFIG.followSpeed;

    this.camera.target.x +=
      (characterPosition.x - this.camera.target.x) * followSpeed;
    this.camera.target.y +=
      (characterPosition.y - this.camera.target.y) * followSpeed;
    this.camera.target.z +=
      (characterPosition.z - this.camera.target.z) * followSpeed;
  }

  /**
   * 現在のターゲットキャラクターを取得
   */
  private getCurrentTargetCharacter(): Character | null {
    // オンボールモードの場合、ボール保持者を返す
    if (this.cameraMode === 'on_ball') {
      const holder = this.ball.getHolder();
      if (holder) {
        return holder;
      }
      // ボール保持者がいない場合はボールに最も近いキャラクターを返す
      const ballPos = this.ball.getPosition();
      let closestChar: Character | null = null;
      let closestDist = Infinity;
      for (const char of [...this.allyCharacters, ...this.enemyCharacters]) {
        const dist = Vector3.Distance(char.getPosition(), ballPos);
        if (dist < closestDist) {
          closestDist = dist;
          closestChar = char;
        }
      }
      return closestChar;
    }

    // マニュアルモードの場合、選択されたキャラクターを返す
    const characters = this.currentTargetTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;
    if (characters.length === 0) return null;
    if (this.currentTargetIndex >= characters.length) {
      this.currentTargetIndex = 0;
    }
    return characters[this.currentTargetIndex];
  }

  /**
   * カメラターゲットを次のキャラクターに切り替え
   */
  public switchToNextCharacter(): void {
    const characters = this.currentTargetTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;
    if (characters.length === 0) return;

    this.currentTargetIndex = (this.currentTargetIndex + 1) % characters.length;
  }

  /**
   * カメラターゲットを前のキャラクターに切り替え
   */
  public switchToPreviousCharacter(): void {
    const characters = this.currentTargetTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;
    if (characters.length === 0) return;

    this.currentTargetIndex = (this.currentTargetIndex - 1 + characters.length) % characters.length;
  }

  /**
   * カメラターゲットのチームを切り替え
   */
  public switchTeam(): void {
    this.currentTargetTeam = this.currentTargetTeam === 'ally' ? 'enemy' : 'ally';
    this.currentTargetIndex = 0;
  }

  /**
   * 現在のターゲット情報を取得
   */
  public getCurrentTargetInfo(): {
    team: 'ally' | 'enemy';
    index: number;
    character: Character | null;
    cameraMode: 'on_ball' | 'manual';
  } {
    return {
      team: this.currentTargetTeam,
      index: this.currentTargetIndex,
      character: this.getCurrentTargetCharacter(),
      cameraMode: this.cameraMode,
    };
  }

  /**
   * カメラモードを設定
   */
  public setCameraMode(mode: 'on_ball' | 'manual'): void {
    this.cameraMode = mode;
  }

  /**
   * カメラモードを取得
   */
  public getCameraMode(): 'on_ball' | 'manual' {
    return this.cameraMode;
  }

  /**
   * 1on1勝負の結果を取得
   */
  public get1on1Result(): { winner: 'offense' | 'defense'; offenseDice: number; defenseDice: number } | null {
    return this.oneOnOneBattleController?.get1on1Result() ?? null;
  }

  /**
   * 1on1勝負の結果をクリア
   */
  public clear1on1Result(): void {
    this.oneOnOneBattleController?.clear1on1Result();
  }

  /**
   * 現在のディフェンダーのサークル半径を取得
   */
  public getDefenderCircleRadius(): number {
    return this.oneOnOneBattleController?.getDefenderCircleRadius() ?? 1.0;
  }

  /**
   * 1on1バトル中かどうかを取得
   */
  public isIn1on1Battle(): boolean {
    return this.oneOnOneBattleController?.isIn1on1Battle() ?? false;
  }

  /**
   * サークルが接触中かどうかを取得
   */
  public isCirclesInContact(): boolean {
    return this.oneOnOneBattleController?.isCirclesInContact() ?? false;
  }

  /**
   * 無力化されたディフェンダーかチェック
   */
  public isDefeatedDefender(character: Character): boolean {
    return this.oneOnOneBattleController?.isDefeatedDefender(character) ?? false;
  }

  /**
   * 1on1状態かどうかを判定
   */
  public is1on1State(): boolean {
    return this.oneOnOneBattleController?.is1on1State() ?? false;
  }

  /**
   * シーンを取得（外部からアクセス用）
   */
  public getScene(): Scene {
    return this.scene;
  }

  /**
   * エンジンを取得（外部からアクセス用）
   */
  public getEngine(): Engine {
    return this.engine;
  }

  /**
   * プレイヤーキャラクターを取得（外部からアクセス用）
   */
  public getCharacter(): Character | undefined {
    return this.allyCharacters[0];
  }

  /**
   * モーション再生を停止（モーション確認用）
   */
  public stopMotionPlayback(): void {
    // モーション確認モードを有効化（入力とモーション再生を停止）
    this.isMotionConfirmationMode = true;

    // 全キャラクターのモーションコントローラーを停止
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      const motionController = character.getMotionController();
      motionController.stop();
    }

      }

  /**
   * 8角形の頂点番号を表示（デバッグ用）
   */
  public showOctagonVertexNumbers(): void {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      character.showOctagonVertexNumbers();
    }
  }

  /**
   * 8角形の頂点番号を非表示（デバッグ用）
   */
  public hideOctagonVertexNumbers(): void {
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      character.hideOctagonVertexNumbers();
    }
  }

  /**
   * ドリブル突破を実行
   * @param direction 突破方向（'left' = 左前、'right' = 右前）
   * @returns 突破を開始できた場合はtrue
   */
  public performDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    return this.oneOnOneBattleController?.performDribbleBreakthrough(direction) ?? false;
  }

  /**
   * ドリブル突破可能かどうかをチェック
   * @returns 突破可能な場合はtrue
   */
  public canPerformDribbleBreakthrough(): boolean {
    return this.oneOnOneBattleController?.canPerformDribbleBreakthrough() ?? false;
  }

  /**
   * シュートを実行（アクションシステム経由）
   * @param shooter シュートを打つキャラクター（省略時はオンボールプレイヤー）
   * @returns シュート結果
   */
  public performShoot(shooter?: Character): { success: boolean; shootType: string; distance: number; message: string } | null {
    if (!this.shootingController) {
      return null;
    }

    // シューターが指定されていない場合、オンボールプレイヤーを取得
    const targetShooter = shooter ?? this.shootingController.findOnBallPlayer();
    if (!targetShooter) {
      return {
        success: false,
        shootType: 'none',
        distance: 0,
        message: 'シューターが見つかりません',
      };
    }

    // ActionController経由でシュートを開始（アニメーション付き）
    return this.shootingController.startShootAction(targetShooter);
  }

  /**
   * シュート可能かどうかをチェック
   * @param shooter チェック対象のキャラクター（省略時はオンボールプレイヤー）
   */
  public canShoot(shooter?: Character): boolean {
    if (!this.shootingController) {
      return false;
    }

    const targetShooter = shooter ?? this.shootingController.findOnBallPlayer();
    if (!targetShooter) {
      return false;
    }

    return this.shootingController.canShoot(targetShooter);
  }

  /**
   * 現在のシュートレンジ情報を取得
   * @param shooter 対象キャラクター（省略時はオンボールプレイヤー）
   */
  public getShootRangeInfo(shooter?: Character): { shootType: string; distance: number; inRange: boolean; facingGoal: boolean } | null {
    if (!this.shootingController) {
      return null;
    }

    const targetShooter = shooter ?? this.shootingController.findOnBallPlayer();
    if (!targetShooter) {
      return null;
    }

    return this.shootingController.getShootRangeInfo(targetShooter);
  }

  /**
   * パスを実行（ActionController経由）
   * @param passer パスを出すキャラクター
   * @param passType パスの種類
   * @param target パス先のキャラクター（省略時はチームメイトの最初の一人）
   * @returns 成功/失敗
   */
  public performPass(
    passer: Character,
    passType: 'pass_chest' | 'pass_bounce' | 'pass_overhead' = 'pass_chest',
    target?: Character
  ): { success: boolean; message: string } {
    // ボールを持っているか確認
    if (this.ball.getHolder() !== passer) {
      return { success: false, message: 'ボールを持っていません' };
    }

    // ActionControllerでパスアクションを開始
    const actionController = passer.getActionController();
    const actionResult = actionController.startAction(passType);

    if (!actionResult.success) {
      return { success: false, message: actionResult.message };
    }

    // activeフェーズに入ったらボールを投げるコールバックを設定
    actionController.setCallbacks({
      onActive: (action) => {
        // ボールを持っていない場合はパスしない
        if (this.ball.getHolder() !== passer) {
          return;
        }

        if (action.startsWith('pass_')) {
          // パス先のキャラクターを決定
          let passTarget = target;
          if (!passTarget) {
            const teammates = passer.team === 'ally' ? this.allyCharacters : this.enemyCharacters;
            passTarget = teammates.find(c => c !== passer);
          }

          if (passTarget) {
            const targetPosition = passTarget.getPosition();
            this.ball.pass(targetPosition, passTarget);
          }
        }
      },
    });

    return { success: true, message: `${passType}開始` };
  }

  /**
   * ディフェンスアクションを実行（ActionController経由）
   * @param defender ディフェンスするキャラクター
   * @param actionType ディフェンスアクションの種類
   * @returns 成功/失敗
   */
  public performDefenseAction(
    defender: Character,
    actionType: 'block_shot' | 'steal_attempt' | 'pass_intercept' | 'defense_stance'
  ): { success: boolean; message: string } {
    // ActionControllerでディフェンスアクションを開始
    const actionController = defender.getActionController();
    const actionResult = actionController.startAction(actionType);

    if (!actionResult.success) {
      return { success: false, message: actionResult.message };
    }

    // activeフェーズに入ったらディフェンス判定を行うコールバックを設定
    actionController.setCallbacks({
      onActive: (_action) => {
        // ここでブロック判定やスティール判定を行う
        // 実際の判定処理は後で追加
      },
    });

    return { success: true, message: `${actionType}開始` };
  }

  /**
   * シュートフェイントを実行
   * @param feinter フェイントを行うキャラクター（省略時はボール保持者）
   * @returns フェイント結果
   */
  public performShootFeint(feinter?: Character): {
    success: boolean;
    defenderReacted: boolean;
    defender: Character | null;
    message: string;
  } | null {
    if (!this.feintController) {
      return null;
    }

    // フェイントするキャラクターを特定
    const targetFeinter = feinter ?? this.ball.getHolder();
    if (!targetFeinter) {
      return {
        success: false,
        defenderReacted: false,
        defender: null,
        message: 'フェイントを行うキャラクターが見つかりません',
      };
    }

    return this.feintController.performShootFeint(targetFeinter);
  }

  /**
   * フェイント成功後のドリブル突破を実行
   * @param character ドリブル突破を行うキャラクター（省略時はボール保持者）
   * @param direction 突破方向（'left' | 'right' | 'forward'）
   * @returns 成功した場合true
   */
  public performBreakthroughAfterFeint(
    character?: Character,
    direction: 'left' | 'right' | 'forward' = 'forward'
  ): boolean {
    if (!this.feintController) {
      return false;
    }

    const targetCharacter = character ?? this.ball.getHolder();
    if (!targetCharacter) {
      return false;
    }

    return this.feintController.performBreakthroughAfterFeint(targetCharacter, direction);
  }

  /**
   * フェイント成功後のドリブル突破ウィンドウ内かどうか
   * @param character チェックするキャラクター（省略時はボール保持者）
   */
  public isInBreakthroughWindow(character?: Character): boolean {
    if (!this.feintController) {
      return false;
    }

    const targetCharacter = character ?? this.ball.getHolder();
    if (!targetCharacter) {
      return false;
    }

    return this.feintController.isInBreakthroughWindow(targetCharacter);
  }

  /**
   * ボールがコート外に出たか判定
   * ボールが保持されている場合も判定する（プレイヤーがボールを持ったままコート外に出た場合）
   * @returns コート外に出た場合true
   */
  private checkOutOfBounds(): boolean {
    const ballPosition = this.ball.getPosition();
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 14m

    // アウトオブバウンズ判定のマージン（ギリギリでもセーフにする）
    const outOfBoundsMargin = 0.5; // 50cmのマージン

    // 現在のボール位置がコート外かチェック（マージン込み）
    const isCurrentlyOutX = Math.abs(ballPosition.x) > halfWidth + outOfBoundsMargin;
    const isCurrentlyOutZ = Math.abs(ballPosition.z) > halfLength + outOfBoundsMargin;
    const isCurrentlyOut = isCurrentlyOutX || isCurrentlyOutZ;

    // 現在コート内ならアウトオブバウンズではない
    if (!isCurrentlyOut) {
      return false;
    }

    // 前フレームの位置がない場合（初回）はアウトオブバウンズとしない
    if (!this.previousBallPosition) {
      return false;
    }

    // 前フレームの位置がコート内だったかチェック（マージンなしで判定）
    const wasPreviouslyInX = Math.abs(this.previousBallPosition.x) <= halfWidth + outOfBoundsMargin;
    const wasPreviouslyInZ = Math.abs(this.previousBallPosition.z) <= halfLength + outOfBoundsMargin;
    const wasPreviouslyIn = wasPreviouslyInX && wasPreviouslyInZ;

    // 内側から外側に出た場合のみアウトオブバウンズ
    // （外側から内側に入る場合はアウトオブバウンズにならない）
    return wasPreviouslyIn && isCurrentlyOut;
  }

  /**
   * アウトオブバウンズ後のリセット処理
   * - サイドライン（X方向）：スローインで再開
   * - エンドライン（Z方向）：ゴール下で相手チームボール保持で再開
   */
  private resetAfterOutOfBounds(): void {
    const lastToucher = this.ball.getLastToucher();

    // 違反チームを特定
    let offendingTeam: 'ally' | 'enemy' = 'ally';
    if (lastToucher) {
      offendingTeam = lastToucher.team;
    }

    // アウトオブバウンズ時のボール位置を取得（記録されていなければ現在位置）
    const ballPosition = this.outOfBoundsBallPosition || this.ball.getPosition();
    this.outOfBoundsBallPosition = null;

    // どの境界を越えたか判定
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 14m
    const isOutX = Math.abs(ballPosition.x) > halfWidth;
    const isOutZ = Math.abs(ballPosition.z) > halfLength;

    if (isOutZ) {
      // エンドライン（ゴールサイドライン）からのアウトオブバウンズ
      // → ゴール下で相手チームボール保持で再開
      this.executeGoalUnderReset(offendingTeam);
    } else if (isOutX) {
      // サイドラインからのアウトオブバウンズ
      // → スローインで再開
      this.executeThrowInReset(offendingTeam, ballPosition);
    }
  }

  /**
   * ゴール後のリセット処理を開始
   * ボールが床でバウンドするまで待ってからリセット
   * @param scoringTeam ゴールを決めたチーム
   */
  private resetAfterGoal(scoringTeam: 'ally' | 'enemy'): void {
    // 既に勝者が決まっている場合は何もしない
    if (this.winner) {
      return;
    }

    // 既にリセット待機中の場合は何もしない
    if (this.pendingGoalReset) {
      return;
    }

    // スコアを更新
    if (scoringTeam === 'ally') {
      this.allyScore++;
    } else {
      this.enemyScore++;
    }

    // リセット待機状態を設定（ボールが床に落ちてバウンドするまで待つ）
    this.pendingGoalReset = true;
    this.pendingGoalScoringTeam = scoringTeam;
    this.goalResetTimer = this.goalResetDelay;

    // 勝利判定
    if (this.allyScore >= this.winningScore) {
      this.winner = 'ally';
    } else if (this.enemyScore >= this.winningScore) {
      this.winner = 'enemy';
    }
  }

  /**
   * シュートクロック違反時の処理
   * @param offendingTeam 違反したチーム
   * @param _ballPosition 違反時のボール位置（将来のスローイン実装用に保持）
   */
  private handleShotClockViolation(offendingTeam: 'ally' | 'enemy', _ballPosition: Vector3): void {
    // 既にリセット待機中の場合は何もしない
    if (this.pendingShotClockViolationReset || this.pendingGoalReset || this.pendingOutOfBoundsReset) {
      return;
    }

    // ルーズボール状態の場合、最後に触った選手のチームを違反チームとする
    let actualOffendingTeam = offendingTeam;
    if (!this.ball.getHolder()) {
      const lastToucher = this.ball.getLastToucher();
      if (lastToucher) {
        actualOffendingTeam = lastToucher.team;
      }
    }

    // リセット待機状態を設定
    this.pendingShotClockViolationReset = true;
    this.shotClockViolationResetTimer = this.shotClockViolationResetDelay;
    this.shotClockViolatingTeam = actualOffendingTeam;
  }

  /**
   * ボール位置から対応する外側マスのスローイン位置を計算
   * @param ballPosition ボールの位置
   * @returns スローイン位置 { throwInPosition, throwInCell, receiverPosition }
   */
  private calculateThrowInPosition(ballPosition: Vector3): {
    throwInPosition: Vector3;
    throwInCell: CellCoord;
    receiverPosition: Vector3;
  } {
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 15m

    // ボールが出た位置に対応する外側マスを計算
    const throwInCell = FieldGridUtils.getThrowInCell(ballPosition.x, ballPosition.z);

    // 外側マスの中心座標を取得
    const throwInWorldPos = FieldGridUtils.outerCellToWorld(throwInCell.col, throwInCell.row);
    if (!throwInWorldPos) {
      // フォールバック: 従来の固定オフセット
      const outsideOffset = 0.5;
      const throwInX = ballPosition.x >= 0 ? halfWidth + outsideOffset : -halfWidth - outsideOffset;
      const throwInZ = Math.max(-halfLength, Math.min(halfLength, ballPosition.z));
      return {
        throwInPosition: new Vector3(throwInX, 0, throwInZ),
        throwInCell,
        receiverPosition: new Vector3(throwInX >= 0 ? throwInX - 2.5 : throwInX + 2.5, 0, throwInZ),
      };
    }

    // レシーバー位置を計算（コート内、スロワーから4m内側）
    // 近すぎるとパスが安定しないため、適度な距離を確保
    const receiverDistance = 4.0;
    let receiverX: number;
    let receiverZ: number;

    // 外側マスの種類によってレシーバー位置を調整
    // エンドラインからのスローインはゴールを避けるため、スロワーを横に移動
    let adjustedThrowInX = throwInWorldPos.x;
    const adjustedThrowInZ = throwInWorldPos.z;

    // デバッグログ: スローイン位置計算

    if (throwInCell.col === '@') {
      // 左サイドライン外側からのスローイン
      receiverX = throwInWorldPos.x + receiverDistance; // コート内（右方向）
      receiverZ = throwInWorldPos.z;
    } else if (throwInCell.col === 'P') {
      // 右サイドライン外側からのスローイン
      receiverX = throwInWorldPos.x - receiverDistance; // コート内（左方向）
      receiverZ = throwInWorldPos.z;
    } else if (throwInCell.row === 0) {
      // 上エンドライン外側からのスローイン（z = +15.5m、正のZ側）
      // ゴールを避けるため、スロワーをサイドライン寄りに配置
      const goalAvoidanceOffset = 3.0; // ゴール中心から横にずらす距離
      adjustedThrowInX = throwInWorldPos.x >= 0
        ? Math.max(throwInWorldPos.x, goalAvoidanceOffset)
        : Math.min(throwInWorldPos.x, -goalAvoidanceOffset);
      receiverX = adjustedThrowInX;
      // コート内は-Z方向（z=15.5から減算してz<15にする）
      receiverZ = throwInWorldPos.z - receiverDistance;
    } else if (throwInCell.row === 31) {
      // 下エンドライン外側からのスローイン（z = -15.5m、負のZ側）
      // ゴールを避けるため、スロワーをサイドライン寄りに配置
      const goalAvoidanceOffset = 3.0;
      adjustedThrowInX = throwInWorldPos.x >= 0
        ? Math.max(throwInWorldPos.x, goalAvoidanceOffset)
        : Math.min(throwInWorldPos.x, -goalAvoidanceOffset);
      receiverX = adjustedThrowInX;
      // コート内は+Z方向（z=-15.5に加算してz>-15にする）
      receiverZ = throwInWorldPos.z + receiverDistance;
    } else {
      // デフォルト（この分岐に入るとレシーバーとスロワーが同じ位置になる）
      console.warn(`[GameScene] デフォルト分岐に入りました - col=${throwInCell.col}, row=${throwInCell.row}`);
      receiverX = throwInWorldPos.x;
      receiverZ = throwInWorldPos.z;
    }


    // スロワー位置を調整後の座標で更新
    const throwInPosition = new Vector3(adjustedThrowInX, 0, adjustedThrowInZ);

    // レシーバー位置をコート内にクランプ
    receiverX = Math.max(-halfWidth + 0.5, Math.min(halfWidth - 0.5, receiverX));
    receiverZ = Math.max(-halfLength + 0.5, Math.min(halfLength - 0.5, receiverZ));

    const receiverPosition = new Vector3(receiverX, 0, receiverZ);

    return { throwInPosition, throwInCell, receiverPosition };
  }

  /**
   * シュートクロック違反後のリセットを実行
   * サイドラインからのスローインで再開
   */
  private executeShotClockViolationReset(): void {
    if (!this.shotClockViolatingTeam) {
      return;
    }

    const offendingTeam = this.shotClockViolatingTeam;
    this.shotClockViolatingTeam = null;

    // センターサークル内で相手ボール保持状態で再開
    this.executeCenterCircleReset(offendingTeam);
  }

  /**
   * センターサークルから再開（ボール保持状態）
   * シュートクロック違反後に使用
   * @param offendingTeam 違反したチーム（この相手チームがボールを保持）
   */
  private executeCenterCircleReset(offendingTeam: 'ally' | 'enemy'): void {
    // ボールの飛行を停止
    this.ball.endFlight();

    // スローイン状態をクリア
    this.clearThrowInState();

    // 全キャラクターのバランス・速度・アクションをリセット
    for (const character of [...this.allyCharacters, ...this.enemyCharacters]) {
      character.resetBalance();
      character.velocity = Vector3.Zero();
      character.clearAIMovement();
      character.getActionController().forceResetAction();
    }

    // ボールを保持するチーム（offendingTeamの相手）
    const receivingTeam = offendingTeam === 'ally' ? this.enemyCharacters : this.allyCharacters;
    const defendingTeam = offendingTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;

    // ボールを持つ選手（PGを優先）
    const ballHandler = receivingTeam.find(c => c.playerPosition === 'PG') || receivingTeam[0];

    // ボールハンドラーをセンターサークル内に配置
    const ballHandlerPos = new Vector3(0, ballHandler.config.physical.height / 2, 0);
    ballHandler.setPosition(ballHandlerPos);

    // ボールをボールハンドラーに渡す
    this.ball.setHolder(ballHandler);

    // 他のオフェンス選手をフォーメーション位置に配置
    const offenseFormation = FormationUtils.getDefaultOffenseFormation();
    const isReceivingTeamAlly = offendingTeam === 'enemy';
    for (const teammate of receivingTeam) {
      if (teammate === ballHandler) continue;
      if (!teammate.playerPosition) continue;

      const targetPos = FormationUtils.getTargetPosition(
        offenseFormation,
        teammate.playerPosition,
        isReceivingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, teammate.config.physical.height / 2, targetPos.z);
        teammate.setPosition(pos);
        teammate.lookAt(ballHandlerPos);
      }
    }

    // ディフェンスチームをディフェンスフォーメーション位置に配置
    const defenseFormation = FormationUtils.getDefaultDefenseFormation();
    const isDefendingTeamAlly = offendingTeam === 'ally';
    for (const defender of defendingTeam) {
      if (!defender.playerPosition) continue;

      const targetPos = FormationUtils.getTargetPosition(
        defenseFormation,
        defender.playerPosition,
        isDefendingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, defender.config.physical.height / 2, targetPos.z);
        defender.setPosition(pos);
        defender.lookAt(ballHandlerPos);
      }
    }

    // シュートクロックをリセット
    if (this.shotClockController) {
      this.shotClockController.reset(ballHandler.team);
    }

    // 1on1バトルコントローラーをリセット（接触状態やバトル状態をクリア）
    if (this.oneOnOneBattleController) {
      this.oneOnOneBattleController.forceReset();
    }

    // キャラクターの状態を更新（ON_BALL_PLAYER、OFF_BALL_PLAYER等）
    if (this.collisionHandler) {
      this.collisionHandler.updateStates();
    }

    // 全AIを強制初期化（前回の行動や状態を完全にクリア）
    for (const ai of this.characterAIs) {
      ai.forceInitialize();
    }
  }

  /**
   * サイドラインからのスローインでリセット
   * @param offendingTeam 違反したチーム（相手チームがスローイン）
   * @param ballPosition 違反/アウトオブバウンズ時のボール位置
   */
  private executeThrowInReset(offendingTeam: 'ally' | 'enemy', ballPosition: Vector3): void {
    // ボールの飛行を停止
    this.ball.endFlight();

    // 全キャラクターのバランスをリセット
    for (const character of [...this.allyCharacters, ...this.enemyCharacters]) {
      character.resetBalance();
    }

    // 相手チームがスローイン
    const throwingTeam = offendingTeam === 'ally' ? this.enemyCharacters : this.allyCharacters;
    const defendingTeam = offendingTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;

    if (throwingTeam.length < 2) {
      console.warn('[GameScene] スローインに必要な選手が不足しています');
      // フォールバック：従来のセンター配置
      this.fallbackCenterReset(offendingTeam);
      return;
    }

    // スローイン位置を計算（外側マス対応）
    const { throwInPosition, receiverPosition } = this.calculateThrowInPosition(ballPosition);


    // スローイン担当者（PGを優先）
    const thrower = throwingTeam.find(c => c.playerPosition === 'PG') || throwingTeam[0];
    // レシーバー（スローイン担当以外）
    const receiver = throwingTeam.find(c => c !== thrower) || throwingTeam[1];

    // スローイン担当者を外側マスの中心に配置（境界クランプをスキップ）
    const throwerPos = new Vector3(
      throwInPosition.x,
      thrower.config.physical.height / 2,
      throwInPosition.z
    );
    thrower.setPosition(throwerPos, true); // 外側マスなのでクランプをスキップ

    // レシーバーをコート内に配置
    const receiverPos = new Vector3(
      receiverPosition.x,
      receiver.config.physical.height / 2,
      receiverPosition.z
    );
    receiver.setPosition(receiverPos);

    // スローイン担当者がコート内（レシーバー）を向く
    thrower.lookAt(receiverPos);

    // レシーバーがスローイン担当者の方を向く
    receiver.lookAt(throwerPos);

    // オフェンスチームのスロワー・レシーバー以外のプレイヤーをフォーメーション基準位置に配置
    const offenseFormation = FormationUtils.getDefaultOffenseFormation();
    const isThrowingTeamAlly = offendingTeam === 'enemy'; // offendingTeamの相手がスローインするチーム
    for (const teammate of throwingTeam) {
      if (teammate === thrower || teammate === receiver) continue;
      if (!teammate.playerPosition) continue; // ポジションが未設定の場合はスキップ

      const targetPos = FormationUtils.getTargetPosition(
        offenseFormation,
        teammate.playerPosition,
        isThrowingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, teammate.config.physical.height / 2, targetPos.z);
        teammate.setPosition(pos);
        teammate.lookAt(receiverPos);
      }
    }

    // ディフェンスチームをディフェンスフォーメーション基準位置に配置
    const defenseFormation = FormationUtils.getDefaultDefenseFormation();
    const isDefendingTeamAlly = offendingTeam === 'ally'; // offendingTeamがディフェンスするチーム
    for (const defender of defendingTeam) {
      if (!defender.playerPosition) continue; // ポジションが未設定の場合はスキップ

      const targetPos = FormationUtils.getTargetPosition(
        defenseFormation,
        defender.playerPosition,
        isDefendingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, defender.config.physical.height / 2, targetPos.z);
        defender.setPosition(pos);
        defender.lookAt(receiverPos);
      }
    }

    // ボールをスローイン担当者に渡す
    this.ball.setHolder(thrower);

    // 新設計: スローインロックは設定しない（4人全員がパス対象）
    // 旧設計では setThrowInLock(receiver) で特定レシーバーのみ許可していた

    // スローイン実行を予約（タイマーベース）
    this.isThrowInPending = true;
    this.throwInTimer = this.throwInDelay;
    this.throwInThrower = thrower;
    this.throwInReceiver = receiver;
    this.throwInBallThrown = false; // スロワー投げ済みフラグをリセット
    // スローイン位置を保存（スロワーが移動しても正しい位置からパスを実行するため）
    this.throwInPosition = throwerPos.clone();

    // スローイン状態を設定
    this.setThrowInStates(thrower, receiver, throwingTeam, defendingTeam);

    // シュートクロックはスローイン完了後に開始するため、ここでは停止
    if (this.shotClockController) {
      this.shotClockController.stop();
    }
  }

  /**
   * スローイン状態を設定
   * 新設計: THROW_IN_*状態ではなく、通常のON_BALL_PLAYER/OFF_BALL_PLAYER状態を使用
   * スロワーは外枠の固定位置から移動できないが、向きの変更とパスは可能
   * 4人のチームメイト全員がパス対象（特定のレシーバーは設定しない）
   */
  private setThrowInStates(
    thrower: Character,
    receiver: Character, // 後方互換性のため残すが、新設計では特定のレシーバーは設定しない
    throwingTeam: Character[],
    defendingTeam: Character[]
  ): void {
    // 全キャラクターのモーションと移動状態をリセット
    // 前の状態のアクションが引き継がれないようにする
    const allChars = [...throwingTeam, ...defendingTeam];
    for (const char of allChars) {
      char.stopMovement();
      char.playMotion(IDLE_MOTION);
      // ActionControllerのアクションもクリア
      const actionController = char.getActionController();
      if (actionController) {
        actionController.cancelAction();
      }
      // 既存のスローインスロワーフラグをクリア
      char.setAsThrowInThrower(null);
    }

    // スロワーにON_BALL_PLAYER状態を設定
    thrower.setState(CharacterState.ON_BALL_PLAYER);
    // スロワーとして固定位置を設定（移動不可だが向き変更は可能）
    thrower.setAsThrowInThrower(this.throwInPosition!);

    // 攻撃チームの他のメンバーはOFF_BALL_PLAYER状態
    for (const char of throwingTeam) {
      if (char !== thrower) {
        char.setState(CharacterState.OFF_BALL_PLAYER);
      }
    }

    // 守備チームはON_BALL_DEFENDER状態（ボール保持者をマーク）
    // 最も近い選手をON_BALL_DEFENDERに、他はOFF_BALL_DEFENDERに
    const throwerPos = thrower.getPosition();
    let closestDefender: Character | null = null;
    let closestDist = Infinity;
    for (const char of defendingTeam) {
      const dist = Vector3.Distance(char.getPosition(), throwerPos);
      if (dist < closestDist) {
        closestDist = dist;
        closestDefender = char;
      }
    }

    for (const char of defendingTeam) {
      if (char === closestDefender) {
        char.setState(CharacterState.ON_BALL_DEFENDER);
      } else {
        char.setState(CharacterState.OFF_BALL_DEFENDER);
      }
    }

    // throwInReceiverをnullに設定（特定のレシーバーは不要）
    // ただし位置制御のために一時的に保持する
    this.throwInReceiver = null;

    // 新設計: ボールのスローインロックを解除（全チームメイトへのパスを許可）
    this.ball.clearThrowInLock();

  }

  /**
   * フォールバック：センターサークルからのリセット
   * スローインができない場合に使用
   */
  private fallbackCenterReset(offendingTeam: 'ally' | 'enemy'): void {
    const receivingTeam = offendingTeam === 'ally' ? this.enemyCharacters : this.allyCharacters;

    if (receivingTeam.length === 0) {
      console.warn('[GameScene] 再開する選手が見つかりません');
      return;
    }

    // 全キャラクターのバランス・速度・アクションをリセット
    for (const character of [...this.allyCharacters, ...this.enemyCharacters]) {
      character.resetBalance();
      character.velocity = Vector3.Zero();
      character.clearAIMovement();
      character.getActionController().forceResetAction();
    }

    const ballHolder = receivingTeam[0];

    const circleRadius = this.field.getCenterCircleRadius();
    const characterRadius = 0.3;
    const positionOffset = circleRadius + characterRadius + 0.3;

    const holderZSign = ballHolder.team === 'ally' ? -1 : 1;

    const holderPosition = new Vector3(
      0,
      ballHolder.config.physical.height / 2,
      holderZSign * positionOffset
    );
    ballHolder.setPosition(holderPosition);

    this.ball.setHolder(ballHolder);

    if (this.shotClockController) {
      this.shotClockController.reset(ballHolder.team);
    }

    // 1on1バトルコントローラーをリセット（接触状態やバトル状態をクリア）
    if (this.oneOnOneBattleController) {
      this.oneOnOneBattleController.forceReset();
    }

    // キャラクターの状態を更新（ON_BALL_PLAYER、OFF_BALL_PLAYER等）
    if (this.collisionHandler) {
      this.collisionHandler.updateStates();
    }

    // 全AIを強制初期化（前回の行動や状態を完全にクリア）
    for (const ai of this.characterAIs) {
      ai.forceInitialize();
    }
  }

  /**
   * ゴール後のリセットを実行
   */
  private executeGoalReset(): void {
    if (!this.pendingGoalReset || !this.pendingGoalScoringTeam) {
      return;
    }

    const scoringTeam = this.pendingGoalScoringTeam;

    // リセット待機状態をクリア
    this.pendingGoalReset = false;
    this.pendingGoalScoringTeam = null;
    this.goalResetTimer = 0;

    // ゴール下で相手ボール保持状態で再開
    // 得点されたゴールの下で、得点された側のチームがボールを保持
    // ally（味方）が得点 → enemy（敵）が+Zゴール下でボール保持（allyが得点したゴール）
    // enemy（敵）が得点 → ally（味方）が-Zゴール下でボール保持（enemyが得点したゴール）
    this.executeGoalUnderReset(scoringTeam);
  }

  /**
   * ゴール下から再開（ボール保持状態）
   * ゴール後やシュートクロック違反後に使用
   * @param offendingTeam 違反/得点したチーム（この相手チームがボールを保持）
   */
  private executeGoalUnderReset(offendingTeam: 'ally' | 'enemy'): void {
    // ボールの飛行を停止
    this.ball.endFlight();

    // スローイン状態をクリア
    this.clearThrowInState();

    // 全キャラクターのバランス・速度・アクションをリセット
    for (const character of [...this.allyCharacters, ...this.enemyCharacters]) {
      character.resetBalance();
      character.velocity = Vector3.Zero();
      character.clearAIMovement();
      character.getActionController().forceResetAction();
    }

    // ボールを保持するチーム（offendingTeamの相手）
    const receivingTeam = offendingTeam === 'ally' ? this.enemyCharacters : this.allyCharacters;
    const defendingTeam = offendingTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;

    // ゴール位置を計算
    // ally得点 → +Zゴール下（allyの攻撃ゴール）
    // enemy得点 → -Zゴール下（enemyの攻撃ゴール）
    const halfLength = FIELD_CONFIG.length / 2;
    const goalZ = offendingTeam === 'ally' ? halfLength - GOAL_CONFIG.backboardDistance - 1.0 : -(halfLength - GOAL_CONFIG.backboardDistance - 1.0);

    // ボールを持つ選手（PGを優先）
    const ballHandler = receivingTeam.find(c => c.playerPosition === 'PG') || receivingTeam[0];

    // ボールハンドラーをゴール下に配置
    const ballHandlerPos = new Vector3(0, ballHandler.config.physical.height / 2, goalZ);
    ballHandler.setPosition(ballHandlerPos);

    // ボールをボールハンドラーに渡す
    this.ball.setHolder(ballHandler);

    // 他のオフェンス選手をフォーメーション位置に配置
    const offenseFormation = FormationUtils.getDefaultOffenseFormation();
    const isReceivingTeamAlly = offendingTeam === 'enemy';
    for (const teammate of receivingTeam) {
      if (teammate === ballHandler) continue;
      if (!teammate.playerPosition) continue;

      const targetPos = FormationUtils.getTargetPosition(
        offenseFormation,
        teammate.playerPosition,
        isReceivingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, teammate.config.physical.height / 2, targetPos.z);
        teammate.setPosition(pos);
        teammate.lookAt(ballHandlerPos);
      }
    }

    // ディフェンスチームをディフェンスフォーメーション位置に配置
    const defenseFormation = FormationUtils.getDefaultDefenseFormation();
    const isDefendingTeamAlly = offendingTeam === 'ally';
    for (const defender of defendingTeam) {
      if (!defender.playerPosition) continue;

      const targetPos = FormationUtils.getTargetPosition(
        defenseFormation,
        defender.playerPosition,
        isDefendingTeamAlly
      );
      if (targetPos) {
        const pos = new Vector3(targetPos.x, defender.config.physical.height / 2, targetPos.z);
        defender.setPosition(pos);
        defender.lookAt(ballHandlerPos);
      }
    }

    // シュートクロックをリセット
    if (this.shotClockController) {
      this.shotClockController.reset(ballHandler.team);
    }

    // 1on1バトルコントローラーをリセット（接触状態やバトル状態をクリア）
    if (this.oneOnOneBattleController) {
      this.oneOnOneBattleController.forceReset();
    }

    // キャラクターの状態を更新（ON_BALL_PLAYER、OFF_BALL_PLAYER等）
    if (this.collisionHandler) {
      this.collisionHandler.updateStates();
    }

    // 全AIを強制初期化（前回の行動や状態を完全にクリア）
    for (const ai of this.characterAIs) {
      ai.forceInitialize();
    }
  }

  /**
   * スコアを取得
   */
  public getScore(): { ally: number; enemy: number } {
    return { ally: this.allyScore, enemy: this.enemyScore };
  }

  /**
   * チーム名を取得（3文字固定）
   */
  public getPlayerNames(): { ally: string; enemy: string } {
    return { ally: 'ATM', enemy: 'BTM' };
  }

  /**
   * 勝者を取得
   */
  public getWinner(): 'ally' | 'enemy' | null {
    return this.winner;
  }

  /**
   * 勝利に必要な得点を取得
   */
  public getWinningScore(): number {
    return this.winningScore;
  }

  /**
   * ゲームをリセット
   */
  public resetGame(): void {
    this.allyScore = 0;
    this.enemyScore = 0;
    this.winner = null;

    // 待機状態をリセット
    this.pendingGoalReset = false;
    this.pendingGoalScoringTeam = null;
    this.goalResetTimer = 0;
    this.pendingOutOfBoundsReset = false;
    this.outOfBoundsResetTimer = 0;
    this.outOfBoundsBallPosition = null;
    this.pendingShotClockViolationReset = false;
    this.shotClockViolationResetTimer = 0;
    this.shotClockViolatingTeam = null;
        this.clearThrowInState();

    // ボールの飛行を停止
    this.ball.endFlight();

    // 全キャラクターのバランスをリセット
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      character.resetBalance();
    }

    // ジャンプボールを開始
    this.setupJumpBall();
  }

  /**
   * ポジション配置ボードからの位置を適用
   * @param allyPositions 味方チームの配置
   * @param enemyPositions 敵チームの配置
   */
  public applyTeamPositions(
    allyPositions: Array<{ playerId: string; worldX: number; worldZ: number }>,
    enemyPositions: Array<{ playerId: string; worldX: number; worldZ: number }>
  ): void {
    // 味方チームの位置を適用
    for (let i = 0; i < this.allyCharacters.length && i < allyPositions.length; i++) {
      const character = this.allyCharacters[i];
      const position = allyPositions[i];
      const newPosition = new Vector3(
        position.worldX,
        character.config.physical.height / 2,
        position.worldZ
      );
      character.setPosition(newPosition);
    }

    // 敵チームの位置を適用
    for (let i = 0; i < this.enemyCharacters.length && i < enemyPositions.length; i++) {
      const character = this.enemyCharacters[i];
      const position = enemyPositions[i];
      const newPosition = new Vector3(
        position.worldX,
        character.config.physical.height / 2,
        position.worldZ
      );
      character.setPosition(newPosition);
    }
  }

  /**
   * 現在のチーム位置をボード形式で取得
   */
  public getCurrentPositionsAsBoard(): {
    allyPositions: Array<{ playerId: string; worldX: number; worldZ: number }>;
    enemyPositions: Array<{ playerId: string; worldX: number; worldZ: number }>;
  } {
    const allyPositions = this.allyCharacters.map((character, index) => {
      const pos = character.getPosition();
      return {
        playerId: (index + 1).toString(),
        worldX: pos.x,
        worldZ: pos.z,
      };
    });

    const enemyPositions = this.enemyCharacters.map((character, index) => {
      const pos = character.getPosition();
      return {
        playerId: (this.allyCharacters.length + index + 1).toString(),
        worldX: pos.x,
        worldZ: pos.z,
      };
    });

    return { allyPositions, enemyPositions };
  }

  /**
   * ゲームを一時停止
   * シュートチェックモードなど、別のモードが動作する際に呼び出す
   */
  public pause(): void {
    this.isPaused = true;
  }

  /**
   * ゲームを再開
   */
  public resume(): void {
    this.isPaused = false;
    this.lastFrameTime = Date.now(); // デルタタイムの計算をリセット
  }

  /**
   * 一時停止状態かどうかを取得
   */
  public getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * 現在のゲームモードを取得
   */
  public getGameMode(): GameMode {
    return this.gameMode;
  }

  /**
   * ゲームモードを設定
   */
  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
  }

  /**
   * 全キャラクターを取得
   */
  public getAllCharacters(): Character[] {
    return [...this.allyCharacters, ...this.enemyCharacters];
  }

  /**
   * 味方キャラクターを取得
   */
  public getAllyCharacters(): Character[] {
    return [...this.allyCharacters];
  }

  /**
   * 敵キャラクターを取得
   */
  public getEnemyCharacters(): Character[] {
    return [...this.enemyCharacters];
  }

  /**
   * ボールを取得
   */
  public getBall(): Ball {
    return this.ball;
  }

  /**
   * フィールドを取得
   */
  public getField(): Field {
    return this.field;
  }

  /**
   * フェイントコントローラーを取得
   */
  public getFeintController(): FeintController | undefined {
    return this.feintController;
  }

  /**
   * シュートコントローラーを取得
   */
  public getShootingController(): ShootingController | undefined {
    return this.shootingController;
  }

  /**
   * ショットクロックの残り時間を取得
   */
  public getShotClockRemainingTime(): number {
    return this.shotClockController?.getRemainingTime() ?? 24.0;
  }

  /**
   * ショットクロックが動作中かどうかを取得
   */
  public isShotClockRunning(): boolean {
    return this.shotClockController?.isClockRunning() ?? false;
  }

  /**
   * 現在のオフェンスチームを取得
   */
  public getShotClockOffenseTeam(): 'ally' | 'enemy' | null {
    return this.shotClockController?.getCurrentOffenseTeam() ?? null;
  }

  /**
   * スローイン残り時間を取得（5秒ルール）
   */
  public getThrowInRemainingTime(): number {
    return Math.max(0, this.throwInViolationTimer);
  }

  /**
   * スローイン5秒タイマーが動作中かどうかを取得
   */
  public isThrowInTimerRunning(): boolean {
    return this.isThrowInViolationTimerRunning;
  }

  /**
   * パス軌道可視化の表示/非表示を設定
   */
  public setPassTrajectoryVisible(visible: boolean): void {
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.setEnabled(visible);
    }
  }

  /**
   * パス軌道可視化の表示状態を取得
   */
  public isPassTrajectoryVisible(): boolean {
    return this.passTrajectoryVisualizer?.getEnabled() ?? false;
  }

  /**
   * パス軌道可視化の表示/非表示を切り替え
   */
  public togglePassTrajectoryVisible(): void {
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.setEnabled(!this.passTrajectoryVisualizer.getEnabled());
    }
  }

  /**
   * パス軌道可視化の移動先予測を設定
   */
  public setPassTrajectoryDestinationPrediction(use: boolean): void {
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.setUseDestinationPrediction(use);
    }
  }

  /**
   * シュート軌道可視化の表示/非表示を設定
   */
  public setShootTrajectoryVisible(visible: boolean): void {
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.setEnabled(visible);
    }
  }

  /**
   * シュート軌道可視化の表示状態を取得
   */
  public isShootTrajectoryVisible(): boolean {
    return this.shootTrajectoryVisualizer?.getEnabled() ?? false;
  }

  /**
   * シュート軌道可視化の表示/非表示を切り替え
   */
  public toggleShootTrajectoryVisible(): void {
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.setEnabled(!this.shootTrajectoryVisualizer.getEnabled());
    }
  }

  /**
   * ドリブル導線可視化の表示/非表示を設定
   */
  public setDribblePathVisible(visible: boolean): void {
    if (this.dribblePathVisualizer) {
      this.dribblePathVisualizer.setEnabled(visible);
    }
  }

  /**
   * ドリブル導線可視化の表示状態を取得
   */
  public isDribblePathVisible(): boolean {
    return this.dribblePathVisualizer?.getEnabled() ?? false;
  }

  /**
   * ドリブル導線可視化の表示/非表示を切り替え
   */
  public toggleDribblePathVisible(): void {
    if (this.dribblePathVisualizer) {
      this.dribblePathVisualizer.setEnabled(!this.dribblePathVisualizer.getEnabled());
    }
  }

  /**
   * キャラクターを指定位置に配置
   */
  public setCharacterPosition(character: Character, x: number, z: number): void {
    const height = character.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
    character.setPosition(new Vector3(x, height / 2, z));
  }

  /**
   * チェックモード用の完全リセット
   * 全キャラクターを破棄し、ゲーム状態をクリアする
   */
  private resetForCheckMode(): void {
    // ゲームループを一時停止
    this.isPaused = true;

    // スコアと勝者をリセット
    this.allyScore = 0;
    this.enemyScore = 0;
    this.winner = null;

    // 全ての待機状態をリセット
    this.pendingGoalReset = false;
    this.pendingGoalScoringTeam = null;
    this.goalResetTimer = 0;
    this.pendingOutOfBoundsReset = false;
    this.outOfBoundsResetTimer = 0;
    this.outOfBoundsBallPosition = null;
    this.pendingShotClockViolationReset = false;
    this.shotClockViolationResetTimer = 0;
    this.shotClockViolatingTeam = null;
        this.clearThrowInState();

    // ボールをリセット
    this.ball.endFlight();
    this.ball.setHolder(null);
    this.ball.setPosition(new Vector3(0, 1, 0), true);

    // ショットクロックを停止・リセット
    if (this.shotClockController) {
      this.shotClockController.stop();
      this.shotClockController.reset('ally');
    }

    // パス軌道可視化を無効化・クリア
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.setEnabled(false);
      this.passTrajectoryVisualizer.clearVisualizations();
    }

    // シュート軌道可視化を無効化・クリア
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.setEnabled(false);
      this.shootTrajectoryVisualizer.clearVisualizations();
    }

    // ドリブル導線可視化を無効化・クリア
    if (this.dribblePathVisualizer) {
      this.dribblePathVisualizer.setEnabled(false);
      this.dribblePathVisualizer.clearVisualizations();
    }

    // シュートレンジ表示をクリア
    if (this.shootingController) {
      this.shootingController.hideShootRange();
    }

    // 全キャラクターを破棄
    this.disposeAllCharacters();
  }

  /**
   * 全キャラクターを破棄
   */
  private disposeAllCharacters(): void {
    // AIコントローラーをクリア
    this.characterAIs = [];
    this.aiCharacterIndices.clear();

    // 味方キャラクターを破棄
    for (const character of this.allyCharacters) {
      character.dispose();
    }
    this.allyCharacters = [];

    // 敵キャラクターを破棄
    for (const character of this.enemyCharacters) {
      character.dispose();
    }
    this.enemyCharacters = [];

    // 衝突判定コントローラーを再初期化（空の配列で）
    if (this.collisionHandler) {
      this.collisionHandler.dispose();
      this.collisionHandler = new CollisionHandler(this.ball, []);
    }
  }

  /**
   * チェックモード用のキャラクターを作成
   * @param team チーム
   * @param position 初期位置
   * @param playerData 選手データ（オプション）
   * @param playerPosition ポジション（オプション）
   */
  private createCheckModeCharacter(
    team: 'ally' | 'enemy',
    position: { x: number; z: number },
    playerData?: PlayerData,
    playerPosition?: 'PG' | 'SG' | 'SF' | 'PF' | 'C'
  ): Character {
    const config = DEFAULT_CHARACTER_CONFIG;
    const height = playerData ? playerData.basic.height / 100 : config.physical.height;
    const worldPosition = new Vector3(position.x, height / 2, position.z);

    const character = new Character(this.scene, worldPosition, config);
    character.team = team;

    if (playerData && playerPosition) {
      character.setPlayerData(playerData, playerPosition);
      character.setHeight(height);
    }

    // チームカラーを設定
    if (team === 'ally') {
      character.setBodyColor(0.0, 0.4, 1.0); // 青
    } else {
      character.setBodyColor(1.0, 0.0, 0.0); // 赤
    }

    // 物理ボディを初期化（ボールとの衝突判定用）
    character.initializePhysics();

    return character;
  }

  /**
   * 全チームキャラクターを再作成（試合モード用）
   */
  private recreateAllCharacters(): void {
    if (!this.savedTeamConfig || !this.savedPlayerData) {
      console.warn('[GameScene] チーム設定またはプレイヤーデータが保存されていません');
      return;
    }

    // まず全て破棄
    this.disposeAllCharacters();

    // チームを再作成
    this.createTeams(this.savedTeamConfig, this.savedPlayerData);

    // 全キャラクターのリスト
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];

    // 衝突判定コントローラーを再初期化
    if (this.collisionHandler) {
      this.collisionHandler.dispose();
    }
    this.collisionHandler = new CollisionHandler(this.ball, allCharacters);

    // AIコントローラーを再初期化
    for (const character of allCharacters) {
      if (this.aiCharacterIndices.has(character)) {
        const ai = new CharacterAI(character, this.ball, allCharacters, this.field);

        // ShootingControllerを設定
        if (this.shootingController) {
          ai.setShootingController(this.shootingController);
        }

        // FeintControllerを設定
        if (this.feintController) {
          ai.setFeintController(this.feintController);
        }

        // ShotClockControllerを設定
        if (this.shotClockController) {
          ai.setShotClockController(this.shotClockController);
        }

        // パスコールバックを設定
        ai.setPassCallback((passer, target, passType) => {
          return this.performPass(passer, passType, target);
        });

        this.characterAIs.push(ai);
      }
    }

    // パス軌道可視化を再作成
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.dispose();
    }
    this.passTrajectoryVisualizer = new PassTrajectoryVisualizer(
      this.scene,
      this.ball,
      allCharacters
    );

    // シュート軌道可視化を再作成
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.dispose();
    }
    this.shootTrajectoryVisualizer = new ShootTrajectoryVisualizer(
      this.scene,
      this.ball,
      this.field,
      allCharacters
    );
  }

  /**
   * チェックモード用の衝突判定を更新
   * @param characters チェックモードで使用するキャラクター
   */
  private updateCollisionHandlerForCheckMode(characters: Character[]): void {
    if (this.collisionHandler) {
      this.collisionHandler.dispose();
    }
    this.collisionHandler = new CollisionHandler(this.ball, characters);
  }

  /**
   * ドリブルチェックモード用のセットアップ
   * ドリブラーとディフェンダーの2人のみを作成
   * @param dribblerPlayerId ドリブラーの選手ID
   * @param defenderPlayerId ディフェンダーの選手ID
   * @param dribblerPosition ドリブラーの位置
   * @param defenderPosition ディフェンダーの位置
   * @param targetPosition 目標位置（ドリブラーの向き）
   * @param playerData 選手データ（外部から渡す場合）
   */
  public setupDribbleCheckMode(
    dribblerPlayerId: string,
    defenderPlayerId: string,
    dribblerPosition: { x: number; z: number },
    defenderPosition: { x: number; z: number },
    targetPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): { dribbler: Character; defender: Character } | null {
    // 全状態をリセット（全キャラクター破棄）
    this.resetForCheckMode();
    this.setGameMode('dribble_check');

    // 使用する選手データを取得
    const data = playerData || this.savedPlayerData;
    if (!data) {
      console.error('[GameScene] 選手データがありません');
      return null;
    }

    const dribblerData = data[dribblerPlayerId];
    const defenderData = data[defenderPlayerId];

    if (!dribblerData || !defenderData) {
      console.error('[GameScene] 指定された選手IDのデータが見つかりません');
      return null;
    }

    // ドリブラーを作成
    const dribbler = this.createCheckModeCharacter('ally', dribblerPosition, dribblerData, 'PG');
    this.allyCharacters.push(dribbler);

    // ディフェンダーを作成
    const defender = this.createCheckModeCharacter('enemy', defenderPosition, defenderData, 'PG');
    this.enemyCharacters.push(defender);

    // 衝突判定を更新
    this.updateCollisionHandlerForCheckMode([dribbler, defender]);

    // ボールをドリブラーに持たせる
    this.ball.setHolder(dribbler);

    // ドリブラーは目標方向を向く
    dribbler.lookAt(new Vector3(targetPosition.x, 0, targetPosition.z));

    // ディフェンダーはドリブラー方向を向く
    defender.lookAt(dribbler.getPosition());

    // 状態を設定
    dribbler.setState(CharacterState.ON_BALL_PLAYER);
    defender.setState(CharacterState.ON_BALL_DEFENDER);

    // ドリブル導線可視化を有効化（チェックモード用にallCharactersを更新）
    if (this.dribblePathVisualizer) {
      this.dribblePathVisualizer.dispose();
      this.dribblePathVisualizer = new DribblePathVisualizer(
        this.scene,
        this.ball,
        this.field,
        [dribbler, defender]
      );
      this.dribblePathVisualizer.setEnabled(true);
    }

    return { dribbler, defender };
  }

  /**
   * シュートチェックモード用のセットアップ
   * シューター1人のみを作成
   * @param shooterPlayerId シューターの選手ID
   * @param shooterPosition シューターの位置
   * @param playerData 選手データ（外部から渡す場合）
   */
  public setupShootCheckMode(
    shooterPlayerId: string,
    shooterPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): Character | null {
    // 全状態をリセット（全キャラクター破棄）
    this.resetForCheckMode();
    this.setGameMode('shoot_check');

    // 使用する選手データを取得
    const data = playerData || this.savedPlayerData;
    if (!data) {
      console.error('[GameScene] 選手データがありません');
      return null;
    }

    const shooterData = data[shooterPlayerId];
    if (!shooterData) {
      console.error('[GameScene] 指定された選手IDのデータが見つかりません:', shooterPlayerId);
      return null;
    }

    // シューターを作成
    const shooter = this.createCheckModeCharacter('ally', shooterPosition, shooterData, 'PG');
    this.allyCharacters.push(shooter);

    // 衝突判定を更新
    this.updateCollisionHandlerForCheckMode([shooter]);

    // シューターの状態を設定
    shooter.setState(CharacterState.ON_BALL_PLAYER);

    // ボールをシューターに持たせる
    this.ball.setHolder(shooter);

    // シュート軌道可視化を有効化（チェックモード用にallCharactersを更新）
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.dispose();
      this.shootTrajectoryVisualizer = new ShootTrajectoryVisualizer(
        this.scene,
        this.ball,
        this.field,
        [shooter]
      );
      this.shootTrajectoryVisualizer.setEnabled(true);
    }

    // ドリブル導線可視化を有効化（チェックモード用にallCharactersを更新）
    if (this.dribblePathVisualizer) {
      this.dribblePathVisualizer.dispose();
      this.dribblePathVisualizer = new DribblePathVisualizer(
        this.scene,
        this.ball,
        this.field,
        [shooter]
      );
      this.dribblePathVisualizer.setEnabled(true);
    }

    return shooter;
  }

  /**
   * シュートチェックモード用のディフェンダーを追加
   * @param defenderPlayerId ディフェンダーの選手ID
   * @param defenderPosition ディフェンダーの配置位置
   * @param playerData 選手データ（外部から渡す場合）
   * @returns 作成されたディフェンダー、または失敗時はnull
   */
  public addShootCheckDefender(
    defenderPlayerId: string,
    defenderPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): Character | null {
    // 使用する選手データを取得
    const data = playerData || this.savedPlayerData;
    if (!data) {
      console.error('[GameScene] 選手データがありません');
      return null;
    }

    const defenderData = data[defenderPlayerId];
    if (!defenderData) {
      console.error('[GameScene] 指定された選手IDのデータが見つかりません:', defenderPlayerId);
      return null;
    }

    // ディフェンダーを作成
    const defender = this.createCheckModeCharacter('enemy', defenderPosition, defenderData, 'PG');
    this.enemyCharacters.push(defender);

    // シューターを取得
    const shooter = this.allyCharacters[0];
    if (shooter) {
      // ディフェンダーはシューター方向を向く
      defender.lookAt(shooter.getPosition());
    }

    // 状態を設定
    defender.setState(CharacterState.ON_BALL_DEFENDER);

    // 衝突判定を更新
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    this.updateCollisionHandlerForCheckMode(allCharacters);

    // 可視化を更新
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.dispose();
      this.shootTrajectoryVisualizer = new ShootTrajectoryVisualizer(
        this.scene,
        this.ball,
        this.field,
        allCharacters
      );
      this.shootTrajectoryVisualizer.setEnabled(true);
    }

    return defender;
  }

  /**
   * パスチェックモード用のセットアップ
   * パサーとレシーバーを作成し、任意でディフェンダーも作成
   * @param passerPlayerId パサーの選手ID
   * @param receiverPlayerId レシーバーの選手ID
   * @param passerPosition パサーの配置位置
   * @param receiverPosition レシーバーの配置位置
   * @param defenderPlacements ディフェンダーの配置（任意）
   * @param playerData 選手データ（外部から渡す場合）
   * @returns パスチェック用のキャラクター情報
   */
  public setupPassCheckMode(
    passerPlayerId: string,
    receiverPlayerId: string,
    passerPosition: { x: number; z: number },
    receiverPosition: { x: number; z: number },
    defenderPlacements?: Array<{
      defenderPlayerId: string;
      position: { x: number; z: number };
      type: 'on_ball' | 'off_ball';
    }>,
    playerData?: Record<string, PlayerData>
  ): {
    passer: Character;
    receiver: Character;
    defenders: Character[];
  } | null {
    // 全状態をリセット（全キャラクター破棄）
    this.resetForCheckMode();
    this.setGameMode('pass_check');

    // 使用する選手データを取得
    const data = playerData || this.savedPlayerData;
    if (!data) {
      console.error('[GameScene] 選手データがありません');
      return null;
    }

    const passerData = data[passerPlayerId];
    const receiverData = data[receiverPlayerId];

    if (!passerData) {
      console.error('[GameScene] パサーの選手IDのデータが見つかりません:', passerPlayerId);
      return null;
    }

    if (!receiverData) {
      console.error('[GameScene] レシーバーの選手IDのデータが見つかりません:', receiverPlayerId);
      return null;
    }

    if (passerPlayerId === receiverPlayerId) {
      console.error('[GameScene] パサーとレシーバーは異なる選手を指定してください');
      return null;
    }

    // パサーを作成
    const passer = this.createCheckModeCharacter('ally', passerPosition, passerData, 'PG');
    this.allyCharacters.push(passer);

    // レシーバーを作成
    const receiver = this.createCheckModeCharacter('ally', receiverPosition, receiverData, 'SG');
    this.allyCharacters.push(receiver);

    const defenders: Character[] = [];
    const checkModeCharacters: Character[] = [passer, receiver];

    // ディフェンダーを作成
    if (defenderPlacements && defenderPlacements.length > 0) {
      for (const placement of defenderPlacements) {
        const defenderData = data[placement.defenderPlayerId];
        if (defenderData) {
          const defender = this.createCheckModeCharacter('enemy', placement.position, defenderData, 'PG');
          this.enemyCharacters.push(defender);
          defenders.push(defender);
          checkModeCharacters.push(defender);

          // ディフェンダーのタイプに応じて向きを設定
          if (placement.type === 'on_ball') {
            defender.lookAt(passer.getPosition());
            defender.setState(CharacterState.ON_BALL_DEFENDER);
          } else {
            // パスレーンの中間点を向く
            const midPoint = passer.getPosition().add(receiver.getPosition()).scale(0.5);
            defender.lookAt(midPoint);
            defender.setState(CharacterState.OFF_BALL_DEFENDER);
          }
        }
      }
    }

    // 衝突判定を更新
    this.updateCollisionHandlerForCheckMode(checkModeCharacters);

    // パサーをレシーバー方向に向ける
    passer.lookAt(receiver.getPosition());

    // レシーバーをパサー方向に向ける
    receiver.lookAt(passer.getPosition());

    // ボールをパサーに持たせる
    this.ball.setHolder(passer);

    // 状態を設定
    passer.setState(CharacterState.ON_BALL_PLAYER);
    receiver.setState(CharacterState.OFF_BALL_PLAYER);

    // パス軌道可視化を有効化（チェックモード用にallCharactersを更新）
    if (this.passTrajectoryVisualizer) {
      // 新しいキャラクターリストで再初期化
      this.passTrajectoryVisualizer.dispose();
      this.passTrajectoryVisualizer = new PassTrajectoryVisualizer(
        this.scene,
        this.ball,
        checkModeCharacters
      );
      this.passTrajectoryVisualizer.setEnabled(true);
    }

    // パスチェック用の参照を保存（距離ライン更新用）
    this.passCheckPasser = passer;
    this.passCheckReceiver = receiver;

    // 距離表示ラインを作成
    this.createPassCheckDistanceLine(passer, receiver);

    return { passer, receiver, defenders };
  }

  /**
   * パスチェックコントローラーを作成
   * @param passer パサー
   * @param receiver レシーバー
   * @param config パスチェック設定
   * @returns PassCheckController
   */
  public createPassCheckController(
    passer: Character,
    receiver: Character,
    config: {
      passerCell: { col: string; row: number };
      receiverCell: { col: string; row: number };
      defenders?: DefenderPlacement[];
      trialsPerConfig?: number;
      timeoutSeconds?: number;
      targetGoal: 'goal1' | 'goal2';
    }
  ): PassCheckController {
    return new PassCheckController(
      passer,
      receiver,
      this.ball,
      this.field,
      {
        ...config,
        trialsPerConfig: config.trialsPerConfig ?? 10,
        timeoutSeconds: config.timeoutSeconds ?? 10,
      }
    );
  }

  /**
   * パスチェック用距離表示ラインを作成
   */
  private createPassCheckDistanceLine(passer: Character, receiver: Character): void {
    // 既存のラインを削除
    this.clearPassCheckDistanceLine();

    const passerPos = passer.getPosition();
    const receiverPos = receiver.getPosition();

    // 地面に近い高さでラインを描画
    const lineY = 0.1;
    const points = [
      new Vector3(passerPos.x, lineY, passerPos.z),
      new Vector3(receiverPos.x, lineY, receiverPos.z),
    ];

    this.passCheckDistanceLine = MeshBuilder.CreateLines(
      "pass-check-distance-line",
      { points },
      this.scene
    );
    this.passCheckDistanceLine.color = new Color3(1, 1, 0); // 黄色
  }

  /**
   * パスチェック用距離表示ラインをクリア
   */
  private clearPassCheckDistanceLine(): void {
    if (this.passCheckDistanceLine) {
      this.passCheckDistanceLine.dispose();
      this.passCheckDistanceLine = undefined;
    }
  }

  /**
   * パスチェックモードの可視化を更新
   * PassCheckModePanelの更新ループから呼び出す
   */
  public updatePassCheckVisualization(): void {
    // パス軌道可視化を更新
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.update();
    }

    // 距離表示ラインを更新（選手が移動しても追従する）
    if (this.passCheckPasser && this.passCheckReceiver) {
      this.createPassCheckDistanceLine(this.passCheckPasser, this.passCheckReceiver);
    }
  }

  /**
   * パスチェックモードの可視化をクリア
   */
  public clearPassCheckVisualization(): void {
    this.clearPassCheckDistanceLine();
    this.passCheckPasser = undefined;
    this.passCheckReceiver = undefined;
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.clearVisualizations();
    }
  }

  /**
   * パサーとレシーバー間の距離を取得
   */
  public getPassCheckDistance(): number | null {
    if (this.allyCharacters.length < 2) {
      return null;
    }
    const passer = this.allyCharacters[0];
    const receiver = this.allyCharacters[1];
    const passerPos = passer.getPosition();
    const receiverPos = receiver.getPosition();
    return getDistance2D(passerPos, receiverPos);
  }

  /**
   * チェックモードを終了して通常のゲームモードに戻る
   */
  public exitCheckMode(): void {
    this.setGameMode('game');

    // パスチェック可視化をクリア
    this.clearPassCheckVisualization();

    // 全キャラクターを再作成
    this.recreateAllCharacters();

    // ゴールコールバックを元に戻す
    if (this.shootingController) {
      this.shootingController.setOnGoalCallback((scoringTeam) => {
        this.resetAfterGoal(scoringTeam);
      });
    }

    // ゲームをリセット
    this.resetGame();
  }

  // ============================================
  // スローインチェックモード関連
  // ============================================

  /**
   * スローインチェックモード用のセットアップ
   * @param throwerPlayerId スロワーの選手ID
   * @param receiverPlayerId レシーバーの選手ID
   * @param throwerCell スロワーの配置セル（外側マス）
   * @param receiverCell レシーバーの配置セル（フィールド内）
   * @param playerData 選手データ
   */
  public setupThrowInCheckMode(
    throwerPlayerId: string,
    receiverPlayerId: string,
    throwerCell: { col: string; row: number },
    receiverCell: { col: string; row: number },
    playerData?: Record<string, PlayerData>
  ): {
    thrower: Character;
    receiver: Character;
  } | null {
    // 全状態をリセット
    this.resetForCheckMode();
    this.setGameMode('throw_in_check');

    // 使用する選手データを取得
    const data = playerData || this.savedPlayerData;
    if (!data) {
      console.error('[GameScene] 選手データがありません');
      return null;
    }

    const throwerData = data[throwerPlayerId];
    const receiverData = data[receiverPlayerId];

    if (!throwerData || !receiverData) {
      console.error('[GameScene] 選手データが見つかりません');
      return null;
    }

    // スロワーの位置を取得（外側マス）
    const throwerWorld = FieldGridUtils.outerCellToWorld(throwerCell.col, throwerCell.row);
    if (!throwerWorld) {
      console.error('[GameScene] スロワーのセル位置が無効です:', throwerCell);
      return null;
    }

    // レシーバーの位置を取得（フィールド内）
    const receiverWorld = FieldGridUtils.cellToWorld(receiverCell.col, receiverCell.row);
    if (!receiverWorld) {
      console.error('[GameScene] レシーバーのセル位置が無効です:', receiverCell);
      return null;
    }

    // スロワーを作成（外側マスに配置）
    const thrower = this.createCheckModeCharacter('ally', throwerWorld, throwerData, 'PG');
    thrower.setPosition(new Vector3(throwerWorld.x, 0, throwerWorld.z), true); // クランプをスキップ
    this.allyCharacters.push(thrower);

    // レシーバーを作成
    const receiver = this.createCheckModeCharacter('ally', receiverWorld, receiverData, 'SG');
    this.allyCharacters.push(receiver);

    // 衝突判定を更新
    this.updateCollisionHandlerForCheckMode([thrower, receiver]);

    // 向きを設定
    thrower.lookAt(receiver.getPosition());
    receiver.lookAt(thrower.getPosition());

    // ボールをスロワーに持たせる
    this.ball.setHolder(thrower);

    // 状態を設定
    thrower.setState(CharacterState.THROW_IN_THROWER);
    receiver.setState(CharacterState.THROW_IN_RECEIVER);


    return { thrower, receiver };
  }

  /**
   * スローインチェックコントローラーを作成
   */
  public createThrowInCheckController(
    thrower: Character,
    receiver: Character,
    config: {
      minDistance?: number;
      maxDistance?: number;
      timeoutSeconds?: number;
    } = {}
  ): ThrowInCheckController {
    // デフォルト値を適用して必須フィールドを満たす
    const fullConfig = {
      minDistance: config.minDistance ?? 3,
      maxDistance: config.maxDistance ?? 10,
      timeoutSeconds: config.timeoutSeconds ?? 5,
    };

    const controller = new ThrowInCheckController(
      thrower,
      receiver,
      this.ball,
      fullConfig
    );

    return controller;
  }

  /**
   * スローインテストを1回実行
   */
  public executeThrowInTest(): boolean {
    if (this.allyCharacters.length < 2) {
      console.error('[GameScene] スロワーとレシーバーが必要です');
      return false;
    }

    const thrower = this.allyCharacters[0];
    const receiver = this.allyCharacters[1];

    if (this.ball.getHolder() !== thrower) {
      console.error('[GameScene] スロワーがボールを持っていません');
      return false;
    }

    // レシーバーの胸の高さを目標に
    const receiverHeight = receiver.config.physical.height;
    const targetPosition = new Vector3(
      receiver.getPosition().x,
      receiverHeight * 0.65,
      receiver.getPosition().z
    );


    // パスを実行
    return this.ball.passWithArc(targetPosition, receiver, 'chest');
  }

  /**
   * スローインチェック用の全外側マスを取得
   */
  public getAllOuterCellsForThrowInCheck(): OuterCellInfo[] {
    return getAllOuterCells();
  }

  /**
   * 指定された外側マスからパス可能なレシーバーマスを取得
   */
  public getValidReceiverCellsForThrowInCheck(
    outerCell: OuterCellInfo,
    minDistance?: number,
    maxDistance?: number
  ): Array<{ col: string; row: number; worldX: number; worldZ: number; distance: number }> {
    return getValidReceiverCells(
      outerCell,
      minDistance ?? THROW_IN_CHECK_CONFIG.minPassDistance,
      maxDistance ?? THROW_IN_CHECK_CONFIG.maxPassDistance
    );
  }

  /**
   * 衝突システムを更新（外部から呼び出し用）
   * ドリブルチェックモードなど、独自の更新ループを持つモードで使用
   * 試合モード（GameScene.update()）と同じ順序で更新する
   * @param deltaTime デルタタイム
   */
  public updateCollisionSystems(deltaTime: number): void {
    // 1on1バトルコントローラーの更新（ドリブル突破とAI移動）
    // ※試合モードと同じ順序: update1on1Movement() → check1on1Battle()
    if (this.oneOnOneBattleController) {
      this.oneOnOneBattleController.updateDribbleBreakthrough(deltaTime);
      this.oneOnOneBattleController.update1on1Movement(deltaTime);
    }

    // 競り合いコントローラーの更新
    if (this.contestController) {
      this.contestController.update(deltaTime);
    }

    // サークルサイズコントローラーの更新
    if (this.circleSizeController) {
      this.circleSizeController.update(deltaTime);
    }

    // フェイントコントローラーの更新
    if (this.feintController) {
      this.feintController.update(deltaTime);
    }

    // 衝突判定を更新
    if (this.collisionHandler) {
      this.collisionHandler.update(deltaTime);
    }

    // 1on1状態の変化をチェック（移動適用後に行う）
    if (this.oneOnOneBattleController) {
      this.oneOnOneBattleController.check1on1Battle();

      // 有利/不利状態をオンボールプレイヤーとディフェンダーに反映
      const advantageStatus = this.oneOnOneBattleController.getAdvantageStatus();
      const onBallPlayer = this.oneOnOneBattleController.findOnBallPlayer();
      const onBallDefender = this.oneOnOneBattleController.findOnBallDefender();
      if (onBallPlayer) {
        onBallPlayer.setAdvantageStatus(advantageStatus);
      }
      if (onBallDefender) {
        onBallDefender.setAdvantageStatus(advantageStatus);
      }
    }
  }

  /**
   * 破棄
   */
  public dispose(): void {
    if (this.inputController) {
      this.inputController.dispose();
    }
    if (this.jointController) {
      this.jointController.dispose();
    }
    if (this.collisionHandler) {
      this.collisionHandler.dispose();
    }
    if (this.oneOnOneBattleController) {
      this.oneOnOneBattleController.dispose();
    }
    if (this.shootingController) {
      this.shootingController.dispose();
    }
    if (this.contestController) {
      this.contestController.dispose();
    }
    if (this.circleSizeController) {
      this.circleSizeController.dispose();
    }
    if (this.feintController) {
      this.feintController.dispose();
    }
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.dispose();
    }
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.dispose();
    }
    if (this.dribblePathVisualizer) {
      this.dribblePathVisualizer.dispose();
    }
    this.clearPassCheckDistanceLine();
    this.ball.dispose();

    // 全AIコントローラーを破棄
    for (const ai of this.characterAIs) {
      ai.dispose();
    }

    // 全キャラクターを破棄
    for (const character of this.allyCharacters) {
      character.dispose();
    }
    for (const character of this.enemyCharacters) {
      character.dispose();
    }

    this.field.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
