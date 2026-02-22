import { useState, useCallback } from 'react';
import { fetchLeaguePlayers, LeaguePlayer } from '@/GamePlay/Management/Services/LeagueService';

/**
 * リーグ選手データのローカル状態管理フック
 *
 * - ローカル state で選手データを保持し、UI はここから取得
 * - updatePlayer で即時にローカル更新（dirty 追跡）
 * - saveChanges で dirty をクリア（メモリ上で既に更新済みのため永続化不要）
 */
export function useLeaguePlayers() {
  const [players, setPlayers] = useState<Record<string, LeaguePlayer>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  /** メモリから全選手を読み込み（初回 or リロード時） */
  const loadPlayers = useCallback(async (uid: string) => {
    const data = await fetchLeaguePlayers(uid);
    setPlayers(data);
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

  /** dirty をクリア（メモリ上で既に更新済みのため永続化不要） */
  const saveChanges = useCallback(async () => {
    if (dirtyIds.size === 0) return;
    setSaving(true);
    try {
      setDirtyIds(new Set());
    } finally {
      setSaving(false);
    }
  }, [dirtyIds]);

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
