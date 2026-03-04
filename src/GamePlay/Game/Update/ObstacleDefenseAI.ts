/**
 * ObstacleDefenseAI - ディフェンス障害物のヘルプ割り当て・移動・プッシュ妨害
 * SimEntityUpdate.ts から抽出。
 */

import type { SimState, SimMover, PushObstructionInfo } from "../Types/TrackingSimTypes";
import {
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  dist2d,
  orientToward,
} from "../Movement/MovementCore";
import {
  ONBALL_GOAL_DIST_FAR, ONBALL_GOAL_DIST_CLOSE,
  ONBALL_MARK_DIST_FAR, ONBALL_MARK_DIST_CLOSE,
  ONBALL_HOVER_FAR, ONBALL_HOVER_CLOSE,
  ONBALL_RECOVERY_DIST, ONBALL_PASS_CONTEST_DIST,
  OFFBALL_DENY_OFFSET,
  PUSH_ACTIVATION_DIST, PUSH_DENY_OFFSET, PUSH_DENY_HOVER,
  DEFENSE_ENGAGE_Z, DEFENSE_GOAL_OFFSET, FREE_PLAYER_DIST, SPRINT_TRIGGER_DIST,
  BEATEN_GOAL_DIST_MARGIN,
} from "../Config/DefenseConfig";
import { GOAL_RIM_X, GOAL_RIM_Z } from "../Config/ShootConfig";
import { OB_CONFIGS } from "../Decision/ObstacleRoleAssignment";
import { INIT_OBSTACLES } from "../Config/EntityConfig";
import { isAirborne } from "../Movement/JumpPhysics";
import { JUMP_HORIZONTAL_MULT } from "../Config/JumpConfig";

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
 * ヘルプディフェンス割り当てを計算する。
 *
 * 優先順位:
 * 1. オンボールDFが抜かれた → 最寄りのオフボールDFが進路を塞ぐ（最優先）
 * 2. フリーのオフボール選手 → 指定マーカーがスプリント or 最寄りDFがヘルプ
 *
 * @returns Map<obstacleIdx, helpTargetEntityIdx>
 */
export function computeHelpAssignments(
  state: SimState, allOffense: SimMover[],
): Map<number, number> {
  const { obstacles } = state;
  const result = new Map<number, number>();
  const assigned = new Set<number>();

  // =================================================================
  // Priority 1: オンボールDFが抜かれた → ヘルプDF がオンボールOFの進路を塞ぐ
  // =================================================================
  const onBallMover = allOffense[state.onBallEntityIdx];
  const onBallDefOi = OB_CONFIGS.findIndex(c => c.markTargetEntityIdx === state.onBallEntityIdx);

  if (onBallDefOi >= 0 && !state.obReacting[onBallDefOi]) {
    const onBallDef = obstacles[onBallDefOi];
    const offGoalDist = dist2d(onBallMover.x, onBallMover.z, GOAL_RIM_X, GOAL_RIM_Z);
    const defGoalDist = dist2d(onBallDef.x, onBallDef.z, GOAL_RIM_X, GOAL_RIM_Z);

    if (defGoalDist > offGoalDist + BEATEN_GOAL_DIST_MARGIN) {
      // 抜かれた！→ ゴールライン上の防御位置に最も近いDFをヘルプに回す
      const gd = offGoalDist || 1;
      const helpPosX = onBallMover.x + ((GOAL_RIM_X - onBallMover.x) / gd) * DEFENSE_GOAL_OFFSET;
      const helpPosZ = onBallMover.z + ((GOAL_RIM_Z - onBallMover.z) / gd) * DEFENSE_GOAL_OFFSET;

      let bestOi = -1;
      let bestDist = Infinity;
      for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
        if (oi === onBallDefOi) continue; // 抜かれた本人は除外
        if (state.obReacting[oi]) continue;
        const d = dist2d(obstacles[oi].x, obstacles[oi].z, helpPosX, helpPosZ);
        if (d < bestDist) {
          bestDist = d;
          bestOi = oi;
        }
      }
      if (bestOi >= 0) {
        result.set(bestOi, state.onBallEntityIdx);
        assigned.add(bestOi);
      }
    }
  }

  // =================================================================
  // Priority 2: フリーのオフボール選手を検出 → ヘルプ割り当て
  // =================================================================
  const freeIndices: number[] = [];
  for (let ei = 0; ei < allOffense.length; ei++) {
    if (ei === state.onBallEntityIdx) continue;
    const off = allOffense[ei];
    if (off.z < DEFENSE_ENGAGE_Z) continue;

    let minDefDist = Infinity;
    for (let oi = 0; oi < obstacles.length; oi++) {
      if (state.obReacting[oi]) continue;
      const d = dist2d(off.x, off.z, obstacles[oi].x, obstacles[oi].z);
      if (d < minDefDist) minDefDist = d;
    }
    if (minDefDist > FREE_PLAYER_DIST) {
      freeIndices.push(ei);
    }
  }

  for (const freeEi of freeIndices) {
    const freeMover = allOffense[freeEi];

    // 2a) 指定マーカーが利用可能か
    const designatedOi = OB_CONFIGS.findIndex(c => c.markTargetEntityIdx === freeEi);
    if (
      designatedOi >= 0
      && !state.obReacting[designatedOi]
      && OB_CONFIGS[designatedOi].markTargetEntityIdx !== state.onBallEntityIdx
      && !assigned.has(designatedOi)
    ) {
      result.set(designatedOi, freeEi);
      assigned.add(designatedOi);
      continue;
    }

    // 2b) 最寄りの利用可能DFをヘルプに割り当て
    let bestOi = -1;
    let bestDist = Infinity;
    for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
      if (assigned.has(oi)) continue;
      if (state.obReacting[oi]) continue;
      if (OB_CONFIGS[oi].markTargetEntityIdx === state.onBallEntityIdx) continue;
      const d = dist2d(obstacles[oi].x, obstacles[oi].z, freeMover.x, freeMover.z);
      if (d < bestDist) {
        bestDist = d;
        bestOi = oi;
      }
    }
    if (bestOi >= 0) {
      result.set(bestOi, freeEi);
      assigned.add(bestOi);
    }
  }

  return result;
}

/**
 * 全5障害物の移動を統一処理（全MAN_MARKER）。
 *
 * 判断基準:
 * 1. 相手とゴールの間に入り直進させない（ゴールライン・ポジショニング）
 * 2. フリーの選手を作らない（ヘルプローテーション）
 * 3. フリーの相手がいたら全速力でマークに行く（スプリント）
 */
export function updateObstacleMovements(state: SimState, dt: number, passerMover: SimMover): void {
  const { launcher, targets, obstacles } = state;
  const allOffense: SimMover[] = [launcher, ...targets];

  // --- Phase 1: フリー選手検出 + ヘルプ割り当て ---
  const helpOverrides = computeHelpAssignments(state, allOffense);

  // --- Phase 2: 各DFの移動 ---
  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    const ob = obstacles[oi];

    // 空中の障害物 → 慣性がある場合はtickJumpPhysicsが水平移動を処理、なければフォールバック
    if (isAirborne(ob)) {
      const obEntityIdx = 1 + targets.length + oi;
      const blockAction = state.actionStates[obEntityIdx];
      if (blockAction?.type === 'block') {
        const onBallMover = allOffense[state.onBallEntityIdx];
        orientToward(ob, onBallMover.x, onBallMover.z, dt);
      }
      // momentum がない場合のみフォールバック（静止ジャンプ等）
      if (Math.abs(ob.momentumVx) < 0.01 && Math.abs(ob.momentumVz) < 0.01) {
        moveWithFacing(ob, cfg.idleSpeed * JUMP_HORIZONTAL_MULT, dt);
      }
      continue;
    }

    // リアクション中 → インターセプト移動（従来通り）
    if (state.obReacting[oi]) {
      moveWithFacing(ob, cfg.interceptSpeed, dt);
      continue;
    }

    const markEntityIdx = cfg.markTargetEntityIdx;
    const markTarget = allOffense[markEntityIdx];

    // --- オンボールディフェンス: ゴールライン・ポジショニング + 距離依存アグレッション ---
    // 相手とゴールを結んだ線上に立ち進路を妨害する。
    // ゴールに近いほど密着しスティールを狙う。遠いほど間合いを取り抜かれにくくする。
    // パス飛行中: レシーバーが近ければ追跡、遠ければポジション維持（手の deflection で対応）。
    if (markEntityIdx === state.onBallEntityIdx) {
      state.obMems[oi].searching = false;

      // パス飛行中: レシーバーが近くにいればそちらを追跡する
      if (state.ballActive && state.interceptPt) {
        const receiverMover = allOffense[state.selectedReceiverEntityIdx];
        const distToReceiver = dist2d(ob.x, ob.z, receiverMover.x, receiverMover.z);
        if (distToReceiver < ONBALL_PASS_CONTEST_DIST) {
          // レシーバーに向かってスプリントで追跡（キャッチ妨害）
          setChaserVelocity(ob, receiverMover.x, receiverMover.z, cfg.interceptSpeed, ONBALL_HOVER_CLOSE, dt);
          moveKeepFacing(ob, cfg.interceptSpeed, dt);
          orientToward(ob, receiverMover.x, receiverMover.z, dt);
        } else {
          // レシーバーが遠い → ポジション維持（手の deflection に任せる）
          setChaserVelocity(ob, ob.x, ob.z, cfg.idleSpeed, 0.5, dt);
          moveKeepFacing(ob, cfg.idleSpeed, dt);
          orientToward(ob, receiverMover.x, receiverMover.z, dt);
        }
        continue;
      }

      // 相手→ゴール方向を算出
      const toGoalX = GOAL_RIM_X - markTarget.x;
      const toGoalZ = GOAL_RIM_Z - markTarget.z;
      const goalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ);

      // ゴール距離に基づく 0-1 補間 (0=close, 1=far)
      const t = goalDist <= ONBALL_GOAL_DIST_CLOSE ? 0
        : goalDist >= ONBALL_GOAL_DIST_FAR ? 1
        : (goalDist - ONBALL_GOAL_DIST_CLOSE) / (ONBALL_GOAL_DIST_FAR - ONBALL_GOAL_DIST_CLOSE);

      const markDist = ONBALL_MARK_DIST_CLOSE + t * (ONBALL_MARK_DIST_FAR - ONBALL_MARK_DIST_CLOSE);
      let hoverR = ONBALL_HOVER_CLOSE + t * (ONBALL_HOVER_FAR - ONBALL_HOVER_CLOSE);

      // 速度: 近いほどインターセプト速度に近づく（密着プレッシャー）
      let speed = cfg.idleSpeed + (1 - t) * (cfg.interceptSpeed - cfg.idleSpeed);

      let markX: number, markZ: number;
      if (goalDist > 0.5) {
        markX = markTarget.x + (toGoalX / goalDist) * markDist;
        markZ = markTarget.z + (toGoalZ / goalDist) * markDist;
      } else {
        // ゴール直下: 相手の正面方向で塞ぐ
        markX = markTarget.x + Math.cos(markTarget.facing) * markDist;
        markZ = markTarget.z + Math.sin(markTarget.facing) * markDist;
      }

      // Fix 2: 理想位置からズレていたらダッシュで復帰（抜かれた時の対応）
      const distToMark = dist2d(ob.x, ob.z, markX, markZ);
      if (distToMark > ONBALL_RECOVERY_DIST) {
        speed = cfg.interceptSpeed;
        hoverR = ONBALL_HOVER_CLOSE;
      }

      setChaserVelocity(ob, markX, markZ, speed, hoverR, dt);
      moveKeepFacing(ob, speed, dt);
      orientToward(ob, markTarget.x, markTarget.z, dt);
      continue;
    }

    // --- ヘルプ割り当て確認 ---
    const helpEntityIdx = helpOverrides.get(oi);
    const isHelping = helpEntityIdx !== undefined;
    const effectiveTarget = isHelping ? allOffense[helpEntityIdx] : markTarget;

    // --- マーク対象がエンゲージライン外: 初期位置で待機 ---
    if (effectiveTarget.z < DEFENSE_ENGAGE_Z) {
      const waitPos = INIT_OBSTACLES[oi];
      setChaserVelocity(ob, waitPos.x, waitPos.z, cfg.idleSpeed, cfg.hoverRadius, dt);
      moveKeepFacing(ob, cfg.idleSpeed, dt);
      orientToward(ob, effectiveTarget.x, effectiveTarget.z, dt);
      continue;
    }

    // --- オフボール: パスライン・ディナイ ---
    // マーク対象とパッサー（オンボールOF）の間に入り、パスコースを遮断する。
    const mem = state.obMems[oi];
    // ヘルプ時は実位置を直接追う、通常時はメモリ参照
    const chaseX = isHelping ? effectiveTarget.x : (mem.searching ? mem.lastSeenTargetX : effectiveTarget.x);
    const chaseZ = isHelping ? effectiveTarget.z : (mem.searching ? mem.lastSeenTargetZ : effectiveTarget.z);

    // パッサー方向: マーク対象からパッサーへのベクトル
    const pdx = passerMover.x - chaseX;
    const pdz = passerMover.z - chaseZ;
    const pDist = Math.sqrt(pdx * pdx + pdz * pdz);

    let defX: number, defZ: number;
    if (pDist > 0.5) {
      defX = chaseX + (pdx / pDist) * OFFBALL_DENY_OFFSET;
      defZ = chaseZ + (pdz / pDist) * OFFBALL_DENY_OFFSET;
    } else {
      defX = chaseX;
      defZ = chaseZ;
    }

    // 速度選択: ヘルプ中 or DF位置から遠い → スプリント
    const distToDefPos = dist2d(ob.x, ob.z, defX, defZ);
    const useSprint = isHelping || distToDefPos > SPRINT_TRIGGER_DIST;
    const speed = useSprint ? cfg.interceptSpeed : cfg.idleSpeed;

    // 密着ディナイモード: マーク対象に近接 + サーチ中でない + ヘルプでない
    // → より小さいオフセットで密着し、プッシュ妨害可能な位置に立つ
    const distToTarget = dist2d(ob.x, ob.z, chaseX, chaseZ);
    if (!mem.searching && !isHelping && distToTarget < PUSH_ACTIVATION_DIST) {
      let denyX: number, denyZ: number;
      if (pDist > 0.01) {
        denyX = chaseX + (pdx / pDist) * PUSH_DENY_OFFSET;
        denyZ = chaseZ + (pdz / pDist) * PUSH_DENY_OFFSET;
      } else {
        denyX = chaseX;
        denyZ = chaseZ;
      }
      setChaserVelocity(ob, denyX, denyZ, speed, PUSH_DENY_HOVER, dt);
      moveKeepFacing(ob, speed, dt);
      orientToward(ob, effectiveTarget.x, effectiveTarget.z, dt);
    } else {
      // パスライン・ディナイ: マーク対象とパッサーの間へ移動
      setChaserVelocity(ob, defX, defZ, speed, cfg.hoverRadius, dt);
      moveKeepFacing(ob, speed, dt);
      orientToward(ob, chaseX, chaseZ, dt);
    }
  }
}
