import * as Phaser from 'phaser';
import { Fighter } from '../entities/Fighter';

export class UISystem {
  private scene: Phaser.Scene;
  private player1HealthBar: Phaser.GameObjects.Graphics;
  private player2HealthBar: Phaser.GameObjects.Graphics;
  private player1SpecialBar: Phaser.GameObjects.Graphics;
  private player2SpecialBar: Phaser.GameObjects.Graphics;
  private player1GuardStaminaBar: Phaser.GameObjects.Graphics;
  private player2GuardStaminaBar: Phaser.GameObjects.Graphics;
  private player1CooldownBars: Phaser.GameObjects.Graphics;
  private player2CooldownBars: Phaser.GameObjects.Graphics;
  private timerText: Phaser.GameObjects.Text;
  private roundText: Phaser.GameObjects.Text;
  private player1WinsText: Phaser.GameObjects.Text;
  private player2WinsText: Phaser.GameObjects.Text;
  private gameTime: number;
  private timerEvent: Phaser.Time.TimerEvent | null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gameTime = 99;
    this.timerEvent = null;

    this.player1HealthBar = scene.add.graphics();
    this.player2HealthBar = scene.add.graphics();
    this.player1SpecialBar = scene.add.graphics();
    this.player2SpecialBar = scene.add.graphics();
    this.player1GuardStaminaBar = scene.add.graphics();
    this.player2GuardStaminaBar = scene.add.graphics();
    this.player1CooldownBars = scene.add.graphics();
    this.player2CooldownBars = scene.add.graphics();

    this.timerText = scene.add.text(
      scene.cameras.main.width / 2,
      20,
      '99',
      {
        fontSize: '48px',
        color: '#ffffff',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5);

    this.roundText = scene.add.text(
      scene.cameras.main.width / 2,
      80,
      'ROUND 1',
      {
        fontSize: '32px',
        color: '#ffff00',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5);

    this.player1WinsText = scene.add.text(
      50,
      20,
      'P1: 0 wins',
      {
        fontSize: '20px',
        color: '#00ff00',
      }
    );

    this.player2WinsText = scene.add.text(
      scene.cameras.main.width - 150,
      20,
      'P2: 0 wins',
      {
        fontSize: '20px',
        color: '#ff0000',
      }
    );

    this.player1HealthBar.setDepth(100);
    this.player2HealthBar.setDepth(100);
    this.player1SpecialBar.setDepth(100);
    this.player2SpecialBar.setDepth(100);
    this.player1GuardStaminaBar.setDepth(100);
    this.player2GuardStaminaBar.setDepth(100);
    this.player1CooldownBars.setDepth(100);
    this.player2CooldownBars.setDepth(100);
    this.timerText.setDepth(100);
    this.roundText.setDepth(100);
    this.player1WinsText.setDepth(100);
    this.player2WinsText.setDepth(100);
  }

  startTimer(onTimeUp: () => void): void {
    this.gameTime = 99;
    this.timerEvent = this.scene.time.addEvent({
      delay: 1000,
      callback: () => {
        this.gameTime--;
        this.timerText.setText(this.gameTime.toString());

        if (this.gameTime <= 10) {
          this.timerText.setColor('#ff0000');
        }

        if (this.gameTime <= 0) {
          this.stopTimer();
          onTimeUp();
        }
      },
      loop: true,
    });
  }

  stopTimer(): void {
    if (this.timerEvent) {
      this.timerEvent.remove();
      this.timerEvent = null;
    }
  }

  resetTimer(): void {
    this.gameTime = 99;
    this.timerText.setText('99');
    this.timerText.setColor('#ffffff');
  }

  updateHealthBars(player1: Fighter, player2: Fighter): void {
    const barWidth = 300;
    const barHeight = 30;
    const barY = 60;
    const padding = 50;

    this.player1HealthBar.clear();
    this.player2HealthBar.clear();

    const player1HealthPercent = player1.health / player1.maxHealth;
    const player2HealthPercent = player2.health / player2.maxHealth;

    this.player1HealthBar.fillStyle(0x222222);
    this.player1HealthBar.fillRect(padding, barY, barWidth, barHeight);
    this.player1HealthBar.fillStyle(0x00ff00);
    this.player1HealthBar.fillRect(
      padding,
      barY,
      barWidth * player1HealthPercent,
      barHeight
    );
    this.player1HealthBar.lineStyle(2, 0xffffff);
    this.player1HealthBar.strokeRect(padding, barY, barWidth, barHeight);

    const player2BarX = this.scene.cameras.main.width - barWidth - padding;
    this.player2HealthBar.fillStyle(0x222222);
    this.player2HealthBar.fillRect(player2BarX, barY, barWidth, barHeight);
    this.player2HealthBar.fillStyle(0xff0000);
    this.player2HealthBar.fillRect(
      player2BarX + barWidth * (1 - player2HealthPercent),
      barY,
      barWidth * player2HealthPercent,
      barHeight
    );
    this.player2HealthBar.lineStyle(2, 0xffffff);
    this.player2HealthBar.strokeRect(player2BarX, barY, barWidth, barHeight);
  }

  updateSpecialBars(player1: Fighter, player2: Fighter): void {
    const barWidth = 300;
    const barHeight = 10;
    const barY = 95;
    const padding = 50;

    this.player1SpecialBar.clear();
    this.player2SpecialBar.clear();

    const player1SpecialPercent = player1.specialMeter / 100;
    const player2SpecialPercent = player2.specialMeter / 100;

    this.player1SpecialBar.fillStyle(0x222222);
    this.player1SpecialBar.fillRect(padding, barY, barWidth, barHeight);
    this.player1SpecialBar.fillStyle(0xffff00);
    this.player1SpecialBar.fillRect(
      padding,
      barY,
      barWidth * player1SpecialPercent,
      barHeight
    );

    const player2BarX = this.scene.cameras.main.width - barWidth - padding;
    this.player2SpecialBar.fillStyle(0x222222);
    this.player2SpecialBar.fillRect(player2BarX, barY, barWidth, barHeight);
    this.player2SpecialBar.fillStyle(0xffff00);
    this.player2SpecialBar.fillRect(
      player2BarX + barWidth * (1 - player2SpecialPercent),
      barY,
      barWidth * player2SpecialPercent,
      barHeight
    );
  }

  updateGuardStaminaBars(player1: Fighter, player2: Fighter): void {
    const barWidth = 300;
    const barHeight = 8;
    const barY = 108; // 必殺技バーの下
    const padding = 50;

    this.player1GuardStaminaBar.clear();
    this.player2GuardStaminaBar.clear();

    const player1GuardPercent = player1.guardStamina / player1.maxGuardStamina;
    const player2GuardPercent = player2.guardStamina / player2.maxGuardStamina;

    // Player1のガードスタミナバー
    this.player1GuardStaminaBar.fillStyle(0x222222);
    this.player1GuardStaminaBar.fillRect(padding, barY, barWidth, barHeight);

    let p1Color = 0x00ffff; // シアン
    if (player1GuardPercent < 0.3) {
      p1Color = 0xff0000; // 低スタミナ: 赤
    } else if (player1GuardPercent < 0.6) {
      p1Color = 0xffaa00; // 中スタミナ: オレンジ
    }

    this.player1GuardStaminaBar.fillStyle(p1Color);
    this.player1GuardStaminaBar.fillRect(
      padding,
      barY,
      barWidth * player1GuardPercent,
      barHeight
    );

    // Player2のガードスタミナバー
    const player2BarX = this.scene.cameras.main.width - barWidth - padding;
    this.player2GuardStaminaBar.fillStyle(0x222222);
    this.player2GuardStaminaBar.fillRect(player2BarX, barY, barWidth, barHeight);

    let p2Color = 0x00ffff; // シアン
    if (player2GuardPercent < 0.3) {
      p2Color = 0xff0000; // 低スタミナ: 赤
    } else if (player2GuardPercent < 0.6) {
      p2Color = 0xffaa00; // 中スタミナ: オレンジ
    }

    this.player2GuardStaminaBar.fillStyle(p2Color);
    this.player2GuardStaminaBar.fillRect(
      player2BarX + barWidth * (1 - player2GuardPercent),
      barY,
      barWidth * player2GuardPercent,
      barHeight
    );
  }

  updateCooldownBars(player1: Fighter, player2: Fighter): void {
    const barWidth = 60;  // 横長にする
    const barHeight = 12;
    const spacing = 3;
    const totalHeight = (barHeight + spacing) * 4 - spacing; // 4つのバーの総高さ
    const barY = this.scene.cameras.main.height - totalHeight - 10; // 画面下部から少し上
    const padding = 50;

    this.player1CooldownBars.clear();
    this.player2CooldownBars.clear();

    // Player1のクールタイムバー（左下） - 攻撃4つのみ
    const cooldownTypes: Array<{ key: 'light' | 'medium' | 'heavy' | 'special'; label: string; color: number }> = [
      { key: 'light', label: 'L', color: 0x00ff00 },    // 緑
      { key: 'medium', label: 'M', color: 0xffff00 },   // 黄色
      { key: 'heavy', label: 'H', color: 0xff8800 },    // オレンジ
      { key: 'special', label: 'S', color: 0xff00ff },  // マゼンタ
    ];

    cooldownTypes.forEach((type, index) => {
      const y = barY + (barHeight + spacing) * index;
      const cooldownPercent = 1 - player1.getCooldownPercent(type.key); // 使用可能度（0=使用不可、1=使用可能）
      const isReady = player1.isCooldownReady(type.key);

      // 背景
      this.player1CooldownBars.fillStyle(0x222222);
      this.player1CooldownBars.fillRect(padding, y, barWidth, barHeight);

      // クールタイムバー（左から右に回復）
      const barColor = isReady ? type.color : 0x666666;
      this.player1CooldownBars.fillStyle(barColor);
      const filledWidth = barWidth * cooldownPercent;
      this.player1CooldownBars.fillRect(
        padding,  // 左端から描画開始
        y,
        filledWidth,
        barHeight
      );

      // 枠線
      this.player1CooldownBars.lineStyle(2, isReady ? 0xffffff : 0x444444);
      this.player1CooldownBars.strokeRect(padding, y, barWidth, barHeight);
    });

    // Player2のクールタイムバー（右下）
    const player2StartX = this.scene.cameras.main.width - padding - barWidth;

    cooldownTypes.forEach((type, index) => {
      const y = barY + (barHeight + spacing) * index;
      const cooldownPercent = 1 - player2.getCooldownPercent(type.key);
      const isReady = player2.isCooldownReady(type.key);

      // 背景
      this.player2CooldownBars.fillStyle(0x222222);
      this.player2CooldownBars.fillRect(player2StartX, y, barWidth, barHeight);

      // クールタイムバー（右から左に回復）
      const barColor = isReady ? type.color : 0x666666;
      this.player2CooldownBars.fillStyle(barColor);
      const filledWidth = barWidth * cooldownPercent;
      this.player2CooldownBars.fillRect(
        player2StartX + barWidth - filledWidth,  // 右端から描画開始
        y,
        filledWidth,
        barHeight
      );

      // 枠線
      this.player2CooldownBars.lineStyle(2, isReady ? 0xffffff : 0x444444);
      this.player2CooldownBars.strokeRect(player2StartX, y, barWidth, barHeight);
    });

    // ラベルをテキストで追加（毎フレーム再生成されるため簡素化）
    cooldownTypes.forEach((type, index) => {
      const y = barY + (barHeight + spacing) * index + barHeight / 2;

      const p1Label = this.scene.add.text(padding + 8, y, type.label, {
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(101);

      const p2Label = this.scene.add.text(player2StartX + 8, y, type.label, {
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(101);

      this.scene.time.delayedCall(50, () => {
        p1Label.destroy();
        p2Label.destroy();
      });
    });
  }

  updateRound(roundNumber: number): void {
    this.roundText.setText(`ROUND ${roundNumber}`);
  }

  updateWins(player1Wins: number, player2Wins: number): void {
    this.player1WinsText.setText(`P1: ${player1Wins} wins`);
    this.player2WinsText.setText(`P2: ${player2Wins} wins`);
  }

  showMessage(message: string, duration: number = 2000): void {
    const messageText = this.scene.add.text(
      this.scene.cameras.main.width / 2,
      this.scene.cameras.main.height / 2,
      message,
      {
        fontSize: '64px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      }
    ).setOrigin(0.5).setDepth(1000);

    this.scene.time.delayedCall(duration, () => {
      messageText.destroy();
    });
  }

  destroy(): void {
    this.stopTimer();
    this.player1HealthBar.destroy();
    this.player2HealthBar.destroy();
    this.player1SpecialBar.destroy();
    this.player2SpecialBar.destroy();
    this.player1GuardStaminaBar.destroy();
    this.player2GuardStaminaBar.destroy();
    this.player1CooldownBars.destroy();
    this.player2CooldownBars.destroy();
    this.timerText.destroy();
    this.roundText.destroy();
    this.player1WinsText.destroy();
    this.player2WinsText.destroy();
  }
}
