import * as Phaser from 'phaser';

export const GAME_CONFIG = {
  width: 800,
  height: 600,
  backgroundColor: '#000000',
  parent: 'fighting-game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1000 },
      debug: false,
    },
  },
};

export const PLAYER_CONFIG = {
  speed: 200,
  jumpVelocity: -500,
  maxHealth: 100,
  attackDamage: 10,
  specialAttackDamage: 25,
};

// 攻撃の段階
export type AttackLevel = 'high' | 'mid' | 'low';

// 攻撃の種類とパラメータ（フレームベース）
// 1フレーム = 16.67ms (60fps想定)
export const ATTACK_TYPES = {
  lightPunch: {
    damage: 5,
    knockback: 50,
    range: 70,
    name: '弱パンチ',
    level: 'high' as AttackLevel,  // 上段攻撃
    startupFrames: 3,
    activeFrames: 4,
    recoveryFrames: 12,
    hitboxWidth: 50,
    hitboxHeight: 40,
  },
  mediumPunch: {
    damage: 10,
    knockback: 100,
    range: 80,
    name: '中パンチ',
    level: 'mid' as AttackLevel,   // 中段攻撃
    startupFrames: 5,
    activeFrames: 5,
    recoveryFrames: 18,
    hitboxWidth: 60,
    hitboxHeight: 40,
  },
  heavyPunch: {
    damage: 18,
    knockback: 200,
    range: 90,
    name: '強パンチ',
    level: 'mid' as AttackLevel,   // 中段攻撃
    startupFrames: 10,
    activeFrames: 6,
    recoveryFrames: 30,
    hitboxWidth: 70,
    hitboxHeight: 50,
  },
  lightKick: {
    damage: 7,
    knockback: 80,
    range: 90,
    name: '弱キック',
    level: 'low' as AttackLevel,   // 下段攻撃
    startupFrames: 4,
    activeFrames: 5,
    recoveryFrames: 15,
    hitboxWidth: 60,
    hitboxHeight: 35,
  },
  mediumKick: {
    damage: 12,
    knockback: 120,
    range: 100,
    name: '中キック',
    level: 'mid' as AttackLevel,   // 中段攻撃
    startupFrames: 6,
    activeFrames: 6,
    recoveryFrames: 20,
    hitboxWidth: 70,
    hitboxHeight: 40,
  },
  heavyKick: {
    damage: 20,
    knockback: 250,
    range: 110,
    name: '強キック',
    level: 'low' as AttackLevel,   // 下段攻撃
    startupFrames: 12,
    activeFrames: 7,
    recoveryFrames: 35,
    hitboxWidth: 80,
    hitboxHeight: 45,
  },
  special: {
    damage: 30,
    knockback: 300,
    range: 120,
    name: '必殺技',
    level: 'mid' as AttackLevel,   // 中段攻撃（ガード不可）
    startupFrames: 15,
    activeFrames: 8,
    recoveryFrames: 40,
    hitboxWidth: 90,
    hitboxHeight: 60,
  },
} as const;

export const CONTROLS = {
  player1: {
    left: 'A',
    right: 'D',
    up: 'W',
    down: 'S',
    punch: 'F',
    kick: 'G',
    special: 'H',
    block: 'R',
  },
  player2: {
    left: 'LEFT',
    right: 'RIGHT',
    up: 'UP',
    down: 'DOWN',
    punch: 'NUMPAD_ONE',
    kick: 'NUMPAD_TWO',
    special: 'NUMPAD_THREE',
    block: 'NUMPAD_ZERO',
  },
};

export const GAME_STATES = {
  READY: 'ready',
  FIGHTING: 'fighting',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over',
} as const;

export const ANIMATIONS = {
  idle: { frameRate: 8, repeat: -1 },
  walk: { frameRate: 10, repeat: -1 },
  jump: { frameRate: 8, repeat: 0 },
  punch: { frameRate: 12, repeat: 0 },
  kick: { frameRate: 12, repeat: 0 },
  special: { frameRate: 15, repeat: 0 },
  block: { frameRate: 8, repeat: -1 },
  hit: { frameRate: 10, repeat: 0 },
  victory: { frameRate: 8, repeat: 0 },
  defeat: { frameRate: 8, repeat: 0 },
};
