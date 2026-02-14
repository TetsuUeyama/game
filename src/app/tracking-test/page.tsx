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
const PHYSICAL_MARGIN = 35; // 軌道が妨害に物理的に近すぎる場合のマージン

// --- 速度 (px/s) ---
const LAUNCHER_SPEED = 60;
const TARGET_RANDOM_SPEED = 80;
const TARGET_INTERCEPT_SPEED = 180;
const OB_A_IDLE_SPEED = 70;
const OB_A_INTERCEPT_SPEED = 160;
const OB_B_CHASE_SPEED = 65;
const OB_C_IDLE_SPEED = 70;
const OB_C_INTERCEPT_SPEED = 150;
const BALL_SPEED = 250;

// --- ホバー半径 ---
const OB_A_HOVER_RADIUS = 60;
const OB_B_HOVER_RADIUS = 50;
const OB_C_HOVER_RADIUS = 50;

// --- 向き・視野 ---
const TURN_RATE = 4.0; // rad/s
const OB_FOV_HALF_NEAR = Math.PI / 6; // 近距離の視野半角 = 30° → 合計60°
const OB_FOV_HALF_FAR = Math.PI / 18; // 遠距離の視野半角 = 10° → 合計20°
const FOV_NARROW_DIST = 500; // この距離で最小角度に達する (px)
const FOV_FULL_LEN = Math.sqrt(BOARD_W * BOARD_W + BOARD_H * BOARD_H); // 検出: フィールド全域
const FOV_WINDOW_LEN = 220; // 視覚ウィンドウの長さ (px)
const FOV_FOCUS_SPEED = 400; // フォーカス距離の移動速度 (px/s)
const SEARCH_SWEEP_SPEED = 1.5; // 捜索時のスイープ速度 (rad/s)
const SEARCH_SWEEP_MAX = Math.PI / 3; // 捜索スイープ最大角度 ±60°

// --- タイミング ---
const FIRE_MIN = 1.5;
const FIRE_MAX = 3.0;
const TURN_MIN = 1.0;
const TURN_MAX = 3.0;
const BALL_TIMEOUT = 6.0;

// --- 2D用ソルバー設定 ---
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
  facing: number;
  nextTurn: number;
}

interface Ball {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  age: number;
}

interface HitFx { x: number; y: number; age: number; }

/** 妨害の記憶: 的・発射台の最後に見た位置 + 捜索状態 */
interface ScanMemory {
  lastSeenLauncherX: number;
  lastSeenLauncherY: number;
  lastSeenTargetX: number;
  lastSeenTargetY: number;
  searching: boolean;       // 捜索中か
  searchSweep: number;      // 現在のスイープ角度オフセット
  searchDir: 1 | -1;        // スイープ方向
}

interface PreFireInfo {
  estFlightTime: number;
  estIPx: number;
  estIPy: number;
  obAReach: number;
  obBReach: number;
  obCReach: number;
  obAInFOV: boolean;
  obBInFOV: boolean;
  obCInFOV: boolean;
  obABlocks: boolean;
  obBBlocks: boolean;
  obCBlocks: boolean;
  targetReach: number;
  targetCanReach: boolean;
  blocked: boolean;
}

// --- ユーティリティ ---

function randAngle() { return Math.random() * Math.PI * 2; }
function randTurn() { return TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN); }
function randFire() { return FIRE_MIN + Math.random() * (FIRE_MAX - FIRE_MIN); }

/** 角度差を[-π, π]に正規化 */
function normAngleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 距離に応じた視野半角（近いほど広く、遠いほど狭い） */
function fovHalfAtDist(dist: number): number {
  const t = Math.min(dist / FOV_NARROW_DIST, 1);
  return OB_FOV_HALF_NEAR + (OB_FOV_HALF_FAR - OB_FOV_HALF_NEAR) * t;
}

/**
 * facing から moveAngle 方向への移動速度倍率
 * 前方(0°)=1.0, 左右(90°)=0.7, 後方(180°)=0.5
 */
function dirSpeedMult(facing: number, moveAngle: number): number {
  const cosA = Math.cos(normAngleDiff(facing, moveAngle));
  return cosA >= 0 ? 0.7 + 0.3 * cosA : 0.7 + 0.2 * cosA;
}

/** facing を target 方向に最大 maxDelta だけ回転 */
function turnToward(current: number, target: number, maxDelta: number): number {
  const diff = normAngleDiff(current, target);
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function makeMover(x: number, y: number, speed: number): Mover {
  const a = randAngle();
  return {
    x, y,
    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    speed, facing: a, nextTurn: randTurn(),
  };
}

/** 向きを考慮して移動（facingも移動方向へ回転） */
function moveWithFacing(m: Mover, baseSpeed: number, dt: number) {
  const len = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
  if (len < 0.01) return;
  const moveAngle = Math.atan2(m.vy, m.vx);
  m.facing = turnToward(m.facing, moveAngle, TURN_RATE * dt);
  const mult = dirSpeedMult(m.facing, moveAngle);
  const effSpeed = baseSpeed * mult;
  m.x += (m.vx / len) * effSpeed * dt;
  m.y += (m.vy / len) * effSpeed * dt;
  bounce(m);
}

/** 向きを変えずに移動（facingは外部で制御） */
function moveKeepFacing(m: Mover, baseSpeed: number, dt: number) {
  const len = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
  if (len < 0.01) return;
  const moveAngle = Math.atan2(m.vy, m.vx);
  const mult = dirSpeedMult(m.facing, moveAngle);
  const effSpeed = baseSpeed * mult;
  m.x += (m.vx / len) * effSpeed * dt;
  m.y += (m.vy / len) * effSpeed * dt;
  bounce(m);
}

/** 追跡/ホバーの速度だけ設定（移動は別途） */
function setChaserVelocity(m: Mover, tx: number, ty: number, chaseSpeed: number, hoverR: number, dt: number) {
  const dx = tx - m.x;
  const dy = ty - m.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > hoverR) {
    m.vx = (dx / d) * chaseSpeed;
    m.vy = (dy / d) * chaseSpeed;
  } else {
    m.nextTurn -= dt;
    if (m.nextTurn <= 0) {
      const a = randAngle();
      m.vx = Math.cos(a) * chaseSpeed * 0.4;
      m.vy = Math.sin(a) * chaseSpeed * 0.4;
      m.nextTurn = 0.5 + Math.random() * 1.0;
    }
  }
}

function stepMover(m: Mover, dt: number) {
  m.nextTurn -= dt;
  if (m.nextTurn <= 0) {
    const a = randAngle();
    m.vx = Math.cos(a) * m.speed;
    m.vy = Math.sin(a) * m.speed;
    m.nextTurn = randTurn();
  }
  moveWithFacing(m, m.speed, dt);
}


function bounce(m: { x: number; y: number; vx: number; vy: number }) {
  if (m.x < MARGIN) { m.x = MARGIN; m.vx = Math.abs(m.vx); }
  if (m.x > BOARD_W - MARGIN) { m.x = BOARD_W - MARGIN; m.vx = -Math.abs(m.vx); }
  if (m.y < MARGIN) { m.y = MARGIN; m.vy = Math.abs(m.vy); }
  if (m.y > BOARD_H - MARGIN) { m.y = BOARD_H - MARGIN; m.vy = -Math.abs(m.vy); }
}

function v3(bx: number, by: number) { return { x: bx, y: 0, z: by }; }

function dist2d(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx; const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 線分上の最近点 */
function segClosestPoint(
  x1: number, y1: number, x2: number, y2: number, px: number, py: number,
): { cx: number; cy: number } {
  const dx = x2 - x1; const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return { cx: x1, cy: y1 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return { cx: x1 + t * dx, cy: y1 + t * dy };
}

/** 軌道が障害物に物理的に近すぎるか（FOV関係なく衝突リスク） */
function isPhysicallyClose(
  ob: Mover, x1: number, y1: number, x2: number, y2: number,
): boolean {
  const { cx, cy } = segClosestPoint(x1, y1, x2, y2, ob.x, ob.y);
  return dist2d(cx, cy, ob.x, ob.y) < PHYSICAL_MARGIN;
}

/** 特定のポイントが障害物の視野角(FOV)内にあるか判定 */
function isPointInFOV(m: Mover, px: number, py: number): boolean {
  const d = dist2d(m.x, m.y, px, py);
  const fovHalf = fovHalfAtDist(d);
  const angle = Math.atan2(py - m.y, px - m.x);
  return Math.abs(normAngleDiff(m.facing, angle)) <= fovHalf;
}

/** 軌道が障害物の視野角(FOV)内を通るか判定（距離で角度が狭まる） */
function isTrajectoryInFOV(
  m: Mover,
  x1: number, y1: number, x2: number, y2: number,
): boolean {
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    const d = dist2d(m.x, m.y, px, py);
    const fovHalf = fovHalfAtDist(d);
    const angle = Math.atan2(py - m.y, px - m.x);
    if (Math.abs(normAngleDiff(m.facing, angle)) <= fovHalf) return true;
  }
  return false;
}

/** 障害物が向きを考慮した到達圏で軌道をブロックできるか */
function canReachTrajectory(
  m: Mover, x1: number, y1: number, x2: number, y2: number, baseReach: number,
): boolean {
  const { cx, cy } = segClosestPoint(x1, y1, x2, y2, m.x, m.y);
  const angle = Math.atan2(cy - m.y, cx - m.x);
  const reach = baseReach * dirSpeedMult(m.facing, angle);
  return dist2d(m.x, m.y, cx, cy) < reach;
}

/** 的が向きを考慮して迎撃点に到達できるか */
function canTargetReach(m: Mover, ipx: number, ipy: number, baseReach: number): boolean {
  const angle = Math.atan2(ipy - m.y, ipx - m.x);
  const reach = baseReach * dirSpeedMult(m.facing, angle);
  return dist2d(m.x, m.y, ipx, ipy) <= reach;
}

/** 障害物がボール軌道を妨害できるかソルバーで判定（向き考慮） */
function canObIntercept(
  ob: Mover, ballStartX: number, ballStartY: number,
  ballVx: number, ballVy: number, obMaxSpeed: number, maxTime: number,
): boolean {
  const angleToBall = Math.atan2(ballStartY - ob.y, ballStartX - ob.x);
  const effMaxSpeed = obMaxSpeed * dirSpeedMult(ob.facing, angleToBall);
  const sol = MinTimeLaunch.solve(
    {
      launchPos: v3(ob.x, ob.y),
      target: { position: v3(ballStartX, ballStartY), velocity: v3(ballVx, ballVy) },
      maxSpeed: effMaxSpeed,
      gravity: 0,
      damping: 0,
    },
    { ...SOLVER_CFG, maxTime },
  );
  return sol !== null && sol.valid;
}

/** フィールド上のオープンスペースを探索 */
function findOpenSpace(
  launcherRef: Mover, obstacles: Mover[],
): { x: number; y: number } {
  let bestX = BOARD_W / 2;
  let bestY = BOARD_H / 2;
  let bestScore = -Infinity;

  for (let i = 0; i < 30; i++) {
    const px = MARGIN + Math.random() * (BOARD_W - 2 * MARGIN);
    const py = MARGIN + Math.random() * (BOARD_H - 2 * MARGIN);
    let score = 0;

    // 障害物からの距離（近い障害物ほど減点、遠いほど加点）
    let minObDist = Infinity;
    for (const ob of obstacles) {
      const d = dist2d(px, py, ob.x, ob.y);
      minObDist = Math.min(minObDist, d);
      score += Math.min(d, 250);
    }
    score += minObDist * 2;

    // 障害物のFOV外なら加点（距離依存の角度で判定）
    for (const ob of obstacles) {
      const d = dist2d(px, py, ob.x, ob.y);
      const fovHalf = fovHalfAtDist(d);
      const angle = Math.atan2(py - ob.y, px - ob.x);
      if (Math.abs(normAngleDiff(ob.facing, angle)) > fovHalf) {
        score += 100;
      }
    }

    // 発射台からのパスが物理的にブロックされないなら加点
    let pathClear = true;
    for (const ob of obstacles) {
      if (isPhysicallyClose(ob, launcherRef.x, launcherRef.y, px, py)) {
        pathClear = false;
        break;
      }
    }
    if (pathClear) score += 150;

    // 発射台から近すぎない
    const ld = dist2d(px, py, launcherRef.x, launcherRef.y);
    if (ld > 150) score += 50;

    if (score > bestScore) {
      bestScore = score;
      bestX = px;
      bestY = py;
    }
  }
  return { x: bestX, y: bestY };
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

/** 向きインジケーター（三角矢印） */
function drawFacing(ctx: CanvasRenderingContext2D, m: Mover, r: number, color: string) {
  const tipLen = r + 10;
  const tx = m.x + Math.cos(m.facing) * tipLen;
  const ty = m.y + Math.sin(m.facing) * tipLen;
  const wingAngle = Math.PI * 0.85;
  const wingLen = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + Math.cos(m.facing + wingAngle) * wingLen, ty + Math.sin(m.facing + wingAngle) * wingLen);
  ctx.lineTo(tx + Math.cos(m.facing - wingAngle) * wingLen, ty + Math.sin(m.facing - wingAngle) * wingLen);
  ctx.closePath();
  ctx.fill();
}

function drawLauncher(ctx: CanvasRenderingContext2D, m: Mover, aimAngle: number, suppressed: boolean) {
  ctx.fillStyle = suppressed ? "#3a2a2a" : "#2a4a2a";
  ctx.beginPath(); ctx.arc(m.x, m.y, LAUNCHER_R + 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = suppressed ? "#888844" : "#44cc44";
  ctx.beginPath(); ctx.arc(m.x, m.y, LAUNCHER_R, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(aimAngle);
  ctx.fillStyle = suppressed ? "#aaaa66" : "#66ee66";
  ctx.fillRect(0, -5, 26, 10);
  ctx.restore();
  drawFacing(ctx, m, LAUNCHER_R, suppressed ? "#aaaa66" : "#88dd88");
  ctx.fillStyle = suppressed ? "#aa8866" : "#aaffaa";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(suppressed ? "発射台(様子見)" : "発射台", m.x, m.y + LAUNCHER_R + 16);
  ctx.textAlign = "start";
}

function drawTarget(ctx: CanvasRenderingContext2D, m: Mover) {
  ctx.fillStyle = "#cc4444";
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff6666";
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R * 0.65, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff9999";
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R * 0.3, 0, Math.PI * 2); ctx.fill();
  drawFacing(ctx, m, TARGET_R, "#ff9999");
  ctx.fillStyle = "#ffaaaa";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("的", m.x, m.y + TARGET_R + 16);
  ctx.textAlign = "start";
}

/** 距離dでのFOVエッジ角度（facing ± fovHalfAtDist(d)） */
function fovEdgeAngle(facing: number, dist: number, side: -1 | 1): number {
  return facing + side * fovHalfAtDist(dist);
}

/** 視野コーン（FOV）をスライディングウィンドウ方式で描画（距離で角度が狭まる） */
function drawFOV(
  ctx: CanvasRenderingContext2D, m: Mover,
  focusDist: number, windowLen: number, inFOV: boolean,
) {
  const innerR = Math.max(OBSTACLE_R + 5, focusDist - windowLen / 2);
  const outerR = focusDist + windowLen / 2;
  const edgeSteps = 40;

  // 全長の薄いエッジライン（湾曲: 距離で角度が狭まる）
  ctx.strokeStyle = "rgba(153,102,204,0.06)";
  ctx.lineWidth = 1;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    for (let i = 1; i <= edgeSteps; i++) {
      const d = (i / edgeSteps) * FOV_FULL_LEN;
      const a = fovEdgeAngle(m.facing, d, side);
      ctx.lineTo(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d);
    }
    ctx.stroke();
  }

  // フォーカスウィンドウ（環状扇形・距離依存角度）
  ctx.fillStyle = inFOV ? "rgba(255,200,100,0.10)" : "rgba(153,102,204,0.05)";
  const windowSteps = 24;
  ctx.beginPath();
  // 外弧: +side → -side
  for (let i = 0; i <= windowSteps; i++) {
    const frac = i / windowSteps;
    const a = fovEdgeAngle(m.facing, outerR, 1) * (1 - frac) + fovEdgeAngle(m.facing, outerR, -1) * frac;
    const px = m.x + Math.cos(a) * outerR;
    const py = m.y + Math.sin(a) * outerR;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  // 内弧: -side → +side
  for (let i = 0; i <= windowSteps; i++) {
    const frac = i / windowSteps;
    const a = fovEdgeAngle(m.facing, innerR, -1) * (1 - frac) + fovEdgeAngle(m.facing, innerR, 1) * frac;
    ctx.lineTo(m.x + Math.cos(a) * innerR, m.y + Math.sin(a) * innerR);
  }
  ctx.closePath();
  ctx.fill();

  // ウィンドウのエッジ（湾曲ライン）
  ctx.strokeStyle = inFOV ? "rgba(255,200,100,0.30)" : "rgba(153,102,204,0.15)";
  ctx.lineWidth = 1;
  const sideSteps = 12;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    for (let i = 0; i <= sideSteps; i++) {
      const d = innerR + (outerR - innerR) * (i / sideSteps);
      const a = fovEdgeAngle(m.facing, d, side);
      const px = m.x + Math.cos(a) * d;
      const py = m.y + Math.sin(a) * d;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // 外弧・内弧（点線）
  ctx.setLineDash([3, 3]);
  for (const r of [outerR, innerR]) {
    ctx.beginPath();
    for (let i = 0; i <= windowSteps; i++) {
      const frac = i / windowSteps;
      const a = fovEdgeAngle(m.facing, r, -1) * (1 - frac) + fovEdgeAngle(m.facing, r, 1) * frac;
      const px = m.x + Math.cos(a) * r;
      const py = m.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawObstacle(ctx: CanvasRenderingContext2D, m: Mover, label: string) {
  ctx.fillStyle = "#7744aa";
  ctx.beginPath(); ctx.arc(m.x, m.y, OBSTACLE_R + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9966cc";
  ctx.beginPath(); ctx.arc(m.x, m.y, OBSTACLE_R, 0, Math.PI * 2); ctx.fill();
  drawFacing(ctx, m, OBSTACLE_R, "#cc99ff");
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

/** 向きを考慮した到達圏（卵型）を描画 */
function drawDirectionalReach(
  ctx: CanvasRenderingContext2D, m: Mover, baseRadius: number,
  fillNormal: string, strokeNormal: string,
  fillAlert: string, strokeAlert: string,
  alert: boolean,
) {
  const segments = 48;
  const fc = alert ? fillAlert : fillNormal;
  const sc = alert ? strokeAlert : strokeNormal;

  ctx.fillStyle = fc;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const r = baseRadius * dirSpeedMult(m.facing, angle);
    const px = m.x + Math.cos(angle) * r;
    const py = m.y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = sc;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const r = baseRadius * dirSpeedMult(m.facing, angle);
    const px = m.x + Math.cos(angle) * r;
    const py = m.y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawReachCircle(ctx: CanvasRenderingContext2D, m: Mover, baseRadius: number, blocks: boolean) {
  drawDirectionalReach(ctx, m, baseRadius,
    "rgba(153,102,204,0.05)", "rgba(153,102,204,0.15)",
    "rgba(200,80,80,0.08)", "rgba(255,80,80,0.35)",
    blocks);
}

function drawTargetReach(ctx: CanvasRenderingContext2D, m: Mover, baseRadius: number, canReach: boolean) {
  drawDirectionalReach(ctx, m, baseRadius,
    "rgba(100,200,255,0.05)", "rgba(100,200,255,0.25)",
    "rgba(255,80,80,0.08)", "rgba(255,80,80,0.35)",
    !canReach);
}

/** 捜索中の記憶位置マーカー（「?」+ 点線円） */
function drawSearchMarker(
  ctx: CanvasRenderingContext2D, x: number, y: number, label: string,
) {
  ctx.strokeStyle = "rgba(255,200,100,0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,200,100,0.6)";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("?", x, y + 4);
  ctx.font = "9px sans-serif";
  ctx.fillText(label, x, y + 22);
  ctx.textAlign = "start";
}

function drawTrajectoryLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number, blocked: boolean,
) {
  ctx.strokeStyle = blocked ? "rgba(255,80,80,0.3)" : "rgba(100,255,100,0.2)";
  ctx.lineWidth = blocked ? 2 : 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}

// --- メインコンポーネント ---

export default function TrackingTestPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    launcher: makeMover(80, BOARD_H / 2, LAUNCHER_SPEED),
    target: makeMover(600, 200, TARGET_RANDOM_SPEED),
    obA: makeMover(350, 300, OB_A_IDLE_SPEED),
    obB: makeMover(200, 350, OB_B_CHASE_SPEED),
    obC: makeMover(550, 250, OB_C_IDLE_SPEED),
    ball: { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0 } as Ball,
    trail: [] as { x: number; y: number }[],
    cooldown: 2.0,
    hitFx: null as HitFx | null,
    blockFx: null as HitFx | null,
    interceptPt: null as { x: number; y: number } | null,
    preFire: null as PreFireInfo | null,
    obAReacting: false,
    obCReacting: false,
    obAScanTimer: 2.0,
    obAScanAtLauncher: true,
    obBScanTimer: 1.5,
    obBScanAtLauncher: true,
    obCScanTimer: 1.0,
    obCScanAtLauncher: false,
    targetDest: null as { x: number; y: number } | null,
    targetReevalTimer: 0.5,
    obAFocusDist: 300,
    obBFocusDist: 150,
    obCFocusDist: 200,
    obAMem: {
      lastSeenLauncherX: 80, lastSeenLauncherY: BOARD_H / 2,
      lastSeenTargetX: 600, lastSeenTargetY: 200,
      searching: false, searchSweep: 0, searchDir: 1,
    } as ScanMemory,
    obBMem: {
      lastSeenLauncherX: 80, lastSeenLauncherY: BOARD_H / 2,
      lastSeenTargetX: 600, lastSeenTargetY: 200,
      searching: false, searchSweep: 0, searchDir: 1,
    } as ScanMemory,
    obCMem: {
      lastSeenLauncherX: 80, lastSeenLauncherY: BOARD_H / 2,
      lastSeenTargetX: 600, lastSeenTargetY: 200,
      searching: false, searchSweep: 0, searchDir: 1,
    } as ScanMemory,
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

      const { launcher, target, ball, obA, obB, obC } = s;

      // 発射台: 常にランダム移動
      stepMover(launcher, dt);
      // 妨害B: 捜索中でなければ発射台を追跡
      if (!s.obBMem.searching) {
        setChaserVelocity(obB, launcher.x, launcher.y, OB_B_CHASE_SPEED, OB_B_HOVER_RADIUS, dt);
        moveKeepFacing(obB, OB_B_CHASE_SPEED, dt);
      }

      const aimAngle = Math.atan2(target.y - launcher.y, target.x - launcher.x);

      if (!ball.active) {
        // === 的: オープンスペースを探して移動 ===
        s.targetReevalTimer -= dt;
        const atDest = s.targetDest && dist2d(target.x, target.y, s.targetDest.x, s.targetDest.y) < 20;
        if (s.targetReevalTimer <= 0 || !s.targetDest || atDest) {
          s.targetDest = findOpenSpace(launcher, [obA, obB, obC]);
          s.targetReevalTimer = 1.5 + Math.random();
        }
        {
          const dx = s.targetDest.x - target.x;
          const dy = s.targetDest.y - target.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 5) {
            target.vx = (dx / d) * TARGET_RANDOM_SPEED;
            target.vy = (dy / d) * TARGET_RANDOM_SPEED;
          } else {
            target.vx = 0;
            target.vy = 0;
          }
        }
        moveWithFacing(target, TARGET_RANDOM_SPEED, dt);
        // === 妨害A: 捜索中でなければ中間へ移動 ===
        if (!s.obAMem.searching) {
          const midX = (launcher.x + target.x) / 2;
          const midY = (launcher.y + target.y) / 2;
          setChaserVelocity(obA, midX, midY, OB_A_IDLE_SPEED, OB_A_HOVER_RADIUS, dt);
          moveKeepFacing(obA, OB_A_IDLE_SPEED, dt);
        }
        // === 妨害C: 捜索中でなければ的を追尾 ===
        if (!s.obCMem.searching) {
          setChaserVelocity(obC, target.x, target.y, OB_C_IDLE_SPEED, OB_C_HOVER_RADIUS, dt);
          moveKeepFacing(obC, OB_C_IDLE_SPEED, dt);
        }

        // === 発射前予測（毎フレーム更新 → 可視化用） ===
        const estDist = dist2d(launcher.x, launcher.y, target.x, target.y);
        const estFT = Math.max(0.3, estDist / BALL_SPEED);
        const estIPx = target.x + target.vx * estFT;
        const estIPy = target.y + target.vy * estFT;
        const obAReach = OB_A_INTERCEPT_SPEED * estFT;
        const obBReach = OB_B_CHASE_SPEED * estFT;
        const obCReach = OB_C_INTERCEPT_SPEED * estFT;

        // 的の行動可能範囲（向き考慮）
        const targetReach = TARGET_INTERCEPT_SPEED * estFT;
        const targetCanReach = canTargetReach(target, estIPx, estIPy, targetReach);

        // 視野判定: 軌道が妨害のFOV内を通るか
        const obAInFOV = isTrajectoryInFOV(obA, launcher.x, launcher.y, estIPx, estIPy);
        const obBInFOV = isTrajectoryInFOV(obB, launcher.x, launcher.y, estIPx, estIPy);
        const obCInFOV = isTrajectoryInFOV(obC, launcher.x, launcher.y, estIPx, estIPy);

        // ブロック判定: (FOV内かつ到達可能) OR (物理的に軌道上にいる)
        const obAClose = (obAInFOV && canReachTrajectory(obA, launcher.x, launcher.y, estIPx, estIPy, obAReach))
          || isPhysicallyClose(obA, launcher.x, launcher.y, estIPx, estIPy);
        const obBClose = (obBInFOV && canReachTrajectory(obB, launcher.x, launcher.y, estIPx, estIPy, obBReach))
          || isPhysicallyClose(obB, launcher.x, launcher.y, estIPx, estIPy);
        const obCClose = (obCInFOV && canReachTrajectory(obC, launcher.x, launcher.y, estIPx, estIPy, obCReach))
          || isPhysicallyClose(obC, launcher.x, launcher.y, estIPx, estIPy);

        s.preFire = {
          estFlightTime: estFT,
          estIPx, estIPy,
          obAReach, obBReach, obCReach,
          obAInFOV, obBInFOV, obCInFOV,
          obABlocks: obAClose,
          obBBlocks: obBClose,
          obCBlocks: obCClose,
          targetReach,
          targetCanReach,
          blocked: obAClose || obBClose || obCClose || !targetCanReach,
        };

        // === 発射クールダウン ===
        s.cooldown -= dt;
        if (s.cooldown <= 0) {
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

          const ipInBoard = sol?.valid
            && sol.interceptPos.x >= MARGIN && sol.interceptPos.x <= BOARD_W - MARGIN
            && sol.interceptPos.z >= MARGIN && sol.interceptPos.z <= BOARD_H - MARGIN;

          if (sol?.valid && ipInBoard) {
            const bvx = sol.launchVelocity.x;
            const bvz = sol.launchVelocity.z;
            const ft = sol.flightTime;

            // 的が迎撃点に到達できるか（向き考慮）
            const tReach = TARGET_INTERCEPT_SPEED * ft;
            const tCanReach = canTargetReach(target, sol.interceptPos.x, sol.interceptPos.z, tReach);

            // 視野+ソルバーで正確に妨害可否を判定
            const obAInFOV = isTrajectoryInFOV(obA, launcher.x, launcher.y, sol.interceptPos.x, sol.interceptPos.z);
            const obBInFOV = isTrajectoryInFOV(obB, launcher.x, launcher.y, sol.interceptPos.x, sol.interceptPos.z);
            const obCInFOV = isTrajectoryInFOV(obC, launcher.x, launcher.y, sol.interceptPos.x, sol.interceptPos.z);
            const ipx2 = sol.interceptPos.x;
            const ipz2 = sol.interceptPos.z;
            const obACanBlock = (obAInFOV && canObIntercept(obA, launcher.x, launcher.y, bvx, bvz, OB_A_INTERCEPT_SPEED, ft))
              || isPhysicallyClose(obA, launcher.x, launcher.y, ipx2, ipz2);
            const obBCanBlock = (obBInFOV && canObIntercept(obB, launcher.x, launcher.y, bvx, bvz, OB_B_CHASE_SPEED, ft))
              || isPhysicallyClose(obB, launcher.x, launcher.y, ipx2, ipz2);
            const obCCanBlock = (obCInFOV && canObIntercept(obC, launcher.x, launcher.y, bvx, bvz, OB_C_INTERCEPT_SPEED, ft))
              || isPhysicallyClose(obC, launcher.x, launcher.y, ipx2, ipz2);

            if (obACanBlock || obBCanBlock || obCCanBlock || !tCanReach) {
              s.cooldown = 0.3;
            } else {
              // 発射！
              ball.active = true;
              ball.x = launcher.x;
              ball.y = launcher.y;
              ball.vx = bvx;
              ball.vy = bvz;
              ball.age = 0;
              s.trail = [];
              s.interceptPt = { x: sol.interceptPos.x, y: sol.interceptPos.z };
              s.preFire = null;

              // 的: 迎撃点へ向かう or その場で待つ
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

              // 妨害A: FOV内なら追跡開始
              s.obAReacting = obAInFOV;
              if (obAInFOV) {
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
                  const adx = ball.x - obA.x;
                  const ady = ball.y - obA.y;
                  const ad = Math.sqrt(adx * adx + ady * ady) || 1;
                  obA.vx = (adx / ad) * OB_A_INTERCEPT_SPEED;
                  obA.vy = (ady / ad) * OB_A_INTERCEPT_SPEED;
                }
              }

              // 妨害C: FOV内なら追跡開始
              s.obCReacting = obCInFOV;
              if (obCInFOV) {
                const cSol = MinTimeLaunch.solve(
                  {
                    launchPos: v3(obC.x, obC.y),
                    target: { position: v3(ball.x, ball.y), velocity: v3(ball.vx, ball.vy) },
                    maxSpeed: OB_C_INTERCEPT_SPEED,
                    gravity: 0,
                    damping: 0,
                  },
                  SOLVER_CFG,
                );
                if (cSol?.valid) {
                  obC.vx = cSol.launchVelocity.x;
                  obC.vy = cSol.launchVelocity.z;
                } else {
                  const cdx = ball.x - obC.x;
                  const cdy = ball.y - obC.y;
                  const cd = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
                  obC.vx = (cdx / cd) * OB_C_INTERCEPT_SPEED;
                  obC.vy = (cdy / cd) * OB_C_INTERCEPT_SPEED;
                }
              }

              s.cooldown = randFire();
            }
          } else {
            s.cooldown = 0.3;
          }
        }
      } else {
        // === ボール飛行中 ===
        s.preFire = null;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.age += dt;

        // 的: 迎撃点へ向かい、到着したら停止
        if (s.interceptPt) {
          const idx = s.interceptPt.x - target.x;
          const idy = s.interceptPt.y - target.y;
          if (Math.sqrt(idx * idx + idy * idy) > 5) {
            moveWithFacing(target, TARGET_INTERCEPT_SPEED, dt);
          } else {
            target.vx = 0;
            target.vy = 0;
          }
        }

        // 妨害A: FOVで反応していれば追跡、捜索中なら停止、それ以外は待機
        if (s.obAReacting) {
          moveWithFacing(obA, OB_A_INTERCEPT_SPEED, dt);
        } else if (!s.obAMem.searching) {
          const midX = (launcher.x + target.x) / 2;
          const midY = (launcher.y + target.y) / 2;
          setChaserVelocity(obA, midX, midY, OB_A_IDLE_SPEED, OB_A_HOVER_RADIUS, dt);
          moveKeepFacing(obA, OB_A_IDLE_SPEED, dt);
        }
        // 妨害C: FOVで反応していれば追跡、捜索中なら停止、それ以外は的を追尾
        if (s.obCReacting) {
          moveWithFacing(obC, OB_C_INTERCEPT_SPEED, dt);
        } else if (!s.obCMem.searching) {
          setChaserVelocity(obC, target.x, target.y, OB_C_IDLE_SPEED, OB_C_HOVER_RADIUS, dt);
          moveKeepFacing(obC, OB_C_IDLE_SPEED, dt);
        }

        // 軌跡
        s.trail.push({ x: ball.x, y: ball.y });
        if (s.trail.length > 25) s.trail.shift();

        // 妨害A・B・Cとの衝突判定（BLOCK）
        for (const ob of [obA, obB, obC]) {
          if (dist2d(ball.x, ball.y, ob.x, ob.y) < BLOCK_RADIUS) {
            ball.active = false;
            s.blockFx = { x: ob.x, y: ob.y, age: 0 };
            s.score.block++;
            s.cooldown = 1.0;
            s.interceptPt = null;
            s.obAReacting = false;
            s.obCReacting = false;
            s.targetDest = null;
            restoreRandom(target, TARGET_RANDOM_SPEED);
            restoreRandom(obA, OB_A_IDLE_SPEED);
            restoreRandom(obC, OB_C_IDLE_SPEED);
            break;
          }
        }

        // 命中判定
        if (ball.active && dist2d(ball.x, ball.y, target.x, target.y) < HIT_RADIUS) {
          ball.active = false;
          s.hitFx = { x: (ball.x + target.x) / 2, y: (ball.y + target.y) / 2, age: 0 };
          s.score.hit++;
          s.cooldown = 1.5;
          s.interceptPt = null;
          s.obAReacting = false;
          s.obCReacting = false;
          s.targetDest = null;
          restoreRandom(target, TARGET_RANDOM_SPEED);
          restoreRandom(obA, OB_A_IDLE_SPEED);
          restoreRandom(obC, OB_C_IDLE_SPEED);
        }

        // MISS: 盤面外 or タイムアウト
        if (ball.active) {
          const out = ball.x < -30 || ball.x > BOARD_W + 30 || ball.y < -30 || ball.y > BOARD_H + 30;
          if (out || ball.age > BALL_TIMEOUT) {
            ball.active = false;
            s.score.miss++;
            s.cooldown = 1.0;
            s.interceptPt = null;
            s.obAReacting = false;
            s.obCReacting = false;
            s.targetDest = null;
            restoreRandom(target, TARGET_RANDOM_SPEED);
            restoreRandom(obA, OB_A_IDLE_SPEED);
            restoreRandom(obC, OB_C_IDLE_SPEED);
          }
        }
      }

      // === facing + フォーカス距離 制御 ===

      // スキャン更新ヘルパー（記憶ベース）
      const updateScan = (
        ob: Mover, atLauncher: boolean, timer: number,
        focusDist: number, reacting: boolean, mem: ScanMemory,
      ): { atLauncher: boolean; timer: number; focusDist: number } => {
        if (ball.active && reacting) {
          // 反応中 → ボール方向にフォーカス
          mem.searching = false;
          const bd = dist2d(ob.x, ob.y, ball.x, ball.y);
          const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(bd - focusDist));
          focusDist += Math.sign(bd - focusDist) * delta;
          return { atLauncher, timer, focusDist };
        }

        // 注視対象の実体と記憶位置
        const lookEntity = atLauncher ? launcher : target;
        const lastX = atLauncher ? mem.lastSeenLauncherX : mem.lastSeenTargetX;
        const lastY = atLauncher ? mem.lastSeenLauncherY : mem.lastSeenTargetY;

        // 実体が現在FOV内に見えるか
        const entityVisible = isPointInFOV(ob, lookEntity.x, lookEntity.y);

        if (entityVisible) {
          // 発見 → 記憶を更新、捜索解除
          if (atLauncher) {
            mem.lastSeenLauncherX = lookEntity.x;
            mem.lastSeenLauncherY = lookEntity.y;
          } else {
            mem.lastSeenTargetX = lookEntity.x;
            mem.lastSeenTargetY = lookEntity.y;
          }
          mem.searching = false;
          mem.searchSweep = 0;

          // 通常スキャン: 対象を注視してタイマーで切り替え
          timer -= dt;
          if (timer <= 0) {
            atLauncher = !atLauncher;
            timer = 1.5 + Math.random();
          }
          ob.facing = turnToward(ob.facing,
            Math.atan2(lookEntity.y - ob.y, lookEntity.x - ob.x), TURN_RATE * dt);
          const ld = dist2d(ob.x, ob.y, lookEntity.x, lookEntity.y);
          const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
          focusDist += Math.sign(ld - focusDist) * delta;
        } else if (!mem.searching) {
          // 見えない → まず記憶位置に視線を向ける
          const angleToLast = Math.atan2(lastY - ob.y, lastX - ob.x);
          ob.facing = turnToward(ob.facing, angleToLast, TURN_RATE * dt);
          const ld = dist2d(ob.x, ob.y, lastX, lastY);
          const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
          focusDist += Math.sign(ld - focusDist) * delta;

          // 記憶位置方向にほぼ向いたら捜索開始
          if (Math.abs(normAngleDiff(ob.facing, angleToLast)) < 0.1) {
            mem.searching = true;
            mem.searchSweep = 0;
            mem.searchDir = 1;
          }
        } else {
          // 捜索中: 記憶位置を中心にスイープ（停止して周囲を見回す）
          mem.searchSweep += mem.searchDir * SEARCH_SWEEP_SPEED * dt;
          if (Math.abs(mem.searchSweep) > SEARCH_SWEEP_MAX) {
            mem.searchDir = (mem.searchDir * -1) as 1 | -1;
            mem.searchSweep = Math.sign(mem.searchSweep) * SEARCH_SWEEP_MAX;
          }
          const baseAngle = Math.atan2(lastY - ob.y, lastX - ob.x);
          ob.facing = turnToward(ob.facing, baseAngle + mem.searchSweep, TURN_RATE * dt);
          const ld = dist2d(ob.x, ob.y, lastX, lastY);
          const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
          focusDist += Math.sign(ld - focusDist) * delta;

          // 捜索タイムアウト → 諦めて次の対象へ切り替え
          timer -= dt;
          if (timer <= 0) {
            atLauncher = !atLauncher;
            mem.searching = false;
            mem.searchSweep = 0;
            timer = 1.5 + Math.random();
          }
        }

        return { atLauncher, timer, focusDist };
      };

      // 妨害A
      const scanA = updateScan(obA, s.obAScanAtLauncher, s.obAScanTimer, s.obAFocusDist, s.obAReacting, s.obAMem);
      s.obAScanAtLauncher = scanA.atLauncher;
      s.obAScanTimer = scanA.timer;
      s.obAFocusDist = scanA.focusDist;

      // 妨害B
      const scanB = updateScan(obB, s.obBScanAtLauncher, s.obBScanTimer, s.obBFocusDist, false, s.obBMem);
      s.obBScanAtLauncher = scanB.atLauncher;
      s.obBScanTimer = scanB.timer;
      s.obBFocusDist = scanB.focusDist;

      // 妨害C
      const scanC = updateScan(obC, s.obCScanAtLauncher, s.obCScanTimer, s.obCFocusDist, s.obCReacting, s.obCMem);
      s.obCScanAtLauncher = scanC.atLauncher;
      s.obCScanTimer = scanC.timer;
      s.obCFocusDist = scanC.focusDist;

      // エフェクト更新
      if (s.hitFx) { s.hitFx.age += dt; if (s.hitFx.age > 0.6) s.hitFx = null; }
      if (s.blockFx) { s.blockFx.age += dt; if (s.blockFx.age > 0.6) s.blockFx = null; }

      // === 描画 ===
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawBoard(ctx);

        if (s.interceptPt) drawIntercept(ctx, s.interceptPt.x, s.interceptPt.y);

        // 視野コーン（常時表示・スライディングウィンドウ）
        const pf = s.preFire;
        const aInFOV = pf?.obAInFOV ?? false;
        const bInFOV = pf?.obBInFOV ?? false;
        const cInFOV = pf?.obCInFOV ?? false;
        drawFOV(ctx, obA, s.obAFocusDist, FOV_WINDOW_LEN, aInFOV);
        drawFOV(ctx, obB, s.obBFocusDist, FOV_WINDOW_LEN, bInFOV);
        drawFOV(ctx, obC, s.obCFocusDist, FOV_WINDOW_LEN, cInFOV);

        // 発射前: 到達圏（卵型）+ 予測軌道
        if (pf) {
          drawReachCircle(ctx, obA, pf.obAReach, pf.obABlocks);
          drawReachCircle(ctx, obB, pf.obBReach, pf.obBBlocks);
          drawReachCircle(ctx, obC, pf.obCReach, pf.obCBlocks);
          drawTargetReach(ctx, target, pf.targetReach, pf.targetCanReach);
          drawTrajectoryLine(ctx, launcher.x, launcher.y, pf.estIPx, pf.estIPy, pf.blocked);
        }

        // 捜索中: 記憶位置に「?」マーカー表示
        const drawMemMarkers = (mem: ScanMemory, atLauncher: boolean, label: string) => {
          if (!mem.searching) return;
          const lx = atLauncher ? mem.lastSeenLauncherX : mem.lastSeenTargetX;
          const ly = atLauncher ? mem.lastSeenLauncherY : mem.lastSeenTargetY;
          const what = atLauncher ? "発射台?" : "的?";
          drawSearchMarker(ctx, lx, ly, `${label}→${what}`);
        };
        drawMemMarkers(s.obAMem, s.obAScanAtLauncher, "A");
        drawMemMarkers(s.obBMem, s.obBScanAtLauncher, "B");
        drawMemMarkers(s.obCMem, s.obCScanAtLauncher, "C");

        drawObstacle(ctx, obA, s.obAMem.searching ? "妨害A(捜索中)" : "妨害A(中間)");
        drawObstacle(ctx, obB, s.obBMem.searching ? "妨害B(捜索中)" : "妨害B(発射台)");
        drawObstacle(ctx, obC, s.obCMem.searching ? "妨害C(捜索中)" : "妨害C(的)");
        drawLauncher(ctx, launcher, aimAngle, pf?.blocked ?? false);
        drawTarget(ctx, target);

        if (ball.active) drawBall(ctx, ball, s.trail);
        if (s.hitFx) drawFx(ctx, s.hitFx, 255, 255, 100);
        if (s.blockFx) drawFx(ctx, s.blockFx, 153, 102, 204);

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
        発射台→的へ発射 | 妨害A=中間 妨害B=発射台 妨害C=的 |
        向き: 前方1.0 / 左右0.7 / 後方0.5倍速 | 視野角: 近60°→遠20°（距離で狭まる）— FOV外のボールには反応不可
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
