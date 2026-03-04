'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
import { TrackingSimulation3D } from '@/GamePlay/Game/TrackingSimulation3D';
import { LeagueManager } from '@/SimulationPlay/Management/League/LeagueManager';
import type { MatchConfig } from '@/SimulationPlay/Management/League/Types';

const WIN_SCORE = 5;

/**
 * リーグ試合用ゲームコンポーネント
 * TrackingSimulation3Dベースで試合を実行する
 */
export function LeagueMatchGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const simRef = useRef<TrackingSimulation3D | null>(null);
  const matchConfigRef = useRef<MatchConfig | null>(null);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState({ hit: 0, block: 0, miss: 0, steal: 0, goal: 0, shotMiss: 0 });
  const [winner, setWinner] = useState<'ally' | 'enemy' | null>(null);
  const [playerNames, setPlayerNames] = useState<{ ally: string; enemy: string }>({ ally: '', enemy: '' });
  const [resultSaved, setResultSaved] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      try {
        // マッチ設定を読み込む
        const config = LeagueManager.loadMatchConfig();
        if (!config) {
          setError('試合設定が見つかりません。リーグページに戻ってください。');
          setLoading(false);
          return;
        }
        matchConfigRef.current = config;

        const leagueState = LeagueManager.loadLeagueState();
        if (!leagueState) {
          setError('リーグ状態が見つかりません。');
          setLoading(false);
          return;
        }

        const homeTeam = LeagueManager.getTeam(config.homeTeamId);
        const awayTeam = LeagueManager.getTeam(config.awayTeamId);
        if (!homeTeam || !awayTeam) {
          setError('チーム情報が見つかりません。');
          setLoading(false);
          return;
        }

        setPlayerNames({ ally: homeTeam.abbr, enemy: awayTeam.abbr });

        if (disposed) return;

        // --- Babylon.js Engine + Scene ---
        const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        engineRef.current = engine;

        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.05, 0.08, 0.05, 1);

        // --- Camera ---
        const camera = Camera.createGameCamera(scene, canvas);
        camera.lowerRadiusLimit = 5;
        camera.upperRadiusLimit = 40;

        // --- Lights ---
        const hemisphericLight = new HemisphericLight('hemispheric-light', new Vector3(0, 1, 0), scene);
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

        // --- Ball ---
        const ball = new Ball(scene, new Vector3(0, 0.5, 0));
        ball.mesh.setEnabled(false);

        // --- Render loop ---
        engine.runRenderLoop(() => scene.render());

        const handleResize = () => engine.resize();
        window.addEventListener('resize', handleResize);

        // --- Havok physics ---
        await PhysicsManager.getInstance().initialize(scene);
        if (disposed) return;

        field.initializePhysics();
        ball.reinitializePhysics();

        // --- Start tracking simulation ---
        const sim = new TrackingSimulation3D(scene, ball);
        sim.start();
        simRef.current = sim;

        // --- Score polling ---
        interval = setInterval(() => {
          if (simRef.current) {
            setScore(simRef.current.getScore());
          }
        }, 200);

        setLoading(false);

        // cleanup function captures these locals
        const cleanup = () => {
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

        // Store cleanup for the useEffect return
        cleanupRef.current = cleanup;
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '初期化に失敗しました');
          setLoading(false);
        }
      }
    };

    const cleanupRef = { current: () => { disposed = true; if (interval) clearInterval(interval); } };

    init();

    return () => {
      cleanupRef.current();
    };
  }, []);

  // 勝利判定
  useEffect(() => {
    if (winner) return;
    if (score.goal >= WIN_SCORE) {
      setWinner('ally');
    }
  }, [score, winner]);

  // リーグページに戻る（結果保存 → 遷移）
  const handleBackToLeague = useCallback(() => {
    const config = matchConfigRef.current;
    if (!config) return;

    if (winner && !resultSaved) {
      const winnerSide: 'home' | 'away' = winner === 'ally' ? 'home' : 'away';
      LeagueManager.saveMatchResult({
        matchId: config.matchId,
        homeScore: score.goal,
        awayScore: 0,
        winner: winnerSide,
      });
      LeagueManager.clearMatchConfig();
      setResultSaved(true);
    }

    router.push('/league');
  }, [winner, score, resultSaved, router]);

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button
            onClick={() => router.push('/league')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
          >
            リーグに戻る
          </button>
        </div>
      </div>
    );
  }

  const shotTotal = score.goal + score.shotMiss;
  const shotRate = shotTotal > 0 ? ((score.goal / shotTotal) * 100).toFixed(1) : '0.0';

  return (
    <div className="w-full h-screen relative bg-gray-900">
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />

      {/* スコアボード */}
      {!loading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30">
          <div className="flex items-center gap-4 bg-black/70 backdrop-blur-sm rounded-xl px-6 py-3">
            <div className="text-center min-w-[80px]">
              <p className="text-xs text-blue-300 font-bold">{playerNames.ally}</p>
              <p className="text-3xl font-black text-blue-400">{score.goal}</p>
            </div>
            <div className="text-gray-400 text-lg font-bold">vs</div>
            <div className="text-center min-w-[80px]">
              <p className="text-xs text-red-300 font-bold">{playerNames.enemy}</p>
              <p className="text-3xl font-black text-red-400">0</p>
            </div>
          </div>
          <p className="text-center text-xs text-yellow-400 font-bold mt-1 drop-shadow-lg">
            {WIN_SCORE}点先取 | シュート成功率 {shotRate}%
          </p>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700 z-50">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
            <p className="text-white text-xl font-bold">試合準備中...</p>
          </div>
        </div>
      )}

      {/* 勝利オーバーレイ */}
      {winner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="text-center">
            <div className="text-6xl font-black mb-4 text-blue-400">
              {playerNames.ally}
            </div>
            <div className="text-4xl font-bold text-yellow-400 mb-6">
              WIN!
            </div>
            <div className="text-2xl text-white mb-8">
              {score.goal} - 0
            </div>
            <button
              onClick={handleBackToLeague}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xl font-bold rounded-xl shadow-lg transition-all"
            >
              リーグに戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
