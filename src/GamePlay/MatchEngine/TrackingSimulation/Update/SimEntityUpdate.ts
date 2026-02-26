/**
 * SimEntityUpdate - ターゲット/障害物の移動とスキャン更新（重複除去の核心）
 * ball-active / ball-not-active で重複していたロジックを統一する。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState, SimMover, SimBall } from "../Types/TrackingSimTypes";
import {
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  turnToward,
  turnNeckToward,
  turnTorsoToward,
} from "../Movement/MovementCore";
import { TURN_RATE, NECK_TURN_RATE, TORSO_TURN_RATE } from "../Config/FieldConfig";
import {
  moveSecondHandler,
  moveSlasher,
  moveScreener,
  moveDunker,
  moveSpacer,
} from "../Movement/RoleMovement";
import { updateScan } from "../Decision/ScanSystem";
import { canEntityMove, applyMoveAction } from "./SimActionManager";
import { OB_CONFIGS } from "../Config/ObstacleDefenseConfig";

/**
 * ターゲットのロール別移動を実行（重複除去）
 * @param skipIdx ball-active時に選択ターゲットをスキップする場合のインデックス（-1で全て実行）
 */
export function updateTargetRoleMovements(state: SimState, dt: number, skipIdx: number): void {
  const { launcher, targets, obstacles } = state;
  const getOtherTargets = (ti: number): SimMover[] =>
    targets.filter((_, i) => i !== ti);

  for (let ti = 0; ti < targets.length; ti++) {
    if (ti === skipIdx) continue;
    const entityIdx = 1 + ti;
    if (!canEntityMove(state.actionStates, entityIdx)) {
      applyMoveAction(state, entityIdx, targets[ti], dt);
      continue;
    }

    const others = getOtherTargets(ti);
    switch (ti) {
      case 0: {
        const res = moveSecondHandler(
          targets[0], state.targetDests[0], state.targetReevalTimers[0],
          dt, launcher, obstacles, others,
        );
        state.targetDests[0] = res.dest;
        state.targetReevalTimers[0] = res.reevalTimer;
        break;
      }
      case 1:
        moveSlasher(targets[1], state.slasherState, dt, launcher, obstacles, others);
        break;
      case 2:
        moveScreener(targets[2], state.screenerState, dt, launcher, obstacles, others);
        break;
      case 3:
        moveDunker(targets[3], state.dunkerState, dt, launcher, obstacles, others);
        break;
      case 4: {
        const res = moveSpacer(
          targets[4], state.targetDests[4], state.targetReevalTimers[4],
          dt, launcher, obstacles, others,
        );
        state.targetDests[4] = res.dest;
        state.targetReevalTimers[4] = res.reevalTimer;
        break;
      }
    }
    applyMoveAction(state, entityIdx, targets[ti], dt);
  }
}

/**
 * 全5障害物の移動を統一処理。
 * obReacting[i] が true ならインターセプト移動、false ならロール別アイドル移動。
 */
export function updateObstacleMovements(state: SimState, dt: number, passerMover: SimMover): void {
  const { targets, obstacles } = state;
  const selReceiverIdx = state.selectedReceiverEntityIdx;
  const selTarget = selReceiverIdx === 0 ? state.launcher : targets[selReceiverIdx - 1];

  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    const ob = obstacles[oi];
    if (state.obReacting[oi]) {
      moveWithFacing(ob, cfg.interceptSpeed, dt);
    } else if (!state.obMems[oi].searching) {
      if (cfg.chaseTarget === 'mark') {
        // --- BALL_MARKER: パッサー正面のマーク位置 ---
        const tgt = selTarget;
        const ldx = tgt.x - passerMover.x;
        const ldz = tgt.z - passerMover.z;
        const lDist = Math.sqrt(ldx * ldx + ldz * ldz);
        let markX: number, markZ: number;
        if (lDist > 0.01) {
          markX = passerMover.x + (ldx / lDist) * cfg.markDistance;
          markZ = passerMover.z + (ldz / lDist) * cfg.markDistance;
        } else {
          markX = passerMover.x + Math.cos(passerMover.facing) * cfg.markDistance;
          markZ = passerMover.z + Math.sin(passerMover.facing) * cfg.markDistance;
        }
        setChaserVelocity(ob, markX, markZ, cfg.idleSpeed, cfg.markHover, dt);
        moveKeepFacing(ob, cfg.idleSpeed, dt);
        // facing をパッサー方向に向ける
        const angle = Math.atan2(passerMover.z - ob.z, passerMover.x - ob.x);
        ob.facing = turnToward(ob.facing, angle, TURN_RATE * dt);
        ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, angle, TORSO_TURN_RATE * dt);
        ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, angle, NECK_TURN_RATE * dt);
      } else if (cfg.chaseTarget === 'midpoint') {
        // --- HELP_DEFENDER: パッサー⇔selectedReceiver の中間点 ---
        const chaseX = (passerMover.x + selTarget.x) / 2;
        const chaseZ = (passerMover.z + selTarget.z) / 2;
        setChaserVelocity(ob, chaseX, chaseZ, cfg.idleSpeed, cfg.hoverRadius, dt);
        moveKeepFacing(ob, cfg.idleSpeed, dt);
      } else {
        // --- MAN_MARKER: targets[n] を追跡 ---
        const chaseX = targets[cfg.chaseTarget].x;
        const chaseZ = targets[cfg.chaseTarget].z;
        setChaserVelocity(ob, chaseX, chaseZ, cfg.idleSpeed, cfg.hoverRadius, dt);
        moveKeepFacing(ob, cfg.idleSpeed, dt);
      }
    }
  }
}

/**
 * 5障害物のスキャン状態を更新
 */
/**
 * オフェンス側（launcher + targets）の torsoFacing + neckFacing を更新。
 * 下半身 → 上半身 → 首 の3段階回転階層。
 * - Launcher: パス時は選択ターゲット方向、それ以外はbody facing方向へ戻る
 * - Targets: キャッチ時 or ボール飛行中の選択ターゲットはボール方向、それ以外はfacing方向へ戻る
 */
export function updateOffenseTorsoNeckFacing(
  state: SimState, ballActive: boolean, ballPosition: Vector3 | null, dt: number,
): void {
  const { launcher, targets } = state;
  const neckDelta = NECK_TURN_RATE * dt;
  const torsoDelta = TORSO_TURN_RATE * dt;
  const allOffense: SimMover[] = [launcher, ...targets];

  // --- 全オフェンスエンティティ ---
  for (let ei = 0; ei < allOffense.length; ei++) {
    const mover = allOffense[ei];
    const action = state.actionStates[ei];

    if (action.type === 'pass') {
      // パス中: 選択レシーバーの方向を見る
      const receiver = ei === 0
        ? targets[state.selectedReceiverEntityIdx - 1]  // launcher がパッサー → targets から
        : (state.selectedReceiverEntityIdx === 0 ? launcher : targets[state.selectedReceiverEntityIdx - 1]);
      const angle = Math.atan2(receiver.z - mover.z, receiver.x - mover.x);
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
    } else if (action.type === 'catch' && ballPosition) {
      // キャッチ中: ボール方向を見る
      const angle = Math.atan2(ballPosition.z - mover.z, ballPosition.x - mover.x);
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
    } else if (ballActive && ei === state.selectedReceiverEntityIdx && ballPosition) {
      // ボール飛行中の選択レシーバー: ボール方向を見る
      const angle = Math.atan2(ballPosition.z - mover.z, ballPosition.x - mover.x);
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
    } else {
      // デフォルト: 体の向きに戻す
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, mover.facing, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, mover.facing, neckDelta);
    }
  }
}

export function updateScans(state: SimState, ballActive: boolean, ballPosition: Vector3, dt: number): void {
  const { launcher, targets, obstacles } = state;
  const scanBallPos = ballActive ? ballPosition : Vector3.Zero();
  const simBall: SimBall = {
    active: ballActive,
    x: scanBallPos.x, z: scanBallPos.z,
    vx: 0, vz: 0, age: state.ballAge,
  };
  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    if (!cfg.scanEnabled) continue;
    const watchTarget = targets[cfg.scanWatchTargetIdx];
    const result = updateScan(
      obstacles[oi], state.obScanAtLauncher[oi], state.obScanTimers[oi],
      state.obFocusDists[oi], state.obReacting[oi], state.obMems[oi],
      watchTarget, launcher, simBall, dt,
    );
    state.obScanAtLauncher[oi] = result.atLauncher;
    state.obScanTimers[oi] = result.timer;
    state.obFocusDists[oi] = result.focusDist;
  }
}
