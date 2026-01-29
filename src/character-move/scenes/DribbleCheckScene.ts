import {
  Scene,
  Engine,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
} from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Field } from "../entities/Field";
import { Ball } from "../entities/Ball";
import {
  DribbleCheckController,
  DribbleCheckConfig,
  DribbleCheckProgress,
  DribbleCheckResult,
} from "../controllers/check/DribbleCheckController";
import { FeintController } from "../controllers/action/FeintController";
import { ContestController } from "../controllers/ContestController";
import { CircleSizeController } from "../controllers/CircleSizeController";
import { OneOnOneBattleController } from "../controllers/action/OneOnOneBattleController";
import { DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { PlayerData } from "../types/PlayerData";
import { PhysicsManager } from "../../physics/PhysicsManager";
import { LIGHT_CONFIG } from "../config/gameConfig";
import { FieldGridUtils } from "../config/FieldGridConfig";

/**
 * ドリブルチェックモード用のシーン
 * ドリブラーとディフェンダーの1対1をテスト
 */
export class DribbleCheckScene {
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private field: Field;
  private ball: Ball;
  private dribbler: Character;
  private defender: Character;
  private dribbleCheckController: DribbleCheckController | null = null;

  // 試合モードと同じコントローラー
  private feintController: FeintController;
  private contestController: ContestController;
  private circleSizeController: CircleSizeController;
  private oneOnOneBattleController: OneOnOneBattleController;

  private lastFrameTime: number = Date.now();
  private isRunning: boolean = false;
  private targetMarker: Mesh | null = null;

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
    this.dribbler = this.createCharacter("dribbler", new Vector3(0, 0, 0));
    this.defender = this.createCharacter("defender", new Vector3(0, 0, 2));

    // 試合モードと同じコントローラーを初期化
    const getAllCharacters = () => [this.dribbler, this.defender];

    // 1on1バトルコントローラーの初期化
    this.oneOnOneBattleController = new OneOnOneBattleController(
      this.ball,
      getAllCharacters
    );

    // 競り合いコントローラーの初期化
    this.contestController = new ContestController(
      getAllCharacters,
      this.ball
    );

    // サークルサイズコントローラーの初期化
    this.circleSizeController = new CircleSizeController(
      getAllCharacters,
      this.ball
    );

    // フェイントコントローラーの初期化
    this.feintController = new FeintController(
      getAllCharacters,
      this.ball
    );

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
      20,
      Vector3.Zero(),
      this.scene
    );

    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 50;
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
  private createCharacter(name: string, position: Vector3): Character {
    const config = DEFAULT_CHARACTER_CONFIG;
    const initialPosition = new Vector3(position.x, config.physical.height / 2, position.z);
    const character = new Character(this.scene, initialPosition, config);
    character.team = name === "dribbler" ? "ally" : "enemy";
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
      console.error("[DribbleCheckScene] Havok physics initialization failed:", error);
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
    this.dribbler.update(deltaTime);
    this.defender.update(deltaTime);

    // ボールの更新
    this.ball.update(deltaTime);

    // フィールドの更新
    this.field.update(deltaTime);

    // 1on1バトルコントローラーの更新（ドリブル突破とAI移動）
    this.oneOnOneBattleController.updateDribbleBreakthrough(deltaTime);
    this.oneOnOneBattleController.update1on1Movement(deltaTime);

    // 競り合いコントローラーの更新（キャラクター同士の押し合い）
    this.contestController.update(deltaTime);

    // サークルサイズコントローラーの更新（状況に応じたサークルサイズ変更）
    this.circleSizeController.update(deltaTime);

    // ドリブルチェックコントローラーの更新
    if (this.dribbleCheckController && this.isRunning) {
      this.dribbleCheckController.update(deltaTime);
    }

    // カメラ追従（ドリブラーを追う）
    this.updateCamera();
  }

  /**
   * カメラの追従更新
   */
  private updateCamera(): void {
    const dribblerPosition = this.dribbler.getPosition();
    const followSpeed = 0.05;

    this.camera.target.x +=
      (dribblerPosition.x - this.camera.target.x) * followSpeed;
    this.camera.target.y +=
      (dribblerPosition.y - this.camera.target.y) * followSpeed;
    this.camera.target.z +=
      (dribblerPosition.z - this.camera.target.z) * followSpeed;
  }

  /**
   * ドリブラーの選手データを設定
   */
  public setDribblerData(playerData: PlayerData, position: 'PG' | 'SG' | 'SF' | 'PF' | 'C' = 'PG'): void {
    this.dribbler.setPlayerData(playerData, position);
    const heightInMeters = playerData.basic.height / 100;
    this.dribbler.setHeight(heightInMeters);
  }

  /**
   * ディフェンダーの選手データを設定
   */
  public setDefenderData(playerData: PlayerData, position: 'PG' | 'SG' | 'SF' | 'PF' | 'C' = 'PG'): void {
    this.defender.setPlayerData(playerData, position);
    const heightInMeters = playerData.basic.height / 100;
    this.defender.setHeight(heightInMeters);
  }

  /**
   * ドリブルチェックを開始
   */
  public startDribbleCheck(config: DribbleCheckConfig): void {
    // 目標マーカーを作成
    this.createTargetMarker(config.targetCell);

    // ドリブルチェックコントローラーを作成
    this.dribbleCheckController = new DribbleCheckController(
      this.dribbler,
      this.defender,
      this.ball,
      this.field,
      () => [this.dribbler, this.defender],
      config,
      this.feintController
    );

    this.isRunning = true;
    this.dribbleCheckController.start();
  }

  /**
   * 目標マーカーを作成
   */
  private createTargetMarker(targetCell: { col: string; row: number }): void {
    // 既存のマーカーを削除
    if (this.targetMarker) {
      this.targetMarker.dispose();
      this.targetMarker = null;
    }

    // 目標位置を計算
    const targetWorldPos = FieldGridUtils.cellToWorld(targetCell.col, targetCell.row);
    if (!targetWorldPos) return;

    // 円柱マーカーを作成（薄い円盤状）
    this.targetMarker = MeshBuilder.CreateCylinder(
      "targetMarker",
      {
        diameter: 1.5,
        height: 0.1,
        tessellation: 32,
      },
      this.scene
    );
    this.targetMarker.position = new Vector3(targetWorldPos.x, 0.05, targetWorldPos.z);

    // マテリアルを設定（緑色で半透明）
    const material = new StandardMaterial("targetMarkerMaterial", this.scene);
    material.diffuseColor = new Color3(0.2, 1.0, 0.2);
    material.emissiveColor = new Color3(0.1, 0.5, 0.1);
    material.alpha = 0.6;
    this.targetMarker.material = material;
  }

  /**
   * ドリブルチェックを中断
   */
  public abortDribbleCheck(): void {
    if (this.dribbleCheckController) {
      this.dribbleCheckController.abort();
      this.isRunning = false;
    }
  }

  /**
   * ドリブルチェックを一時停止
   */
  public pauseDribbleCheck(): void {
    if (this.dribbleCheckController) {
      this.dribbleCheckController.pause();
    }
  }

  /**
   * ドリブルチェックを再開
   */
  public resumeDribbleCheck(): void {
    if (this.dribbleCheckController) {
      this.dribbleCheckController.resume();
    }
  }

  /**
   * 進捗コールバックを設定
   */
  public setOnProgressCallback(callback: (progress: DribbleCheckProgress) => void): void {
    if (this.dribbleCheckController) {
      this.dribbleCheckController.setOnProgressCallback(callback);
    }
  }

  /**
   * 試行完了コールバックを設定
   */
  public setOnTrialCompleteCallback(callback: (result: DribbleCheckResult) => void): void {
    if (this.dribbleCheckController) {
      this.dribbleCheckController.setOnTrialCompleteCallback(callback);
    }
  }

  /**
   * 完了コールバックを設定
   */
  public setOnCompleteCallback(callback: (results: DribbleCheckResult[]) => void): void {
    if (this.dribbleCheckController) {
      this.dribbleCheckController.setOnCompleteCallback(callback);
    }
  }

  /**
   * ドリブルチェックコントローラーを取得
   */
  public getDribbleCheckController(): DribbleCheckController | null {
    return this.dribbleCheckController;
  }

  /**
   * 結果を取得
   */
  public getResults(): DribbleCheckResult[] {
    return this.dribbleCheckController?.getResults() ?? [];
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
   * ドリブラーを取得
   */
  public getDribbler(): Character {
    return this.dribbler;
  }

  /**
   * ディフェンダーを取得
   */
  public getDefender(): Character {
    return this.defender;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    if (this.dribbleCheckController) {
      this.dribbleCheckController.dispose();
    }
    if (this.targetMarker) {
      this.targetMarker.dispose();
    }
    this.ball.dispose();
    this.dribbler.dispose();
    this.defender.dispose();
    this.field.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
