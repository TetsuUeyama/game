/**
 * キャラクター設定ファイル
 * 各キャラクターの性能値とAIカスタマイズを定義
 */

export interface CharacterStats {
  hp: number;           // 体力 (25 ~ 150)
  attack: number;       // 攻撃力 (25 ~ 150)
  attackSpeed: number;  // 攻撃速度 (25 ~ 150)
  defense: number;      // 防御 (25 ~ 150)
  specialAttack: number; // 特攻 (25 ~ 150)
  specialDefense: number; // 特防 (25 ~ 150)
  speed: number;        // 速度 (25 ~ 150)
}

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

export interface CharacterConfig {
  id: number;
  name: string;
  description: string;
  stats: CharacterStats;
  aiCustomization: AICustomization;
}

/**
 * 全キャラクターの設定
 */
export const CHARACTERS: Record<number, CharacterConfig> = {
  1: {
    id: 1,
    name: 'バランス型',
    description: '全てのステータスが平均的なキャラクター',
    stats: {
      hp: 100,
      attack: 100,
      attackSpeed: 100,
      defense: 100,
      specialAttack: 100,
      specialDefense: 100,
      speed: 100,
    },
    aiCustomization: {
      preferredDistance: 200,
      closeRangeAggression: 0.7,
      longRangeAggression: 0.5,
      jumpFrequency: 0.3,
      dashFrequency: 0.5,
      specialMeterThreshold: 80,
      specialMeterReserve: 30,
      staminaThreshold: 30,
      staminaReserve: 10,
    },
  },
  2: {
    id: 2,
    name: 'パワー型',
    description: '攻撃力と体力が高いが速度が遅い',
    stats: {
      hp: 130,
      attack: 130,
      attackSpeed: 80,
      defense: 110,
      specialAttack: 120,
      specialDefense: 90,
      speed: 70,
    },
    aiCustomization: {
      preferredDistance: 150,
      closeRangeAggression: 0.9,
      longRangeAggression: 0.4,
      jumpFrequency: 0.2,
      dashFrequency: 0.4,
      specialMeterThreshold: 70,
      specialMeterReserve: 20,
      staminaThreshold: 40,
      staminaReserve: 15,
    },
  },
  3: {
    id: 3,
    name: 'スピード型',
    description: '速度と攻撃速度が高いが攻撃力が低い',
    stats: {
      hp: 80,
      attack: 80,
      attackSpeed: 140,
      defense: 80,
      specialAttack: 90,
      specialDefense: 80,
      speed: 140,
    },
    aiCustomization: {
      preferredDistance: 180,
      closeRangeAggression: 0.6,
      longRangeAggression: 0.7,
      jumpFrequency: 0.5,
      dashFrequency: 0.7,
      specialMeterThreshold: 85,
      specialMeterReserve: 25,
      staminaThreshold: 20,
      staminaReserve: 5,
    },
  },
  4: {
    id: 4,
    name: 'テクニック型',
    description: '必殺技性能が高い戦略的なキャラクター',
    stats: {
      hp: 90,
      attack: 90,
      attackSpeed: 110,
      defense: 100,
      specialAttack: 140,
      specialDefense: 120,
      speed: 100,
    },
    aiCustomization: {
      preferredDistance: 220,
      closeRangeAggression: 0.5,
      longRangeAggression: 0.8,
      jumpFrequency: 0.4,
      dashFrequency: 0.5,
      specialMeterThreshold: 60,
      specialMeterReserve: 40,
      staminaThreshold: 25,
      staminaReserve: 10,
    },
  },
  5: {
    id: 5,
    name: 'ディフェンス型',
    description: '防御力と体力が高い耐久型',
    stats: {
      hp: 140,
      attack: 80,
      attackSpeed: 90,
      defense: 140,
      specialAttack: 80,
      specialDefense: 130,
      speed: 80,
    },
    aiCustomization: {
      preferredDistance: 160,
      closeRangeAggression: 0.5,
      longRangeAggression: 0.3,
      jumpFrequency: 0.2,
      dashFrequency: 0.3,
      specialMeterThreshold: 90,
      specialMeterReserve: 35,
      staminaThreshold: 35,
      staminaReserve: 20,
    },
  },
  6: {
    id: 6,
    name: 'トリッキー型',
    description: 'ジャンプとダッシュを多用する変則的なキャラクター',
    stats: {
      hp: 85,
      attack: 95,
      attackSpeed: 120,
      defense: 85,
      specialAttack: 110,
      specialDefense: 90,
      speed: 130,
    },
    aiCustomization: {
      preferredDistance: 190,
      closeRangeAggression: 0.7,
      longRangeAggression: 0.6,
      jumpFrequency: 0.7,
      dashFrequency: 0.8,
      specialMeterThreshold: 75,
      specialMeterReserve: 30,
      staminaThreshold: 15,
      staminaReserve: 5,
    },
  },
  7: {
    id: 7,
    name: 'アグレッシブ型',
    description: '攻撃性能に特化した超攻撃型',
    stats: {
      hp: 75,
      attack: 140,
      attackSpeed: 130,
      defense: 70,
      specialAttack: 130,
      specialDefense: 70,
      speed: 110,
    },
    aiCustomization: {
      preferredDistance: 140,
      closeRangeAggression: 0.95,
      longRangeAggression: 0.5,
      jumpFrequency: 0.4,
      dashFrequency: 0.6,
      specialMeterThreshold: 65,
      specialMeterReserve: 15,
      staminaThreshold: 10,
      staminaReserve: 5,
    },
  },
  8: {
    id: 8,
    name: 'カウンター型',
    description: '中距離から反撃を狙う守備的なキャラクター',
    stats: {
      hp: 100,
      attack: 110,
      attackSpeed: 100,
      defense: 120,
      specialAttack: 100,
      specialDefense: 110,
      speed: 90,
    },
    aiCustomization: {
      preferredDistance: 210,
      closeRangeAggression: 0.4,
      longRangeAggression: 0.6,
      jumpFrequency: 0.3,
      dashFrequency: 0.4,
      specialMeterThreshold: 80,
      specialMeterReserve: 35,
      staminaThreshold: 30,
      staminaReserve: 15,
    },
  },
  9: {
    id: 9,
    name: 'ハイブリッド型',
    description: '近距離・遠距離両方に対応できる万能型',
    stats: {
      hp: 95,
      attack: 105,
      attackSpeed: 105,
      defense: 95,
      specialAttack: 115,
      specialDefense: 95,
      speed: 110,
    },
    aiCustomization: {
      preferredDistance: 200,
      closeRangeAggression: 0.7,
      longRangeAggression: 0.7,
      jumpFrequency: 0.4,
      dashFrequency: 0.5,
      specialMeterThreshold: 75,
      specialMeterReserve: 30,
      staminaThreshold: 25,
      staminaReserve: 10,
    },
  },
  10: {
    id: 10,
    name: 'ボス型',
    description: '全てのステータスが高い強力なキャラクター',
    stats: {
      hp: 120,
      attack: 120,
      attackSpeed: 110,
      defense: 120,
      specialAttack: 130,
      specialDefense: 120,
      speed: 110,
    },
    aiCustomization: {
      preferredDistance: 180,
      closeRangeAggression: 0.8,
      longRangeAggression: 0.7,
      jumpFrequency: 0.4,
      dashFrequency: 0.6,
      specialMeterThreshold: 70,
      specialMeterReserve: 25,
      staminaThreshold: 30,
      staminaReserve: 10,
    },
  },
};

/**
 * キャラクターIDから設定を取得
 */
export function getCharacterConfig(id: number): CharacterConfig {
  return CHARACTERS[id] || CHARACTERS[1]; // デフォルトはキャラクター1
}
