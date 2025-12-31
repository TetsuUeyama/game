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
// import { ModelLoader } from "../utils/ModelLoader"; // 一旦無効化
import {
  CAMERA_CONFIG,
  LIGHT_CONFIG,
  CHARACTER_CONFIG,
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
  private character: Character;
  private ball: Ball;
  private inputController: InputController;
  private jointController: JointController;
  private collisionHandler: CollisionHandler;

  // 追加キャラクター（オプション）
  private ally?: Character; // 味方
  private enemy1?: Character; // 敵1
  private enemy2?: Character; // 敵2

  private lastFrameTime: number = Date.now();

  // 3Dモデルロード状態
  private modelLoaded: boolean = false;

  // モーション確認モード（入力とモーション再生を停止）
  private isMotionConfirmationMode: boolean = false;

  constructor(canvas: HTMLCanvasElement, options?: { showAdditionalCharacters?: boolean }) {
    const showAdditionalCharacters = options?.showAdditionalCharacters ?? true;

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

    // キャラクターの作成（プレイヤー）
    this.character = this.createCharacter();

    // ボールの作成
    this.ball = this.createBall();

    // 追加キャラクターの作成（オプション）
    if (showAdditionalCharacters) {
      this.ally = this.createAlly();
      this.enemy1 = this.createEnemy1();
      this.enemy2 = this.createEnemy2();
    }

    // 衝突判定コントローラーの初期化
    this.collisionHandler = new CollisionHandler(
      this.ball,
      this.character,
      this.ally,
      this.enemy1,
      this.enemy2
    );

    // 入力コントローラーの初期化
    this.inputController = new InputController(this.scene, this.character);

    // 関節操作コントローラーの初期化（モーション選択UI含む）
    this.jointController = new JointController(this.scene, this.character);

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
   * キャラクターを作成（プレイヤー）
   */
  private createCharacter(): Character {
    // 初期位置（フィールドの中央）
    const initialPosition = new Vector3(0, CHARACTER_CONFIG.height / 2, 0);

    const character = new Character(this.scene, initialPosition);

    console.log("[GameScene] プレイヤーキャラクター作成完了");

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
    // プレイヤーの右側に配置
    const initialPosition = new Vector3(3, CHARACTER_CONFIG.height / 2, 2);

    const ally = new Character(this.scene, initialPosition);

    // 味方は緑色で表示
    ally.setColor(0.3, 0.8, 0.3);

    console.log("[GameScene] 味方キャラクター作成完了");

    return ally;
  }

  /**
   * 敵キャラクター1を作成
   */
  private createEnemy1(): Character {
    // プレイヤーの前方左側に配置
    const initialPosition = new Vector3(-4, CHARACTER_CONFIG.height / 2, 5);

    const enemy = new Character(this.scene, initialPosition);

    // 敵は赤色で表示
    enemy.setColor(0.9, 0.2, 0.2);

    console.log("[GameScene] 敵キャラクター1作成完了");

    return enemy;
  }

  /**
   * 敵キャラクター2を作成
   */
  private createEnemy2(): Character {
    // プレイヤーの前方右側に配置
    const initialPosition = new Vector3(4, CHARACTER_CONFIG.height / 2, 5);

    const enemy = new Character(this.scene, initialPosition);

    // 敵は赤色で表示
    enemy.setColor(0.9, 0.2, 0.2);

    console.log("[GameScene] 敵キャラクター2作成完了");

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
      this.inputController.update(deltaTime);

      // キャラクターを更新
      this.character.update(deltaTime);

      // カメラをキャラクターに追従させる
      this.updateCamera(deltaTime);
    }

    // ボールを更新（保持中はキャラクターに追従）
    this.ball.update(deltaTime);

    // 衝突判定を常に更新
    this.collisionHandler.update(deltaTime);

    // 関節操作コントローラーは常に更新（Ctrl+ドラッグ用）
    this.jointController.update(deltaTime);
  }

  /**
   * カメラの追従更新
   */
  private updateCamera(_deltaTime: number): void {
    // キャラクターの位置を取得
    const characterPosition = this.character.getPosition();

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
   * キャラクターを取得（外部からアクセス用）
   */
  public getCharacter(): Character {
    return this.character;
  }

  /**
   * モーション再生を停止（モーション確認用）
   */
  public stopMotionPlayback(): void {
    // モーション確認モードを有効化（入力とモーション再生を停止）
    this.isMotionConfirmationMode = true;

    // キャラクターのモーションコントローラーを停止
    const motionController = this.character.getMotionController();
    motionController.stop();

    console.log("[GameScene] モーション確認モードを有効化しました");
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.inputController.dispose();
    this.jointController.dispose();
    this.collisionHandler.dispose();
    this.character.dispose();
    this.ball.dispose();

    // 追加キャラクターが存在する場合のみdispose
    if (this.ally) {
      this.ally.dispose();
    }
    if (this.enemy1) {
      this.enemy1.dispose();
    }
    if (this.enemy2) {
      this.enemy2.dispose();
    }

    this.field.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
