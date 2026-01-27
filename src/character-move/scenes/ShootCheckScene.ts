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
import { ShootingController } from "../controllers/ShootingController";
import { ShootCheckController, ShootCheckConfig, ShootCheckProgress, CellShootResult } from "../controllers/ShootCheckController";
import { DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { PlayerData } from "../types/PlayerData";
import { PhysicsManager } from "../../physics/PhysicsManager";
import { CAMERA_CONFIG, LIGHT_CONFIG } from "../config/gameConfig";

/**
 * シュートチェックモード用のシーン
 * 1人のキャラクターで各升目からシュートをテスト
 */
export class ShootCheckScene {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private field: Field;
  private ball: Ball;
  private character: Character;
  private shootingController: ShootingController;
  private shootCheckController: ShootCheckController | null = null;

  private lastFrameTime: number = Date.now();
  private isRunning: boolean = false;

  // ゴール後のリセット用
  private pendingGoalReset: boolean = false;
  private goalResetTimer: number = 0;
  private readonly goalResetDelay: number = 0.5; // シュートチェック用は短め

  constructor(canvas: HTMLCanvasElement) {
    // WebGLサポートチェック
    const testCanvas = document.createElement("canvas");
    const webglSupported = !!(testCanvas.getContext("webgl2") || testCanvas.getContext("webgl"));
    if (!webglSupported) {
      throw new Error("WebGL is not supported in this browser.");
    }

    // エンジンの作成
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    // シーンの作成
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.5, 0.7, 0.9, 1.0);

    // カメラの設定
    this.camera = this.createCamera(canvas);

    // ライトの設定
    this.createLights();

    // フィールドの作成
    this.field = new Field(this.scene);

    // ボールの作成
    this.ball = new Ball(this.scene, new Vector3(0, 0.25, 0));

    // キャラクターの作成
    this.character = this.createCharacter();

    // シュートコントローラーの初期化
    this.shootingController = new ShootingController(
      this.scene,
      this.ball,
      this.field,
      () => [this.character]
    );

    // ゴール時のコールバック
    this.shootingController.setOnGoalCallback(() => {
      this.pendingGoalReset = true;
      this.goalResetTimer = this.goalResetDelay;

      // シュートチェックコントローラーにゴール成功を通知
      if (this.shootCheckController) {
        this.shootCheckController.notifyGoalScored();
      }
    });

    // シュートレンジを表示
    this.shootingController.showShootRange();

    // Havok物理エンジンの初期化
    this.initializePhysicsAsync();

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
    const camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      Math.PI / 3,
      15,
      Vector3.Zero(),
      this.scene
    );

    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 40;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2.2;

    camera.attachControl(canvas, true);

    return camera;
  }

  /**
   * ライトを作成
   */
  private createLights(): void {
    const hemisphericLight = new HemisphericLight(
      "hemispheric-light",
      new Vector3(0, 1, 0),
      this.scene
    );
    hemisphericLight.intensity = LIGHT_CONFIG.ambient.intensity;

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
   * キャラクターを作成
   */
  private createCharacter(): Character {
    const config = DEFAULT_CHARACTER_CONFIG;
    const initialPosition = new Vector3(0, config.physical.height / 2, 0);
    const character = new Character(this.scene, initialPosition, config);
    character.team = "ally";
    return character;
  }

  /**
   * Havok物理エンジンを非同期で初期化
   */
  private async initializePhysicsAsync(): Promise<void> {
    try {
      const physicsManager = PhysicsManager.getInstance();
      await physicsManager.initialize(this.scene);

      if (this.field) {
        this.field.initializePhysics();
      }

      if (this.ball) {
        this.ball.reinitializePhysics();
      }
    } catch (error) {
      console.error("[ShootCheckScene] Havok physics initialization failed:", error);
      throw new Error("Havok physics engine is required but failed to initialize");
    }
  }

  /**
   * レンダーループを開始
   */
  private startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - this.lastFrameTime) / 1000;
      this.lastFrameTime = currentTime;

      this.update(deltaTime);
      this.scene.render();
    });
  }

  /**
   * 更新処理
   */
  private update(deltaTime: number): void {
    // キャラクターの更新
    this.character.update(deltaTime);

    // ボールの更新
    this.ball.update(deltaTime);

    // フィールドの更新
    this.field.update(deltaTime);

    // シュートコントローラーの更新
    this.shootingController.update(deltaTime);

    // シュートチェックコントローラーの更新
    if (this.shootCheckController && this.isRunning) {
      this.shootCheckController.update(deltaTime);
    }

    // ゴール後のリセット処理
    if (this.pendingGoalReset) {
      this.goalResetTimer -= deltaTime;
      if (!this.ball.isInFlight() || this.goalResetTimer <= 0) {
        this.pendingGoalReset = false;
        // シュートチェック用：ゴール成功として通知
        // ShootCheckControllerが結果を処理する
      }
    }

    // カメラ追従
    this.updateCamera();
  }

  /**
   * カメラの追従更新
   */
  private updateCamera(): void {
    const characterPosition = this.character.getPosition();
    const followSpeed = CAMERA_CONFIG.followSpeed;

    this.camera.target.x +=
      (characterPosition.x - this.camera.target.x) * followSpeed;
    this.camera.target.y +=
      (characterPosition.y - this.camera.target.y) * followSpeed;
    this.camera.target.z +=
      (characterPosition.z - this.camera.target.z) * followSpeed;
  }

  /**
   * 選手データを設定
   */
  public setPlayerData(playerData: PlayerData, position: 'PG' | 'SG' | 'SF' | 'PF' | 'C' = 'SG'): void {
    this.character.setPlayerData(playerData, position);

    // 身長を反映
    const heightInMeters = playerData.basic.height / 100;
    this.character.setHeight(heightInMeters);
  }

  /**
   * シュートチェックを開始（全マスモード）
   */
  public startShootCheck(config: ShootCheckConfig): void {
    // キャラクターのチーム設定
    this.character.team = config.targetGoal === 'goal1' ? 'ally' : 'enemy';

    // シュートチェックコントローラーを作成
    this.shootCheckController = new ShootCheckController(
      this.character,
      this.ball,
      this.field,
      this.shootingController,
      config
    );

    this.isRunning = true;
    this.shootCheckController.start();
  }

  /**
   * 指定セルでシュートチェックを開始（単一セルモード）
   * @param config 設定
   * @param col 列（A-O）
   * @param row 行（1-30）
   */
  public startSingleCellCheck(config: ShootCheckConfig, col: string, row: number): void {
    // キャラクターのチーム設定
    this.character.team = config.targetGoal === 'goal1' ? 'ally' : 'enemy';

    // シュートチェックコントローラーを作成
    this.shootCheckController = new ShootCheckController(
      this.character,
      this.ball,
      this.field,
      this.shootingController,
      config
    );

    this.isRunning = true;
    this.shootCheckController.startSingleCell(col, row);
  }

  /**
   * シュートチェックを中断
   */
  public abortShootCheck(): void {
    if (this.shootCheckController) {
      this.shootCheckController.abort();
      this.isRunning = false;
    }
  }

  /**
   * シュートチェックを一時停止
   */
  public pauseShootCheck(): void {
    if (this.shootCheckController) {
      this.shootCheckController.pause();
    }
  }

  /**
   * シュートチェックを再開
   */
  public resumeShootCheck(): void {
    if (this.shootCheckController) {
      this.shootCheckController.resume();
    }
  }

  /**
   * 進捗コールバックを設定
   */
  public setOnProgressCallback(callback: (progress: ShootCheckProgress) => void): void {
    if (this.shootCheckController) {
      this.shootCheckController.setOnProgressCallback(callback);
    }
  }

  /**
   * 升目完了コールバックを設定
   */
  public setOnCellCompleteCallback(callback: (result: CellShootResult) => void): void {
    if (this.shootCheckController) {
      this.shootCheckController.setOnCellCompleteCallback(callback);
    }
  }

  /**
   * 完了コールバックを設定
   */
  public setOnCompleteCallback(callback: (results: CellShootResult[]) => void): void {
    if (this.shootCheckController) {
      this.shootCheckController.setOnCompleteCallback(callback);
    }
  }

  /**
   * シュートチェックコントローラーを取得
   */
  public getShootCheckController(): ShootCheckController | null {
    return this.shootCheckController;
  }

  /**
   * 結果を取得
   */
  public getResults(): CellShootResult[] {
    return this.shootCheckController?.getResults() ?? [];
  }

  /**
   * シーンを取得
   */
  public getScene(): Scene {
    return this.scene;
  }

  /**
   * エンジンを取得
   */
  public getEngine(): Engine {
    return this.engine;
  }

  /**
   * キャラクターを取得
   */
  public getCharacter(): Character {
    return this.character;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    if (this.shootCheckController) {
      this.shootCheckController.dispose();
    }
    this.shootingController.dispose();
    this.ball.dispose();
    this.character.dispose();
    this.field.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
