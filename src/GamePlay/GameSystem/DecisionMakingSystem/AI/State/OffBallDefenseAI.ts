import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { BaseStateAI } from "@/GamePlay/GameSystem/DecisionMakingSystem/AI/State/BaseStateAI";
import { PlayerStateManager } from "@/GamePlay/GameSystem/StatusCheckSystem";
import { IDLE_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/DashMotion";
import { Formation, FormationUtils, PlayerPosition } from "@/GamePlay/GameSystem/DecisionMakingSystem/FormationConfig";
import { DefenseRole, OffenseRole } from "@/GamePlay/GameSystem/StatusCheckSystem/PlayerStateTypes";

import { TacticalZoneType, getZonePosition } from "@/GamePlay/GameSystem/DecisionMakingSystem/TacticalZoneConfig";

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

  // LOW_MANゴール下ポジショニング用定数
  /** リバウンドポジション判定距離（ゴールからこの距離以遠→リバウンド位置） */
  private readonly REBOUND_POSITION_THRESHOLD: number = 6.0;
  /** ブロックポジション判定距離（ゴールからこの距離以内→ブロック位置） */
  private readonly BLOCK_POSITION_THRESHOLD: number = 6.0;
  /** リバウンド時のゴールからの距離 */
  private readonly REBOUND_GOAL_OFFSET: number = 0.5;
  /** ブロック時のゴールからの距離 */
  private readonly BLOCK_GOAL_OFFSET: number = 1.5;

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
   * AIの更新処理
   * 同じポジションのオフェンスプレイヤーをマンマークする
   * シュート時はリバウンドポジションへ移動
   */
  public update(deltaTime: number): void {
    // DefenseRoleを取得
    const defenseRole = this.character.defenseRole;

    // ボールが飛行中（シュート中）の場合
    if (this.ball.isInFlight()) {
      if (defenseRole === DefenseRole.LOW_MAN) {
        // LOW_MAN: ゴール下へ移動してリバウンドポジション
        this.handleLowManRebound(deltaTime);
      } else {
        this.handleWatchShot();
      }
      return;
    }

    // オンボールプレイヤーを取得
    const onBallPlayer = this.findOnBallPlayer();

    if (onBallPlayer) {
      const actionController = onBallPlayer.getActionController();
      const currentAction = actionController.getCurrentAction();
      if (currentAction && currentAction.startsWith('shoot_')) {
        if (defenseRole === DefenseRole.LOW_MAN) {
          // LOW_MAN: シュートモーション中もリバウンド位置へ
          this.handleLowManRebound(deltaTime);
        } else {
          // シュートモーション中もボールを見守る
          this.handleWatchShot();
        }
        return;
      }
    }

    // DefenseRoleに基づくディフェンス
    if (defenseRole === DefenseRole.POA) {
      // POA: メインハンドラーを直接マンマーク
      this.handleManToManDefense(deltaTime);
    } else if (defenseRole === DefenseRole.LOW_MAN) {
      // LOW_MAN専用: 状況に応じてゴール下ポジショニング
      this.handleLowManDefense(deltaTime);
    } else if (defenseRole) {
      // NAIL/CLOSEOUT/SCRAMBLER: ゾーンディフェンス
      this.handleZoneDefense(deltaTime);
    } else {
      // ロール未設定: 同ポジションマンマーク（フォールバック）
      this.handleManToManDefense(deltaTime);
    }
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
      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
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
      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
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
      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
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
      if (this.character.getMotionController().getCurrentMotionName() !== 'dash_forward') {
        this.character.getMotionController().play(DASH_FORWARD_MOTION);
      }
    } else {
      if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
        this.character.getMotionController().play(WALK_FORWARD_MOTION);
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

      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
      }
      return;
    }

    direction.normalize();

    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (!boundaryAdjusted) {
      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
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
        if (this.character.getMotionController().getCurrentMotionName() !== 'dash_forward') {
          this.character.getMotionController().play(DASH_FORWARD_MOTION);
        }
      } else {
        if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
          this.character.getMotionController().play(WALK_FORWARD_MOTION);
        }
      }
    } else {
      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
      }
    }
  }

  // ============================================
  // LOW_MANゴール下ポジショニング
  // ============================================

  /**
   * LOW_MAN専用ディフェンス処理
   * オンボールプレイヤーの位置に応じてブロック/リバウンド/通常ゾーンを切り替え
   */
  private handleLowManDefense(deltaTime: number): void {
    const onBallPlayer = this.findOnBallPlayer();

    if (!onBallPlayer) {
      // オンボールプレイヤーがいない場合: 通常ゾーンディフェンス
      this.handleZoneDefense(deltaTime);
      return;
    }

    // オンボールプレイヤーと守備ゴールの距離で判定
    const distFromGoal = this.getDistanceFromDefendingGoal(onBallPlayer);

    if (distFromGoal <= this.BLOCK_POSITION_THRESHOLD) {
      // ペイント付近以内: ブロック位置に陣取る
      this.handleLowManBlock(deltaTime, onBallPlayer);
    } else if (distFromGoal >= this.REBOUND_POSITION_THRESHOLD) {
      // 3Pライン付近以遠: リバウンド位置に陣取る
      this.handleLowManRebound(deltaTime);
    } else {
      // ミッドレンジ: 通常ゾーンディフェンス
      this.handleZoneDefense(deltaTime);
    }
  }

  /**
   * LOW_MANリバウンドポジション
   * 守備ゴール直下付近に移動してボールを見る
   */
  private handleLowManRebound(deltaTime: number): void {
    const defendingGoal = this.getDefendingGoalPosition();
    const myPosition = this.character.getPosition();

    // 守備ゴールの前方（コート中央寄り）にリバウンド位置を設定
    // allyはgoal2(-Z)を守備 → +Z方向にオフセット
    // enemyはgoal1(+Z)を守備 → -Z方向にオフセット
    const isAlly = this.character.team === 'ally';
    const zOffset = isAlly ? this.REBOUND_GOAL_OFFSET : -this.REBOUND_GOAL_OFFSET;

    const reboundPosition = new Vector3(
      defendingGoal.x,
      myPosition.y,
      defendingGoal.z + zOffset
    );

    const distanceToRebound = Vector3.Distance(myPosition, reboundPosition);

    // リバウンド位置に近い場合はボールを見て待機
    if (distanceToRebound < 1.0) {
      // リバウンドジャンプを試みる
      if (this.tryReboundJump()) {
        return;
      }

      // ボールの方を向く（ジャンプしなかった場合）
      const ballPosition = this.ball.getPosition();
      const toBall = new Vector3(
        ballPosition.x - myPosition.x,
        0,
        ballPosition.z - myPosition.z
      );
      if (toBall.length() > 0.01) {
        const angle = Math.atan2(toBall.x, toBall.z);
        this.character.setRotation(angle);
      }
      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
      }
      return;
    }

    // リバウンド位置へ移動
    const direction = new Vector3(
      reboundPosition.x - myPosition.x,
      0,
      reboundPosition.z - myPosition.z
    );
    direction.normalize();

    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (boundaryAdjusted) {
      const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
      if (adjustedDirection) {
        this.character.move(adjustedDirection, deltaTime);
        if (distanceToRebound > 3.0) {
          if (this.character.getMotionController().getCurrentMotionName() !== 'dash_forward') {
            this.character.getMotionController().play(DASH_FORWARD_MOTION);
          }
        } else {
          if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
            this.character.getMotionController().play(WALK_FORWARD_MOTION);
          }
        }
        return;
      }
    }

    if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
      this.character.getMotionController().play(IDLE_MOTION);
    }
  }

  /**
   * LOW_MANブロックポジション
   * 攻撃者とゴールの間に位置取りしてブロック
   */
  private handleLowManBlock(deltaTime: number, attacker: Character): void {
    const defendingGoal = this.getDefendingGoalPosition();
    const attackerPos = attacker.getPosition();
    const myPosition = this.character.getPosition();

    // ゴールから攻撃者方向への単位ベクトル
    const goalToAttacker = new Vector3(
      attackerPos.x - defendingGoal.x,
      0,
      attackerPos.z - defendingGoal.z
    );
    if (goalToAttacker.length() > 0.01) {
      goalToAttacker.normalize();
    }

    // ゴールから攻撃者方向に BLOCK_GOAL_OFFSET 分だけ前方に位置取り
    const blockPosition = new Vector3(
      defendingGoal.x + goalToAttacker.x * this.BLOCK_GOAL_OFFSET,
      myPosition.y,
      defendingGoal.z + goalToAttacker.z * this.BLOCK_GOAL_OFFSET
    );

    // 攻撃者の方を向いて移動
    this.moveTowardsMarkPosition(blockPosition, attacker, deltaTime);
  }

  /**
   * キャラクターと守備ゴール間の水平距離を計算
   */
  private getDistanceFromDefendingGoal(character: Character): number {
    const pos = character.getPosition();
    const goalPos = this.getDefendingGoalPosition();
    return Math.sqrt(
      Math.pow(pos.x - goalPos.x, 2) + Math.pow(pos.z - goalPos.z, 2)
    );
  }

  // ============================================
  // ゾーンディフェンス（NAIL, CLOSEOUT, SCRAMBLER用）
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
