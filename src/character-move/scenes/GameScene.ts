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
import { GameTeamConfig } from "../loaders/TeamConfigLoader";
import { PlayerData } from "../types/PlayerData";
import { PhysicsManager } from "../../physics/PhysicsManager";
// import { ModelLoader } from "../loaders/ModelLoader"; // 一旦無効化
import {
  CAMERA_CONFIG,
  LIGHT_CONFIG,
  FIELD_CONFIG,
  // MODEL_CONFIG, // 一旦無効化
} from "../config/gameConfig";
import { PassTrajectoryVisualizer } from "../visualization/PassTrajectoryVisualizer";
import { ShootTrajectoryVisualizer } from "../visualization/ShootTrajectoryVisualizer";
import { PassCheckController, DefenderPlacement } from "../controllers/check/PassCheckController";
import { FieldGridUtils, CellCoord } from "../config/FieldGridConfig";
import { FormationUtils } from "../config/FormationConfig";

/**
 * ゲームモード
 */
export type GameMode = 'game' | 'dribble_check' | 'shoot_check' | 'pass_check';

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

  // パスチェックモード用距離表示ライン
  private passCheckDistanceLine?: LinesMesh;

  // シュートクロック違反後のリセット待機状態
  private pendingShotClockViolationReset: boolean = false;
  private shotClockViolationResetTimer: number = 0;
  private shotClockViolatingTeam: 'ally' | 'enemy' | null = null;
  private shotClockViolationBallPosition: Vector3 | null = null;
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
  private throwInReceiverPosition: Vector3 | null = null; // レシーバーの固定位置
  private readonly throwInDelay: number = 3.0; // スローインまでの遅延（秒）- 他の選手がポジション移動する時間

  // 3Dモデルロード状態
  private modelLoaded: boolean = false;

  // モーション確認モード（入力とモーション再生を停止）
  private isMotionConfirmationMode: boolean = false;

  // 一時停止状態（シュートチェックモードなど他のモードが動作中）
  private isPaused: boolean = false;

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
    } catch (error) {
      console.error("[GameScene] Havok physics initialization failed:", error);
      throw new Error("Havok physics engine is required but failed to initialize");
    }
  }

  /**
   * 味方キャラクターを作成
   */
  private createAlly(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // プレイヤーの右側に配置
    const initialPosition = new Vector3(3, config.physical.height / 2, 2);

    const ally = new Character(this.scene, initialPosition, config);

    // 味方は緑色で表示
    ally.setColor(0.3, 0.8, 0.3);

    // チームを味方に設定
    ally.setTeam("ally");

    return ally;
  }

  /**
   * 敵キャラクター1を作成
   */
  private createEnemy1(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // プレイヤーの前方左側に配置
    const initialPosition = new Vector3(-4, config.physical.height / 2, 5);

    const enemy = new Character(this.scene, initialPosition, config);

    // 敵は赤色で表示
    enemy.setColor(0.9, 0.2, 0.2);

    // チームを敵に設定
    enemy.setTeam("enemy");

    
    return enemy;
  }

  /**
   * 敵キャラクター2を作成
   */
  private createEnemy2(): Character {
    // デフォルト設定を使用
    const config = DEFAULT_CHARACTER_CONFIG;

    // プレイヤーの前方右側に配置
    const initialPosition = new Vector3(4, config.physical.height / 2, 5);

    const enemy = new Character(this.scene, initialPosition, config);

    // 敵は赤色で表示
    enemy.setColor(0.9, 0.2, 0.2);

    // チームを敵に設定
    enemy.setTeam("enemy");

    
    return enemy;
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
    // 一時停止中はゲームロジックをすべてスキップ（レンダリングのみ継続）
    if (this.isPaused) {
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

      // 1on1バトルコントローラーの更新（ドリブル突破とAI移動）
      if (this.oneOnOneBattleController) {
        this.oneOnOneBattleController.updateDribbleBreakthrough(deltaTime);
        this.oneOnOneBattleController.update1on1Movement(deltaTime);
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

      // キャラクターの状態を更新（AI更新前に実行して正しい状態でAIが動作するようにする）
      if (this.collisionHandler) {
        this.collisionHandler.updateStates();
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
    }

    // ボールを更新（保持中はキャラクターに追従）
    this.ball.update(deltaTime);

    // フィールドを更新（ネットの物理シミュレーション）
    this.field.update(deltaTime);

    // 衝突判定を常に更新
    if (this.collisionHandler) {
      this.collisionHandler.update(deltaTime);
    }

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

      // スローインのレシーバーがボールを受け取ったらクリア
      if (this.throwInReceiver && currentBallHolder === this.throwInReceiver) {
        console.log('[GameScene] スローインレシーバーがボールを受け取りました。通常状態に復帰します。');
        this.throwInThrower = null;
        this.throwInReceiver = null;
        // スローイン状態を通常の状態に戻す（CollisionHandlerが次フレームで設定する）
        this.clearAllThrowInCharacterStates();
      }
    }

    // ボールが飛行を終了したらスローイン状態をクリア（タイムアウト）
    // アウトオブバウンズ判定の前にクリアして、正しく判定されるようにする
    if (this.throwInReceiver && !this.ball.isInFlight() && !this.ball.isHeld()) {
      console.log('[GameScene] スローインボールが飛行終了（未キャッチ）。通常状態に復帰します。');
      this.throwInThrower = null;
      this.throwInReceiver = null;
      // パスターゲットもクリア（Ball.updateFlightPhysicsでクリアしなくなったため）
      this.ball.clearPassTarget();
      this.clearAllThrowInCharacterStates();
    }

    // アウトオブバウンズ判定（ゴール後・アウトオブバウンズのリセット待機中・スローイン中は判定しない）
    // スローイン中はボールが外側マスから投げられるため、判定をスキップ
    const isThrowInActive = this.isThrowInPending || this.throwInThrower !== null || this.throwInReceiver !== null;
    if (!this.pendingGoalReset && !this.pendingOutOfBoundsReset && !isThrowInActive && this.checkOutOfBounds()) {
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
      // スロワーとレシーバーの位置を固定（毎フレーム）
      if (this.throwInThrower && this.throwInPosition) {
        this.throwInThrower.setPosition(this.throwInPosition, true); // 外側マスなのでクランプをスキップ
        // スロワーがレシーバーの方を向く
        if (this.throwInReceiverPosition) {
          this.throwInThrower.lookAt(this.throwInReceiverPosition);
        }

        // ボールがスロワーに保持されていることを確認
        // 何らかの理由でボールが落ちた場合、再セットする
        const currentHolder = this.ball.getHolder();
        if (currentHolder !== this.throwInThrower && !this.ball.isInFlight()) {
          console.log('[GameScene] スローイン待機中：ボールがスロワーから離れています。再セットします。');
          this.ball.setHolder(this.throwInThrower);
        }
      }
      if (this.throwInReceiver && this.throwInReceiverPosition) {
        this.throwInReceiver.setPosition(this.throwInReceiverPosition);
        // レシーバーがスロワーの方を向く
        if (this.throwInPosition) {
          this.throwInReceiver.lookAt(this.throwInPosition);
        }
      }

      this.throwInTimer -= deltaTime;
      if (this.throwInTimer <= 0) {
        this.executeThrowIn();
      }
    }
  }

  /**
   * スローインを実行
   */
  private executeThrowIn(): void {
    if (!this.throwInThrower || !this.throwInReceiver || !this.throwInPosition || !this.throwInReceiverPosition) {
      console.warn('[GameScene] スローイン情報が不足しています');
      this.clearThrowInState();
      return;
    }

    // ボールがスローイン担当者に保持されているか確認
    if (this.ball.getHolder() !== this.throwInThrower) {
      console.warn('[GameScene] スローイン担当者がボールを持っていません');
      this.clearThrowInState();
      return;
    }

    // スロワーを外側マスの固定位置に戻す（移動していた場合に備えて）
    this.throwInThrower.setPosition(this.throwInPosition, true); // 外側マスなのでクランプをスキップ

    // レシーバーも固定位置に戻す
    this.throwInReceiver.setPosition(this.throwInReceiverPosition);

    // スロワーとレシーバーの距離を計算（保存した固定位置を使用）
    const throwerPos = this.throwInPosition;
    const receiverPos = this.throwInReceiverPosition;
    const distance = Math.sqrt(
      Math.pow(receiverPos.x - throwerPos.x, 2) +
      Math.pow(receiverPos.z - throwerPos.z, 2)
    );

    // スローインでは常にチェストパスを使用
    // （バウンズパスは物理計算が複雑で問題が起きやすいため）
    const passType: 'chest' | 'bounce' = 'chest';

    console.log(`[GameScene] スローイン実行: ${passType}パス (距離: ${distance.toFixed(1)}m)`);
    console.log(`[GameScene] スロワー位置: (${throwerPos.x.toFixed(2)}, ${throwerPos.z.toFixed(2)})`);
    console.log(`[GameScene] レシーバー位置: (${receiverPos.x.toFixed(2)}, ${receiverPos.z.toFixed(2)})`);

    // パス実行前の状態を確認
    console.log(`[GameScene] スローインパス実行前: holder=${this.ball.getHolder()?.playerPosition}, inFlight=${this.ball.isInFlight()}`);

    // パスでボールを投げ入れる
    const passSuccess = this.ball.passWithArc(
      receiverPos,
      this.throwInReceiver,
      passType
    );

    // パス実行後の状態を確認
    console.log(`[GameScene] スローインパス実行後: passSuccess=${passSuccess}, holder=${this.ball.getHolder()?.playerPosition}, inFlight=${this.ball.isInFlight()}`);
    console.log(`[GameScene] パスターゲット: ${this.ball.getPassTarget()?.playerPosition}`);

    if (!passSuccess) {
      console.error('[GameScene] スローインパスの実行に失敗しました');
      this.clearThrowInState();
      return;
    }

    console.log(`[GameScene] スローインパス実行成功`);

    // シュートクロックをリセット（レシーバーのチームでカウント開始）
    if (this.shotClockController) {
      this.shotClockController.reset(this.throwInReceiver.team);
    }

    // スロワーとその他のプレイヤーはスローイン状態を維持
    // （レシーバーがボールを受け取るまで、または一定時間経過まで動かない）
    // 状態変更は clearAllThrowInCharacterStates() で行われる

    // スローイン待機状態はクリアするが、スロワーとレシーバー情報は保持
    // （ボールを受け取るまで全員のスローイン状態を維持するため）
    this.isThrowInPending = false;
    this.throwInTimer = 0;
    // throwInThrower と throwInReceiver はボール受け取りまで保持
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
    this.throwInReceiverPosition = null;
    // スローインロックを解除
    this.ball.clearThrowInLock();
    // キャラクターのスローイン状態もクリア
    this.clearAllThrowInCharacterStates();
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

  /**
   * スローイン待機状態のみクリア（レシーバーは保持）
   */
  private clearThrowInPendingState(): void {
    this.isThrowInPending = false;
    this.throwInTimer = 0;
    this.throwInThrower = null;
    this.throwInPosition = null;
    this.throwInReceiverPosition = null;
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
        if (action.startsWith('pass_')) {
          // パス先のキャラクターを決定
          let passTarget = target;
          if (!passTarget) {
            // ターゲット未指定の場合はチームメイトの最初の一人
            const teammates = passer.team === 'ally' ? this.allyCharacters : this.enemyCharacters;
            passTarget = teammates.find(c => c !== passer);
          }

          if (passTarget) {
            // ボールをパス（実際のパス処理）
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

    // コート境界チェック
    const isOutX = Math.abs(ballPosition.x) > halfWidth;
    const isOutZ = Math.abs(ballPosition.z) > halfLength;

    return isOutX || isOutZ;
  }

  /**
   * アウトオブバウンズ後のリセット処理
   * 最後にボールに触れた選手の相手チームがサイドラインからスローイン
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

    // サイドラインスローインで再開
    this.executeThrowInReset(offendingTeam, ballPosition);
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
   * @param ballPosition 違反時のボール位置
   */
  private handleShotClockViolation(offendingTeam: 'ally' | 'enemy', ballPosition: Vector3): void {
    // 既にリセット待機中の場合は何もしない
    if (this.pendingShotClockViolationReset || this.pendingGoalReset || this.pendingOutOfBoundsReset) {
      return;
    }

    // リセット待機状態を設定
    this.pendingShotClockViolationReset = true;
    this.shotClockViolationResetTimer = this.shotClockViolationResetDelay;
    this.shotClockViolatingTeam = offendingTeam;
    this.shotClockViolationBallPosition = ballPosition.clone();
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
    console.log(`[GameScene] calculateThrowInPosition: col=${throwInCell.col}, row=${throwInCell.row}`);
    console.log(`[GameScene] throwInWorldPos: x=${throwInWorldPos.x.toFixed(2)}, z=${throwInWorldPos.z.toFixed(2)}`);

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
      console.log(`[GameScene] Row 0 分岐: adjustedThrowInX=${adjustedThrowInX.toFixed(2)}, receiverZ=${receiverZ.toFixed(2)}`);
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
      console.log(`[GameScene] Row 31 分岐: adjustedThrowInX=${adjustedThrowInX.toFixed(2)}, receiverZ=${receiverZ.toFixed(2)}`);
    } else {
      // デフォルト（この分岐に入るとレシーバーとスロワーが同じ位置になる）
      console.warn(`[GameScene] デフォルト分岐に入りました - col=${throwInCell.col}, row=${throwInCell.row}`);
      receiverX = throwInWorldPos.x;
      receiverZ = throwInWorldPos.z;
    }

    console.log(`[GameScene] 最終位置: thrower=(${adjustedThrowInX.toFixed(2)}, ${adjustedThrowInZ.toFixed(2)}), receiver=(${receiverX.toFixed(2)}, ${receiverZ.toFixed(2)})`);

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
    const ballPosition = this.shotClockViolationBallPosition || this.ball.getPosition();
    this.shotClockViolatingTeam = null;
    this.shotClockViolationBallPosition = null;

    // サイドラインスローインで再開
    this.executeThrowInReset(offendingTeam, ballPosition);
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
    const { throwInPosition, throwInCell, receiverPosition } = this.calculateThrowInPosition(ballPosition);

    console.log(`[GameScene] スローイン: 外側マス ${throwInCell.col}${throwInCell.row} から実行`);
    console.log(`[GameScene] ボール位置: (${ballPosition.x.toFixed(2)}, ${ballPosition.z.toFixed(2)})`);
    console.log(`[GameScene] スロワー配置位置: (${throwInPosition.x.toFixed(2)}, ${throwInPosition.z.toFixed(2)})`);
    console.log(`[GameScene] レシーバー配置位置: (${receiverPosition.x.toFixed(2)}, ${receiverPosition.z.toFixed(2)})`);

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

    // スローインロックを設定（指定レシーバー以外へのパス/シュートを禁止）
    this.ball.setThrowInLock(receiver);

    // スローイン実行を予約（タイマーベース）
    this.isThrowInPending = true;
    this.throwInTimer = this.throwInDelay;
    this.throwInThrower = thrower;
    this.throwInReceiver = receiver;
    // スローイン位置を保存（スロワーが移動しても正しい位置からパスを実行するため）
    this.throwInPosition = throwerPos.clone();
    this.throwInReceiverPosition = receiverPos.clone();

    // スローイン状態を設定
    this.setThrowInStates(thrower, receiver, throwingTeam, defendingTeam);

    // シュートクロックはスローイン完了後に開始するため、ここでは停止
    if (this.shotClockController) {
      this.shotClockController.stop();
    }
  }

  /**
   * スローイン状態を設定
   */
  private setThrowInStates(
    thrower: Character,
    receiver: Character,
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
    }

    // スローワーにTHROW_IN_THROWER状態を設定
    thrower.setState(CharacterState.THROW_IN_THROWER);

    // レシーバーにTHROW_IN_RECEIVER状態を設定
    receiver.setState(CharacterState.THROW_IN_RECEIVER);

    // スローワーとレシーバー以外の全員にTHROW_IN_OTHER状態を設定
    for (const char of [...throwingTeam, ...defendingTeam]) {
      if (char !== thrower && char !== receiver) {
        char.setState(CharacterState.THROW_IN_OTHER);
      }
    }

    // AIにスローイン情報を設定
    for (const ai of this.characterAIs) {
      const character = ai.getCharacter();
      if (character === thrower) {
        ai.getThrowInThrowerAI().setThrowInPosition(this.throwInPosition!);
        ai.getThrowInThrowerAI().setReceiver(receiver);
      } else if (character === receiver) {
        ai.getThrowInReceiverAI().setWaitPosition(this.throwInReceiverPosition!);
        ai.getThrowInReceiverAI().setThrower(thrower);
      }
    }
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

    // ゴールを決められた側（相手チーム）がエンドラインからスローインで再開
    // 得点されたゴールの裏（エンドライン外側）からスローイン
    // ally（味方）が得点 → enemy（敵）が-Zゴール裏からスローイン（ally攻撃方向の裏）
    // enemy（敵）が得点 → ally（味方）が+Zゴール裏からスローイン（enemy攻撃方向の裏）
    const halfLength = FIELD_CONFIG.length / 2; // 15m
    const endLineZ = scoringTeam === 'ally' ? halfLength + 1.0 : -halfLength - 1.0;

    // ゴール中心付近の位置（スローイン計算でゴール回避されるため、x=0で良い）
    const throwInBallPosition = new Vector3(0, 0, endLineZ);

    console.log(`[GameScene] ゴール後リセット: ${scoringTeam}チームが得点 → エンドライン(z=${endLineZ.toFixed(1)})からスローイン`);

    // スローインで再開（得点したチームが違反扱いでスローイン権を相手に渡す）
    this.executeThrowInReset(scoringTeam, throwInBallPosition);
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
    this.shotClockViolationBallPosition = null;
    this.clearThrowInState();

    // ボール保持者をリセットしてセンターサークルから再開
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];

    // ボールの飛行を停止
    this.ball.endFlight();

    // 全キャラクターのバランスをリセット
    for (const character of allCharacters) {
      character.resetBalance();
    }

    if (allCharacters.length > 0) {
      const circleRadius = this.field.getCenterCircleRadius();
      const characterRadius = 0.3;
      const positionOffset = circleRadius + characterRadius + 0.3;

      // 味方チームがボールを持って開始
      const ballHolder = this.allyCharacters[0];
      if (ballHolder) {
        const holderPosition = new Vector3(
          0,
          ballHolder.config.physical.height / 2,
          -positionOffset
        );
        ballHolder.setPosition(holderPosition);
        this.ball.setHolder(ballHolder);

        // シュートクロックをリセット（味方チームでカウント開始）
        if (this.shotClockController) {
          this.shotClockController.reset('ally');
        }
      }

      // 敵チームを反対側に配置
      const opponent = this.enemyCharacters[0];
      if (opponent) {
        const opponentPosition = new Vector3(
          0,
          opponent.config.physical.height / 2,
          positionOffset
        );
        opponent.setPosition(opponentPosition);
      }
    }

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
    this.shotClockViolationBallPosition = null;
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

    return shooter;
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
  }

  /**
   * パスチェックモードの可視化をクリア
   */
  public clearPassCheckVisualization(): void {
    this.clearPassCheckDistanceLine();
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
    const dx = receiverPos.x - passerPos.x;
    const dz = receiverPos.z - passerPos.z;
    return Math.sqrt(dx * dx + dz * dz);
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
