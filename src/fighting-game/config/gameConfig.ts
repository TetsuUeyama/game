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
  maxGuardStamina: 50,  // ガード用スタミナ
  guardStaminaRegenRate: 20, // 1秒あたりの回復量
};

// クールタイム設定（ミリ秒）
export const COOLDOWNS = {
  // 攻撃タイプ別のクールタイム
  light: 500,    // 弱攻撃: 0.5秒
  medium: 1000,  // 中攻撃: 1秒
  heavy: 2000,   // 強攻撃: 2秒
  special: 3000, // 必殺技: 3秒
};

// ガードスタミナ消費設定
export const GUARD_STAMINA_COSTS = {
  high: 15,       // 上段のみガード: 1秒あたり15消費
  mid: 15,        // 中段のみガード: 1秒あたり15消費
  low: 15,        // 下段のみガード: 1秒あたり15消費
  highMid: 30,    // 上段+中段ガード: 1秒あたり30消費（2倍）
  midLow: 30,     // 中段+下段ガード: 1秒あたり30消費（2倍）
  all: 60,        // 全面ガード: 1秒あたり60消費（4倍）
};

// 攻撃の強さカテゴリ
export type AttackStrength = 'light' | 'medium' | 'heavy' | 'special';

// 各攻撃がどの強さカテゴリに属するか
export const ATTACK_STRENGTH_MAP: Record<keyof typeof ATTACK_TYPES, AttackStrength> = {
  lightHigh: 'light',
  lightMid: 'light',
  lightLow: 'light',
  mediumHigh: 'medium',
  mediumMid: 'medium',
  mediumLow: 'medium',
  heavyHigh: 'heavy',
  heavyMid: 'heavy',
  heavyLow: 'heavy',
  special: 'special',
};

// 攻撃の段階
export type AttackLevel = 'high' | 'mid' | 'low';

// 攻撃の種類とパラメータ（フレームベース）
// 1フレーム = 16.67ms (60fps想定)
export const ATTACK_TYPES = {
  // 弱攻撃（上段・中段・下段）
  lightHigh: {
    damage: 5,
    knockback: 50,
    range: 70,
    name: '弱攻撃(上段)',
    level: 'high' as AttackLevel,
    startupFrames: 3,
    activeFrames: 4,
    recoveryFrames: 12,
    hitboxWidth: 50,
    hitboxHeight: 40,
  },
  lightMid: {
    damage: 5,
    knockback: 50,
    range: 70,
    name: '弱攻撃(中段)',
    level: 'mid' as AttackLevel,
    startupFrames: 3,
    activeFrames: 4,
    recoveryFrames: 12,
    hitboxWidth: 50,
    hitboxHeight: 40,
  },
  lightLow: {
    damage: 5,
    knockback: 50,
    range: 70,
    name: '弱攻撃(下段)',
    level: 'low' as AttackLevel,
    startupFrames: 3,
    activeFrames: 4,
    recoveryFrames: 12,
    hitboxWidth: 50,
    hitboxHeight: 40,
  },

  // 中攻撃（上段・中段・下段）
  mediumHigh: {
    damage: 10,
    knockback: 32,  // キャラクター横幅の半分（64÷2）
    range: 80,
    name: '中攻撃(上段)',
    level: 'high' as AttackLevel,
    startupFrames: 5,
    activeFrames: 5,
    recoveryFrames: 18,
    hitboxWidth: 60,
    hitboxHeight: 40,
  },
  mediumMid: {
    damage: 10,
    knockback: 32,  // キャラクター横幅の半分（64÷2）
    range: 80,
    name: '中攻撃(中段)',
    level: 'mid' as AttackLevel,
    startupFrames: 5,
    activeFrames: 5,
    recoveryFrames: 18,
    hitboxWidth: 60,
    hitboxHeight: 40,
  },
  mediumLow: {
    damage: 10,
    knockback: 32,  // キャラクター横幅の半分（64÷2）
    range: 80,
    name: '中攻撃(下段)',
    level: 'low' as AttackLevel,
    startupFrames: 5,
    activeFrames: 5,
    recoveryFrames: 18,
    hitboxWidth: 60,
    hitboxHeight: 40,
  },

  // 強攻撃（上段・中段・下段）
  heavyHigh: {
    damage: 18,
    knockback: 64,  // キャラクター横幅と同じ（32×2スケール）
    range: 90,
    name: '強攻撃(上段)',
    level: 'high' as AttackLevel,
    startupFrames: 10,
    activeFrames: 6,
    recoveryFrames: 30,
    hitboxWidth: 70,
    hitboxHeight: 50,
  },
  heavyMid: {
    damage: 18,
    knockback: 64,  // キャラクター横幅と同じ（32×2スケール）
    range: 90,
    name: '強攻撃(中段)',
    level: 'mid' as AttackLevel,
    startupFrames: 10,
    activeFrames: 6,
    recoveryFrames: 30,
    hitboxWidth: 70,
    hitboxHeight: 50,
  },
  heavyLow: {
    damage: 18,
    knockback: 64,  // キャラクター横幅と同じ（32×2スケール）
    range: 90,
    name: '強攻撃(下段)',
    level: 'low' as AttackLevel,
    startupFrames: 10,
    activeFrames: 6,
    recoveryFrames: 30,
    hitboxWidth: 70,
    hitboxHeight: 50,
  },

  // 必殺技
  special: {
    damage: 35,           // 強力なダメージ（強攻撃の約2倍）
    knockback: 128,       // キャラクター横幅の2倍
    range: 140,           // 非常に長いリーチ
    name: '必殺技',
    level: 'mid' as AttackLevel,   // 中段攻撃
    startupFrames: 15,    // 発生は遅め（見切りやすい）
    activeFrames: 10,     // 持続は長め
    recoveryFrames: 45,   // 外したら大きな隙
    hitboxWidth: 100,     // 広い攻撃範囲
    hitboxHeight: 70,     // 高さも広い
  },
} as const;

export const CONTROLS = {
  player1: {
    left: 'A',
    right: 'D',
    up: 'W',
    down: 'S',
    punch: 'F',      // 弱攻撃
    kick: 'G',       // 中攻撃
    heavy: 'T',      // 強攻撃
    special: 'H',
    block: 'R',
  },
  player2: {
    left: 'LEFT',
    right: 'RIGHT',
    up: 'UP',
    down: 'DOWN',
    punch: 'NUMPAD_ONE',    // 弱攻撃
    kick: 'NUMPAD_TWO',     // 中攻撃
    heavy: 'NUMPAD_FOUR',   // 強攻撃
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
