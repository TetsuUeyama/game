import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { PlayerStateManager } from "../../state";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { Formation, FormationUtils, PlayerPosition } from "../../config/FormationConfig";
import { DefenseRole, OffenseRole } from "../../state/PlayerStateTypes";
import { SAFE_BOUNDARY_CONFIG } from "../../config/gameConfig";
import { TacticalZoneType, getZonePosition } from "../../config/TacticalZoneConfig";

/**
 * オフボールディフェンダー時のAI
 * 同じポジションのオフェンスプレイヤーをマンマークする
 * シュート時はリバウンドポジションへ移動
 */
export class OffBallDefenseAI extends BaseStateAI {
  private currentFormation: Formation;
  private decisionTimer: number = 0;
  private cachedTargetPosition: { x: number; z: number; markTarget: Character | null } | null = null;

  // ゾーンディフェンス用
  private zoneDefensePosition: { x: number; z: number } | null = null;
  private zoneDefenseType: TacticalZoneType | null = null;
  /** ゾーン侵入検知半径 */
  private readonly ZONE_INTRUDER_DETECTION_RADIUS: number = 4.0;
  /** マーク時の距離（相手とゴールの間にポジション） */
  private readonly ZONE_MARK_DISTANCE: number = 1.5;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field,
    playerState?: PlayerStateManager
  ) {
    super(character, ball, allCharacters, field, playerState);
    this.currentFormation = FormationUtils.getDefaultDefenseFormation();
  }

  /**
   * フォーメーションを設定
   */
  public setFormation(formation: Formation): void {
    this.currentFormation = formation;
  }

  /**
   * フォーメーション名でフォーメーションを設定
   */
  public setFormationByName(name: string): boolean {
    const formation = FormationUtils.getDefenseFormation(name);
    if (formation) {
      this.currentFormation = formation;
      return true;
    }
    return false;
  }

  /**
   * AIの更新処理
   * 同じポジションのオフェンスプレイヤーをマンマークする
   * シュート時はリバウンドポジションへ移動
   * スローイン時は外側マスを避ける
   */
  public update(deltaTime: number): void {
    // ボールが飛行中（シュート中）の場合はその場でボールを見守る
    // シュート結果が出るまで動かない
    if (this.ball.isInFlight()) {
      this.handleWatchShot();
      return;
    }

    // オンボールプレイヤーを取得
    const onBallPlayer = this.findOnBallPlayer();

    // スローイン中かチェック（相手チームがスローインスロワーの場合）
    if (onBallPlayer && onBallPlayer.getIsThrowInThrower()) {
      // スローイン中はマンマークしつつ外側マスを避ける
      this.handleThrowInDefense(deltaTime);
      return;
    }

    if (onBallPlayer) {
      const actionController = onBallPlayer.getActionController();
      const currentAction = actionController.getCurrentAction();
      if (currentAction && currentAction.startsWith('shoot_')) {
        // シュートモーション中もボールを見守る
        this.handleWatchShot();
        return;
      }
    }

    // DefenseRoleに基づくディフェンス
    const defenseRole = this.character.defenseRole;

    if (defenseRole === DefenseRole.POA) {
      // POA: メインハンドラーを直接マンマーク
      this.handleManToManDefense(deltaTime);
    } else if (defenseRole) {
      // NAIL/LOW_MAN/CLOSEOUT/SCRAMBLER: ゾーンディフェンス
      this.handleZoneDefense(deltaTime);
    } else {
      // ロール未設定: 同ポジションマンマーク（フォールバック）
      this.handleManToManDefense(deltaTime);
    }
  }

  /**
   * スローイン時のディフェンス処理
   * 外側マスに入らないようにしながらマンマークする
   */
  private handleThrowInDefense(deltaTime: number): void {
    // 判断タイマーを更新
    this.decisionTimer += deltaTime;

    // 判断間隔に達したら目標位置を再計算
    if (this.decisionTimer >= this.getDecisionInterval() || this.cachedTargetPosition === null) {
      this.decisionTimer = 0;
      this.recalculateThrowInMarkPosition();
    }

    // キャッシュされた目標がない場合はフォーメーション位置へ
    if (!this.cachedTargetPosition || !this.cachedTargetPosition.markTarget) {
      this.handleFormationPositionAvoidingEdge(deltaTime);
      return;
    }

    const myPosition = this.character.getPosition();
    const idealPosition = new Vector3(
      this.cachedTargetPosition.x,
      myPosition.y,
      this.cachedTargetPosition.z
    );

    // 理想位置に向かって移動
    this.moveTowardsMarkPosition(idealPosition, this.cachedTargetPosition.markTarget, deltaTime);
  }

  /**
   * スローイン時のマーク位置を再計算してキャッシュ
   */
  private recalculateThrowInMarkPosition(): void {
    // マークする相手を探す
    const markTarget = this.findMarkTarget();

    if (!markTarget) {
      this.cachedTargetPosition = null;
      return;
    }

    // マーク対象の位置を取得
    const targetPosition = markTarget.getPosition();

    // 守るべきゴールの位置を取得
    const defendingGoal = this.getDefendingGoalPosition();

    // マーク対象とゴールの間に位置取り
    const targetToGoal = new Vector3(
      defendingGoal.x - targetPosition.x,
      0,
      defendingGoal.z - targetPosition.z
    );

    if (targetToGoal.length() > 0.01) {
      targetToGoal.normalize();
    }

    // マーク対象から1.5m程度ゴール側に位置取り
    const markDistance = 1.5;
    let idealX = targetPosition.x + targetToGoal.x * markDistance;
    let idealZ = targetPosition.z + targetToGoal.z * markDistance;

    // 外側マスを避ける（最外周マージン以内に入らない）
    idealX = Math.max(SAFE_BOUNDARY_CONFIG.minX, Math.min(SAFE_BOUNDARY_CONFIG.maxX, idealX));
    idealZ = Math.max(SAFE_BOUNDARY_CONFIG.minZ, Math.min(SAFE_BOUNDARY_CONFIG.maxZ, idealZ));

    this.cachedTargetPosition = {
      x: idealX,
      z: idealZ,
      markTarget: markTarget,
    };
  }

  /**
   * 外側マスを避けながらフォーメーション位置へ移動
   */
  private handleFormationPositionAvoidingEdge(deltaTime: number): void {
    const playerPosition = this.character.playerPosition as PlayerPosition;
    if (!playerPosition) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // フォーメーションから目標位置を取得
    const isAllyTeam = this.character.team === 'ally';
    const targetPos = FormationUtils.getTargetPosition(
      this.currentFormation,
      playerPosition,
      isAllyTeam
    );

    if (!targetPos) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 外側マスを避ける
    const safeX = Math.max(SAFE_BOUNDARY_CONFIG.minX, Math.min(SAFE_BOUNDARY_CONFIG.maxX, targetPos.x));
    const safeZ = Math.max(SAFE_BOUNDARY_CONFIG.minZ, Math.min(SAFE_BOUNDARY_CONFIG.maxZ, targetPos.z));

    const targetPosition = new Vector3(
      safeX,
      this.character.getPosition().y,
      safeZ
    );

    this.moveTowardsFormationPosition(targetPosition, deltaTime);
  }

  /**
   * マンツーマンディフェンス処理
   * 同じポジションのオフェンスプレイヤーをマークする
   */
  private handleManToManDefense(deltaTime: number): void {
    // 判断タイマーを更新
    this.decisionTimer += deltaTime;

    // 判断間隔に達したら目標位置を再計算
    if (this.decisionTimer >= this.getDecisionInterval() || this.cachedTargetPosition === null) {
      this.decisionTimer = 0;
      this.recalculateMarkPosition();
    }

    // キャッシュされた目標がない場合はフォーメーション位置へ
    if (!this.cachedTargetPosition || !this.cachedTargetPosition.markTarget) {
      this.handleFormationPosition(deltaTime);
      return;
    }

    const myPosition = this.character.getPosition();
    const idealPosition = new Vector3(
      this.cachedTargetPosition.x,
      myPosition.y,
      this.cachedTargetPosition.z
    );

    // 理想位置に向かって移動
    this.moveTowardsMarkPosition(idealPosition, this.cachedTargetPosition.markTarget, deltaTime);
  }

  /**
   * マーク位置を再計算してキャッシュ
   */
  private recalculateMarkPosition(): void {
    // マークする相手を探す
    const markTarget = this.findMarkTarget();

    if (!markTarget) {
      this.cachedTargetPosition = null;
      return;
    }

    // マーク対象の位置を取得
    const targetPosition = markTarget.getPosition();

    // 守るべきゴールの位置を取得
    const defendingGoal = this.getDefendingGoalPosition();

    // マーク対象とゴールの間に位置取り（マーク対象から少し離れた位置）
    const targetToGoal = new Vector3(
      defendingGoal.x - targetPosition.x,
      0,
      defendingGoal.z - targetPosition.z
    );

    if (targetToGoal.length() > 0.01) {
      targetToGoal.normalize();
    }

    // マーク対象から1.5m程度ゴール側に位置取り
    const markDistance = 1.5;
    this.cachedTargetPosition = {
      x: targetPosition.x + targetToGoal.x * markDistance,
      z: targetPosition.z + targetToGoal.z * markDistance,
      markTarget: markTarget,
    };
  }

  /**
   * フォーメーション位置への移動処理（フォールバック用）
   */
  private handleFormationPosition(deltaTime: number): void {
    const playerPosition = this.character.playerPosition as PlayerPosition;
    if (!playerPosition) {
      // ポジションが設定されていない場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // フォーメーションから目標位置を取得
    const isAllyTeam = this.character.team === 'ally';
    const targetPos = FormationUtils.getTargetPosition(
      this.currentFormation,
      playerPosition,
      isAllyTeam
    );

    if (!targetPos) {
      // 目標位置がない場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const targetPosition = new Vector3(
      targetPos.x,
      this.character.getPosition().y,
      targetPos.z
    );

    // 目標位置に向かって移動
    this.moveTowardsFormationPosition(targetPosition, deltaTime);
  }

  /**
   * マーク位置に向かって移動（マーク対象を見ながら）
   */
  private moveTowardsMarkPosition(targetPosition: Vector3, markTarget: Character, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    // マーク対象の方を向く
    const targetPos = markTarget.getPosition();
    const toTarget = new Vector3(
      targetPos.x - currentPosition.x,
      0,
      targetPos.z - currentPosition.z
    );
    if (toTarget.length() > 0.01) {
      const angle = Math.atan2(toTarget.x, toTarget.z);
      this.character.setRotation(angle);
    }

    // 目標に近い場合は待機
    if (distanceToTarget < 0.5) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    direction.normalize();

    // 移動方向を決定（境界チェック・衝突チェック）
    let moveDirection = direction;
    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (boundaryAdjusted) {
      const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
      if (adjustedDirection) {
        moveDirection = adjustedDirection;
      }
    }

    this.character.move(moveDirection, deltaTime);

    if (distanceToTarget > 3.0) {
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }
  }

  /**
   * フォーメーション位置に向かって移動
   */
  private moveTowardsFormationPosition(targetPosition: Vector3, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    // 目標に近い場合は待機（ボールの方を向く）
    if (distanceToTarget < 0.5) {
      const ballPosition = this.ball.getPosition();
      const toBall = new Vector3(
        ballPosition.x - currentPosition.x,
        0,
        ballPosition.z - currentPosition.z
      );
      if (toBall.length() > 0.01) {
        const angle = Math.atan2(toBall.x, toBall.z);
        this.character.setRotation(angle);
      }

      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    direction.normalize();

    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (!boundaryAdjusted) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);

    if (adjustedDirection) {
      // 移動方向を向く
      const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
      this.character.setRotation(angle);

      this.character.move(adjustedDirection, deltaTime);

      if (distanceToTarget > 3.0) {
        if (this.character.getCurrentMotionName() !== 'dash_forward') {
          this.character.playMotion(DASH_FORWARD_MOTION);
        }
      } else {
        if (this.character.getCurrentMotionName() !== 'walk_forward') {
          this.character.playMotion(WALK_FORWARD_MOTION);
        }
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  // ============================================
  // ゾーンディフェンス（NAIL, LOW_MAN, CLOSEOUT, SCRAMBLER用）
  // ============================================

  /**
   * ゾーンディフェンス処理
   * 担当ゾーンにポジションを取り、侵入者をマークする
   */
  private handleZoneDefense(deltaTime: number): void {
    // 守備側のゴール方向を基準にゾーン位置を計算
    // 攻撃側のチームに対する守備なので、相手の攻撃方向で計算
    const isDefendingAllyGoal = this.character.team === 'ally';

    // ゾーンが未選択の場合は選択
    if (!this.zoneDefensePosition || !this.zoneDefenseType) {
      this.selectDefenseZone(isDefendingAllyGoal);
    }

    if (!this.zoneDefensePosition) {
      // ゾーン選択に失敗した場合はフォーメーション位置へ
      this.handleFormationPosition(deltaTime);
      return;
    }

    // ゾーン付近に侵入した相手を検出
    const intruder = this.findIntruderInZone();

    if (intruder) {
      // 侵入者をマーク（侵入者とゴールの間にポジション）
      this.handleZoneMarkIntruder(deltaTime, intruder);
      return;
    }

    // 侵入者がいない場合: ゾーン位置にポジション取り
    const myPosition = this.character.getPosition();
    const targetPosition = new Vector3(
      this.zoneDefensePosition.x,
      myPosition.y,
      this.zoneDefensePosition.z
    );

    this.moveTowardsFormationPosition(targetPosition, deltaTime);
  }

  /**
   * DefenseRoleに対応する担当ゾーンリストを取得
   */
  private getZonesForRole(): TacticalZoneType[] {
    switch (this.character.defenseRole) {
      case DefenseRole.NAIL:
        return ['elbow_left', 'elbow_right', 'high_post'];
      case DefenseRole.LOW_MAN:
        return ['low_post_left', 'low_post_right', 'mid_post'];
      case DefenseRole.CLOSEOUT:
        return ['wing_left', 'wing_right', 'corner_left', 'corner_right'];
      case DefenseRole.SCRAMBLER:
        return ['top', 'high_post'];
      default:
        return [];
    }
  }

  /**
   * 担当ゾーンから最適なゾーンを選択
   * 自分の現在位置に最も近いゾーンを選び、チームメイトとの重複を回避
   */
  private selectDefenseZone(isDefendingAllyGoal: boolean): void {
    const zones = this.getZonesForRole();
    if (zones.length === 0) return;

    // 守備時のゾーン位置は、相手の攻撃ゴール方向で計算
    // ally守備 → enemyが+Z方向を攻める → isAllyTeam=false でゾーン計算
    const isAllyTeamForZone = !isDefendingAllyGoal;
    const myPosition = this.character.getPosition();

    // チームメイトのゾーンディフェンス位置を取得（重複回避）
    const teammates = this.allCharacters.filter(
      c => c !== this.character && c.team === this.character.team
    );

    let bestZone: TacticalZoneType | null = null;
    let bestDistSq = Infinity;

    for (const zone of zones) {
      const zonePos = getZonePosition(zone, isAllyTeamForZone);

      // チームメイトが既にこのゾーン付近にいるかチェック
      const occupied = teammates.some(t => {
        const pos = t.getPosition();
        return Math.pow(pos.x - zonePos.x, 2) + Math.pow(pos.z - zonePos.z, 2) < 2.5 * 2.5;
      });
      if (occupied) continue;

      const distSq = Math.pow(myPosition.x - zonePos.x, 2) + Math.pow(myPosition.z - zonePos.z, 2);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestZone = zone;
      }
    }

    // 全て占有されている場合は最初のゾーンを選択
    if (!bestZone) {
      bestZone = zones[0];
    }

    const isAllyForZone = !isDefendingAllyGoal;
    const zonePos = getZonePosition(bestZone, isAllyForZone);
    this.zoneDefensePosition = { x: zonePos.x, z: zonePos.z };
    this.zoneDefenseType = bestZone;
  }

  /**
   * 担当ゾーン付近に侵入した相手を検出
   */
  private findIntruderInZone(): Character | null {
    if (!this.zoneDefensePosition) return null;

    const opponentTeam = this.character.team === 'ally' ? 'enemy' : 'ally';
    let closestIntruder: Character | null = null;
    let closestDistance = this.ZONE_INTRUDER_DETECTION_RADIUS;

    for (const character of this.allCharacters) {
      if (character.team !== opponentTeam) continue;

      const pos = character.getPosition();
      const dist = Math.sqrt(
        Math.pow(pos.x - this.zoneDefensePosition.x, 2) +
        Math.pow(pos.z - this.zoneDefensePosition.z, 2)
      );

      if (dist < closestDistance) {
        closestDistance = dist;
        closestIntruder = character;
      }
    }

    return closestIntruder;
  }

  /**
   * ゾーン侵入者をマーク（侵入者とゴールの間にポジション）
   */
  private handleZoneMarkIntruder(deltaTime: number, intruder: Character): void {
    const myPosition = this.character.getPosition();
    const intruderPos = intruder.getPosition();

    // 守るべきゴール方向
    const defendingGoal = this.getDefendingGoalPosition();
    const toGoal = new Vector3(
      defendingGoal.x - intruderPos.x,
      0,
      defendingGoal.z - intruderPos.z
    );
    if (toGoal.length() > 0.01) {
      toGoal.normalize();
    }

    // 侵入者とゴールの間にポジション
    const markPosition = new Vector3(
      intruderPos.x + toGoal.x * this.ZONE_MARK_DISTANCE,
      myPosition.y,
      intruderPos.z + toGoal.z * this.ZONE_MARK_DISTANCE
    );

    this.moveTowardsMarkPosition(markPosition, intruder, deltaTime);
  }

  // ============================================
  // マンツーマンマーク（POA、ロール未設定用）
  // ============================================

  /**
   * マークする相手を探す
   * 優先順位: 1. DefenseRoleに対応するOffenseRole → 2. 同ポジション → 3. 最寄りのオフボールプレイヤー
   */
  private findMarkTarget(): Character | null {
    const opponentTeam = this.character.team === 'ally' ? 'enemy' : 'ally';

    // 1. DefenseRoleに対応するOffenseRoleの相手を探す（最優先）
    const targetOffenseRoles = this.getTargetOffenseRoles();
    if (targetOffenseRoles) {
      for (const targetRole of targetOffenseRoles) {
        for (const char of this.allCharacters) {
          if (char.team === opponentTeam && char.offenseRole === targetRole) {
            return char;
          }
        }
      }
    }

    // 2. 同ポジションの相手を探す（フォールバック）
    const myPosition = this.character.playerPosition;
    if (myPosition) {
      for (const char of this.allCharacters) {
        if (char.team === opponentTeam && char.playerPosition === myPosition) {
          return char;
        }
      }
    }

    // 3. オフボールプレイヤーを探す（最終フォールバック）
    return this.findOffBallPlayer();
  }

  /**
   * DefenseRoleから対応するOffenseRoleのリストを取得
   * POA → MAIN_HANDLER
   * NAIL → SECOND_HANDLER, SLASHER
   * LOW_MAN → DUNKER
   * CLOSEOUT → SPACER
   * SCRAMBLER → null（ロール指定なし）
   */
  private getTargetOffenseRoles(): OffenseRole[] | null {
    switch (this.character.defenseRole) {
      case DefenseRole.POA:
        return [OffenseRole.MAIN_HANDLER];
      case DefenseRole.NAIL:
        return [OffenseRole.SECOND_HANDLER, OffenseRole.SLASHER];
      case DefenseRole.LOW_MAN:
        return [OffenseRole.DUNKER];
      case DefenseRole.CLOSEOUT:
        return [OffenseRole.SPACER];
      default:
        return null;
    }
  }
}
