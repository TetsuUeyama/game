"use client";

import { useRef, useEffect, useState } from "react";
import {
  MinTimeLaunch,
  type SolverConfig,
} from "@/GamePlay/GameSystem/TargetTrackingAccuracySystem";

// --- 盤面 ---
const BOARD_W = 800;
const BOARD_H = 600;
const CELL = 40;
const MARGIN = 30;
const LABEL_PAD = 20; // フィールド外ラベル領域の幅
const CANVAS_W = BOARD_W + LABEL_PAD * 2;  // 左右にラベル領域
const CANVAS_H = BOARD_H + LABEL_PAD * 2;  // 上下にラベル領域

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
const OB_D_IDLE_SPEED = 65;
const OB_D_INTERCEPT_SPEED = 155;
const OB_E_IDLE_SPEED = 75;
const OB_E_INTERCEPT_SPEED = 145;
const BALL_SPEED = 250;

// --- ホバー半径 ---
const OB_A_HOVER_RADIUS = 60;
const OB_B_HOVER_RADIUS = 50;
const OB_C_HOVER_RADIUS = 50;
const OB_D_HOVER_RADIUS = 55;
const OB_E_HOVER_RADIUS = 60;

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
  targetIdx: number;
  estFlightTime: number;
  estIPx: number;
  estIPy: number;
  obReaches: number[];     // [A, B, C, D, E]
  obInFOVs: boolean[];     // [A, B, C, D, E]
  obBlocks: boolean[];     // [A, B, C, D, E]
  targetReach: number;
  targetCanReach: boolean;
  blocked: boolean;
}

// --- 的カラー定義 ---
interface TargetColors { outer: string; mid: string; inner: string; facing: string; label: string; }
const TARGET_COLORS: TargetColors[] = [
  { outer: "#cc4444", mid: "#ff6666", inner: "#ff9999", facing: "#ff9999", label: "#ffaaaa" },  // 的1: 赤
  { outer: "#cc7700", mid: "#ee9922", inner: "#ffbb55", facing: "#ffbb55", label: "#ffcc88" },  // 的2: 橙
  { outer: "#2288aa", mid: "#33aacc", inner: "#55ccee", facing: "#55ccee", label: "#88ddee" },  // 的3: 水色
  { outer: "#669900", mid: "#88bb22", inner: "#aadd44", facing: "#aadd44", label: "#bbee77" },  // 的4: 黄緑
  { outer: "#aa4488", mid: "#cc66aa", inner: "#ee88cc", facing: "#ee88cc", label: "#ffaadd" },  // 的5: ピンク
];

// --- 的4 行動エリア: A1・A2・B1・B2 ---
const T4_X1 = 0;
const T4_Y1 = 0;
const T4_X2 = 2 * CELL;  // 80
const T4_Y2 = 2 * CELL;  // 80

// --- 的5 行動エリア: S1・S2・T1・T2 ---
const T5_X1 = 18 * CELL; // 720
const T5_Y1 = 0;
const T5_X2 = 20 * CELL; // 800
const T5_Y2 = 2 * CELL;  // 80

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

function makeScanMemory(lx: number, ly: number, tx: number, ty: number): ScanMemory {
  return {
    lastSeenLauncherX: lx, lastSeenLauncherY: ly,
    lastSeenTargetX: tx, lastSeenTargetY: ty,
    searching: false, searchSweep: 0, searchDir: 1,
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

/** 捜索用の視野判定: 距離による角度狭化なし（近距離の広い視野角で全距離を探す） */
function isPointInSearchFOV(m: Mover, px: number, py: number): boolean {
  const angle = Math.atan2(py - m.y, px - m.x);
  return Math.abs(normAngleDiff(m.facing, angle)) <= OB_FOV_HALF_NEAR;
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

/** 的をオープンスペースへ移動させるヘルパー */
function moveTargetToOpenSpace(
  tgt: Mover, dest: { x: number; y: number } | null,
  reevalTimer: number, dt: number,
  launcher: Mover, allObs: Mover[],
): { dest: { x: number; y: number }; reevalTimer: number } {
  reevalTimer -= dt;
  const atDest = dest && dist2d(tgt.x, tgt.y, dest.x, dest.y) < 20;
  if (reevalTimer <= 0 || !dest || atDest) {
    dest = findOpenSpace(launcher, allObs);
    reevalTimer = 1.5 + Math.random();
  }
  const dx = dest.x - tgt.x;
  const dy = dest.y - tgt.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 5) {
    tgt.vx = (dx / d) * TARGET_RANDOM_SPEED;
    tgt.vy = (dy / d) * TARGET_RANDOM_SPEED;
  } else {
    tgt.vx = 0;
    tgt.vy = 0;
  }
  moveWithFacing(tgt, TARGET_RANDOM_SPEED, dt);
  return { dest, reevalTimer };
}

// --- 描画 ---

/** フィールド外ラベル（translate前に呼ぶ） */
function drawOuterLabels(ctx: CanvasRenderingContext2D) {
  const cols = Math.floor(BOARD_W / CELL);
  const rows = Math.floor(BOARD_H / CELL);
  ctx.fillStyle = "#8a9a8a";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 上下: 列記号 A〜T
  for (let c = 0; c < cols; c++) {
    const letter = String.fromCharCode(65 + c);
    const cx = LABEL_PAD + c * CELL + CELL / 2;
    ctx.fillText(letter, cx, LABEL_PAD / 2);                    // 上
    ctx.fillText(letter, cx, LABEL_PAD + BOARD_H + LABEL_PAD / 2); // 下
  }

  // 左右: 行番号 1〜15
  for (let r = 0; r < rows; r++) {
    const num = String(r + 1);
    const cy = LABEL_PAD + r * CELL + CELL / 2;
    ctx.fillText(num, LABEL_PAD / 2, cy);                       // 左
    ctx.fillText(num, LABEL_PAD + BOARD_W + LABEL_PAD / 2, cy); // 右
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** フィールド描画（translate済み座標系で呼ぶ） */
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

  // 升目ラベル: 全マスの中心に「列文字+行番号」を表示（例: A1, B2, ...）
  ctx.fillStyle = "#3a4a3a";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cols = Math.floor(BOARD_W / CELL);
  const rows = Math.floor(BOARD_H / CELL);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const label = String.fromCharCode(65 + c) + (r + 1);
      ctx.fillText(label, c * CELL + CELL / 2, r * CELL + CELL / 2);
    }
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
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

function drawTarget(ctx: CanvasRenderingContext2D, m: Mover, label: string, colors: TargetColors) {
  ctx.fillStyle = colors.outer;
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors.mid;
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R * 0.65, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors.inner;
  ctx.beginPath(); ctx.arc(m.x, m.y, TARGET_R * 0.3, 0, Math.PI * 2); ctx.fill();
  drawFacing(ctx, m, TARGET_R, colors.facing);
  ctx.fillStyle = colors.label;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, m.x, m.y + TARGET_R + 16);
  ctx.textAlign = "start";
}

/** 距離dでのFOVエッジ角度（facing ± fovHalf） */
function fovEdgeAngle(facing: number, dist: number, side: -1 | 1, searching: boolean): number {
  const half = searching ? OB_FOV_HALF_NEAR : fovHalfAtDist(dist);
  return facing + side * half;
}

/** 視野コーン（FOV）をスライディングウィンドウ方式で描画 */
function drawFOV(
  ctx: CanvasRenderingContext2D, m: Mover,
  focusDist: number, windowLen: number, inFOV: boolean,
  searching: boolean,
) {
  const innerR = Math.max(OBSTACLE_R + 5, focusDist - windowLen / 2);
  const outerR = focusDist + windowLen / 2;
  const edgeSteps = 40;

  // 全長の薄いエッジライン（通常: 湾曲、捜索中: 直線＝角度一定）
  ctx.strokeStyle = searching ? "rgba(255,200,100,0.08)" : "rgba(153,102,204,0.06)";
  ctx.lineWidth = 1;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    for (let i = 1; i <= edgeSteps; i++) {
      const d = (i / edgeSteps) * FOV_FULL_LEN;
      const a = fovEdgeAngle(m.facing, d, side, searching);
      ctx.lineTo(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d);
    }
    ctx.stroke();
  }

  // フォーカスウィンドウ（環状扇形）
  ctx.fillStyle = inFOV ? "rgba(255,200,100,0.10)" : searching ? "rgba(255,200,100,0.04)" : "rgba(153,102,204,0.05)";
  const windowSteps = 24;
  ctx.beginPath();
  // 外弧: +side → -side
  for (let i = 0; i <= windowSteps; i++) {
    const frac = i / windowSteps;
    const a = fovEdgeAngle(m.facing, outerR, 1, searching) * (1 - frac) + fovEdgeAngle(m.facing, outerR, -1, searching) * frac;
    const px = m.x + Math.cos(a) * outerR;
    const py = m.y + Math.sin(a) * outerR;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  // 内弧: -side → +side
  for (let i = 0; i <= windowSteps; i++) {
    const frac = i / windowSteps;
    const a = fovEdgeAngle(m.facing, innerR, -1, searching) * (1 - frac) + fovEdgeAngle(m.facing, innerR, 1, searching) * frac;
    ctx.lineTo(m.x + Math.cos(a) * innerR, m.y + Math.sin(a) * innerR);
  }
  ctx.closePath();
  ctx.fill();

  // ウィンドウのエッジ
  ctx.strokeStyle = inFOV ? "rgba(255,200,100,0.30)" : searching ? "rgba(255,200,100,0.18)" : "rgba(153,102,204,0.15)";
  ctx.lineWidth = 1;
  const sideSteps = 12;
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    for (let i = 0; i <= sideSteps; i++) {
      const d = innerR + (outerR - innerR) * (i / sideSteps);
      const a = fovEdgeAngle(m.facing, d, side, searching);
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
      const a = fovEdgeAngle(m.facing, r, -1, searching) * (1 - frac) + fovEdgeAngle(m.facing, r, 1, searching) * frac;
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
  const [score, setScore] = useState({ hit: 0, miss: 0, block: 0 });
  const stateRef = useRef({
    launcher: makeMover(80, BOARD_H / 2, LAUNCHER_SPEED),
    targets: [
      makeMover(600, 150, TARGET_RANDOM_SPEED),   // 的1
      makeMover(650, 450, TARGET_RANDOM_SPEED),   // 的2
      makeMover(500, 80, TARGET_RANDOM_SPEED),    // 的3
      makeMover(40, 40, TARGET_RANDOM_SPEED),      // 的4 (A1-B2エリア)
      makeMover(760, 40, TARGET_RANDOM_SPEED),    // 的5 (S1-T2エリア)
    ],
    obA: makeMover(350, 300, OB_A_IDLE_SPEED),
    obB: makeMover(200, 350, OB_B_CHASE_SPEED),
    obC: makeMover(550, 200, OB_C_IDLE_SPEED),
    obD: makeMover(600, 400, OB_D_IDLE_SPEED),
    obE: makeMover(300, 150, OB_E_IDLE_SPEED),
    ball: { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0 } as Ball,
    trail: [] as { x: number; y: number }[],
    cooldown: 2.0,
    hitFx: null as HitFx | null,
    blockFx: null as HitFx | null,
    interceptPt: null as { x: number; y: number } | null,
    selectedTargetIdx: 0,
    preFire: null as PreFireInfo | null,
    obAReacting: false,
    obCReacting: false,
    obDReacting: false,
    obEReacting: false,
    // スキャン状態
    obAScanTimer: 2.0, obAScanAtLauncher: true,
    obBScanTimer: 1.5, obBScanAtLauncher: true,
    obCScanTimer: 1.0, obCScanAtLauncher: false,
    obDScanTimer: 1.8, obDScanAtLauncher: false,
    obEScanTimer: 1.2, obEScanAtLauncher: true,
    // 的の移動先
    targetDests: [null, null, null, null, null] as ({ x: number; y: number } | null)[],
    targetReevalTimers: [0.5, 0.7, 0.9, 1.1, 0.6],
    // フォーカス距離
    obAFocusDist: 300,
    obBFocusDist: 150,
    obCFocusDist: 200,
    obDFocusDist: 250,
    obEFocusDist: 200,
    // 妨害E巡回先
    obEDest: null as { x: number; y: number } | null,
    // スキャンメモリ
    obAMem: makeScanMemory(80, BOARD_H / 2, 600, 150),
    obBMem: makeScanMemory(80, BOARD_H / 2, 600, 150),
    obCMem: makeScanMemory(80, BOARD_H / 2, 600, 150),
    obDMem: makeScanMemory(80, BOARD_H / 2, 40, 40),
    obEMem: makeScanMemory(80, BOARD_H / 2, 760, 40),
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

      const { launcher, targets, ball, obA, obB, obC, obD, obE } = s;
      const allObs = [obA, obB, obC, obD, obE];
      const obIntSpeeds = [OB_A_INTERCEPT_SPEED, OB_B_CHASE_SPEED, OB_C_INTERCEPT_SPEED, OB_D_INTERCEPT_SPEED, OB_E_INTERCEPT_SPEED];


      // 発射台: 常にランダム移動
      stepMover(launcher, dt);

      // 妨害B: 捜索中でなければ発射台を追跡
      if (!s.obBMem.searching) {
        setChaserVelocity(obB, launcher.x, launcher.y, OB_B_CHASE_SPEED, OB_B_HOVER_RADIUS, dt);
        moveKeepFacing(obB, OB_B_CHASE_SPEED, dt);
      }

      // 選択中の的
      const selTarget = targets[s.selectedTargetIdx];
      const aimAngle = Math.atan2(selTarget.y - launcher.y, selTarget.x - launcher.x);

      if (!ball.active) {
        // === 全的: オープンスペースを探して移動（的5はエリア制限） ===
        for (let ti = 0; ti < targets.length; ti++) {
          // エリア固定的の共通処理
          const areaInfo = ti === 3 ? { x1: T4_X1, y1: T4_Y1, x2: T4_X2, y2: T4_Y2 }
            : ti === 4 ? { x1: T5_X1, y1: T5_Y1, x2: T5_X2, y2: T5_Y2 }
            : null;
          if (areaInfo) {
            const tgt = targets[ti];
            s.targetReevalTimers[ti] -= dt;
            const atD = s.targetDests[ti] && dist2d(tgt.x, tgt.y, s.targetDests[ti]!.x, s.targetDests[ti]!.y) < 10;
            if (s.targetReevalTimers[ti] <= 0 || !s.targetDests[ti] || atD) {
              s.targetDests[ti] = {
                x: areaInfo.x1 + Math.random() * (areaInfo.x2 - areaInfo.x1),
                y: areaInfo.y1 + Math.random() * (areaInfo.y2 - areaInfo.y1),
              };
              s.targetReevalTimers[ti] = 0.8 + Math.random() * 0.8;
            }
            const dx = s.targetDests[ti]!.x - tgt.x;
            const dy = s.targetDests[ti]!.y - tgt.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 3) {
              tgt.vx = (dx / d) * TARGET_RANDOM_SPEED * 0.5;
              tgt.vy = (dy / d) * TARGET_RANDOM_SPEED * 0.5;
            } else {
              tgt.vx = 0; tgt.vy = 0;
            }
            moveWithFacing(tgt, TARGET_RANDOM_SPEED * 0.5, dt);
            tgt.x = Math.max(areaInfo.x1 + 5, Math.min(areaInfo.x2 - 5, tgt.x));
            tgt.y = Math.max(areaInfo.y1 + 5, Math.min(areaInfo.y2 - 5, tgt.y));
          } else {
            const res = moveTargetToOpenSpace(
              targets[ti], s.targetDests[ti], s.targetReevalTimers[ti], dt, launcher, allObs,
            );
            s.targetDests[ti] = res.dest;
            s.targetReevalTimers[ti] = res.reevalTimer;
          }
        }

        // === 妨害A: 捜索中でなければ発射台と選択的の中間へ移動 ===
        if (!s.obAMem.searching) {
          const midX = (launcher.x + selTarget.x) / 2;
          const midY = (launcher.y + selTarget.y) / 2;
          setChaserVelocity(obA, midX, midY, OB_A_IDLE_SPEED, OB_A_HOVER_RADIUS, dt);
          moveKeepFacing(obA, OB_A_IDLE_SPEED, dt);
        }
        // === 妨害C: 捜索中でなければ的1を追尾 ===
        if (!s.obCMem.searching) {
          setChaserVelocity(obC, targets[0].x, targets[0].y, OB_C_IDLE_SPEED, OB_C_HOVER_RADIUS, dt);
          moveKeepFacing(obC, OB_C_IDLE_SPEED, dt);
        }
        // === 妨害D: 捜索中でなければ的4を追尾 ===
        if (!s.obDMem.searching) {
          setChaserVelocity(obD, targets[3].x, targets[3].y, OB_D_IDLE_SPEED, OB_D_HOVER_RADIUS, dt);
          moveKeepFacing(obD, OB_D_IDLE_SPEED, dt);
        }
        // === 妨害E: 捜索中でなければ的5をマーク ===
        if (!s.obEMem.searching) {
          setChaserVelocity(obE, targets[4].x, targets[4].y, OB_E_IDLE_SPEED, OB_E_HOVER_RADIUS, dt);
          moveKeepFacing(obE, OB_E_IDLE_SPEED, dt);
        }

        // === 発射前予測: 各的を評価して最良を選択 ===
        let bestIdx = 0;
        let bestScore = -Infinity;
        let bestPF: PreFireInfo | null = null;

        for (let ti = 0; ti < targets.length; ti++) {
          const tgt = targets[ti];
          const estDist = dist2d(launcher.x, launcher.y, tgt.x, tgt.y);
          const estFT = Math.max(0.3, estDist / BALL_SPEED);
          const estIPx = tgt.x + tgt.vx * estFT;
          const estIPy = tgt.y + tgt.vy * estFT;

          const obReaches = allObs.map((_, oi) => obIntSpeeds[oi] * estFT);
          const targetReach = TARGET_INTERCEPT_SPEED * estFT;
          const tgtCanReach = canTargetReach(tgt, estIPx, estIPy, targetReach);

          const obInFOVs = allObs.map(ob => isTrajectoryInFOV(ob, launcher.x, launcher.y, estIPx, estIPy));
          const obBlocks = allObs.map((ob, oi) =>
            (obInFOVs[oi] && canReachTrajectory(ob, launcher.x, launcher.y, estIPx, estIPy, obReaches[oi]))
            || isPhysicallyClose(ob, launcher.x, launcher.y, estIPx, estIPy));

          const blocked = obBlocks.some(b => b) || !tgtCanReach;
          const blockerCount = obBlocks.filter(b => b).length;
          const score = -blockerCount * 10 + (tgtCanReach ? 5 : 0) - estDist * 0.01;

          const pf: PreFireInfo = {
            targetIdx: ti, estFlightTime: estFT, estIPx, estIPy,
            obReaches, obInFOVs, obBlocks,
            targetReach, targetCanReach: tgtCanReach, blocked,
          };

          if (score > bestScore) {
            bestScore = score;
            bestIdx = ti;
            bestPF = pf;
          }
        }

        s.selectedTargetIdx = bestIdx;
        s.preFire = bestPF;

        // === 発射クールダウン ===
        s.cooldown -= dt;
        if (s.cooldown <= 0) {
          // 各的を評価して最初に通る的に発射
          let fired = false;

          // スコア順に的をソート（bestIdxを最優先）
          const order = targets.map((_, i) => i).sort((a, b) => {
            if (a === bestIdx) return -1;
            if (b === bestIdx) return 1;
            return 0;
          });

          for (const ti of order) {
            const tgt = targets[ti];
            const sol = MinTimeLaunch.solve(
              {
                launchPos: v3(launcher.x, launcher.y),
                target: { position: v3(tgt.x, tgt.y), velocity: v3(tgt.vx, tgt.vy) },
                maxSpeed: BALL_SPEED,
                gravity: 0,
                damping: 0,
              },
              SOLVER_CFG,
            );

            const ipInBoard = sol?.valid
              && sol.interceptPos.x >= MARGIN && sol.interceptPos.x <= BOARD_W - MARGIN
              && sol.interceptPos.z >= MARGIN && sol.interceptPos.z <= BOARD_H - MARGIN;

            if (!sol?.valid || !ipInBoard) continue;

            const bvx = sol.launchVelocity.x;
            const bvz = sol.launchVelocity.z;
            const ft = sol.flightTime;
            const ipx = sol.interceptPos.x;
            const ipz = sol.interceptPos.z;

            // 的が迎撃点に到達できるか
            const tReach = TARGET_INTERCEPT_SPEED * ft;
            const tCanReach = canTargetReach(tgt, ipx, ipz, tReach);

            // 全妨害の妨害可否を判定
            const obFOVs = allObs.map(ob => isTrajectoryInFOV(ob, launcher.x, launcher.y, ipx, ipz));
            let anyBlock = false;
            for (let oi = 0; oi < allObs.length; oi++) {
              const canBlock = (obFOVs[oi] && canObIntercept(allObs[oi], launcher.x, launcher.y, bvx, bvz, obIntSpeeds[oi], ft))
                || isPhysicallyClose(allObs[oi], launcher.x, launcher.y, ipx, ipz);
              if (canBlock) { anyBlock = true; break; }
            }

            if (anyBlock || !tCanReach) continue;

            // 発射！
            ball.active = true;
            ball.x = launcher.x;
            ball.y = launcher.y;
            ball.vx = bvx;
            ball.vy = bvz;
            ball.age = 0;
            s.trail = [];
            s.interceptPt = { x: ipx, y: ipz };
            s.selectedTargetIdx = ti;
            s.preFire = null;

            // 選択的: 迎撃点へ向かう
            const tdx = ipx - tgt.x;
            const tdy = ipz - tgt.y;
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            if (tdist < 5) {
              tgt.vx = 0; tgt.vy = 0;
            } else {
              tgt.vx = (tdx / tdist) * TARGET_INTERCEPT_SPEED;
              tgt.vy = (tdy / tdist) * TARGET_INTERCEPT_SPEED;
            }

            // 反応可能な妨害のインターセプト設定
            const reactingObs = [false, false, false, false, false];
            for (let oi = 0; oi < allObs.length; oi++) {
              if (oi === 1) continue; // obB は反応型でない
              if (!obFOVs[oi]) continue;
              reactingObs[oi] = true;
              const obSol = MinTimeLaunch.solve(
                {
                  launchPos: v3(allObs[oi].x, allObs[oi].y),
                  target: { position: v3(ball.x, ball.y), velocity: v3(ball.vx, ball.vy) },
                  maxSpeed: obIntSpeeds[oi],
                  gravity: 0,
                  damping: 0,
                },
                SOLVER_CFG,
              );
              if (obSol?.valid) {
                allObs[oi].vx = obSol.launchVelocity.x;
                allObs[oi].vy = obSol.launchVelocity.z;
              } else {
                const dx = ball.x - allObs[oi].x;
                const dy = ball.y - allObs[oi].y;
                const dd = Math.sqrt(dx * dx + dy * dy) || 1;
                allObs[oi].vx = (dx / dd) * obIntSpeeds[oi];
                allObs[oi].vy = (dy / dd) * obIntSpeeds[oi];
              }
            }
            s.obAReacting = reactingObs[0];
            s.obCReacting = reactingObs[2];
            s.obDReacting = reactingObs[3];
            s.obEReacting = reactingObs[4];

            s.cooldown = randFire();
            fired = true;
            break;
          }

          if (!fired) s.cooldown = 0.3;
        }
      } else {
        // === ボール飛行中 ===
        s.preFire = null;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.age += dt;

        // 選択的: 迎撃点へ向かい、到着したら停止
        const selTgt = targets[s.selectedTargetIdx];
        if (s.interceptPt) {
          const idx = s.interceptPt.x - selTgt.x;
          const idy = s.interceptPt.y - selTgt.y;
          if (Math.sqrt(idx * idx + idy * idy) > 5) {
            moveWithFacing(selTgt, TARGET_INTERCEPT_SPEED, dt);
          } else {
            selTgt.vx = 0;
            selTgt.vy = 0;
          }
        }
        // 他の的は通常移動を継続（的4・5はエリア制限内）
        for (let ti = 0; ti < targets.length; ti++) {
          if (ti === s.selectedTargetIdx) continue;
          const areaInfo = ti === 3 ? { x1: T4_X1, y1: T4_Y1, x2: T4_X2, y2: T4_Y2 }
            : ti === 4 ? { x1: T5_X1, y1: T5_Y1, x2: T5_X2, y2: T5_Y2 }
            : null;
          if (areaInfo) {
            const tgt = targets[ti];
            s.targetReevalTimers[ti] -= dt;
            const atD = s.targetDests[ti] && dist2d(tgt.x, tgt.y, s.targetDests[ti]!.x, s.targetDests[ti]!.y) < 10;
            if (s.targetReevalTimers[ti] <= 0 || !s.targetDests[ti] || atD) {
              s.targetDests[ti] = {
                x: areaInfo.x1 + Math.random() * (areaInfo.x2 - areaInfo.x1),
                y: areaInfo.y1 + Math.random() * (areaInfo.y2 - areaInfo.y1),
              };
              s.targetReevalTimers[ti] = 0.8 + Math.random() * 0.8;
            }
            const dx = s.targetDests[ti]!.x - tgt.x;
            const dy = s.targetDests[ti]!.y - tgt.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 3) {
              tgt.vx = (dx / d) * TARGET_RANDOM_SPEED * 0.5;
              tgt.vy = (dy / d) * TARGET_RANDOM_SPEED * 0.5;
            } else {
              tgt.vx = 0; tgt.vy = 0;
            }
            moveWithFacing(tgt, TARGET_RANDOM_SPEED * 0.5, dt);
            tgt.x = Math.max(areaInfo.x1 + 5, Math.min(areaInfo.x2 - 5, tgt.x));
            tgt.y = Math.max(areaInfo.y1 + 5, Math.min(areaInfo.y2 - 5, tgt.y));
          } else {
            const res = moveTargetToOpenSpace(
              targets[ti], s.targetDests[ti], s.targetReevalTimers[ti], dt, launcher, allObs,
            );
            s.targetDests[ti] = res.dest;
            s.targetReevalTimers[ti] = res.reevalTimer;
          }
        }

        // 妨害A: FOVで反応していれば追跡、捜索中なら停止、それ以外は待機
        if (s.obAReacting) {
          moveWithFacing(obA, OB_A_INTERCEPT_SPEED, dt);
        } else if (!s.obAMem.searching) {
          const midX = (launcher.x + selTgt.x) / 2;
          const midY = (launcher.y + selTgt.y) / 2;
          setChaserVelocity(obA, midX, midY, OB_A_IDLE_SPEED, OB_A_HOVER_RADIUS, dt);
          moveKeepFacing(obA, OB_A_IDLE_SPEED, dt);
        }
        // 妨害C
        if (s.obCReacting) {
          moveWithFacing(obC, OB_C_INTERCEPT_SPEED, dt);
        } else if (!s.obCMem.searching) {
          setChaserVelocity(obC, targets[0].x, targets[0].y, OB_C_IDLE_SPEED, OB_C_HOVER_RADIUS, dt);
          moveKeepFacing(obC, OB_C_IDLE_SPEED, dt);
        }
        // 妨害D
        if (s.obDReacting) {
          moveWithFacing(obD, OB_D_INTERCEPT_SPEED, dt);
        } else if (!s.obDMem.searching) {
          setChaserVelocity(obD, targets[3].x, targets[3].y, OB_D_IDLE_SPEED, OB_D_HOVER_RADIUS, dt);
          moveKeepFacing(obD, OB_D_IDLE_SPEED, dt);
        }
        // 妨害E: 反応中はボール追跡、それ以外は的5マーク
        if (s.obEReacting) {
          moveWithFacing(obE, OB_E_INTERCEPT_SPEED, dt);
        } else if (!s.obEMem.searching) {
          setChaserVelocity(obE, targets[4].x, targets[4].y, OB_E_IDLE_SPEED, OB_E_HOVER_RADIUS, dt);
          moveKeepFacing(obE, OB_E_IDLE_SPEED, dt);
        }

        // 軌跡
        s.trail.push({ x: ball.x, y: ball.y });
        if (s.trail.length > 25) s.trail.shift();

        // 全妨害との衝突判定（BLOCK）
        for (const ob of allObs) {
          if (dist2d(ball.x, ball.y, ob.x, ob.y) < BLOCK_RADIUS) {
            ball.active = false;
            s.blockFx = { x: ob.x, y: ob.y, age: 0 };
            s.score.block++;
            s.cooldown = 1.0;
            s.interceptPt = null;
            s.obAReacting = false;
            s.obCReacting = false;
            s.obDReacting = false;
            s.obEReacting = false;
            for (let ti = 0; ti < targets.length; ti++) s.targetDests[ti] = null;
            for (const t of targets) restoreRandom(t, TARGET_RANDOM_SPEED);
            restoreRandom(obA, OB_A_IDLE_SPEED);
            restoreRandom(obC, OB_C_IDLE_SPEED);
            restoreRandom(obD, OB_D_IDLE_SPEED);
            restoreRandom(obE, OB_E_IDLE_SPEED);
            break;
          }
        }

        // 命中判定: 全的に対して判定
        if (ball.active) {
          for (let ti = 0; ti < targets.length; ti++) {
            const tgt = targets[ti];
            if (dist2d(ball.x, ball.y, tgt.x, tgt.y) < HIT_RADIUS) {
              ball.active = false;
              s.hitFx = { x: (ball.x + tgt.x) / 2, y: (ball.y + tgt.y) / 2, age: 0 };
              s.score.hit++;
              s.cooldown = 1.5;
              s.interceptPt = null;
              s.obAReacting = false;
              s.obCReacting = false;
              s.obDReacting = false;
              s.obEReacting = false;
              for (let j = 0; j < targets.length; j++) s.targetDests[j] = null;
              for (const t of targets) restoreRandom(t, TARGET_RANDOM_SPEED);
              restoreRandom(obA, OB_A_IDLE_SPEED);
              restoreRandom(obC, OB_C_IDLE_SPEED);
              restoreRandom(obD, OB_D_IDLE_SPEED);
              restoreRandom(obE, OB_E_IDLE_SPEED);
              break;
            }
          }
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
            s.obDReacting = false;
            s.obEReacting = false;
            for (let ti = 0; ti < targets.length; ti++) s.targetDests[ti] = null;
            for (const t of targets) restoreRandom(t, TARGET_RANDOM_SPEED);
            restoreRandom(obA, OB_A_IDLE_SPEED);
            restoreRandom(obC, OB_C_IDLE_SPEED);
            restoreRandom(obD, OB_D_IDLE_SPEED);
            restoreRandom(obE, OB_E_IDLE_SPEED);
          }
        }
      }

      // === facing + フォーカス距離 制御 ===

      // スキャン更新ヘルパー（記憶ベース）
      const updateScan = (
        ob: Mover, atLauncher: boolean, timer: number,
        focusDist: number, reacting: boolean, mem: ScanMemory,
        watchTarget: Mover,
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
        const lookEntity = atLauncher ? launcher : watchTarget;
        const lastX = atLauncher ? mem.lastSeenLauncherX : mem.lastSeenTargetX;
        const lastY = atLauncher ? mem.lastSeenLauncherY : mem.lastSeenTargetY;

        // 通常（距離で狭まる）視野で実体が見えるか
        const normalVisible = isPointInFOV(ob, lookEntity.x, lookEntity.y);

        if (normalVisible) {
          // 通常視野内に発見 → 記憶を更新、捜索解除
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
        } else {
          // 通常視野外 → 即座に捜索状態に入る（広い視野で探す）
          if (!mem.searching) {
            mem.searching = true;
            mem.searchSweep = 0;
            mem.searchDir = 1;
          }

          // 広い捜索視野（距離による狭化なし）で見えるかチェック
          const searchVisible = isPointInSearchFOV(ob, lookEntity.x, lookEntity.y);

          if (searchVisible) {
            // 捜索用広角視野で発見 → 記憶を更新し、実体方向へ向きを変える
            if (atLauncher) {
              mem.lastSeenLauncherX = lookEntity.x;
              mem.lastSeenLauncherY = lookEntity.y;
            } else {
              mem.lastSeenTargetX = lookEntity.x;
              mem.lastSeenTargetY = lookEntity.y;
            }
            mem.searchSweep = 0;
            ob.facing = turnToward(ob.facing,
              Math.atan2(lookEntity.y - ob.y, lookEntity.x - ob.x), TURN_RATE * dt);
            const ld = dist2d(ob.x, ob.y, lookEntity.x, lookEntity.y);
            const delta = Math.min(FOV_FOCUS_SPEED * dt, Math.abs(ld - focusDist));
            focusDist += Math.sign(ld - focusDist) * delta;
          } else {
            // 広い視野でも見えない → 記憶位置方向に向いてからスイープ
            const angleToLast = Math.atan2(lastY - ob.y, lastX - ob.x);

            if (mem.searchSweep === 0 && Math.abs(normAngleDiff(ob.facing, angleToLast)) >= 0.1) {
              ob.facing = turnToward(ob.facing, angleToLast, TURN_RATE * dt);
            } else {
              mem.searchSweep += mem.searchDir * SEARCH_SWEEP_SPEED * dt;
              if (Math.abs(mem.searchSweep) > SEARCH_SWEEP_MAX) {
                mem.searchDir = (mem.searchDir * -1) as 1 | -1;
                mem.searchSweep = Math.sign(mem.searchSweep) * SEARCH_SWEEP_MAX;
              }
              ob.facing = turnToward(ob.facing, angleToLast + mem.searchSweep, TURN_RATE * dt);
            }

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
        }

        return { atLauncher, timer, focusDist };
      };

      // 妨害A: launcher ↔ 的1
      const scanA = updateScan(obA, s.obAScanAtLauncher, s.obAScanTimer, s.obAFocusDist, s.obAReacting, s.obAMem, targets[0]);
      s.obAScanAtLauncher = scanA.atLauncher;
      s.obAScanTimer = scanA.timer;
      s.obAFocusDist = scanA.focusDist;

      // 妨害B: launcher ↔ 的1
      const scanB = updateScan(obB, s.obBScanAtLauncher, s.obBScanTimer, s.obBFocusDist, false, s.obBMem, targets[0]);
      s.obBScanAtLauncher = scanB.atLauncher;
      s.obBScanTimer = scanB.timer;
      s.obBFocusDist = scanB.focusDist;

      // 妨害C: launcher ↔ 的1
      const scanC = updateScan(obC, s.obCScanAtLauncher, s.obCScanTimer, s.obCFocusDist, s.obCReacting, s.obCMem, targets[0]);
      s.obCScanAtLauncher = scanC.atLauncher;
      s.obCScanTimer = scanC.timer;
      s.obCFocusDist = scanC.focusDist;

      // 妨害D: launcher ↔ 的4
      const scanD = updateScan(obD, s.obDScanAtLauncher, s.obDScanTimer, s.obDFocusDist, s.obDReacting, s.obDMem, targets[3]);
      s.obDScanAtLauncher = scanD.atLauncher;
      s.obDScanTimer = scanD.timer;
      s.obDFocusDist = scanD.focusDist;

      // 妨害E: launcher ↔ 的5
      const scanE = updateScan(obE, s.obEScanAtLauncher, s.obEScanTimer, s.obEFocusDist, s.obEReacting, s.obEMem, targets[4]);
      s.obEScanAtLauncher = scanE.atLauncher;
      s.obEScanTimer = scanE.timer;
      s.obEFocusDist = scanE.focusDist;

      // エフェクト更新
      if (s.hitFx) { s.hitFx.age += dt; if (s.hitFx.age > 0.6) s.hitFx = null; }
      if (s.blockFx) { s.blockFx.age += dt; if (s.blockFx.age > 0.6) s.blockFx = null; }

      // === 描画 ===
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        // キャンバス全体クリア + 外周ラベル描画（translate前）
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        drawOuterLabels(ctx);

        // フィールド描画（LABEL_PADだけオフセット）
        ctx.save();
        ctx.translate(LABEL_PAD, LABEL_PAD);
        drawBoard(ctx);

        if (s.interceptPt) drawIntercept(ctx, s.interceptPt.x, s.interceptPt.y);

        // 視野コーン（常時表示・スライディングウィンドウ）
        const pf = s.preFire;
        const obMems = [s.obAMem, s.obBMem, s.obCMem, s.obDMem, s.obEMem];
        const obFocusDists = [s.obAFocusDist, s.obBFocusDist, s.obCFocusDist, s.obDFocusDist, s.obEFocusDist];
        for (let oi = 0; oi < allObs.length; oi++) {
          const inFOV = pf?.obInFOVs[oi] ?? false;
          drawFOV(ctx, allObs[oi], obFocusDists[oi], FOV_WINDOW_LEN, inFOV, obMems[oi].searching);
        }

        // 発射前: 到達圏（卵型）+ 予測軌道
        if (pf) {
          for (let oi = 0; oi < allObs.length; oi++) {
            drawReachCircle(ctx, allObs[oi], pf.obReaches[oi], pf.obBlocks[oi]);
          }
          drawTargetReach(ctx, targets[pf.targetIdx], pf.targetReach, pf.targetCanReach);
          drawTrajectoryLine(ctx, launcher.x, launcher.y, pf.estIPx, pf.estIPy, pf.blocked);
        }

        // 捜索中: 記憶位置に「?」マーカー表示
        const obLabels = ["A", "B", "C", "D", "E"];
        const obAtLaunchers = [s.obAScanAtLauncher, s.obBScanAtLauncher, s.obCScanAtLauncher, s.obDScanAtLauncher, s.obEScanAtLauncher];
        for (let oi = 0; oi < allObs.length; oi++) {
          const mem = obMems[oi];
          if (!mem.searching) continue;
          const atL = obAtLaunchers[oi];
          const lx = atL ? mem.lastSeenLauncherX : mem.lastSeenTargetX;
          const ly = atL ? mem.lastSeenLauncherY : mem.lastSeenTargetY;
          const what = atL ? "発射台?" : "的?";
          drawSearchMarker(ctx, lx, ly, `${obLabels[oi]}→${what}`);
        }

        // 妨害ラベル
        const obRoles = ["中間", "発射台", "的1", "的4", "的5"];
        for (let oi = 0; oi < allObs.length; oi++) {
          const lbl = obMems[oi].searching
            ? `妨害${obLabels[oi]}(捜索中)`
            : `妨害${obLabels[oi]}(${obRoles[oi]})`;
          drawObstacle(ctx, allObs[oi], lbl);
        }

        drawLauncher(ctx, launcher, aimAngle, pf?.blocked ?? false);

        // 全的を描画（選択中の的にはマーカー付き）
        const targetLabels = ["的1", "的2", "的3", "的4", "的5"];
        for (let ti = 0; ti < targets.length; ti++) {
          const lbl = ti === s.selectedTargetIdx ? `★${targetLabels[ti]}` : targetLabels[ti];
          drawTarget(ctx, targets[ti], lbl, TARGET_COLORS[ti]);
        }

        if (ball.active) drawBall(ctx, ball, s.trail);
        if (s.hitFx) drawFx(ctx, s.hitFx, 255, 255, 100);
        if (s.blockFx) drawFx(ctx, s.blockFx, 153, 102, 204);

        // スコアをReact stateに同期（フィールド外に表示）
        setScore({ hit: s.score.hit, miss: s.score.miss, block: s.score.block });

        ctx.restore(); // translate解除
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
        発射台→的1〜5の最も安全な的へ発射 | 的4=A1-B2固定 的5=S1-T2固定 | 妨害A=中間 B=発射台 C=的1 D=的4 E=的5 |
        向き: 前方1.0 / 左右0.7 / 後方0.5倍速 | 視野角: 近60°→遠20°（距離で狭まる）— FOV外のボールには反応不可
      </p>
      <div className="flex items-start gap-4">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="border border-gray-700 rounded"
        />
        <div className="font-mono text-sm space-y-2 pt-1">
          <div className="text-yellow-300">HIT: {score.hit}</div>
          <div className="text-purple-400">BLOCK: {score.block}</div>
          <div className="text-gray-400">MISS: {score.miss}</div>
        </div>
      </div>
    </div>
  );
}
