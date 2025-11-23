import * as Phaser from 'phaser';
import { Fighter } from '../entities/Fighter';

export class UISystem {
  private scene: Phaser.Scene;
  private player1HealthBar: Phaser.GameObjects.Graphics;
  private player2HealthBar: Phaser.GameObjects.Graphics;
  private player1SpecialBar: Phaser.GameObjects.Graphics;
  private player2SpecialBar: Phaser.GameObjects.Graphics;
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
    this.timerText.destroy();
    this.roundText.destroy();
    this.player1WinsText.destroy();
    this.player2WinsText.destroy();
  }
}
