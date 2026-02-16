/**
 * カメラエンティティ
 * カメラプリセット定義・ファクトリメソッド・CameraManagerを集約
 */

import { ArcRotateCamera, FreeCamera, Scene, Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";

// ========== 型定義 ==========

export interface ArcRotateCameraPreset {
  alpha: number;
  beta: number;
  radius: number;
  target: { x: number; y: number; z: number };
  lowerRadiusLimit: number;
  upperRadiusLimit: number;
  lowerBetaLimit?: number;
  upperBetaLimit?: number;
}

export interface FreeCameraPreset {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface FaceCamConfig {
  targetY: number;
  radius: number;
  alpha: number;
  beta: number;
}

// ========== カメラプリセット定数 ==========

export const CAMERA_PRESETS = {
  /** バスケゲーム本体 */
  game: {
    alpha: -Math.PI / 2,
    beta: Math.PI / 3,
    radius: 10,
    target: { x: 0, y: 0, z: 0 },
    lowerRadiusLimit: 3,
    upperRadiusLimit: 30,
    lowerBetaLimit: 0.1,
    upperBetaLimit: Math.PI / 2.2,
  } as ArcRotateCameraPreset,

  /** Humanoidモーションエディタ — 通常ビュー */
  humanoidNormal: {
    alpha: -Math.PI / 2,
    beta: Math.PI / 3,
    radius: 5,
    target: { x: 0, y: 1, z: 0 },
    lowerRadiusLimit: 0.1,
    upperRadiusLimit: 30,
  } as ArcRotateCameraPreset,

  /** Humanoid — 顔アップ初期値 */
  humanoidFace: {
    targetY: 1.6,
    radius: 1.26,
    alpha: -Math.PI / 2,
    beta: Math.PI / 2,
  } as FaceCamConfig,

  /** MarbleSimulation コース別 */
  marble: {
    common: { lowerRadiusLimit: 10, upperRadiusLimit: 120 },
    straight: (goalDistance: number): ArcRotateCameraPreset => ({
      alpha: -Math.PI / 2,
      beta: Math.PI / 3.5,
      radius: 50,
      target: { x: 0, y: 0, z: goalDistance / 2 },
      lowerRadiusLimit: 10,
      upperRadiusLimit: 120,
    }),
    lateralShuttle: {
      alpha: -Math.PI / 2,
      beta: Math.PI / 4,
      radius: 30,
      target: { x: 0, y: 0, z: 5 },
      lowerRadiusLimit: 10,
      upperRadiusLimit: 120,
    } as ArcRotateCameraPreset,
    collision: (startDistance: number): ArcRotateCameraPreset => ({
      alpha: -Math.PI / 2,
      beta: Math.PI / 3.5,
      radius: 40,
      target: { x: 0, y: 0, z: startDistance / 2 },
      lowerRadiusLimit: 10,
      upperRadiusLimit: 120,
    }),
    random: {
      alpha: -Math.PI / 4,
      beta: Math.PI / 3,
      radius: 20,
      target: { x: 0, y: 0, z: 0 },
      lowerRadiusLimit: 10,
      upperRadiusLimit: 120,
    } as ArcRotateCameraPreset,
  },

  /** FallingPointPrediction (FreeCamera) */
  fallingPoint: {
    position: { x: 4, y: 4, z: -5 },
    target: { x: 0, y: 2.05, z: -0.4 },
  } as FreeCameraPreset,
} as const;

// ========== カメラ動作設定（旧CAMERA_CONFIG） ==========

export const CAMERA_BEHAVIOR = {
  fov: 60,
  minZ: 0.1,
  maxZ: 1000,
  offset: { x: 0, y: 5, z: -8 },
  followSpeed: 0.1,
} as const;

// ========== Cameraクラス（staticファクトリ） ==========

export class Camera {
  /**
   * ArcRotateCameraをプリセットから生成
   */
  static createArcRotateCamera(
    name: string,
    preset: ArcRotateCameraPreset,
    scene: Scene,
    canvas: HTMLCanvasElement,
  ): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      name,
      preset.alpha,
      preset.beta,
      preset.radius,
      new Vector3(preset.target.x, preset.target.y, preset.target.z),
      scene,
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = preset.lowerRadiusLimit;
    camera.upperRadiusLimit = preset.upperRadiusLimit;
    if (preset.lowerBetaLimit !== undefined) {
      camera.lowerBetaLimit = preset.lowerBetaLimit;
    }
    if (preset.upperBetaLimit !== undefined) {
      camera.upperBetaLimit = preset.upperBetaLimit;
    }
    return camera;
  }

  /**
   * FreeCameraをプリセットから生成
   */
  static createFreeCamera(
    name: string,
    preset: FreeCameraPreset,
    scene: Scene,
    canvas: HTMLCanvasElement,
  ): FreeCamera {
    const camera = new FreeCamera(
      name,
      new Vector3(preset.position.x, preset.position.y, preset.position.z),
      scene,
    );
    camera.setTarget(
      new Vector3(preset.target.x, preset.target.y, preset.target.z),
    );
    camera.attachControl(canvas, true);
    return camera;
  }

  /**
   * バスケゲーム用カメラを生成
   */
  static createGameCamera(
    scene: Scene,
    canvas: HTMLCanvasElement,
  ): ArcRotateCamera {
    return Camera.createArcRotateCamera(
      "camera",
      CAMERA_PRESETS.game,
      scene,
      canvas,
    );
  }

  /**
   * Humanoidモーションエディタ用カメラを生成
   */
  static createHumanoidCamera(
    scene: Scene,
    canvas: HTMLCanvasElement,
  ): ArcRotateCamera {
    return Camera.createArcRotateCamera(
      "cam",
      CAMERA_PRESETS.humanoidNormal,
      scene,
      canvas,
    );
  }

  /**
   * MarbleSimulation用カメラを生成（courseTypeで分岐）
   */
  static createMarbleCamera(
    courseType: string,
    scene: Scene,
    canvas: HTMLCanvasElement,
    options?: { goalDistance?: number; startDistance?: number },
  ): ArcRotateCamera {
    let preset: ArcRotateCameraPreset;
    switch (courseType) {
      case "straight":
        preset = CAMERA_PRESETS.marble.straight(options?.goalDistance ?? 100);
        break;
      case "lateralShuttle":
        preset = CAMERA_PRESETS.marble.lateralShuttle;
        break;
      case "collision":
        preset = CAMERA_PRESETS.marble.collision(
          options?.startDistance ?? 20,
        );
        break;
      case "random":
        preset = CAMERA_PRESETS.marble.random;
        break;
      default:
        preset = CAMERA_PRESETS.marble.random;
        break;
    }
    return Camera.createArcRotateCamera("cam", preset, scene, canvas);
  }

  /**
   * FallingPointPrediction用カメラを生成
   */
  static createFallingPointCamera(
    scene: Scene,
    canvas: HTMLCanvasElement,
  ): FreeCamera {
    return Camera.createFreeCamera(
      "camera",
      CAMERA_PRESETS.fallingPoint,
      scene,
      canvas,
    );
  }
}

// ========== CameraManager ==========

/**
 * カメラマネージャー用コンテキスト
 */
export interface CameraManagerContext {
  camera: ArcRotateCamera;
  ball: Ball;
  getAllyCharacters: () => Character[];
  getEnemyCharacters: () => Character[];
}

/**
 * カメラマネージャー
 * カメラの追従、ターゲット切り替え、モード管理を担当
 */
export class CameraManager {
  private context: CameraManagerContext;

  // カメラモード（on_ball: オンボールプレイヤー自動追従, manual: 手動選択）
  private cameraMode: "on_ball" | "manual" = "on_ball";

  // カメラターゲット切り替え用
  private currentTargetTeam: "ally" | "enemy" = "ally";
  private currentTargetIndex: number = 0;

  constructor(context: CameraManagerContext) {
    this.context = context;
  }

  /**
   * カメラの追従更新
   */
  public update(_deltaTime: number): void {
    const targetCharacter = this.getCurrentTargetCharacter();
    if (!targetCharacter) return;

    const characterPosition = targetCharacter.getPosition();
    const followSpeed = CAMERA_BEHAVIOR.followSpeed;

    this.context.camera.target.x +=
      (characterPosition.x - this.context.camera.target.x) * followSpeed;
    this.context.camera.target.y +=
      (characterPosition.y - this.context.camera.target.y) * followSpeed;
    this.context.camera.target.z +=
      (characterPosition.z - this.context.camera.target.z) * followSpeed;
  }

  /**
   * 現在のターゲットキャラクターを取得
   */
  public getCurrentTargetCharacter(): Character | null {
    const allyCharacters = this.context.getAllyCharacters();
    const enemyCharacters = this.context.getEnemyCharacters();

    // オンボールモードの場合、ボール保持者を返す
    if (this.cameraMode === "on_ball") {
      const holder = this.context.ball.getHolder();
      if (holder) {
        return holder;
      }
      // ボール保持者がいない場合はボールに最も近いキャラクターを返す
      const ballPos = this.context.ball.getPosition();
      let closestChar: Character | null = null;
      let closestDist = Infinity;
      for (const char of [...allyCharacters, ...enemyCharacters]) {
        const dist = Vector3.Distance(char.getPosition(), ballPos);
        if (dist < closestDist) {
          closestDist = dist;
          closestChar = char;
        }
      }
      return closestChar;
    }

    // マニュアルモードの場合、選択されたキャラクターを返す
    const characters =
      this.currentTargetTeam === "ally" ? allyCharacters : enemyCharacters;
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
    const characters =
      this.currentTargetTeam === "ally"
        ? this.context.getAllyCharacters()
        : this.context.getEnemyCharacters();
    if (characters.length === 0) return;

    this.currentTargetIndex =
      (this.currentTargetIndex + 1) % characters.length;
  }

  /**
   * カメラターゲットを前のキャラクターに切り替え
   */
  public switchToPreviousCharacter(): void {
    const characters =
      this.currentTargetTeam === "ally"
        ? this.context.getAllyCharacters()
        : this.context.getEnemyCharacters();
    if (characters.length === 0) return;

    this.currentTargetIndex =
      (this.currentTargetIndex - 1 + characters.length) % characters.length;
  }

  /**
   * カメラターゲットのチームを切り替え
   */
  public switchTeam(): void {
    this.currentTargetTeam =
      this.currentTargetTeam === "ally" ? "enemy" : "ally";
    this.currentTargetIndex = 0;
  }

  /**
   * 現在のターゲット情報を取得
   */
  public getCurrentTargetInfo(): {
    team: "ally" | "enemy";
    index: number;
    character: Character | null;
    cameraMode: "on_ball" | "manual";
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
  public setCameraMode(mode: "on_ball" | "manual"): void {
    this.cameraMode = mode;
  }

  /**
   * カメラモードを取得
   */
  public getCameraMode(): "on_ball" | "manual" {
    return this.cameraMode;
  }
}
