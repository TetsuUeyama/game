import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
} from "@babylonjs/core";
import type { Character } from "./Character";

/**
 * バスケットボール半径（m）= 直径30cm
 */
const BALL_RADIUS = 0.15;

/**
 * 重力加速度（m/s²）
 */
const GRAVITY = 9.81;

/**
 * バウンド時の反発係数（エネルギー保存率）
 */
const BOUNCE_COEFFICIENT = 0.7;

/**
 * バウンドを停止する最小速度
 */
const MIN_BOUNCE_VELOCITY = 0.5;


/**
 * 3Dバスケットボールエンティティ
 */
export class Ball {
  private scene: Scene;
  public mesh: Mesh;
  private holder: Character | null = null; // ボールを保持しているキャラクター

  // 飛行中の状態管理
  private inFlight: boolean = false;
  private velocity: Vector3 = Vector3.Zero();
  private flightTime: number = 0;
  private targetPosition: Vector3 = Vector3.Zero(); // ゴールリング位置

  // シューターのクールダウン（シュート直後にシューター自身がキャッチしないようにする）
  private lastShooter: Character | null = null;
  private shooterCooldown: number = 0;
  private static readonly SHOOTER_COOLDOWN_TIME = 0.5; // 0.5秒間はシューターがキャッチ不可

  // ブロック後のオフェンスチームクールダウン（ブロック後はオフェンス側がキャッチできない）
  private blockedOffenseTeam: "ally" | "enemy" | null = null;
  private blockCooldown: number = 0;
  private static readonly BLOCK_COOLDOWN_TIME = 0.8; // 0.8秒間はオフェンス側がキャッチ不可

  // 最後にボールに触れた選手（アウトオブバウンズ判定用）
  private lastToucher: Character | null = null;

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.mesh = this.createBall(position);
  }

  /**
   * ボールメッシュを作成
   */
  private createBall(position: Vector3): Mesh {
    const ball = MeshBuilder.CreateSphere(
      "ball",
      {
        diameter: BALL_RADIUS * 2,
        segments: 32,
      },
      this.scene
    );

    ball.position = position;

    // マテリアル（オレンジ色のバスケットボール）
    const material = new StandardMaterial("ball-material", this.scene);
    material.diffuseColor = new Color3(1, 0.4, 0); // オレンジ
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    material.emissiveColor = new Color3(0.5, 0.2, 0); // より明るく光らせる
    ball.material = material;

    return ball;
  }

  /**
   * 位置を取得
   */
  getPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  /**
   * 位置を設定
   */
  setPosition(position: Vector3): void {
    // 保持中の場合は位置を直接設定できない
    if (this.holder) {
      return;
    }

    // ボールの最小Y座標（地面に接する高さ）
    // 球体の中心から底までの距離 = radius
    const minY = BALL_RADIUS;

    // Y座標が地面より下にならないように制限
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, minY),
      position.z
    );

    this.mesh.position = clampedPosition;
  }

  /**
   * ボールが保持されているかどうか
   */
  isHeld(): boolean {
    return this.holder !== null;
  }

  /**
   * ボールの保持者を設定
   */
  setHolder(character: Character | null): void {
    this.holder = character;

    // 保持者が設定された場合、最後に触れた選手として記録
    if (character !== null) {
      this.lastToucher = character;
    }

    // 保持者が設定された場合、飛行状態を終了
    if (character !== null && this.inFlight) {
      this.inFlight = false;
      this.velocity = Vector3.Zero();
    }
  }

  /**
   * ボールの保持者を取得
   */
  getHolder(): Character | null {
    return this.holder;
  }

  /**
   * 更新処理（保持中はキャラクターに追従、飛行中は軌道計算）
   */
  update(deltaTime: number): void {
    // シューターのクールダウンを減少
    if (this.shooterCooldown > 0) {
      this.shooterCooldown -= deltaTime;
      if (this.shooterCooldown <= 0) {
        this.lastShooter = null;
      }
    }

    if (this.holder) {
      // 保持者の設定されたボール保持位置を取得
      const ballHoldingPosition = this.holder.getBallHoldingPosition();

      // ボール保持位置に配置
      this.mesh.position = ballHoldingPosition;
    } else if (this.inFlight) {
      // 飛行中の軌道更新
      this.updateTrajectory(deltaTime);
    }
  }

  /**
   * シュートを開始
   * @param targetPosition ゴールリングの中心位置
   * @param launchAngle 発射角度（ラジアン、水平からの角度）デフォルト55度
   * @param overrideStartPosition 発射位置を指定（省略時は現在のボール位置）
   * @returns シュート開始できた場合true
   */
  public shoot(targetPosition: Vector3, launchAngle: number = Math.PI * 55 / 180, overrideStartPosition?: Vector3): boolean {
    if (this.inFlight) {
      return false;
    }

    // 保持者をクリア
    const previousHolder = this.holder;
    this.holder = null;

    // シュートした選手を最後に触れた選手として記録
    if (previousHolder) {
      this.lastToucher = previousHolder;
    }

    // 初期位置（指定された位置、または現在のボール位置）
    const startPosition = overrideStartPosition ? overrideStartPosition.clone() : this.mesh.position.clone();

    // ボールを発射位置に移動
    this.mesh.position = startPosition.clone();

    // ターゲット位置を保存
    this.targetPosition = targetPosition.clone();

    // 初速度を計算
    this.velocity = this.calculateInitialVelocity(startPosition, targetPosition, launchAngle);

    // 飛行開始
    this.inFlight = true;
    this.flightTime = 0;

    // シューターのクールダウンを設定（シュート直後にシューター自身がキャッチしないようにする）
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME;
    console.log(`[Ball] shoot: シュータークールダウン設定 - lastShooter: ${previousHolder?.playerData?.basic?.NAME}, cooldown: ${this.shooterCooldown}s`);

    return true;
  }

  /**
   * 軌道の更新処理
   */
  private updateTrajectory(deltaTime: number): void {
    if (!this.inFlight) return;

    this.flightTime += deltaTime;

    // 現在の位置
    const currentPos = this.mesh.position;

    // 速度を更新（重力適用）
    this.velocity.y -= GRAVITY * deltaTime;

    // 位置を更新
    const newPosition = new Vector3(
      currentPos.x + this.velocity.x * deltaTime,
      currentPos.y + this.velocity.y * deltaTime,
      currentPos.z + this.velocity.z * deltaTime
    );

    // 地面との衝突チェック（バウンド処理）
    if (newPosition.y <= BALL_RADIUS) {
      newPosition.y = BALL_RADIUS;

      // バウンド：Y速度を反転して減衰
      const bounceVelocityY = -this.velocity.y * BOUNCE_COEFFICIENT;

      // 速度が小さければバウンド終了
      if (Math.abs(bounceVelocityY) < MIN_BOUNCE_VELOCITY) {
        this.inFlight = false;
        this.velocity = Vector3.Zero();
      } else {
        // バウンド継続：Y速度を反転、XZ速度も少し減衰
        this.velocity.y = bounceVelocityY;
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;
      }
    }

    this.mesh.position = newPosition;

    // ゴール判定（リング通過）は別途ShootingControllerで行う
  }

  /**
   * 目標位置に到達するための初速度を計算
   * @param start 開始位置
   * @param target 目標位置
   * @param angle 発射角度（ラジアン）
   * @returns 初速度ベクトル
   */
  private calculateInitialVelocity(start: Vector3, target: Vector3, angle: number): Vector3 {
    // 水平距離（XZ平面）
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // 垂直距離
    const dy = target.y - start.y;

    // 発射角度のtan値
    const tanAngle = Math.tan(angle);
    const cosAngle = Math.cos(angle);

    // 初速度の大きさを計算
    // y = x * tan(θ) - (g * x²) / (2 * v₀² * cos²(θ))
    // 目標に到達するためのv₀を計算:
    // v₀² = (g * x²) / (2 * cos²(θ) * (x * tan(θ) - y))
    const numerator = GRAVITY * horizontalDistance * horizontalDistance;
    const denominator = 2 * cosAngle * cosAngle * (horizontalDistance * tanAngle - dy);

    // 分母が0以下の場合（物理的に到達不可能）、フォールバック値を使用
    let v0: number;
    if (denominator <= 0) {
      // フォールバック：単純な速度計算
      v0 = Math.sqrt(horizontalDistance * horizontalDistance + dy * dy) * 2;
    } else {
      v0 = Math.sqrt(numerator / denominator);
    }

    // 方向ベクトル（XZ平面）
    const directionXZ = new Vector3(dx, 0, dz).normalize();

    // 初速度の各成分
    const vHorizontal = v0 * cosAngle;
    const vVertical = v0 * Math.sin(angle);

    return new Vector3(
      directionXZ.x * vHorizontal,
      vVertical,
      directionXZ.z * vHorizontal
    );
  }

  /**
   * 飛行中かどうかを取得
   */
  public isInFlight(): boolean {
    return this.inFlight;
  }

  /**
   * 飛行を終了（外部から呼び出し用）
   */
  public endFlight(): void {
    this.inFlight = false;
    this.velocity = Vector3.Zero();
  }

  /**
   * パスを実行
   * @param targetPosition パス先の位置
   * @param targetCharacter パス先のキャラクター（オプション）
   * @returns パスが成功したかどうか
   */
  public pass(targetPosition: Vector3, targetCharacter?: Character): boolean {
    // 保持者がいない場合はパスできない
    if (!this.holder) {
      return false;
    }

    // 飛行中はパスできない
    if (this.inFlight) {
      return false;
    }

    const previousHolder = this.holder;

    // ボールの開始位置（パスする人の位置）
    const startPosition = this.mesh.position.clone();

    // 保持を解除
    this.holder = null;

    // パスは低い角度で直線的に投げる（約15度）
    const passAngle = Math.PI / 12; // 15度

    // 初速度を計算
    this.velocity = this.calculateInitialVelocity(startPosition, targetPosition, passAngle);

    // 飛行開始
    this.inFlight = true;
    this.flightTime = 0;

    // パスした人がすぐにキャッチしないようにクールダウン設定
    this.lastShooter = previousHolder;
    this.shooterCooldown = Ball.SHOOTER_COOLDOWN_TIME * 0.5; // パスは短めのクールダウン

    console.log(`[Ball] パス実行: ${previousHolder.team} -> ${targetCharacter?.team ?? 'unknown'}`);

    return true;
  }

  /**
   * 現在の速度を取得
   */
  public getVelocity(): Vector3 {
    return this.velocity.clone();
  }

  /**
   * 速度を設定
   */
  public setVelocity(velocity: Vector3): void {
    this.velocity = velocity.clone();
  }

  /**
   * ボールの半径を取得
   */
  public getRadius(): number {
    return BALL_RADIUS;
  }

  /**
   * 指定したキャラクターがボールをキャッチできるかどうか
   * シュート直後はシューター自身がキャッチできない
   */
  public canBeCaughtBy(character: Character): boolean {
    // シューターのクールダウン中は、シューター自身はキャッチできない
    if (this.lastShooter === character && this.shooterCooldown > 0) {
      console.log(`[Ball] canBeCaughtBy: ${character.playerData?.basic?.NAME} -> false (シュータークールダウン中: ${this.shooterCooldown.toFixed(2)}s)`);
      return false;
    }
    // デバッグ: lastShooterが設定されているか確認
    if (this.lastShooter !== null) {
      console.log(`[Ball] canBeCaughtBy: ${character.playerData?.basic?.NAME} -> true (lastShooter: ${this.lastShooter?.playerData?.basic?.NAME}, cooldown: ${this.shooterCooldown.toFixed(2)}s)`);
    }
    return true;
  }

  /**
   * 最後にボールに触れた選手を取得
   */
  public getLastToucher(): Character | null {
    return this.lastToucher;
  }

  /**
   * 最後にボールに触れた選手をリセット
   */
  public clearLastToucher(): void {
    this.lastToucher = null;
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.mesh.dispose();
  }
}
