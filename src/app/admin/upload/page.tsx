'use client';

import { useState } from 'react';
import Link from 'next/link';
import { uploadPlayers } from '@/services/playerService';
import { uploadMasterData } from '@/services/masterDataService';
import { uploadDefaultTeamConfig } from '@/services/userDataService';
import { GameTeamConfig } from '@/character-move/loaders/TeamConfigLoader';

function parseCSV(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/\r/g, '').replace(/^\uFEFF/, '').trim())
    .filter((line) => line.length > 0);
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

interface UploadTask {
  label: string;
  status: UploadStatus;
  count?: number;
  error?: string;
}

export default function AdminUploadPage() {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [running, setRunning] = useState(false);

  const handleUploadAll = async () => {
    setRunning(true);

    const taskList: UploadTask[] = [
      { label: '選手データ (playerData.json)', status: 'idle' },
      { label: '名字リスト (LastName.csv)', status: 'idle' },
      { label: '名前リスト (FirstName.csv)', status: 'idle' },
      { label: 'チーム名リスト (Team.csv)', status: 'idle' },
      { label: '大学名リスト (University.csv)', status: 'idle' },
      { label: 'チーム構成 1on1 (teamConfig1on1.json)', status: 'idle' },
      { label: 'チーム構成 5on5 (teamConfig5on5.json)', status: 'idle' },
    ];
    setTasks(taskList);

    // Helper to update task at index
    const update = (idx: number, u: Partial<UploadTask>) => {
      taskList[idx] = { ...taskList[idx], ...u };
      setTasks([...taskList]);
    };

    // 1. Players
    try {
      update(0, { status: 'uploading' });
      const res = await fetch('/data/playerData.json');
      const players = await res.json();
      const count = await uploadPlayers(players);
      update(0, { status: 'done', count });
    } catch (e) {
      update(0, { status: 'error', error: String(e) });
    }

    // 2-5. CSV master data
    const csvUploads: { idx: number; file: string; key: 'lastNames' | 'firstNames' | 'teams' | 'universities' }[] = [
      { idx: 1, file: '/data/LastName.csv', key: 'lastNames' },
      { idx: 2, file: '/data/FirstName.csv', key: 'firstNames' },
      { idx: 3, file: '/data/Team.csv', key: 'teams' },
      { idx: 4, file: '/data/University.csv', key: 'universities' },
    ];

    for (const { idx, file, key } of csvUploads) {
      try {
        update(idx, { status: 'uploading' });
        const res = await fetch(file);
        const text = await res.text();
        const items = parseCSV(text);
        await uploadMasterData(key, items);
        update(idx, { status: 'done', count: items.length });
      } catch (e) {
        update(idx, { status: 'error', error: String(e) });
      }
    }

    // 6-7. Team configs
    const configUploads: { idx: number; file: string; key: 'teamConfig1on1' | 'teamConfig5on5' }[] = [
      { idx: 5, file: '/data/teamConfig1on1.json', key: 'teamConfig1on1' },
      { idx: 6, file: '/data/teamConfig5on5.json', key: 'teamConfig5on5' },
    ];

    for (const { idx, file, key } of configUploads) {
      try {
        update(idx, { status: 'uploading' });
        const res = await fetch(file);
        const config: GameTeamConfig = await res.json();
        await uploadDefaultTeamConfig(key, config);
        update(idx, { status: 'done' });
      } catch (e) {
        update(idx, { status: 'error', error: String(e) });
      }
    }

    setRunning(false);
  };

  const statusIcon = (status: UploadStatus) => {
    switch (status) {
      case 'idle': return '---';
      case 'uploading': return '...';
      case 'done': return 'OK';
      case 'error': return 'NG';
    }
  };

  const statusColor = (status: UploadStatus) => {
    switch (status) {
      case 'idle': return 'text-gray-400';
      case 'uploading': return 'text-yellow-400';
      case 'done': return 'text-green-400';
      case 'error': return 'text-red-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Admin: データアップロード</h1>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            ホームに戻る
          </Link>
        </div>

        <p className="text-gray-400 mb-6">
          public/data/ のデータを Firestore にアップロードします。
        </p>

        <button
          onClick={handleUploadAll}
          disabled={running}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors mb-8"
        >
          {running ? 'アップロード中...' : '全データをアップロード'}
        </button>

        {tasks.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4">
            <table className="w-full">
              <thead>
                <tr className="text-gray-400 text-sm border-b border-gray-700">
                  <th className="text-left py-2">データ</th>
                  <th className="text-center py-2 w-20">状態</th>
                  <th className="text-right py-2 w-20">件数</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, i) => (
                  <tr key={i} className="border-b border-gray-700/50">
                    <td className="py-2 text-sm">{task.label}</td>
                    <td className={`py-2 text-center text-sm font-mono ${statusColor(task.status)}`}>
                      {statusIcon(task.status)}
                    </td>
                    <td className="py-2 text-right text-sm text-gray-300">
                      {task.count !== undefined ? task.count.toLocaleString() : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tasks.some((t) => t.error) && (
              <div className="mt-4 text-red-400 text-sm">
                {tasks
                  .filter((t) => t.error)
                  .map((t, i) => (
                    <p key={i}>{t.label}: {t.error}</p>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
