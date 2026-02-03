# プロジェクト改善計画書

作成日: 2026-02-03

---

## 目次

1. [概要](#概要)
2. [構造的問題と改善案](#構造的問題と改善案)
3. [挙動バグと修正案](#挙動バグと修正案)
4. [実装優先順位](#実装優先順位)
5. [影響ファイル一覧](#影響ファイル一覧)

---

## 概要

本ドキュメントは、3Dバスケットボールシミュレーションゲームプロジェクトの改善計画をまとめたものです。
構造的な問題点の解消と、挙動バグの修正を段階的に実施します。

---

## 構造的問題と改善案

### 1. God Class の分割

#### 1.1 GameScene.ts (2902行) の分割

**現状の問題**:
- 単一クラスで全ゲームロジックを管理
- テストが困難
- 変更時の影響範囲が広い

**分割案**:

```
GameScene.ts (2902行)
    ↓ 分割
├── GameScene.ts (約800行) - シーン初期化、ゲームループ、カメラ
├── GameStateManager.ts (約400行) - ゲーム状態、スコア、勝敗判定
├── ThrowInManager.ts (約300行) - スローイン実行、状態管理
├── TeamManager.ts (約300行) - チーム生成、キャラクター管理
├── GameModeManager.ts (約200行) - モード切り替え、検証モード
└── GameEventDispatcher.ts (約200行) - イベント発行、コールバック管理
```

**具体的な責務分離**:

| 新クラス | 責務 | 移動するメソッド |
|---------|------|-----------------|
| GameStateManager | スコア管理、勝敗判定、ゲーム状態 | `updateScore()`, `checkWinCondition()`, `resetGame()` |
| ThrowInManager | スローイン実行、位置計算、状態クリア | `executeThrowIn()`, `executeThrowInReset()`, `clearAllThrowInCharacterStates()` |
| TeamManager | チーム生成、キャラクター配置 | `createTeams()`, `applyTeamPositions()`, `getCharactersByTeam()` |
| GameModeManager | モード切り替え、検証モード管理 | `setGameMode()`, `enterShootCheckMode()`, `enterPassCheckMode()` |
| GameEventDispatcher | イベント発行、コールバック | `onGoal()`, `onOutOfBounds()`, `onBallCatch()` |

---

#### 1.2 Character.ts (2410行) の分割

**現状の問題**:
- 30個以上のメッシュプロパティ
- 物理演算、状態管理、AI制御が混在
- 単一責任の原則に違反

**分割案**:

```
Character.ts (2410行)
    ↓ 分割
├── Character.ts (約600行) - 基本プロパティ、状態管理、公開API
├── CharacterMeshManager.ts (約500行) - メッシュ生成、更新、削除
├── CharacterPhysicsManager.ts (約400行) - 物理演算、衝突、重心
├── CharacterMotionManager.ts (約400行) - モーション再生、遷移
├── CharacterStateManager.ts (約300行) - 状態遷移、フラグ管理
└── CharacterBallHandler.ts (約200行) - ボール保持、位置計算
```

**具体的な責務分離**:

| 新クラス | 責務 | 移動するプロパティ/メソッド |
|---------|------|---------------------------|
| CharacterMeshManager | メッシュ生成・管理 | `headMesh`, `upperBodyMesh`, `createBodyParts()`, `updateMeshPositions()` |
| CharacterPhysicsManager | 物理演算 | `physicsAggregate`, `applyForce()`, `getVelocity()` |
| CharacterMotionManager | モーション制御 | `currentMotion`, `playMotion()`, `updateMotion()` |
| CharacterStateManager | 状態管理 | `state`, `advantageStatus`, `setState()`, `getState()` |
| CharacterBallHandler | ボール処理 | `ballHoldingPosition`, `updateBallPosition()`, `releaseBall()` |

---

### 2. 重複コードの統合

#### 2.1 ThrowIn系AIクラスの統合

**現状の問題**:
```
ThrowInThrowerAI.ts   (115行) - 重複多数
ThrowInReceiverAI.ts  (87行)  - 重複多数
ThrowInOtherAI.ts     (115行) - 重複多数
```

**改善案**: 基底クラスにテンプレートパターンを適用

```typescript
// 新規: ThrowInBaseAI.ts
export abstract class ThrowInBaseAI extends BaseStateAI {
  protected throwInPosition: Vector3 | null = null;

  // 共通処理: 位置への移動と向き調整
  protected moveToPositionAndFace(targetPosition: Vector3, deltaTime: number): void {
    const myPos = this.character.getPosition();
    const distance = Vector3.Distance(myPos, targetPosition);

    if (distance > 0.5) {
      this.moveTowards(targetPosition, deltaTime);
    } else {
      this.character.stopMovement();
      this.character.playMotion(IDLE_MOTION);
      this.faceTowards(targetPosition);
    }
  }

  // 共通処理: 方向を向く
  protected faceTowards(targetPosition: Vector3): void {
    const myPos = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - myPos.x,
      0,
      targetPosition.z - myPos.z
    );
    const angle = Math.atan2(direction.x, direction.z);
    this.character.setRotation(angle);
  }

  // サブクラスで実装
  abstract update(deltaTime: number): void;
  abstract setThrowInPosition(position: Vector3): void;
}

// ThrowInThrowerAI.ts - 簡素化
export class ThrowInThrowerAI extends ThrowInBaseAI {
  update(deltaTime: number): void {
    if (this.throwInPosition) {
      this.moveToPositionAndFace(this.throwInPosition, deltaTime);
    }
  }
}

// ThrowInReceiverAI.ts - 簡素化
export class ThrowInReceiverAI extends ThrowInBaseAI {
  update(deltaTime: number): void {
    if (this.throwInPosition) {
      this.moveToPositionAndFace(this.throwInPosition, deltaTime);
      this.faceTowards(this.ball.getPosition());
    }
  }
}

// ThrowInOtherAI.ts - 簡素化
export class ThrowInOtherAI extends ThrowInBaseAI {
  update(deltaTime: number): void {
    const formationPos = this.getFormationPosition();
    if (formationPos) {
      this.moveToPositionAndFace(formationPos, deltaTime);
    }
  }
}
```

---

### 3. マジックナンバーの設定化

#### 3.1 新規設定ファイル: GameConstants.ts

**現状の問題**: 複数ファイルにハードコードされた値が散在

```typescript
// BaseStateAI.ts
const isDashing = distance > 5.0;    // ハードコード
const isRunning = distance > 2.0;    // ハードコード

// CollisionHandler.ts
Math.abs(deflectDirection.y) + 0.3   // ハードコード

// InterceptionAnalyzer.ts
if (minTimeDiff <= -0.3) { ... }     // 複数のハードコード
```

**改善案**: 統合設定ファイルの作成

```typescript
// 新規: src/character-move/config/GameConstants.ts

export const MOVEMENT_CONSTANTS = {
  // 移動判定しきい値
  DASH_DISTANCE_THRESHOLD: 5.0,      // ダッシュ開始距離 (m)
  RUN_DISTANCE_THRESHOLD: 2.0,       // 走り開始距離 (m)
  WALK_DISTANCE_THRESHOLD: 0.5,      // 歩き開始距離 (m)
  STOP_DISTANCE_THRESHOLD: 0.3,      // 停止距離 (m)
} as const;

export const COLLISION_CONSTANTS = {
  // 衝突判定
  DEFLECTION_Y_OFFSET: 0.3,          // 弾き方向のY軸オフセット
  CHARACTER_PUSH_FORCE: 2.0,         // キャラクター押し出し力
  BALL_DEFLECTION_FORCE: 5.0,        // ボール弾き力
} as const;

export const INTERCEPTION_CONSTANTS = {
  // インターセプト確率計算
  TIME_DIFF_HIGH_THRESHOLD: -0.3,    // 高確率しきい値
  TIME_DIFF_MED_THRESHOLD: 0.2,      // 中確率しきい値
  TIME_DIFF_LOW_THRESHOLD: 0.5,      // 低確率しきい値
  PROBABILITY_HIGH: 0.9,             // 高確率
  PROBABILITY_MED: 0.3,              // 中確率
  PROBABILITY_LOW: 0.1,              // 低確率
} as const;

export const THROW_IN_CONSTANTS = {
  // スローイン
  THROWER_COOLDOWN_FRAMES: 30,       // スロワー衝突無視フレーム数
  RECEIVER_CATCH_RADIUS: 1.5,        // レシーバーキャッチ半径 (m)
  PREPARATION_TIME: 3.0,             // スローイン準備時間 (秒)
} as const;

export const AI_CONSTANTS = {
  // AI判定
  LOOSE_BALL_CHASE_RADIUS: 10.0,     // ルーズボール追跡半径 (m)
  PASS_DECISION_DELAY: 0.5,          // パス判定ディレイ (秒)
  SHOOT_DECISION_DELAY: 0.3,         // シュート判定ディレイ (秒)
} as const;
```

---

### 4. 依存性注入（DI）パターンの導入

#### 4.1 サービスロケーターの導入

**現状の問題**: 手動で全依存性を注入、setterが乱立

```typescript
// 現状: GameScene.ts
const ai = new CharacterAI(character, this.ball, allCharacters, this.field);
ai.setShootingController(shootingController);
ai.setFeintController(feintController);
ai.setPassCallback(passCallback);
// ... 10個以上のsetter
```

**改善案**: サービスコンテナの導入

```typescript
// 新規: src/character-move/core/ServiceContainer.ts

export interface GameServices {
  ball: Ball;
  field: Field;
  characters: Character[];
  shootingController: ShootingController;
  feintController: FeintController;
  collisionHandler: CollisionHandler;
  gameStateManager: GameStateManager;
  throwInManager: ThrowInManager;
}

export class ServiceContainer {
  private static instance: ServiceContainer;
  private services: Partial<GameServices> = {};

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  register<K extends keyof GameServices>(key: K, service: GameServices[K]): void {
    this.services[key] = service;
  }

  get<K extends keyof GameServices>(key: K): GameServices[K] {
    const service = this.services[key];
    if (!service) {
      throw new Error(`Service not registered: ${key}`);
    }
    return service as GameServices[K];
  }

  reset(): void {
    this.services = {};
  }
}

// 使用例: CharacterAI.ts
export class CharacterAI {
  private services: ServiceContainer;

  constructor(character: Character) {
    this.character = character;
    this.services = ServiceContainer.getInstance();
    this.ball = this.services.get('ball');
    this.field = this.services.get('field');
    // ... 他の依存性も自動取得
  }
}
```

---

### 5. console.log の削除とロギングフレームワーク導入

**現状の問題**: 13個以上のconsole.logが本番コードに残存

**改善案**: ロガーユーティリティの導入

```typescript
// 新規: src/character-move/utils/Logger.ts

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

class Logger {
  private static level: LogLevel = LogLevel.WARN; // 本番はWARN以上のみ

  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }

  static debug(category: string, message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.DEBUG) {
      console.log(`[${category}] ${message}`, ...args);
    }
  }

  static info(category: string, message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.INFO) {
      console.info(`[${category}] ${message}`, ...args);
    }
  }

  static warn(category: string, message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.WARN) {
      console.warn(`[${category}] ${message}`, ...args);
    }
  }

  static error(category: string, message: string, ...args: unknown[]): void {
    if (Logger.level <= LogLevel.ERROR) {
      console.error(`[${category}] ${message}`, ...args);
    }
  }
}

export { Logger };

// 使用例
// 変更前: console.log(`[CharacterAI] 状態遷移: ${oldState} -> ${newState}`);
// 変更後: Logger.debug('CharacterAI', `状態遷移: ${oldState} -> ${newState}`);
```

---

### 6. パフォーマンス最適化

#### 6.1 衝突判定の空間分割

**現状の問題**: O(n²)の衝突判定が毎フレーム実行

```typescript
// CollisionHandler.ts - 現状
for (let i = 0; i < this.allCharacters.length; i++) {
  for (let j = i + 1; j < this.allCharacters.length; j++) {
    this.resolveCharacterCharacterCollision(...);
  }
}
```

**改善案**: グリッドベースの空間分割

```typescript
// 新規: src/character-move/utils/SpatialGrid.ts

export class SpatialGrid<T extends { getPosition(): Vector3 }> {
  private grid: Map<string, T[]> = new Map();
  private cellSize: number;

  constructor(cellSize: number = 5.0) {
    this.cellSize = cellSize;
  }

  private getCellKey(position: Vector3): string {
    const x = Math.floor(position.x / this.cellSize);
    const z = Math.floor(position.z / this.cellSize);
    return `${x},${z}`;
  }

  update(entities: T[]): void {
    this.grid.clear();
    for (const entity of entities) {
      const key = this.getCellKey(entity.getPosition());
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key)!.push(entity);
    }
  }

  getNearbyEntities(position: Vector3): T[] {
    const nearby: T[] = [];
    const centerKey = this.getCellKey(position);
    const [cx, cz] = centerKey.split(',').map(Number);

    // 周囲9セルをチェック
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        const entities = this.grid.get(key);
        if (entities) {
          nearby.push(...entities);
        }
      }
    }
    return nearby;
  }
}

// CollisionHandler.ts での使用
private spatialGrid = new SpatialGrid<Character>(5.0);

update(deltaTime: number): void {
  this.spatialGrid.update(this.allCharacters);

  for (const character of this.allCharacters) {
    const nearby = this.spatialGrid.getNearbyEntities(character.getPosition());
    for (const other of nearby) {
      if (character !== other) {
        this.resolveCharacterCharacterCollision(character, other);
      }
    }
  }
}
```

---

## 挙動バグと修正案

### バグ1: スローワーが自分の投げたボールにぶつかる

#### 原因分析

1. `executeThrowIn()` でスロワーの位置を再設定
2. `ball.passWithArc()` でパス実行
3. ボール位置がスロワーのボール保持位置に設定される
4. `CollisionHandler` でスロワーとボールの衝突判定が発生
5. `canBeCaughtBy()` にスロワー除外処理がない

#### 修正案

**修正1: Ball.ts にパス送信者の除外処理を追加**

```typescript
// Ball.ts

// 新規プロパティ
private lastPasser: Character | null = null;
private passerCooldown: number = 0;
private readonly PASSER_COOLDOWN_FRAMES = 30; // 約0.5秒

// canBeCaughtBy() の修正
public canBeCaughtBy(character: Character): boolean {
  // 弾き後のクールダウン
  if (this.deflectionCooldown > 0) return false;

  // シュータークールダウン
  if (this.lastShooter === character && this.shooterCooldown > 0) return false;

  // 【新規】パス送信者クールダウン
  if (this.lastPasser === character && this.passerCooldown > 0) return false;

  return true;
}

// passWithArc() の修正
public passWithArc(...): boolean {
  // 既存の処理...

  // 【新規】パス送信者を記録
  this.lastPasser = this.holder;
  this.passerCooldown = this.PASSER_COOLDOWN_FRAMES;

  // 既存の処理...
}

// update() の修正
public update(deltaTime: number): void {
  // 既存の処理...

  // 【新規】パス送信者クールダウン減少
  if (this.passerCooldown > 0) {
    this.passerCooldown--;
  }

  // 既存の処理...
}
```

**修正2: CollisionHandler.ts でスロワー状態の除外**

```typescript
// CollisionHandler.ts - resolveBallCharacterCollision()

private resolveBallCharacterCollision(character: Character): void {
  // 【新規】スロワー状態の選手は衝突判定をスキップ
  if (character.getState() === CharacterState.THROW_IN_THROWER) {
    return;
  }

  // 既存の処理...
  if (!this.ball.canBeCaughtBy(character)) {
    return;
  }

  // 既存の処理...
}
```

---

### バグ2: ルーズボール/スローイン受け取り後の選手が動かない

#### 原因分析

1. スローインレシーバーがボールをキャッチ
2. `CollisionHandler.updateCharacterStates()` で状態チェック
3. 「スローイン状態の選手がいる」→ 状態更新をスキップ
4. レシーバーは `THROW_IN_RECEIVER` のまま
5. `ThrowInReceiverAI.update()` が呼ばれ続ける（移動しない）

#### 修正案

**修正1: CollisionHandler.ts でスローイン状態のクリア処理を追加**

```typescript
// CollisionHandler.ts

// 新規メソッド: スローイン状態をクリア
private clearThrowInStates(): void {
  for (const character of this.allCharacters) {
    const state = character.getState();
    if (state === CharacterState.THROW_IN_THROWER ||
        state === CharacterState.THROW_IN_RECEIVER ||
        state === CharacterState.THROW_IN_OTHER) {
      // アイドル状態に戻す（後でupdateCharacterStates()が適切な状態に更新）
      character.setState(CharacterState.IDLE);
    }
  }
}

// updateCharacterStates() の修正
public updateCharacterStates(): void {
  const holder = this.ball.getHolder();

  // 【修正】スローインレシーバーがボールをキャッチした場合、状態をクリア
  if (holder) {
    const holderState = holder.getState();
    if (holderState === CharacterState.THROW_IN_RECEIVER) {
      this.clearThrowInStates();
      // 状態クリア後、通常の状態更新を続行
    } else if (holderState === CharacterState.THROW_IN_THROWER) {
      // スロワーがまだボールを持っている場合は更新しない
      return;
    }
  }

  // 【修正】スローイン状態チェックを削除（上で処理済み）
  // const hasThrowInState = ... // 削除

  // 既存の状態更新処理...
  for (const character of this.allCharacters) {
    // 攻撃/防御状態の設定...
  }
}
```

**修正2: GameScene.ts でのコールバック設定**

```typescript
// GameScene.ts

// Ball のキャッチコールバックを設定
private setupBallCallbacks(): void {
  this.ball.setOnCatchCallback((catcher: Character) => {
    // スローインレシーバーがキャッチした場合
    if (catcher.getState() === CharacterState.THROW_IN_RECEIVER) {
      this.clearAllThrowInCharacterStates();
      this.isThrowInProgress = false;
    }
  });
}
```

**修正3: LooseBallAI.ts の移動ロジック確認**

```typescript
// LooseBallAI.ts - update() の修正

public update(deltaTime: number): void {
  // ボールが保持されている場合は何もしない
  if (this.ball.getHolder()) {
    return;
  }

  // ボールが飛行中の場合
  if (this.ball.isInFlight()) {
    // パスターゲットでない場合のみ追跡
    if (!this.ball.isPassTargetOf(this.character)) {
      this.moveTowardsBall(deltaTime);
    }
    return;
  }

  // ルーズボール状態
  this.moveTowardsBall(deltaTime);
}

// moveTowardsBall() の修正
private moveTowardsBall(deltaTime: number): void {
  const ballPos = this.ball.getPosition();
  const myPos = this.character.getPosition();
  const distance = Vector3.Distance(myPos, ballPos);

  // 【修正】距離に関係なく移動を試みる
  if (distance > 0.5) {
    const direction = ballPos.subtract(myPos).normalize();
    direction.y = 0;

    // 衝突調整
    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    if (adjustedDirection) {
      // 距離に応じた移動速度
      const isDashing = distance > MOVEMENT_CONSTANTS.DASH_DISTANCE_THRESHOLD;
      const isRunning = distance > MOVEMENT_CONSTANTS.RUN_DISTANCE_THRESHOLD;

      this.character.move(adjustedDirection, deltaTime, isRunning, isDashing);
    } else {
      // 【修正】衝突で移動できない場合も待機モーションを再生しない
      // 代わりに別の方向を試す
      this.tryAlternativeDirection(direction, deltaTime);
    }
  } else {
    // ボールに十分近い場合は停止
    this.character.stopMovement();
  }
}

// 新規メソッド: 代替方向を試す
private tryAlternativeDirection(originalDirection: Vector3, deltaTime: number): void {
  const angles = [45, -45, 90, -90, 135, -135];

  for (const angleDeg of angles) {
    const angleRad = angleDeg * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const altDirection = new Vector3(
      originalDirection.x * cos - originalDirection.z * sin,
      0,
      originalDirection.x * sin + originalDirection.z * cos
    );

    const adjusted = this.adjustDirectionForCollision(altDirection, deltaTime);
    if (adjusted) {
      this.character.move(adjusted, deltaTime, true, false);
      return;
    }
  }

  // すべての方向がブロックされている場合のみ停止
  this.character.stopMovement();
}
```

---

## 実装優先順位

### フェーズ1: 緊急修正（挙動バグ）

| 優先度 | タスク | ファイル | 工数目安 |
|--------|--------|----------|---------|
| 1 | スロワー衝突バグ修正 | Ball.ts, CollisionHandler.ts | 小 |
| 2 | スローイン状態クリアバグ修正 | CollisionHandler.ts, GameScene.ts | 小 |
| 3 | ルーズボールAI移動修正 | LooseBallAI.ts | 小 |

### フェーズ2: 基盤整備

| 優先度 | タスク | ファイル | 工数目安 |
|--------|--------|----------|---------|
| 4 | GameConstants.ts 作成 | 新規ファイル | 小 |
| 5 | Logger.ts 作成 | 新規ファイル | 小 |
| 6 | console.log 置換 | 複数ファイル | 中 |

### フェーズ3: 構造改善（ThrowIn系）

| 優先度 | タスク | ファイル | 工数目安 |
|--------|--------|----------|---------|
| 7 | ThrowInBaseAI.ts 作成 | 新規ファイル | 小 |
| 8 | ThrowIn系AI リファクタリング | 3ファイル | 中 |

### フェーズ4: 大規模リファクタリング

| 優先度 | タスク | ファイル | 工数目安 |
|--------|--------|----------|---------|
| 9 | ServiceContainer.ts 作成 | 新規ファイル | 中 |
| 10 | GameScene.ts 分割 | 1→6ファイル | 大 |
| 11 | Character.ts 分割 | 1→6ファイル | 大 |

### フェーズ5: パフォーマンス最適化

| 優先度 | タスク | ファイル | 工数目安 |
|--------|--------|----------|---------|
| 12 | SpatialGrid.ts 作成 | 新規ファイル | 中 |
| 13 | CollisionHandler最適化 | CollisionHandler.ts | 中 |

---

## 影響ファイル一覧

### 修正対象ファイル

| ファイル | 修正内容 |
|---------|---------|
| `src/character-move/entities/Ball.ts` | パス送信者クールダウン追加 |
| `src/character-move/controllers/CollisionHandler.ts` | スロワー除外、状態クリア処理 |
| `src/character-move/scenes/GameScene.ts` | コールバック設定、分割 |
| `src/character-move/entities/Character.ts` | 分割 |
| `src/character-move/ai/state/LooseBallAI.ts` | 移動ロジック修正 |
| `src/character-move/ai/state/ThrowInThrowerAI.ts` | 基底クラス継承 |
| `src/character-move/ai/state/ThrowInReceiverAI.ts` | 基底クラス継承 |
| `src/character-move/ai/state/ThrowInOtherAI.ts` | 基底クラス継承 |
| `src/character-move/ai/state/BaseStateAI.ts` | 定数参照変更 |
| `src/character-move/controllers/CharacterAI.ts` | DI対応 |

### 新規作成ファイル

| ファイル | 内容 |
|---------|------|
| `src/character-move/config/GameConstants.ts` | 統合定数ファイル |
| `src/character-move/utils/Logger.ts` | ロギングユーティリティ |
| `src/character-move/ai/state/ThrowInBaseAI.ts` | ThrowIn基底クラス |
| `src/character-move/core/ServiceContainer.ts` | DIコンテナ |
| `src/character-move/utils/SpatialGrid.ts` | 空間分割ユーティリティ |
| `src/character-move/managers/GameStateManager.ts` | ゲーム状態管理 |
| `src/character-move/managers/ThrowInManager.ts` | スローイン管理 |
| `src/character-move/managers/TeamManager.ts` | チーム管理 |
| `src/character-move/managers/GameModeManager.ts` | モード管理 |
| `src/character-move/managers/GameEventDispatcher.ts` | イベント管理 |
| `src/character-move/entities/CharacterMeshManager.ts` | メッシュ管理 |
| `src/character-move/entities/CharacterPhysicsManager.ts` | 物理管理 |
| `src/character-move/entities/CharacterMotionManager.ts` | モーション管理 |
| `src/character-move/entities/CharacterStateManager.ts` | 状態管理 |
| `src/character-move/entities/CharacterBallHandler.ts` | ボール処理 |

---

## 備考

- 各フェーズは独立して実行可能
- フェーズ1（挙動バグ修正）は最優先で実施
- フェーズ4-5は大規模変更のため、十分なテストが必要
- 既存のテストがない場合は、リファクタリング前にテストを追加することを推奨

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-02-03 | 初版作成 |
