import { useState, useCallback } from 'react';
import { db } from '@/GamePlay/Management/Lib/Firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { fetchLeaguePlayers, LeaguePlayer } from '@/GamePlay/Management/Services/LeagueService';

const BATCH_LIMIT = 500;

/**
 * リーグ選手データのローカル状態管理フック
 *
 * - ローカル state で選手データを保持し、UI はここから取得
 * - updatePlayer で即時にローカル更新（dirty 追跡）
 * - saveChanges で変更分のみ Firestore に書き込み
 */
export function useLeaguePlayers() {
  const [players, setPlayers] = useState<Record<string, LeaguePlayer>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Firestore から全選手を読み込み（初回 or リロード時） */
  const loadPlayers = useCallback(async (uid: string) => {
    const data = await fetchLeaguePlayers(uid);
    setPlayers(data);
    setUserId(uid);
    setDirtyIds(new Set());
  }, []);

  /** 選手1人をローカル更新（即時反映 + dirty マーク） */
  const updatePlayer = useCallback(
    (id: string, updates: Partial<LeaguePlayer>) => {
      setPlayers((prev) => {
        if (!prev[id]) return prev;
        return { ...prev, [id]: { ...prev[id], ...updates } };
      });
      setDirtyIds((prev) => new Set(prev).add(id));
    },
    []
  );

  /** 複数選手を一括ローカル更新 */
  const updatePlayers = useCallback(
    (updates: Record<string, Partial<LeaguePlayer>>) => {
      setPlayers((prev) => {
        const next = { ...prev };
        for (const [id, patch] of Object.entries(updates)) {
          if (next[id]) {
            next[id] = { ...next[id], ...patch };
          }
        }
        return next;
      });
      setDirtyIds((prev) => {
        const next = new Set(prev);
        for (const id of Object.keys(updates)) {
          next.add(id);
        }
        return next;
      });
    },
    []
  );

  /** 変更分のみ Firestore にバッチ書き込み */
  const saveChanges = useCallback(async () => {
    if (!userId || dirtyIds.size === 0) return;
    setSaving(true);
    try {
      const ids = Array.from(dirtyIds);

      for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        const chunk = ids.slice(i, i + BATCH_LIMIT);
        for (const id of chunk) {
          const ref = doc(db, 'users', userId, 'players', id);
          batch.set(ref, JSON.parse(JSON.stringify(players[id])));
        }
        await batch.commit();
      }

      setDirtyIds(new Set());
    } finally {
      setSaving(false);
    }
  }, [userId, dirtyIds, players]);

  return {
    players,
    updatePlayer,
    updatePlayers,
    saveChanges,
    loadPlayers,
    saving,
    isDirty: dirtyIds.size > 0,
    dirtyCount: dirtyIds.size,
  };
}
