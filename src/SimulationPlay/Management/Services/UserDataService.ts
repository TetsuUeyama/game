import { GameTeamConfig } from '@/GamePlay/Data/TeamConfigLoader';

type ConfigKey = 'teamConfig1on1' | 'teamConfig5on5';

// ===== ロスター & トレーニング型定義 =====

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface RosterStarter {
  leaguePlayerId: string;
  position: Position;
}

export interface RosterConfig {
  starters: RosterStarter[];  // 5人
  bench: string[];            // leaguePlayerId × 5人
}

export type TrainingProgramId =
  | 'shooting' | 'three_point' | 'dribbling' | 'passing'
  | 'defense' | 'physical' | 'speed' | 'team_tactics'
  | 'free_throw' | 'mental';

export interface TrainingConfig {
  selectedPrograms: TrainingProgramId[];  // 最大3つ
}

// ===== インメモリストア =====

const userProfiles = new Map<string, UserProfile>();
const userConfigs = new Map<string, GameTeamConfig>(); // key: `${userId}/${configKey}`
const rosterConfigs = new Map<string, RosterConfig>();
const trainingConfigs = new Map<string, TrainingConfig>();

// ===== ユーザープロフィール =====

export interface UserProfile {
  lastName: string;
  firstName: string;
  university: string;
  teamName: string;
}

/**
 * 新規ユーザープロフィールを作成（メモリに保存）
 * @returns 生成されたユーザーID
 */
export async function createUserProfile(
  profile: UserProfile
): Promise<string> {
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  userProfiles.set(id, { ...profile });
  return id;
}

/**
 * ユーザープロフィールを取得
 */
export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  return userProfiles.get(userId) ?? null;
}

/**
 * ユーザーが存在するか確認
 */
export async function checkUserExists(userId: string): Promise<boolean> {
  return userProfiles.has(userId);
}

/**
 * ユーザーのチーム構成をメモリに保存
 */
export async function saveUserTeamConfig(
  userId: string,
  configKey: ConfigKey,
  config: GameTeamConfig
): Promise<void> {
  userConfigs.set(`${userId}/${configKey}`, JSON.parse(JSON.stringify(config)));
}

/**
 * ユーザーのチーム構成をメモリから取得
 */
export async function loadUserTeamConfig(
  userId: string,
  configKey: ConfigKey
): Promise<GameTeamConfig | null> {
  return userConfigs.get(`${userId}/${configKey}`) ?? null;
}

/**
 * デフォルトのチーム構成をアップロード（no-op）
 */
export async function uploadDefaultTeamConfig(
  _configKey: ConfigKey,
  _config: GameTeamConfig
): Promise<void> {
  // no-op
}

/**
 * デフォルトのチーム構成を取得（JSONファイルから）
 */
export async function fetchDefaultTeamConfig(
  configKey: ConfigKey
): Promise<GameTeamConfig | null> {
  const res = await fetch(`/data/${configKey}.json`);
  if (!res.ok) return null;
  return (await res.json()) as GameTeamConfig;
}

// ===== ロスター構成 =====

export async function saveRosterConfig(
  userId: string,
  config: RosterConfig
): Promise<void> {
  rosterConfigs.set(userId, JSON.parse(JSON.stringify(config)));
}

export async function loadRosterConfig(
  userId: string
): Promise<RosterConfig | null> {
  return rosterConfigs.get(userId) ?? null;
}

// ===== トレーニング構成 =====

export async function saveTrainingConfig(
  userId: string,
  config: TrainingConfig
): Promise<void> {
  trainingConfigs.set(userId, JSON.parse(JSON.stringify(config)));
}

export async function loadTrainingConfig(
  userId: string
): Promise<TrainingConfig | null> {
  return trainingConfigs.get(userId) ?? null;
}
