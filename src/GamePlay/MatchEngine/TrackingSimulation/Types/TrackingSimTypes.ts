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
