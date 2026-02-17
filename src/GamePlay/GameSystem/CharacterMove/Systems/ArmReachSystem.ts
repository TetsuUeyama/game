import { Vector3 } from "@babylonjs/core";

/**
 * アームリーチIK計算結果（度数法）
 * MotionController適用後に関節角度を上書きする
 */
export interface ArmReachAngles {
  upperBodyX: number;      // 上半身前傾（正=前方）
  rightShoulderX: number;  // 右肩ピッチ（負=前方）
  rightElbowX: number;     // 右肘屈曲（負=曲がり）
  leftShoulderX: number;   // 左肩ピッチ（負=前方）
  leftElbowX: number;      // 左肘屈曲（負=曲がり）
}

const DEG = 180 / Math.PI;

/** 上腕長 (m) — ProceduralHumanoid ForeArm offset */
const UPPER_ARM_LENGTH = 0.26;
/** 前腕+手長 (m) — ProceduralHumanoid Hand offset */
const FOREARM_LENGTH = 0.20;
/** 全腕長 */
const TOTAL_ARM_LENGTH = UPPER_ARM_LENGTH + FOREARM_LENGTH;

/** 肩高さの身長比率（mesh中心からの相対高さ） */
const SHOULDER_HEIGHT_RATIO = 0.26;  // 0.76 * h - 0.5 * h
/** 脊柱長の身長比率 */
const SPINE_LENGTH_RATIO = 0.23;

/** 上半身前傾の最大角度 */
const MAX_LEAN_DEG = 55;
/** 肩X回転の範囲 */
const MIN_SHOULDER_X = -120;
const MAX_SHOULDER_X = -20;
/** 肘X回転の範囲（負=屈曲） */
const MIN_ELBOW_X = -50;
const MAX_ELBOW_X = 0;

/**
 * ボール位置に手を伸ばすための関節角度を計算する
 *
 * 計算方式:
 * 1. ボール位置をキャラクターのローカル座標（前方・高さ）に変換
 * 2. ボールの相対高さから上半身前傾角を算出
 * 3. 前傾後の肩位置からボールへの方向で2ボーン平面IKを解く
 *
 * @param characterPosition キャラクターのワールド位置（mesh中心）
 * @param characterRotation キャラクターのY軸回転（ラジアン）
 * @param characterHeight キャラクターの身長(m)
 * @param targetPosition ボールのワールド位置
 */
export function calculateArmReach(
  characterPosition: Vector3,
  characterRotation: number,
  characterHeight: number,
  targetPosition: Vector3,
): ArmReachAngles {
  // 1. ターゲットをキャラクターローカル座標に変換
  const dx = targetPosition.x - characterPosition.x;
  const dz = targetPosition.z - characterPosition.z;
  const sinR = Math.sin(characterRotation);
  const cosR = Math.cos(characterRotation);

  // localForward: キャラクター前方方向の距離（正=前方）
  const localForward = dx * sinR + dz * cosR;
  // localHeight: mesh中心からの相対高さ
  const localHeight = targetPosition.y - characterPosition.y;

  // ターゲットがキャラクターの後方にある場合は前方0.1として扱う
  const clampedForward = Math.max(0.1, localForward);

  // 2. 肩位置（mesh中心からの相対座標）
  const shoulderUp = characterHeight * SHOULDER_HEIGHT_RATIO;
  const spineLength = characterHeight * SPINE_LENGTH_RATIO;

  // ターゲットの肩からの相対位置（前傾なし）
  const targetBelowShoulder = shoulderUp - localHeight; // 正=肩より下

  // 3. 上半身前傾角の計算
  // 肩から直接腕で届く範囲を超える場合に前傾する
  const directDist = Math.sqrt(
    clampedForward * clampedForward + targetBelowShoulder * targetBelowShoulder
  );

  let leanDeg = 0;
  if (directDist > TOTAL_ARM_LENGTH * 0.7) {
    // 腕だけでは遠い → 上半身を前傾
    const excess = directDist - TOTAL_ARM_LENGTH * 0.5;
    leanDeg = Math.min(MAX_LEAN_DEG, Math.max(0, Math.atan2(excess, spineLength) * DEG));
  }

  // 4. 前傾後の肩の有効位置からターゲットへのベクトル
  const leanRad = leanDeg / DEG;
  // 前傾により肩は前方に移動し、高さが下がる
  const shoulderForwardShift = spineLength * Math.sin(leanRad);
  const shoulderDownShift = spineLength * (1 - Math.cos(leanRad));

  const effectiveForward = clampedForward - shoulderForwardShift;
  const effectiveDown = targetBelowShoulder - shoulderDownShift;

  // 肩からターゲットまでの距離（2D平面: 前方+上下）
  let reachDist = Math.sqrt(
    effectiveForward * effectiveForward + effectiveDown * effectiveDown
  );

  // IK有効範囲にクランプ
  const minReach = Math.abs(UPPER_ARM_LENGTH - FOREARM_LENGTH) + 0.01;
  const maxReach = TOTAL_ARM_LENGTH - 0.01;
  reachDist = Math.max(minReach, Math.min(maxReach, reachDist));

  // 5. 2ボーンIK計算

  // 肘角度（上腕と前腕の間の角度）
  const cosElbow = (reachDist * reachDist - UPPER_ARM_LENGTH * UPPER_ARM_LENGTH - FOREARM_LENGTH * FOREARM_LENGTH)
    / (2 * UPPER_ARM_LENGTH * FOREARM_LENGTH);
  const elbowInternalAngle = Math.acos(clamp(cosElbow, -1, 1));
  // elbowInternalAngle: π=伸展, <π=屈曲

  // ターゲット方向角度（水平前方基準、下方が正）
  const targetAngle = Math.atan2(effectiveDown, Math.max(0.01, effectiveForward));

  // 肩オフセット角度（IK三角形の肩頂点角度）
  const cosShoulderOffset = (UPPER_ARM_LENGTH * UPPER_ARM_LENGTH + reachDist * reachDist - FOREARM_LENGTH * FOREARM_LENGTH)
    / (2 * UPPER_ARM_LENGTH * reachDist);
  const shoulderOffset = Math.acos(clamp(cosShoulderOffset, -1, 1));

  // 肩の実効角度（水平前方からの角度、下向きが正）
  const shoulderAngleFromHorizontal = targetAngle - shoulderOffset;

  // 6. ゲームの関節回転規約に変換
  // shoulderX: 0°=真下, -90°=水平前方, -180°=真上
  // shoulderAngleFromHorizontal: 0=水平前方, π/2=真下
  const shoulderXDeg = shoulderAngleFromHorizontal * DEG - 90;

  // elbowX: 0°=伸展, 負=屈曲（モーションデータの規約に合わせる）
  const elbowXDeg = -(Math.PI - elbowInternalAngle) * DEG;

  // クランプして返す
  const clampedShoulderX = clamp(shoulderXDeg, MIN_SHOULDER_X, MAX_SHOULDER_X);
  const clampedElbowX = clamp(elbowXDeg, MIN_ELBOW_X, MAX_ELBOW_X);

  return {
    upperBodyX: leanDeg,
    rightShoulderX: clampedShoulderX,
    rightElbowX: clampedElbowX,
    leftShoulderX: clampedShoulderX,
    leftElbowX: clampedElbowX,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
