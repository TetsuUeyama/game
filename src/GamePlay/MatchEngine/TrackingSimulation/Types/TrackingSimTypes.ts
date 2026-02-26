export interface SimMover {
  x: number; z: number;
  vx: number; vz: number;
  speed: number;
  facing: number;        // 下半身の向き
  torsoFacing: number;   // 上半身の向き
  neckFacing: number;    // 首の向き（基準が上半身）
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
  steal: number;   // ディフェンス成功（ルーズボール確保）
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
// Action common types
// =========================================================================

/** アクションのフェーズ */
export type ActionPhase = 'idle' | 'startup' | 'active' | 'recovery';

/** アクションの種類 */
export type ActionType = 'idle' | 'pass' | 'move' | 'catch' | 'obstacle_react';

/**
 * アクションのタイミング定義（秒）
 * startup → active → recovery の順に遷移する
 */
export interface ActionTiming {
  /** 実行し発生するまでの時間（予備動作） */
  startup: number;
  /** アクションの実行時間 */
  active: number;
  /** 実行後、次の行動に移行できるまでの時間（硬直） */
  recovery: number;
}

/** アクションの実行時ランタイム状態 */
export interface ActionState {
  /** アクションの種類 */
  type: ActionType;
  phase: ActionPhase;
  /** 現在フェーズの経過時間 */
  elapsed: number;
  /** アクションのタイミング定義（idleの時はnull） */
  timing: ActionTiming | null;
}

// =========================================================================
// PassAction types
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

// =========================================================================
// Push Obstruction
// =========================================================================

/** プッシュ妨害情報 */
export interface PushObstructionInfo {
  obstacleIdx: number;       // 障害物インデックス (0-4)
  targetEntityIdx: number;   // マーク対象entityIdx (0=launcher, 1-4=targets)
  pushArm: 'left' | 'right'; // 使用する腕
  armTargetX: number;        // 腕ターゲットX
  armTargetZ: number;        // 腕ターゲットZ
}

// =========================================================================
// Simulation state (shared across update modules)
// =========================================================================

/** TrackingSimulation3D の全ランタイム状態を集約 */
export interface SimState {
  launcher: SimMover;
  targets: SimMover[];
  obstacles: SimMover[];
  ballActive: boolean;
  ballAge: number;
  score: TrackingSimScore;
  cooldown: number;
  onBallEntityIdx: number;
  selectedReceiverEntityIdx: number;
  preFire: SimPreFireInfo | null;
  interceptPt: { x: number; z: number } | null;
  obReacting: boolean[];
  actionStates: ActionState[];
  pendingFire: FireSolution | null;
  pendingCooldown: number;
  moveDistAccum: number[];
  obScanAtLauncher: boolean[];
  obScanTimers: number[];
  obFocusDists: number[];
  obMems: SimScanMemory[];
  targetDests: ({ x: number; z: number } | null)[];
  targetReevalTimers: number[];
  launcherState: LauncherState;
  slasherState: SlasherState;
  screenerState: ScreenerState;
  dunkerState: DunkerState;
  obstacleDeflectCooldowns: number[];
  pushObstructions: PushObstructionInfo[];
  looseBall: boolean;  // ルーズボール状態フラグ
  offenseInTransit: boolean[];  // オフェンスがゾーンへ移動中フラグ (launcher + targets)
}
