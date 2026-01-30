/**
 * Layer 4: IndividualTactician（個人戦術）
 * チーム戦術を受けて、個人としてどう行動すべきかを決定する
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import {
  SituationContext,
  FieldAnalysis,
  TeamDirective,
  TacticalAction,
} from "../config/AILayerTypes";

/**
 * 個人戦術の設定
 */
export const INDIVIDUAL_TACTICS_CONFIG = {
  // 距離閾値
  CLOSE_DISTANCE: 2.0,           // 近い距離
  MEDIUM_DISTANCE: 5.0,          // 中距離
  FAR_DISTANCE: 10.0,            // 遠い距離

  // シュート関連
  OPEN_SHOT_THRESHOLD: 0.6,      // オープンショットとみなす閾値
  GOOD_SHOT_THRESHOLD: 0.4,      // 良いショットとみなす閾値

  // スペーシング
  MIN_SPACING_DISTANCE: 3.0,     // 味方との最小距離
  IDEAL_SPACING_DISTANCE: 5.0,   // 理想的な味方との距離
} as const;

/**
 * 個人戦術決定器
 */
export class IndividualTactician {
  /**
   * 戦術的行動を決定
   */
  decide(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    // フェーズに応じて処理を分岐
    switch (situation.phase) {
      case 'offense':
        return this.decideOffenseTactics(character, situation, fieldAnalysis, teamDirective);
      case 'defense':
        return this.decideDefenseTactics(character, situation, fieldAnalysis, teamDirective);
      case 'transition':
        return this.decideTransitionTactics(character, situation, fieldAnalysis, teamDirective);
      case 'deadball':
        return this.createWaitAction('Deadball situation');
    }
  }

  /**
   * オフェンス時の戦術決定
   */
  private decideOffenseTactics(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    // オンボールかオフボールかで分岐
    if (situation.ballRelation === 'on_ball') {
      return this.decideOnBallOffense(character, situation, fieldAnalysis, teamDirective);
    } else {
      return this.decideOffBallOffense(character, situation, fieldAnalysis, teamDirective);
    }
  }

  /**
   * オンボールオフェンスの戦術決定
   */
  private decideOnBallOffense(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    const alternatives: TacticalAction[] = [];

    // 1. ショットクロック戦略チェック
    if (teamDirective.shotClockStrategy === 'hold' && situation.shotClockRemaining > 10) {
      return this.createMoveAction(
        this.findSafePosition(fieldAnalysis),
        0.6,
        'Holding ball - shot clock strategy'
      );
    }

    // 2. シュートチャンス評価
    if (fieldAnalysis.myShootingLane) {
      const shootingLane = fieldAnalysis.myShootingLane;

      // オープンショット
      if (shootingLane.openness >= INDIVIDUAL_TACTICS_CONFIG.OPEN_SHOT_THRESHOLD &&
          shootingLane.shootType !== 'out_of_range') {
        return {
          type: 'shoot',
          priority: 0.9,
          reason: `Open ${shootingLane.shootType} shot available`,
          expectedOutcome: `${Math.round(shootingLane.expectedSuccessRate * 100)}% success rate`,
          alternativeActions: [],
        };
      }

      // まあまあのショット
      if (shootingLane.openness >= INDIVIDUAL_TACTICS_CONFIG.GOOD_SHOT_THRESHOLD &&
          shootingLane.shootType !== 'out_of_range') {
        alternatives.push({
          type: 'shoot',
          priority: 0.6,
          reason: `Contested ${shootingLane.shootType} shot`,
          expectedOutcome: `${Math.round(shootingLane.expectedSuccessRate * 100)}% success rate`,
          alternativeActions: [],
        });
      }
    }

    // 3. パスオプション評価
    if (fieldAnalysis.bestPassOption) {
      const passOption = fieldAnalysis.bestPassOption;

      // プライマリオプションへのパス
      const targetPosition = passOption.to.playerData?.basic?.PositionMain;
      if (teamDirective.primaryOption && targetPosition === teamDirective.primaryOption) {
        return {
          type: 'pass',
          priority: 0.85,
          targetPlayer: passOption.to,
          reason: `Pass to primary option (${teamDirective.primaryOption})`,
          expectedOutcome: 'Set up primary scorer',
          alternativeActions: alternatives,
        };
      }

      // ミスマッチへのパス
      if (teamDirective.targetMismatch === passOption.to) {
        return {
          type: 'pass',
          priority: 0.8,
          targetPlayer: passOption.to,
          reason: 'Pass to mismatch target',
          expectedOutcome: 'Exploit mismatch',
          alternativeActions: alternatives,
        };
      }

      // オープンな味方へのパス
      if (passOption.isOpen && passOption.receiverOpenness > 0.7) {
        alternatives.push({
          type: 'pass',
          priority: 0.7,
          targetPlayer: passOption.to,
          reason: 'Pass to open teammate',
          expectedOutcome: 'Better shooting opportunity',
          alternativeActions: [],
        });
      }
    }

    // 4. ドライブ検討
    if (fieldAnalysis.bestOpenSpace && situation.courtZone !== 'paint') {
      const space = fieldAnalysis.bestOpenSpace;
      if (space.zone === 'paint' || space.zone === 'mid_range') {
        alternatives.push({
          type: 'drive',
          priority: 0.65,
          targetPosition: space.center,
          reason: 'Open lane to basket',
          expectedOutcome: 'Get closer to basket',
          alternativeActions: [],
        });
      }
    }

    // 5. フォーメーションに応じた行動
    switch (teamDirective.offenseFormation) {
      case 'isolation':
        // アイソレーション：1on1を仕掛ける
        if (fieldAnalysis.myMatchup?.mismatch === 'offense_advantage') {
          return {
            type: 'drive',
            priority: 0.8,
            reason: 'Isolation play - exploit mismatch',
            expectedOutcome: 'Score or draw foul',
            alternativeActions: alternatives,
          };
        }
        break;

      case 'post_up':
        // ポストアップ：ペイント付近なら
        if (situation.isInPaint || situation.courtZone === 'mid_range') {
          return {
            type: 'post_up',
            priority: 0.75,
            reason: 'Post up play',
            expectedOutcome: 'Create scoring opportunity inside',
            alternativeActions: alternatives,
          };
        }
        break;
    }

    // 6. デフォルト：最も優先度の高い行動を選択
    if (alternatives.length > 0) {
      alternatives.sort((a, b) => b.priority - a.priority);
      return {
        ...alternatives[0],
        alternativeActions: alternatives.slice(1),
      };
    }

    // 何もなければスペースに動く
    return this.createMoveAction(
      this.findBestPosition(character, fieldAnalysis, teamDirective),
      0.5,
      'Looking for opportunity'
    );
  }

  /**
   * オフボールオフェンスの戦術決定
   */
  private decideOffBallOffense(
    character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    const myPosition = character.playerData?.basic?.PositionMain;

    // 1. 自分がプライマリオプションなら良いポジションに移動
    if (teamDirective.primaryOption === myPosition) {
      // オープンスポットを探す
      const openSpace = fieldAnalysis.openSpaces.find(s =>
        s.zone === 'three_point' || s.zone === 'mid_range'
      );

      if (openSpace) {
        return {
          type: 'spot_up',
          priority: 0.8,
          targetPosition: openSpace.center,
          reason: 'Primary option - getting open',
          expectedOutcome: 'Ready for catch and shoot',
          alternativeActions: [],
        };
      }
    }

    // 2. ミスマッチターゲットならポストアップ位置へ
    if (teamDirective.targetMismatch === character) {
      return {
        type: 'post_up',
        priority: 0.8,
        targetPosition: this.findPostUpPosition(character, fieldAnalysis),
        reason: 'Mismatch target - establishing position',
        expectedOutcome: 'Ready for entry pass',
        alternativeActions: [],
      };
    }

    // 3. スペーシング維持
    const needsToSpace = this.checkNeedsSpacing(character, fieldAnalysis);
    if (needsToSpace) {
      const spacingTarget = this.findSpacingPosition(character, fieldAnalysis);
      if (spacingTarget) {
        return {
          type: 'move_to_space',
          priority: 0.6,
          targetPosition: spacingTarget,
          reason: 'Maintaining spacing',
          expectedOutcome: 'Better floor balance',
          alternativeActions: [],
        };
      }
    }

    // 4. ポジション別のデフォルト行動
    switch (myPosition) {
      case 'C':
      case 'PF':
        // ビッグマン：ペイント付近でポジション取り
        return {
          type: 'post_up',
          priority: 0.5,
          targetPosition: this.findPostUpPosition(character, fieldAnalysis),
          reason: 'Big man positioning',
          expectedOutcome: 'Ready for lob or rebound',
          alternativeActions: [],
        };

      case 'SG':
      case 'SF':
        // ウイング：3ポイントラインでスポットアップ
        const wingSpot = fieldAnalysis.openSpaces.find(s => s.zone === 'three_point');
        if (wingSpot) {
          return {
            type: 'spot_up',
            priority: 0.5,
            targetPosition: wingSpot.center,
            reason: 'Wing spotting up',
            expectedOutcome: 'Ready for kick-out',
            alternativeActions: [],
          };
        }
        break;

      case 'PG':
        // ポイントガード：ボールハンドラーが別にいる場合はスポットアップ
        return {
          type: 'spot_up',
          priority: 0.5,
          targetPosition: this.findPGSpotPosition(fieldAnalysis),
          reason: 'PG spotting up',
          expectedOutcome: 'Ready for reset or shot',
          alternativeActions: [],
        };
    }

    // 5. デフォルト：適切なスペースに移動
    return this.createMoveAction(
      this.findBestPosition(character, fieldAnalysis, teamDirective),
      0.4,
      'Off-ball movement'
    );
  }

  /**
   * ディフェンス時の戦術決定
   */
  private decideDefenseTactics(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    // 自分のマッチアップを取得
    const myMatchup = fieldAnalysis.matchups.find(m =>
      m.defensePlayer === character
    );

    // ディフェンススキームに応じて処理
    switch (teamDirective.defenseScheme) {
      case 'man_to_man':
        return this.decideManToManDefense(character, situation, fieldAnalysis, teamDirective, myMatchup);

      case 'zone_2_3':
      case 'zone_3_2':
      case 'zone_1_3_1':
        return this.decideZoneDefense(character, situation, fieldAnalysis, teamDirective);

      case 'press_full':
      case 'press_half':
        return this.decidePressDefense(character, situation, fieldAnalysis, teamDirective);

      default:
        return this.decideManToManDefense(character, situation, fieldAnalysis, teamDirective, myMatchup);
    }
  }

  /**
   * マンツーマンディフェンス
   */
  private decideManToManDefense(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective,
    myMatchup: ReturnType<typeof this.findMyDefenseMatchup>
  ): TacticalAction {
    // オンボールディフェンスか判定
    const isOnBallDefender = fieldAnalysis.ballHolder &&
      myMatchup?.offensePlayer === fieldAnalysis.ballHolder.character;

    if (isOnBallDefender) {
      return this.decideOnBallDefense(character, situation, fieldAnalysis, teamDirective);
    } else {
      return this.decideOffBallDefense(character, situation, fieldAnalysis, teamDirective, myMatchup);
    }
  }

  /**
   * オンボールディフェンス
   */
  private decideOnBallDefense(
    _character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    const ballHolder = fieldAnalysis.ballHolder;
    if (!ballHolder) {
      return this.createWaitAction('No ball holder');
    }

    // 1. シュートアクション中ならブロック試行
    if (ballHolder.currentAction?.startsWith('shoot_') &&
        ballHolder.actionPhase !== 'idle') {
      const distance = Vector3.Distance(
        fieldAnalysis.self.position,
        ballHolder.position
      );

      if (distance < 2.5 && !fieldAnalysis.self.isJumping) {
        return {
          type: 'block',
          priority: 0.95,
          targetPlayer: ballHolder.character,
          reason: 'Block shot attempt',
          expectedOutcome: 'Contest or block shot',
          alternativeActions: [],
        };
      } else {
        return {
          type: 'contest',
          priority: 0.9,
          targetPlayer: ballHolder.character,
          reason: 'Contest shot',
          expectedOutcome: 'Lower shot percentage',
          alternativeActions: [],
        };
      }
    }

    // 2. 通常のガード
    const guardPosition = this.calculateGuardPosition(
      ballHolder.position,
      fieldAnalysis,
      teamDirective.pressureLevel
    );

    return {
      type: 'guard',
      priority: 0.8,
      targetPosition: guardPosition,
      targetPlayer: ballHolder.character,
      reason: 'Guarding ball handler',
      expectedOutcome: 'Prevent easy basket',
      alternativeActions: [],
    };
  }

  /**
   * オフボールディフェンス
   */
  private decideOffBallDefense(
    character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective,
    myMatchup: ReturnType<typeof this.findMyDefenseMatchup>
  ): TacticalAction {
    // 1. ヘルプディフェンス判定
    if (teamDirective.helpDefenseLevel > 0.5 && this.shouldHelpDefense(fieldAnalysis)) {
      const helpPosition = this.calculateHelpPosition(fieldAnalysis);
      return {
        type: 'help',
        priority: 0.7,
        targetPosition: helpPosition,
        reason: 'Help defense rotation',
        expectedOutcome: 'Support on-ball defender',
        alternativeActions: [],
      };
    }

    // 2. マッチアップがいればマーク
    if (myMatchup?.offensePlayer) {
      const markPosition = this.calculateMarkPosition(
        myMatchup.offensePlayer,
        fieldAnalysis
      );

      return {
        type: 'guard',
        priority: 0.6,
        targetPosition: markPosition,
        targetPlayer: myMatchup.offensePlayer,
        reason: 'Marking assignment',
        expectedOutcome: 'Deny easy pass',
        alternativeActions: [],
      };
    }

    // 3. ペイント保護
    return {
      type: 'help',
      priority: 0.5,
      targetPosition: this.calculatePaintProtectionPosition(character, fieldAnalysis),
      reason: 'Paint protection',
      expectedOutcome: 'Protect the rim',
      alternativeActions: [],
    };
  }

  /**
   * ゾーンディフェンス（簡易実装）
   */
  private decideZoneDefense(
    character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    // ゾーンポジションに移動
    const zonePosition = this.calculateZonePosition(character, fieldAnalysis, teamDirective);

    return {
      type: 'guard',
      priority: 0.6,
      targetPosition: zonePosition,
      reason: `Zone defense - ${teamDirective.defenseScheme}`,
      expectedOutcome: 'Cover zone area',
      alternativeActions: [],
    };
  }

  /**
   * プレスディフェンス（簡易実装）
   */
  private decidePressDefense(
    _character: Character,
    _situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    _teamDirective: TeamDirective
  ): TacticalAction {
    const ballHolder = fieldAnalysis.ballHolder;

    if (ballHolder) {
      // ボール保持者に近いプレイヤーはプレスに行く
      const myDistance = Vector3.Distance(fieldAnalysis.self.position, ballHolder.position);
      const isClosest = fieldAnalysis.teammates.every(t =>
        Vector3.Distance(t.position, ballHolder.position) >= myDistance
      );

      if (isClosest || myDistance < 3.0) {
        return {
          type: 'guard',
          priority: 0.85,
          targetPlayer: ballHolder.character,
          reason: 'Press defense - ball pressure',
          expectedOutcome: 'Force turnover',
          alternativeActions: [],
        };
      }
    }

    // パスレーンを塞ぐ
    return {
      type: 'guard',
      priority: 0.6,
      targetPosition: this.calculatePassLaneDenialPosition(fieldAnalysis),
      reason: 'Press defense - deny pass',
      expectedOutcome: 'Intercept pass',
      alternativeActions: [],
    };
  }

  /**
   * トランジション時の戦術決定
   */
  private decideTransitionTactics(
    character: Character,
    situation: SituationContext,
    fieldAnalysis: FieldAnalysis,
    teamDirective: TeamDirective
  ): TacticalAction {
    // ルーズボール状況
    if (situation.ballRelation === 'loose_ball') {
      // 最も近いプレイヤーがボールを追う
      const myDistance = situation.distanceToBall;
      const teammateDistances = fieldAnalysis.teammates.map(t => t.distanceToBall);
      const isClosest = teammateDistances.every(d => d >= myDistance);

      if (isClosest) {
        return {
          type: 'chase_ball',
          priority: 0.9,
          reason: 'Closest to loose ball',
          expectedOutcome: 'Gain possession',
          alternativeActions: [],
        };
      }

      // リバウンドポジション
      const reboundPos = fieldAnalysis.reboundPositions.find(r =>
        r.assignedTo === character
      );
      if (reboundPos) {
        return {
          type: 'rebound',
          priority: 0.7,
          targetPosition: reboundPos.position,
          reason: 'Rebound positioning',
          expectedOutcome: 'Secure rebound',
          alternativeActions: [],
        };
      }
    }

    // トランジション戦略に応じて
    switch (teamDirective.transitionStrategy) {
      case 'push':
        // 速攻
        return {
          type: 'move_to_space',
          priority: 0.7,
          targetPosition: this.findFastBreakPosition(character, fieldAnalysis),
          reason: 'Fast break - pushing',
          expectedOutcome: 'Early offense opportunity',
          alternativeActions: [],
        };

      case 'careful':
        // 慎重に
        return this.createWaitAction('Transition - being careful');

      default:
        // セットアップ
        return this.createMoveAction(
          this.findBestPosition(character, fieldAnalysis, teamDirective),
          0.5,
          'Transition - setting up'
        );
    }
  }

  // ===============================
  // ヘルパーメソッド
  // ===============================

  private createWaitAction(reason: string): TacticalAction {
    return {
      type: 'wait',
      priority: 0.1,
      reason,
      expectedOutcome: 'Maintain position',
      alternativeActions: [],
    };
  }

  private createMoveAction(position: Vector3, priority: number, reason: string): TacticalAction {
    return {
      type: 'move_to_space',
      priority,
      targetPosition: position,
      reason,
      expectedOutcome: 'Better positioning',
      alternativeActions: [],
    };
  }

  private findSafePosition(fieldAnalysis: FieldAnalysis): Vector3 {
    // 敵から離れた位置を見つける
    const openSpace = fieldAnalysis.openSpaces.find(s => s.zone !== 'paint');
    return openSpace?.center ?? fieldAnalysis.self.position;
  }

  private findBestPosition(
    _character: Character,
    fieldAnalysis: FieldAnalysis,
    _teamDirective: TeamDirective
  ): Vector3 {
    // 最もスコアリング価値の高いオープンスペース
    if (fieldAnalysis.bestOpenSpace) {
      return fieldAnalysis.bestOpenSpace.center;
    }
    return fieldAnalysis.self.position;
  }

  private findPostUpPosition(character: Character, _fieldAnalysis: FieldAnalysis): Vector3 {
    const team = character.team;
    const goalZ = team === 'ally' ? 13.4 : -13.4;
    // ゴール下から少し離れた位置
    return new Vector3(2, 0, goalZ - 3);
  }

  private findPGSpotPosition(fieldAnalysis: FieldAnalysis): Vector3 {
    // トップオブザキーあたり
    const space = fieldAnalysis.openSpaces.find(s =>
      s.zone === 'three_point' && Math.abs(s.center.x) < 3
    );
    return space?.center ?? new Vector3(0, 0, 8);
  }

  private checkNeedsSpacing(_character: Character, fieldAnalysis: FieldAnalysis): boolean {
    for (const teammate of fieldAnalysis.teammates) {
      const dist = Vector3.Distance(fieldAnalysis.self.position, teammate.position);
      if (dist < INDIVIDUAL_TACTICS_CONFIG.MIN_SPACING_DISTANCE) {
        return true;
      }
    }
    return false;
  }

  private findSpacingPosition(_character: Character, fieldAnalysis: FieldAnalysis): Vector3 | null {
    // 味方から離れたオープンスペースを探す
    for (const space of fieldAnalysis.openSpaces) {
      let tooClose = false;
      for (const teammate of fieldAnalysis.teammates) {
        if (Vector3.Distance(space.center, teammate.position) < INDIVIDUAL_TACTICS_CONFIG.MIN_SPACING_DISTANCE) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        return space.center;
      }
    }
    return null;
  }

  private findMyDefenseMatchup(
    character: Character,
    fieldAnalysis: FieldAnalysis
  ) {
    return fieldAnalysis.matchups.find(m => m.defensePlayer === character);
  }

  private shouldHelpDefense(fieldAnalysis: FieldAnalysis): boolean {
    // ボール保持者がペイントに近い場合はヘルプ
    if (fieldAnalysis.ballHolder) {
      return fieldAnalysis.ballHolder.courtZone === 'paint' ||
             fieldAnalysis.ballHolder.courtZone === 'mid_range';
    }
    return false;
  }

  private calculateGuardPosition(
    ballHolderPos: Vector3,
    fieldAnalysis: FieldAnalysis,
    pressureLevel: number
  ): Vector3 {
    // プレッシャーレベルに応じた距離
    const guardDistance = 1.5 - pressureLevel * 0.5; // 1.0-1.5m

    // ボール保持者とゴールの間に立つ
    const team = fieldAnalysis.self.character.team;
    const goalZ = team === 'ally' ? -13.4 : 13.4; // 守るゴール
    const goalPos = new Vector3(0, 0, goalZ);

    const toGoal = goalPos.subtract(ballHolderPos).normalize();
    return ballHolderPos.add(toGoal.scale(guardDistance));
  }

  private calculateHelpPosition(fieldAnalysis: FieldAnalysis): Vector3 {
    const ballHolder = fieldAnalysis.ballHolder;
    if (!ballHolder) return fieldAnalysis.self.position;

    const team = fieldAnalysis.self.character.team;
    const goalZ = team === 'ally' ? -13.4 : 13.4;

    // ボール保持者とゴールの中間あたり
    return new Vector3(
      ballHolder.position.x * 0.5,
      0,
      (ballHolder.position.z + goalZ) / 2
    );
  }

  private calculateMarkPosition(
    offensePlayer: Character,
    fieldAnalysis: FieldAnalysis
  ): Vector3 {
    const offPos = offensePlayer.getPosition();
    const team = fieldAnalysis.self.character.team;
    const goalZ = team === 'ally' ? -13.4 : 13.4;
    const goalPos = new Vector3(0, 0, goalZ);

    // オフェンスプレイヤーとゴールの間
    const toGoal = goalPos.subtract(offPos).normalize();
    return offPos.add(toGoal.scale(1.0));
  }

  private calculatePaintProtectionPosition(
    character: Character,
    _fieldAnalysis: FieldAnalysis
  ): Vector3 {
    const team = character.team;
    const goalZ = team === 'ally' ? -13.4 : 13.4;
    return new Vector3(0, 0, goalZ + (goalZ > 0 ? -3 : 3));
  }

  private calculateZonePosition(
    character: Character,
    _fieldAnalysis: FieldAnalysis,
    _teamDirective: TeamDirective
  ): Vector3 {
    // 簡易的なゾーン位置
    const team = character.team;
    const goalZ = team === 'ally' ? -13.4 : 13.4;
    const myPosition = character.playerData?.basic?.PositionMain;

    // ポジションに応じたゾーン配置
    switch (myPosition) {
      case 'PG':
        return new Vector3(0, 0, goalZ + (goalZ > 0 ? -8 : 8));
      case 'SG':
        return new Vector3(-4, 0, goalZ + (goalZ > 0 ? -6 : 6));
      case 'SF':
        return new Vector3(4, 0, goalZ + (goalZ > 0 ? -6 : 6));
      case 'PF':
        return new Vector3(-2, 0, goalZ + (goalZ > 0 ? -3 : 3));
      case 'C':
        return new Vector3(2, 0, goalZ + (goalZ > 0 ? -3 : 3));
      default:
        return new Vector3(0, 0, goalZ + (goalZ > 0 ? -5 : 5));
    }
  }

  private calculatePassLaneDenialPosition(fieldAnalysis: FieldAnalysis): Vector3 {
    // オープンなパスレーンを塞ぐ位置
    if (fieldAnalysis.openPassLanes.length > 0) {
      const lane = fieldAnalysis.openPassLanes[0];
      const from = lane.from.getPosition();
      const to = lane.to.getPosition();
      // パスレーンの中間
      return from.add(to).scale(0.5);
    }
    return fieldAnalysis.self.position;
  }

  private findFastBreakPosition(character: Character, _fieldAnalysis: FieldAnalysis): Vector3 {
    const team = character.team;
    const goalZ = team === 'ally' ? 13.4 : -13.4;

    // ポジションに応じた速攻位置
    const myPosition = character.playerData?.basic?.PositionMain;
    switch (myPosition) {
      case 'PG':
        return new Vector3(0, 0, goalZ - (goalZ > 0 ? 5 : -5));
      case 'SG':
      case 'SF':
        return new Vector3(myPosition === 'SG' ? -5 : 5, 0, goalZ - (goalZ > 0 ? 3 : -3));
      default:
        return new Vector3(0, 0, goalZ - (goalZ > 0 ? 2 : -2));
    }
  }
}
