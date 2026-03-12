'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { MODEL_REGISTRY } from '@/lib/model-registry';
import { DEFAULT_FIGHTER_STATS, STAGE_CONFIG } from '@/GamePlay/FightGame/Config/FighterConfig';
import type { AIDifficulty } from '@/GamePlay/FightGame/Core/FighterAI';
import { FightGameEngine } from '@/GamePlay/FightGame/Core/FightGameEngine';
import type { FightUIState, GameMode } from '@/GamePlay/FightGame/Core/FightGameEngine';

export default function FightPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FightGameEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('normal');
  const [ai2Difficulty, setAi2Difficulty] = useState<AIDifficulty>('normal');
  const [soundMuted, setSoundMuted] = useState(false);

  // Character selection
  const [p1ModelId, setP1ModelId] = useState(MODEL_REGISTRY[0]?.id ?? '');
  const [p2ModelId, setP2ModelId] = useState(MODEL_REGISTRY[MODEL_REGISTRY.length > 1 ? 1 : 0]?.id ?? '');

  // UI display state
  const [ui, setUI] = useState<FightUIState>({
    p1Hp: DEFAULT_FIGHTER_STATS.maxHp,
    p2Hp: DEFAULT_FIGHTER_STATS.maxHp,
    p1DelayHp: DEFAULT_FIGHTER_STATS.maxHp,
    p2DelayHp: DEFAULT_FIGHTER_STATS.maxHp,
    p1Guard: DEFAULT_FIGHTER_STATS.maxGuard,
    p2Guard: DEFAULT_FIGHTER_STATS.maxGuard,
    p1GuardBroken: false,
    p2GuardBroken: false,
    timer: STAGE_CONFIG.roundTime,
    phase: 'intro',
    roundNum: 1,
    p1Wins: 0,
    p2Wins: 0,
    p1Action: 'idle',
    p2Action: 'idle',
    matchWinner: null,
    p1ComboCount: 0,
    p1ComboDmg: 0,
    p2ComboCount: 0,
    p2ComboDmg: 0,
  });

  const handleUIUpdate = useCallback((state: FightUIState) => {
    setUI(state);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new FightGameEngine(canvas);
    engineRef.current = engine;
    engine.setUICallback(handleUIUpdate);

    const p1Model = MODEL_REGISTRY.find(m => m.id === p1ModelId) ?? MODEL_REGISTRY[0];
    const p2Model = MODEL_REGISTRY.find(m => m.id === p2ModelId) ?? MODEL_REGISTRY[MODEL_REGISTRY.length > 1 ? 1 : 0];

    engine.init(p1Model, p2Model)
      .then(() => setLoading(false))
      .catch(e => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const startGame = (mode: 'pvp' | 'cpu' | 'cpuvcpu', p2diff?: AIDifficulty, p1diff?: AIDifficulty) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.startGame(mode, p2diff ?? 'normal', p1diff ?? 'normal');
    setGameMode(mode);
    setAiDifficulty(p2diff ?? 'normal');
    setAi2Difficulty(p1diff ?? 'normal');
  };

  const maxHp = DEFAULT_FIGHTER_STATS.maxHp;
  const maxGuard = DEFAULT_FIGHTER_STATS.maxGuard;
  const p1HpPct = Math.max(0, (ui.p1Hp / maxHp) * 100);
  const p2HpPct = Math.max(0, (ui.p2Hp / maxHp) * 100);
  const p1DelayPct = Math.max(0, (ui.p1DelayHp / maxHp) * 100);
  const p2DelayPct = Math.max(0, (ui.p2DelayHp / maxHp) * 100);
  const p1GuardPct = Math.max(0, (ui.p1Guard / maxGuard) * 100);
  const p2GuardPct = Math.max(0, (ui.p2Guard / maxGuard) * 100);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a18', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

      {/* Mode selection menu */}
      {gameMode === 'menu' && !loading && !error && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)',
        }}>
          <div style={{
            fontSize: 48, fontWeight: 'bold', color: '#fff',
            textShadow: '0 0 30px #44f', marginBottom: 40,
            fontFamily: 'monospace', letterSpacing: 8,
          }}>
            VOXEL FIGHT
          </div>

          {/* Character selection */}
          {MODEL_REGISTRY.length > 1 && (
            <div style={{ display: 'flex', gap: 40, marginBottom: 30, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#4af', marginBottom: 6 }}>P1</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {MODEL_REGISTRY.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setP1ModelId(m.id)}
                      style={{
                        padding: '8px 16px', fontSize: 13,
                        background: p1ModelId === m.id ? '#246' : '#1a1a2a',
                        color: p1ModelId === m.id ? '#8cf' : '#666',
                        border: p1ModelId === m.id ? '2px solid #48f' : '1px solid #333',
                        borderRadius: 4, cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 20, color: '#555' }}>VS</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#f84', marginBottom: 6 }}>P2</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {MODEL_REGISTRY.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setP2ModelId(m.id)}
                      style={{
                        padding: '8px 16px', fontSize: 13,
                        background: p2ModelId === m.id ? '#432' : '#1a1a2a',
                        color: p2ModelId === m.id ? '#fc8' : '#666',
                        border: p2ModelId === m.id ? '2px solid #f84' : '1px solid #333',
                        borderRadius: 4, cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, marginBottom: 30, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => startGame('cpuvcpu', 'normal', 'normal')}
              style={{
                padding: '16px 36px', fontSize: 20, fontWeight: 'bold',
                background: '#342', color: '#cf8', border: '2px solid #4f4',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              CPU vs CPU
            </button>
            <button
              onClick={() => startGame('cpu', 'normal')}
              style={{
                padding: '16px 36px', fontSize: 20, fontWeight: 'bold',
                background: '#432', color: '#fc8', border: '2px solid #f84',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              VS CPU
            </button>
            <button
              onClick={() => startGame('pvp')}
              style={{
                padding: '16px 36px', fontSize: 20, fontWeight: 'bold',
                background: '#234', color: '#8cf', border: '2px solid #48f',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              VS PLAYER
            </button>
          </div>
          {/* CPU difficulty */}
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>CPU Difficulty</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {(['easy', 'normal', 'hard'] as AIDifficulty[]).map(d => (
              <button
                key={d}
                onClick={() => startGame('cpuvcpu', d, d)}
                style={{
                  padding: '8px 20px', fontSize: 14,
                  background: d === 'normal' ? '#553' : '#222',
                  color: '#ccc', border: '1px solid #555',
                  borderRadius: 4, cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 15 }}>
            Difficulty buttons start CPU vs CPU
          </div>
        </div>
      )}

      {/* HUD overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', width: '90%', maxWidth: 800,
          padding: '10px 0', gap: 12,
        }}>
          {/* P1 HP + Guard */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 12, color: '#4af', fontWeight: 'bold' }}>
              {gameMode === 'cpuvcpu' ? `CPU1 (${ai2Difficulty})` : 'P1 (JKLU)'} {ui.p1Wins > 0 && Array(ui.p1Wins).fill(null).map((_, i) => <span key={i} style={{ color: '#ff4' }}>&#9733;</span>)}
            </div>
            <div style={{
              height: 20, background: '#222', borderRadius: 4, overflow: 'hidden',
              border: '1px solid #444', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0,
                width: `${p1DelayPct}%`, height: '100%',
                background: 'rgba(255,255,255,0.3)',
              }} />
              <div style={{
                position: 'relative',
                width: `${p1HpPct}%`, height: '100%',
                background: p1HpPct > 30 ? '#4a4' : '#a44',
                transition: 'width 0.05s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>{Math.ceil(ui.p1Hp)} / {maxHp}</div>
            <div style={{
              height: 6, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden',
              border: ui.p1GuardBroken ? '1px solid #f44' : '1px solid #333',
            }}>
              <div style={{
                width: `${p1GuardPct}%`, height: '100%',
                background: ui.p1GuardBroken ? '#a33' : p1GuardPct > 30 ? '#48c' : '#c84',
                transition: 'width 0.15s',
              }} />
            </div>
            {ui.p1GuardBroken && <div style={{ fontSize: 9, color: '#f44' }}>GUARD BREAK!</div>}
          </div>

          {/* Timer + Round */}
          <div style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{
              fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace',
              color: ui.timer <= 10 ? '#f44' : '#fff',
            }}>
              {Math.ceil(ui.timer)}
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>Round {ui.roundNum}</div>
          </div>

          {/* P2 HP + Guard */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 12, color: '#f84', fontWeight: 'bold', textAlign: 'right' }}>
              {ui.p2Wins > 0 && Array(ui.p2Wins).fill(null).map((_, i) => <span key={i} style={{ color: '#ff4' }}>&#9733;</span>)} {gameMode === 'pvp' ? 'P2 (1234)' : gameMode === 'cpuvcpu' ? `CPU2 (${aiDifficulty})` : `CPU (${aiDifficulty})`}
            </div>
            <div style={{
              height: 20, background: '#222', borderRadius: 4, overflow: 'hidden',
              border: '1px solid #444', position: 'relative', direction: 'rtl',
            }}>
              <div style={{
                position: 'absolute', right: 0, top: 0,
                width: `${p2DelayPct}%`, height: '100%',
                background: 'rgba(255,255,255,0.3)',
              }} />
              <div style={{
                position: 'relative',
                width: `${p2HpPct}%`, height: '100%',
                background: p2HpPct > 30 ? '#4a4' : '#a44',
                transition: 'width 0.05s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#888', textAlign: 'right' }}>{Math.ceil(ui.p2Hp)} / {maxHp}</div>
            <div style={{
              height: 6, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden',
              border: ui.p2GuardBroken ? '1px solid #f44' : '1px solid #333', direction: 'rtl',
            }}>
              <div style={{
                width: `${p2GuardPct}%`, height: '100%',
                background: ui.p2GuardBroken ? '#a33' : p2GuardPct > 30 ? '#48c' : '#c84',
                transition: 'width 0.15s',
              }} />
            </div>
            {ui.p2GuardBroken && <div style={{ fontSize: 9, color: '#f44', textAlign: 'right' }}>GUARD BREAK!</div>}
          </div>
        </div>

        {/* Phase announcements */}
        {ui.phase === 'intro' && (
          <div style={{
            fontSize: 48, fontWeight: 'bold', color: '#fff',
            textShadow: '0 0 20px #44f', marginTop: 100,
          }}>
            Round {ui.roundNum}
          </div>
        )}
        {ui.phase === 'fight' && ui.timer >= STAGE_CONFIG.roundTime - 0.8 && (
          <div style={{
            fontSize: 56, fontWeight: 'bold', color: '#ff4',
            textShadow: '0 0 30px #fa0', marginTop: 100,
          }}>
            FIGHT!
          </div>
        )}
        {ui.phase === 'ko' && (
          <div style={{
            fontSize: 60, fontWeight: 'bold', color: '#f44',
            textShadow: '0 0 30px #f00', marginTop: 100,
          }}>
            K.O.!
          </div>
        )}
        {ui.phase === 'result' && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            marginTop: 80,
          }}>
            <div style={{
              fontSize: 48, fontWeight: 'bold', color: '#ff4',
              textShadow: '0 0 20px #ff0',
            }}>
              {ui.matchWinner === 'p1'
                ? (gameMode === 'cpuvcpu' ? 'CPU1' : 'P1')
                : (gameMode === 'pvp' ? 'P2' : 'CPU')} WINS!
            </div>
            <div style={{ fontSize: 16, color: '#aaa', marginTop: 8 }}>
              {ui.p1Wins} - {ui.p2Wins}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 30 }}>
              <button
                onClick={() => {
                  engineRef.current?.requestReset();
                  setUI(prev => ({ ...prev, matchWinner: null }));
                }}
                style={{
                  padding: '12px 40px', fontSize: 18, fontWeight: 'bold',
                  background: '#335', color: '#aaf', border: '2px solid #44f',
                  borderRadius: 8, cursor: 'pointer', pointerEvents: 'auto',
                }}
              >
                CONTINUE
              </button>
              <button
                onClick={() => {
                  engineRef.current?.returnToMenu();
                  setGameMode('menu');
                  setUI(prev => ({ ...prev, matchWinner: null, phase: 'intro' }));
                }}
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

      {/* Combo counters */}
      {ui.p1ComboCount >= 2 && (
        <div style={{
          position: 'absolute', left: 30, top: '35%',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 36, fontWeight: 'bold', color: '#ff4',
            textShadow: '0 0 15px #fa0', fontFamily: 'monospace',
          }}>
            {ui.p1ComboCount} HIT
          </div>
          <div style={{ fontSize: 14, color: '#fca', fontFamily: 'monospace' }}>
            {ui.p1ComboDmg} DMG
          </div>
        </div>
      )}
      {ui.p2ComboCount >= 2 && (
        <div style={{
          position: 'absolute', right: 30, top: '35%',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 36, fontWeight: 'bold', color: '#ff4',
            textShadow: '0 0 15px #fa0', fontFamily: 'monospace',
          }}>
            {ui.p2ComboCount} HIT
          </div>
          <div style={{ fontSize: 14, color: '#fca', fontFamily: 'monospace' }}>
            {ui.p2ComboDmg} DMG
          </div>
        </div>
      )}

      {/* Debug */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10,
        fontSize: 10, color: '#555', fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 4,
      }}>
        <div>P1: {ui.p1Action}</div>
        <div>P2: {ui.p2Action}</div>
      </div>

      <Link href="/" style={{
        position: 'absolute', top: 10, left: 10, fontSize: 12,
        color: '#666', textDecoration: 'none', pointerEvents: 'auto',
      }}>
        &larr; Top
      </Link>

      {/* Sound mute toggle */}
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

      {/* Controls */}
      <div style={{
        position: 'absolute', bottom: 10, right: 10,
        fontSize: 10, color: '#444', fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 4,
        textAlign: 'right',
      }}>
        {gameMode !== 'cpuvcpu' && <div>P1: WASD=move Space=jump F=block J=R.punch K=R.kick L=L.punch U=L.kick G=takedown H=throw</div>}
        {gameMode === 'pvp' && <div>P2: Arrows=move 0=jump 6=block 1=R.punch 2=R.kick 3=L.punch 4=L.kick 5=takedown 7=throw</div>}
        {gameMode !== 'cpuvcpu' && <div style={{ color: '#666', marginTop: 2 }}>W/Up+attack=upper S/Down+attack=lower neutral=mid</div>}
        {gameMode === 'cpuvcpu' && <div>CPU vs CPU - Watch mode</div>}
        <div style={{ color: '#666', marginTop: 2 }}>Mouse drag=rotate camera, Wheel=zoom</div>
      </div>

      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 18, color: '#88f',
        }}>
          Loading...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 14, color: '#f88',
        }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}
