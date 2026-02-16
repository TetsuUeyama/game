import { db } from '@/GamePlay/Management/Lib/Firebase';
import { collection, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { GameTeamConfig } from '@/GamePlay/GameSystem/CharacterMove/Loaders/TeamConfigLoader';

const USERS_COLLECTION = 'users';

type ConfigKey = 'teamConfig1on1' | 'teamConfig5on5';

// ===== ユーザープロフィール =====

export interface UserProfile {
  name: string;
  university: string;
  teamName: string;
}

/**
 * 新規ユーザープロフィールを作成
 * @returns 生成されたユーザーID
 */
export async function createUserProfile(
  profile: UserProfile
): Promise<string> {
  const docRef = await addDoc(collection(db, USERS_COLLECTION), profile);
  return docRef.id;
}

/**
 * ユーザープロフィールを取得
 */
export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const docSnap = await getDoc(doc(db, USERS_COLLECTION, userId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as UserProfile;
}

/**
 * ユーザーが存在するか確認
 */
export async function checkUserExists(userId: string): Promise<boolean> {
  const docSnap = await getDoc(doc(db, USERS_COLLECTION, userId));
  return docSnap.exists();
}

/** GameTeamConfig をFirestore互換のプレーンオブジェクトに変換 */
function toPlainObject(config: GameTeamConfig): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config));
}

/**
 * ユーザーのチーム構成をFirestoreに保存
 * @param userId ユーザーID
 * @param configKey 設定キー（1on1 or 5on5）
 * @param config チーム構成データ
 */
export async function saveUserTeamConfig(
  userId: string,
  configKey: ConfigKey,
  config: GameTeamConfig
): Promise<void> {
  await setDoc(
    doc(db, USERS_COLLECTION, userId, 'configs', configKey),
    toPlainObject(config)
  );
}

/**
 * ユーザーのチーム構成をFirestoreから取得
 * @param userId ユーザーID
 * @param configKey 設定キー
 * @returns チーム構成（存在しない場合はnull）
 */
export async function loadUserTeamConfig(
  userId: string,
  configKey: ConfigKey
): Promise<GameTeamConfig | null> {
  const docSnap = await getDoc(
    doc(db, USERS_COLLECTION, userId, 'configs', configKey)
  );
  if (!docSnap.exists()) return null;
  return docSnap.data() as GameTeamConfig;
}

/**
 * デフォルトのチーム構成をFirestoreにアップロード（管理用）
 * masterData/teamConfig1on1, masterData/teamConfig5on5 として保存
 */
export async function uploadDefaultTeamConfig(
  configKey: ConfigKey,
  config: GameTeamConfig
): Promise<void> {
  await setDoc(
    doc(db, 'masterData', configKey),
    toPlainObject(config)
  );
}

/**
 * デフォルトのチーム構成をFirestoreから取得
 */
export async function fetchDefaultTeamConfig(
  configKey: ConfigKey
): Promise<GameTeamConfig | null> {
  const docSnap = await getDoc(doc(db, 'masterData', configKey));
  if (!docSnap.exists()) return null;
  return docSnap.data() as GameTeamConfig;
}
