/**
 * Layer 2: FieldAnalyzer（フィールド分析）
 * コート全体の状況を分析する
 * - 味方/敵の位置・状態・向き・アクション
 * - オープンスペース検出
 * - パスコース/シュートレーン分析
 * - マッチアップ状況
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { FieldGridUtils } from "../../config/FieldGridConfig";
import { FIELD_CONFIG } from "../../config/gameConfig";
import {
  FieldAnalysis,
  PlayerSnapshot,
  OpenSpace,
  PassLane,
  ShootingLane,
  MatchupInfo,
  ReboundPosition,
  CourtZone,
  MovementType,
  ActionPhase,
  ContesterInfo,
} from "../config/AILayerTypes";

/**
 * フィールド分析の設定
 */
export const FIELD_ANALYSIS_CONFIG = {
  // ゴール位置
  GOAL1_Z: 13.4,
  GOAL2_Z: -13.4,

  // スペース分析
  OPEN_SPACE_MIN_DISTANCE: 3.0,   // オープンスペース判定の最小距離
  SPACE_GRID_SIZE: 2.5,           // スペース分析のグリッドサイズ

  // パス分析
  PASS_LANE_WIDTH: 1.5,           // パスコースの幅
  PASS_MAX_DISTANCE: 15.0,        // パス最大距離

  // シュート分析
  CONTEST_DISTANCE: 3.0,          // コンテスト可能距離
  BLOCK_DISTANCE: 2.0,            // ブロック可能距離

  // ゾーン判定
  PAINT_DISTANCE: 4.0,
  THREE_POINT_MIN: 6.25,
  THREE_POINT_MAX: 7.5,

  // リバウンド
  REBOUND_POSITION_OFFSET: 2.5,   // ゴールからのオフセット
} as const;

/**
 * フィールド分析レイヤー
 */
export class FieldAnalyzer {
  constructor(_field: Field) {
    // 将来のフィールドベース分析用にFieldを使用予定
  }

  /**
   * フィールド全体を分析
   */
  analyze(
    self: Character,
    ball: Ball,
    allCharacters: Character[]
  ): FieldAnalysis {
    const myTeam = self.team;
    const attackingGoalZ = myTeam === 'ally'
      ? FIELD_ANALYSIS_CONFIG.GOAL1_Z
      : FIELD_ANALYSIS_CONFIG.GOAL2_Z;

    // 全選手のスナップショット作成
    const allSnapshots = allCharacters.map(c => this.createSnapshot(c, ball, attackingGoalZ));
    const selfSnapshot = allSnapshots.find(s => s.character === self)!;
    const teammates = allSnapshots.filter(s =>
      s.character.team === myTeam && s.character !== self
    );
    const opponents = allSnapshots.filter(s => s.character.team !== myTeam);
    const ballHolder = allSnapshots.find(s => s.hasBall) ?? null;

    // スペース分析
    const openSpaces = this.analyzeOpenSpaces(
      [selfSnapshot, ...teammates],
      opponents,
      myTeam,
      attackingGoalZ
    );

    // パス分析
    const passLanes = this.analyzePassLanes(
      selfSnapshot,
      teammates,
      opponents,
      ball
    );

    // シュート分析
    const myShootingLane = this.analyzeShootingLane(
      selfSnapshot,
      opponents,
      myTeam
    );
    const teammateShootingLanes = teammates.map(t =>
      this.analyzeShootingLane(t, opponents, myTeam)
    );

    // マッチアップ分析
    const matchups = this.analyzeMatchups(
      [selfSnapshot, ...teammates],
      opponents
    );
    const myMatchup = matchups.find(m => m.offensePlayer === self) ?? null;

    // コート支配分析
    const teamSpacing = this.calculateTeamSpacing([selfSnapshot, ...teammates]);
    const defenseCompactness = this.calculateDefenseCompactness(opponents);
    const paintCongestion = this.calculatePaintCongestion(allSnapshots, attackingGoalZ);

    // 特殊状況
    const fastBreakOpportunity = this.detectFastBreak(
      [selfSnapshot, ...teammates],
      opponents,
      ball
    );
    const turnoverRisk = this.calculateTurnoverRisk(selfSnapshot, opponents);

    // リバウンドポジション
    const reboundPositions = this.calculateReboundPositions(
      [selfSnapshot, ...teammates],
      myTeam
    );

    return {
      timestamp: Date.now(),

      teammates,
      opponents,
      self: selfSnapshot,
      ballHolder,

      openSpaces,
      bestOpenSpace: openSpaces.length > 0 ? openSpaces[0] : null,

      passLanes,
      openPassLanes: passLanes.filter(p => p.isOpen),
      bestPassOption: this.findBestPassOption(passLanes),

      myShootingLane,
      teammateShootingLanes,

      matchups,
      myMatchup,
      mismatches: matchups.filter(m =>
        m.mismatch !== 'even' && m.mismatch !== null
      ),

      teamSpacing,
      defenseCompactness,
      paintCongestion,

      fastBreakOpportunity,
      turnoverRisk,
      reboundPositions,
    };
  }

  /**
   * 選手のスナップショット作成
   */
  private createSnapshot(
    character: Character,
    ball: Ball,
    attackingGoalZ: number
  ): PlayerSnapshot {
    const pos = character.getPosition();
    const actionController = character.getActionController();
    const velocity = character.velocity ?? Vector3.Zero();

    // 向いている方向を取得（メッシュの回転から計算）
    const facingDirection = this.getFacingDirection(character);

    return {
      character,
      position: pos.clone(),
      facingDirection,
      velocity: velocity.clone(),
      isMoving: velocity.length() > 0.1,
      movementType: this.detectMovementType(character),

      currentAction: actionController?.getCurrentAction() ?? null,
      actionPhase: (actionController?.getCurrentPhase() ?? 'idle') as ActionPhase,
      isJumping: this.checkIsJumping(character),
      isGrounded: pos.y < 0.5,

      hasBall: ball.getHolder() === character,
      distanceToBall: Vector3.Distance(pos, ball.getPosition()),

      courtZone: this.determineCourtZone(pos, attackingGoalZ),
      gridCell: FieldGridUtils.worldToCell(pos.x, pos.z),

      position_role: character.playerData?.basic?.PositionMain ?? null,
    };
  }

  /**
   * 向いている方向を取得
   */
  private getFacingDirection(character: Character): Vector3 {
    const mesh = character.mesh;
    if (mesh) {
      const rotation = mesh.rotation.y;
      return new Vector3(Math.sin(rotation), 0, Math.cos(rotation));
    }
    return new Vector3(0, 0, 1);
  }

  /**
   * 移動タイプを検出
   */
  private detectMovementType(character: Character): MovementType {
    const velocity = character.velocity ?? Vector3.Zero();
    const speed = velocity.length();

    if (this.checkIsJumping(character)) {
      return 'jump';
    }
    if (speed < 0.1) {
      return 'idle';
    }
    if (speed < 3.0) {
      return 'walk';
    }
    return 'dash';
  }

  /**
   * ジャンプ中か判定
   */
  private checkIsJumping(character: Character): boolean {
    const pos = character.getPosition();
    return pos.y > 0.5;
  }

  /**
   * コートゾーンを判定
   */
  private determineCourtZone(position: Vector3, attackingGoalZ: number): CourtZone {
    const goalPos = new Vector3(0, 0, attackingGoalZ);
    const distance = Vector3.Distance(
      new Vector3(position.x, 0, position.z),
      new Vector3(goalPos.x, 0, goalPos.z)
    );

    // バックコート判定
    const isInBackcourt = attackingGoalZ > 0 ? position.z < 0 : position.z > 0;
    if (isInBackcourt) {
      return 'backcourt';
    }

    if (distance < FIELD_ANALYSIS_CONFIG.PAINT_DISTANCE) {
      return 'paint';
    }
    if (distance >= FIELD_ANALYSIS_CONFIG.THREE_POINT_MIN &&
        distance <= FIELD_ANALYSIS_CONFIG.THREE_POINT_MAX) {
      return 'three_point';
    }
    if (distance > FIELD_ANALYSIS_CONFIG.THREE_POINT_MAX) {
      return 'beyond_arc';
    }
    return 'mid_range';
  }

  /**
   * オープンスペース分析
   */
  private analyzeOpenSpaces(
    teammates: PlayerSnapshot[],
    opponents: PlayerSnapshot[],
    myTeam: 'ally' | 'enemy',
    attackingGoalZ: number
  ): OpenSpace[] {
    const spaces: OpenSpace[] = [];
    const gridSize = FIELD_ANALYSIS_CONFIG.SPACE_GRID_SIZE;
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;

    // グリッドベースでスペースを検出
    for (let x = -halfWidth + gridSize / 2; x < halfWidth; x += gridSize) {
      for (let z = -halfLength + gridSize / 2; z < halfLength; z += gridSize) {
        const center = new Vector3(x, 0, z);

        // 攻撃方向のみ（バックコートは除外）
        const isBackcourt = attackingGoalZ > 0 ? z < 0 : z > 0;
        if (isBackcourt) continue;

        // 最も近い敵を探す
        let nearestDefender: { character: Character; distance: number } | null = null;
        let minDistance = Infinity;

        for (const opp of opponents) {
          const dist = Vector3.Distance(center, opp.position);
          if (dist < minDistance) {
            minDistance = dist;
            nearestDefender = { character: opp.character, distance: dist };
          }
        }

        // 十分な距離があればオープンスペース
        if (minDistance > FIELD_ANALYSIS_CONFIG.OPEN_SPACE_MIN_DISTANCE) {
          const distanceToGoal = Math.abs(z - attackingGoalZ);
          const zone = this.determineCourtZone(center, attackingGoalZ);

          // このスペースに到達しやすい味方を特定
          const accessibleBy = teammates
            .filter(t => Vector3.Distance(t.position, center) < 5.0)
            .map(t => t.character);

          spaces.push({
            center,
            radius: minDistance * 0.5,
            zone,
            nearestDefender,
            scoringValue: this.calculateScoringValue(zone, distanceToGoal),
            accessibleBy,
          });
        }
      }
    }

    // 得点価値でソート
    return spaces.sort((a, b) => b.scoringValue - a.scoringValue);
  }

  /**
   * 得点価値を計算
   */
  private calculateScoringValue(zone: CourtZone, distanceToGoal: number): number {
    // ゾーンによる基本価値
    const zoneValues: Record<CourtZone, number> = {
      paint: 0.9,
      mid_range: 0.6,
      three_point: 0.7,
      beyond_arc: 0.3,
      backcourt: 0.0,
    };

    const baseValue = zoneValues[zone];
    const distanceModifier = Math.max(0, 1 - distanceToGoal / 15);

    return baseValue * 0.7 + distanceModifier * 0.3;
  }

  /**
   * パスコース分析
   */
  private analyzePassLanes(
    ballHolder: PlayerSnapshot,
    teammates: PlayerSnapshot[],
    opponents: PlayerSnapshot[],
    _ball: Ball
  ): PassLane[] {
    const lanes: PassLane[] = [];

    if (!ballHolder.hasBall) return lanes;

    for (const teammate of teammates) {
      const from = ballHolder.position;
      const to = teammate.position;
      const distance = Vector3.Distance(from, to);

      // 距離が遠すぎるパスは除外
      if (distance > FIELD_ANALYSIS_CONFIG.PASS_MAX_DISTANCE) continue;

      // パスコース上の敵を検出
      const obstacles: Character[] = [];
      for (const opp of opponents) {
        const distToLine = this.pointToLineDistance(opp.position, from, to);
        if (distToLine < FIELD_ANALYSIS_CONFIG.PASS_LANE_WIDTH &&
            this.isPointBetween(opp.position, from, to)) {
          obstacles.push(opp.character);
        }
      }

      const isOpen = obstacles.length === 0;

      // レシーバーのオープン度を計算
      const receiverOpenness = this.calculateReceiverOpenness(teammate, opponents);

      // リスクレベル計算
      const riskLevel = Math.min(1,
        obstacles.length * 0.3 +
        (distance > 10 ? 0.2 : 0) +
        (1 - receiverOpenness) * 0.3
      );

      lanes.push({
        from: ballHolder.character,
        to: teammate.character,
        isOpen,
        obstacleCount: obstacles.length,
        obstacles,
        distance,
        angle: this.calculateAngle(from, to),
        riskLevel,
        receiverOpenness,
      });
    }

    // オープン度とリスクでソート
    return lanes.sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return a.riskLevel - b.riskLevel;
    });
  }

  /**
   * レシーバーのオープン度を計算
   */
  private calculateReceiverOpenness(
    receiver: PlayerSnapshot,
    opponents: PlayerSnapshot[]
  ): number {
    let minDistance = Infinity;
    for (const opp of opponents) {
      const dist = Vector3.Distance(receiver.position, opp.position);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }

    // 3m以上離れていれば完全オープン
    if (minDistance >= 3.0) return 1.0;
    // 0mなら完全にマークされている
    return minDistance / 3.0;
  }

  /**
   * 点から線分への距離を計算
   */
  private pointToLineDistance(point: Vector3, lineStart: Vector3, lineEnd: Vector3): number {
    const line = lineEnd.subtract(lineStart);
    const pointVec = point.subtract(lineStart);

    const lineLength = line.length();
    if (lineLength === 0) return pointVec.length();

    const t = Math.max(0, Math.min(1, Vector3.Dot(pointVec, line) / (lineLength * lineLength)));
    const projection = lineStart.add(line.scale(t));

    return Vector3.Distance(point, projection);
  }

  /**
   * 点が2点間にあるか判定
   */
  private isPointBetween(point: Vector3, start: Vector3, end: Vector3): boolean {
    const startToPoint = Vector3.Distance(start, point);
    const pointToEnd = Vector3.Distance(point, end);
    const startToEnd = Vector3.Distance(start, end);

    // 誤差を許容
    return Math.abs(startToPoint + pointToEnd - startToEnd) < 0.5;
  }

  /**
   * 角度を計算（ラジアン）
   */
  private calculateAngle(from: Vector3, to: Vector3): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    return Math.atan2(dx, dz);
  }

  /**
   * シュートレーン分析
   */
  private analyzeShootingLane(
    shooter: PlayerSnapshot,
    opponents: PlayerSnapshot[],
    myTeam: 'ally' | 'enemy'
  ): ShootingLane {
    const targetGoal = myTeam === 'ally' ? 'goal1' : 'goal2';
    const goalZ = myTeam === 'ally'
      ? FIELD_ANALYSIS_CONFIG.GOAL1_Z
      : FIELD_ANALYSIS_CONFIG.GOAL2_Z;

    // シュートタイプ判定
    const goalPos = new Vector3(0, 0, goalZ);
    const distance = Vector3.Distance(
      new Vector3(shooter.position.x, 0, shooter.position.z),
      new Vector3(goalPos.x, 0, goalPos.z)
    );

    let shootType: ShootingLane['shootType'];
    if (distance < FIELD_ANALYSIS_CONFIG.PAINT_DISTANCE) {
      shootType = 'layup';
    } else if (distance < FIELD_ANALYSIS_CONFIG.THREE_POINT_MIN) {
      shootType = 'midrange';
    } else if (distance <= FIELD_ANALYSIS_CONFIG.THREE_POINT_MAX + 1.0) {
      shootType = '3pt';
    } else {
      shootType = 'out_of_range';
    }

    // コンテスター検出
    const contesters: ContesterInfo[] = [];
    for (const opp of opponents) {
      const distToShooter = Vector3.Distance(opp.position, shooter.position);

      if (distToShooter < FIELD_ANALYSIS_CONFIG.CONTEST_DISTANCE) {
        const canBlock = distToShooter < FIELD_ANALYSIS_CONFIG.BLOCK_DISTANCE &&
                         !opp.isJumping &&
                         opp.actionPhase === 'idle';
        const threatLevel = Math.max(0, 1 - distToShooter / FIELD_ANALYSIS_CONFIG.CONTEST_DISTANCE);

        contesters.push({
          character: opp.character,
          distance: distToShooter,
          canBlock,
          isJumping: opp.isJumping,
          threatLevel,
        });
      }
    }

    const isContested = contesters.length > 0;
    const totalThreat = contesters.reduce((sum, c) => sum + c.threatLevel, 0);
    const openness = Math.max(0, 1 - totalThreat);

    // 予想成功率（簡易計算）
    const baseRate = shootType === 'layup' ? 0.6 :
                     shootType === 'midrange' ? 0.45 :
                     shootType === '3pt' ? 0.35 : 0;
    const expectedSuccessRate = baseRate * openness;

    return {
      shooter: shooter.character,
      targetGoal,
      shootType,
      isContested,
      contesters,
      openness,
      expectedSuccessRate,
    };
  }

  /**
   * マッチアップ分析
   */
  private analyzeMatchups(
    teammates: PlayerSnapshot[],
    opponents: PlayerSnapshot[]
  ): MatchupInfo[] {
    const matchups: MatchupInfo[] = [];

    for (const teammate of teammates) {
      // 最も近い敵を見つける
      let nearestOpp: PlayerSnapshot | null = null;
      let minDist = Infinity;

      for (const opp of opponents) {
        const dist = Vector3.Distance(teammate.position, opp.position);
        if (dist < minDist) {
          minDist = dist;
          nearestOpp = opp;
        }
      }

      // ミスマッチ判定
      const { mismatch, reason, score } = this.evaluateMismatch(teammate, nearestOpp);

      matchups.push({
        offensePlayer: teammate.character,
        defensePlayer: nearestOpp?.character ?? null,
        distance: minDist,
        mismatch,
        mismatchReason: reason,
        mismatchScore: score,
      });
    }

    return matchups;
  }

  /**
   * ミスマッチを評価
   */
  private evaluateMismatch(
    offense: PlayerSnapshot,
    defense: PlayerSnapshot | null
  ): { mismatch: MatchupInfo['mismatch']; reason: string | null; score: number } {
    if (!defense) {
      return { mismatch: 'offense_advantage', reason: 'unguarded', score: 1.0 };
    }

    const offStats = offense.character.playerData?.stats;
    const defStats = defense.character.playerData?.stats;
    const offHeight = offense.character.config?.physical?.height ?? 1.8;
    const defHeight = defense.character.config?.physical?.height ?? 1.8;

    let score = 0;
    let primaryReason: string | null = null;

    // 身長差（±0.1m以上で優劣）
    const heightDiff = offHeight - defHeight;
    if (Math.abs(heightDiff) > 0.1) {
      score += heightDiff * 2; // 0.1m差で±0.2
      if (!primaryReason && Math.abs(heightDiff) > 0.1) {
        primaryReason = 'height';
      }
    }

    // スピード差
    if (offStats && defStats) {
      const offSpeed = offStats.speed ?? 50;
      const defSpeed = defStats.speed ?? 50;
      const speedDiff = (offSpeed - defSpeed) / 100;
      score += speedDiff * 0.3;
      if (!primaryReason && Math.abs(offSpeed - defSpeed) > 15) {
        primaryReason = 'speed';
      }
    }

    // スコアから優劣判定
    let mismatch: MatchupInfo['mismatch'] = 'even';
    if (score > 0.2) {
      mismatch = 'offense_advantage';
    } else if (score < -0.2) {
      mismatch = 'defense_advantage';
    }

    return { mismatch, reason: primaryReason, score: Math.max(-1, Math.min(1, score)) };
  }

  /**
   * チームスペーシングを計算
   */
  private calculateTeamSpacing(teammates: PlayerSnapshot[]): number {
    if (teammates.length < 2) return 1.0;

    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < teammates.length; i++) {
      for (let j = i + 1; j < teammates.length; j++) {
        totalDistance += Vector3.Distance(teammates[i].position, teammates[j].position);
        count++;
      }
    }

    const avgDistance = totalDistance / count;
    // 5m以上の平均距離で良いスペーシング
    return Math.min(1, avgDistance / 5);
  }

  /**
   * ディフェンスの密集度を計算
   */
  private calculateDefenseCompactness(opponents: PlayerSnapshot[]): number {
    if (opponents.length < 2) return 0;

    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < opponents.length; i++) {
      for (let j = i + 1; j < opponents.length; j++) {
        totalDistance += Vector3.Distance(opponents[i].position, opponents[j].position);
        count++;
      }
    }

    const avgDistance = totalDistance / count;
    // 3m以下の平均距離で密集
    return Math.max(0, 1 - avgDistance / 6);
  }

  /**
   * ペイントの混雑度を計算
   */
  private calculatePaintCongestion(
    allSnapshots: PlayerSnapshot[],
    attackingGoalZ: number
  ): number {
    const paintPlayers = allSnapshots.filter(s => {
      const goalPos = new Vector3(0, 0, attackingGoalZ);
      const dist = Vector3.Distance(
        new Vector3(s.position.x, 0, s.position.z),
        new Vector3(goalPos.x, 0, goalPos.z)
      );
      return dist < FIELD_ANALYSIS_CONFIG.PAINT_DISTANCE;
    });

    // 3人以上で混雑
    return Math.min(1, paintPlayers.length / 3);
  }

  /**
   * 速攻チャンスを検出
   */
  private detectFastBreak(
    teammates: PlayerSnapshot[],
    opponents: PlayerSnapshot[],
    _ball: Ball
  ): boolean {
    const ballHolder = teammates.find(t => t.hasBall);
    if (!ballHolder) return false;

    // ボール保持者より前方にいる味方
    const forwardTeammates = teammates.filter(t =>
      t !== ballHolder &&
      Math.abs(t.position.z) > Math.abs(ballHolder.position.z)
    );

    // 前方にいる敵
    const forwardOpponents = opponents.filter(o =>
      Math.abs(o.position.z) > Math.abs(ballHolder.position.z)
    );

    // 味方が敵より多い場合は速攻チャンス
    return forwardTeammates.length > forwardOpponents.length;
  }

  /**
   * ターンオーバーリスクを計算
   */
  private calculateTurnoverRisk(
    ballHolder: PlayerSnapshot,
    opponents: PlayerSnapshot[]
  ): number {
    if (!ballHolder.hasBall) return 0;

    let risk = 0;

    // 近くの敵の数
    const nearbyOpponents = opponents.filter(o =>
      Vector3.Distance(o.position, ballHolder.position) < 2.0
    );
    risk += nearbyOpponents.length * 0.2;

    // バウンダリー付近
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;
    if (Math.abs(ballHolder.position.x) > halfWidth - 1.0 ||
        Math.abs(ballHolder.position.z) > halfLength - 1.0) {
      risk += 0.2;
    }

    return Math.min(1, risk);
  }

  /**
   * リバウンドポジションを計算
   */
  private calculateReboundPositions(
    teammates: PlayerSnapshot[],
    myTeam: 'ally' | 'enemy'
  ): ReboundPosition[] {
    const goalZ = myTeam === 'ally'
      ? FIELD_ANALYSIS_CONFIG.GOAL1_Z
      : FIELD_ANALYSIS_CONFIG.GOAL2_Z;
    const offset = FIELD_ANALYSIS_CONFIG.REBOUND_POSITION_OFFSET;

    const positions: ReboundPosition[] = [
      { position: new Vector3(-1.5, 0, goalZ - offset), priority: 1, assignedTo: null },
      { position: new Vector3(1.5, 0, goalZ - offset), priority: 1, assignedTo: null },
      { position: new Vector3(0, 0, goalZ - offset * 1.5), priority: 2, assignedTo: null },
    ];

    // 近い味方をアサイン
    for (const pos of positions) {
      let minDist = Infinity;
      let closest: Character | null = null;

      for (const teammate of teammates) {
        const dist = Vector3.Distance(teammate.position, pos.position);
        if (dist < minDist && !positions.some(p => p.assignedTo === teammate.character)) {
          minDist = dist;
          closest = teammate.character;
        }
      }

      pos.assignedTo = closest;
    }

    return positions;
  }

  /**
   * ベストパスオプションを見つける
   */
  private findBestPassOption(passLanes: PassLane[]): PassLane | null {
    const openLanes = passLanes.filter(p => p.isOpen);
    if (openLanes.length === 0) return null;

    // オープン度が高く、リスクが低いものを選択
    return openLanes.reduce((best, current) => {
      const bestScore = best.receiverOpenness - best.riskLevel;
      const currentScore = current.receiverOpenness - current.riskLevel;
      return currentScore > bestScore ? current : best;
    });
  }
}
