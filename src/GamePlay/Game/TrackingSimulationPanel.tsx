'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine,
  Scene,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
} from '@babylonjs/core';
import { Camera } from '@/GamePlay/Object/Entities/Camera';
import { LIGHT_CONFIG } from '@/GamePlay/Object/Entities/Light';
import { Field } from '@/GamePlay/Object/Entities/Field';
import { Ball } from '@/GamePlay/Object/Entities/Ball';
import { PhysicsManager } from '@/GamePlay/Object/Physics/PhysicsManager';
import { TrackingSimulation3D } from './TrackingSimulation3D';

/**
 * 追跡シミュレーション スタンドアロンコンポーネント
 * GameScene を使わず、自前で Babylon.js シーンを構築する
 * フィールド + ゴール + ネットはそのまま表示、キャラクターは一切作成しない
 * Ball.ts を使用した物理ベースの弾道計算
 */
export function TrackingSimulationPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const simRef = useRef<TrackingSimulation3D | null>(null);
  const [score, setScore] = useState({ hit: 0, block: 0, miss: 0, steal: 0, goal: 0, shotMiss: 0 });
  const [teamScores, setTeamScores] = useState<[number, number]>([0, 0]);
  const [possession, setPossession] = useState<0 | 1>(0);
  const [ready, setReady] = useState(false);
  const [overlayVis, setOverlayVis] = useState<{ global: boolean; entities: boolean[]; actionGauge: boolean }>({
    global: false,
    entities: Array(10).fill(true),
    actionGauge: true,
  });
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // --- Babylon.js Engine + Scene ---
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    engineRef.current = engine;

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.05, 0.08, 0.05, 1);

    // --- Camera（GameScene と同じ設定） ---
    const camera = Camera.createGameCamera(scene, canvas);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 40;

    // --- Lights（GameScene と同じ設定） ---
    const hemisphericLight = new HemisphericLight(
      'hemispheric-light',
      new Vector3(0, 1, 0),
      scene,
    );
    hemisphericLight.intensity = LIGHT_CONFIG.ambient.intensity;

    const directionalLight = new DirectionalLight(
      'directional-light',
      new Vector3(
        LIGHT_CONFIG.directional.direction.x,
        LIGHT_CONFIG.directional.direction.y,
        LIGHT_CONFIG.directional.direction.z,
      ),
      scene,
    );
    directionalLight.intensity = LIGHT_CONFIG.directional.intensity;

    // --- Field + Goals + Nets ---
    const field = new Field(scene);

    // --- Ball（物理初期化前に作成、Havok初期化後にreinitializePhysics） ---
    const ball = new Ball(scene, new Vector3(0, 0.5, 0));
    ball.mesh.setEnabled(false);

    // --- Render loop（物理初期化前に開始） ---
    engine.runRenderLoop(() => {
      scene.render();
    });

    // --- Resize ---
    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    // --- Havok physics initialization (async) ---
    let interval: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const initPhysics = async () => {
      try {
        await PhysicsManager.getInstance().initialize(scene);
        if (disposed) return;

        // 地面・ゴールの物理ボディを初期化
        field.initializePhysics();
        // ボールの物理を再初期化（Havok有効化後）
        ball.reinitializePhysics();

        // --- Start tracking simulation ---
        const sim = new TrackingSimulation3D(scene, ball);
        sim.start();
        simRef.current = sim;

        // --- Score polling ---
        interval = setInterval(() => {
          setScore(sim.getScore());
          setTeamScores(sim.getTeamScores());
          setPossession(sim.getPossession());
        }, 200);

        setReady(true);
      } catch (error) {
        console.error('[TrackingSimulationPanel] Havok physics initialization failed:', error);
      }
    };
    initPhysics();

    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      window.removeEventListener('resize', handleResize);
      if (simRef.current) {
        simRef.current.dispose();
        simRef.current = null;
      }
      ball.dispose();
      field.dispose();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleReset = () => {
    if (simRef.current) {
      simRef.current.reset();
      setScore({ hit: 0, block: 0, miss: 0, steal: 0, goal: 0, shotMiss: 0 });
      setTeamScores([0, 0]);
      setPossession(0);
    }
  };

  const handleGlobalToggle = () => {
    const next = !overlayVis.global;
    const nextEntities = next ? Array(10).fill(true) : Array(10).fill(false);
    setOverlayVis(prev => ({ ...prev, global: next, entities: nextEntities }));
    if (simRef.current) {
      simRef.current.setGlobalOverlayVisible(next);
      for (let i = 0; i < 10; i++) {
        simRef.current.setEntityOverlayVisible(i, nextEntities[i]);
      }
    }
  };

  const handleActionGaugeToggle = () => {
    const next = !overlayVis.actionGauge;
    setOverlayVis(prev => ({ ...prev, actionGauge: next }));
    if (simRef.current) {
      simRef.current.setActionGaugeVisible(next);
    }
  };

  const handleEntityToggle = (idx: number) => {
    setOverlayVis(prev => {
      const next = { ...prev, entities: [...prev.entities] };
      next.entities[idx] = !next.entities[idx];
      if (simRef.current) {
        simRef.current.setEntityOverlayVisible(idx, next.entities[idx]);
      }
      return next;
    });
  };

  const passTotal = score.hit + score.block + score.miss;
  const passRate = passTotal > 0 ? ((score.hit / passTotal) * 100).toFixed(1) : '0.0';
  const shotTotal = score.goal + score.shotMiss;
  const shotRate = shotTotal > 0 ? ((score.goal / shotTotal) * 100).toFixed(1) : '0.0';
  const offenseSuccess = score.hit + score.goal;
  const offenseTotal = passTotal + shotTotal;
  const offenseRate = offenseTotal > 0 ? ((offenseSuccess / offenseTotal) * 100).toFixed(1) : '0.0';

  return (
    <div className="w-full h-screen relative bg-gray-900">
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />

      {/* Hamburger menu button */}
      {ready && (
        <button
          onClick={() => setPanelOpen(prev => !prev)}
          className="absolute top-4 right-4 z-50 w-10 h-10 flex flex-col items-center justify-center gap-1.5 bg-gray-800/90 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors"
          title={panelOpen ? 'パネルを閉じる' : 'パネルを開く'}
        >
          <span className={`block w-5 h-0.5 bg-gray-200 transition-transform ${panelOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-0.5 bg-gray-200 transition-opacity ${panelOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-gray-200 transition-transform ${panelOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      )}

      {/* Score panel */}
      {ready && panelOpen && (
        <div className="absolute top-16 right-4 z-40 bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700 p-4 w-64">
          <h3 className="text-sm font-bold text-gray-300 mb-2">
            追跡シミュレーション
          </h3>

          {/* Team scoreboard */}
          <div className="flex items-center justify-between bg-gray-900/80 rounded-lg p-2 mb-3">
            <div className="text-center flex-1">
              <div className={`text-xs font-bold ${possession === 0 ? 'text-yellow-300' : 'text-blue-300'}`}>
                {possession === 0 ? '攻撃' : '守備'}
              </div>
              <div className="text-blue-400 font-bold text-xs">TEAM A</div>
              <div className="text-white font-mono text-2xl font-bold">{teamScores[0]}</div>
            </div>
            <div className="text-gray-500 text-lg font-bold px-2">-</div>
            <div className="text-center flex-1">
              <div className={`text-xs font-bold ${possession === 1 ? 'text-yellow-300' : 'text-red-300'}`}>
                {possession === 1 ? '攻撃' : '守備'}
              </div>
              <div className="text-red-400 font-bold text-xs">TEAM B</div>
              <div className="text-white font-mono text-2xl font-bold">{teamScores[1]}</div>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-green-400 font-bold">GOAL</span>
              <span className="text-green-400 font-mono text-lg">{score.goal}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-orange-400 font-bold">SHOT MISS</span>
              <span className="text-orange-400 font-mono text-lg">{score.shotMiss}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-yellow-300 font-bold">HIT</span>
              <span className="text-yellow-300 font-mono text-lg">{score.hit}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-purple-400 font-bold">BLOCK</span>
              <span className="text-purple-400 font-mono text-lg">{score.block}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 font-bold">MISS</span>
              <span className="text-gray-400 font-mono text-lg">{score.miss}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-red-400 font-bold">STEAL</span>
              <span className="text-red-400 font-mono text-lg">{score.steal}</span>
            </div>
            <div className="border-t border-gray-600 pt-2 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">シュート成功率</span>
                <span className="text-white font-mono">{shotRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">パス成功率</span>
                <span className="text-white font-mono">{passRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">攻撃成功率</span>
                <span className="text-white font-mono font-bold">{offenseRate}%</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            リセット
          </button>

          {/* Overlay visibility toggles */}
          <div className="mt-4 border-t border-gray-600 pt-3">
            <h4 className="text-xs font-bold text-gray-400 mb-2">表示設定</h4>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overlayVis.global}
                onChange={handleGlobalToggle}
                className="accent-blue-500"
              />
              <span className="text-sm text-gray-200">全体表示</span>
            </label>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overlayVis.actionGauge}
                onChange={handleActionGaugeToggle}
                className="accent-cyan-500"
              />
              <span className="text-sm text-gray-200">アクションゲージ</span>
            </label>

            <div className="mb-1">
              <span className="text-xs text-blue-400 font-bold">Team A:</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {['A1', 'A2', 'A3', 'A4', 'A5'].map((name, i) => (
                  <label key={i} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overlayVis.entities[i]}
                      onChange={() => handleEntityToggle(i)}
                      className="accent-blue-400 w-3 h-3"
                    />
                    <span className="text-xs text-gray-300">{name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs text-red-400 font-bold">Team B:</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {['B1', 'B2', 'B3', 'B4', 'B5'].map((name, i) => (
                  <label key={i + 5} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overlayVis.entities[i + 5]}
                      onChange={() => handleEntityToggle(i + 5)}
                      className="accent-red-400 w-3 h-3"
                    />
                    <span className="text-xs text-gray-300">{name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
