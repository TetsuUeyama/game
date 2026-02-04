# Utils/System 共通化リファクタリング作業リスト

## 概要
コードベース内の重複ロジックを共通化し、保守性・可読性を向上させる。

---

## Phase 0: クリーンアップ（最優先） ✅ 完了

リファクタリング作業を進める前に、不要なコードを削除する。

### 0-1. [x] console.log の削除 ✅

**完了**: 2024-02-05

**削除したファイル**:
- [x] `CharacterAI.ts` - 状態遷移ログ削除
- [x] `BallCatchSystem.ts` - デバッグログ削除
- [x] `ShootingController.ts` - ゴール検出ログ削除
- [x] `ActionController.ts` - リセットログ削除
- [x] `ThrowInCheckController.ts` - テストログ削除
- [x] `PassCheckController.ts` - パス実行ログ削除
- [x] `Character.ts` - スローインログ削除
- [x] `AIDecisionMaker.ts` - デバッグメソッド無効化

**残したもの（本番で必要）**:
- console.error: ロード失敗、物理エンジン必須エラー
- console.warn: 設定不足、不正パラメータ
- Logger.ts: ログ管理ユーティリティ

---

### 0-2. [x] DEBUG コメントの削除 ✅

**完了**: 2024-02-05

**削除したファイル**:
- [x] `PassTrajectoryVisualizer.ts` - updateCounter、shouldLog削除
- [x] `PassTrajectoryCalculator.ts` - logCounter、shouldLog削除
- [x] `InterceptionAnalyzer.ts` - logCounter、shouldLog削除

---

### 0-3. [x] trajectoryValidation.ts の対処 ✅

**完了**: 2024-02-05

**対応**: 開発専用ファイルとしてヘッダーに警告を追加
- ファイルはどこからもインポートされていない（スタンドアロン）
- console.logはテスト出力として意図的に使用
- ヘッダーに「⚠️ 開発専用ファイル」表記を追加

---

## Phase 1: 基本ユーティリティ ✅ 完了

### 1. [x] CollisionUtils に normalizeAngle() 追加 ✅
**ファイル**: `src/character-move/utils/CollisionUtils.ts`

**追加する関数**:
```typescript
/**
 * 角度を [-PI, PI] の範囲に正規化
 */
export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}
```

**完了**: 2024-02-05

**置き換え済みファイル**:
- [x] Character.ts
- [x] ShootTrajectoryVisualizer.ts
- [x] PassTrajectoryConfig.ts
- [x] OnBallOffenseAI.ts
- [x] BallCatchSystem.ts

---

### 2. [x] TeamUtils 作成 ✅
**ファイル**: `src/character-move/utils/TeamUtils.ts` (新規作成)

**追加する関数**:
```typescript
import { Character } from "../entities/Character";

/**
 * チームフィルタリングユーティリティ
 */

/**
 * 味方キャラクターを取得（自分を除く）
 */
export function getTeammates(allCharacters: Character[], self: Character): Character[] {
  return allCharacters.filter(c => c.team === self.team && c !== self);
}

/**
 * 敵キャラクターを取得
 */
export function getOpponents(allCharacters: Character[], self: Character): Character[] {
  return allCharacters.filter(c => c.team !== self.team);
}

/**
 * 味方キャラクターを取得（自分を含む）
 */
export function getTeammatesIncludingSelf(allCharacters: Character[], self: Character): Character[] {
  return allCharacters.filter(c => c.team === self.team);
}
```

**完了**: 2024-02-05

**置き換え済みファイル**:
- [x] OnBallOffenseAI.ts
- [x] OffBallOffenseAI.ts
- [x] PassTrajectoryVisualizer.ts

---

### 3. [x] Field クラスに GoalUtils メソッド追加 ✅
**ファイル**: `src/character-move/entities/Field.ts`

**追加するメソッド**:
```typescript
/**
 * 攻撃側のゴールリム位置を取得
 */
public getAttackingGoalRim(team: 'ally' | 'enemy'): Vector3 {
  return team === 'ally' ? this.getGoal1Rim() : this.getGoal2Rim();
}

/**
 * 守備側のゴールリム位置を取得
 */
public getDefendingGoalRim(team: 'ally' | 'enemy'): Vector3 {
  return team === 'ally' ? this.getGoal2Rim() : this.getGoal1Rim();
}

/**
 * 攻撃側のバックボード位置を取得
 */
public getAttackingBackboard(team: 'ally' | 'enemy'): Vector3 {
  return team === 'ally' ? this.getGoal1Backboard() : this.getGoal2Backboard();
}

/**
 * 守備側のバックボード位置を取得
 */
public getDefendingBackboard(team: 'ally' | 'enemy'): Vector3 {
  return team === 'ally' ? this.getGoal2Backboard() : this.getGoal1Backboard();
}
```

**完了**: 2024-02-05

**追加したメソッド**:
- `getAttackingGoalRim(team)`: 攻撃側のゴールリム位置（Vector3）
- `getDefendingGoalRim(team)`: 守備側のゴールリム位置（Vector3）
- `getAttackingBackboard(team)`: 攻撃側のバックボード位置（Vector3）
- `getDefendingBackboard(team)`: 守備側のバックボード位置（Vector3）

**置き換え済みファイル**:
- [x] OnBallOffenseAI.ts（4箇所）
- [x] OnBallDefenseAI.ts
- [x] OffBallDefenseAI.ts
- [x] ShootTrajectoryVisualizer.ts

**置き換えなし（ボール方向基準のため）**:
- OffBallDefenseAI.ts:433（リバウンドポジション）
- OffBallOffenseAI.ts:915（リバウンドポジション）
- LooseBallAI.ts（ボール位置基準）

---

## Phase 2: 中優先度

### 4. [ ] 距離計算の統一（CollisionUtils使用への置き換え）
**対象**: 手動で `Math.sqrt(dx*dx + dz*dz)` を使用している箇所

**置き換え先**:
- `getDistance2D(pos1, pos2)` - 2D距離
- `getDistance3D(pos1, pos2)` - 3D距離

**置き換え対象ファイル**（23箇所以上、主要なもの）:
- [ ] ShootTrajectoryVisualizer.ts:192
- [ ] Character.ts:1225
- [ ] OnBallOffenseAI.ts:505
- [ ] OffBallOffenseAI.ts:443, 648, 994
- [ ] PassTrajectoryCalculator.ts:173, 289
- [ ] DefenseConfig.ts:314
- [ ] PassTrajectoryConfig.ts:179

---

### 5. [ ] 視野判定の統一
**対象**: `DefenseUtils.isInFieldOfView()` と `Character.isInVision()` の統一

**確認事項**:
- 両者のロジックの差異を確認
- どちらかに統一、または両方を維持して使い分けを明確化

---

### 6. [ ] findOnBallPlayer の統一
**対象**: 複数クラスに存在する `findOnBallPlayer()` メソッド

**現在の実装箇所**:
- BaseStateAI.ts:361
- ShootingController.ts:688
- OneOnOneBattleController.ts:605

**対応案**:
- Ball.getHolder() を使用するよう統一
- または CharacterFilterSystem に集約

---

## 新規システム（リスク判定統一）

### 8. [ ] DefenderStateUtils 作成
**ファイル**: `src/character-move/utils/DefenderStateUtils.ts` (新規作成)

**目的**: ディフェンダーの状態（重心・移動能力）を統一的に取得するユーティリティ

**追加する関数**:
```typescript
import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";

/**
 * ディフェンダー状態判定ユーティリティ
 * 重心システムと連携してディフェンダーの能力を判定
 */
export class DefenderStateUtils {
  /**
   * ディフェンダーが今すぐジャンプ可能か
   * 重心が安定していて、ロック中でなければジャンプ可能
   */
  static canJumpNow(defender: Character): boolean {
    const balance = defender.getBalanceController();
    if (!balance) return true;
    return balance.canTransition() && !balance.isLocked();
  }

  /**
   * ジャンプ可能になるまでの時間（秒）
   */
  static getTimeUntilCanJump(defender: Character): number {
    const balance = defender.getBalanceController();
    if (!balance) return 0;
    if (this.canJumpNow(defender)) return 0;
    return balance.getEstimatedRecoveryTime();
  }

  /**
   * ディフェンダーの有効ブロック高さ（ジャンプ可否を考慮）
   * @param defender ディフェンダー
   * @param jumpHeight ジャンプ高さ（デフォルト0.5m）
   * @returns ブロック可能な最大高さ（m）
   */
  static getEffectiveBlockHeight(defender: Character, jumpHeight: number = 0.5): number {
    const baseHeight = defender.config.physical.height;
    const armReach = baseHeight * 0.4; // 腕の長さ（身長の約40%）

    if (this.canJumpNow(defender)) {
      return baseHeight + armReach + jumpHeight;
    }
    return baseHeight + armReach;
  }

  /**
   * 指定時間後のディフェンダー予測位置
   * 現在の速度ベクトルと重心状態を考慮
   * @param defender ディフェンダー
   * @param timeAhead 予測時間（秒）
   * @returns 予測位置
   */
  static predictPosition(defender: Character, timeAhead: number): Vector3 {
    const currentPos = defender.getPosition();
    const velocity = defender.velocity || Vector3.Zero();

    // 重心状態を考慮（不安定だと移動が制限される）
    const balance = defender.getBalanceController();
    let mobilityFactor = 1.0;

    if (balance) {
      // ロック中は移動不可
      if (balance.isLocked()) {
        mobilityFactor = 0;
      } else {
        // 安定性に応じて移動能力を調整
        mobilityFactor = balance.getStability();
      }
    }

    return currentPos.add(velocity.scale(timeAhead * mobilityFactor));
  }

  /**
   * ディフェンダーが指定位置に到達可能か判定
   * @param defender ディフェンダー
   * @param targetPos 目標位置
   * @param timeLimit 制限時間（秒）
   * @returns 到達可能ならtrue
   */
  static canReachPosition(
    defender: Character,
    targetPos: Vector3,
    timeLimit: number
  ): boolean {
    const currentPos = defender.getPosition();
    const distance = Vector3.Distance(currentPos, targetPos);

    // ディフェンダーの移動速度（statsから取得）
    const baseSpeed = 5.0; // m/s
    const speedStat = defender.playerData?.stats?.speed ?? 50;
    const defenderSpeed = baseSpeed * (speedStat / 50);

    // 重心状態による移動開始遅延
    const startDelay = this.getTimeUntilCanJump(defender);

    // 移動可能時間
    const availableTime = Math.max(0, timeLimit - startDelay);

    // 到達可能距離
    const reachableDistance = defenderSpeed * availableTime;

    return distance <= reachableDistance;
  }

  /**
   * ディフェンダーの反応時間を計算
   * quickness ステータスに基づく
   */
  static getReactionTime(defender: Character): number {
    const baseReactionTime = 0.3; // 秒
    const quickness = defender.playerData?.stats?.quickness ?? 50;
    return baseReactionTime * (100 / quickness);
  }
}
```

---

### 9. [ ] RiskAssessmentSystem 作成
**ファイル**: `src/character-move/systems/RiskAssessmentSystem.ts` (新規作成)

**目的**: パス/シュートのリスク判定を統一するシステム

**依存関係**:
- DefenderStateUtils（項目8）
- 既存の InterceptionAnalyzer（統合対象）
- PassTrajectoryCalculator
- 重心システム（BalanceController経由）

**追加するクラス**:
```typescript
import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { Field } from "../entities/Field";
import { DefenderStateUtils } from "../utils/DefenderStateUtils";

/**
 * リスクレベル
 */
export enum RiskLevel {
  SAFE = "SAFE",           // 0-30%: 安全
  CAUTION = "CAUTION",     // 30-60%: 注意
  DANGER = "DANGER",       // 60-80%: 危険
  HIGH_DANGER = "HIGH_DANGER", // 80-100%: 非常に危険
}

/**
 * リスク評価結果
 */
export interface RiskAssessment {
  /** リスク確率 (0.0-1.0) */
  probability: number;
  /** リスクレベル */
  riskLevel: RiskLevel;
  /** 最も危険なディフェンダー */
  primaryThreat: Character | null;
  /** ブロック/インターセプト可能位置 */
  threatPoint: Vector3 | null;
  /** 推奨アクション */
  recommendation: 'EXECUTE' | 'WAIT' | 'ABORT';
}

/**
 * パスリスク詳細
 */
export interface PassRiskDetail extends RiskAssessment {
  /** パスタイプ */
  passType: 'chest' | 'bounce' | 'overhead';
  /** 軌道上の危険ポイント */
  dangerPoints: { position: Vector3; defender: Character; arrivalTimeDiff: number }[];
}

/**
 * シュートリスク詳細
 */
export interface ShootRiskDetail extends RiskAssessment {
  /** シュートタイプ */
  shootType: '3pt' | 'midrange' | 'layup';
  /** ブロック可能なディフェンダーリスト */
  blockers: { defender: Character; blockProbability: number; canJump: boolean }[];
}

/**
 * リスク判定システム
 */
export class RiskAssessmentSystem {
  private ball: Ball;
  private field: Field;
  private allCharacters: Character[];

  constructor(ball: Ball, field: Field, allCharacters: Character[]) {
    this.ball = ball;
    this.field = field;
    this.allCharacters = allCharacters;
  }

  /**
   * キャラクターリストを更新
   */
  setCharacters(characters: Character[]): void {
    this.allCharacters = characters;
  }

  // =====================================================
  // パスリスク判定
  // =====================================================

  /**
   * パスのリスク評価
   * @param passer パサー
   * @param receiver レシーバー
   * @param passType パスタイプ
   * @returns リスク評価結果
   */
  assessPassRisk(
    passer: Character,
    receiver: Character,
    passType: 'chest' | 'bounce' | 'overhead' = 'chest'
  ): PassRiskDetail {
    const defenders = this.allCharacters.filter(c => c.team !== passer.team);

    // 軌道を計算
    const trajectory = this.calculatePassTrajectory(passer, receiver, passType);

    // 各ディフェンダーのインターセプトリスクを計算
    const dangerPoints: PassRiskDetail['dangerPoints'] = [];
    let maxRisk = 0;
    let primaryThreat: Character | null = null;
    let threatPoint: Vector3 | null = null;

    for (const defender of defenders) {
      const risk = this.calculateDefenderInterceptionRisk(
        defender,
        trajectory,
        passType === 'bounce'
      );

      if (risk.probability > maxRisk) {
        maxRisk = risk.probability;
        primaryThreat = defender;
        threatPoint = risk.interceptPoint;
      }

      if (risk.probability > 0.1) {
        dangerPoints.push({
          position: risk.interceptPoint,
          defender,
          arrivalTimeDiff: risk.timeDiff,
        });
      }
    }

    return {
      probability: maxRisk,
      riskLevel: this.getRiskLevel(maxRisk),
      primaryThreat,
      threatPoint,
      recommendation: this.getRecommendation(maxRisk),
      passType,
      dangerPoints,
    };
  }

  // =====================================================
  // シュートリスク判定（新規実装）
  // =====================================================

  /**
   * シュートのリスク評価
   * @param shooter シューター
   * @param shootType シュートタイプ
   * @returns リスク評価結果
   */
  assessShootRisk(
    shooter: Character,
    shootType: '3pt' | 'midrange' | 'layup' = 'midrange'
  ): ShootRiskDetail {
    const defenders = this.allCharacters.filter(c => c.team !== shooter.team);

    // シュート軌道を計算
    const shooterPos = shooter.getPosition();
    const goalPos = this.field.getAttackingGoalRim(shooter.team);

    // 各ディフェンダーのブロックリスクを計算
    const blockers: ShootRiskDetail['blockers'] = [];
    let maxRisk = 0;
    let primaryThreat: Character | null = null;
    let threatPoint: Vector3 | null = null;

    for (const defender of defenders) {
      const blockRisk = this.calculateDefenderBlockRisk(
        shooter,
        defender,
        shootType,
        shooterPos,
        goalPos
      );

      if (blockRisk.probability > 0.1) {
        blockers.push({
          defender,
          blockProbability: blockRisk.probability,
          canJump: DefenderStateUtils.canJumpNow(defender),
        });
      }

      if (blockRisk.probability > maxRisk) {
        maxRisk = blockRisk.probability;
        primaryThreat = defender;
        threatPoint = blockRisk.blockPoint;
      }
    }

    return {
      probability: maxRisk,
      riskLevel: this.getRiskLevel(maxRisk),
      primaryThreat,
      threatPoint,
      recommendation: this.getRecommendation(maxRisk),
      shootType,
      blockers,
    };
  }

  /**
   * ディフェンダーのブロックリスクを計算
   */
  private calculateDefenderBlockRisk(
    shooter: Character,
    defender: Character,
    shootType: '3pt' | 'midrange' | 'layup',
    shooterPos: Vector3,
    goalPos: Vector3
  ): { probability: number; blockPoint: Vector3 } {
    const defenderPos = defender.getPosition();

    // シューターとディフェンダーの距離
    const distanceToShooter = Vector3.Distance(shooterPos, defenderPos);

    // シュートタイプ別のブロック可能距離
    const blockDistanceThresholds = {
      'layup': 2.0,    // レイアップは近くないとブロックできない
      'midrange': 1.5, // ミドルレンジ
      '3pt': 1.2,      // 3ポイントは更に近くないと
    };

    const blockThreshold = blockDistanceThresholds[shootType];

    // 距離が遠すぎる場合はブロック不可
    if (distanceToShooter > blockThreshold * 2) {
      return { probability: 0, blockPoint: defenderPos };
    }

    // ディフェンダーの有効ブロック高さ
    const effectiveHeight = DefenderStateUtils.getEffectiveBlockHeight(defender);

    // シューターのリリース高さ（概算）
    const shooterHeight = shooter.config.physical.height;
    const releaseHeight = shooterHeight * 0.9 + 0.3; // 頭上でリリース

    // 高さによるブロック可能性
    const heightDiff = effectiveHeight - releaseHeight;
    let heightFactor = 0;
    if (heightDiff >= 0.3) {
      heightFactor = 1.0; // 完全にブロック可能
    } else if (heightDiff >= 0) {
      heightFactor = 0.7; // ギリギリブロック可能
    } else if (heightDiff >= -0.2) {
      heightFactor = 0.3; // 難しいがチャンスあり
    }

    // 距離による調整
    let distanceFactor = 0;
    if (distanceToShooter <= blockThreshold) {
      distanceFactor = 1.0;
    } else if (distanceToShooter <= blockThreshold * 1.5) {
      distanceFactor = 0.5;
    } else {
      distanceFactor = 0.2;
    }

    // 移動予測（シューターがシュートモーション中にディフェンダーが近づける）
    const shootMotionTime = 0.4; // シュートモーション時間（概算）
    const predictedPos = DefenderStateUtils.predictPosition(defender, shootMotionTime);
    const predictedDistance = Vector3.Distance(shooterPos, predictedPos);

    if (predictedDistance < distanceToShooter) {
      // 近づいている場合、距離ファクターを調整
      distanceFactor = Math.min(1.0, distanceFactor + 0.2);
    }

    // 重心状態による調整（ジャンプできない場合はリスク低下）
    let balanceFactor = 1.0;
    if (!DefenderStateUtils.canJumpNow(defender)) {
      balanceFactor = 0.3; // ジャンプできないのでブロック確率大幅低下
    }

    const probability = Math.min(1.0, heightFactor * distanceFactor * balanceFactor);

    return {
      probability,
      blockPoint: predictedPos,
    };
  }

  // =====================================================
  // 共通ヘルパー
  // =====================================================

  /**
   * パス軌道を計算（簡易版）
   */
  private calculatePassTrajectory(
    passer: Character,
    receiver: Character,
    passType: 'chest' | 'bounce' | 'overhead'
  ): { points: Vector3[]; times: number[] } {
    // TODO: PassTrajectoryCalculator と統合
    const start = passer.getPosition();
    const end = receiver.getPosition();
    const points: Vector3[] = [];
    const times: number[] = [];

    const segments = 20;
    const distance = Vector3.Distance(start, end);
    const speed = 10.0; // m/s（概算）
    const totalTime = distance / speed;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = Vector3.Lerp(start, end, t);
      points.push(point);
      times.push(t * totalTime);
    }

    return { points, times };
  }

  /**
   * ディフェンダーのインターセプトリスクを計算
   */
  private calculateDefenderInterceptionRisk(
    defender: Character,
    trajectory: { points: Vector3[]; times: number[] },
    isBouncePass: boolean
  ): { probability: number; interceptPoint: Vector3; timeDiff: number } {
    // 既存の InterceptionAnalyzer ロジックを統合
    const reactionTime = DefenderStateUtils.getReactionTime(defender);
    const baseSpeed = 5.0;
    const speedStat = defender.playerData?.stats?.speed ?? 50;
    const defenderSpeed = baseSpeed * (speedStat / 50);
    const interceptRadius = 1.0;

    let maxProbability = 0;
    let bestInterceptPoint = trajectory.points[0];
    let bestTimeDiff = Infinity;

    const startIndex = isBouncePass ? Math.floor(trajectory.points.length / 2) : 0;

    for (let i = startIndex; i < trajectory.points.length; i++) {
      const point = trajectory.points[i];
      const ballTime = trajectory.times[i];

      const defenderPos = defender.getPosition();
      const distance = Vector3.Distance(defenderPos, point);

      // 移動予測を考慮
      const predictedPos = DefenderStateUtils.predictPosition(defender, ballTime);
      const predictedDistance = Vector3.Distance(predictedPos, point);
      const effectiveDistance = Math.min(distance, predictedDistance);

      const defenderTime = reactionTime + Math.max(0, effectiveDistance - interceptRadius) / defenderSpeed;
      const timeDiff = defenderTime - ballTime;

      let probability = 0;
      if (timeDiff <= -0.3) {
        probability = 0.9 + (Math.abs(timeDiff) - 0.3) * 0.2;
      } else if (timeDiff <= 0) {
        probability = 0.6 + Math.abs(timeDiff) / 0.3 * 0.3;
      } else if (timeDiff <= 0.2) {
        probability = 0.3 + (0.2 - timeDiff) / 0.2 * 0.3;
      } else if (timeDiff <= 0.5) {
        probability = 0.1 + (0.5 - timeDiff) / 0.3 * 0.2;
      } else {
        probability = Math.max(0, 0.1 - (timeDiff - 0.5) * 0.1);
      }

      probability = Math.min(1.0, Math.max(0, probability));

      if (probability > maxProbability) {
        maxProbability = probability;
        bestInterceptPoint = point;
        bestTimeDiff = timeDiff;
      }
    }

    return {
      probability: maxProbability,
      interceptPoint: bestInterceptPoint,
      timeDiff: bestTimeDiff,
    };
  }

  /**
   * リスクレベルを取得
   */
  private getRiskLevel(probability: number): RiskLevel {
    if (probability < 0.3) return RiskLevel.SAFE;
    if (probability < 0.6) return RiskLevel.CAUTION;
    if (probability < 0.8) return RiskLevel.DANGER;
    return RiskLevel.HIGH_DANGER;
  }

  /**
   * 推奨アクションを取得
   */
  private getRecommendation(probability: number): 'EXECUTE' | 'WAIT' | 'ABORT' {
    if (probability < 0.3) return 'EXECUTE';
    if (probability < 0.7) return 'WAIT';
    return 'ABORT';
  }
}
```

---

### 10. [ ] RiskAssessmentConfig 作成
**ファイル**: `src/character-move/config/RiskAssessmentConfig.ts` (新規作成)

**追加する設定**:
```typescript
/**
 * リスク判定設定
 */
export const RISK_ASSESSMENT_CONFIG = {
  // パスインターセプト設定
  PASS: {
    BASE_REACTION_TIME: 0.3,      // 基本反応時間（秒）
    INTERCEPT_RADIUS: 1.0,        // インターセプト可能半径（m）
    BASE_DEFENDER_SPEED: 5.0,     // 基本移動速度（m/s）
    BASE_PASS_SPEED: 10.0,        // 基本パス速度（m/s）
  },

  // シュートブロック設定
  SHOOT: {
    LAYUP_BLOCK_DISTANCE: 2.0,    // レイアップブロック可能距離（m）
    MIDRANGE_BLOCK_DISTANCE: 1.5, // ミドルレンジブロック可能距離（m）
    THREE_PT_BLOCK_DISTANCE: 1.2, // 3PTブロック可能距離（m）
    SHOOT_MOTION_TIME: 0.4,       // シュートモーション時間（秒）
    BASE_JUMP_HEIGHT: 0.5,        // 基本ジャンプ高さ（m）
    ARM_REACH_RATIO: 0.4,         // 腕の長さ（身長比）
  },

  // リスクレベル閾値
  THRESHOLDS: {
    SAFE: 0.3,
    CAUTION: 0.6,
    DANGER: 0.8,
  },

  // 移動予測設定
  PREDICTION: {
    STABILITY_WEIGHT: 1.0,        // 安定性の重み
    VELOCITY_DECAY: 0.9,          // 速度減衰率
  },
} as const;
```

---

### 11. [ ] systems/index.ts にエクスポート追加
**ファイル**: `src/character-move/systems/index.ts`

```typescript
export { RiskAssessmentSystem, RiskLevel } from './RiskAssessmentSystem';
export type { RiskAssessment, PassRiskDetail, ShootRiskDetail } from './RiskAssessmentSystem';
```

---

### 12. [ ] 既存 InterceptionAnalyzer の統合（オプション）
**対象**: `src/character-move/ai/analysis/InterceptionAnalyzer.ts`

**対応案**:
- RiskAssessmentSystem に統合後、InterceptionAnalyzer を非推奨化
- または InterceptionAnalyzer から RiskAssessmentSystem を呼び出すラッパーに変更

---

## 推奨するシステム化（その他）

### 7. [ ] CharacterFilterSystem 作成（オプション）
**ファイル**: `src/character-move/systems/CharacterFilterSystem.ts` (新規作成)

TeamUtils と findOnBallPlayer を統合した包括的なフィルタリングシステム。

```typescript
export class CharacterFilterSystem {
  static getTeammates(all: Character[], self: Character): Character[];
  static getOpponents(all: Character[], self: Character): Character[];
  static findBallHolder(all: Character[]): Character | null;
  static findByState(all: Character[], state: CharacterState): Character[];
  static findByPosition(all: Character[], position: string): Character | null;
  static sortByDistanceTo(all: Character[], target: Vector3): Character[];
}
```

**注**: TeamUtils (項目2) で十分な場合はスキップ可

---

## 実装順序

### Phase 1: 基本ユーティリティ ✅ 完了
1. [x] CollisionUtils に normalizeAngle() 追加
2. [x] TeamUtils 作成
3. [x] Field に GoalUtils メソッド追加

### Phase 2: リスク判定システム
4. [ ] DefenderStateUtils 作成
5. [ ] RiskAssessmentConfig 作成
6. [ ] RiskAssessmentSystem 作成
7. [ ] systems/index.ts にエクスポート追加

### Phase 3: 既存コード置き換え ✅ 完了（Phase 1に統合）
8. [x] normalizeAngle 置き換え
9. [x] TeamUtils 置き換え
10. [x] GoalUtils 置き換え
11. [ ] 距離計算の統一（中優先度 - 後日）

### Phase 4: 統合・最適化
12. [ ] InterceptionAnalyzer の RiskAssessmentSystem 統合
13. [ ] AI での RiskAssessmentSystem 使用

---

## 完了チェック

- [ ] TypeScript コンパイルエラーなし
- [ ] 既存の動作に影響なし（同一ロジックの置き換えのため）
- [ ] パスリスク判定が正常に動作
- [ ] シュートリスク判定が正常に動作
- [ ] 重心システムとの連携が正常に動作

---

## 将来計画: IK + アニメーションブレンディング刷新

**優先度**: 低（Phase 1-4 完了後）
**前提条件**: 現在のリファクタリング作業完了後

### 現状分析（2024年2月調査）

| 項目 | 現状 |
|-----|-----|
| アニメーション方式 | カスタムキーフレーム（24個の独立メッシュ） |
| モーションブレンディング | 線形補間（0.1-0.5秒） |
| IK | 未実装 |
| スケルトン/ボーン | なし（メッシュベース） |
| モデルローダー | `ModelLoader.ts` 準備済み（未使用） |

### 推奨方針: GLTFモデル + スケルトン導入

**理由**:
- Babylon.js標準の`BoneIKController`が使用可能
- アニメーションブレンディングが容易
- 外部ツール（Blender等）でモーション作成可能

### 実装ステップ

#### Step 1: [ ] GLTFモデル準備
- Blender等でリグ付きキャラクターモデル作成
- ボーン構造: Root → Spine → (Arm/Leg chains)
- アニメーション: Idle, Walk, Run, Jump, Pass, Shoot, Dribble

#### Step 2: [ ] ModelLoader統合
- 既存の`ModelLoader.ts`を活用
- スケルトン・アニメーションのロード処理追加
- 物理メッシュとの連携維持

#### Step 3: [ ] IKシステム実装
```typescript
// 想定構造
class CharacterIKSystem {
  // 足IK（地面追従）
  setupFootIK(character: Character): void;

  // 手IK（ボール追従）
  setupHandIK(character: Character, target: Vector3): void;

  // 視線IK（ターゲット注視）
  setupLookAtIK(character: Character, target: Vector3): void;
}
```

#### Step 4: [ ] アニメーションブレンディング強化
- `AnimationGroup`ブレンディング
- レイヤーベースのアニメーション合成
- 状態機械（AnimationStateMachine）

#### Step 5: [ ] 既存システムとの統合
- MotionController → 新システムへの移行
- 既存モーションデータの変換またはGLTF内アニメーション使用
- AI・物理システムとの連携確認

### 関連ファイル

**現在のアニメーションシステム**:
- `controllers/MotionController.ts` - メインエンジン
- `entities/CharacterBodyParts.ts` - メッシュ生成
- `motion/*.ts` - モーション定義（10+ファイル）
- `types/MotionTypes.ts` - 型定義
- `config/MotionConfig.ts` - 設定

**移行時に変更/置換予定**:
- `loaders/ModelLoader.ts` - 拡張して使用
- `entities/Character.ts` - スケルトン対応追加

### 工数見積もり

| ステップ | 規模 |
|---------|-----|
| Step 1: モデル準備 | 大（外部ツール作業） |
| Step 2: Loader統合 | 中 |
| Step 3: IK実装 | 中〜大 |
| Step 4: ブレンディング | 中 |
| Step 5: 統合 | 大 |

---

## 変更履歴

| 日付 | 内容 |
|-----|-----|
| 2024-02-05 | 初版作成、Phase 0-4 定義 |
| 2024-02-05 | IK+アニメーションブレンディング将来計画追加 |
| 2024-02-05 | Phase 0 完了（console.log削除、DEBUGコメント削除、trajectoryValidation.ts対処） |
| 2024-02-05 | Phase 1 完了（normalizeAngle追加、TeamUtils作成、GoalUtilsメソッド追加、全置き換え完了） |
