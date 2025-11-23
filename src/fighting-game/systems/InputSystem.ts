import * as Phaser from 'phaser';
import { FighterControls } from '../entities/Fighter';

export class InputSystem {
  private scene: Phaser.Scene;
  private keys: Map<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.keys = new Map();
  }

  registerControls(controls: FighterControls[]): void {
    controls.forEach((control) => {
      Object.values(control).forEach((key) => {
        if (!this.keys.has(key)) {
          const keyObj = this.scene.input.keyboard?.addKey(key);
          if (keyObj) {
            this.keys.set(key, keyObj);
          }
        }
      });
    });
  }

  getKeys(): Map<string, Phaser.Input.Keyboard.Key> {
    return this.keys;
  }

  isKeyDown(keyName: string): boolean {
    return this.keys.get(keyName)?.isDown || false;
  }

  isKeyJustDown(keyName: string): boolean {
    const key = this.keys.get(keyName);
    return key ? Phaser.Input.Keyboard.JustDown(key) : false;
  }

  reset(): void {
    this.keys.forEach((key) => {
      key.reset();
    });
  }
}
