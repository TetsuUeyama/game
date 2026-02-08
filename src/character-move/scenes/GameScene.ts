import {
  Scene,
  Engine,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
} from "@babylonjs/core";
import { Character } from "../entities/Character";
import { FaceAvatarCapture, FaceAvatarData } from "../utils/FaceAvatarCapture";
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
import { CharacterState, CHARACTER_STATE_COLORS } from "../types/CharacterState";
import { PlayerStateManager, DefenseScheme, VisualSettingsManager } from "../state";
import type { VisualSettings } from "../state";
import { GameTeamConfig } from "../loaders/TeamConfigLoader";
import { PlayerData } from "../types/PlayerData";
import { PhysicsManager } from "../../physics/PhysicsManager";
// import { ModelLoader } from "../loaders/ModelLoader"; // 一旦無効化
import {
  LIGHT_CONFIG,
  FIELD_CONFIG,
  // MODEL_CONFIG, // 一旦無効化
} from "../config/gameConfig";
import { PassTrajectoryVisualizer } from "../visualization/PassTrajectoryVisualizer";
import { ShootTrajectoryVisualizer } from "../visualization/ShootTrajectoryVisualizer";
import { DribblePathVisualizer } from "../visualization/DribblePathVisualizer";
import { PassCheckController, DefenderPlacement } from "../controllers/check/PassCheckController";
import { ThrowInCheckController } from "../controllers/check/ThrowInCheckController";
import { OuterCellInfo } from "../config/check/ThrowInCheckConfig";
import {
  JumpBallInfo,
  DEFAULT_JUMP_BALL_INFO,
} from "../config/JumpBallConfig";
import {
  CheckModeManager,
  CheckModeContext,
  JumpBallManager,
  JumpBallContext,
  ThrowInManager,
  ThrowInContext,
  GameResetManager,
  GameResetContext,
  CameraManager,
  CameraManagerContext,
  VisualizationManager,
  VisualizationManagerContext,
  PlayerActionFacade,
  PlayerActionFacadeContext,
} from "./game";
import type { GameMode } from "./game";

// GameModeを再エクスポート（後方互換性のため）
export type { GameMode } from "./game";

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

  // チェックモードマネージャー（Phase 1で作成、今後のPhaseで使用）
  private _checkModeManager?: CheckModeManager;

  // ジャンプボールマネージャー（Phase 2で作成）
  private _jumpBallManager?: JumpBallManager;

  // スローインマネージャー（Phase 3で作成）
  private _throwInManager?: ThrowInManager;

  // ゲームリセットマネージャー（Phase 4で作成）
  private _gameResetManager?: GameResetManager;

  // カメラマネージャー
  private _cameraManager?: CameraManager;

  // 可視化マネージャー
  private _visualizationManager?: VisualizationManager;

  // プレイヤーアクションファサード
  private _playerActionFacade?: PlayerActionFacade;

  // 視覚情報設定マネージャー
  private _visualSettingsManager: VisualSettingsManager = new VisualSettingsManager();

  // キャラクター（5対5）
  private allyCharacters: Character[] = []; // 味方チーム5人
  private enemyCharacters: Character[] = []; // 敵チーム5人

  // AIで動くキャラクターのインデックス
  private aiCharacterIndices: Set<Character> = new Set();

  // AIコントローラー
  private characterAIs: CharacterAI[] = [];

  // 全選手一括管理
  private playerStateManager?: PlayerStateManager;

  private lastFrameTime: number = Date.now();

  // ゲーム経過時間（秒）— pause中は加算しない
  private gameElapsedSeconds: number = 0;

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

  // シュートクロック用：前フレームのボール保持者
  private previousBallHolder: Character | null = null;

  // モーション確認モード（入力とモーション再生を停止）
  private isMotionConfirmationMode: boolean = false;

  // 一時停止状態（シュートチェックモードなど他のモードが動作中）
  private isPaused: boolean = false;

  // 初期化完了フラグ（物理エンジン・ジャンプボール設定完了まで更新をスキップ）
  private isInitialized: boolean = false;

  // チーム設定とプレイヤーデータ（キャラクター再作成用）
  private savedTeamConfig: GameTeamConfig | null = null;
  private savedPlayerData: Record<string, PlayerData> | null = null;

  // フェイスアバターキャプチャ
  private faceAvatarCache: FaceAvatarData[] | null = null;
  private characterVersion: number = 0;

  // チーム名（リーグ戦で動的に設定可能）
  private allyTeamName: string = 'ATM';
  private enemyTeamName: string = 'BTM';

  constructor(canvas: HTMLCanvasElement, options?: {
    showAdditionalCharacters?: boolean;
    teamConfig?: GameTeamConfig;
    playerData?: Record<string, PlayerData>;
    allyTeamName?: string;
    enemyTeamName?: string;
  }) {
    const showAdditionalCharacters = options?.showAdditionalCharacters ?? true;
    const teamConfig = options?.teamConfig;
    const playerData = options?.playerData;

    if (options?.allyTeamName) this.allyTeamName = options.allyTeamName;
    if (options?.enemyTeamName) this.enemyTeamName = options.enemyTeamName;

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

    // 全選手一括管理の初期化
    this.playerStateManager = new PlayerStateManager(this.ball);

    // チーム守備スキームを設定
    if (teamConfig) {
      this.playerStateManager.setDefenseScheme(
        'ally',
        teamConfig.allyTeam.defenseScheme ?? DefenseScheme.DROP
      );
      this.playerStateManager.setDefenseScheme(
        'enemy',
        teamConfig.enemyTeam.defenseScheme ?? DefenseScheme.DROP
      );
    }

    // AIコントローラーの初期化（hasAI: trueのキャラクターのみ）
    if (showAdditionalCharacters) {
      for (const character of allCharacters) {
        // AIで動くキャラクターのみAIコントローラーを設定
        if (this.aiCharacterIndices.has(character)) {
          const ai = new CharacterAI(character, this.ball, allCharacters, this.field, this.playerStateManager);
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
        ai.setPassCanCheckCallback((passer) => {
          return this._playerActionFacade?.canPass(passer) ?? true;
        });
        ai.setPassResetCallback((character) => {
          this._playerActionFacade?.resetPassCooldown(character);
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

    // チェックモードマネージャーの初期化
    this._checkModeManager = new CheckModeManager(this.createCheckModeContext());

    // ジャンプボールマネージャーの初期化
    this._jumpBallManager = new JumpBallManager(this.createJumpBallContext());

    // スローインマネージャーの初期化
    this._throwInManager = new ThrowInManager(this.createThrowInContext());

    // ゲームリセットマネージャーの初期化
    this._gameResetManager = new GameResetManager(this.createGameResetContext());

    // カメラマネージャーの初期化
    this._cameraManager = new CameraManager(this.createCameraManagerContext());

    // 可視化マネージャーの初期化
    this._visualizationManager = new VisualizationManager(this.createVisualizationManagerContext());

    // プレイヤーアクションファサードの初期化
    this._playerActionFacade = new PlayerActionFacade(this.createPlayerActionFacadeContext());

    // 視覚情報の初期設定を反映
    this.applyAllVisualSettings();

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
      character.offenseRole = playerConfig.offenseRole ?? null;
      character.defenseRole = playerConfig.defenseRole ?? null;
      character.shotPriority = playerConfig.shotPriority ?? null;

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
      character.offenseRole = playerConfig.offenseRole ?? null;
      character.defenseRole = playerConfig.defenseRole ?? null;
      character.shotPriority = playerConfig.shotPriority ?? null;

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

    // チーム守備スキームを設定
    if (this.playerStateManager) {
      this.playerStateManager.setDefenseScheme(
        'ally',
        teamConfig.allyTeam.defenseScheme ?? DefenseScheme.DROP
      );
      this.playerStateManager.setDefenseScheme(
        'enemy',
        teamConfig.enemyTeam.defenseScheme ?? DefenseScheme.DROP
      );
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
   * チェックモードコンテキストを作成
   * CheckModeManagerが必要とする依存関係とコールバックを提供
   */
  private createCheckModeContext(): CheckModeContext {
    return {
      scene: this.scene,
      ball: this.ball,
      field: this.field,
      savedPlayerData: this.savedPlayerData,
      shootingController: this.shootingController,
      feintController: this.feintController,
      dribblePathVisualizer: this.dribblePathVisualizer,
      shootTrajectoryVisualizer: this.shootTrajectoryVisualizer,
      passTrajectoryVisualizer: this.passTrajectoryVisualizer,

      // コールバック
      getAllCharacters: () => [...this.allyCharacters, ...this.enemyCharacters],
      getAllyCharacters: () => this.allyCharacters,
      getEnemyCharacters: () => this.enemyCharacters,
      isCirclesInContact: () => this.oneOnOneBattleController?.isCirclesInContact() ?? false,

      // キャラクター管理用コールバック
      addAllyCharacter: (character: Character) => {
        this.allyCharacters.push(character);
      },
      addEnemyCharacter: (character: Character) => {
        this.enemyCharacters.push(character);
      },
      clearCharacters: () => {
        this.disposeAllCharacters();
      },
      updateCollisionHandler: (characters: Character[]) => {
        this.updateCollisionHandlerForCheckMode(characters);
      },
      recreateDribblePathVisualizer: (characters: Character[]) => {
        this.recreateDribblePathVisualizerInternal(characters);
      },
      recreateShootTrajectoryVisualizer: (characters: Character[]) => {
        this.recreateShootTrajectoryVisualizerInternal(characters);
      },
      recreatePassTrajectoryVisualizer: (characters: Character[]) => {
        this.recreatePassTrajectoryVisualizerInternal(characters);
      },
      updatePassTrajectoryVisualizer: () => {
        if (this.passTrajectoryVisualizer) {
          this.passTrajectoryVisualizer.update();
        }
      },
      clearPassTrajectoryVisualizations: () => {
        if (this.passTrajectoryVisualizer) {
          this.passTrajectoryVisualizer.clearVisualizations();
        }
      },
    };
  }

  /**
   * ジャンプボールコンテキストを作成
   */
  private createJumpBallContext(): JumpBallContext {
    return {
      ball: this.ball,
      shotClockController: this.shotClockController,
      getAllyCharacters: () => this.allyCharacters,
      getEnemyCharacters: () => this.enemyCharacters,
      getCharacterAIs: () => this.characterAIs,
    };
  }

  /**
   * スローインコンテキストを作成
   */
  private createThrowInContext(): ThrowInContext {
    return {
      ball: this.ball,
      shotClockController: this.shotClockController,
      getAllyCharacters: () => this.allyCharacters,
      getEnemyCharacters: () => this.enemyCharacters,
      getCharacterAIs: () => this.characterAIs,
      onThrowInComplete: () => {
        // シュートクロックを開始
        const holder = this.ball.getHolder();
        if (holder && this.shotClockController) {
          this.shotClockController.reset(holder.team);
        }
      },
      onThrowInViolation: (violatingTeam: 'ally' | 'enemy', position: Vector3) => {
        // 相手チームからスローイン再開
        this._throwInManager?.executeReset(violatingTeam, position);
      },
    };
  }

  /**
   * カメラマネージャーコンテキストを作成
   */
  private createCameraManagerContext(): CameraManagerContext {
    return {
      camera: this.camera,
      ball: this.ball,
      getAllyCharacters: () => this.allyCharacters,
      getEnemyCharacters: () => this.enemyCharacters,
    };
  }

  /**
   * 可視化マネージャーコンテキストを作成
   */
  private createVisualizationManagerContext(): VisualizationManagerContext {
    return {
      passTrajectoryVisualizer: this.passTrajectoryVisualizer,
      shootTrajectoryVisualizer: this.shootTrajectoryVisualizer,
      dribblePathVisualizer: this.dribblePathVisualizer,
    };
  }

  /**
   * プレイヤーアクションファサードコンテキストを作成
   */
  private createPlayerActionFacadeContext(): PlayerActionFacadeContext {
    return {
      ball: this.ball,
      oneOnOneBattleController: this.oneOnOneBattleController,
      shootingController: this.shootingController,
      feintController: this.feintController,
      getAllyCharacters: () => this.allyCharacters,
      getEnemyCharacters: () => this.enemyCharacters,
    };
  }

  /**
   * ゲームリセットコンテキストを作成
   */
  private createGameResetContext(): GameResetContext {
    return {
      ball: this.ball,
      shotClockController: this.shotClockController,
      getAllyCharacters: () => this.allyCharacters,
      getEnemyCharacters: () => this.enemyCharacters,
      getCharacterAIs: () => this.characterAIs,
      // onScoreUpdate と onWinner は GameResetManager が状態を保持するため不要
      onRequestJumpBall: () => {
        this._jumpBallManager?.setup();
      },
      onRequestThrowIn: (offendingTeam: 'ally' | 'enemy', position: Vector3) => {
        // エンドラインかサイドラインかを判定
        const halfWidth = FIELD_CONFIG.width / 2;
        const halfLength = FIELD_CONFIG.length / 2;
        const isOutZ = Math.abs(position.z) > halfLength;
        const isOutX = Math.abs(position.x) > halfWidth;

        if (isOutZ) {
          // エンドライン（ゴールサイドライン）からのアウトオブバウンズ
          // → ゴール下で相手チームボール保持で再開
          this.executeGoalUnderReset(offendingTeam);
        } else if (isOutX) {
          // サイドラインからのアウトオブバウンズ
          // → スローインで再開
          this._throwInManager?.executeReset(offendingTeam, position);
        }
      },
      onClearThrowInState: () => {
        this.clearThrowInState();
      },
      onResetOneOnOneBattle: () => {
        if (this.oneOnOneBattleController) {
          this.oneOnOneBattleController.forceReset();
        }
      },
    };
  }

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

    // ゲーム経過時間を加算
    this.gameElapsedSeconds += deltaTime;

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
      // 全選手スナップショットを更新
      if (this.playerStateManager) {
        this.playerStateManager.update(allCharacters);
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

      // 全選手スナップショットを更新（状態更新後、AI更新前）
      if (this.playerStateManager) {
        const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
        this.playerStateManager.update(allCharacters);
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

        // 1on1接触中はオンボールプレイヤー/ディフェンダーのAIをスキップ
        if (circlesInContact) {
          if (state === CharacterState.ON_BALL_PLAYER || state === CharacterState.ON_BALL_DEFENDER) {
            continue; // 接触中は1on1ペアのAI更新をスキップ
          }
        }

        try {
          ai.update(deltaTime);
        } catch (e) {
          // HMR時のモジュール一時不整合などでエラーが発生しても
          // ゲームループ全体が停止しないようにする
          console.warn(`[GameScene] AI update error for ${character.playerPosition}:`, e);
        }
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

    // ゴール後のリセット待機中の処理（GameResetManagerに委譲）
    this._gameResetManager?.updateGoalReset(deltaTime);

    // ボール保持者の変更を検出してシュートクロックに通知
    const currentBallHolder = this.ball.getHolder();
    if (currentBallHolder !== this.previousBallHolder) {
      if (this.shotClockController) {
        this.shotClockController.onPossessionChange(currentBallHolder);
      }
      this.previousBallHolder = currentBallHolder;
    }

    // スローイン後、ボールがルーズ状態になった場合のpassTargetクリア
    const throwInThrower = this._throwInManager?.getThrower();
    if (throwInThrower && !currentBallHolder && !this.ball.isInFlight()) {
      const lastToucher = this.ball.getLastToucher();
      if (lastToucher === throwInThrower && this.ball.getPassTarget()) {
        this.ball.clearPassTarget();
      }
    }

    // アウトオブバウンズ判定（GameResetManagerを使用）
    const isGoalResetPending = this._gameResetManager?.isGoalResetPending() ?? false;
    const isOutOfBoundsResetPending = this._gameResetManager?.isOutOfBoundsResetPending() ?? false;
    const isThrowInActive = this._throwInManager?.isActive() ?? false;
    const ballHolder = this.ball.getHolder();
    const ballInFlight = this.ball.isInFlight();
    const isThrowInBeforeThrow = isThrowInActive && (ballHolder === throwInThrower || ballInFlight);
    const isJumpBallInProgress = this.isJumpBallActive();

    if (!isGoalResetPending && !isOutOfBoundsResetPending && !isThrowInBeforeThrow && !isJumpBallInProgress && this._gameResetManager?.checkOutOfBounds()) {
      // アウトオブバウンズリセットを開始
      this._gameResetManager?.startOutOfBoundsReset(this.ball.getPosition().clone());
    }

    // アウトオブバウンズリセット待機処理（GameResetManagerに委譲）
    this._gameResetManager?.updateOutOfBoundsReset(deltaTime);

    // シュートクロック更新
    if (this.shotClockController) {
      this.shotClockController.update(deltaTime);
    }

    // ルーズボールタイマー更新（JumpBallManagerに委譲）
    const isResetPending = isGoalResetPending || isOutOfBoundsResetPending || isThrowInActive;
    if (this._jumpBallManager?.updateLooseBallTimer(deltaTime, isResetPending)) {
      return; // ジャンプボールが開始された
    }

    // シュートクロック違反リセット待機処理（GameResetManagerに委譲）
    this._gameResetManager?.updateShotClockViolationReset(deltaTime);

    // スローイン処理（ThrowInManagerに委譲）
    this._throwInManager?.update(deltaTime);

    // ボールの前フレーム位置を更新（アウトオブバウンズ方向判定用 - GameResetManagerに委譲）
    this._gameResetManager?.updatePreviousBallPosition();
  }

  /**
   * スローイン状態を完全にクリア（ThrowInManagerに委譲）
   */
  private clearThrowInState(): void {
    this._throwInManager?.clear();
  }

  /**
   * スローイン中のキャラクター位置を強制（衝突判定前に呼び出す）
   * ThrowInManagerのゲッターを使用
   */
  private enforceThrowInPositions(): void {
    // ボールを投げた後は位置固定しない
    if (this._throwInManager?.hasBallBeenThrown()) {
      return;
    }

    const thrower = this._throwInManager?.getThrower();
    const position = this._throwInManager?.getPosition();

    if (thrower && position) {
      thrower.setPosition(position, true);
      // 待機中でなければ移動も停止
      if (!this._throwInManager?.isPending()) {
        thrower.stopMovement();
      }
    }
  }


  // ==============================
  // ジャンプボール関連メソッド（JumpBallManagerに委譲）
  // ==============================

  /**
   * ジャンプボールをセットアップ
   */
  private setupJumpBall(): void {
    this._jumpBallManager?.setup();
  }

  /**
   * ジャンプボールを更新（メインループから呼び出し）
   */
  private updateJumpBall(deltaTime: number): void {
    this._jumpBallManager?.update(deltaTime);
  }

  /**
   * ジャンプボールがアクティブかどうか
   */
  public isJumpBallActive(): boolean {
    return this._jumpBallManager?.isActive() ?? false;
  }

  /**
   * ジャンプボール情報を取得
   */
  public getJumpBallInfo(): JumpBallInfo {
    return this._jumpBallManager?.getInfo() ?? { ...DEFAULT_JUMP_BALL_INFO };
  }

  /**
   * カメラの追従更新（CameraManagerに委譲）
   */
  private updateCamera(deltaTime: number): void {
    this._cameraManager?.update(deltaTime);
  }

  /**
   * カメラターゲットを次のキャラクターに切り替え（CameraManagerに委譲）
   */
  public switchToNextCharacter(): void {
    this._cameraManager?.switchToNextCharacter();
  }

  /**
   * カメラターゲットを前のキャラクターに切り替え（CameraManagerに委譲）
   */
  public switchToPreviousCharacter(): void {
    this._cameraManager?.switchToPreviousCharacter();
  }

  /**
   * カメラターゲットのチームを切り替え（CameraManagerに委譲）
   */
  public switchTeam(): void {
    this._cameraManager?.switchTeam();
  }

  /**
   * 現在のターゲット情報を取得（CameraManagerに委譲）
   */
  public getCurrentTargetInfo(): {
    team: 'ally' | 'enemy';
    index: number;
    character: Character | null;
    cameraMode: 'on_ball' | 'manual';
  } {
    return this._cameraManager?.getCurrentTargetInfo() ?? {
      team: 'ally',
      index: 0,
      character: null,
      cameraMode: 'on_ball',
    };
  }

  /**
   * カメラモードを設定（CameraManagerに委譲）
   */
  public setCameraMode(mode: 'on_ball' | 'manual'): void {
    this._cameraManager?.setCameraMode(mode);
  }

  /**
   * カメラモードを取得（CameraManagerに委譲）
   */
  public getCameraMode(): 'on_ball' | 'manual' {
    return this._cameraManager?.getCameraMode() ?? 'on_ball';
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
   * ドリブル突破を実行（PlayerActionFacadeに委譲）
   */
  public performDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    return this._playerActionFacade?.performDribbleBreakthrough(direction) ?? false;
  }

  /**
   * ドリブル突破可能かどうかをチェック（PlayerActionFacadeに委譲）
   */
  public canPerformDribbleBreakthrough(): boolean {
    return this._playerActionFacade?.canPerformDribbleBreakthrough() ?? false;
  }

  /**
   * シュートを実行（PlayerActionFacadeに委譲）
   */
  public performShoot(shooter?: Character): { success: boolean; shootType: string; distance: number; message: string } | null {
    return this._playerActionFacade?.performShoot(shooter) ?? null;
  }

  /**
   * シュート可能かどうかをチェック（PlayerActionFacadeに委譲）
   */
  public canShoot(shooter?: Character): boolean {
    return this._playerActionFacade?.canShoot(shooter) ?? false;
  }

  /**
   * 現在のシュートレンジ情報を取得（PlayerActionFacadeに委譲）
   */
  public getShootRangeInfo(shooter?: Character): { shootType: string; distance: number; inRange: boolean; facingGoal: boolean } | null {
    return this._playerActionFacade?.getShootRangeInfo(shooter) ?? null;
  }

  /**
   * パスを実行（PlayerActionFacadeに委譲）
   */
  public performPass(
    passer: Character,
    passType: 'pass_chest' | 'pass_bounce' | 'pass_overhead' = 'pass_chest',
    target?: Character
  ): { success: boolean; message: string } {
    return this._playerActionFacade?.performPass(passer, passType, target) ?? { success: false, message: 'PlayerActionFacadeが初期化されていません' };
  }

  /**
   * ディフェンスアクションを実行（PlayerActionFacadeに委譲）
   */
  public performDefenseAction(
    defender: Character,
    actionType: 'block_shot' | 'steal_attempt' | 'pass_intercept' | 'defense_stance'
  ): { success: boolean; message: string } {
    return this._playerActionFacade?.performDefenseAction(defender, actionType) ?? { success: false, message: 'PlayerActionFacadeが初期化されていません' };
  }

  /**
   * シュートフェイントを実行（PlayerActionFacadeに委譲）
   */
  public performShootFeint(feinter?: Character): {
    success: boolean;
    defenderReacted: boolean;
    defender: Character | null;
    message: string;
  } | null {
    return this._playerActionFacade?.performShootFeint(feinter) ?? null;
  }

  /**
   * フェイント成功後のドリブル突破を実行（PlayerActionFacadeに委譲）
   */
  public performBreakthroughAfterFeint(
    character?: Character,
    direction: 'left' | 'right' | 'forward' = 'forward'
  ): boolean {
    return this._playerActionFacade?.performBreakthroughAfterFeint(character, direction) ?? false;
  }

  /**
   * フェイント成功後のドリブル突破ウィンドウ内かどうか（PlayerActionFacadeに委譲）
   */
  public isInBreakthroughWindow(character?: Character): boolean {
    return this._playerActionFacade?.isInBreakthroughWindow(character) ?? false;
  }

  /**
   * ゴール後のリセット処理を開始（GameResetManagerに委譲）
   * @param scoringTeam ゴールを決めたチーム
   */
  private resetAfterGoal(scoringTeam: 'ally' | 'enemy'): void {
    // 個人スタッツを帰属（ゴールリセット前に読み取る）
    const scorer = this.shootingController?.getCurrentShooterCharacter();
    if (scorer) {
      scorer.gameStats.points++;
      const assister = this.ball.getPendingAssistFrom();
      if (assister && assister !== scorer && assister.team === scorer.team) {
        assister.gameStats.assists++;
      }
    }
    this._gameResetManager?.startGoalReset(scoringTeam);
  }

  /**
   * シュートクロック違反時の処理（GameResetManagerに委譲）
   * @param offendingTeam 違反したチーム
   * @param ballPosition 違反時のボール位置
   */
  private handleShotClockViolation(offendingTeam: 'ally' | 'enemy', ballPosition: Vector3): void {
    this._gameResetManager?.handleShotClockViolation(offendingTeam, ballPosition);
  }


  /**
   * ゴール下から再開（ボール保持状態）
   * ゴール後やシュートクロック違反後に使用（GameResetManagerに委譲）
   * @param offendingTeam 違反/得点したチーム（この相手チームがボールを保持）
   */
  private executeGoalUnderReset(offendingTeam: 'ally' | 'enemy'): void {
    this._gameResetManager?.executeGoalUnderReset(offendingTeam);
  }

  /**
   * スコアを取得
   */
  public getScore(): { ally: number; enemy: number } {
    return this._gameResetManager?.getScores() ?? { ally: 0, enemy: 0 };
  }

  /**
   * チーム名を取得（3文字固定）
   */
  public getPlayerNames(): { ally: string; enemy: string } {
    return { ally: this.allyTeamName, enemy: this.enemyTeamName };
  }

  /**
   * 勝者を取得（GameResetManagerに委譲）
   */
  public getWinner(): 'ally' | 'enemy' | null {
    return this._gameResetManager?.getWinner() ?? null;
  }

  /**
   * 勝利に必要な得点を取得
   */
  public getWinningScore(): number {
    return 5; // GameResetManagerのwinningScoreと同じ値
  }

  /**
   * ゲームをリセット
   */
  public resetGame(): void {
    // 待機状態をリセット（マネージャーに委譲、スコアもリセットされる）
    this._gameResetManager?.resetForCheckMode();
    this.clearThrowInState();

    // ボールの飛行を停止
    this.ball.endFlight();

    // 全キャラクターのバランスをリセット＋個人スタッツをリセット
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
    for (const character of allCharacters) {
      character.resetBalance();
      character.gameStats.points = 0;
      character.gameStats.assists = 0;
    }

    // ゲーム経過時間をリセット
    this.gameElapsedSeconds = 0;

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
   * チェックモードマネージャーを取得
   * Phase 1で作成、今後のPhaseでチェックモードメソッドを委譲する際に使用
   */
  public getCheckModeManager(): CheckModeManager | undefined {
    return this._checkModeManager;
  }

  /**
   * ジャンプボールマネージャーを取得
   */
  public getJumpBallManager(): JumpBallManager | undefined {
    return this._jumpBallManager;
  }

  /**
   * スローインマネージャーを取得
   */
  public getThrowInManager(): ThrowInManager | undefined {
    return this._throwInManager;
  }

  /**
   * ゲームリセットマネージャーを取得
   */
  public getGameResetManager(): GameResetManager | undefined {
    return this._gameResetManager;
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
   * フェイスアバターをキャプチャ（キャッシュあり）
   */
  public async capturePlayerFaceAvatars(): Promise<FaceAvatarData[]> {
    if (this.faceAvatarCache) {
      return this.faceAvatarCache;
    }
    const data = await FaceAvatarCapture.captureAll(
      this.scene,
      this.allyCharacters,
      this.enemyCharacters
    );
    this.faceAvatarCache = data;
    return data;
  }

  /**
   * キャラクターバージョンを取得（再作成検知用）
   */
  public getCharacterVersion(): number {
    return this.characterVersion;
  }

  /**
   * 全選手のID→状態色(CSS文字列)マップを返す
   */
  public getPlayerStateColors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const c of [...this.allyCharacters, ...this.enemyCharacters]) {
      const id = c.playerData?.basic.ID;
      if (!id) continue;
      const rgb = CHARACTER_STATE_COLORS[c.getState()];
      result[id] = `rgb(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)})`;
    }
    return result;
  }

  /**
   * 全選手のID→個人ゲームスタッツマップを返す
   */
  public getPlayerGameStats(): Record<string, { points: number; assists: number }> {
    const result: Record<string, { points: number; assists: number }> = {};
    for (const c of [...this.allyCharacters, ...this.enemyCharacters]) {
      const id = c.playerData?.basic.ID;
      if (!id) continue;
      result[id] = { ...c.gameStats };
    }
    return result;
  }

  /**
   * ゲーム経過時間（秒）を取得
   */
  public getGameElapsedSeconds(): number {
    return this.gameElapsedSeconds;
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
    return this._throwInManager?.getRemainingTime() ?? 0;
  }

  /**
   * スローイン5秒タイマーが動作中かどうかを取得
   */
  public isThrowInTimerRunning(): boolean {
    return this._throwInManager?.isTimerRunning() ?? false;
  }

  // ============================================
  // 視覚情報設定（VisualSettingsManager）
  // ============================================

  /**
   * 視覚情報の全設定を取得
   */
  public getVisualSettings(): VisualSettings {
    return this._visualSettingsManager.getAll();
  }

  /**
   * 視覚情報の個別設定を変更し、実際の描画に反映
   */
  public setVisualSetting(key: keyof VisualSettings, value: boolean): void {
    this._visualSettingsManager.set(key, value);
    this.applyVisualSetting(key, value);
  }

  /**
   * 視覚情報の個別設定をトグルし、実際の描画に反映
   */
  public toggleVisualSetting(key: keyof VisualSettings): boolean {
    const newValue = this._visualSettingsManager.toggle(key);
    this.applyVisualSetting(key, newValue);
    return newValue;
  }

  /**
   * 全ての視覚情報設定を描画に反映（初期化時に使用）
   */
  private applyAllVisualSettings(): void {
    const settings = this._visualSettingsManager.getAll();
    for (const key of Object.keys(settings) as (keyof VisualSettings)[]) {
      this.applyVisualSetting(key, settings[key]);
    }
  }

  /**
   * 視覚情報の設定を実際の描画に反映
   */
  private applyVisualSetting(key: keyof VisualSettings, value: boolean): void {
    switch (key) {
      case 'shootTrajectory':
        this._visualizationManager?.setShootTrajectoryVisible(value);
        break;
      case 'passTrajectory':
        this._visualizationManager?.setPassTrajectoryVisible(value);
        break;
      case 'dribblePath':
        this._visualizationManager?.setDribblePathVisible(value);
        break;
      case 'tacticalZones':
        this.field.setTacticalZonesVisible(value);
        break;
      case 'visionCone':
        for (const character of [...this.allyCharacters, ...this.enemyCharacters]) {
          character.setVisionVisible(value);
        }
        break;
      case 'gridLines':
        this.field.setGridLinesVisible(value);
        break;
      case 'gridLabels':
        this.field.setGridLabelsVisible(value);
        break;
      case 'shootRange':
        if (this.shootingController) {
          if (value) {
            this.shootingController.showShootRange();
          } else {
            this.shootingController.hideShootRange();
          }
        }
        break;
    }
  }

  /**
   * パス軌道可視化の表示/非表示を設定（VisualizationManagerに委譲）
   */
  public setPassTrajectoryVisible(visible: boolean): void {
    this._visualizationManager?.setPassTrajectoryVisible(visible);
  }

  /**
   * パス軌道可視化の表示状態を取得（VisualizationManagerに委譲）
   */
  public isPassTrajectoryVisible(): boolean {
    return this._visualizationManager?.isPassTrajectoryVisible() ?? false;
  }

  /**
   * パス軌道可視化の表示/非表示を切り替え（VisualizationManagerに委譲）
   */
  public togglePassTrajectoryVisible(): void {
    this._visualizationManager?.togglePassTrajectoryVisible();
  }

  /**
   * パス軌道可視化の移動先予測を設定（VisualizationManagerに委譲）
   */
  public setPassTrajectoryDestinationPrediction(use: boolean): void {
    this._visualizationManager?.setPassTrajectoryDestinationPrediction(use);
  }

  /**
   * シュート軌道可視化の表示/非表示を設定（VisualizationManagerに委譲）
   */
  public setShootTrajectoryVisible(visible: boolean): void {
    this._visualizationManager?.setShootTrajectoryVisible(visible);
  }

  /**
   * シュート軌道可視化の表示状態を取得（VisualizationManagerに委譲）
   */
  public isShootTrajectoryVisible(): boolean {
    return this._visualizationManager?.isShootTrajectoryVisible() ?? false;
  }

  /**
   * シュート軌道可視化の表示/非表示を切り替え（VisualizationManagerに委譲）
   */
  public toggleShootTrajectoryVisible(): void {
    this._visualizationManager?.toggleShootTrajectoryVisible();
  }

  /**
   * ドリブル導線可視化の表示/非表示を設定（VisualizationManagerに委譲）
   */
  public setDribblePathVisible(visible: boolean): void {
    this._visualizationManager?.setDribblePathVisible(visible);
  }

  /**
   * ドリブル導線可視化の表示状態を取得（VisualizationManagerに委譲）
   */
  public isDribblePathVisible(): boolean {
    return this._visualizationManager?.isDribblePathVisible() ?? false;
  }

  /**
   * ドリブル導線可視化の表示/非表示を切り替え（VisualizationManagerに委譲）
   */
  public toggleDribblePathVisible(): void {
    this._visualizationManager?.toggleDribblePathVisible();
  }

  /**
   * キャラクターを指定位置に配置
   */
  public setCharacterPosition(character: Character, x: number, z: number): void {
    const height = character.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
    character.setPosition(new Vector3(x, height / 2, z));
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

    // 全選手一括管理を再初期化
    this.playerStateManager = new PlayerStateManager(this.ball);

    // チーム守備スキームを再設定
    if (this.savedTeamConfig) {
      this.playerStateManager.setDefenseScheme(
        'ally',
        this.savedTeamConfig.allyTeam.defenseScheme ?? DefenseScheme.DROP
      );
      this.playerStateManager.setDefenseScheme(
        'enemy',
        this.savedTeamConfig.enemyTeam.defenseScheme ?? DefenseScheme.DROP
      );
    }

    // AIコントローラーを再初期化
    for (const character of allCharacters) {
      if (this.aiCharacterIndices.has(character)) {
        const ai = new CharacterAI(character, this.ball, allCharacters, this.field, this.playerStateManager);

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
        ai.setPassCanCheckCallback((passer) => {
          return this._playerActionFacade?.canPass(passer) ?? true;
        });
        ai.setPassResetCallback((character) => {
          this._playerActionFacade?.resetPassCooldown(character);
        });

        this.characterAIs.push(ai);
      }
    }

    // 可視化を再作成（ヘルパーメソッド使用）
    this.recreatePassTrajectoryVisualizerInternal(allCharacters);
    this.recreateShootTrajectoryVisualizerInternal(allCharacters);

    // フェイスアバターキャッシュを無効化
    this.faceAvatarCache = null;
    this.characterVersion++;
  }

  /**
   * パス軌道可視化を再作成（内部ヘルパー）
   */
  private recreatePassTrajectoryVisualizerInternal(characters: Character[]): void {
    if (this.passTrajectoryVisualizer) {
      this.passTrajectoryVisualizer.dispose();
    }
    this.passTrajectoryVisualizer = new PassTrajectoryVisualizer(
      this.scene,
      this.ball,
      characters
    );
    this.passTrajectoryVisualizer.setEnabled(true);
  }

  /**
   * シュート軌道可視化を再作成（内部ヘルパー）
   */
  private recreateShootTrajectoryVisualizerInternal(characters: Character[]): void {
    if (this.shootTrajectoryVisualizer) {
      this.shootTrajectoryVisualizer.dispose();
    }
    this.shootTrajectoryVisualizer = new ShootTrajectoryVisualizer(
      this.scene,
      this.ball,
      this.field,
      characters
    );
    this.shootTrajectoryVisualizer.setEnabled(true);
  }

  /**
   * ドリブル導線可視化を再作成（内部ヘルパー）
   */
  private recreateDribblePathVisualizerInternal(characters: Character[]): void {
    if (this.dribblePathVisualizer) {
      this.dribblePathVisualizer.dispose();
    }
    this.dribblePathVisualizer = new DribblePathVisualizer(
      this.scene,
      this.ball,
      this.field,
      characters
    );
    this.dribblePathVisualizer.setEnabled(true);
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
   * CheckModeManagerに委譲
   */
  public setupDribbleCheckMode(
    dribblerPlayerId: string,
    defenderPlayerId: string,
    dribblerPosition: { x: number; z: number },
    defenderPosition: { x: number; z: number },
    targetPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): { dribbler: Character; defender: Character } | null {
    return this._checkModeManager?.setupDribbleCheckMode(
      dribblerPlayerId,
      defenderPlayerId,
      dribblerPosition,
      defenderPosition,
      targetPosition,
      playerData
    ) ?? null;
  }

  /**
   * シュートチェックモード用のセットアップ
   * CheckModeManagerに委譲
   */
  public setupShootCheckMode(
    shooterPlayerId: string,
    shooterPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): Character | null {
    return this._checkModeManager?.setupShootCheckMode(
      shooterPlayerId,
      shooterPosition,
      playerData
    ) ?? null;
  }

  /**
   * シュートチェックモード用のディフェンダーを追加
   * CheckModeManagerに委譲
   */
  public addShootCheckDefender(
    defenderPlayerId: string,
    defenderPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): Character | null {
    return this._checkModeManager?.addShootCheckDefender(
      defenderPlayerId,
      defenderPosition,
      playerData
    ) ?? null;
  }

  /**
   * パスチェックモード用のセットアップ
   * CheckModeManagerに委譲
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
    return this._checkModeManager?.setupPassCheckMode(
      passerPlayerId,
      receiverPlayerId,
      passerPosition,
      receiverPosition,
      defenderPlacements,
      playerData
    ) ?? null;
  }

  /**
   * パスチェックコントローラーを作成
   * CheckModeManagerに委譲
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
    return this._checkModeManager!.createPassCheckController(passer, receiver, config);
  }

  /**
   * パスチェックモードの可視化を更新
   * CheckModeManagerに委譲
   */
  public updatePassCheckVisualization(): void {
    this._checkModeManager?.updatePassCheckVisualization();
  }

  /**
   * パスチェックモードの可視化をクリア
   * CheckModeManagerに委譲
   */
  public clearPassCheckVisualization(): void {
    this._checkModeManager?.clearPassCheckVisualization();
  }

  /**
   * パサーとレシーバー間の距離を取得
   * CheckModeManagerに委譲
   */
  public getPassCheckDistance(): number | null {
    return this._checkModeManager?.getPassCheckDistance() ?? null;
  }

  /**
   * チェックモードを終了して通常のゲームモードに戻る
   */
  public exitCheckMode(): void {
    this._checkModeManager?.exitCheckMode();

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
   * CheckModeManagerに委譲
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
    return this._checkModeManager?.setupThrowInCheckMode(
      throwerPlayerId,
      receiverPlayerId,
      throwerCell,
      receiverCell,
      playerData
    ) ?? null;
  }

  /**
   * スローインチェックコントローラーを作成
   * CheckModeManagerに委譲
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
    return this._checkModeManager!.createThrowInCheckController(thrower, receiver, config);
  }

  /**
   * スローインテストを1回実行
   * CheckModeManagerに委譲
   */
  public executeThrowInTest(): boolean {
    return this._checkModeManager?.executeThrowInTest() ?? false;
  }

  /**
   * スローインチェック用の全外側マスを取得
   * CheckModeManagerに委譲
   */
  public getAllOuterCellsForThrowInCheck(): OuterCellInfo[] {
    return this._checkModeManager?.getAllOuterCellsForThrowInCheck() ?? [];
  }

  /**
   * 指定された外側マスからパス可能なレシーバーマスを取得
   * CheckModeManagerに委譲
   */
  public getValidReceiverCellsForThrowInCheck(
    outerCell: OuterCellInfo,
    minDistance?: number,
    maxDistance?: number
  ): Array<{ col: string; row: number; worldX: number; worldZ: number; distance: number }> {
    return this._checkModeManager?.getValidReceiverCellsForThrowInCheck(
      outerCell,
      minDistance,
      maxDistance
    ) ?? [];
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
    if (this._checkModeManager) {
      this._checkModeManager.dispose();
    }
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
