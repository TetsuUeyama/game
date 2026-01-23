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
import { Field } from "../entities/Field";
import { Ball } from "../entities/Ball";
import { InputController } from "../controllers/InputController";
import { JointController } from "../controllers/JointController";
import { CollisionHandler } from "../controllers/CollisionHandler";
import { CharacterAI } from "../controllers/CharacterAI";
import { OneOnOneBattleController } from "../controllers/OneOnOneBattleController";
import { ShootingController } from "../controllers/ShootingController";
import { ContestController } from "../controllers/ContestController";
import { CircleSizeController } from "../controllers/CircleSizeController";
import { FeintController } from "../controllers/FeintController";
import { DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { GameTeamConfig } from "../utils/TeamConfigLoader";
import { PlayerData } from "../types/PlayerData";
// import { ModelLoader } from "../utils/ModelLoader"; // 一旦無効化
import {
  CAMERA_CONFIG,
  LIGHT_CONFIG,
  FIELD_CONFIG,
  // MODEL_CONFIG, // 一旦無効化
} from "../config/gameConfig";

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

  // キャラクター（6対6）
  private allyCharacters: Character[] = []; // 味方チーム6人
  private enemyCharacters: Character[] = []; // 敵チーム6人

  // AIコントローラー
  private characterAIs: CharacterAI[] = [];

  // カメラターゲット切り替え用
  private currentTargetTeam: 'ally' | 'enemy' = 'ally';
  private currentTargetIndex: number = 0;

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

  // 3Dモデルロード状態
  private modelLoaded: boolean = false;

  // モーション確認モード（入力とモーション再生を停止）
  private isMotionConfirmationMode: boolean = false;

  // スコア管理
  private allyScore: number = 0;
  private enemyScore: number = 0;
  private readonly winningScore: number = 5; // 勝利に必要な得点
  private winner: 'ally' | 'enemy' | null = null; // 勝者

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

    // カメラの設定
    this.camera = this.createCamera(canvas);

    // ライトの設定
    this.createLights();

    // フィールドの作成
    this.field = new Field(this.scene);

    // ボールの作成
    this.ball = this.createBall();

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

    // AIコントローラーの初期化
    if (showAdditionalCharacters) {
      // 全キャラクターにAIコントローラーを設定
      for (const character of allCharacters) {
        const ai = new CharacterAI(character, this.ball, allCharacters, this.field);
        this.characterAIs.push(ai);
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
   * チーム設定に基づいてキャラクターを作成（6対6）
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

      // 全AIコントローラーを更新
      for (const ai of this.characterAIs) {
        ai.update(deltaTime);
      }

      // カメラをプレイヤーキャラクターに追従させる
      this.updateCamera(deltaTime);
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
    }

    // シュートコントローラーの更新（ゴール判定）
    if (this.shootingController) {
      this.shootingController.update(deltaTime);
    }

    // アウトオブバウンズ判定
    if (this.checkOutOfBounds()) {
      this.resetAfterOutOfBounds();
    }
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
  public getCurrentTargetInfo(): { team: 'ally' | 'enemy'; index: number; character: Character | null } {
    return {
      team: this.currentTargetTeam,
      index: this.currentTargetIndex,
      character: this.getCurrentTargetCharacter(),
    };
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
   * @returns 成功/失敗
   */
  public performPass(
    passer: Character,
    passType: 'pass_chest' | 'pass_bounce' | 'pass_overhead' = 'pass_chest'
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
          // パス先のキャラクターを探す（チームメイト）
          const teammates = passer.team === 'ally' ? this.allyCharacters : this.enemyCharacters;
          const passTarget = teammates.find(c => c !== passer);

          if (passTarget) {
            // ボールをパス（実際のパス処理）
            const targetPosition = passTarget.getPosition();
            this.ball.pass(targetPosition, passTarget);
            console.log(`[GameScene] ${passType}をパス！`);
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
      onActive: (action) => {
        console.log(`[GameScene] ${action}のアクティブフェーズ`);
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
   * 最後にボールに触れた選手の相手チームがボールを保持してセンターサークル外側から再開
   */
  private resetAfterOutOfBounds(): void {
    const lastToucher = this.ball.getLastToucher();

    
    // ボールの飛行を停止
    this.ball.endFlight();

    // 相手チームの選手を特定
    let opponentCharacter: Character | null = null;

    if (lastToucher) {
      // 最後に触れた選手の相手チームから選ぶ
      const opponentTeam = lastToucher.team === 'ally' ? this.enemyCharacters : this.allyCharacters;
      if (opponentTeam.length > 0) {
        // 最初の選手をボール保持者とする（1対1なので1人しかいない想定）
        opponentCharacter = opponentTeam[0];
      }
    } else {
      // 最後に触れた選手がいない場合、味方チームの選手をボール保持者とする
      if (this.allyCharacters.length > 0) {
        opponentCharacter = this.allyCharacters[0];
      }
    }

    if (!opponentCharacter) {
      console.warn('[GameScene] 再開する選手が見つかりません');
      return;
    }

    // センターサークル半径を取得し、キャラクターの半径と余裕を加えた距離を計算
    const circleRadius = this.field.getCenterCircleRadius();
    const characterRadius = 0.3; // キャラクターの半径
    const positionOffset = circleRadius + characterRadius + 0.3; // サークル半径 + キャラ半径 + 余裕

    // ボール保持者のチームに応じて配置位置を決定
    // ally（味方）は+Zゴールを攻める → -Z側（自陣側）に配置
    // enemy（敵）は-Zゴールを攻める → +Z側（自陣側）に配置
    const holderZSign = opponentCharacter.team === 'ally' ? -1 : 1;

    // ボール保持者をセンターサークル外側（自陣側）に配置
    const holderPosition = new Vector3(
      0,
      opponentCharacter.config.physical.height / 2,
      holderZSign * positionOffset
    );
    opponentCharacter.setPosition(holderPosition);

    // ボールをその選手に渡す
    this.ball.setHolder(opponentCharacter);

    // 相手選手（最後に触れた選手）をセンターサークル外側（反対側）に配置
    if (lastToucher && lastToucher !== opponentCharacter) {
      const defenderPosition = new Vector3(
        0,
        lastToucher.config.physical.height / 2,
        -holderZSign * positionOffset // ボール保持者の反対側
      );
      lastToucher.setPosition(defenderPosition);
    }

      }

  /**
   * ゴール後のリセット処理
   * ゴールを決められた側がボールを保持してセンターサークル外側から再開
   * @param scoringTeam ゴールを決めたチーム
   */
  private resetAfterGoal(scoringTeam: 'ally' | 'enemy'): void {
    // 既に勝者が決まっている場合は何もしない
    if (this.winner) {
      return;
    }

    // スコアを更新
    if (scoringTeam === 'ally') {
      this.allyScore++;
    } else {
      this.enemyScore++;
    }

    
    // ボールの飛行を停止
    this.ball.endFlight();

    // ゴールを決められた側（相手チーム）がボールを持って再開
    const receivingTeam = scoringTeam === 'ally' ? this.enemyCharacters : this.allyCharacters;
    const scoringTeamCharacters = scoringTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;

    if (receivingTeam.length === 0) {
      console.warn('[GameScene] 再開する選手が見つかりません');
      return;
    }

    const ballHolder = receivingTeam[0];
    const opponent = scoringTeamCharacters.length > 0 ? scoringTeamCharacters[0] : null;

    // センターサークル半径を取得し、キャラクターの半径と余裕を加えた距離を計算
    const circleRadius = this.field.getCenterCircleRadius();
    const characterRadius = 0.3;
    const positionOffset = circleRadius + characterRadius + 0.3;

    // ボール保持者のチームに応じて配置位置を決定
    // ally（味方）は+Zゴールを攻める → -Z側（自陣側）に配置
    // enemy（敵）は-Zゴールを攻める → +Z側（自陣側）に配置
    const holderZSign = ballHolder.team === 'ally' ? -1 : 1;

    // ボール保持者をセンターサークル外側（自陣側）に配置
    const holderPosition = new Vector3(
      0,
      ballHolder.config.physical.height / 2,
      holderZSign * positionOffset
    );
    ballHolder.setPosition(holderPosition);

    // ボールを渡す
    this.ball.setHolder(ballHolder);

    // 相手選手をセンターサークル外側（反対側）に配置
    if (opponent) {
      const opponentPosition = new Vector3(
        0,
        opponent.config.physical.height / 2,
        -holderZSign * positionOffset
      );
      opponent.setPosition(opponentPosition);
    }

    
    // 勝利判定
    if (this.allyScore >= this.winningScore) {
      this.winner = 'ally';
          } else if (this.enemyScore >= this.winningScore) {
      this.winner = 'enemy';
          }
  }

  /**
   * スコアを取得
   */
  public getScore(): { ally: number; enemy: number } {
    return { ally: this.allyScore, enemy: this.enemyScore };
  }

  /**
   * 選手名を取得
   */
  public getPlayerNames(): { ally: string; enemy: string } {
    const allyName = this.allyCharacters[0]?.playerData?.basic?.NAME || 'ALLY';
    const enemyName = this.enemyCharacters[0]?.playerData?.basic?.NAME || 'ENEMY';
    return { ally: allyName, enemy: enemyName };
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

    // ボール保持者をリセットしてセンターサークルから再開
    const allCharacters = [...this.allyCharacters, ...this.enemyCharacters];
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

    console.log(`[GameScene] チーム位置を適用: ally=${allyPositions.length}, enemy=${enemyPositions.length}`);
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
