import * as Phaser from 'phaser';
import { Fighter, AttackType } from '../entities/Fighter';
import { ATTACK_TYPES } from '../config/gameConfig';

export class AIController {
  private fighter: Fighter;
  private opponent: Fighter;
  private scene: Phaser.Scene;
  private nextActionTime: number;
  private actionDelay: number;
  private difficulty: 'easy' | 'medium' | 'hard';
  private currentStrategy: 'aggressive' | 'defensive' | 'balanced';
  private isGuarding: boolean;
  private guardStartTime: number;

  constructor(
    fighter: Fighter,
    opponent: Fighter,
    scene: Phaser.Scene,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ) {
    this.fighter = fighter;
    this.opponent = opponent;
    this.scene = scene;
    this.difficulty = difficulty;
    this.nextActionTime = 0;
    this.currentStrategy = 'balanced';
    this.isGuarding = false;
    this.guardStartTime = 0;

    // 難易度による反応速度の設定
    switch (difficulty) {
      case 'easy':
        this.actionDelay = 800;
        break;
      case 'medium':
        this.actionDelay = 400;
        break;
      case 'hard':
        this.actionDelay = 200;
        break;
    }
  }

  update(time: number, keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    if (this.fighter.state === 'defeated') return;

    // 戦略の動的変更
    this.updateStrategy();

    // 相手の攻撃に反応してガード
    if (this.shouldGuardAgainstAttack()) {
      this.guardAgainstAttack(keys, time);
      return;
    }

    // ガード中の場合、一定時間後に解除
    if (this.isGuarding && time - this.guardStartTime > 600) {
      this.isGuarding = false;
      this.resetKeys(keys);
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
      this.currentStrategy = 'defensive';
    } else if (opponentHealthPercent < 0.3) {
      // 相手の体力が少ない時は攻撃的に
      this.currentStrategy = 'aggressive';
    } else if (this.fighter.specialMeter >= 100) {
      // 必殺技ゲージが溜まったら攻撃的に
      this.currentStrategy = 'aggressive';
    } else {
      this.currentStrategy = 'balanced';
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
      if (attackEntity.phase === 'startup' || attackEntity.phase === 'active') {
        // 難易度と戦略に応じてガード確率を変更
        let guardChance = 0.3; // 基本30%

        if (this.currentStrategy === 'defensive') {
          guardChance = 0.7; // 防御戦略: 70%
        } else if (this.currentStrategy === 'balanced') {
          guardChance = 0.5; // バランス: 50%
        }

        // 難易度による補正
        switch (this.difficulty) {
          case 'hard':
            guardChance += 0.2;
            break;
          case 'medium':
            guardChance += 0.1;
            break;
        }

        return Math.random() < guardChance;
      }
    }

    return false;
  }

  private guardAgainstAttack(keys: Map<string, Phaser.Input.Keyboard.Key>, time: number): void {
    this.resetKeys(keys);

    if (!this.opponent.currentAttack) return;

    const attackData = ATTACK_TYPES[this.opponent.currentAttack];
    const blockKey = keys.get(this.fighter.controls.block);
    const upKey = keys.get(this.fighter.controls.up);
    const downKey = keys.get(this.fighter.controls.down);
    const leftKey = keys.get(this.fighter.controls.left);
    const rightKey = keys.get(this.fighter.controls.right);

    if (!blockKey) return;

    // ブロックキーを押す
    this.simulateKeyPress(blockKey);
    this.isGuarding = true;
    this.guardStartTime = time;

    // スタミナ量に応じてガード範囲を決定
    const staminaPercent = (this.fighter.guardStamina / this.fighter.maxGuardStamina) * 100;

    // スタミナが十分なら広範囲ガードを選択しやすく
    const guardChoice = Math.random();

    if (staminaPercent > 60) {
      // スタミナ豊富: 50%で複合、30%で全面、20%で単一
      if (guardChoice < 0.3) {
        // 全面ガード (上+下)
        if (upKey && downKey) {
          this.simulateKeyPress(upKey);
          this.simulateKeyPress(downKey);
        }
      } else if (guardChoice < 0.8) {
        // 複合ガード (2箇所)
        if (attackData.level === 'high') {
          // 上段+中段 (上+左右)
          const sideKey = leftKey || rightKey;
          if (upKey && sideKey) {
            this.simulateKeyPress(upKey);
            this.simulateKeyPress(sideKey);
          }
        } else if (attackData.level === 'low') {
          // 中段+下段 (下+左右)
          const sideKey = leftKey || rightKey;
          if (downKey && sideKey) {
            this.simulateKeyPress(downKey);
            this.simulateKeyPress(sideKey);
          }
        } else {
          // 中段なので上中か中下をランダム
          const sideKey = leftKey || rightKey;
          if (Math.random() > 0.5 && upKey && sideKey) {
            this.simulateKeyPress(upKey);
            this.simulateKeyPress(sideKey);
          } else if (downKey && sideKey) {
            this.simulateKeyPress(downKey);
            this.simulateKeyPress(sideKey);
          }
        }
      } else {
        // 単一ガード
        this.selectSingleGuard(attackData.level, upKey, downKey);
      }
    } else if (staminaPercent > 30) {
      // スタミナ中程度: 40%で複合、10%で全面、50%で単一
      if (guardChoice < 0.1) {
        // 全面ガード
        if (upKey && downKey) {
          this.simulateKeyPress(upKey);
          this.simulateKeyPress(downKey);
        }
      } else if (guardChoice < 0.5) {
        // 複合ガード
        const sideKey = leftKey || rightKey;
        if (attackData.level === 'high' && upKey && sideKey) {
          this.simulateKeyPress(upKey);
          this.simulateKeyPress(sideKey);
        } else if (attackData.level === 'low' && downKey && sideKey) {
          this.simulateKeyPress(downKey);
          this.simulateKeyPress(sideKey);
        } else {
          this.selectSingleGuard(attackData.level, upKey, downKey);
        }
      } else {
        // 単一ガード
        this.selectSingleGuard(attackData.level, upKey, downKey);
      }
    } else {
      // スタミナ低: 単一ガードのみ
      this.selectSingleGuard(attackData.level, upKey, downKey);
    }
  }

  private selectSingleGuard(
    level: 'high' | 'mid' | 'low',
    upKey?: Phaser.Input.Keyboard.Key,
    downKey?: Phaser.Input.Keyboard.Key
  ): void {
    if (level === 'high' && upKey) {
      this.simulateKeyPress(upKey);
    } else if (level === 'low' && downKey) {
      this.simulateKeyPress(downKey);
    }
    // mid の場合は何も押さない（デフォルトガード）
  }

  private decideAction(keys: Map<string, Phaser.Input.Keyboard.Key>, time: number): void {
    const distance = Math.abs(this.fighter.x - this.opponent.x);
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    // すべてのキーをリセット
    this.resetKeys(keys);

    // 攻撃中は何もしない
    if (this.fighter.isAttacking) return;

    // 距離に応じた行動
    if (distance > 250) {
      // 遠距離: 接近する
      this.approach(keys);
    } else if (distance > 80) {
      // 中距離: 戦略に応じた行動
      if (this.currentStrategy === 'aggressive') {
        if (Math.random() > 0.3) {
          this.approach(keys);
        } else if (onGround) {
          this.jump(keys);
        }
      } else if (this.currentStrategy === 'defensive') {
        if (Math.random() > 0.4) {
          this.retreat(keys);
        } else if (onGround && this.fighter.guardStamina > 20) {
          // 防御的戦略の場合、予防的にガード（スタミナチェック）
          this.block(keys, time);
        }
      } else {
        if (Math.random() > 0.7 && onGround && this.fighter.guardStamina > 20) {
          // バランス戦略でも時々ガード（スタミナチェック）
          this.block(keys, time);
        } else {
          this.approach(keys);
        }
      }
    } else {
      // 近距離: 攻撃または防御
      if (this.currentStrategy === 'defensive' && Math.random() > 0.4) {
        if (onGround && this.fighter.guardStamina > 20) {
          this.block(keys, time);
        } else {
          this.retreat(keys);
        }
      } else if (this.currentStrategy === 'balanced' && Math.random() > 0.7) {
        // バランス戦略でも時々ガード（スタミナチェック）
        if (onGround && this.fighter.guardStamina > 20) {
          this.block(keys, time);
        } else {
          this.performAttack(keys);
        }
      } else {
        this.performAttack(keys);
      }
    }
  }

  private approach(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const moveKey = this.fighter.x < this.opponent.x
      ? keys.get(this.fighter.controls.right)
      : keys.get(this.fighter.controls.left);

    if (moveKey) {
      this.simulateKeyPress(moveKey);
    }
  }

  private retreat(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const moveKey = this.fighter.x > this.opponent.x
      ? keys.get(this.fighter.controls.right)
      : keys.get(this.fighter.controls.left);

    if (moveKey) {
      this.simulateKeyPress(moveKey);
    }
  }

  private jump(_keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;
    if (onGround) {
      this.fighter.jump();
    }
  }

  private block(keys: Map<string, Phaser.Input.Keyboard.Key>, time: number): void {
    const blockKey = keys.get(this.fighter.controls.block);
    const upKey = keys.get(this.fighter.controls.up);
    const downKey = keys.get(this.fighter.controls.down);
    const leftKey = keys.get(this.fighter.controls.left);
    const rightKey = keys.get(this.fighter.controls.right);

    if (blockKey) {
      this.simulateKeyPress(blockKey);
      this.isGuarding = true;
      this.guardStartTime = time;

      // スタミナ量に応じてガード範囲を決定
      const staminaPercent = (this.fighter.guardStamina / this.fighter.maxGuardStamina) * 100;
      const guardChoice = Math.random();

      // 相手が攻撃中なら、その攻撃レベルに応じたガードを選択
      if (this.opponent.currentAttack) {
        const attackData = ATTACK_TYPES[this.opponent.currentAttack];

        if (staminaPercent > 60) {
          // スタミナ豊富: 広範囲ガード優先
          if (guardChoice < 0.4) {
            // 全面ガード
            if (upKey && downKey) {
              this.simulateKeyPress(upKey);
              this.simulateKeyPress(downKey);
            }
          } else if (guardChoice < 0.8) {
            // 複合ガード
            this.selectCompoundGuard(attackData.level, upKey, downKey, leftKey, rightKey);
          } else {
            this.selectSingleGuard(attackData.level, upKey, downKey);
          }
        } else if (staminaPercent > 30) {
          // スタミナ中程度
          if (guardChoice < 0.5) {
            this.selectCompoundGuard(attackData.level, upKey, downKey, leftKey, rightKey);
          } else {
            this.selectSingleGuard(attackData.level, upKey, downKey);
          }
        } else {
          // スタミナ低: 単一のみ
          this.selectSingleGuard(attackData.level, upKey, downKey);
        }
      } else {
        // 攻撃が来ていない場合は予測してガードの種類を選択
        if (staminaPercent > 60 && guardChoice < 0.3) {
          // 全面ガード
          if (upKey && downKey) {
            this.simulateKeyPress(upKey);
            this.simulateKeyPress(downKey);
          }
        } else if (staminaPercent > 40 && guardChoice < 0.6) {
          // 複合ガード（ランダム）
          const compoundChoice = Math.random();
          const sideKey = leftKey || rightKey;
          if (compoundChoice < 0.5 && upKey && sideKey) {
            // 上段+中段
            this.simulateKeyPress(upKey);
            this.simulateKeyPress(sideKey);
          } else if (downKey && sideKey) {
            // 中段+下段
            this.simulateKeyPress(downKey);
            this.simulateKeyPress(sideKey);
          }
        } else {
          // 単一ガード
          const rand = Math.random();
          if (rand > 0.66 && upKey) {
            this.simulateKeyPress(upKey);
          } else if (rand > 0.33 && downKey) {
            this.simulateKeyPress(downKey);
          }
        }
      }
    }
  }

  private selectCompoundGuard(
    level: 'high' | 'mid' | 'low',
    upKey?: Phaser.Input.Keyboard.Key,
    downKey?: Phaser.Input.Keyboard.Key,
    leftKey?: Phaser.Input.Keyboard.Key,
    rightKey?: Phaser.Input.Keyboard.Key
  ): void {
    const sideKey = leftKey || rightKey;
    if (level === 'high' && upKey && sideKey) {
      // 上段+中段
      this.simulateKeyPress(upKey);
      this.simulateKeyPress(sideKey);
    } else if (level === 'low' && downKey && sideKey) {
      // 中段+下段
      this.simulateKeyPress(downKey);
      this.simulateKeyPress(sideKey);
    } else if (level === 'mid') {
      // 中段の場合はランダム
      if (Math.random() > 0.5 && upKey && sideKey) {
        this.simulateKeyPress(upKey);
        this.simulateKeyPress(sideKey);
      } else if (downKey && sideKey) {
        this.simulateKeyPress(downKey);
        this.simulateKeyPress(sideKey);
      }
    }
  }

  private performAttack(_keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    if (!onGround) return;

    // 体力と戦略に応じて攻撃を選択
    const healthPercent = this.fighter.health / this.fighter.maxHealth;
    const opponentHealthPercent = this.opponent.health / this.opponent.maxHealth;
    const distance = Math.abs(this.fighter.x - this.opponent.x);

    // 必殺技が使える場合、戦略的に使用
    if (this.fighter.specialMeter >= 100 && this.fighter.isCooldownReady('special')) {
      let useSpecialChance = 0.5; // 基本50%

      // 相手の体力が少ない場合、決定打として使いやすい
      if (opponentHealthPercent < 0.3) {
        useSpecialChance = 0.8; // 80%
      } else if (opponentHealthPercent < 0.5) {
        useSpecialChance = 0.65; // 65%
      }

      // 自分の体力が少ない場合、逆転を狙って使う
      if (healthPercent < 0.3) {
        useSpecialChance = Math.max(useSpecialChance, 0.7); // 最低70%
      }

      // 距離が必殺技の範囲内なら使いやすい
      if (distance < 140) {
        useSpecialChance += 0.1;
      }

      if (Math.random() < useSpecialChance) {
        console.log(`AI必殺技発動！ 確率: ${useSpecialChance * 100}%`);
        this.fighter.performAttack('special');
        return;
      }
    }

    let attackChoice: AttackType;

    // 攻撃レベル（上段・中段・下段）をランダムに選択
    const levels: Array<'High' | 'Mid' | 'Low'> = ['High', 'Mid', 'Low'];
    const level = levels[Math.floor(Math.random() * levels.length)];

    // 距離が近い場合
    if (distance < 90) {
      if (this.currentStrategy === 'aggressive') {
        // 攻撃的: 強攻撃を多用（クールタイムチェック）
        if (this.fighter.isCooldownReady('heavy')) {
          attackChoice = `heavy${level}` as AttackType;
        } else if (this.fighter.isCooldownReady('medium')) {
          attackChoice = `medium${level}` as AttackType;
        } else if (this.fighter.isCooldownReady('light')) {
          attackChoice = `light${level}` as AttackType;
        } else {
          return; // 全てクールタイム中
        }
      } else if (this.currentStrategy === 'defensive') {
        // 防御的: 弱攻撃で素早く
        if (this.fighter.isCooldownReady('light')) {
          attackChoice = `light${level}` as AttackType;
        } else if (this.fighter.isCooldownReady('medium')) {
          attackChoice = `medium${level}` as AttackType;
        } else {
          return; // 使える攻撃がない
        }
      } else {
        // バランス: 中攻撃中心
        const rand = Math.random();
        if (rand > 0.7 && this.fighter.isCooldownReady('heavy')) {
          attackChoice = `heavy${level}` as AttackType;
        } else if (rand > 0.3 && this.fighter.isCooldownReady('medium')) {
          attackChoice = `medium${level}` as AttackType;
        } else if (this.fighter.isCooldownReady('light')) {
          attackChoice = `light${level}` as AttackType;
        } else {
          return; // 全てクールタイム中
        }
      }
    } else {
      // 距離が遠い場合: リーチの長い攻撃（中段・下段が有効）
      const farLevel = Math.random() > 0.5 ? 'Mid' : 'Low';
      if (this.currentStrategy === 'aggressive' && this.fighter.isCooldownReady('heavy')) {
        attackChoice = `heavy${farLevel}` as AttackType;
      } else if (this.fighter.isCooldownReady('medium')) {
        attackChoice = `medium${farLevel}` as AttackType;
      } else if (this.fighter.isCooldownReady('light')) {
        attackChoice = `light${farLevel}` as AttackType;
      } else {
        return; // 全てクールタイム中
      }
    }

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
      Object.defineProperty(key, 'isDown', { value: true, writable: true });
    }
  }

  private simulateKeyDown(key: Phaser.Input.Keyboard.Key): void {
    Object.defineProperty(key, 'isDown', { value: true, writable: true });
    Object.defineProperty(key, 'timeDown', { value: Date.now(), writable: true });
  }

  private simulateKeyUp(key: Phaser.Input.Keyboard.Key): void {
    Object.defineProperty(key, 'isDown', { value: false, writable: true });
    Object.defineProperty(key, 'timeUp', { value: Date.now(), writable: true });
  }

  setDifficulty(difficulty: 'easy' | 'medium' | 'hard'): void {
    this.difficulty = difficulty;
    switch (difficulty) {
      case 'easy':
        this.actionDelay = 800;
        break;
      case 'medium':
        this.actionDelay = 400;
        break;
      case 'hard':
        this.actionDelay = 200;
        break;
    }
  }
}
