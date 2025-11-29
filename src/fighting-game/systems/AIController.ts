import * as Phaser from "phaser";
import {Fighter, AttackType} from "../entities/Fighter";
import {FightScene} from "../scenes/FightScene";
import {ProjectileEntity} from "../entities/ProjectileEntity";
import {FootworkEntity} from "../entities/FootworkEntity";
import {ATTACK_TYPES, MOVEMENT_CONFIG} from "../config/gameConfig";

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
  private shouldJumpAfterDash: boolean; // ダッシュ後にジャンプするフラグ
  private dashStartTime: number; // ダッシュ開始時刻

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
    this.shouldJumpAfterDash = false;
    this.dashStartTime = 0;

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

    // 攻撃中、ガード中、ダッシュ中はフットワーク停止
    if (this.fighter.isAttacking || this.isGuarding || this.fighter.isDashing) {
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

    // ダッシュ中のジャンプチェック
    if (this.shouldJumpAfterDash) {
      // console.log(`[AI-Update] ダッシュジャンプフラグON、isDashing=${this.fighter.isDashing}`);

      if (this.fighter.isDashing) {
        const timeSinceDash = time - this.dashStartTime;
        // console.log(`[AI-Update] ダッシュ経過時間=${timeSinceDash.toFixed(0)}ms`);

        // ダッシュ開始から50ms以上経過したらジャンプ
        if (timeSinceDash >= 50 && timeSinceDash <= 250) {
          if (this.fighter.currentMovement) {
            const dashVel = (this.fighter.currentMovement as any).getDashVelocity?.();
            // console.log(`[AI-Update] getDashVelocity結果=${dashVel}`);
            if (dashVel) {
              const jumpHeight = this.selectJumpHeight();
              this.fighter.performDashJump(dashVel, jumpHeight);
              // console.log(`[AI] ダッシュ中にジャンプしてダッシュジャンプへ移行 (経過:${timeSinceDash.toFixed(0)}ms, 高さ:${jumpHeight})`);
              this.shouldJumpAfterDash = false;
            }
          }
        } else if (timeSinceDash > 250) {
          // タイミングを逃した
          // console.log(`[AI-Update] ダッシュジャンプタイミング逃した (${timeSinceDash.toFixed(0)}ms)`);
          this.shouldJumpAfterDash = false;
        }
      } else {
        // ダッシュが既に終了している
        // console.log(`[AI-Update] ダッシュ終了済みのためフラグリセット`);
        this.shouldJumpAfterDash = false;
      }
    }

    // フットワーク更新
    if (this.footworkEntity && MOVEMENT_CONFIG.footworkEnabled) {
      this.updateFootwork();
    }

    // 戦略の動的変更
    this.updateStrategy();

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
              this.jump(keys, 0, this.selectJumpHeight());
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
                this.jump(keys, 0, this.selectJumpHeight());
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
        // ガード継続中 - 毎フレームblock()を呼んでスタミナ消費を行う
        this.fighter.block('mid');
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
    if (!this.opponent.currentAttack) return;

    const attackData = ATTACK_TYPES[this.opponent.currentAttack];

    this.isGuarding = true;
    this.guardStartTime = time;

    // スタミナ量に応じてガード範囲を決定
    const staminaPercent = (this.fighter.guardStamina / this.fighter.maxGuardStamina) * 100;

    // スタミナが十分なら広範囲ガードを選択しやすく
    const guardChoice = Math.random();
    let guardType: 'high' | 'mid' | 'low' | 'highMid' | 'midLow' | 'all' = 'mid';

    if (staminaPercent > 60) {
      // スタミナ豊富: 広範囲ガードを選択しやすく
      if (guardChoice < 0.3) {
        guardType = 'all';
      } else if (guardChoice < 0.8) {
        // 複合ガード（攻撃レベルに応じて）
        if (attackData.level === 'high' || attackData.level === 'highMid') {
          guardType = 'highMid';
        } else if (attackData.level === 'low' || attackData.level === 'midLow') {
          guardType = 'midLow';
        } else {
          guardType = Math.random() > 0.5 ? 'highMid' : 'midLow';
        }
      } else {
        // 単一ガード
        if (attackData.level === 'high') guardType = 'high';
        else if (attackData.level === 'low') guardType = 'low';
        else guardType = 'mid';
      }
    } else if (staminaPercent > 30) {
      // スタミナ中程度
      if (guardChoice < 0.1) {
        guardType = 'all';
      } else if (guardChoice < 0.5) {
        if (attackData.level === 'high' || attackData.level === 'highMid') {
          guardType = 'highMid';
        } else if (attackData.level === 'low' || attackData.level === 'midLow') {
          guardType = 'midLow';
        } else {
          guardType = 'mid';
        }
      } else {
        if (attackData.level === 'high') guardType = 'high';
        else if (attackData.level === 'low') guardType = 'low';
        else guardType = 'mid';
      }
    } else {
      // スタミナ低: 単一ガードのみ
      if (attackData.level === 'high') guardType = 'high';
      else if (attackData.level === 'low') guardType = 'low';
      else guardType = 'mid';
    }

    // Fighter.block()を直接呼ぶ
    this.fighter.block(guardType);
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
        const jumpDirection = this.fighter.x < this.opponent.x ? 1 : -1;
        this.jump(keys, jumpDirection, this.selectJumpHeight());
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
            // バックジャンプ（相手と反対方向）
            const jumpDirection = this.fighter.x > this.opponent.x ? 1 : -1;
            this.jump(keys, jumpDirection, this.selectJumpHeight());
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

    // ダッシュジャンプの選択肢を追加（中距離以上で有効）
    // 確率を大幅に上げる: dashFrequency * jumpFrequency * 2.0
    const useDashJumpChance = distance > 150 ? useDashChance * useJumpChance * 2.0 : 0;

    if (Math.random() < useDashJumpChance && onGround && !this.fighter.isDashing) {
      // ダッシュジャンプで一気に接近
      const speedStat = this.fighter.stats?.speed || 100;
      const speedMultiplier = 0.5 + (speedStat / 100);
      const dashSpeed = MOVEMENT_CONFIG.dashSpeed * speedMultiplier;
      const dashVelocity = dashSpeed * direction;
      const jumpHeight = this.selectJumpHeight();

      this.fighter.performDashJump(dashVelocity, jumpHeight);
      // console.log(`[AI] ダッシュジャンプで一気に接近（距離:${Math.floor(distance)}, 高さ:${jumpHeight}）`);
    } else if (Math.random() < useDashChance && onGround && !this.fighter.isDashing) {
      // ダッシュで一気に接近
      const dashSuccess = this.fighter.performDash(direction);

      if (dashSuccess) {
        // console.log(`[AI] ダッシュで一気に接近（距離:${Math.floor(distance)}）`);

        // ダッシュ開始直後、一定確率でジャンプしてダッシュジャンプに移行
        // ダッシュ中のジャンプ確率: jumpFrequency * 0.6
        const shouldJump = Math.random() < useJumpChance * 0.6;
        // console.log(`[AI] ダッシュ実行、ジャンプ判定=${shouldJump} (確率:${(useJumpChance * 0.6 * 100).toFixed(1)}%)`);
        if (shouldJump) {
          this.shouldJumpAfterDash = true;
          this.dashStartTime = this.scene.time.now;
          // console.log(`[AI] ダッシュジャンプフラグ設定（接近）`);
        }
      } else {
        // console.log(`[AI] ダッシュ失敗（クールタイム or スタミナ不足）`);
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

    // ダッシュジャンプの選択肢を追加（近距離で有効）
    // 確率を大幅に上げる: dashFrequency * jumpFrequency * 1.5
    const useDashJumpChance = distance < 150 ? useDashChance * useJumpChance * 1.5 : 0;

    if (Math.random() < useDashJumpChance && onGround && !this.fighter.isDashing) {
      // ダッシュジャンプで一気に後退
      const speedStat = this.fighter.stats?.speed || 100;
      const speedMultiplier = 0.5 + (speedStat / 100);
      const dashSpeed = MOVEMENT_CONFIG.dashSpeed * speedMultiplier;
      const dashVelocity = dashSpeed * direction;
      const jumpHeight = this.selectJumpHeight();

      this.fighter.performDashJump(dashVelocity, jumpHeight);
      // console.log(`[AI] ダッシュジャンプで一気に後退（距離:${Math.floor(distance)}, 高さ:${jumpHeight}）`);
    } else if (Math.random() < useDashChance && onGround && !this.fighter.isDashing) {
      // ダッシュで一気に後退して距離を取る
      const dashSuccess = this.fighter.performDash(direction);

      if (dashSuccess) {
        // console.log(`[AI] ダッシュで一気に後退（距離:${Math.floor(distance)}）`);

        // ダッシュ開始直後、一定確率でジャンプしてダッシュジャンプに移行
        // ダッシュ中のジャンプ確率: jumpFrequency * 0.5
        const shouldJump = Math.random() < useJumpChance * 0.5;
        // console.log(`[AI] 後退ダッシュ実行、ジャンプ判定=${shouldJump} (確率:${(useJumpChance * 0.5 * 100).toFixed(1)}%)`);
        if (shouldJump) {
          this.shouldJumpAfterDash = true;
          this.dashStartTime = this.scene.time.now;
          // console.log(`[AI] ダッシュジャンプフラグ設定（後退）`);
        }
      } else {
        // console.log(`[AI] 後退ダッシュ失敗（クールタイム or スタミナ不足）`);
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

  private jump(_keys: Map<string, Phaser.Input.Keyboard.Key>, direction: number = 0, jumpHeight?: 'small' | 'medium' | 'large'): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;
    if (onGround) {
      const height = jumpHeight || this.selectJumpHeight();

      // ダッシュ中ならダッシュジャンプを使用
      if (this.fighter.isDashing && this.fighter.currentMovement) {
        const dashVelocity = (this.fighter.currentMovement as any).getDashVelocity?.();
        if (dashVelocity) {
          this.fighter.performDashJump(dashVelocity, height);
          // console.log(`[AI] ダッシュジャンプ実行 (高さ:${height})`);
          return;
        }
      }

      // 方向指定がある場合は前ジャンプ/バックジャンプ
      if (direction !== 0) {
        const speedStat = this.fighter.stats?.speed || 100;
        const speedMultiplier = 0.5 + (speedStat / 100);
        const jumpSpeed = MOVEMENT_CONFIG.dashJumpVelocityX * speedMultiplier * 0.5;
        const jumpVelocity = jumpSpeed * direction;

        this.fighter.performDashJump(jumpVelocity, height);
        // console.log(`[AI] ${direction > 0 ? '前' : 'バック'}ジャンプ実行: 速度=${jumpVelocity.toFixed(1)}, 高さ=${height}`);
      } else {
        // 垂直ジャンプ
        this.fighter.performNormalJump(height);
      }
    }
  }

  /**
   * AIがジャンプの高さを選択
   * 距離や状況に応じて適切な高さを選択
   */
  private selectJumpHeight(): 'small' | 'medium' | 'large' {
    const distance = Math.abs(this.fighter.x - this.opponent.x);

    // 近距離（100未満）: 小ジャンプが有利（着地硬直が短い）
    if (distance < 100) {
      const rand = Math.random();
      if (rand < 0.6) return 'small';      // 60%
      else if (rand < 0.9) return 'medium'; // 30%
      else return 'large';                  // 10%
    }
    // 中距離（100-200）: 中ジャンプがバランス良い
    else if (distance < 200) {
      const rand = Math.random();
      if (rand < 0.2) return 'small';      // 20%
      else if (rand < 0.7) return 'medium'; // 50%
      else return 'large';                  // 30%
    }
    // 遠距離（200以上）: 大ジャンプで距離を稼ぐ
    else {
      const rand = Math.random();
      if (rand < 0.1) return 'small';      // 10%
      else if (rand < 0.4) return 'medium'; // 30%
      else return 'large';                  // 60%
    }
  }


  private performAttack(_keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    if (!onGround) return;

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
    // specialMeterThreshold以上、かつゲージ維持値を残せる場合
    const canUseSuperSpecial = this.fighter.specialMeter >= 100 &&
                               this.fighter.specialMeter >= this.aiCustomization.specialMeterThreshold;

    if (canUseSuperSpecial && this.fighter.isCooldownReady("special")) {
      // 超必殺技の間合いチェック（range: 150）
      const SUPER_SPECIAL_RANGE = 150 + 30;

      if (distance <= SUPER_SPECIAL_RANGE) {
        let useSuperSpecialChance = 0.5; // 基本50%

        // 相手の体力が少ない場合、決定打として使いやすい
        if (opponentHealthPercent < 0.3) {
          useSuperSpecialChance = 0.8; // 80%
        } else if (opponentHealthPercent < 0.5) {
          useSuperSpecialChance = 0.65; // 65%
        }

        // 自分の体力が少ない場合、逆転を狙って使う
        if (healthPercent < 0.3) {
          useSuperSpecialChance = Math.max(useSuperSpecialChance, 0.7); // 最低70%
        }

        if (Math.random() < useSuperSpecialChance) {
          // console.log(`[AI-Attack] 超必殺技発動！ 距離:${Math.floor(distance)}`);
          this.fighter.performAttack("superSpecial");
          return;
        }
      }
    }

    // 通常必殺技（クールタイムのみ）を使う判定
    // specialMeterThreshold以上で使用可能
    const canUseSpecial = this.fighter.specialMeter >= this.aiCustomization.specialMeterThreshold;

    if (canUseSpecial && this.fighter.isCooldownReady("special") && distance <= SPECIAL_ATTACK_RANGE) {
      let useSpecialChance = 0.3; // 基本30%

      // 相手の体力が少ない場合
      if (opponentHealthPercent < 0.4) {
        useSpecialChance = 0.5; // 50%
      }

      if (Math.random() < useSpecialChance) {
        // ランダムで上中または中下の必殺技を選択
        const specialTypes: AttackType[] = ["specialHighMid", "specialMidLow"];
        const randomSpecial = specialTypes[Math.floor(Math.random() * specialTypes.length)];
        // console.log(`[AI-Attack] 通常必殺技発動: ${randomSpecial} 距離:${Math.floor(distance)}`);
        this.fighter.performAttack(randomSpecial);
        return;
      }
    }

    // 通常攻撃：距離に応じて適切な攻撃を選択
    let attackChoice: AttackType;

    // 攻撃レベル（上段・中段・下段）をランダムに選択
    const levels: Array<"High" | "Mid" | "Low"> = ["High", "Mid", "Low"];
    const level = levels[Math.floor(Math.random() * levels.length)];

    // 距離に応じた攻撃選択
    if (distance <= LIGHT_ATTACK_RANGE) {
      // 最近接距離：全ての攻撃が届く
      // console.log(`[AI-Attack] 最近接距離（${Math.floor(distance)} <= ${LIGHT_ATTACK_RANGE}）`);

      if (this.currentStrategy === "aggressive") {
        // 攻撃的: 強攻撃→中攻撃→弱攻撃の優先順位
        if (this.fighter.isCooldownReady("heavy")) {
          attackChoice = `heavy${level}` as AttackType;
        } else if (this.fighter.isCooldownReady("medium")) {
          attackChoice = `medium${level}` as AttackType;
        } else if (this.fighter.isCooldownReady("light")) {
          attackChoice = `light${level}` as AttackType;
        } else {
          return; // 全てクールタイム中
        }
      } else if (this.currentStrategy === "defensive") {
        // 防御的: 弱攻撃で素早く
        if (this.fighter.isCooldownReady("light")) {
          attackChoice = `light${level}` as AttackType;
        } else if (this.fighter.isCooldownReady("medium")) {
          attackChoice = `medium${level}` as AttackType;
        } else {
          return;
        }
      } else {
        // バランス: 中攻撃中心
        const rand = Math.random();
        if (rand > 0.7 && this.fighter.isCooldownReady("heavy")) {
          attackChoice = `heavy${level}` as AttackType;
        } else if (rand > 0.3 && this.fighter.isCooldownReady("medium")) {
          attackChoice = `medium${level}` as AttackType;
        } else if (this.fighter.isCooldownReady("light")) {
          attackChoice = `light${level}` as AttackType;
        } else {
          return;
        }
      }
    } else if (distance <= MEDIUM_ATTACK_RANGE) {
      // 中距離：中攻撃と強攻撃が届く
      // console.log(`[AI-Attack] 中距離（${Math.floor(distance)} <= ${MEDIUM_ATTACK_RANGE}）`);

      if (this.fighter.isCooldownReady("heavy")) {
        attackChoice = `heavy${level}` as AttackType;
      } else if (this.fighter.isCooldownReady("medium")) {
        attackChoice = `medium${level}` as AttackType;
      } else {
        return; // 弱攻撃は届かないので攻撃しない
      }
    } else {
      // 遠距離：強攻撃のみ届く
      // console.log(`[AI-Attack] 遠距離（${Math.floor(distance)} <= ${HEAVY_ATTACK_RANGE}）`);

      if (this.fighter.isCooldownReady("heavy")) {
        attackChoice = `heavy${level}` as AttackType;
      } else {
        return; // 強攻撃以外は届かないので攻撃しない
      }
    }

    // console.log(`[AI-Attack] 攻撃実行: ${attackChoice} 距離:${Math.floor(distance)}`);
    this.fighter.performAttack(attackChoice);
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
}
