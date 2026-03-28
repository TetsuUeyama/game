'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EquipBehavior, EquipPart, BehaviorData } from '@/types/equip';
import { BEHAVIOR_INFO_LIST } from '@/types/equip';

interface EquipConfig {
  enabled: Record<string, boolean>;
  behaviors: Record<string, EquipBehavior>;
}

const STORAGE_KEY = 'fbx-viewer-equip-config';
const VOX_PARTS_MANIFEST = '/box2/cyberpunk_elf_parts.json';

function loadEquipConfig(): EquipConfig | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function saveEquipConfig(config: EquipConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export default function EquipConfigView() {
  const [equipList, setEquipList] = useState<EquipPart[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [behaviors, setBehaviors] = useState<Record<string, EquipBehavior>>({});
  const [voxelBehaviors, setVoxelBehaviors] = useState<Record<string, BehaviorData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(VOX_PARTS_MANIFEST + `?v=${Date.now()}`);
        if (!resp.ok) throw new Error(`Failed to load manifest: ${resp.status}`);
        const parts: EquipPart[] = await resp.json();
        const equipParts = parts.filter(p => p.key !== 'body');
        setEquipList(equipParts);

        const savedConfig = loadEquipConfig();
        const en: Record<string, boolean> = {};
        const bh: Record<string, EquipBehavior> = {};
        for (const p of equipParts) {
          en[p.key] = savedConfig?.enabled[p.key] ?? p.default_on;
          bh[p.key] = savedConfig?.behaviors[p.key] ?? 'synced';
        }
        setEnabled(en);
        setBehaviors(bh);

        const vbMap: Record<string, BehaviorData> = {};
        await Promise.all(equipParts.map(async (p) => {
          try {
            const r = await fetch(`/api/equip-behavior?partKey=${p.key}`);
            if (r.ok) vbMap[p.key] = await r.json();
          } catch { /* ignore */ }
        }));
        setVoxelBehaviors(vbMap);

        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
  }, []);

  const showSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const toggleEnabled = (key: string) => {
    const next = { ...enabled, [key]: !enabled[key] };
    setEnabled(next);
    saveEquipConfig({ enabled: next, behaviors });
    showSaved();
  };

  const changeBehavior = (key: string, behavior: EquipBehavior) => {
    const next = { ...behaviors, [key]: behavior };
    setBehaviors(next);
    saveEquipConfig({ enabled, behaviors: next });
    showSaved();
  };

  const setAllBehavior = (behavior: EquipBehavior) => {
    const next: Record<string, EquipBehavior> = {};
    for (const p of equipList) next[p.key] = behavior;
    setBehaviors(next);
    saveEquipConfig({ enabled, behaviors: next });
    showSaved();
  };

  const getVoxelStats = (key: string, totalVoxels: number) => {
    const vb = voxelBehaviors[key];
    if (!vb) return { synced: totalVoxels, surface: 0, gravity: 0 };
    const surface = vb.surface?.length ?? 0;
    const gravity = vb.gravity?.length ?? 0;
    return { synced: totalVoxels - surface - gravity, surface, gravity };
  };

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', color: '#ccc', padding: '2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Equipment Behavior Config</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/fbx-viewer" style={{ color: '#68f', fontSize: 13 }}>Viewer</Link>
            <Link href="/" style={{ color: '#888', fontSize: 13 }}>Top</Link>
          </div>
        </div>

        {saved && (
          <div style={{
            position: 'fixed', top: 16, right: 16, padding: '8px 16px',
            background: '#4a6', color: '#fff', borderRadius: 6, fontSize: 13, zIndex: 100,
          }}>Saved</div>
        )}

        <div style={{
          background: '#0f0f23', borderRadius: 8, padding: '14px 18px', marginBottom: '1.5rem',
          border: '1px solid #333',
        }}>
          <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>Behavior Types</div>
          {BEHAVIOR_INFO_LIST.map(info => (
            <div key={info.value} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{
                display: 'inline-block', width: 70, padding: '2px 6px', borderRadius: 4,
                background: info.color, color: '#fff', fontSize: 11, textAlign: 'center', flexShrink: 0,
              }}>{info.label}</span>
              <span style={{ fontSize: 12, color: '#aaa' }}>
                <strong style={{ color: '#ccc' }}>{info.labelJa}</strong> — {info.desc}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#888' }}>Default behavior (all parts):</span>
          {BEHAVIOR_INFO_LIST.map(info => (
            <button key={info.value} onClick={() => setAllBehavior(info.value)} style={{
              padding: '4px 12px', borderRadius: 4, background: info.color, color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 11,
            }}>{info.label}</button>
          ))}
        </div>

        {loading && <div style={{ color: '#88f', padding: 20 }}>Loading...</div>}
        {error && <div style={{ color: '#f88', padding: 20 }}>Error: {error}</div>}

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <input
                      type="checkbox" checked={isOn}
                      onChange={() => toggleEnabled(ep.key)}
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />
                    <span style={{ fontWeight: 'bold', fontSize: 14, minWidth: 120 }}>{ep.key}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>{ep.voxels} voxels</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      {BEHAVIOR_INFO_LIST.map(info => (
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 26 }}>
                    {hasVoxelConfig ? (
                      <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                        <span style={{ color: '#4a6' }}>Synced: {stats.synced}</span>
                        <span style={{ color: '#68f' }}>Surface: {stats.surface}</span>
                        <span style={{ color: '#f84' }}>Gravity: {stats.gravity}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: '#555' }}>
                        Voxel-level config: none (all {BEHAVIOR_INFO_LIST.find(b => b.value === beh)?.label ?? 'Synced'})
                      </span>
                    )}
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
