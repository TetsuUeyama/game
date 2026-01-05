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
import { DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { GameTeamConfig } from "../utils/TeamConfigLoader";
import { PlayerData } from "../types/PlayerData";
// import { ModelLoader } from "../utils/ModelLoader"; // 一旦無効化
import {
  CAMERA_CONFIG,
  LIGHT_CONFIG,
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

  // 3Dモデルロード状態
  private modelLoaded: boolean = false;

  // モーション確認モード（入力とモーション再生を停止）
  private isMotionConfirmationMode: boolean = false;

  constructor(canvas: HTMLCanvasElement, options?: {
    showAdditionalCharacters?: boolean;
    teamConfig?: GameTeamConfig;
    playerData?: Record<string, PlayerData>;
  }) {
    const showAdditionalCharacters = options?.showAdditionalCharacters ?? true;
    const teamConfig = options?.teamConfig;
    const playerData = options?.playerData;

    // WebGLサポートチェック
    if (!canvas.getContext("webgl") && !canvas.getContext("webgl2")) {
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
      this.collisionHandler = new CollisionHandler(
        this.ball,
        allCharacters[0], // プレイヤーキャラクター（味方チームの1人目）
        ...allCharacters.slice(1, 3) // 他の味方
      );
    }

    // AIコントローラーの初期化
    if (showAdditionalCharacters) {
      // 全キャラクターにAIコントローラーを設定
      for (const character of allCharacters) {
        const ai = new CharacterAI(character, this.ball, allCharacters, this.field);
        this.characterAIs.push(ai);
      }
      console.log(`[GameScene] ${this.characterAIs.length}人のAIコントローラーを初期化しました`);
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

    console.log("[GameScene] character-moveゲーム初期化完了");
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
    console.log('[GameScene] チームを作成中...');

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

      console.log(`[GameScene] 味方チーム: ${player.basic.NAME} (${playerConfig.position}、身長: ${player.basic.height}cm) を作成`);
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

      console.log(`[GameScene] 敵チーム: ${player.basic.NAME} (${playerConfig.position}、身長: ${player.basic.height}cm) を作成`);
    }

    console.log(`[GameScene] チーム作成完了: 味方${this.allyCharacters.length}人, 敵${this.enemyCharacters.length}人`);
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

    console.log(`[GameScene] プレイヤーキャラクター作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

    return character;
  }

  /**
   * ボールを作成
   */
  private createBall(): Ball {
    // プレイヤーの前方に配置（半径0.25mなので、地面からの高さは0.25m）
    const initialPosition = new Vector3(0, 0.25, 2);

    const ball = new Ball(this.scene, initialPosition);

    console.log("[GameScene] ボール作成完了");

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

    console.log(`[GameScene] 味方キャラクター作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

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

    console.log(`[GameScene] 敵キャラクター1作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

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

    console.log(`[GameScene] 敵キャラクター2作成完了 (${config.basic.name}, 身長: ${config.physical.height}m)`);

    return enemy;
  }

  /**
   * 3Dモデルをロード（オプション）
   * 現在は無効化中（@babylonjs/loadersパッケージが必要）

  private async loadCharacterModel(): Promise<void> {
    try {
      console.log("[GameScene] 3Dモデルのロードを試行中...");

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
      console.log("[GameScene] 3Dモデルのロードに成功しました");
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

      // 全AIコントローラーを更新
      for (const ai of this.characterAIs) {
        ai.update(deltaTime);
      }

      // カメラをプレイヤーキャラクターに追従させる
      this.updateCamera(deltaTime);
    }

    // ボールを更新（保持中はキャラクターに追従）
    this.ball.update(deltaTime);

    // 衝突判定を常に更新
    if (this.collisionHandler) {
      this.collisionHandler.update(deltaTime);
    }

    // 関節操作コントローラーは常に更新（Ctrl+ドラッグ用）
    if (this.jointController) {
      this.jointController.update(deltaTime);
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
    const character = characters[this.currentTargetIndex];
    console.log(`[GameScene] カメラターゲット: ${this.currentTargetTeam} ${this.currentTargetIndex + 1}人目 (${character.playerData?.basic.NAME || 'Unknown'})`);
  }

  /**
   * カメラターゲットを前のキャラクターに切り替え
   */
  public switchToPreviousCharacter(): void {
    const characters = this.currentTargetTeam === 'ally' ? this.allyCharacters : this.enemyCharacters;
    if (characters.length === 0) return;

    this.currentTargetIndex = (this.currentTargetIndex - 1 + characters.length) % characters.length;
    const character = characters[this.currentTargetIndex];
    console.log(`[GameScene] カメラターゲット: ${this.currentTargetTeam} ${this.currentTargetIndex + 1}人目 (${character.playerData?.basic.NAME || 'Unknown'})`);
  }

  /**
   * カメラターゲットのチームを切り替え
   */
  public switchTeam(): void {
    this.currentTargetTeam = this.currentTargetTeam === 'ally' ? 'enemy' : 'ally';
    this.currentTargetIndex = 0;
    const character = this.getCurrentTargetCharacter();
    console.log(`[GameScene] チーム切り替え: ${this.currentTargetTeam} 1人目 (${character?.playerData?.basic.NAME || 'Unknown'})`);
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

    console.log("[GameScene] モーション確認モードを有効化しました");
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
