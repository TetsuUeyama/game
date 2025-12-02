export const GAME_CONFIG = {
  width: 800,
  height: 600,
  backgroundColor: '#000000',
  parent: 'fighting-game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1000 },
      debug: true,  // デバッグモードを有効化
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
  dashStaminaCost: 10,  // ダッシュのスタミナ消費
  jumpStaminaCost: 5,   // ジャンプのスタミナ消費
  dodgeStaminaCost: 15, // 回避アクション（前転・ジャンプ避け）のスタミナ消費
};

// 移動システムの設定
export const MOVEMENT_CONFIG = {
  // 通常移動
  walkSpeed: 200,

  // フットワーク（小刻みな移動）
  footworkSpeed: 120,            // フットワーク速度（walkSpeedの60%）
  footworkEnabled: true,         // フットワークを有効化

  // ダッシュ
  dashSpeed: 400,           // ダッシュ速度
  dashDuration: 300,        // ダッシュ持続時間（ミリ秒）
  dashCooldown: 1000,       // ダッシュクールタイム（ミリ秒）

  // ジャンプ
  normalJumpVelocity: -500,      // 通常ジャンプの初速度
  dashJumpVelocityY: -550,       // ダッシュジャンプの縦初速度（より高く）
  dashJumpVelocityX: 300,        // ダッシュジャンプの横初速度（慣性）
  airControlFactor: 0.3,         // 空中制御力（0-1, 1で完全制御）

  // 移動の慣性
  groundFriction: 0.15,          // 地上摩擦（減速率）
  airResistance: 0.01,           // 空気抵抗（空中減速率）- 慣性がより長く続く
};

// クールタイム設定（ミリ秒）
export const COOLDOWNS = {
  // 攻撃タイプ別のクールタイム
  light: 500,    // 弱攻撃: 0.5秒
  medium: 1000,  // 中攻撃: 1秒
  heavy: 2000,   // 強攻撃: 2秒
  special: 3000, // 必殺技: 3秒
  dodge: 2000,   // 回避アクション: 2秒
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
export type AttackStrength = 'light' | 'medium' | 'heavy' | 'special' | 'dodge';

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
  specialHighMid: 'special',
  specialMidLow: 'special',
  superSpecial: 'special',
  roll: 'dodge',
  jumpDodge: 'dodge',
  airAttackDown: 'medium',
  antiAir: 'medium',
};

// 攻撃の段階（複数レーン対応）
export type AttackLevel = 'high' | 'mid' | 'low' | 'highMid' | 'midLow' | 'all';

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

  // 必殺技（クールダウン使用・2レーン攻撃）- 上段+中段
  specialHighMid: {
    damage: 25,           // 強力なダメージ
    knockback: 100,       // 強いノックバック
    range: 120,           // 長いリーチ
    name: '必殺技(上中)',
    level: 'highMid' as AttackLevel,   // 上段+中段攻撃
    startupFrames: 12,    // 発生は遅め
    activeFrames: 8,      // 持続は長め
    recoveryFrames: 35,   // 外したら隙
    hitboxWidth: 90,      // 広い攻撃範囲
    hitboxHeight: 72,     // 2レーン分の高さ (36*2)
  },
  // 必殺技（クールダウン使用・2レーン攻撃）- 中段+下段
  specialMidLow: {
    damage: 25,           // 強力なダメージ
    knockback: 100,       // 強いノックバック
    range: 120,           // 長いリーチ
    name: '必殺技(中下)',
    level: 'midLow' as AttackLevel,   // 中段+下段攻撃
    startupFrames: 12,    // 発生は遅め
    activeFrames: 8,      // 持続は長め
    recoveryFrames: 35,   // 外したら隙
    hitboxWidth: 90,      // 広い攻撃範囲
    hitboxHeight: 72,     // 2レーン分の高さ (36*2)
  },
  // 超必殺技（ゲージ使用・全レーン攻撃）
  superSpecial: {
    damage: 40,           // 非常に強力なダメージ
    knockback: 150,       // 超強力なノックバック
    range: 150,           // 非常に長いリーチ
    name: '超必殺技',
    level: 'all' as AttackLevel,      // 全レーン攻撃
    startupFrames: 18,    // 発生は非常に遅い（見切りやすい）
    activeFrames: 12,     // 持続は非常に長い
    recoveryFrames: 50,   // 外したら非常に大きな隙
    hitboxWidth: 110,     // 非常に広い攻撃範囲
    hitboxHeight: 108,    // 3レーン全体の高さ (36*3)
  },

  // 前転（上段攻撃回避・相手の背後に回り込む）
  roll: {
    damage: 0,            // ダメージなし（回避アクション）
    knockback: 0,
    range: 0,
    name: '前転',
    level: 'low' as AttackLevel,  // 姿勢が低く、上段攻撃を避ける
    startupFrames: 5,     // 発生
    activeFrames: 10,     // 移動中（当たり判定縮小）
    recoveryFrames: 8,    // 硬直
    hitboxWidth: 40,      // 通常より小さい当たり判定
    hitboxHeight: 30,     // 姿勢が低い
    dodgeType: 'high' as AttackLevel,  // 上段攻撃を回避
    moveDistance: 150,    // 前方への移動距離
  },

  // ジャンプ避け（下段攻撃回避・相手の背後に回り込む）
  jumpDodge: {
    damage: 0,            // ダメージなし（回避アクション）
    knockback: 0,
    range: 0,
    name: 'ジャンプ避け',
    level: 'high' as AttackLevel,  // 空中姿勢、下段攻撃を避ける
    startupFrames: 4,     // 発生
    activeFrames: 12,     // 移動中（当たり判定縮小）
    recoveryFrames: 6,    // 硬直
    hitboxWidth: 35,      // 通常より小さい当たり判定
    hitboxHeight: 40,     // ジャンプ中
    dodgeType: 'low' as AttackLevel,  // 下段攻撃を回避
    moveDistance: 140,    // 前方への移動距離
  },

  // 空中攻撃（ジャンプ中に斜め下を攻撃）
  airAttackDown: {
    damage: 12,
    knockback: 80,
    range: 70,
    name: '空中攻撃(下)',
    level: 'midLow' as AttackLevel,  // 中段+下段を攻撃
    startupFrames: 6,
    activeFrames: 8,
    recoveryFrames: 15,
    hitboxWidth: 60,  // 攻撃の伸びる距離（横）
    hitboxHeight: 40,  // 攻撃の太さ（縦）
  },

  // 対空攻撃（地上から真上を攻撃）
  antiAir: {
    damage: 15,
    knockback: 100,
    range: 70,
    name: '対空攻撃',
    level: 'high' as AttackLevel,  // 上段を攻撃
    startupFrames: 8,
    activeFrames: 6,
    recoveryFrames: 20,
    hitboxWidth: 60,  // 攻撃の伸びる距離（横）
    hitboxHeight: 40,  // 攻撃の太さ（縦）
  },
} as const;

// 飛び道具の設定
export const PROJECTILE_TYPES = {
  // 基本飛び道具（ゲージ消費のみ）
  projectileBase: {
    damage: 8,        // 近距離攻撃より弱い
    speed: 300,       // 中程度の速度
    size: 20,         // サイズ
    color: 0x00ffff,  // シアン
    name: '飛び道具',
  },
  // 弱攻撃クールタイム使用（弾速特化）
  projectileLight: {
    damage: 6,        // 威力は低い
    speed: 600,       // 非常に速い
    size: 16,
    color: 0xffff00,  // 黄色
    name: '疾風弾',
  },
  // 中攻撃クールタイム使用（バランス）
  projectileMedium: {
    damage: 12,       // やや強化
    speed: 400,       // やや速い
    size: 24,
    color: 0xff9900,  // オレンジ
    name: '強化弾',
  },
  // 強攻撃クールタイム使用（威力特化）
  projectileHeavy: {
    damage: 18,       // 高威力
    speed: 250,       // やや遅い
    size: 32,
    color: 0xff0000,  // 赤
    name: '破壊弾',
  },
  // 必殺技クールタイム使用（最強）
  projectileSpecial: {
    damage: 20,       // 非常に高威力
    speed: 450,       // 速い
    size: 36,
    color: 0xff00ff,  // マゼンタ
    name: '究極弾',
  },
  // 超必殺技ゲージ使用（最高性能）
  projectileSuper: {
    damage: 30,       // 最高威力
    speed: 500,       // 非常に速い
    size: 40,
    color: 0xffd700,  // 金色
    name: '超究極弾',
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
