/**
 * SimPlayerStateManager — 読み取り専用スナップショット層
 *
 * 毎フレーム SimState から全エンティティのスナップショットを構築し、
 * インデックスクエリを提供する。Phase 1 では読み取り専用のみ。
 */

import type { SimState } from "../Types/TrackingSimTypes";
import { SimEntityState, SimDefenseRole } from "../Types/SimPlayerStateTypes";
import type { SimEntitySnapshot } from "../Types/SimPlayerStateTypes";
import { ROLE_ASSIGNMENTS } from "../Config/RoleConfig";
import type { SimOffenseRole } from "../Config/RoleConfig";
import { OB_CONFIGS } from "../Config/ObstacleDefenseConfig";
import { dist2d } from "../Movement/MovementCore";

export class SimPlayerStateManager {
  // --- ストレージ ---
  private snapshots: SimEntitySnapshot[] = [];
  private indexByIdx: Map<number, SimEntitySnapshot> = new Map();
  private offensePlayers: SimEntitySnapshot[] = [];
  private defensePlayers: SimEntitySnapshot[] = [];
  private stateIndex: Map<SimEntityState, SimEntitySnapshot[]> = new Map();
  private defenseRoleIndex: Map<SimDefenseRole, SimEntitySnapshot[]> = new Map();

  // --- オフェンスロール（RoleConfig から構築） ---
  private static readonly OFFENSE_ROLES: (SimOffenseRole | null)[] = (() => {
    const roles: (SimOffenseRole | null)[] = new Array(11).fill(null);
    roles[0] = ROLE_ASSIGNMENTS.launcher.role;
    for (let i = 0; i < ROLE_ASSIGNMENTS.targets.length; i++) {
      roles[1 + i] = ROLE_ASSIGNMENTS.targets[i].role;
    }
    return roles;
  })();

  // =========================================================================
  // update — 毎フレーム再構築
  // =========================================================================

  update(state: SimState): void {
    // インデックスをクリア
    this.snapshots.length = 0;
    this.offensePlayers.length = 0;
    this.defensePlayers.length = 0;
    this.indexByIdx.clear();
    this.stateIndex.clear();
    this.defenseRoleIndex.clear();

    // --- Launcher (entityIdx = 0) ---
    this.buildOffenseSnapshot(state, 0, state.launcher);

    // --- Targets (entityIdx 1-5) ---
    for (let i = 0; i < state.targets.length; i++) {
      this.buildOffenseSnapshot(state, 1 + i, state.targets[i]);
    }

    // --- Obstacles (entityIdx 6-10) ---
    for (let oi = 0; oi < state.obstacles.length; oi++) {
      this.buildDefenseSnapshot(state, 6 + oi, state.obstacles[oi], oi);
    }
  }

  // =========================================================================
  // スナップショット構築（内部）
  // =========================================================================

  private buildOffenseSnapshot(
    state: SimState,
    entityIdx: number,
    mover: { x: number; z: number; vx: number; vz: number; facing: number },
  ): void {
    const action = state.actionStates[entityIdx];

    // entityState 判定
    let entityState: SimEntityState;
    if (action.type === "pass") {
      entityState = SimEntityState.PASSING;
    } else if (action.type === "catch") {
      entityState = SimEntityState.CATCHING;
    } else if (entityIdx === state.onBallEntityIdx) {
      entityState = SimEntityState.ON_BALL;
    } else {
      entityState = SimEntityState.OFF_BALL;
    }

    const snap: SimEntitySnapshot = {
      entityIdx,
      team: "offense",
      x: mover.x,
      z: mover.z,
      vx: mover.vx,
      vz: mover.vz,
      facing: mover.facing,
      entityState,
      offenseRole: SimPlayerStateManager.OFFENSE_ROLES[entityIdx],
      defenseRole: null,
      markTargetIdx: null,
      actionType: action.type,
      actionPhase: action.phase,
      hasBall: entityIdx === state.onBallEntityIdx && action.type !== "pass",
      searching: false,
      lastSeenTarget: null,
      scanFocusDist: 0,
    };

    this.registerSnapshot(snap);
  }

  private buildDefenseSnapshot(
    state: SimState,
    entityIdx: number,
    mover: { x: number; z: number; vx: number; vz: number; facing: number },
    oi: number,  // obstacle index (0-4)
  ): void {
    const action = state.actionStates[entityIdx];
    const cfg = OB_CONFIGS[oi];
    const defenseRole = cfg.role;
    const mem = state.obMems[oi];
    const atLauncher = state.obScanAtLauncher[oi];

    // entityState 判定
    let entityState: SimEntityState;
    if (state.obReacting[oi]) {
      entityState = SimEntityState.INTERCEPTING;
    } else if (mem.searching) {
      entityState = SimEntityState.SEARCHING;
    } else if (defenseRole === SimDefenseRole.HELP_DEFENDER) {
      entityState = SimEntityState.HELP;
    } else {
      entityState = SimEntityState.MARKING;
    }

    const snap: SimEntitySnapshot = {
      entityIdx,
      team: "defense",
      x: mover.x,
      z: mover.z,
      vx: mover.vx,
      vz: mover.vz,
      facing: mover.facing,
      entityState,
      offenseRole: null,
      defenseRole,
      markTargetIdx: cfg.markTargetEntityIdx,
      actionType: action.type,
      actionPhase: action.phase,
      hasBall: false,
      searching: mem.searching,
      lastSeenTarget: mem.searching
        ? {
            x: atLauncher ? mem.lastSeenLauncherX : mem.lastSeenTargetX,
            z: atLauncher ? mem.lastSeenLauncherZ : mem.lastSeenTargetZ,
          }
        : null,
      scanFocusDist: state.obFocusDists[oi],
    };

    this.registerSnapshot(snap);
  }

  private registerSnapshot(snap: SimEntitySnapshot): void {
    this.snapshots.push(snap);
    this.indexByIdx.set(snap.entityIdx, snap);

    // チーム別
    if (snap.team === "offense") {
      this.offensePlayers.push(snap);
    } else {
      this.defensePlayers.push(snap);
    }

    // 状態インデックス
    const byState = this.stateIndex.get(snap.entityState);
    if (byState) {
      byState.push(snap);
    } else {
      this.stateIndex.set(snap.entityState, [snap]);
    }

    // 守備ロールインデックス
    if (snap.defenseRole !== null) {
      const byRole = this.defenseRoleIndex.get(snap.defenseRole);
      if (byRole) {
        byRole.push(snap);
      } else {
        this.defenseRoleIndex.set(snap.defenseRole, [snap]);
      }
    }
  }

  // =========================================================================
  // クエリ API
  // =========================================================================

  /** 全エンティティのスナップショットを返す */
  getAll(): readonly SimEntitySnapshot[] {
    return this.snapshots;
  }

  /** entityIdx でスナップショットを取得 */
  getByIdx(entityIdx: number): SimEntitySnapshot | undefined {
    return this.indexByIdx.get(entityIdx);
  }

  /** チーム別のスナップショット一覧 */
  getByTeam(team: "offense" | "defense"): readonly SimEntitySnapshot[] {
    return team === "offense" ? this.offensePlayers : this.defensePlayers;
  }

  /** 戦術状態でフィルタ */
  getByState(state: SimEntityState): readonly SimEntitySnapshot[] {
    return this.stateIndex.get(state) ?? [];
  }

  /** 守備ロールでフィルタ */
  getByDefenseRole(role: SimDefenseRole): readonly SimEntitySnapshot[] {
    return this.defenseRoleIndex.get(role) ?? [];
  }

  /** ボール保持者を返す（いなければ null） */
  getBallHolder(): SimEntitySnapshot | null {
    for (const snap of this.snapshots) {
      if (snap.hasBall) return snap;
    }
    return null;
  }

  /** 守備側エンティティのマーク対象スナップショットを返す */
  getMarkTarget(obstacleEntityIdx: number): SimEntitySnapshot | null {
    const obSnap = this.indexByIdx.get(obstacleEntityIdx);
    if (!obSnap || obSnap.markTargetIdx === null) return null;
    return this.indexByIdx.get(obSnap.markTargetIdx) ?? null;
  }

  /** 指定した攻撃側エンティティをマークしている守備側を返す */
  getMarkerOf(targetEntityIdx: number): SimEntitySnapshot | null {
    for (const snap of this.defensePlayers) {
      if (snap.markTargetIdx === targetEntityIdx) return snap;
    }
    return null;
  }

  /** 最も近いエンティティを返す（チームフィルタ任意） */
  findNearest(x: number, z: number, team?: "offense" | "defense"): SimEntitySnapshot | null {
    const pool = team ? (team === "offense" ? this.offensePlayers : this.defensePlayers) : this.snapshots;
    let best: SimEntitySnapshot | null = null;
    let bestDist = Infinity;
    for (const snap of pool) {
      const d = dist2d(x, z, snap.x, snap.z);
      if (d < bestDist) {
        bestDist = d;
        best = snap;
      }
    }
    return best;
  }

  /** 指定半径内のエンティティ一覧（チームフィルタ任意） */
  findInRadius(x: number, z: number, radius: number, team?: "offense" | "defense"): SimEntitySnapshot[] {
    const pool = team ? (team === "offense" ? this.offensePlayers : this.defensePlayers) : this.snapshots;
    const r2 = radius * radius;
    const result: SimEntitySnapshot[] = [];
    for (const snap of pool) {
      const dx = x - snap.x;
      const dz = z - snap.z;
      if (dx * dx + dz * dz <= r2) {
        result.push(snap);
      }
    }
    return result;
  }
}
