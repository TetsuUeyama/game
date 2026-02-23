'use client';

import { useState } from 'react';
import { TrainingConfig, TrainingProgramId } from '@/SimulationPlay/Management/Services/UserDataService';

const MAX_PROGRAMS = 3;

interface TrainingProgram {
  id: TrainingProgramId;
  label: string;
  description: string;
}

const TRAINING_PROGRAMS: TrainingProgram[] = [
  { id: 'shooting', label: 'シュート練習', description: 'ミドルレンジシュートの精度向上' },
  { id: 'three_point', label: '3ポイント練習', description: '3Pシュートの精度・速度向上' },
  { id: 'dribbling', label: 'ドリブル練習', description: 'ドリブル精度・スピード向上' },
  { id: 'passing', label: 'パス練習', description: 'パス精度・速度向上' },
  { id: 'defense', label: 'ディフェンス練習', description: '守備力・リフレックス向上' },
  { id: 'physical', label: 'フィジカル強化', description: 'パワー・スタミナ向上' },
  { id: 'speed', label: 'スピード強化', description: 'スピード・加速力向上' },
  { id: 'team_tactics', label: 'チーム戦術', description: '連携・テクニック向上' },
  { id: 'free_throw', label: 'フリースロー練習', description: 'FT成功率向上' },
  { id: 'mental', label: 'メンタル強化', description: 'メンタリティ向上' },
];

interface Props {
  initialConfig: TrainingConfig | null;
  onSave: (config: TrainingConfig) => void;
  onBack: () => void;
}

export function TrainingSelector({ initialConfig, onSave, onBack }: Props) {
  const [selected, setSelected] = useState<Set<TrainingProgramId>>(() => {
    if (initialConfig) return new Set(initialConfig.selectedPrograms);
    return new Set();
  });

  const handleToggle = (id: TrainingProgramId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_PROGRAMS) {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = () => {
    onSave({ selectedPrograms: Array.from(selected) });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold transition-colors cursor-pointer"
          >
            戻る
          </button>
          <h1 className="text-2xl font-bold">練習指示</h1>
          <div className="w-16" />
        </div>

        <p className="text-sm text-gray-400 mb-6 text-center">
          トレーニングメニューを最大{MAX_PROGRAMS}つ選択してください（{selected.size}/{MAX_PROGRAMS}）
        </p>

        {/* トレーニングカード一覧 */}
        <div className="space-y-2 mb-6">
          {TRAINING_PROGRAMS.map((prog) => {
            const isSelected = selected.has(prog.id);
            const isDisabled = !isSelected && selected.size >= MAX_PROGRAMS;
            return (
              <button
                key={prog.id}
                onClick={() => !isDisabled && handleToggle(prog.id)}
                className={`w-full p-4 rounded-lg text-left transition-colors cursor-pointer flex items-center gap-4 ${
                  isSelected
                    ? 'bg-green-900/50 border border-green-500'
                    : isDisabled
                    ? 'bg-gray-800/50 opacity-50 cursor-not-allowed'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'border-green-400 bg-green-500' : 'border-gray-500'
                  }`}
                >
                  {isSelected && <span className="text-white text-sm font-bold">&#10003;</span>}
                </div>
                <div>
                  <p className="font-bold">{prog.label}</p>
                  <p className="text-sm text-gray-400">{prog.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={selected.size === 0}
          className={`w-full py-3 rounded-lg text-lg font-bold transition-colors cursor-pointer ${
            selected.size > 0
              ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {selected.size > 0 ? '保存する' : 'メニューを選択してください'}
        </button>
      </div>
    </div>
  );
}
