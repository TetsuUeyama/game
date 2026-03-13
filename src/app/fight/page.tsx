'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { MODEL_REGISTRY } from '@/lib/model-registry';
import type { ModelEntry } from '@/lib/model-registry';
import { STAGE_CONFIG } from '@/GamePlay/FightGame/Config/FighterConfig';
import type { AIDifficulty } from '@/GamePlay/FightGame/Core/FighterAI';
import { FightGameEngine } from '@/GamePlay/FightGame/Core/FightGameEngine';
import type { FightUIState, FighterUIInfo, GameMode } from '@/GamePlay/FightGame/Core/FightGameEngine';
import { ARCHETYPES, TEAM2_ARCHETYPES } from '@/GamePlay/FightGame/Config/ArchetypeConfig';
import { ATTACKS } from '@/GamePlay/FightGame/Config/AttackConfig';

// ====================================================================
// Types
// ====================================================================

interface PartToggle {
  key: string;
  file: string;
  default_on: boolean;
  enabled: boolean;
}

// ====================================================================
// Team model config
// ====================================================================

const maleModel = MODEL_REGISTRY.find(m => m.gender === 'male') ?? MODEL_REGISTRY[0];
const femaleModels = MODEL_REGISTRY.filter(m => m.gender === 'female');
const TEAM1_MODELS = [maleModel, maleModel, maleModel];
const TEAM2_MODELS = [
  femaleModels[0] ?? maleModel,
  femaleModels[1] ?? femaleModels[0] ?? maleModel,
  femaleModels[2] ?? femaleModels[0] ?? maleModel,
];
const ALL_UNIQUE_MODELS: ModelEntry[] = [];
const seen = new Set<string>();
for (const m of [...TEAM1_MODELS, ...TEAM2_MODELS]) {
  if (!seen.has(m.id)) { seen.add(m.id); ALL_UNIQUE_MODELS.push(m); }
}

// ====================================================================
// Equipment Panel
// ====================================================================

function EquipmentPanel({
  partsMap, onToggle,
}: {
  partsMap: Record<string, PartToggle[]>;
  onToggle: (modelId: string, partKey: string) => void;
}) {
  const entries: { model: ModelEntry; teamLabel: string; color: string }[] = [
    { model: TEAM1_MODELS[0], teamLabel: 'Tank (Team1)', color: '#4af' },
    ...TEAM2_MODELS.map((m, i) => ({
      model: m,
      teamLabel: `${ARCHETYPES[TEAM2_ARCHETYPES[i]].label} (Team2)`,
      color: '#f84',
    })),
  ];

  // Deduplicate (team1 is all same model)
  const shown = new Set<string>();

  return (
    <div style={{
      display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
      maxWidth: 800, maxHeight: 260, overflowY: 'auto',
      padding: '6px 0',
    }}>
      {entries.map(({ model, teamLabel, color }) => {
        if (shown.has(model.id)) return null;
        shown.add(model.id);
        const parts = partsMap[model.id];
        if (!parts || parts.length === 0) return null;
        return (
          <div key={model.id} style={{
            background: '#12122a', border: '1px solid #333', borderRadius: 6,
            padding: '6px 10px', minWidth: 150,
          }}>
            <div style={{ fontSize: 11, color, fontWeight: 'bold', marginBottom: 4 }}>
              {model.label}
              <span style={{ fontSize: 9, color: '#666', marginLeft: 4 }}>{teamLabel}</span>
            </div>
            {parts.map(p => (
              <label key={p.key} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 10, color: p.enabled ? '#bbb' : '#555',
                cursor: 'pointer', padding: '1px 0',
              }}>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={() => onToggle(model.id, p.key)}
                  style={{ width: 12, height: 12, accentColor: color }}
                />
                {p.key.replace(/_/g, ' ').replace(/-/g, ' ')}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ====================================================================
// HP Bars
// ====================================================================

function TeamHPBars({ fighters, side, teamColor }: {
  fighters: FighterUIInfo[];
  side: 'left' | 'right';
  teamColor: string;
}) {
  const isRight = side === 'right';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {fighters.map((f, i) => {
        const hpPct = Math.max(0, (f.hp / f.maxHp) * 100);
        const delayPct = Math.max(0, (f.delayHp / f.maxHp) * 100);
        return (
          <div key={i} style={{ opacity: f.alive ? 1 : 0.35 }}>
            <div style={{
              fontSize: 10, color: teamColor, fontWeight: 'bold',
              textAlign: isRight ? 'right' : 'left',
            }}>
              {f.label} {!f.alive && '(KO)'}
            </div>
            <div style={{
              height: 14, background: '#222', borderRadius: 3,
              overflow: 'hidden', border: '1px solid #444',
              position: 'relative', direction: isRight ? 'rtl' : 'ltr',
            }}>
              <div style={{
                position: 'absolute', [isRight ? 'right' : 'left']: 0, top: 0,
                width: `${delayPct}%`, height: '100%',
                background: 'rgba(255,255,255,0.25)',
              }} />
              <div style={{
                position: 'relative',
                width: `${hpPct}%`, height: '100%',
                background: hpPct > 30 ? '#4a4' : '#a44',
                transition: 'width 0.05s',
              }} />
            </div>
            <div style={{
              fontSize: 9, color: '#555',
              textAlign: isRight ? 'right' : 'left',
            }}>
              {Math.ceil(f.hp)}/{f.maxHp}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ====================================================================
// Training Panel
// ====================================================================

const ATTACK_CATEGORIES = {
  'Special': ['vine_whip', 'energy_ball', 'thunder_bolt'],
  'Right Punch': ['r_punch_upper', 'r_punch_mid', 'r_punch_lower'],
  'Left Punch': ['l_punch_upper', 'l_punch_mid', 'l_punch_lower'],
  'Right Kick': ['r_kick_upper', 'r_kick_mid', 'r_kick_lower'],
  'Left Kick': ['l_kick_upper', 'l_kick_mid', 'l_kick_lower'],
};

const ALL_ARCHETYPES = Object.entries(ARCHETYPES).map(([id, a]) => ({ id, label: a.label }));

function TrainingPanel({
  ui, engine, onExit,
}: {
  ui: FightUIState;
  engine: FightGameEngine;
  onExit: () => void;
}) {
  const [timeScale, setTimeScale] = useState(1.0);
  const [paused, setPaused] = useState(false);

  const atk = ui.team1[0];
  const def = ui.team2[0];

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    engine.setPaused(next);
  };

  const changeSpeed = (s: number) => {
    setTimeScale(s);
    engine.setTimeScale(s);
  };

  const execute = (attackName: string) => {
    engine.trainingResetDummy();
    // Small delay to let dummy return to idle
    setTimeout(() => engine.trainingAttack(attackName), 50);
  };

  const isBound = def?.action.startsWith('bound');

  const btnSty = (active = false) => ({
    padding: '4px 10px', fontSize: 11, cursor: 'pointer',
    background: active ? '#446' : '#1a1a2e', color: active ? '#ff4' : '#bbb',
    border: `1px solid ${active ? '#ff4' : '#444'}`, borderRadius: 4,
  });

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width: 340, height: '100%',
      background: 'rgba(0,0,10,0.94)', borderLeft: '2px solid #446',
      padding: 14, color: '#ccc', fontSize: 12, fontFamily: 'monospace',
      overflowY: 'auto', zIndex: 100,
    }}>
      <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ff4', marginBottom: 10 }}>
        TRAINING MODE
      </div>

      {/* Time controls */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Time Control</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={togglePause} style={btnSty(paused)}>
            {paused ? 'RESUME' : 'PAUSE'}
          </button>
          {[0.1, 0.25, 0.5, 1.0].map(s => (
            <button key={s} onClick={() => changeSpeed(s)}
              style={btnSty(Math.abs(timeScale - s) < 0.01)}>
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Attack selection */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Select Attack</div>
        {Object.entries(ATTACK_CATEGORIES).map(([category, attacks]) => (
          <div key={category} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>{category}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {attacks.map(a => {
                const aDef = ATTACKS[a];
                const isSpecial = category === 'Special';
                return (
                  <button key={a} onClick={() => execute(a)} style={{
                    padding: '5px 8px', fontSize: 10, cursor: 'pointer',
                    background: isSpecial ? '#2a1a1a' : '#1a1a2e',
                    color: isSpecial ? '#f84' : '#8af',
                    border: `1px solid ${isSpecial ? '#f8440' : '#4af40'}`,
                    borderRadius: 4, textAlign: 'left',
                  }}>
                    <div>{a.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 8, color: '#666' }}>
                      DMG:{aDef?.damage ?? '?'}
                      {aDef?.bindDuration ? ` Bind:${aDef.bindDuration}s` : ''}
                      {aDef?.knockdownType ? ' KD' : ''}
                      {aDef?.projectile ? ' Proj' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Reset button */}
      <button onClick={() => engine.trainingResetDummy()} style={{
        padding: '6px 20px', fontSize: 12, cursor: 'pointer', width: '100%',
        background: '#1a2a1a', color: '#4f4', border: '1px solid #4f4',
        borderRadius: 4, marginBottom: 14,
      }}>
        Reset Dummy
      </button>

      {/* Dummy status */}
      {def && (
        <div style={{
          border: '1px solid #f8440', borderRadius: 6, padding: 10, marginBottom: 14,
          background: '#0a0a1a',
        }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#f84', marginBottom: 6 }}>
            Dummy Status
          </div>

          {/* HP bar */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: '#888' }}>HP</div>
            <div style={{ background: '#222', borderRadius: 3, height: 14, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(0, (def.hp / def.maxHp) * 100)}%`, height: '100%',
                background: def.hp < def.maxHp * 0.3 ? '#f44' : '#4f4',
                transition: 'width 0.1s',
              }} />
              <span style={{
                position: 'absolute', top: 0, left: 4, fontSize: 10, color: '#fff', lineHeight: '14px',
              }}>{Math.ceil(def.hp)} / {def.maxHp}</span>
            </div>
          </div>

          {/* Guard bar */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: '#888' }}>Guard</div>
            <div style={{ background: '#222', borderRadius: 3, height: 10, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(0, (def.guard / 100) * 100)}%`, height: '100%',
                background: def.guardBroken ? '#f44' : '#44f',
              }} />
            </div>
          </div>

          {/* Action */}
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            Action: <span style={{
              fontWeight: 'bold',
              color: isBound ? '#f84' : def.action.includes('knockdown') ? '#f44'
                : def.action.includes('hitstun') ? '#ff4' : '#4f4',
            }}>{def.action}</span>
          </div>

          {/* Bind info */}
          {isBound && (
            <div style={{
              background: '#2a1a0a', border: '1px solid #f84', borderRadius: 4,
              padding: 6, marginTop: 4,
            }}>
              <div style={{ color: '#f84', fontWeight: 'bold', fontSize: 11 }}>VINE BOUND</div>
              <div style={{ fontSize: 11 }}>
                Remaining: <span style={{ color: '#ff4' }}>{def.bindTimer.toFixed(1)}s</span>
              </div>
              <div style={{ fontSize: 11 }}>
                DOT: <span style={{ color: '#f44' }}>{def.bindDotPerSec} HP/s</span>
              </div>
            </div>
          )}

          {def.action.includes('knockdown') && (
            <div style={{
              background: '#2a0a0a', border: '1px solid #f44', borderRadius: 4,
              padding: 6, marginTop: 4,
            }}>
              <div style={{ color: '#f44', fontWeight: 'bold', fontSize: 11 }}>KNOCKDOWN</div>
            </div>
          )}
        </div>
      )}

      {/* Attacker info */}
      {atk && (
        <div style={{
          border: '1px solid #4af40', borderRadius: 6, padding: 10, marginBottom: 14,
          background: '#0a0a1a',
        }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#4af', marginBottom: 4 }}>
            Attacker: {atk.label}
          </div>
          <div style={{ fontSize: 11 }}>Action: {atk.action}</div>
        </div>
      )}

      <button onClick={onExit} style={{
        padding: '8px 20px', fontSize: 13, cursor: 'pointer', width: '100%',
        background: '#2a1a1a', color: '#f88', border: '1px solid #f44',
        borderRadius: 4,
      }}>
        Exit Training
      </button>
    </div>
  );
}

// ====================================================================
// Page
// ====================================================================

export default function FightPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FightGameEngine | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [soundMuted, setSoundMuted] = useState(false);
  const [showEquipment, setShowEquipment] = useState(false);
  const [followLabel, setFollowLabel] = useState<string | null>(null);
  const [trainingAttackerModel, setTrainingAttackerModel] = useState(MODEL_REGISTRY[0]?.id ?? '');
  const [trainingAttackerArch, setTrainingAttackerArch] = useState('healer');
  const [trainingDefenderModel, setTrainingDefenderModel] = useState(MODEL_REGISTRY.find(m => m.gender === 'male')?.id ?? MODEL_REGISTRY[0]?.id ?? '');

  // Parts toggle state (modelId → parts[])
  const [partsMap, setPartsMap] = useState<Record<string, PartToggle[]>>({});
  const [partsLoaded, setPartsLoaded] = useState(false);

  // UI state from engine
  const [ui, setUI] = useState<FightUIState>({
    team1: [], team2: [],
    timer: STAGE_CONFIG.roundTime,
    phase: 'intro',
    winner: null,
    povDamageFlash: 0,
  });

  const handleUIUpdate = useCallback((state: FightUIState) => {
    setUI(state);
  }, []);

  // Fetch all parts manifests on mount
  useEffect(() => {
    const fetchParts = async () => {
      const map: Record<string, PartToggle[]> = {};
      for (const m of ALL_UNIQUE_MODELS) {
        try {
          const resp = await fetch(m.partsManifest + `?v=${Date.now()}`);
          if (resp.ok) {
            const parts: { key: string; file: string; default_on: boolean }[] = await resp.json();
            map[m.id] = parts
              .filter(p => p.key !== m.bodyKey)
              .map(p => ({ key: p.key, file: p.file, default_on: p.default_on, enabled: p.default_on }));
          }
        } catch { /* skip */ }
      }
      setPartsMap(map);
      setPartsLoaded(true);
    };
    fetchParts();
  }, []);

  const togglePart = useCallback((modelId: string, partKey: string) => {
    setPartsMap(prev => {
      const parts = prev[modelId];
      if (!parts) return prev;
      return {
        ...prev,
        [modelId]: parts.map(p =>
          p.key === partKey ? { ...p, enabled: !p.enabled } : p
        ),
      };
    });
  }, []);

  // Build parts config from toggle state
  const buildPartsConfig = (): Record<string, string[]> => {
    const config: Record<string, string[]> = {};
    for (const [id, parts] of Object.entries(partsMap)) {
      config[id] = parts.filter(p => p.enabled).map(p => p.key);
    }
    return config;
  };

  const startGame = async (difficulty: AIDifficulty = 'normal') => {
    const canvas = canvasRef.current;
    if (!canvas || loading) return;
    setLoading(true);

    // Dispose previous engine
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }

    try {
      const engine = new FightGameEngine(canvas);
      engineRef.current = engine;
      engine.setUICallback(handleUIUpdate);

      await engine.init(TEAM1_MODELS, TEAM2_MODELS, buildPartsConfig());
      engine.startGame(difficulty);
      setGameMode('battle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  const endGame = () => {
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setGameMode('menu');
    setUI({ team1: [], team2: [], timer: STAGE_CONFIG.roundTime, phase: 'intro', winner: null, povDamageFlash: 0 });
  };

  const startTraining = async () => {
    const canvas = canvasRef.current;
    if (!canvas || loading) return;
    setLoading(true);
    if (engineRef.current) { engineRef.current.dispose(); engineRef.current = null; }
    try {
      const atkModel = MODEL_REGISTRY.find(m => m.id === trainingAttackerModel) ?? MODEL_REGISTRY[0];
      const defModel = MODEL_REGISTRY.find(m => m.id === trainingDefenderModel) ?? MODEL_REGISTRY[0];
      const engine = new FightGameEngine(canvas);
      engineRef.current = engine;
      engine.setUICallback(handleUIUpdate);
      await engine.initTraining(atkModel, defModel, trainingAttackerArch, buildPartsConfig());
      setGameMode('training');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  const t1Alive = ui.team1.filter(f => f.alive).length;
  const t2Alive = ui.team2.filter(f => f.alive).length;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a18', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

      {/* POV damage red vignette */}
      {ui.povDamageFlash > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(200,0,0,${ui.povDamageFlash * 0.6}) 100%)`,
          boxShadow: `inset 0 0 80px rgba(255,0,0,${ui.povDamageFlash * 0.4})`,
        }} />
      )}

      {/* ============ MENU ============ */}
      {gameMode === 'menu' && !error && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)',
          overflowY: 'auto',
        }}>
          <div style={{
            fontSize: 48, fontWeight: 'bold', color: '#fff',
            textShadow: '0 0 30px #44f', marginBottom: 12,
            fontFamily: 'monospace', letterSpacing: 8,
          }}>
            VOXEL FIGHT
          </div>
          <div style={{ fontSize: 16, color: '#888', marginBottom: 24 }}>
            3 vs 3 Team Battle
          </div>

          {/* Team info */}
          <div style={{ display: 'flex', gap: 40, marginBottom: 20 }}>
            <div style={{ textAlign: 'center', color: '#4af' }}>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Team 1 (Male)</div>
              <div style={{ fontSize: 12, color: '#888' }}>Vagrant x 3</div>
              <div style={{ fontSize: 10, color: '#666' }}>Tank / HP:200 / Slow / Heavy</div>
            </div>
            <div style={{ fontSize: 24, color: '#555', alignSelf: 'center' }}>VS</div>
            <div style={{ textAlign: 'center', color: '#f84' }}>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Team 2 (Female)</div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {TEAM2_MODELS.map((m, i) => (
                  <span key={m.id + i}>
                    {i > 0 && ' / '}
                    {m.label}({ARCHETYPES[TEAM2_ARCHETYPES[i]].label})
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 10, color: '#666' }}>HP:100 / 3 different styles</div>
            </div>
          </div>

          {/* Equipment toggle */}
          {partsLoaded && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <button
                onClick={() => setShowEquipment(!showEquipment)}
                style={{
                  fontSize: 12, color: '#8af', background: 'none',
                  border: '1px solid #446', borderRadius: 4,
                  padding: '4px 16px', cursor: 'pointer',
                }}
              >
                {showEquipment ? 'Hide Equipment' : 'Customize Equipment'}
              </button>
              {showEquipment && (
                <div style={{ marginTop: 10 }}>
                  <EquipmentPanel partsMap={partsMap} onToggle={togglePart} />
                </div>
              )}
            </div>
          )}

          {/* Difficulty / Start */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            {(['easy', 'normal', 'hard'] as AIDifficulty[]).map(d => (
              <button
                key={d}
                onClick={() => startGame(d)}
                disabled={loading}
                style={{
                  padding: '14px 32px', fontSize: 18, fontWeight: 'bold',
                  background: d === 'normal' ? '#342' : '#222',
                  color: loading ? '#555' : (d === 'normal' ? '#cf8' : '#ccc'),
                  border: d === 'normal' ? '2px solid #4f4' : '1px solid #555',
                  borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {d}
              </button>
            ))}
          </div>
          {loading && <div style={{ fontSize: 13, color: '#88f' }}>Loading characters...</div>}
          {!loading && <div style={{ fontSize: 11, color: '#555', marginBottom: 20 }}>Select difficulty to start</div>}

          {/* Training mode section */}
          <div style={{
            borderTop: '1px solid #333', paddingTop: 16, textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, color: '#f84', fontWeight: 'bold', marginBottom: 10 }}>
              TRAINING MODE
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: '#888' }}>
                Attacker:
                <select value={trainingAttackerModel} onChange={e => setTrainingAttackerModel(e.target.value)}
                  style={{ marginLeft: 4, background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 3, fontSize: 11 }}>
                  {MODEL_REGISTRY.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: '#888' }}>
                Archetype:
                <select value={trainingAttackerArch} onChange={e => setTrainingAttackerArch(e.target.value)}
                  style={{ marginLeft: 4, background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 3, fontSize: 11 }}>
                  {ALL_ARCHETYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: '#888' }}>
                Dummy:
                <select value={trainingDefenderModel} onChange={e => setTrainingDefenderModel(e.target.value)}
                  style={{ marginLeft: 4, background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 3, fontSize: 11 }}>
                  {MODEL_REGISTRY.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <button onClick={startTraining} disabled={loading} style={{
              padding: '10px 40px', fontSize: 16, fontWeight: 'bold',
              background: '#432', color: loading ? '#555' : '#fa8',
              border: '2px solid #f84', borderRadius: 8,
              cursor: loading ? 'wait' : 'pointer',
            }}>
              START TRAINING
            </button>
          </div>
        </div>
      )}

      {/* ============ HUD ============ */}
      {ui.team1.length > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', width: '92%', maxWidth: 900,
            padding: '8px 0', gap: 14,
          }}>
            <TeamHPBars fighters={ui.team1} side="left" teamColor="#4af" />
            <div style={{ textAlign: 'center', minWidth: 70 }}>
              <div style={{
                fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace',
                color: ui.timer <= 10 ? '#f44' : '#fff',
              }}>
                {Math.ceil(ui.timer)}
              </div>
              <div style={{ fontSize: 10, color: '#888' }}>
                {t1Alive} vs {t2Alive}
              </div>
            </div>
            <TeamHPBars fighters={ui.team2} side="right" teamColor="#f84" />
          </div>

          {ui.phase === 'intro' && (
            <div style={{
              fontSize: 48, fontWeight: 'bold', color: '#fff',
              textShadow: '0 0 20px #44f', marginTop: 80,
            }}>
              FIGHT!
            </div>
          )}
          {ui.phase === 'ko' && (
            <div style={{
              fontSize: 60, fontWeight: 'bold', color: '#f44',
              textShadow: '0 0 30px #f00', marginTop: 80,
            }}>
              K.O.!
            </div>
          )}
          {ui.phase === 'result' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              marginTop: 60,
            }}>
              <div style={{
                fontSize: 48, fontWeight: 'bold', color: '#ff4',
                textShadow: '0 0 20px #ff0',
              }}>
                {ui.winner === 'team1' ? 'TEAM 1' : ui.winner === 'team2' ? 'TEAM 2' : 'DRAW'} WINS!
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 30 }}>
                <button
                  onClick={() => {
                    engineRef.current?.requestReset();
                    setUI(prev => ({ ...prev, winner: null }));
                  }}
                  style={{
                    padding: '12px 40px', fontSize: 18, fontWeight: 'bold',
                    background: '#335', color: '#aaf', border: '2px solid #44f',
                    borderRadius: 8, cursor: 'pointer', pointerEvents: 'auto',
                  }}
                >
                  REMATCH
                </button>
                <button
                  onClick={endGame}
                  style={{
                    padding: '12px 40px', fontSize: 18, fontWeight: 'bold',
                    background: '#433', color: '#faa', border: '2px solid #f44',
                    borderRadius: 8, cursor: 'pointer', pointerEvents: 'auto',
                  }}
                >
                  END
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Link href="/" style={{
        position: 'absolute', top: 10, left: 10, fontSize: 12,
        color: '#666', textDecoration: 'none', pointerEvents: 'auto',
      }}>
        &larr; Top
      </Link>

      <button
        onClick={() => {
          const next = !soundMuted;
          setSoundMuted(next);
          engineRef.current?.setMuted(next);
        }}
        style={{
          position: 'absolute', top: 10, left: 60, fontSize: 12,
          color: soundMuted ? '#a44' : '#4a4', background: 'rgba(0,0,0,0.5)',
          border: '1px solid #333', borderRadius: 4, padding: '2px 8px',
          cursor: 'pointer',
        }}
      >
        {soundMuted ? 'SFX OFF' : 'SFX ON'}
      </button>

      {gameMode === 'battle' && (
        <>
          <button
            onClick={() => {
              const label = engineRef.current?.cycleFollowCamera() ?? null;
              setFollowLabel(label);
            }}
            style={{
              position: 'absolute', top: 10, left: 130, fontSize: 12,
              color: followLabel ? '#ff4' : '#8af', background: 'rgba(0,0,0,0.5)',
              border: `1px solid ${followLabel ? '#ff4' : '#333'}`, borderRadius: 4,
              padding: '2px 8px', cursor: 'pointer',
            }}
          >
            {followLabel ? `POV: ${followLabel}` : 'POV Camera'}
          </button>
        </>
      )}

      {/* Training panel */}
      {gameMode === 'training' && engineRef.current && (
        <TrainingPanel ui={ui} engine={engineRef.current} onExit={endGame} />
      )}

      <div style={{
        position: 'absolute', bottom: 10, right: 10,
        fontSize: 10, color: '#444', fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 4,
        textAlign: 'right',
      }}>
        <div>3v3 Team Battle (CPU vs CPU)</div>
        <div style={{ color: '#666', marginTop: 2 }}>Mouse drag=rotate, Wheel=zoom, POV=1st person</div>
      </div>

      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 14, color: '#f88', background: 'rgba(0,0,0,0.8)', padding: 20, borderRadius: 8,
        }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}
