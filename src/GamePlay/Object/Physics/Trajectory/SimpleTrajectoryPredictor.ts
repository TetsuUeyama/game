/**
 * シンプルな軌道予測ユーティリティ
 *
 * 物理エンジン非依存の軌道予測関数群。
 * 放物線運動（重力のみ、空気抵抗なし）の解析解を使用。
 */

/**
 * 軌道予測の点
 */
export interface SimpleTrajectoryPoint {
  x: number;
  y: number;
  z: number;
  time: number;
}

/**
 * 3Dベクトル（シンプル型）
 */
interface Vec3Input {
  x: number;
  y: number;
  z: number;
}

/**
 * 軌道の点列を計算（放物線運動、重力のみ）
 *
 * @param position 現在位置
 * @param velocity 現在速度
 * @param gravity 重力加速度（負の値、例: -9.81）
 * @param timeStep サンプリング間隔（秒）
 * @param maxTime 最大予測時間（秒）
 * @param groundY 地面のY座標
 * @returns 軌道上の点の配列
 */
export function predictTrajectoryPoints(
  position: Vec3Input,
  velocity: Vec3Input,
  gravity: number,
  timeStep: number,
  maxTime: number,
  groundY: number = 0
): SimpleTrajectoryPoint[] {
  const sampleCount = Math.ceil(maxTime / timeStep);
  const points: SimpleTrajectoryPoint[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const t = i * timeStep;
    const py = position.y + velocity.y * t + 0.5 * gravity * t * t;

    if (py < groundY && i > 0) break;

    points.push({
      x: position.x + velocity.x * t,
      y: py,
      z: position.z + velocity.z * t,
      time: t,
    });
  }

  return points;
}

/**
 * 着地点を二次方程式で計算（放物線運動、重力のみ）
 *
 * y(t) = y0 + vy*t + 0.5*g*t²  を解いて y(t) = groundY となる t を求める
 *
 * @param position 現在位置
 * @param velocity 現在速度
 * @param gravity 重力加速度（負の値、例: -9.81）
 * @param groundY 地面のY座標
 * @returns 着地点の座標、または着地しない場合は null
 */
export function predictLandingPoint(
  position: Vec3Input,
  velocity: Vec3Input,
  gravity: number,
  groundY: number = 0
): { x: number; y: number; z: number } | null {
  const y0 = position.y - groundY;
  if (y0 <= 0) return null;

  // 0.5*g*t² + vy*t + y0 = 0
  const a = 0.5 * gravity;
  const b = velocity.y;
  const c = y0;
  const disc = b * b - 4 * a * c;

  if (disc < 0) return null;

  const sq = Math.sqrt(disc);
  const t = Math.max((-b + sq) / (2 * a), (-b - sq) / (2 * a));

  if (t <= 0) return null;

  return {
    x: position.x + velocity.x * t,
    y: groundY,
    z: position.z + velocity.z * t,
  };
}
