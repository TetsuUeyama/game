"use client";

import { useRef, useEffect } from "react";
import {
  MinTimeLaunch,
  type SolverConfig,
} from "@/TargetTrackingAccuracySystem";

// --- 盤面 ---
const BOARD_W = 800;
const BOARD_H = 600;
const CELL = 40;
const MARGIN = 30;

// --- オブジェクトサイズ ---
const LAUNCHER_R = 18;
const TARGET_R = 16;
const OBSTACLE_R = 14;
const BALL_R = 6;
const HIT_RADIUS = 24;
const BLOCK_RADIUS = 20;

// --- 速度 (px/s) ---
const LAUNCHER_SPEED = 60;
const TARGET_RANDOM_SPEED = 80;
const TARGET_INTERCEPT_SPEED = 180;
const OBSTACLE_SPEED = 70;
const OB_A_INTERCEPT_SPEED = 160;  // 妨害A: ボール追跡速度
const OB_B_CHASE_SPEED = 65;       // 妨害B: 発射台追跡速度
const BALL_SPEED = 250;

// --- 妨害B: 発射妨害（砲口前方の扇形エリア） ---
const OB_B_BLOCK_RANGE = 90;                    // 扇形の半径
const OB_B_BLOCK_CONE_HALF = Math.PI / 4;       // 片側45° = 合計90°の扇形
const OB_B_HOVER_RADIUS = 50;

// --- タイミング ---
const FIRE_MIN = 1.5;
const FIRE_MAX = 3.0;
const TURN_MIN = 1.0;
const TURN_MAX = 3.0;
const BALL_TIMEOUT = 6.0;

// --- 2D用ソルバー設定（gravity=0） ---
const SOLVER_CFG: SolverConfig = {
  coarseStep: 0.05,
  fineStep: 0.005,
  minTime: 0.05,
  maxTime: 10.0,
  bisectIterations: 10,
};

// --- 型 ---

interface Mover {
  x: number; y: number;
  vx: number; vy: number;
  speed: number;
  nextTurn: number;
}

interface Ball {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  age: number;
}

interface HitFx {
  x: number; y: number;
  age: number;
}

// --- ユーティリティ ---

function randAngle() { return Math.random() * Math.PI * 2; }
function randTurn() { return TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN); }
function randFire() { return FIRE_MIN + Math.random() * (FIRE_MAX - FIRE_MIN); }

function makeMover(x: number, y: number, speed: number): Mover {
  const a = randAngle();
  return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, nextTurn: randTurn() };
}

/** ランダムに方向転換しつつ移動 */
function stepMover(m: Mover, dt: number) {
  m.nextTurn -= dt;
  if (m.nextTurn <= 0) {
    const a = randAngle();
    m.vx = Math.cos(a) * m.speed;
    m.vy = Math.sin(a) * m.speed;
    m.nextTurn = randTurn();
  }
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  bounce(m);
}

/** 対象を追跡しつつ、近づいたらうろつく */
function stepChaser(m: Mover, tx: number, ty: number, chaseSpeed: number, hoverR: number, dt: number) {
  const dx = tx - m.x;
  const dy = ty - m.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > hoverR) {
    // 追跡
    m.vx = (dx / dist) * chaseSpeed;
    m.vy = (dy / dist) * chaseSpeed;
  } else {
    // 近くに来たらランダムにうろつく
    m.nextTurn -= dt;
    if (m.nextTurn <= 0) {
      const a = randAngle();
      m.vx = Math.cos(a) * chaseSpeed * 0.4;
      m.vy = Math.sin(a) * chaseSpeed * 0.4;
      m.nextTurn = 0.5 + Math.random() * 1.0;
    }
  }
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  bounce(m);
}

function bounce(m: { x: number; y: number; vx: number; vy: number }) {
  if (m.x < MARGIN) { m.x = MARGIN; m.vx = Math.abs(m.vx); }
  if (m.x > BOARD_W - MARGIN) { m.x = BOARD_W - MARGIN; m.vx = -Math.abs(m.vx); }
  if (m.y < MARGIN) { m.y = MARGIN; m.vy = Math.abs(m.vy); }
  if (m.y > BOARD_H - MARGIN) { m.y = BOARD_H - MARGIN; m.vy = -Math.abs(m.vy); }
}

function v3(bx: number, by: number) {
  return { x: bx, y: 0, z: by };
}

function dist2d(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 角度差を -π〜π に正規化 */
function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 妨害Bが発射台の前方扇形エリア内にいるか判定 */
function isInFireCone(launcher: Mover, obB: Mover, aimAngle: number): boolean {
  const d = dist2d(launcher.x, launcher.y, obB.x, obB.y);
  if (d > OB_B_BLOCK_RANGE) return false;
  const obAngle = Math.atan2(obB.y - launcher.y, obB.x - launcher.x);
  return Math.abs(angleDiff(obAngle, aimAngle)) < OB_B_BLOCK_CONE_HALF;
}

function restoreRandom(m: Mover, speed: number) {
  const a = randAngle();
  m.vx = Math.cos(a) * speed;
  m.vy = Math.sin(a) * speed;
  m.speed = speed;
  m.nextTurn = randTurn();
}

// --- 描画 ---

function drawBoard(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#1a2a1a";
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.strokeStyle = "#2a3a2a";
  ctx.lineWidth = 1;
  for (let x = 0; x <= BOARD_W; x += CELL) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BOARD_H); ctx.stroke();
  }
  for (let y = 0; y <= BOARD_H; y += CELL) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(BOARD_W, y); ctx.stroke();
  }
  ctx.strokeStyle = "#4a5a4a";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, BOARD_W - 2, BOARD_H - 2);
}

function drawLauncher(ctx: CanvasRenderingContext2D, m: Mover, aimAngle: number, suppressed: boolean) {
  // 台座
  ctx.fillStyle = suppressed ? "#3a2a2a" : "#2a4a2a";
  ctx.beginPath(); ctx.arc(m.x, m.y, LAUNCHER_R + 4, 0, Math.PI * 2); ctx.fill();
  // 本体
  ctx.fillStyle = suppressed ? "#888844" : "#44cc44";
  ctx.beginPath(); ctx.arc(m.x, m.y, LAUNCHER_R, 0, Math.PI * 2); ctx.fill();
  // 砲口
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(aimAngle);
  ctx.fillStyle = suppressed ? "#aaaa66" : "#66ee66";
  ctx.fillRect(0, -5, 26, 10);
  ctx.restore();
  // ラベル
  ctx.fillStyle = suppressed ? "#aa8866" : "#aaffaa";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(suppressed ? "発射台(妨害中)" : "発射台", m.x, m.y + LAUNCHER_R + 16);
  ctx.textAlign = "start";
}

function drawTarget(ctx: CanvasRenderingContext2D, m: Mover) {
  ctx.fillStyle = "#cc4444";
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff6666";
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R * 0.65, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff9999";
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffaaaa";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("的", m.x, m.y + TARGET_R + 16);
  ctx.textAlign = "start";
}

function drawObstacle(ctx: CanvasRenderingContext2D, m: Mover, label: string) {
  ctx.fillStyle = "#7744aa";
  ctx.beginPath(); ctx.arc(m.x, m.y, OBSTACLE_R + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9966cc";
  ctx.beginPath(); ctx.arc(m.x, m.y, OBSTACLE_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#bb99ee";
  ctx.lineWidth = 2;
  const s = 6;
  ctx.beginPath();
  ctx.moveTo(m.x - s, m.y); ctx.lineTo(m.x + s, m.y);
  ctx.moveTo(m.x, m.y - s); ctx.lineTo(m.x, m.y + s);
  ctx.stroke();
  ctx.fillStyle = "#ccaaff";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, m.x, m.y + OBSTACLE_R + 14);
  ctx.textAlign = "start";
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball, trail: { x: number; y: number }[]) {
  for (let i = 0; i < trail.length; i++) {
    const alpha = (i / trail.length) * 0.5;
    ctx.fillStyle = `rgba(255,200,50,${alpha})`;
    ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, BALL_R * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "rgba(255,220,80,0.25)";
  ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R * 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffcc33";
  ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
}

function drawFx(ctx: CanvasRenderingContext2D, fx: HitFx, r: number, g: number, b: number) {
  const p = fx.age / 0.6;
  if (p > 1) return;
  const alpha = 1 - p;
  ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(fx.x, fx.y, 20 + p * 30, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.5})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(fx.x, fx.y, 10 + p * 50, 0, Math.PI * 2); ctx.stroke();
}

function drawIntercept(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = "rgba(255,100,100,0.35)";
  ctx.lineWidth = 1.5;
  const sz = 8;
  ctx.beginPath();
  ctx.moveTo(x - sz, y - sz); ctx.lineTo(x + sz, y + sz);
  ctx.moveTo(x + sz, y - sz); ctx.lineTo(x - sz, y + sz);
  ctx.stroke();
}

// 発射台前方の妨害判定エリア（扇形）を可視化
function drawFireCone(ctx: CanvasRenderingContext2D, launcher: Mover, aimAngle: number, suppressed: boolean) {
  ctx.fillStyle = suppressed ? "rgba(153,102,204,0.15)" : "rgba(100,200,100,0.06)";
  ctx.beginPath();
  ctx.moveTo(launcher.x, launcher.y);
  ctx.arc(launcher.x, launcher.y, OB_B_BLOCK_RANGE, aimAngle - OB_B_BLOCK_CONE_HALF, aimAngle + OB_B_BLOCK_CONE_HALF);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = suppressed ? "rgba(153,102,204,0.3)" : "rgba(100,200,100,0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// --- メインコンポーネント ---

export default function TrackingTestPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    launcher: makeMover(80, BOARD_H / 2, LAUNCHER_SPEED),
    target: makeMover(600, 200, TARGET_RANDOM_SPEED),
    obA: makeMover(400, 150, OBSTACLE_SPEED),   // 妨害A: ボール追跡
    obB: makeMover(200, 350, OB_B_CHASE_SPEED),  // 妨害B: 発射台張り付き
    ball: { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0 } as Ball,
    trail: [] as { x: number; y: number }[],
    cooldown: 2.0,
    hitFx: null as HitFx | null,
    blockFx: null as HitFx | null,
    interceptPt: null as { x: number; y: number } | null,
    score: { hit: 0, miss: 0, block: 0 },
    prevTs: 0,
  });
  const animIdRef = useRef(0);

  useEffect(() => {
    const loop = (ts: number) => {
      const s = stateRef.current;
      if (s.prevTs === 0) s.prevTs = ts;
      const dt = Math.min((ts - s.prevTs) / 1000, 0.1);
      s.prevTs = ts;

      const { launcher, target, ball, obA, obB } = s;

      // 発射台: 常にランダム移動
      stepMover(launcher, dt);

      // 妨害B: 常に発射台を追跡
      stepChaser(obB, launcher.x, launcher.y, OB_B_CHASE_SPEED, OB_B_HOVER_RADIUS, dt);

      // 砲口の向き（的を追尾）
      const aimAngle = Math.atan2(target.y - launcher.y, target.x - launcher.x);

      // 妨害Bが発射台の前方エリアにいるか判定
      const obBnear = isInFireCone(launcher, obB, aimAngle);

      if (!ball.active) {
        // === 的: ランダム移動 ===
        stepMover(target, dt);

        // === 妨害A: ランダム移動（ボールなし時） ===
        stepMover(obA, dt);

        // === 発射クールダウン ===
        s.cooldown -= dt;
        if (s.cooldown <= 0) {
          if (obBnear) {
            // 妨害Bが近い → 発射見送り、少し待って再判定
            s.cooldown = 0.3;
          } else {
            // 発射台 → 的へ迎撃解を計算
            const sol = MinTimeLaunch.solve(
              {
                launchPos: v3(launcher.x, launcher.y),
                target: { position: v3(target.x, target.y), velocity: v3(target.vx, target.vy) },
                maxSpeed: BALL_SPEED,
                gravity: 0,
                damping: 0,
              },
              SOLVER_CFG,
            );

            // 迎撃点が盤内か判定
            const ipInBoard = sol?.valid
              && sol.interceptPos.x >= MARGIN && sol.interceptPos.x <= BOARD_W - MARGIN
              && sol.interceptPos.z >= MARGIN && sol.interceptPos.z <= BOARD_H - MARGIN;

            if (sol?.valid && ipInBoard) {
              // ボール発射
              ball.active = true;
              ball.x = launcher.x;
              ball.y = launcher.y;
              ball.vx = sol.launchVelocity.x;
              ball.vy = sol.launchVelocity.z;
              ball.age = 0;
              s.trail = [];
              s.interceptPt = { x: sol.interceptPos.x, y: sol.interceptPos.z };

              // 的: 発射目的位置（迎撃点）へ向かう or その場で待つ
              const ipx = sol.interceptPos.x;
              const ipy = sol.interceptPos.z;
              const tdx = ipx - target.x;
              const tdy = ipy - target.y;
              const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
              if (tdist < 5) {
                target.vx = 0;
                target.vy = 0;
              } else {
                target.vx = (tdx / tdist) * TARGET_INTERCEPT_SPEED;
                target.vy = (tdy / tdist) * TARGET_INTERCEPT_SPEED;
              }

              // 妨害A: 発射されたボールを追跡（迎撃計算）
              const aSol = MinTimeLaunch.solve(
                {
                  launchPos: v3(obA.x, obA.y),
                  target: { position: v3(ball.x, ball.y), velocity: v3(ball.vx, ball.vy) },
                  maxSpeed: OB_A_INTERCEPT_SPEED,
                  gravity: 0,
                  damping: 0,
                },
                SOLVER_CFG,
              );
              if (aSol?.valid) {
                obA.vx = aSol.launchVelocity.x;
                obA.vy = aSol.launchVelocity.z;
              } else {
                // フォールバック: ボールへ直進
                const adx = ball.x - obA.x;
                const ady = ball.y - obA.y;
                const ad = Math.sqrt(adx * adx + ady * ady) || 1;
                obA.vx = (adx / ad) * OB_A_INTERCEPT_SPEED;
                obA.vy = (ady / ad) * OB_A_INTERCEPT_SPEED;
              }
              s.cooldown = randFire();
            } else {
              // 解なし or 迎撃点が盤外 → 短く待って再判定
              s.cooldown = 0.3;
            }
          }
        }
      } else {
        // === ボール飛行中 ===
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.age += dt;

        // 的: 迎撃点へ向かい、到着したら停止して待つ
        if (s.interceptPt) {
          const idx = s.interceptPt.x - target.x;
          const idy = s.interceptPt.y - target.y;
          const idist = Math.sqrt(idx * idx + idy * idy);
          if (idist > 5) {
            target.x += target.vx * dt;
            target.y += target.vy * dt;
            bounce(target);
          } else {
            target.vx = 0;
            target.vy = 0;
          }
        }

        // 妨害A: ボール追跡中（直進）
        obA.x += obA.vx * dt;
        obA.y += obA.vy * dt;
        bounce(obA);

        // 軌跡
        s.trail.push({ x: ball.x, y: ball.y });
        if (s.trail.length > 25) s.trail.shift();

        // 妨害A・Bとの衝突判定（BLOCK）
        const obstacles = [obA, obB];
        for (const ob of obstacles) {
          const odx = ball.x - ob.x;
          const ody = ball.y - ob.y;
          if (Math.sqrt(odx * odx + ody * ody) < BLOCK_RADIUS) {
            ball.active = false;
            s.blockFx = { x: ob.x, y: ob.y, age: 0 };
            s.score.block++;
            s.cooldown = 1.0;
            s.interceptPt = null;
            restoreRandom(target, TARGET_RANDOM_SPEED);
            restoreRandom(obA, OBSTACLE_SPEED);
            break;
          }
        }

        // 命中判定
        const dx = ball.x - target.x;
        const dy = ball.y - target.y;
        if (ball.active && Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) {
          ball.active = false;
          s.hitFx = { x: (ball.x + target.x) / 2, y: (ball.y + target.y) / 2, age: 0 };
          s.score.hit++;
          s.cooldown = 1.5;
          s.interceptPt = null;
          restoreRandom(target, TARGET_RANDOM_SPEED);
          restoreRandom(obA, OBSTACLE_SPEED);
        }

        // MISS: 盤面外 or タイムアウト
        if (ball.active) {
          const out = ball.x < -30 || ball.x > BOARD_W + 30 || ball.y < -30 || ball.y > BOARD_H + 30;
          if (out || ball.age > BALL_TIMEOUT) {
            ball.active = false;
            s.score.miss++;
            s.cooldown = 1.0;
            s.interceptPt = null;
            restoreRandom(target, TARGET_RANDOM_SPEED);
            restoreRandom(obA, OBSTACLE_SPEED);
          }
        }
      }

      // エフェクト更新
      if (s.hitFx) {
        s.hitFx.age += dt;
        if (s.hitFx.age > 0.6) s.hitFx = null;
      }
      if (s.blockFx) {
        s.blockFx.age += dt;
        if (s.blockFx.age > 0.6) s.blockFx = null;
      }

      // === 描画 ===
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawBoard(ctx);

        // 迎撃予測点
        if (s.interceptPt) drawIntercept(ctx, s.interceptPt.x, s.interceptPt.y);

        // 発射台前方の扇形エリア
        drawFireCone(ctx, launcher, aimAngle, obBnear);

        // お邪魔キャラ
        drawObstacle(ctx, obA, "妨害A");
        drawObstacle(ctx, obB, "妨害B");

        drawLauncher(ctx, launcher, aimAngle, obBnear);
        drawTarget(ctx, target);

        if (ball.active) drawBall(ctx, ball, s.trail);
        if (s.hitFx) drawFx(ctx, s.hitFx, 255, 255, 100);
        if (s.blockFx) drawFx(ctx, s.blockFx, 153, 102, 204);

        // スコア
        ctx.fillStyle = "#ccc";
        ctx.font = "14px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`HIT: ${s.score.hit}  BLOCK: ${s.score.block}  MISS: ${s.score.miss}`, BOARD_W - 12, 22);
        ctx.textAlign = "start";
      }

      animIdRef.current = requestAnimationFrame(loop);
    };

    animIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animIdRef.current);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-2">ボール迎撃シミュレーター</h1>
      <p className="text-gray-400 text-sm mb-4">
        発射台（緑）→ 的（赤）へ発射 | 妨害A（紫）= ボール横取り | 妨害B（紫）= 発射台に張り付き妨害
      </p>
      <canvas
        ref={canvasRef}
        width={BOARD_W}
        height={BOARD_H}
        className="border border-gray-700 rounded"
      />
    </div>
  );
}
