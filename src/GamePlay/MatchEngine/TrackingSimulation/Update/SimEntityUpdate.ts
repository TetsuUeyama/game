/**
 * SimEntityUpdate - ターゲット/障害物の移動とスキャン更新（重複除去の核心）
 * ball-active / ball-not-active で重複していたロジックを統一する。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState, SimMover, SimBall, PushObstructionInfo } from "../Types/TrackingSimTypes";
import {
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  turnToward,
  turnNeckToward,
  turnTorsoToward,
} from "../Movement/MovementCore";
import { TURN_RATE, NECK_TURN_RATE, TORSO_TURN_RATE, ONBALL_MARK_DISTANCE, ONBALL_MARK_HOVER, PUSH_ACTIVATION_DIST, PUSH_SPEED_MULT, PUSH_HAND_REACH, PUSH_DENY_OFFSET, PUSH_DENY_HOVER } from "../Config/FieldConfig";
import {
  moveSecondHandler,
  moveSlasher,
  moveScreener,
  moveDunker,
} from "../Movement/RoleMovement";
import { updateScan } from "../Decision/ScanSystem";
import { canEntityMove, applyMoveAction } from "./SimActionManager";
import { OB_CONFIGS } from "../Config/ObstacleDefenseConfig";

/**
 * MAN_MARKER がターゲットに近接している場合のプッシュ妨害情報を計算する。
 * 条件: スキャン中でない、リアクション中でない、マーク対象がオンボールでない、
 *       距離が PUSH_ACTIVATION_DIST 以内。
 */
export function computePushObstructions(state: SimState): void {
  const result: PushObstructionInfo[] = [];
  const { launcher, targets, obstacles } = state;

  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    // スキャン中でない
    if (state.obMems[oi].searching) continue;
    // リアクション中でない
    if (state.obReacting[oi]) continue;

    const markEntityIdx = cfg.markTargetEntityIdx;
    // マーク対象がオンボールでない（オンボール時はオンボールディフェンスで処理）
    if (markEntityIdx === state.onBallEntityIdx) continue;

    const ob = obstacles[oi];
    const markTarget = markEntityIdx === 0 ? launcher : targets[markEntityIdx - 1];
    const dx = markTarget.x - ob.x;
    const dz = markTarget.z - ob.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > PUSH_ACTIVATION_DIST) continue;

    // 腕の左右判定: ターゲットが facing 方向に対してどちら側か（外積で判定）
    const cross = Math.cos(ob.facing) * dz - Math.sin(ob.facing) * dx;
    const pushArm: 'left' | 'right' = cross >= 0 ? 'left' : 'right';

    result.push({
      obstacleIdx: oi,
      targetEntityIdx: markEntityIdx,
      pushArm,
      armTargetX: markTarget.x,
      armTargetZ: markTarget.z,
    });
  }

  state.pushObstructions = result;
}

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

    // 移動前の位置を保存（プッシュ減衰用）
    const prevX = targets[ti].x;
    const prevZ = targets[ti].z;

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
    }

    // プッシュ妨害による速度減衰を適用
    const pushInfo = state.pushObstructions.find(p => p.targetEntityIdx === entityIdx);
    if (pushInfo) {
      const ob = obstacles[pushInfo.obstacleIdx];
      const dx = targets[ti].x - ob.x;
      const dz = targets[ti].z - ob.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= PUSH_HAND_REACH) {
        // 変位を PUSH_SPEED_MULT で縮小
        const moveX = targets[ti].x - prevX;
        const moveZ = targets[ti].z - prevZ;
        targets[ti].x = prevX + moveX * PUSH_SPEED_MULT;
        targets[ti].z = prevZ + moveZ * PUSH_SPEED_MULT;
      }
    }

    applyMoveAction(state, entityIdx, targets[ti], dt);
  }
}

/**
 * 全5障害物の移動を統一処理（全MAN_MARKER）。
 * obReacting[i] が true ならインターセプト移動、false ならマーク対象追跡。
 * マーク対象がオンボールの場合はパスコース遮断スタンスに自動切替。
 */
export function updateObstacleMovements(state: SimState, dt: number, passerMover: SimMover): void {
  const { launcher, targets, obstacles } = state;
  const selReceiverIdx = state.selectedReceiverEntityIdx;
  const selTarget = selReceiverIdx === 0 ? launcher : targets[selReceiverIdx - 1];

  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    const ob = obstacles[oi];

    if (state.obReacting[oi]) {
      moveWithFacing(ob, cfg.interceptSpeed, dt);
      continue;
    }

    const markEntityIdx = cfg.markTargetEntityIdx;
    const markTarget = markEntityIdx === 0 ? launcher : targets[markEntityIdx - 1];

    if (markEntityIdx === state.onBallEntityIdx) {
      // オンボール切替時: searching をクリア（スキャンより優先）
      state.obMems[oi].searching = false;
      // --- オンボールディフェンス: パスコース遮断スタンス ---
      const ldx = selTarget.x - markTarget.x;
      const ldz = selTarget.z - markTarget.z;
      const lDist = Math.sqrt(ldx * ldx + ldz * ldz);
      let markX: number, markZ: number;
      if (lDist > 0.01) {
        markX = markTarget.x + (ldx / lDist) * ONBALL_MARK_DISTANCE;
        markZ = markTarget.z + (ldz / lDist) * ONBALL_MARK_DISTANCE;
      } else {
        markX = markTarget.x + Math.cos(markTarget.facing) * ONBALL_MARK_DISTANCE;
        markZ = markTarget.z + Math.sin(markTarget.facing) * ONBALL_MARK_DISTANCE;
      }
      setChaserVelocity(ob, markX, markZ, cfg.idleSpeed, ONBALL_MARK_HOVER, dt);
      moveKeepFacing(ob, cfg.idleSpeed, dt);
      // facing をマーク対象方向に向ける
      const angle = Math.atan2(markTarget.z - ob.z, markTarget.x - ob.x);
      ob.facing = turnToward(ob.facing, angle, TURN_RATE * dt);
      ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, angle, TORSO_TURN_RATE * dt);
      ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, angle, NECK_TURN_RATE * dt);
    } else if (!state.obMems[oi].searching) {
      // --- オフボール: マーク対象追跡 ---
      const tdx = markTarget.x - ob.x;
      const tdz = markTarget.z - ob.z;
      const tDist = Math.sqrt(tdx * tdx + tdz * tdz);

      if (tDist < PUSH_ACTIVATION_DIST) {
        // ディナイモード: パッサーとマーク対象の間に入りつつプッシュ
        const pdx = passerMover.x - markTarget.x;
        const pdz = passerMover.z - markTarget.z;
        const pDist = Math.sqrt(pdx * pdx + pdz * pdz);
        let denyX: number, denyZ: number;
        if (pDist > 0.01) {
          denyX = markTarget.x + (pdx / pDist) * PUSH_DENY_OFFSET;
          denyZ = markTarget.z + (pdz / pDist) * PUSH_DENY_OFFSET;
        } else {
          denyX = markTarget.x;
          denyZ = markTarget.z;
        }
        setChaserVelocity(ob, denyX, denyZ, cfg.idleSpeed, PUSH_DENY_HOVER, dt);
        moveKeepFacing(ob, cfg.idleSpeed, dt);
        // facing をマーク対象方向に向ける
        const angle = Math.atan2(markTarget.z - ob.z, markTarget.x - ob.x);
        ob.facing = turnToward(ob.facing, angle, TURN_RATE * dt);
        ob.torsoFacing = turnTorsoToward(ob.facing, ob.torsoFacing, angle, TORSO_TURN_RATE * dt);
        ob.neckFacing = turnNeckToward(ob.torsoFacing, ob.neckFacing, angle, NECK_TURN_RATE * dt);
      } else {
        // 通常追跡
        setChaserVelocity(ob, markTarget.x, markTarget.z, cfg.idleSpeed, cfg.hoverRadius, dt);
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
    // オンボールマーカーはスキャンスキップ（facing は movement で制御）
    if (cfg.markTargetEntityIdx === state.onBallEntityIdx) continue;
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
