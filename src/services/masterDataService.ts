import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const MASTER_COLLECTION = 'masterData';

type MasterKey = 'firstNames' | 'lastNames' | 'teams' | 'universities';

/**
 * マスターデータ（名前リスト等）をFirestoreにアップロード
 * @param key マスターデータのキー
 * @param items 文字列配列
 */
export async function uploadMasterData(
  key: MasterKey,
  items: string[]
): Promise<void> {
  await setDoc(doc(db, MASTER_COLLECTION, key), { items });
}

/**
 * マスターデータをFirestoreから取得
 * @param key マスターデータのキー
 * @returns 文字列配列（存在しない場合は空配列）
 */
export async function fetchMasterData(key: MasterKey): Promise<string[]> {
  const docSnap = await getDoc(doc(db, MASTER_COLLECTION, key));
  if (!docSnap.exists()) return [];
  return docSnap.data().items as string[];
}

/**
 * 全マスターデータを並列取得
 */
export async function fetchAllMasterData(): Promise<{
  firstNames: string[];
  lastNames: string[];
  teams: string[];
  universities: string[];
}> {
  const [firstNames, lastNames, teams, universities] = await Promise.all([
    fetchMasterData('firstNames'),
    fetchMasterData('lastNames'),
    fetchMasterData('teams'),
    fetchMasterData('universities'),
  ]);
  return { firstNames, lastNames, teams, universities };
}
