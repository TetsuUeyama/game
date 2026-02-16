import { db } from '@/GamePlay/Management/Lib/Firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  writeBatch,
  DocumentData,
} from 'firebase/firestore';

const COLLECTION = 'masterData/players/items';
const BATCH_LIMIT = 500; // Firestore batch write limit

/**
 * 選手データをFirestoreにアップロード（バッチ書き込み）
 * @param players PlayerDataJSON[] 形式の選手データ配列
 * @returns アップロードした件数
 */
export async function uploadPlayers(
  players: DocumentData[]
): Promise<number> {
  let uploaded = 0;

  for (let i = 0; i < players.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = players.slice(i, i + BATCH_LIMIT);

    for (const player of chunk) {
      const ref = doc(db, COLLECTION, String(player.ID));
      batch.set(ref, player);
    }

    await batch.commit();
    uploaded += chunk.length;
  }

  return uploaded;
}

/**
 * Firestoreから全選手データを取得
 * @returns ID -> PlayerDataJSON のマップ
 */
export async function fetchAllPlayers(): Promise<Record<string, DocumentData>> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  const players: Record<string, DocumentData> = {};

  snapshot.forEach((docSnap) => {
    players[docSnap.id] = docSnap.data();
  });

  return players;
}

/**
 * Firestoreから特定の選手データを取得
 * @param playerId 選手ID
 */
export async function fetchPlayer(
  playerId: string
): Promise<DocumentData | undefined> {
  const docSnap = await getDoc(doc(db, COLLECTION, playerId));
  return docSnap.exists() ? docSnap.data() : undefined;
}
