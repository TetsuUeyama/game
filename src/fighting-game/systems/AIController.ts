import * as Phaser from 'phaser';
import { Fighter } from '../entities/Fighter';

export class AIController {
  private fighter: Fighter;
  private opponent: Fighter;
  private scene: Phaser.Scene;
  private nextActionTime: number;
  private actionDelay: number;
  private difficulty: 'easy' | 'medium' | 'hard';
  private currentStrategy: 'aggressive' | 'defensive' | 'balanced';

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

    // 行動の決定
    if (time > this.nextActionTime) {
      this.decideAction(keys);
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

  private decideAction(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
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
        if (Math.random() > 0.5) {
          this.retreat(keys);
        } else if (onGround) {
          this.block(keys);
        }
      } else {
        this.approach(keys);
      }
    } else {
      // 近距離: 攻撃または防御
      if (this.currentStrategy === 'defensive' && Math.random() > 0.6) {
        if (onGround) {
          this.block(keys);
        } else {
          this.retreat(keys);
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

  private jump(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;
    if (onGround) {
      this.fighter.jump();
    }
  }

  private block(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const blockKey = keys.get(this.fighter.controls.block);
    const upKey = keys.get(this.fighter.controls.up);
    const downKey = keys.get(this.fighter.controls.down);

    if (blockKey) {
      this.simulateKeyPress(blockKey);

      // 相手が攻撃中なら、その攻撃レベルに応じたガードを選択
      if (this.opponent.currentAttack) {
        const opponentAttackData = this.opponent.currentAttack;
        // 攻撃の種類に応じてガードを変更
        if (opponentAttackData.includes('Punch')) {
          // パンチ系は上段または中段
          if (Math.random() > 0.5 && upKey) {
            this.simulateKeyPress(upKey);  // 上段ガード
          }
        } else if (opponentAttackData.includes('Kick')) {
          // キック系は下段または中段
          if (Math.random() > 0.5 && downKey) {
            this.simulateKeyPress(downKey);  // 下段ガード
          }
        }
      } else {
        // 攻撃が来ていない場合はランダムにガードの種類を選択
        const rand = Math.random();
        if (rand > 0.66 && upKey) {
          this.simulateKeyPress(upKey);  // 上段ガード
        } else if (rand > 0.33 && downKey) {
          this.simulateKeyPress(downKey);  // 下段ガード
        }
        // それ以外は中段ガード（デフォルト）
      }
    }
  }

  private performAttack(keys: Map<string, Phaser.Input.Keyboard.Key>): void {
    const onGround = (this.fighter.body as Phaser.Physics.Arcade.Body).touching.down;

    if (!onGround) return;

    // 必殺技が使える場合、30%の確率で使用
    if (this.fighter.specialMeter >= 100 && Math.random() > 0.7) {
      this.fighter.performAttack('special');
      return;
    }

    // 体力と戦略に応じて攻撃を選択
    const healthPercent = this.fighter.health / this.fighter.maxHealth;
    const distance = Math.abs(this.fighter.x - this.opponent.x);

    let attackChoice: any;

    // 距離が近い場合
    if (distance < 90) {
      if (this.currentStrategy === 'aggressive') {
        // 攻撃的: 強攻撃を多用
        attackChoice = Math.random() > 0.5 ? 'heavyPunch' : 'heavyKick';
      } else if (this.currentStrategy === 'defensive') {
        // 防御的: 弱攻撃で素早く
        attackChoice = Math.random() > 0.5 ? 'lightPunch' : 'lightKick';
      } else {
        // バランス: 中攻撃中心
        const rand = Math.random();
        if (rand > 0.7) {
          attackChoice = Math.random() > 0.5 ? 'heavyPunch' : 'heavyKick';
        } else if (rand > 0.3) {
          attackChoice = Math.random() > 0.5 ? 'mediumPunch' : 'mediumKick';
        } else {
          attackChoice = Math.random() > 0.5 ? 'lightPunch' : 'lightKick';
        }
      }
    } else {
      // 距離が遠い場合: リーチの長い攻撃
      if (this.currentStrategy === 'aggressive') {
        attackChoice = Math.random() > 0.6 ? 'heavyKick' : 'mediumKick';
      } else {
        attackChoice = Math.random() > 0.5 ? 'mediumKick' : 'lightKick';
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
