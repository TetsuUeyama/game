import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { Field } from "../entities/Field";
import { PlayerStateManager } from "../state/PlayerStateManager";
import { PlayerStateSnapshot } from "../state/PlayerStateTypes";
import { PlayerPosition } from "../config/FormationConfig";

/** ルーズボール追跡者の最大人数（チームあたり） */
const MAX_CHASERS_PER_TEAM = 2;

/** ボール非追跡時に味方と保つ最低距離 */
const TEAMMATE_SEPARATION = 3.0;

/** 自陣に戻る際のZ座標（守備エリア） */
const DEFENSIVE_ZONE_Z = {
  ALLY: -8.0,   // ally チームの守備エリア（goal2側）
  ENEMY: 8.0,   // enemy チームの守備エリア（goal1側）
};

/** ゴール近接判定の閾値 */
const GOAL_PROXIMITY_THRESHOLD = 5.0;

/**
 * ルーズボール判断システム
 *
 * PlayerStateManagerのスナップショットを使い、チーム全体の判断を一括計算する。
 * 各LooseBallAIインスタンスが独立して計算していたロジックを集約し、
 * フレームあたり1回の計算で全選手分の判断結果をキャッシュする。
 *
 * 計算内容:
 * - ボール追跡者の決定（チームごとに到達時間上位1-2名）
 * - ゴール近くでの最近接選手判定
 * - 味方からの反発方向（3m以内の味方から離れる方向）
 * - 守備/リバウンドポジションの算出
 */
export class LooseBallDecisionSystem {
  private playerState: PlayerStateManager;
  private ball: Ball;
  private field: Field;

  // ── 判断結果キャッシュ ──
  /** ボールを追うべき選手のセット */
  private chaserSet: Set<Character> = new Set();
  /** 全選手中でボールに最も近い選手 */
  private closestToBallChar: Character | null = null;
  /** 各選手の味方反発方向（3m以内に味方がいない場合はエントリなし） */
  private repulsionDirs: Map<Character, Vector3> = new Map();
  /** 各選手の目標守備/リバウンドポジション */
  private defensivePositions: Map<Character, Vector3> = new Map();
  /** ボールがゴール近くにあるか */
  private nearGoalFlag: boolean = false;

  constructor(playerState: PlayerStateManager, ball: Ball, field: Field) {
    this.playerState = playerState;
    this.ball = ball;
    this.field = field;
  }

  // ============================================
  // フレーム更新
  // ============================================

  /**
   * 毎フレーム呼び出し - 全選手の判断を一括計算
   * PlayerStateManager.update() の後、AI更新の前に呼ぶ
   */
  public update(): void {
    // キャッシュクリア
    this.chaserSet.clear();
    this.closestToBallChar = null;
    this.repulsionDirs.clear();
    this.defensivePositions.clear();

    const ballPosition = this.ball.getPosition();

    // ゴール近接判定
    const goal1Pos = this.field.getGoal1Rim().position;
    const goal2Pos = this.field.getGoal2Rim().position;
    const distToGoal1 = Vector3.Distance(ballPosition, goal1Pos);
    const distToGoal2 = Vector3.Distance(ballPosition, goal2Pos);
    this.nearGoalFlag = distToGoal1 < GOAL_PROXIMITY_THRESHOLD || distToGoal2 < GOAL_PROXIMITY_THRESHOLD;

    // 全選手中でボールに最も近い選手を計算
    this.computeClosestToBall(ballPosition);

    // チーム別のチェイサーを計算
    this.computeChasers('ally', ballPosition);
    this.computeChasers('enemy', ballPosition);

    // 全選手の反発方向と守備位置を計算
    const allSnapshots = this.playerState.getAll();
    for (const snapshot of allSnapshots) {
      this.computeRepulsionDir(snapshot);
      this.computeDefensivePosition(snapshot, goal1Pos, goal2Pos, distToGoal1, distToGoal2);
    }
  }

  // ============================================
  // クエリAPI（LooseBallAIから呼び出し）
  // ============================================

  /**
   * この選手がボールを追うべきかどうか
   * リバウンド時: 最も近い選手のみ
   * 通常時: チーム内到達時間上位1-2名
   */
  public shouldChase(character: Character): boolean {
    if (this.nearGoalFlag) {
      return this.closestToBallChar === character;
    }
    return this.chaserSet.has(character);
  }

  /**
   * ボールがゴール近くにあるか（リバウンド状況）
   */
  public isNearGoal(): boolean {
    return this.nearGoalFlag;
  }

  /**
   * 味方から離れる方向を取得
   * @returns 離れるべき方向（正規化済み）、3m以内に味方がいなければnull
   */
  public getRepulsionDir(character: Character): Vector3 | null {
    return this.repulsionDirs.get(character) ?? null;
  }

  /**
   * 守備/リバウンドポジションを取得
   */
  public getDefensivePosition(character: Character): Vector3 | null {
    return this.defensivePositions.get(character) ?? null;
  }

  // ============================================
  // 内部計算
  // ============================================

  /**
   * 全選手中でボールに最も近い選手を計算
   */
  private computeClosestToBall(ballPosition: Vector3): void {
    const nearest = this.playerState.findNearestPlayer(ballPosition);
    if (nearest) {
      this.closestToBallChar = nearest.character;
    }
  }

  /**
   * チーム内で到達時間が早い順にチェイサーを決定
   * speedStatを使って実効速度を算出し、到達時間でソート
   */
  private computeChasers(team: 'ally' | 'enemy', ballPosition: Vector3): void {
    const teamPlayers = this.playerState.getPlayersByTeam(team);

    const arrivalTimes: { character: Character; time: number }[] = [];
    for (const snapshot of teamPlayers) {
      const distance = Vector3.Distance(snapshot.position, ballPosition);
      const speedMultiplier = 0.5 + (snapshot.speedStat / 100);
      const effectiveSpeed = 5.0 * speedMultiplier;
      arrivalTimes.push({ character: snapshot.character, time: distance / effectiveSpeed });
    }

    arrivalTimes.sort((a, b) => a.time - b.time);

    const chaserCount = Math.min(MAX_CHASERS_PER_TEAM, arrivalTimes.length);
    for (let i = 0; i < chaserCount; i++) {
      this.chaserSet.add(arrivalTimes[i].character);
    }
  }

  /**
   * 味方からの反発方向を計算
   * 近い味方ほど強い反発力（重み付き平均）
   */
  private computeRepulsionDir(snapshot: PlayerStateSnapshot): void {
    const teammates = this.playerState.getTeammates(snapshot.character);
    const repulsion = Vector3.Zero();
    let count = 0;

    for (const mate of teammates) {
      const dist = Vector3.Distance(snapshot.position, mate.position);
      if (dist < TEAMMATE_SEPARATION && dist > 0.01) {
        const away = new Vector3(
          snapshot.position.x - mate.position.x, 0, snapshot.position.z - mate.position.z
        ).normalize();
        const weight = 1.0 - (dist / TEAMMATE_SEPARATION);
        repulsion.addInPlace(away.scale(weight));
        count++;
      }
    }

    if (count === 0) return;
    repulsion.y = 0;
    if (repulsion.length() < 0.01) return;
    this.repulsionDirs.set(snapshot.character, repulsion.normalize());
  }

  /**
   * 守備/リバウンドポジションを計算
   * ゴール近く: リバウンドポジション
   * 通常: ポジションに応じた守備位置
   */
  private computeDefensivePosition(
    snapshot: PlayerStateSnapshot,
    goal1Pos: Vector3,
    goal2Pos: Vector3,
    distToGoal1: number,
    distToGoal2: number
  ): void {
    if (this.nearGoalFlag) {
      // リバウンドポジション
      const isGoal1 = distToGoal1 < distToGoal2;
      const goalPos = isGoal1 ? goal1Pos : goal2Pos;
      const reboundPos = new Vector3(
        goalPos.x + (snapshot.team === 'ally' ? -1.0 : 1.0),
        snapshot.position.y,
        goalPos.z + (isGoal1 ? -2.5 : 2.5)
      );
      this.defensivePositions.set(snapshot.character, reboundPos);
    } else {
      // 守備帰還ポジション
      const defensiveZ = snapshot.team === 'ally' ? DEFENSIVE_ZONE_Z.ALLY : DEFENSIVE_ZONE_Z.ENEMY;
      const targetX = this.getDefensiveX(snapshot.playerPosition);
      const defensePos = new Vector3(targetX, snapshot.position.y, defensiveZ);
      this.defensivePositions.set(snapshot.character, defensePos);
    }
  }

  /**
   * ポジションに応じた守備X座標を取得
   */
  private getDefensiveX(position: PlayerPosition | null): number {
    switch (position) {
      case 'PG': return 0;        // 中央
      case 'SG': return -3.0;     // 左サイド
      case 'SF': return 3.0;      // 右サイド
      case 'PF': return -1.5;     // 左インサイド
      case 'C':  return 1.5;      // 右インサイド
      default:   return (Math.random() - 0.5) * 6;
    }
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.chaserSet.clear();
    this.repulsionDirs.clear();
    this.defensivePositions.clear();
  }
}
