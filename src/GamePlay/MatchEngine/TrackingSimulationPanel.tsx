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
import { TrackingSimulation3D } from './TrackingSimulation/TrackingSimulation3D';

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
  const [score, setScore] = useState({ hit: 0, block: 0, miss: 0, steal: 0 });
  const [ready, setReady] = useState(false);

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
      setScore({ hit: 0, block: 0, miss: 0, steal: 0 });
    }
  };

  const total = score.hit + score.block + score.miss;
  const hitRate = total > 0 ? ((score.hit / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="w-full h-screen relative bg-gray-900">
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />

      {/* Score panel */}
      {ready && (
        <div className="absolute top-4 right-4 z-40 bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700 p-4 w-64">
          <h3 className="text-sm font-bold text-gray-300 mb-3">
            追跡シミュレーション
          </h3>

          <div className="space-y-2 mb-4">
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
            <div className="border-t border-gray-600 pt-2 flex justify-between items-center">
              <span className="text-gray-300 text-sm">命中率</span>
              <span className="text-white font-mono">{hitRate}%</span>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            リセット
          </button>
        </div>
      )}
    </div>
  );
}
