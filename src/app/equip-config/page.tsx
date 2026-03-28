'use client'; // クライアントサイドレンダリングを有効化

// ReactのuseEffect, useStateフックをインポート
import { useEffect, useState } from 'react';
// Next.jsのLinkコンポーネントをインポート
import Link from 'next/link';

// 装備ビヘイビアの種類定義
type EquipBehavior = 'synced' | 'surface' | 'gravity';

// 装備パーツの型定義
interface EquipPart {
  key: string;          // パーツキー（識別子）
  file: string;         // VOXファイルパス
  voxels: number;       // ボクセル数
  default_on: boolean;  // デフォルトで表示するか
}

// 装備設定の型定義（ローカルストレージに保存）
interface EquipConfig {
  enabled: Record<string, boolean>;           // パーツごとの有効/無効
  behaviors: Record<string, EquipBehavior>;   // パーツごとのビヘイビア
}

// ボクセルレベルのビヘイビアデータ型
interface BehaviorData {
  surface: string[];   // 表面維持ボクセルの座標リスト
  gravity: string[];   // 重力影響ボクセルの座標リスト
}

// ローカルストレージのキー
const STORAGE_KEY = 'fbx-viewer-equip-config';
// パーツマニフェストのURL
const VOX_PARTS_MANIFEST = '/box2/cyberpunk_elf_parts.json';

// ビヘイビアタイプの情報定義（表示用ラベル、色、説明）
const BEHAVIOR_INFO: { value: EquipBehavior; label: string; labelJa: string; color: string; desc: string }[] = [
  { value: 'synced', label: 'Synced', labelJa: 'body同期', color: '#4a6', desc: '体の動きに完全同期。シャツ・パンツなど。' },
  { value: 'surface', label: 'Surface', labelJa: '表面維持', color: '#68f', desc: '体表面に追従しつつ形状維持。肩パッド・アクセサリーなど。' },
  { value: 'gravity', label: 'Gravity', labelJa: '重力影響', color: '#f84', desc: '重力の影響を受ける。髪・ペンダント・マントなど。' },
];

// ローカルストレージから装備設定を読み込む関数
function loadEquipConfig(): EquipConfig | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ローカルストレージに装備設定を保存する関数
function saveEquipConfig(config: EquipConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// 装備ビヘイビア設定ページコンポーネント
export default function EquipConfigPage() {
  // 装備パーツ一覧
  const [equipList, setEquipList] = useState<EquipPart[]>([]);
  // パーツごとの有効/無効状態
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  // パーツごとのビヘイビア設定
  const [behaviors, setBehaviors] = useState<Record<string, EquipBehavior>>({});
  // ボクセルレベルのビヘイビアデータ
  const [voxelBehaviors, setVoxelBehaviors] = useState<Record<string, BehaviorData>>({});
  // ローディング状態
  const [loading, setLoading] = useState(true);
  // エラーメッセージ
  const [error, setError] = useState<string | null>(null);
  // 保存完了表示フラグ
  const [saved, setSaved] = useState(false);

  // 初期化: マニフェスト読み込みと設定復元
  useEffect(() => {
    (async () => {
      try {
        // パーツマニフェストをフェッチ
        const resp = await fetch(VOX_PARTS_MANIFEST + `?v=${Date.now()}`);
        if (!resp.ok) throw new Error(`Failed to load manifest: ${resp.status}`);
        const parts: EquipPart[] = await resp.json();
        // bodyパーツを除外した装備パーツリスト
        const equipParts = parts.filter(p => p.key !== 'body');
        setEquipList(equipParts);

        // 保存済み設定を復元、なければデフォルト値を使用
        const savedConfig = loadEquipConfig();
        const en: Record<string, boolean> = {};
        const bh: Record<string, EquipBehavior> = {};
        for (const p of equipParts) {
          en[p.key] = savedConfig?.enabled[p.key] ?? p.default_on;
          bh[p.key] = savedConfig?.behaviors[p.key] ?? 'synced';
        }
        setEnabled(en);
        setBehaviors(bh);

        // 各パーツのボクセルレベルビヘイビアデータをAPIから読み込み
        const vbMap: Record<string, BehaviorData> = {};
        await Promise.all(equipParts.map(async (p) => {
          try {
            const r = await fetch(`/api/equip-behavior?partKey=${p.key}`);
            if (r.ok) vbMap[p.key] = await r.json();
          } catch { /* エラーは無視 */ }
        }));
        setVoxelBehaviors(vbMap);

        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
  }, []);

  // 保存完了メッセージを1.5秒表示
  const showSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };

  // パーツの有効/無効をトグル
  const toggleEnabled = (key: string) => {
    const next = { ...enabled, [key]: !enabled[key] };
    setEnabled(next);
    saveEquipConfig({ enabled: next, behaviors });
    showSaved();
  };

  // パーツのビヘイビアを変更
  const changeBehavior = (key: string, behavior: EquipBehavior) => {
    const next = { ...behaviors, [key]: behavior };
    setBehaviors(next);
    saveEquipConfig({ enabled, behaviors: next });
    showSaved();
  };

  // 全パーツのビヘイビアを一括変更
  const setAllBehavior = (behavior: EquipBehavior) => {
    const next: Record<string, EquipBehavior> = {};
    for (const p of equipList) next[p.key] = behavior;
    setBehaviors(next);
    saveEquipConfig({ enabled, behaviors: next });
    showSaved();
  };

  // パーツのボクセルレベル統計を取得
  const getVoxelStats = (key: string, totalVoxels: number) => {
    const vb = voxelBehaviors[key];
    if (!vb) return { synced: totalVoxels, surface: 0, gravity: 0 };
    const surface = vb.surface?.length ?? 0;
    const gravity = vb.gravity?.length ?? 0;
    return { synced: totalVoxels - surface - gravity, surface, gravity };
  };

  return (
    // ルートコンテナ
    <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#ccc', padding: '2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* ヘッダー: タイトルとナビゲーションリンク */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Equipment Behavior Config</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/fbx-viewer" style={{ color: '#68f', fontSize: 13 }}>Viewer</Link>
            <Link href="/" style={{ color: '#888', fontSize: 13 }}>Top</Link>
          </div>
        </div>

        {/* 保存完了通知（固定位置） */}
        {saved && (
          <div style={{
            position: 'fixed', top: 16, right: 16, padding: '8px 16px',
            background: '#4a6', color: '#fff', borderRadius: 6, fontSize: 13, zIndex: 100,
          }}>Saved</div>
        )}

        {/* ビヘイビアタイプの凡例 */}
        <div style={{
          background: '#0f0f23', borderRadius: 8, padding: '14px 18px', marginBottom: '1.5rem',
          border: '1px solid #333',
        }}>
          <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>Behavior Types</div>
          {BEHAVIOR_INFO.map(info => (
            <div key={info.value} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              {/* ビヘイビアタイプのラベルバッジ */}
              <span style={{
                display: 'inline-block', width: 70, padding: '2px 6px', borderRadius: 4,
                background: info.color, color: '#fff', fontSize: 11, textAlign: 'center', flexShrink: 0,
              }}>{info.label}</span>
              {/* 日本語ラベルと説明 */}
              <span style={{ fontSize: 12, color: '#aaa' }}>
                <strong style={{ color: '#ccc' }}>{info.labelJa}</strong> — {info.desc}
              </span>
            </div>
          ))}
        </div>

        {/* 一括操作ボタン */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#888' }}>Default behavior (all parts):</span>
          {BEHAVIOR_INFO.map(info => (
            <button key={info.value} onClick={() => setAllBehavior(info.value)} style={{
              padding: '4px 12px', borderRadius: 4, background: info.color, color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 11,
            }}>{info.label}</button>
          ))}
        </div>

        {/* ローディング/エラー表示 */}
        {loading && <div style={{ color: '#88f', padding: 20 }}>Loading...</div>}
        {error && <div style={{ color: '#f88', padding: 20 }}>Error: {error}</div>}

        {/* 装備パーツカード一覧 */}
        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {equipList.map(ep => {
              const beh = behaviors[ep.key] ?? 'synced';
              const isOn = enabled[ep.key] ?? false;
              const stats = getVoxelStats(ep.key, ep.voxels);
              const hasVoxelConfig = (stats.surface > 0 || stats.gravity > 0);

              return (
                <div key={ep.key} style={{
                  background: '#0f0f23', borderRadius: 8, border: '1px solid #333',
                  padding: '12px 16px', opacity: isOn ? 1 : 0.5,
                }}>
                  {/* 行1: チェックボックス、パーツ名、ボクセル数、ビヘイビア選択 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    {/* 有効/無効チェックボックス */}
                    <input
                      type="checkbox" checked={isOn}
                      onChange={() => toggleEnabled(ep.key)}
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />
                    {/* パーツ名 */}
                    <span style={{ fontWeight: 'bold', fontSize: 14, minWidth: 120 }}>{ep.key}</span>
                    {/* ボクセル数 */}
                    <span style={{ fontSize: 11, color: '#888' }}>{ep.voxels} voxels</span>
                    {/* ビヘイビア切り替えボタン */}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      {BEHAVIOR_INFO.map(info => (
                        <button
                          key={info.value}
                          onClick={() => changeBehavior(ep.key, info.value)}
                          disabled={!isOn}
                          style={{
                            padding: '3px 8px', borderRadius: 4, fontSize: 10,
                            background: beh === info.value ? info.color : '#2a2a3e',
                            color: beh === info.value ? '#fff' : '#555',
                            border: beh === info.value ? `2px solid ${info.color}` : '2px solid transparent',
                            cursor: isOn ? 'pointer' : 'default',
                            fontWeight: beh === info.value ? 'bold' : 'normal',
                          }}
                        >{info.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* 行2: ボクセルレベル統計 + エディタリンク */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 26 }}>
                    {hasVoxelConfig ? (
                      // ボクセルレベル設定がある場合: 各タイプの数を表示
                      <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                        <span style={{ color: '#4a6' }}>Synced: {stats.synced}</span>
                        <span style={{ color: '#68f' }}>Surface: {stats.surface}</span>
                        <span style={{ color: '#f84' }}>Gravity: {stats.gravity}</span>
                      </div>
                    ) : (
                      // 設定がない場合
                      <span style={{ fontSize: 11, color: '#555' }}>
                        Voxel-level config: none (all {BEHAVIOR_INFO.find(b => b.value === beh)?.label ?? 'Synced'})
                      </span>
                    )}
                    {/* ボクセルエディタへのリンク */}
                    <Link
                      href={`/equip-config/${ep.key}`}
                      style={{
                        marginLeft: 'auto', fontSize: 11, padding: '3px 10px',
                        background: '#2a2a4e', color: '#8af', borderRadius: 4,
                        textDecoration: 'none', border: '1px solid #446',
                      }}
                    >
                      Voxel Editor →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
