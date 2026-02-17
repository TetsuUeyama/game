import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { DRIBBLE_BREAKTHROUGH_CONFIG, DribbleBreakthroughUtils } from "@/GamePlay/GameSystem/CharacterMove/Config/DribbleBreakthroughConfig";
import { ONE_ON_ONE_BATTLE, DefenseUtils } from "@/GamePlay/GameSystem/DecisionMakingSystem/DefenseConfig";
import {
  OneOnOneResult,
  ONE_ON_ONE_BATTLE_CONFIG,
  POSITIONING_CONFIG,
  AdvantageStatus,
  AdvantageUtils,
} from "@/GamePlay/GameSystem/CharacterMove/Config/Action/OneOnOneBattleConfig";

// 型をre-export
export type { OneOnOneResult, AdvantageStatus };

/**
 * 1on1バトルを管理するコントローラー
 */
export class OneOnOneBattleController {
  // 1on1勝負の状態管理
  private was1on1: boolean = false;
  private in1on1Battle: boolean = false;
  private lastDiceRollTime: number = 0;
  // ONE_ON_ONE_BATTLE.DICE_ROLL_INTERVALを使用（DefenseConfigから）
  private oneononeResult: OneOnOneResult | null = null;
  private lastCollisionRedirectTime: number = 0;
  // ONE_ON_ONE_BATTLE.COLLISION_REDIRECT_INTERVALを使用（DefenseConfigから）

  // 有利/不利状態（次のサイコロ勝負まで保持）
  private advantageStatus: AdvantageStatus = {
    state: 'neutral',
    difference: 0,
    multiplier: 0,
  };

  // サークル接触状態
  private circlesInContact: boolean = false;

  // 外部参照
  private ball: Ball;
  private getAllCharacters: () => Character[];

  constructor(ball: Ball, getAllCharacters: () => Character[]) {
    this.ball = ball;
    this.getAllCharacters = getAllCharacters;
  }

  /**
   * 1on1バトルの状態をチェック（毎フレーム呼び出し）
   */
  public check1on1Battle(): void {
    const is1on1Now = this.is1on1State();

    // 1on1状態に突入した瞬間（false → true）
    if (!this.was1on1 && is1on1Now) {
            this.in1on1Battle = true;

      // 開始直後に即座にサイコロを振って移動開始
      this.perform1on1Battle();
      this.lastDiceRollTime = Date.now();
    }

    // 1on1状態から抜けた瞬間（true → false）
    if (this.was1on1 && !is1on1Now) {
            this.in1on1Battle = false;

      // AI移動をクリア
      const allCharacters = this.getAllCharacters();
      for (const char of allCharacters) {
        char.clearAIMovement();
      }

      // 有利/不利状態をリセット
      this.advantageStatus = {
        state: 'neutral',
        difference: 0,
        multiplier: 0,
      };
    }

    // 1on1バトル中は一定間隔でサイコロを振る
    if (this.in1on1Battle) {
      const currentTime = Date.now();
      if (currentTime - this.lastDiceRollTime >= ONE_ON_ONE_BATTLE.DICE_ROLL_INTERVAL) {
        this.perform1on1Battle();
        this.lastDiceRollTime = currentTime;
      }
    }

    this.was1on1 = is1on1Now;
  }

  /**
   * 1on1バトル中のAI移動を更新（毎フレーム呼び出し）
   * @param deltaTime フレーム時間（秒）
   */
  public update1on1Movement(deltaTime: number): void {
    if (!this.in1on1Battle) {
      // 1on1バトル外ではcirclesInContactを必ずfalseにリセット
      // check1on1Battle()がin1on1Battleをfalseにした後、
      // circlesInContactが古い値のまま残るとAI更新がスキップされ続けるバグを防ぐ
      this.circlesInContact = false;
      return;
    }

    const allCharacters = this.getAllCharacters();

    // オンボールプレイヤーとディフェンダーを探す
    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    // 先に接触状態をチェック（移動前に判定）
    let wasInContact = false;
    if (onBallPlayer && onBallDefender) {
      const offensePos = onBallPlayer.getPosition();
      const defenderPos = onBallDefender.getPosition();
      const distance = Vector3.Distance(
        new Vector3(offensePos.x, 0, offensePos.z),
        new Vector3(defenderPos.x, 0, defenderPos.z)
      );
      const contactDistance = onBallPlayer.getFootCircleRadius() + onBallDefender.getFootCircleRadius();
      wasInContact = distance <= contactDistance + ONE_ON_ONE_BATTLE_CONFIG.CONTACT_MARGIN;
    }

    // オフェンス側の移動を試行
    let offenseCollided = false;
    if (onBallPlayer) {
      if (wasInContact && ONE_ON_ONE_BATTLE.OFFENSE_MOVE_DURING_CONTACT) {
        // 接触中は衝突判定をスキップして移動（衝突判定なしで前進）
        onBallPlayer.applyAIMovementWithoutCollision(deltaTime);
      } else {
        // 通常の衝突判定付き移動
        offenseCollided = onBallPlayer.applyAIMovementWithCollision(deltaTime, allCharacters);
      }
    }

    // ディフェンス側の移動を試行（通常の衝突判定）
    if (onBallDefender && !wasInContact) {
      onBallDefender.applyAIMovementWithCollision(deltaTime, allCharacters);
    }

    // 移動後に再度接触状態をチェック
    this.circlesInContact = false;
    if (onBallPlayer && onBallDefender) {
      const offensePos = onBallPlayer.getPosition();
      const defenderPos = onBallDefender.getPosition();
      const distance = Vector3.Distance(
        new Vector3(offensePos.x, 0, offensePos.z),
        new Vector3(defenderPos.x, 0, defenderPos.z)
      );
      const contactDistance = onBallPlayer.getFootCircleRadius() + onBallDefender.getFootCircleRadius();
      this.circlesInContact = distance <= contactDistance + ONE_ON_ONE_BATTLE_CONFIG.CONTACT_MARGIN;

      // 接触中の処理
      if (this.circlesInContact) {
        if (ONE_ON_ONE_BATTLE.OFFENSE_MOVE_DURING_CONTACT) {
          // ディフェンダーの移動をクリア（オフェンスに追従するため）
          onBallDefender.clearAIMovement();

          // 接触中はノックバック（押し返し）を適用
          // オフェンス/ディフェンス能力値に基づいてディフェンダーを押し下げる
          const { selfPush, otherPush } = onBallPlayer.calculatePushback(onBallDefender);

          // ノックバックを適用（calculatePushbackは毎フレーム適用を想定した値を返す）
          const newOffensePos = offensePos.add(selfPush);
          const newDefenderPos = defenderPos.add(otherPush);

          onBallPlayer.setPosition(newOffensePos);
          onBallDefender.setPosition(newDefenderPos);
        } else {
          // 従来動作：両者の移動を停止
          onBallPlayer.clearAIMovement();
          onBallDefender.clearAIMovement();
          return;
        }
      }
    }

    // オフェンスが衝突した場合（接触ではない）、動き直す
    if (offenseCollided && onBallPlayer && onBallDefender) {
      const currentTime = Date.now();
      if (currentTime - this.lastCollisionRedirectTime >= ONE_ON_ONE_BATTLE.COLLISION_REDIRECT_INTERVAL) {
        // 新しいランダム方向を設定
        const newDirection = this.getRandomDirection8();

        // DribbleUtilsを使用してドリブル速度を計算
        const offenseData = onBallPlayer.playerData;
        const moveSpeed = DribbleBreakthroughUtils.calculateDribblingSpeed(offenseData?.stats.dribblingspeed);

        // フェイント判定
        const isFeint = this.checkFeint(onBallPlayer);

        if (isFeint) {
          // フェイント発動：オフェンスは動かないが、ディフェンスはフェイント方向に釣られる
          onBallPlayer.clearAIMovement(); // オフェンスは動かない

          // ディフェンスはフェイント方向に釣られて動く（動き直しなのでquicknessを使用）
          this.setDefenderFeintReaction(onBallDefender, newDirection, moveSpeed, true);
        } else {
          // DribbleUtilsを使用してオフェンス側の反応遅延時間を計算（reflexesベース）
          const offensePlayerData = onBallPlayer.playerData;
          const offenseDelayMs = DribbleBreakthroughUtils.calculateReflexesDelay(offensePlayerData?.stats.reflexes);

          onBallPlayer.setAIMovement(newDirection, moveSpeed, offenseDelayMs);

          // ディフェンスもオフェンスとゴールの間に位置取る（動き直しなのでquicknessを使用）
          this.setDefenderReaction(onBallPlayer, onBallDefender, newDirection, moveSpeed, true);
        }

        // 最後に方向転換した時刻を更新
        this.lastCollisionRedirectTime = currentTime;
      }
    }

    // その他のキャラクターも移動
    for (const character of allCharacters) {
      if (character !== onBallPlayer && character !== onBallDefender) {
        character.applyAIMovementWithCollision(deltaTime, allCharacters);
      }
    }
  }

  /**
   * 1on1の勝負を実行（サイコロを振る）
   */
  private perform1on1Battle(): void {
    const allCharacters = this.getAllCharacters();

    // オンボールプレイヤーとディフェンダーを探す
    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    if (!onBallPlayer || !onBallDefender) {
      return;
    }

    // ドリブル突破中は何もしない
    if (onBallPlayer.isInDribbleBreakthrough()) {
      return;
    }

    // ボールが0番面の時、ランダムでドリブル突破を実行（ActionController経由）
    // 有利/不利状態を考慮（前回のサイコロ結果を使用）
    const currentFace = onBallPlayer.getCurrentBallFace();
    let breakthroughChance: number = DRIBBLE_BREAKTHROUGH_CONFIG.BREAKTHROUGH_CHANCE;
    // オフェンス有利時は突破を試みる確率UP、ディフェンス有利時はDOWN
    breakthroughChance = AdvantageUtils.adjustSuccessRate(
      breakthroughChance,
      this.advantageStatus,
      'DRIBBLE_BREAKTHROUGH',
      true // オフェンスアクション
    );
    if (currentFace === 0 && Math.random() < breakthroughChance) {
      // 左右ランダムで突破方向を決定
      const direction = Math.random() < ONE_ON_ONE_BATTLE_CONFIG.BREAKTHROUGH_LEFT_CHANCE ? 'left' : 'right';
      const success = this.performDribbleBreakthrough(direction);
      if (success) {
        return; // 突破を開始したので通常処理をスキップ
      }
    }

    // サイコロを振る
    const offenseDice = Math.floor(Math.random() * ONE_ON_ONE_BATTLE_CONFIG.DICE_SIDES) + 1;
    const defenseDice = Math.floor(Math.random() * ONE_ON_ONE_BATTLE_CONFIG.DICE_SIDES) + 1;

    // オフェンス側：ボール保持位置をランダムに変更
    onBallPlayer.randomizeBallPosition();

    // オフェンス側の行動をランダムに選択（DefenseUtilsを使用）
    const shouldTurnToGoal = DefenseUtils.shouldTurnToGoal();

    // オフェンス側：8方向のランダムな移動方向を取得
    const randomDirection = this.getRandomDirection8();

    // DribbleUtilsを使用してオフェンス速度を計算
    const offensePlayerData = onBallPlayer.playerData;
    const moveSpeed = DribbleBreakthroughUtils.calculateDribblingSpeed(offensePlayerData?.stats.dribblingspeed);

    // フェイント判定
    const isFeint = this.checkFeint(onBallPlayer);

    // 接触中でもオフェンスが動くかどうか
    if (this.circlesInContact && ONE_ON_ONE_BATTLE.OFFENSE_MOVE_DURING_CONTACT) {
      // 接触中のオフェンス行動
      // アクション（フェイント or ドリブル突破）を試みるか判定
      if (Math.random() < ONE_ON_ONE_BATTLE.OFFENSE_ACTION_CHANCE) {
        // アクション実行
        if (Math.random() < ONE_ON_ONE_BATTLE.OFFENSE_FEINT_CHANCE) {
          // フェイント
          onBallPlayer.clearAIMovement();
          this.setDefenderFeintReaction(onBallDefender, randomDirection, moveSpeed);
        } else {
          // ドリブル突破を試みる（ボールが0番面の場合）
          if (currentFace === 0) {
            const direction = Math.random() < ONE_ON_ONE_BATTLE_CONFIG.BREAKTHROUGH_LEFT_CHANCE ? 'left' : 'right';
            this.performDribbleBreakthrough(direction);
          }
        }
      } else {
        // 通常移動（接触中でも動く）
        // ゴール方向か、ランダム方向か選択
        let moveDirection: Vector3;
        if (shouldTurnToGoal) {
          // ゴール方向に移動
          const goalPosition = this.getTargetGoalPosition(onBallPlayer);
          const playerPos = onBallPlayer.getPosition();
          moveDirection = new Vector3(
            goalPosition.x - playerPos.x,
            0,
            goalPosition.z - playerPos.z
          );
          if (moveDirection.length() > 0.01) {
            moveDirection.normalize();
          }
          // ゴール方向を向く
          this.turnTowardsGoal(onBallPlayer);
        } else {
          // ランダム方向に移動
          moveDirection = randomDirection;
        }
        onBallPlayer.setAIMovement(moveDirection, moveSpeed * 0.7, 0); // 接触中は速度70%
        this.setDefenderReaction(onBallPlayer, onBallDefender, moveDirection, moveSpeed);
      }
    } else if (this.circlesInContact) {
      // 接触中で動かない設定の場合（従来動作）
      // サイコロは振る（有利/不利の更新のため）
    } else if (shouldTurnToGoal) {
      // ゴール方向に移動
      const goalPosition = this.getTargetGoalPosition(onBallPlayer);
      const playerPos = onBallPlayer.getPosition();
      const goalDirection = new Vector3(
        goalPosition.x - playerPos.x,
        0,
        goalPosition.z - playerPos.z
      );
      if (goalDirection.length() > 0.01) {
        goalDirection.normalize();
      }
      this.turnTowardsGoal(onBallPlayer);
      onBallPlayer.setAIMovement(goalDirection, moveSpeed, 0);
      this.setDefenderReaction(onBallPlayer, onBallDefender, goalDirection, moveSpeed);
    } else if (isFeint) {
      // フェイント発動
      onBallPlayer.clearAIMovement();
      this.setDefenderFeintReaction(onBallDefender, randomDirection, moveSpeed);
    } else {
      // 通常移動
      onBallPlayer.setAIMovement(randomDirection, moveSpeed, 0);
      this.setDefenderReaction(onBallPlayer, onBallDefender, randomDirection, moveSpeed);
    }

    // サイコロ結果を保存
    if (offenseDice > defenseDice) {
      this.oneononeResult = { winner: 'offense', offenseDice, defenseDice };
    } else if (defenseDice > offenseDice) {
      this.oneononeResult = { winner: 'defense', offenseDice, defenseDice };
    } else {
      this.oneononeResult = null;
    }

    // 有利/不利状態を更新（次のサイコロ勝負まで保持）
    const difference = Math.abs(offenseDice - defenseDice);
    const multiplier = AdvantageUtils.calculateMultiplier(difference);

    if (offenseDice > defenseDice) {
      this.advantageStatus = {
        state: 'offense',
        difference,
        multiplier,
      };
    } else if (defenseDice > offenseDice) {
      this.advantageStatus = {
        state: 'defense',
        difference,
        multiplier,
      };
    } else {
      this.advantageStatus = {
        state: 'neutral',
        difference: 0,
        multiplier: 0,
      };
    }
  }

  /**
   * ディフェンダーの対応動作を設定
   */
  private setDefenderReaction(
    offense: Character,
    defender: Character,
    _offenseDirection: Vector3,
    speed: number,
    _isRedirect: boolean = false
  ): void {
    const offensePos = offense.getPosition();
    const defenderPos = defender.getPosition();

    // オフェンスの0方向（正面）を取得
    const offenseForward = offense.getForwardDirection();

    // 目標位置を計算：オフェンスの正面方向にディフェンダーを配置
    const offenseRadius = offense.getFootCircleRadius();
    const defenderRadius = defender.getFootCircleRadius();
    const contactDistance = offenseRadius + defenderRadius;

    // オフェンスの正面方向に目標位置を設定（接触距離で配置）
    const targetPosition = offensePos.add(offenseForward.scale(contactDistance));

    // ディフェンダーの向き：オフェンスの正面と向き合う（反対方向を向く）
    const targetRotation = Math.atan2(-offenseForward.x, -offenseForward.z);
    defender.setRotation(targetRotation);

    // 現在位置から目標位置への移動方向を計算
    const moveDirection = targetPosition.subtract(defenderPos);
    moveDirection.y = 0;

    const distanceToTarget = moveDirection.length();

    if (distanceToTarget < POSITIONING_CONFIG.DEFENDER_STOP_DISTANCE) {
      defender.clearAIMovement();
      return;
    }

    const normalizedDirection = moveDirection.normalize();

    // DribbleUtilsを使用してディフェンダーの反応遅延時間を計算（reflexesベース）
    // 重心が安定してから実行されるため、ここでは純粋な反応時間のみ
    const defenderPlayerData = defender.playerData;
    const reactionDelayMs = DribbleBreakthroughUtils.calculateReflexesDelay(defenderPlayerData?.stats.reflexes);

    defender.setAIMovement(normalizedDirection, speed, reactionDelayMs);
  }

  /**
   * フェイント時のディフェンダー反応
   */
  private setDefenderFeintReaction(
    defender: Character,
    feintDirection: Vector3,
    speed: number,
    _isRedirect: boolean = false
  ): void {
    // DribbleUtilsを使用して反応遅延時間を計算（reflexesベース）
    // 重心が安定してから実行されるため、ここでは純粋な反応時間のみ
    const defenderPlayerData = defender.playerData;
    const reactionDelayMs = DribbleBreakthroughUtils.calculateReflexesDelay(defenderPlayerData?.stats.reflexes);

    const moveDirection = feintDirection.clone().normalize();
    const feintSpeed = speed * DRIBBLE_BREAKTHROUGH_CONFIG.FEINT_SPEED_MULTIPLIER;
    defender.setAIMovement(moveDirection, feintSpeed, reactionDelayMs);
  }

  /**
   * 8方向のランダムな方向ベクトルを取得
   */
  public getRandomDirection8(): Vector3 {
    const directionIndex = Math.floor(Math.random() * 8);
    const angle = (directionIndex * Math.PI) / 4;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    return new Vector3(x, 0, z).normalize();
  }

  /**
   * オフェンス側が攻めるゴールの位置を取得
   */
  public getTargetGoalPosition(offensePlayer: Character): Vector3 {
    const goalZ = offensePlayer.team === "ally" ? ONE_ON_ONE_BATTLE_CONFIG.ALLY_ATTACK_GOAL_Z : ONE_ON_ONE_BATTLE_CONFIG.ENEMY_ATTACK_GOAL_Z;
    return new Vector3(0, 0, goalZ);
  }

  /**
   * オフェンスプレイヤーをゴール方向に向かせる
   */
  private turnTowardsGoal(offensePlayer: Character): void {
    const goalPosition = this.getTargetGoalPosition(offensePlayer);
    offensePlayer.lookAt(goalPosition);
  }

  /**
   * フェイント判定
   */
  public checkFeint(offensePlayer: Character): boolean {
    const playerData = offensePlayer.playerData;
    // DribbleUtilsを使用してフェイント確率を計算
    let feintChance = DribbleBreakthroughUtils.calculateFeintChance(playerData?.stats.technique);

    // 有利/不利状態を考慮
    // オフェンス有利時はフェイント成功率UP、ディフェンス有利時はDOWN
    feintChance = AdvantageUtils.adjustSuccessRate(
      feintChance,
      this.advantageStatus,
      'FEINT_SUCCESS',
      true // オフェンスアクション
    );

    const roll = Math.random();
    return roll < feintChance;
  }

  /**
   * 1on1状態かどうかを判定
   * オンボールオフェンスプレイヤーの視野内にディフェンダーがいるかどうか
   */
  public is1on1State(): boolean {
    const allCharacters = this.getAllCharacters();

    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    if (onBallPlayer && onBallDefender) {
      const offensePos = onBallPlayer.getPosition();
      const defenderPos = onBallDefender.getPosition();

      // 視野ベースで1on1状態を判定
      // オフェンスプレイヤーの視野内にディフェンダーがいるかどうか
      return DefenseUtils.is1on1StateByFieldOfView(
        { x: offensePos.x, z: offensePos.z },
        onBallPlayer.getRotation(),
        { x: defenderPos.x, z: defenderPos.z }
      );
    }

    return false;
  }

  /**
   * 1on1勝負の結果を取得
   */
  public get1on1Result(): OneOnOneResult | null {
    return this.oneononeResult;
  }

  /**
   * 1on1勝負の結果をクリア
   */
  public clear1on1Result(): void {
    this.oneononeResult = null;
  }

  /**
   * 現在の有利/不利状態を取得
   */
  public getAdvantageStatus(): AdvantageStatus {
    return this.advantageStatus;
  }

  /**
   * オフェンス側が有利かどうか
   */
  public isOffenseAdvantaged(): boolean {
    return this.advantageStatus.state === 'offense';
  }

  /**
   * ディフェンス側が有利かどうか
   */
  public isDefenseAdvantaged(): boolean {
    return this.advantageStatus.state === 'defense';
  }

  /**
   * 現在のディフェンダーのサークル半径を取得
   */
  public getDefenderCircleRadius(): number {
    const onBallDefender = this.findOnBallDefender();
    if (onBallDefender) {
      return onBallDefender.getFootCircleRadius();
    }
    return 1.0;
  }

  /**
   * 1on1バトル中かどうかを取得
   */
  public isIn1on1Battle(): boolean {
    return this.in1on1Battle;
  }

  /**
   * サークルが接触中かどうかを取得
   */
  public isCirclesInContact(): boolean {
    return this.circlesInContact;
  }

  /**
   * 無力化されたディフェンダーかチェック
   */
  public isDefeatedDefender(_character: Character): boolean {
    return false;
  }

  /**
   * オンボールディフェンダーを探す
   */
  public findOnBallDefender(): Character | null {
    const allCharacters = this.getAllCharacters();
    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_DEFENDER") {
        return char;
      }
    }
    return null;
  }

  /**
   * オンボールプレイヤーを探す
   * Ball.getHolder() を使用してボール保持者を取得
   */
  public findOnBallPlayer(): Character | null {
    return this.ball.getHolder();
  }

  /**
   * ドリブル突破を実行（ActionController経由）
   */
  public performDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    const onBallPlayer = this.findOnBallPlayer();

    if (!onBallPlayer) {
      return false;
    }

    // ActionControllerでドリブル突破アクションを開始
    const actionController = onBallPlayer.getActionController();
    const actionResult = actionController.startAction('dribble_breakthrough');

    if (!actionResult.success) {
      return false;
    }

    // activeフェーズに入ったら実際のドリブル突破移動を開始するコールバックを設定
    actionController.setCallbacks({
      onActive: (action) => {
        if (action === 'dribble_breakthrough') {
          // 実際のドリブル突破移動を開始
          const success = onBallPlayer.startDribbleBreakthrough(direction);
          if (success) {
            onBallPlayer.clearAIMovement();
          }
        }
      },
      onComplete: (_action) => {
        // ドリブル突破完了
      },
    });

    return true;
  }

  /**
   * ドリブル突破中の更新処理
   */
  public updateDribbleBreakthrough(deltaTime: number): void {
    const allCharacters = this.getAllCharacters();

    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    if (onBallPlayer && onBallPlayer.isInDribbleBreakthrough()) {
      const breakthroughEnded = onBallPlayer.applyBreakthroughMovement(deltaTime);

      if (breakthroughEnded) {
        onBallPlayer.endDribbleBreakthrough();

        // アクションを強制終了（次のアクションを実行可能にする）
        onBallPlayer.getActionController().forceResetAction();

        // 衝突判定を行い、衝突している場合はpowerによる押し返しを計算
        if (onBallDefender) {
          const offensePos = onBallPlayer.getPosition();
          const defenderPos = onBallDefender.getPosition();
          const distance = Vector3.Distance(
            new Vector3(offensePos.x, 0, offensePos.z),
            new Vector3(defenderPos.x, 0, defenderPos.z)
          );

          const minDistance = onBallPlayer.getFootCircleRadius() + onBallDefender.getFootCircleRadius();

          if (distance < minDistance) {
            const { selfPush, otherPush } = onBallPlayer.calculatePushback(onBallDefender);

            const newOffensePos = offensePos.add(selfPush);
            const newDefenderPos = defenderPos.add(otherPush);

            onBallPlayer.setPosition(newOffensePos);
            onBallDefender.setPosition(newDefenderPos);
          }
        }

        // 通常の1on1バトルを再開
        if (this.in1on1Battle && onBallPlayer && onBallDefender) {
          const newDirection = this.getRandomDirection8();

          // DribbleUtilsを使用して速度と遅延を計算（reflexesベース）
          const offenseData = onBallPlayer.playerData;
          const moveSpeed = DribbleBreakthroughUtils.calculateDribblingSpeed(offenseData?.stats.dribblingspeed);
          const offenseDelayMs = DribbleBreakthroughUtils.calculateReflexesDelay(offenseData?.stats.reflexes);

          onBallPlayer.setAIMovement(newDirection, moveSpeed, offenseDelayMs);
          this.setDefenderReaction(onBallPlayer, onBallDefender, newDirection, moveSpeed, true);
        }
      }
    }
  }

  /**
   * ドリブル突破可能かどうかをチェック
   */
  public canPerformDribbleBreakthrough(): boolean {
    const allCharacters = this.getAllCharacters();
    for (const char of allCharacters) {
      if (char.getState() === "ON_BALL_PLAYER") {
        return char.getCurrentBallFace() === 0 && !char.isInDribbleBreakthrough();
      }
    }
    return false;
  }

  /**
   * オンボールオフェンスプレイヤーの視野内にディフェンダーがいるかどうか
   * @returns 視野内にいる場合true
   */
  public isDefenderInOffenseFieldOfView(): boolean {
    const onBallPlayer = this.findOnBallPlayer();
    const onBallDefender = this.findOnBallDefender();

    if (!onBallPlayer || !onBallDefender) {
      return false;
    }

    const offensePos = onBallPlayer.getPosition();
    const defenderPos = onBallDefender.getPosition();

    return DefenseUtils.is1on1StateByFieldOfView(
      { x: offensePos.x, z: offensePos.z },
      onBallPlayer.getRotation(),
      { x: defenderPos.x, z: defenderPos.z }
    );
  }

  /**
   * 状態をリセット（センターサークル再開等で使用）
   */
  public forceReset(): void {
    this.was1on1 = false;
    this.in1on1Battle = false;
    this.circlesInContact = false;
    this.lastDiceRollTime = 0;
    this.lastCollisionRedirectTime = 0;
    this.oneononeResult = null;
    this.advantageStatus = {
      state: 'neutral',
      difference: 0,
      multiplier: 0,
    };
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 特に破棄するリソースはない
  }
}
