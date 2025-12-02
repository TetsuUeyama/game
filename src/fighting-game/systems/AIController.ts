import * as Phaser from "phaser";
import {Fighter} from "../entities/Fighter";
import {FightScene} from "../scenes/FightScene";
import {ProjectileEntity} from "../entities/ProjectileEntity";
import {FootworkEntity} from "../entities/FootworkEntity";
import {MOVEMENT_CONFIG} from "../config/gameConfig";
import {MajorAction, MinorAction} from "./ActionIntent";
import {ActionContext} from "../actions/Action";
import {ActionNames} from "../actions/ActionRegistry";

// AIカスタマイズパラメータの型定義
export interface AICustomization {
  preferredDistance: number;    // 基本距離 (100 ~ 400)
  closeRangeAggression: number; // 近距離攻撃性 (0 ~ 1)
  longRangeAggression: number;  // 遠距離攻撃性 (0 ~ 1)
  jumpFrequency: number;        // ジャンプ頻度 (0 ~ 1)
  dashFrequency: number;        // ダッシュ頻度 (0 ~ 1)
  specialMeterThreshold: number; // 必殺技使用開始値 (0 ~ 100)
  specialMeterReserve: number;   // 必殺技維持値 (0 ~ 100)
  staminaThreshold: number;      // スタミナ使用開始値 (0 ~ 50)
  staminaReserve: number;        // スタミナ維持値 (0 ~ 50)
}

export class AIController {
  private fighter: Fighter;
  private opponent: Fighter;
  private scene: FightScene;
  private nextActionTime: number;
  private actionDelay: number;
  private difficulty: "easy" | "medium" | "hard";
  private currentStrategy: "aggressive" | "defensive" | "balanced";
  private isGuarding: boolean;
  private guardStartTime: number;
  private closeRangeCounter: number; // 近接戦を続けた回数
  private lastDistanceCheckTime: number; // 最後に距離をチェックした時刻
  private shouldMaintainDistance: boolean; // 距離を保つべきか
  private footworkEntity: FootworkEntity | null; // フットワーク制御
  private currentIntention: "neutral" | "closing" | "retreating"; // 現在の意図

  // AIカスタマイズパラメータ
  private aiCustomization: AICustomization;

  constructor(
    fighter: Fighter,
    opponent: Fighter,
    scene: FightScene,
    difficulty: "easy" | "medium" | "hard" = "medium",
    aiCustomization?: AICustomization
  ) {
    this.fighter = fighter;
    this.opponent = opponent;
    this.scene = scene;
    this.difficulty = difficulty;
    this.nextActionTime = 0;
    this.currentStrategy = "balanced";
    this.isGuarding = false;
    this.guardStartTime = 0;
    this.closeRangeCounter = 0;
    this.lastDistanceCheckTime = 0;
    this.shouldMaintainDistance = false; // 開幕は接近モード（積極的に近接戦）
    this.footworkEntity = null;
    this.currentIntention = "neutral";

    // AIカスタマイズパラメータを設定（デフォルト値あり）
    this.aiCustomization = aiCustomization || {
      preferredDistance: 200,
      closeRangeAggression: 0.7,
      longRangeAggression: 0.5,
      jumpFrequency: 0.3,
      dashFrequency: 0.5,
      specialMeterThreshold: 80,
      specialMeterReserve: 30,
      staminaThreshold: 30,
      staminaReserve: 10,
    };

    // console.log(`[AIController] Player${fighter.playerNumber} AIカスタマイズ:`, this.aiCustomization);

    // 難易度による反応速度の設定
    switch (difficulty) {
      case "easy":
        this.actionDelay = 800;
        break;
      case "medium":
        this.actionDelay = 400;
        break;
      case "hard":
        this.actionDelay = 200;
        break;
    }

    // フットワーク初期化
    if (MOVEMENT_CONFIG.footworkEnabled) {
      this.initializeFootwork();
    }
  }

  /**
   * フットワークを初期化
   */
  private initializeFootwork(): void {
    this.footworkEntity = new FootworkEntity(this.scene, this.fighter, 0);
    // console.log("[AI] フットワーク初期化完了");
  }

  /**
   * フットワークを更新
   * 攻撃中・ガード中・ダッシュ中以外は常に小刻みに動く
   *
   * 注意: フットワークはニュートラル時（待機中）のみ使用。
   * 接近・後退時はapproach()/retreat()で直接速度を設定する。
   */
  private updateFootwork(): void {
    if (!this.footworkEntity) return;

    const distance = Math.abs(this.fighter.x - this.opponent.x);
    const toOpponent = this.fighter.x < this.opponent.x ? 1 : -1;

    // ジャンプ中、攻撃中、ガード中、ダッシュ中はフットワーク停止
    if (this.fighter.isJumping || this.fighter.isAttacking || this.isGuarding || this.fighter.isDashing) {
      this.footworkEntity.pause();
      return;
    }

    // 接近・後退意図の場合はフットワークを停止（approach/retreatが直接速度を設定）
    if (this.currentIntention === "closing" || this.currentIntention === "retreating") {
      this.footworkEntity.pause();
      return;
    }

    // ニュートラル時のみフットワークを使用
    if (this.currentIntention === "neutral") {
      // ランダムに前後（各30%）、停止（40%）
      const rand = Math.random();
      let footworkDirection = 0;

      if (rand < 0.3) {
        footworkDirection = toOpponent;
      } else if (rand < 0.6) {
        footworkDirection = -toOpponent;
      } else {
        footworkDirection = 0;
      }

      this.footworkEntity.setDirection(footworkDirection);
      this.footworkEntity.update();
    }
  }

  update(time: number, keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    if (this.fighter.state === "defeated") return;

    // フットワーク更新
    if (this.footworkEntity && MOVEMENT_CONFIG.footworkEnabled) {
      this.updateFootwork();
    }

    // 戦略の動的変更
    this.updateStrategy();

    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;
    const opponentOnGround = (this.opponent.body as Phaser.Physics.Arcade.Body).touching.down;

    // 空中攻撃の判定（自分がジャンプ中）
    if (!onGround && !this.fighter.isAttacking && this.fighter.isCooldownReady('medium')) {
      const distance = Math.abs(this.fighter.x - this.opponent.x);
      // 相手が近くにいる場合（150px以内）、空中攻撃を使う
      if (distance < 150 && Math.random() < 0.6) {
        this.fighter.performAttack('airAttackDown');
        return;
      }
    }

    // 対空攻撃の判定（相手がジャンプ中、自分は地上）
    if (onGround && !opponentOnGround && !this.fighter.isAttacking && this.fighter.isCooldownReady('medium')) {
      const distance = Math.abs(this.fighter.x - this.opponent.x);
      const heightDiff = this.opponent.y - this.fighter.y;
      // 相手が上にいて近くにいる場合（横100px以内、上80px以内）
      if (distance < 100 && heightDiff < -30 && Math.random() < 0.7) {
        this.fighter.performAttack('antiAir');
        return;
      }
    }

    // 飛び道具防御判定（最優先で確認）
    const projectiles = this.scene.getProjectiles();
    if (projectiles.length > 0) {
      // console.log(`[AI-Update] 飛び道具存在: ${projectiles.length}個`);

      const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;
      const incomingProjectile = projectiles.find((p: ProjectileEntity) => {
        if (p.owner === this.fighter) return false;
        const distance = Math.abs(p.x - this.fighter.x);
        const projectileDirection = p.x < this.fighter.x ? 1 : -1;
        const movingTowardsMe = (projectileDirection > 0 && p.x < this.fighter.x) || (projectileDirection < 0 && p.x > this.fighter.x);
        return movingTowardsMe && distance < 300 && !p.hasHit;
      });

      if (incomingProjectile) {
        const projectileDistance = Math.abs(incomingProjectile.x - this.fighter.x);
        const staminaPercent = this.fighter.guardStamina / this.fighter.maxGuardStamina;

        // console.log(`[AI-Update] 飛び道具検知！距離:${Math.floor(projectileDistance)}, 地面:${onGround}, スタミナ:${(staminaPercent * 100).toFixed(0)}%`);

        // 攻撃中でなければ防御行動
        if (!this.fighter.isAttacking) {
          let defenseChance = 0.5;
          if (this.difficulty === "hard") defenseChance = 0.9;
          else if (this.difficulty === "medium") defenseChance = 0.8;

          if (Math.random() < defenseChance) {
            if (!onGround) {
              // console.log("[AI-Update] 空中で回避不可");
            } else if (staminaPercent < 0.1) {
              // スタミナが極端に少ない場合（10%未満）のみジャンプ
              // console.log(`[AI-Update] スタミナ枯渇でジャンプ回避 (スタミナ:${(staminaPercent * 100).toFixed(0)}%)`);
              this.resetKeys(keys);
              const jumpHeight = this.selectJumpHeight();
              const jumpDirection = (jumpHeight === 'small') ? 0 : (this.fighter.x < this.opponent.x ? 1 : -1);
              this.jump(keys, jumpDirection, jumpHeight);
              return;
            } else {
              // 距離に応じて防御方法を選択
              // 近距離（150未満）: 85%ガード、15%ジャンプ
              // 中距離（150-250）: 90%ガード、10%ジャンプ
              // 遠距離（250以上）: 95%ガード、5%ジャンプ
              let guardChance = 0.85; // デフォルト（近距離）

              if (projectileDistance >= 250) {
                guardChance = 0.95; // 遠距離
              } else if (projectileDistance >= 150) {
                guardChance = 0.9; // 中距離
              }

              if (Math.random() < guardChance) {
                // console.log(`[AI-Update] ガード開始 (距離:${Math.floor(projectileDistance)}, スタミナ:${(staminaPercent * 100).toFixed(0)}%, 確率:${(guardChance * 100).toFixed(0)}%)`);
                // AI制御の場合、キーシミュレーションではなくFighter.block()を直接呼ぶ
                this.fighter.block('mid');
                this.isGuarding = true;
                this.guardStartTime = time;
                return;
              } else {
                // console.log(`[AI-Update] ジャンプ回避 (距離:${Math.floor(projectileDistance)}, 確率:${((1 - guardChance) * 100).toFixed(0)}%)`);
                this.resetKeys(keys);
                const jumpHeight = this.selectJumpHeight();
                const jumpDirection = (jumpHeight === 'small') ? 0 : (this.fighter.x < this.opponent.x ? 1 : -1);
                this.jump(keys, jumpDirection, jumpHeight);
                return;
              }
            }
          }
        }
      }
    }

    // 相手の攻撃に反応してガード
    if (this.shouldGuardAgainstAttack()) {
      this.guardAgainstAttack(keys, time);
      return;
    }

    // ガード中の場合、継続または解除を判定
    if (this.isGuarding) {
      // 相手の攻撃が終了したかチェック
      const opponentAttackEnded = !this.opponent.isAttacking;

      // 飛び道具が接近していないかチェック
      const projectiles = this.scene.getProjectiles();
      const hasIncomingProjectile = projectiles.some((p) => {
        if (p.owner === this.fighter) return false;
        const distance = Math.abs(p.x - this.fighter.x);
        const projectileDirection = p.x < this.fighter.x ? 1 : -1;
        const movingTowardsMe = (projectileDirection > 0 && p.x < this.fighter.x) || (projectileDirection < 0 && p.x > this.fighter.x);
        return movingTowardsMe && distance < 200 && !p.hasHit;
      });

      // 最低でも300ms以上ガード（短すぎる解除を防ぐ）
      const minGuardTime = time - this.guardStartTime > 300;

      // 以下の条件で解除：攻撃が終了 AND 飛び道具なし AND 最低ガード時間経過
      if (minGuardTime && opponentAttackEnded && !hasIncomingProjectile) {
        this.isGuarding = false;
        this.fighter.stopBlocking();
      } else {
        // ガード継続中 - 現在のガードタイプを維持してスタミナ消費を行う
        // Fighter.block()は同じガードタイプなら再作成しないので、これでOK
        const currentGuard = this.fighter.currentGuardType;
        if (currentGuard) {
          this.fighter.block(currentGuard);
        }
      }
      return; // ガード中は他の行動をしない
    }

    // 行動の決定
    if (time > this.nextActionTime && !this.isGuarding) {
      this.decideAction(keys, time);
      this.nextActionTime = time + this.actionDelay + Math.random() * 200;
    }
  }

  private updateStrategy(): void {
    const healthPercent = this.fighter.health / this.fighter.maxHealth;
    const opponentHealthPercent = this.opponent.health / this.opponent.maxHealth;

    if (healthPercent < 0.3) {
      // 体力が少ない時は防御的に
      this.currentStrategy = "defensive";
    } else if (opponentHealthPercent < 0.3) {
      // 相手の体力が少ない時は攻撃的に
      this.currentStrategy = "aggressive";
    } else if (this.fighter.specialMeter >= 100) {
      // 必殺技ゲージが溜まったら攻撃的に
      this.currentStrategy = "aggressive";
    } else {
      this.currentStrategy = "balanced";
    }
  }

  private shouldGuardAgainstAttack(): boolean {
    const distance = Math.abs(this.fighter.x - this.opponent.x);
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    // ガードスタミナチェック：最低限のスタミナがない場合は諦める
    if (this.fighter.guardStamina < 10) {
      return false;
    }

    // 地上にいて、相手が攻撃中で、近距離の場合
    if (onGround && this.opponent.currentAttackEntity && distance < 180) {
      const attackEntity = this.opponent.currentAttackEntity;

      // 攻撃のstartupまたはactiveフェーズの場合
      if (attackEntity.phase === "startup" || attackEntity.phase === "active") {
        // 難易度と戦略に応じてガード確率を変更
        let guardChance = 0.3; // 基本30%

        if (this.currentStrategy === "defensive") {
          guardChance = 0.7; // 防御戦略: 70%
        } else if (this.currentStrategy === "balanced") {
          guardChance = 0.5; // バランス: 50%
        }

        // 難易度による補正
        switch (this.difficulty) {
          case "hard":
            guardChance += 0.2;
            break;
          case "medium":
            guardChance += 0.1;
            break;
        }

        return Math.random() < guardChance;
      }
    }

    return false;
  }

  private guardAgainstAttack(keys: Map<string, Phaser.Input.Keyboard.Key>, time: number): void {
    // 既にガード中の場合、ガードタイプを変更しない（毎フレーム再決定しない）
    if (this.isGuarding && this.fighter.currentGuardType) {
      return;
    }

    this.isGuarding = true;
    this.guardStartTime = time;

    // 相手の行動意図を読み取る
    const opponentIntent = this.readOpponentIntent();

    // スタミナ量に応じてガード範囲を決定（ガード開始時のみ）
    const staminaPercent = (this.fighter.guardStamina / this.fighter.maxGuardStamina) * 100;

    let guardType: 'high' | 'mid' | 'low' | 'highMid' | 'midLow' | 'all' = 'mid';

    // 読みレベルに応じてガード判断を変える
    if (opponentIntent.readLevel === 'hidden') {
      // 相手の意図が全く読めない場合：スタミナに応じて保守的なガード
      if (staminaPercent > 60) {
        guardType = 'all'; // スタミナがあれば全面ガード
      } else if (staminaPercent > 30) {
        guardType = Math.random() > 0.5 ? 'highMid' : 'midLow'; // 複合ガード
      } else {
        guardType = 'mid'; // スタミナが少なければ中段のみ
      }
    } else if (opponentIntent.readLevel === 'major-only') {
      // 大項目のみ読める場合：「攻撃」かどうかだけわかる
      if (opponentIntent.major === '攻撃') {
        // 攻撃が来ることはわかるが、詳細不明
        if (staminaPercent > 60) {
          guardType = 'all'; // スタミナがあれば全面ガード
        } else if (staminaPercent > 30) {
          guardType = Math.random() > 0.5 ? 'highMid' : 'midLow';
        } else {
          guardType = 'mid';
        }
      } else {
        // 攻撃以外（移動、ダッシュ、ジャンプなど）
        // とりあえず中段ガード
        guardType = 'mid';
      }
    } else {
      // 詳細まで読める場合：小項目に応じて最適なガードを選択
      guardType = this.selectGuardTypeFromIntent(opponentIntent.minor, staminaPercent);
    }

    // 新しいアクションシステムを使ってガードを実行
    const context = this.createActionContext(keys);
    const guardActionMap: Record<string, string> = {
      'high': ActionNames.HIGH_GUARD,
      'mid': ActionNames.MID_GUARD,
      'low': ActionNames.LOW_GUARD,
      'highMid': ActionNames.HIGH_MID_GUARD,
      'midLow': ActionNames.MID_LOW_GUARD,
      'all': ActionNames.ALL_GUARD
    };

    const guardAction = guardActionMap[guardType];
    if (guardAction) {
      const result = this.scene.actionExecutor.execute(guardAction, context);
      if (!result.success) {
        // アクションシステムで失敗した場合は従来のメソッドにフォールバック
        this.fighter.block(guardType);
      }
    }
  }

  /**
   * 相手の行動意図（小項目）から最適なガードタイプを選択
   * 表示された内容に完全に合わせたガードを選択
   */
  private selectGuardTypeFromIntent(minorIntent: string, staminaPercent: number): 'high' | 'mid' | 'low' | 'highMid' | 'midLow' | 'all' {
    let guardType: 'high' | 'mid' | 'low' | 'highMid' | 'midLow' | 'all' = 'mid';

    // 小項目に応じて完全に一致するガードを選択
    switch (minorIntent) {
      case '上段攻撃':
        guardType = 'high';
        break;

      case '中段攻撃':
        guardType = 'mid';
        break;

      case '下段攻撃':
        guardType = 'low';
        break;

      case '必殺技1':
      case '必殺技2':
        // 必殺技は複合攻撃の可能性が高いため、上中ガード
        guardType = 'highMid';
        break;

      case '超必殺技':
        // 超必殺技は全レーン攻撃の可能性が高いため、全面ガード
        guardType = 'all';
        break;

      case '対空攻撃':
        // 対空は上段
        guardType = 'high';
        break;

      case '空中攻撃':
        // 空中攻撃は中段
        guardType = 'mid';
        break;

      case '???':
        // 小項目が読めない場合：リスクを抑えるため広範囲ガード
        if (staminaPercent > 60) {
          guardType = 'all';
        } else if (staminaPercent > 30) {
          guardType = Math.random() > 0.5 ? 'highMid' : 'midLow';
        } else {
          guardType = 'mid';
        }
        break;

      default:
        // その他（攻撃以外の行動意図が表示されている場合）
        guardType = 'mid';
        break;
    }

    return guardType;
  }


  private decideAction(keys: Map<string, Phaser.Input.Keyboard.Key>, time: number): void {
    const distance = Math.abs(this.fighter.x - this.opponent.x);
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    // 画面端の判定
    const screenWidth = this.scene.cameras.main.width;
    const edgeThreshold = 100; // 画面端から100px以内を「端」と判定
    const isNearLeftEdge = this.fighter.x < edgeThreshold;
    const isNearRightEdge = this.fighter.x > screenWidth - edgeThreshold;
    const isCornered = isNearLeftEdge || isNearRightEdge;

    const opponentNearLeftEdge = this.opponent.x < edgeThreshold;
    const opponentNearRightEdge = this.opponent.x > screenWidth - edgeThreshold;
    const opponentCornered = opponentNearLeftEdge || opponentNearRightEdge;

    // 画面端に追い詰められた場合、最優先で脱出
    if (isCornered && distance < 200) {
      // console.log(`[AI] 画面端に追い詰められた！脱出優先`);

      // すべてのキーをリセット
      this.resetKeys(keys);

      if (this.fighter.isAttacking || this.fighter.isDodging) return;

      // 相手が攻撃中の場合、回避アクションを優先的に使用
      if (this.opponent.isAttacking && this.opponent.currentAttack && onGround) {
        const attackData = ATTACK_TYPES[this.opponent.currentAttack];

        // 回避アクションが使用可能かチェック
        if (this.fighter.isCooldownReady("dodge")) {
          // 攻撃レベルに応じて回避方法を選択
          if (attackData.level === "high" || attackData.level === "highMid") {
            // 上段攻撃 → 前転で回避
            // console.log(`[AI] 画面端で前転脱出（上段攻撃回避）`);
            this.fighter.performRoll();
            return;
          } else if (attackData.level === "low" || attackData.level === "midLow") {
            // 下段攻撃 → ジャンプ避けで回避
            // console.log(`[AI] 画面端でジャンプ避け脱出（下段攻撃回避）`);
            this.fighter.performJumpDodge();
            return;
          } else if (attackData.level === "mid") {
            // 中段攻撃 → ランダムで回避
            if (Math.random() < 0.5) {
              // console.log(`[AI] 画面端で前転脱出（中段攻撃）`);
              this.fighter.performRoll();
            } else {
              // console.log(`[AI] 画面端でジャンプ避け脱出（中段攻撃）`);
              this.fighter.performJumpDodge();
            }
            return;
          }
        }
      }

      // 回避アクションが使えない場合、従来の脱出方法
      // ジャンプで相手を飛び越える（60%）、または相手の反対方向に移動（40%）
      if (Math.random() < 0.6 && onGround) {
        // console.log(`[AI] ジャンプで脱出`);
        // 相手方向に前ジャンプで飛び越える
        const jumpHeight = this.selectJumpHeight();
        const jumpDirection = (jumpHeight === 'small') ? 0 : 1;
        this.jump(keys, jumpDirection, jumpHeight);
      } else {
        // 中央方向に移動
        // console.log(`[AI] 中央方向に移動`);
        const moveKey = isNearLeftEdge ? keys.get(this.fighter.controls.right) : keys.get(this.fighter.controls.left);
        if (moveKey) {
          this.simulateKeyPress(moveKey);
        }
      }
      return;
    }

    // 相手を画面端に追い詰めている場合、その状態を維持
    if (opponentCornered && distance < 250) {
      // console.log(`[AI] 相手を画面端に追い詰めている！圧力維持`);

      // すべてのキーをリセット
      this.resetKeys(keys);

      if (this.fighter.isAttacking) return;

      // 相手との距離を維持しながら攻撃
      if (distance > 150) {
        // 少し接近
        // console.log(`[AI] 追い詰め: 接近`);
        this.approach(keys);
      } else if (distance < 80) {
        // 近すぎる場合は少し下がる（相手の脱出を防ぐ位置取り）
        // console.log(`[AI] 追い詰め: 位置調整`);
        this.retreat(keys);
      } else {
        // 適切な距離: 攻撃
        // console.log(`[AI] 追い詰め: 攻撃`);
        this.performAttack(keys);
      }
      return;
    }

    // 近接戦カウンターの更新
    if (time - this.lastDistanceCheckTime > 1000) {
      // 1秒ごとにチェック
      this.lastDistanceCheckTime = time;

      if (distance < 150) {
        // 近接戦中
        this.closeRangeCounter++;
        // console.log(`[AI] 近接戦カウンター: ${this.closeRangeCounter}`);

        // closeRangeAggressionに基づいて距離を取るかどうか決定
        // 近距離攻撃性が高い（0.7以上）場合は距離を取りにくく、低い場合は距離を取りやすい
        const retreatThreshold = Math.floor(5 + (this.aiCustomization.closeRangeAggression * 10)); // 攻撃性1.0なら15回、0.5なら10回、0なら5回

        if (this.closeRangeCounter >= retreatThreshold) {
          // さらに、近距離攻撃性が高い場合は距離を取る確率を下げる
          const shouldRetreat = Math.random() > this.aiCustomization.closeRangeAggression * 0.5; // 攻撃性1.0なら50%で継続、0なら100%で後退

          if (shouldRetreat) {
            this.shouldMaintainDistance = true;
            this.closeRangeCounter = 0;
            // console.log(`[AI] 近接戦終了: 距離を保つモードへ (攻撃性:${this.aiCustomization.closeRangeAggression})`);
          } else {
            this.closeRangeCounter = 0; // カウンターをリセットして近接戦を継続
            // console.log(`[AI] 近接戦継続 (攻撃性が高い:${this.aiCustomization.closeRangeAggression})`);
          }
        }
      } else if (distance > 250) {
        // 遠距離にいる
        if (this.shouldMaintainDistance) {
          // 距離を保つモードで十分時間が経ったら、接近を検討
          if (Math.random() < 0.6) {
            // 60%の確率で接近モードへ（高めに）
            this.shouldMaintainDistance = false;
            // console.log(`[AI] 距離保持終了: 接近モードへ`);
          }
        }
      }
    }

    // すべてのキーをリセット
    this.resetKeys(keys);

    // 攻撃中は何もしない
    if (this.fighter.isAttacking) return;

    // 飛び道具判定はupdateメソッドで既に処理済み

    // AIカスタマイズパラメータに基づく距離閾値の計算
    const preferredDist = this.aiCustomization.preferredDistance;
    const minDistanceThreshold = preferredDist * 0.7;  // 基本距離の70%以下で近すぎる
    const maxDistanceThreshold = preferredDist * 1.5;  // 基本距離の150%以上で遠すぎる
    const ATTACK_EFFECTIVE_RANGE = 120; // 攻撃が有効に届く距離

    // 距離管理モードによる行動決定
    if (this.shouldMaintainDistance) {
      // 距離を保つモード: 遠距離を維持し、時々飛び道具を使う
      if (distance < minDistanceThreshold) {
        // 近すぎる場合は後退
        // console.log(`[AI] 距離保持モード: 後退 (距離:${Math.floor(distance)}, 基準:${preferredDist})`);
        this.retreat(keys);
      } else if (distance > maxDistanceThreshold) {
        // 遠すぎる場合は少し接近
        // console.log(`[AI] 距離保持モード: 少し接近 (距離:${Math.floor(distance)}, 基準:${preferredDist})`);
        this.approach(keys);
      } else {
        // 適切な距離: 時々飛び道具、主に待機
        this.currentIntention = "neutral"; // ニュートラルなフットワーク

        if (this.fighter.specialMeter >= this.aiCustomization.specialMeterThreshold && Math.random() < this.aiCustomization.longRangeAggression) {
          // 遠距離攻撃性に応じて飛び道具
          // console.log(`[AI] 距離保持モード: 飛び道具使用`);
          this.performAttack(keys);
        } else {
          // 待機または微調整（フットワークで小刻みに動く）
          // console.log(`[AI] 距離保持モード: フットワーク待機`);
        }
      }
      return;
    }

    // 接近モード: 攻撃のチャンスを狙う
    if (distance > maxDistanceThreshold) {
      // 超遠距離: 飛び道具を使うか、積極的に接近
      if (this.fighter.specialMeter >= this.aiCustomization.specialMeterThreshold && Math.random() < this.aiCustomization.longRangeAggression * 0.5) {
        // 遠距離攻撃性に応じて飛び道具（控えめに）
        // console.log(`[AI] 接近モード: 超遠距離から飛び道具`);
        this.performAttack(keys);
      } else {
        // 接近優先
        // console.log(`[AI] 接近モード: 超遠距離から接近（距離:${Math.floor(distance)}）`);
        this.approach(keys);
      }
    } else if (distance > preferredDist) {
      // 基本距離より遠い: 積極的に接近
      // console.log(`[AI] 接近モード: 遠距離から接近（距離:${Math.floor(distance)}）`);
      this.approach(keys);
    } else if (distance > ATTACK_EFFECTIVE_RANGE) {
      // 中距離（120-150）: 間合いを詰める
      const healthPercent = this.fighter.health / this.fighter.maxHealth;
      const opponentHealthPercent = this.opponent.health / this.opponent.maxHealth;

      // console.log(`[AI] 接近モード: 中距離で間合い詰め（距離:${Math.floor(distance)}）`);

      // 相手が攻撃中でなければ積極的に接近
      if (!this.opponent.isAttacking) {
        this.approach(keys);
      } else if (healthPercent < opponentHealthPercent - 0.25) {
        // 不利な場合は後退
        // console.log(`[AI] 接近モード: 不利なので後退`);
        this.retreat(keys);
      } else {
        // 慎重に接近
        if (Math.random() < 0.8) {
          // 80%は接近
          this.approach(keys);
        } else if (onGround && this.fighter.guardStamina > 20) {
          this.fighter.block('mid');
          this.isGuarding = true;
          this.guardStartTime = time;
        }
      }
    } else {
      // 近距離: 不利な状況判定と行動選択
      const healthPercent = this.fighter.health / this.fighter.maxHealth;
      const opponentHealthPercent = this.opponent.health / this.opponent.maxHealth;
      const staminaPercent = this.fighter.guardStamina / this.fighter.maxGuardStamina;

      // 不利な状況の判定
      const healthDisadvantage = healthPercent < opponentHealthPercent - 0.2; // 体力差が20%以上不利
      const criticalCondition = healthPercent < 0.4 && staminaPercent < 0.3; // 体力もスタミナも少ない
      const tradeAttack = this.fighter.isAttacking && this.opponent.isAttacking; // 相打ち状態

      const isDisadvantageous = healthDisadvantage || criticalCondition || tradeAttack;

      // 不利な状況では距離を取る、ただし近距離攻撃性が高い場合は距離を取りにくい
      // 近距離攻撃性が高い（1.0）なら不利でも40%で戦い続ける、低い（0）なら60%で後退
      const retreatChance = 0.6 - (this.aiCustomization.closeRangeAggression * 0.4);

      if (isDisadvantageous && Math.random() < retreatChance) {
        // console.log(`[AI] 不利判定: 距離を取る (体力:${(healthPercent * 100).toFixed(0)}% vs ${(opponentHealthPercent * 100).toFixed(0)}%, スタミナ:${(staminaPercent * 100).toFixed(0)}%, 攻撃性:${this.aiCustomization.closeRangeAggression})`);

        // 相手が攻撃中かつ回避アクションが使える場合、回避を試みる
        if (this.opponent.isAttacking && this.opponent.currentAttack && onGround && this.fighter.isCooldownReady("dodge")) {
          const attackData = ATTACK_TYPES[this.opponent.currentAttack];
          const useDodgeChance = 0.5; // 50%の確率で回避アクション

          if (Math.random() < useDodgeChance) {
            if (attackData.level === "high" || attackData.level === "highMid") {
              // console.log(`[AI] 不利状況で前転脱出（上段攻撃回避）`);
              this.fighter.performRoll();
              return;
            } else if (attackData.level === "low" || attackData.level === "midLow") {
              // console.log(`[AI] 不利状況でジャンプ避け脱出（下段攻撃回避）`);
              this.fighter.performJumpDodge();
              return;
            } else if (attackData.level === "mid") {
              // 中段攻撃：ランダムで回避
              if (Math.random() < 0.5) {
                // console.log(`[AI] 不利状況で前転脱出（中段攻撃）`);
                this.fighter.performRoll();
              } else {
                // console.log(`[AI] 不利状況でジャンプ避け脱出（中段攻撃）`);
                this.fighter.performJumpDodge();
              }
              return;
            }
          }
        }

        // 回避アクションを使わない場合、従来の脱出
        if (onGround) {
          // 60%で後退、40%でバックジャンプして距離を取る
          if (Math.random() < 0.6) {
            this.retreat(keys);
          } else {
            // バックジャンプ（相手と反対方向 = 後方向）
            const jumpHeight = this.selectJumpHeight();
            const jumpDirection = (jumpHeight === 'small') ? 0 : -1;
            this.jump(keys, jumpDirection, jumpHeight);
          }
        }
      } else if (this.currentStrategy === "defensive" && Math.random() > 0.4) {
        this.currentIntention = "neutral"; // 防御的な待機
        if (onGround && this.fighter.guardStamina > this.aiCustomization.staminaThreshold) {
          this.fighter.block('mid');
          this.isGuarding = true;
          this.guardStartTime = time;
        } else {
          this.retreat(keys);
        }
      } else if (this.currentStrategy === "balanced" && Math.random() > 0.7) {
        // バランス戦略でも時々ガード（スタミナチェック）
        this.currentIntention = "neutral"; // 様子見
        if (onGround && this.fighter.guardStamina > this.aiCustomization.staminaThreshold) {
          this.fighter.block('mid');
          this.isGuarding = true;
          this.guardStartTime = time;
        } else {
          this.performAttack(keys);
        }
      } else {
        // 近距離攻撃性に応じて攻撃頻度を調整
        this.currentIntention = "neutral"; // 攻撃前の間合い
        if (Math.random() < this.aiCustomization.closeRangeAggression) {
          this.performAttack(keys);
        } else {
          // 攻撃性が低い場合は様子見やガード
          if (onGround && this.fighter.guardStamina > this.aiCustomization.staminaThreshold) {
            this.fighter.block('mid');
            this.isGuarding = true;
            this.guardStartTime = time;
          }
        }
      }
    }
  }

  private approach(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const distance = Math.abs(this.fighter.x - this.opponent.x);
    const direction = this.fighter.x < this.opponent.x ? 1 : -1;
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    // 接近意図を設定（フットワークに反映）
    this.currentIntention = "closing";

    // AIカスタマイズのジャンプ頻度とダッシュ頻度を使用
    const useJumpChance = this.aiCustomization.jumpFrequency;
    let useDashChance = this.aiCustomization.dashFrequency;

    // 距離による補正
    if (distance > 250) {
      useDashChance *= 1.4; // 遠距離は積極的にダッシュ
    } else if (distance > 150) {
      useDashChance *= 1.0; // 中距離はそのまま
    } else {
      useDashChance *= 0.4; // 近距離はダッシュを控える
    }

    // 戦略による補正
    if (this.currentStrategy === "aggressive") {
      useDashChance *= 1.3; // 攻撃的戦略はよりダッシュしやすい
    } else if (this.currentStrategy === "defensive") {
      useDashChance *= 0.7; // 防御的戦略は慎重に
    }

    // スタミナチェック（スタミナ維持値を下回る場合はダッシュしない）
    if (this.fighter.guardStamina < this.aiCustomization.staminaReserve) {
      useDashChance = 0;
    }

    if (Math.random() < useDashChance && onGround && !this.fighter.isDashing) {
      // ダッシュで一気に接近
      const context = this.createActionContext(keys);
      const dashAction = direction > 0 ? ActionNames.FORWARD_DASH : ActionNames.BACKWARD_DASH;
      const result = this.scene.actionExecutor.execute(dashAction, context);

      if (result.success) {
        // console.log(`[AI] ダッシュで一気に接近（距離:${Math.floor(distance)}）`);
      }
    } else {
      // 通常移動で接近（速度補正を適用）
      const speedStat = this.fighter.stats?.speed || 100;
      const speedMultiplier = speedStat / 100;
      const walkSpeed = MOVEMENT_CONFIG.walkSpeed * speedMultiplier;

      // フットワークを一時停止して、直接速度を設定
      if (this.footworkEntity) {
        this.footworkEntity.pause();
      }

      this.fighter.setVelocityX(walkSpeed * direction);
      // console.log(`[AI] 通常移動で接近: 速度=${walkSpeed.toFixed(1)} (基準:${MOVEMENT_CONFIG.walkSpeed}, 倍率:${speedMultiplier}x)`);
    }
  }

  private retreat(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const distance = Math.abs(this.fighter.x - this.opponent.x);
    const direction = this.fighter.x > this.opponent.x ? 1 : -1;
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    // 後退意図を設定（フットワークに反映）
    this.currentIntention = "retreating";

    // AIカスタマイズのジャンプ頻度とダッシュ頻度を使用
    const useJumpChance = this.aiCustomization.jumpFrequency;
    let useDashChance = this.aiCustomization.dashFrequency;

    // 距離による補正
    if (distance < 80) {
      useDashChance *= 1.6; // 超接近は危険なので積極的にダッシュ後退
    } else if (distance < 150) {
      useDashChance *= 1.2; // 近距離もダッシュ後退しやすい
    }

    // 戦略による補正
    if (this.currentStrategy === "defensive") {
      useDashChance *= 1.3; // 防御的戦略はより逃げやすい
    }

    // 体力が少ない場合、より積極的に逃げる
    const healthPercent = this.fighter.health / this.fighter.maxHealth;
    if (healthPercent < 0.3) {
      useDashChance *= 1.4; // 体力が少ないと危険回避優先
    }

    // スタミナチェック（スタミナ維持値を下回る場合はダッシュしない）
    if (this.fighter.guardStamina < this.aiCustomization.staminaReserve) {
      useDashChance = 0;
    }

    if (Math.random() < useDashChance && onGround && !this.fighter.isDashing) {
      // ダッシュで一気に後退して距離を取る
      const context = this.createActionContext(keys);
      const dashAction = direction > 0 ? ActionNames.FORWARD_DASH : ActionNames.BACKWARD_DASH;
      const result = this.scene.actionExecutor.execute(dashAction, context);

      if (result.success) {
        // console.log(`[AI] ダッシュで一気に後退（距離:${Math.floor(distance)}）`);
      }
    } else {
      // 通常移動で後退（速度補正を適用）
      const speedStat = this.fighter.stats?.speed || 100;
      const speedMultiplier = speedStat / 100;
      const walkSpeed = MOVEMENT_CONFIG.walkSpeed * speedMultiplier;

      // フットワークを一時停止して、直接速度を設定
      if (this.footworkEntity) {
        this.footworkEntity.pause();
      }

      this.fighter.setVelocityX(walkSpeed * direction);
      // console.log(`[AI] 通常移動で後退: 速度=${walkSpeed.toFixed(1)} (基準:${MOVEMENT_CONFIG.walkSpeed}, 倍率:${speedMultiplier}x)`);
    }
  }

  private jump(keys: Map<string, Phaser.Input.Keyboard.Key>, direction: number = 0, jumpHeight?: 'small' | 'medium' | 'large'): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;
    if (!onGround) return;

    const height = jumpHeight || this.selectJumpHeight();
    const context = this.createActionContext(keys);

    // 高さと方向に応じてアクション名を選択
    let actionName: string;

    if (height === 'small' && direction === 0) {
      actionName = ActionNames.SMALL_VERTICAL_JUMP;
    } else if (height === 'medium' && direction > 0) {
      actionName = ActionNames.MEDIUM_FORWARD_JUMP;
    } else if (height === 'medium' && direction < 0) {
      actionName = ActionNames.BACKWARD_JUMP;
    } else if (height === 'large' && direction > 0) {
      actionName = ActionNames.LARGE_FORWARD_JUMP;
    } else if (height === 'medium' && direction === 0) {
      actionName = ActionNames.SMALL_VERTICAL_JUMP; // fallback
    } else {
      // その他の組み合わせはperformNormalJumpで処理
      this.fighter.performNormalJump(direction, height);
      return;
    }

    const result = this.scene.actionExecutor.execute(actionName, context);
    if (result.success) {
      console.log(`[AI] Player${this.fighter.playerNumber} ジャンプ実行: ${actionName}`);
    }
  }

  /**
   * AIがジャンプの高さを選択
   * 距離や状況に応じて適切な高さを選択
   */
  private selectJumpHeight(): 'small' | 'medium' | 'large' {
    const distance = Math.abs(this.fighter.x - this.opponent.x);

    let height: 'small' | 'medium' | 'large';

    // 近距離（100未満）: 小ジャンプが有利（着地硬直が短い）
    if (distance < 100) {
      const rand = Math.random();
      if (rand < 0.6) height = 'small';      // 60%
      else if (rand < 0.9) height = 'medium'; // 30%
      else height = 'large';                  // 10%
    }
    // 中距離（100-200）: 中ジャンプがバランス良い
    else if (distance < 200) {
      const rand = Math.random();
      if (rand < 0.2) height = 'small';      // 20%
      else if (rand < 0.7) height = 'medium'; // 50%
      else height = 'large';                  // 30%
    }
    // 遠距離（200以上）: 大ジャンプで距離を稼ぐ
    else {
      const rand = Math.random();
      if (rand < 0.1) height = 'small';      // 10%
      else if (rand < 0.4) height = 'medium'; // 30%
      else height = 'large';                  // 60%
    }

    console.log(`[AI] ジャンプ高さ選択: ${height} (距離: ${distance.toFixed(0)})`);
    return height;
  }


  private performAttack(_keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    if (!onGround) return;

    // ActionContextを作成
    const context = this.createActionContext(_keys);

    // 体力と戦略に応じて攻撃を選択
    const healthPercent = this.fighter.health / this.fighter.maxHealth;
    const opponentHealthPercent = this.opponent.health / this.opponent.maxHealth;
    const distance = Math.abs(this.fighter.x - this.opponent.x);

    // 攻撃の間合い定義
    const LIGHT_ATTACK_RANGE = 70 + 30; // 弱攻撃の有効範囲（range + 余裕）
    const MEDIUM_ATTACK_RANGE = 80 + 30; // 中攻撃の有効範囲
    const HEAVY_ATTACK_RANGE = 90 + 30; // 強攻撃の有効範囲
    const SPECIAL_ATTACK_RANGE = 120 + 30; // 必殺技の有効範囲

    // デバッグ: 距離とメーターを表示
    // console.log(`[AI-Attack] 距離:${Math.floor(distance)}, 戦略:${this.currentStrategy}`);

    // 遠距離の場合、飛び道具を使う判定（控えめに）
    if (distance > HEAVY_ATTACK_RANGE && this.fighter.specialMeter >= 20) {
      let useProjectileChance = 0.15; // 基本15%（近接戦を優先）

      // 防御的戦略の場合、少し使いやすい
      if (this.currentStrategy === "defensive") {
        useProjectileChance = 0.3; // 30%
      }

      // 非常に遠距離（300以上）の場合のみ、飛び道具を使いやすく
      if (distance > 300) {
        useProjectileChance = 0.5; // 50%
      }

      // console.log(`[AI-Attack] 飛び道具判定: 確率${(useProjectileChance * 100).toFixed(0)}%`);

      if (Math.random() < useProjectileChance) {
        const projectile = this.fighter.shootProjectile();
        if (projectile) {
          this.scene.addProjectile(projectile);
          // console.log(`✓ AI飛び道具発射成功！ 距離:${Math.floor(distance)}`);
          return;
        }
      }
    }

    // 間合い外の場合、攻撃しない（代わりに移動で距離を詰める）
    // ただし、デバッグログは出さない（頻繁すぎるため）
    if (distance > HEAVY_ATTACK_RANGE) {
      return; // 攻撃せずに移動に任せる
    }

    // 超必殺技（ゲージ100）が使える場合、戦略的に使用
    const canUseSuperSpecial = this.fighter.specialMeter >= 100 &&
                               this.fighter.specialMeter >= this.aiCustomization.specialMeterThreshold;

    if (canUseSuperSpecial) {
      const SUPER_SPECIAL_RANGE = 150 + 30;

      if (distance <= SUPER_SPECIAL_RANGE) {
        let useSuperSpecialChance = 0.5;

        if (opponentHealthPercent < 0.3) {
          useSuperSpecialChance = 0.8;
        } else if (opponentHealthPercent < 0.5) {
          useSuperSpecialChance = 0.65;
        }

        if (healthPercent < 0.3) {
          useSuperSpecialChance = Math.max(useSuperSpecialChance, 0.7);
        }

        if (Math.random() < useSuperSpecialChance) {
          const result = this.scene.actionExecutor.execute(ActionNames.SUPER_SPECIAL, context);
          if (result.success) {
            return;
          }
        }
      }
    }

    // 通常必殺技（クールタイムのみ）を使う判定
    const canUseSpecial = this.fighter.specialMeter >= this.aiCustomization.specialMeterThreshold;

    if (canUseSpecial && distance <= SPECIAL_ATTACK_RANGE) {
      let useSpecialChance = 0.3;

      if (opponentHealthPercent < 0.4) {
        useSpecialChance = 0.5;
      }

      if (Math.random() < useSpecialChance) {
        // ランダムで上中または中下の必殺技を選択
        const specialActions = [ActionNames.SPECIAL_HIGH_MID, ActionNames.SPECIAL_MID_LOW];
        const randomSpecial = specialActions[Math.floor(Math.random() * specialActions.length)];
        const result = this.scene.actionExecutor.execute(randomSpecial, context);
        if (result.success) {
          return;
        }
      }
    }

    // 通常攻撃：ActionExecutorを使って利用可能な攻撃を取得
    const availableAttacks = this.scene.actionExecutor.getAvailableActions('attack', context);

    if (availableAttacks.length === 0) {
      return; // 実行可能な攻撃がない
    }

    // 戦略に応じて攻撃を選択
    let selectedAttack = availableAttacks[0]; // デフォルトは優先度最高の攻撃

    if (this.currentStrategy === "aggressive") {
      // 攻撃的戦略：強攻撃を優先
      const heavyAttacks = availableAttacks.filter(a => a.name.startsWith('heavy'));
      if (heavyAttacks.length > 0) {
        selectedAttack = heavyAttacks[0];
      }
    } else if (this.currentStrategy === "defensive") {
      // 防御的戦略：弱攻撃を優先（素早い）
      const lightAttacks = availableAttacks.filter(a => a.name.startsWith('light'));
      if (lightAttacks.length > 0) {
        selectedAttack = lightAttacks[0];
      }
    }
    // balanced戦略の場合は優先度順のまま（中攻撃が中心になる）

    // 選択した攻撃を実行
    const result = this.scene.actionExecutor.execute(selectedAttack.name, context);

    if (result.success) {
      console.log(`[AI-Attack] ${this.fighter.playerNumber === 1 ? 'P1' : 'P2'} 攻撃実行: ${selectedAttack.name} 距離:${Math.floor(distance)}`);
    }
  }

  private resetKeys(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    keys.forEach((key) => {
      if (key.isDown) {
        this.simulateKeyUp(key);
      }
    });
  }

  private simulateKeyPress(key: Phaser.Input.Keyboard.Key): void {
    if (!key.isDown) {
      Object.defineProperty(key, "isDown", {value: true, writable: true});
    }
  }

  private simulateKeyDown(key: Phaser.Input.Keyboard.Key): void {
    Object.defineProperty(key, "isDown", {value: true, writable: true});
    Object.defineProperty(key, "timeDown", {value: Date.now(), writable: true});
  }

  private simulateKeyUp(key: Phaser.Input.Keyboard.Key): void {
    Object.defineProperty(key, "isDown", {value: false, writable: true});
    Object.defineProperty(key, "timeUp", {value: Date.now(), writable: true});
  }

  setDifficulty(difficulty: "easy" | "medium" | "hard"): void {
    this.difficulty = difficulty;
    switch (difficulty) {
      case "easy":
        this.actionDelay = 800;
        break;
      case "medium":
        this.actionDelay = 400;
        break;
      case "hard":
        this.actionDelay = 200;
        break;
    }
  }

  /**
   * 相手の行動意図を読み取る
   */
  private readOpponentIntent(): { major: string; minor: string; readLevel: 'full' | 'major-only' | 'hidden' } {
    const readLevel = this.opponent.readabilityGauge.getDisplayLevel();
    const intent = this.opponent.actionIntent.getDisplayText(readLevel);

    return {
      major: intent.major,
      minor: intent.minor,
      readLevel
    };
  }

  /**
   * ActionContextを作成
   */
  private createActionContext(keys?: Map<string, Phaser.Input.Keyboard.Key>): ActionContext {
    return {
      fighter: this.fighter,
      opponent: this.opponent,
      scene: this.scene,
      keys
    };
  }
}
