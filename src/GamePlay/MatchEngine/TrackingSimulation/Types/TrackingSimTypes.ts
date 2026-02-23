export interface SimMover {
  x: number; z: number;
  vx: number; vz: number;
  speed: number;
  facing: number;
  nextTurn: number;
}

export interface SimBall {
  active: boolean;
  x: number; z: number;
  vx: number; vz: number;
  age: number;
}

export interface SimScanMemory {
  lastSeenLauncherX: number;
  lastSeenLauncherZ: number;
  lastSeenTargetX: number;
  lastSeenTargetZ: number;
  searching: boolean;
  searchSweep: number;
  searchDir: 1 | -1;
}

export interface SimPreFireInfo {
  targetIdx: number;
  estFlightTime: number;
  estIPx: number;
  estIPz: number;
  obReaches: number[];
  obInFOVs: boolean[];
  obBlocks: boolean[];
  targetReach: number;
  targetCanReach: boolean;
  blocked: boolean;
}

export interface TrackingSimScore {
  hit: number;
  block: number;
  miss: number;
}

export interface LauncherState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  bestPassTargetIdx: number;
}

export interface SlasherState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  vcutPhase: number;
  vcutActive: boolean;
}

export interface ScreenerState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  screenSet: boolean;
  holdTimer: number;
}

export interface DunkerState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  sealing: boolean;
}

export interface ScanResult {
  atLauncher: boolean;
  timer: number;
  focusDist: number;
}

// =========================================================================
// BallFireAction types
// =========================================================================

/** 発射評価に必要な状態スナップショット */
export interface BallFireContext {
  launcher: SimMover;
  targets: SimMover[];
  obstacles: SimMover[];
  obIntSpeeds: number[];
}

/** プレファイア評価の結果 */
export interface PreFireEvalResult {
  selectedTargetIdx: number;
  preFire: SimPreFireInfo | null;
}

/** 発射ソリューション */
export interface FireSolution {
  targetIdx: number;
  interceptX: number;
  interceptZ: number;
  flightTime: number;
  targetVelocity: { vx: number; vz: number };
  obInFOVs: boolean[];
}

/** 障害物のリアクション */
export interface ObstacleReaction {
  obstacleIdx: number;
  reacting: boolean;
  vx: number;
  vz: number;
}

/** 発射試行の結果 */
export interface FireAttemptResult {
  fired: boolean;
  solution: FireSolution | null;
  newCooldown: number;
}

/** ボール結果判定 */
export type BallResultType = 'block' | 'hit' | 'miss' | 'none';

export interface BallResultDetection {
  result: BallResultType;
  cooldownTime: number;
}
