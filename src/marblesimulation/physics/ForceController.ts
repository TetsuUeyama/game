import { Vector3 } from "@babylonjs/core";
import {
  SimulationConfig,
  CourseType,
  StraightConfig,
  LateralShuttleConfig,
  CollisionConfig,
} from "../types/MarbleConfig";
import { MarbleEntry } from "./MarbleBody";

const STOP_THRESHOLD = 0.3;

/** 接地判定: ビー玉が地面に接しているか */
function isGrounded(entry: MarbleEntry, radius: number): boolean {
  return entry.mesh.position.y <= radius + 0.15;
}

// ─── 直線コース ───

enum StraightPhase { RACING, BRAKE, FINISHED }

class StraightController {
  private entries: MarbleEntry[];
  private config: StraightConfig;
  private radius: number;
  private onReset: () => void;
  private phases: StraightPhase[];
  private allFinished = false;
  private waitTimer = 0;

  constructor(entries: MarbleEntry[], config: StraightConfig, radius: number, onReset: () => void) {
    this.entries = entries;
    this.config = config;
    this.radius = radius;
    this.onReset = onReset;
    this.phases = entries.map(() => StraightPhase.RACING);
  }

  update(deltaTime: number): void {
    if (this.allFinished) {
      this.waitTimer += deltaTime;
      if (this.waitTimer >= this.config.waitDuration) {
        this.reset();
        this.onReset();
      }
      return;
    }

    let finishedCount = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const center = entry.aggregate.body.getObjectCenterWorld();
      const velocity = entry.aggregate.body.getLinearVelocity();
      const speed = velocity.length();

      switch (this.phases[i]) {
        case StraightPhase.RACING:
          if (entry.mesh.position.z >= this.config.goalDistance) {
            this.phases[i] = StraightPhase.BRAKE;
            break;
          }
          // 接地中のみ加速（空中では加速不可）
          if (speed < entry.preset.maxSpeed && isGrounded(entry, this.radius)) {
            entry.aggregate.body.applyForce(new Vector3(0, 0, entry.preset.accelerationPower), center);
          }
          break;

        case StraightPhase.BRAKE:
          if (speed < STOP_THRESHOLD) {
            this.phases[i] = StraightPhase.FINISHED;
            break;
          }
          entry.aggregate.body.applyForce(velocity.normalize().scale(-entry.preset.brakePower), center);
          break;

        case StraightPhase.FINISHED:
          finishedCount++;
          break;
      }
    }

    if (finishedCount >= this.entries.length) {
      this.allFinished = true;
      this.waitTimer = 0;
    }
  }

  reset(): void {
    this.phases = this.entries.map(() => StraightPhase.RACING);
    this.allFinished = false;
    this.waitTimer = 0;
  }
}

// ─── 反復横跳びコース ───

enum ShuttlePhase { SHUTTLING, FINISHED }

class LateralShuttleController {
  private entries: MarbleEntry[];
  private config: LateralShuttleConfig;
  private onReset: () => void;
  private phases: ShuttlePhase[];
  /** 各ビー玉の現在のターゲットX座標リスト（左右交互） */
  private targets: number[][];
  private targetIndices: number[];
  private allFinished = false;
  private waitTimer = 0;

  /** Z方向のドリフトを抑制する力 */
  private static readonly Z_DAMPING = 10;
  /** ターゲットX到達判定距離 */
  private static readonly ARRIVE_THRESHOLD = 0.8;
  /** 横方向の速度ダンピング（ターゲット近くでオーバーシュート防止） */
  private static readonly X_DAMPING = 5;

  private radius: number;

  constructor(entries: MarbleEntry[], config: LateralShuttleConfig, radius: number, onReset: () => void) {
    this.entries = entries;
    this.config = config;
    this.radius = radius;
    this.onReset = onReset;
    this.phases = entries.map(() => ShuttlePhase.SHUTTLING);
    this.targets = entries.map(e => this.generateTargets(e.laneX));
    this.targetIndices = entries.map(() => 0);
  }

  private generateTargets(laneX: number): number[] {
    const left = laneX - this.config.shuttleWidth;
    const right = laneX + this.config.shuttleWidth;
    const list: number[] = [];
    for (let r = 0; r < this.config.roundTrips; r++) {
      list.push(left, right);
    }
    list.push(laneX); // 最後に中央に戻る
    return list;
  }

  update(deltaTime: number): void {
    if (this.allFinished) {
      this.waitTimer += deltaTime;
      if (this.waitTimer >= this.config.waitDuration) {
        this.reset();
        this.onReset();
      }
      return;
    }

    let finishedCount = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const center = entry.aggregate.body.getObjectCenterWorld();
      const velocity = entry.aggregate.body.getLinearVelocity();

      switch (this.phases[i]) {
        case ShuttlePhase.SHUTTLING: {
          const ti = this.targetIndices[i];
          if (ti >= this.targets[i].length) {
            this.phases[i] = ShuttlePhase.FINISHED;
            break;
          }

          const targetX = this.targets[i][ti];
          const errorX = targetX - entry.mesh.position.x;

          // ターゲット到達判定
          if (Math.abs(errorX) < LateralShuttleController.ARRIVE_THRESHOLD) {
            this.targetIndices[i]++;
            break;
          }

          // 接地中のみ横方向の力（空中では加速不可）
          if (!isGrounded(entry, this.radius)) break;
          const xForce = Math.sign(errorX) * entry.preset.accelerationPower;
          entry.aggregate.body.applyForce(new Vector3(xForce, 0, 0), center);

          // X方向オーバーシュート抑制
          entry.aggregate.body.applyForce(
            new Vector3(-velocity.x * LateralShuttleController.X_DAMPING, 0, 0), center
          );

          // Z方向ドリフト抑制
          entry.aggregate.body.applyForce(
            new Vector3(0, 0, -velocity.z * LateralShuttleController.Z_DAMPING), center
          );
          break;
        }

        case ShuttlePhase.FINISHED:
          finishedCount++;
          break;
      }
    }

    if (finishedCount >= this.entries.length) {
      this.allFinished = true;
      this.waitTimer = 0;
    }
  }

  reset(): void {
    this.phases = this.entries.map(() => ShuttlePhase.SHUTTLING);
    this.targetIndices = this.entries.map(() => 0);
    this.allFinished = false;
    this.waitTimer = 0;
  }
}

// ─── 衝突実験コース ───

enum CollisionPhase { ACCEL, COAST, FINISHED }

class CollisionController {
  private entries: MarbleEntry[];
  private config: CollisionConfig;
  private onReset: () => void;
  private phases: CollisionPhase[];
  private midZ: number;
  private allFinished = false;
  private waitTimer = 0;

  private radius: number;

  constructor(entries: MarbleEntry[], config: CollisionConfig, radius: number, onReset: () => void) {
    this.entries = entries;
    this.config = config;
    this.radius = radius;
    this.onReset = onReset;
    this.midZ = config.startDistance / 2;
    this.phases = entries.map(() => CollisionPhase.ACCEL);
  }

  update(deltaTime: number): void {
    if (this.allFinished) {
      this.waitTimer += deltaTime;
      if (this.waitTimer >= this.config.waitDuration) {
        this.reset();
        this.onReset();
      }
      return;
    }

    let finishedCount = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const center = entry.aggregate.body.getObjectCenterWorld();
      const velocity = entry.aggregate.body.getLinearVelocity();
      const speed = velocity.length();

      // 手前 (startZ=0) → +Z方向、奥 (startZ>0) → -Z方向
      const direction = entry.startZ < this.midZ ? 1 : -1;

      switch (this.phases[i]) {
        case CollisionPhase.ACCEL: {
          // 中央を通過したらコースト
          const passedMid = direction > 0
            ? entry.mesh.position.z >= this.midZ
            : entry.mesh.position.z <= this.midZ;
          if (passedMid) {
            this.phases[i] = CollisionPhase.COAST;
            break;
          }

          // 接地中のみ加速（空中では加速不可）
          if (speed < entry.preset.maxSpeed && isGrounded(entry, this.radius)) {
            entry.aggregate.body.applyForce(
              new Vector3(0, 0, direction * entry.preset.accelerationPower), center
            );
          }
          break;
        }

        case CollisionPhase.COAST:
          if (speed < STOP_THRESHOLD) {
            this.phases[i] = CollisionPhase.FINISHED;
          }
          break;

        case CollisionPhase.FINISHED:
          finishedCount++;
          break;
      }
    }

    if (finishedCount >= this.entries.length) {
      this.allFinished = true;
      this.waitTimer = 0;
    }
  }

  reset(): void {
    this.phases = this.entries.map(() => CollisionPhase.ACCEL);
    this.allFinished = false;
    this.waitTimer = 0;
  }
}

// ─── 公開クラス: コースタイプに応じて内部コントローラーを切り替え ───

export class ForceController {
  private controller: { update(dt: number): void };
  private entries: MarbleEntry[];
  private radius: number;

  constructor(
    entries: MarbleEntry[],
    config: SimulationConfig,
    onReset: () => void,
  ) {
    this.entries = entries;
    this.radius = config.marble.radius;

    switch (config.courseType) {
      case CourseType.STRAIGHT:
        this.controller = new StraightController(entries, config.straight, this.radius, onReset);
        break;
      case CourseType.LATERAL_SHUTTLE:
        this.controller = new LateralShuttleController(entries, config.lateralShuttle, this.radius, onReset);
        break;
      case CourseType.COLLISION:
        this.controller = new CollisionController(entries, config.collision, this.radius, onReset);
        break;
    }
  }

  update(deltaTime: number): void {
    // 共通: バウンス処理（jumpPower > 0 のビー玉が着地したら上に跳ねる）
    for (const entry of this.entries) {
      if (entry.preset.jumpPower <= 0) continue;

      const nearGround = entry.mesh.position.y <= this.radius + 0.15;
      const vy = entry.aggregate.body.getLinearVelocity().y;

      if (nearGround && vy <= 0.1) {
        const center = entry.aggregate.body.getObjectCenterWorld();
        entry.aggregate.body.applyImpulse(
          new Vector3(0, entry.preset.jumpPower, 0), center
        );
      }
    }

    // コース固有の力
    this.controller.update(deltaTime);
  }

  dispose(): void {
    // nothing to clean up
  }
}
