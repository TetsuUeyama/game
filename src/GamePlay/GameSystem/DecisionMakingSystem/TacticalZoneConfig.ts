/**
 * 戦術ゾーン設定
 *
 * バスケットボールコートの戦術的なポジションを定義
 * Field.tsのTACTICAL_ZONE_CONFIGと同じ幾何計算を使用
 */

import { GOAL_CONFIG } from "@/GamePlay/Object/Entities/Goal";
import { FIELD_CONFIG } from "@/GamePlay/GameSystem/FieldSystem/FieldGridConfig";

/**
 * 3ポイントライン設定（Field.tsと同じ値）
 */
const THREE_POINT_ARC_RADIUS = 7.24;
const THREE_POINT_CORNER_DISTANCE = 6.71;

/**
 * ペイントエリア設定（Field.tsと同じ値）
 */
const LANE_WIDTH = 4.88;
const FREE_THROW_DISTANCE = 4.57;
const LANE_LENGTH = 5.79; // ペイントエリアの長さ（ベースラインからFTラインまで）

/**
 * ペイントエリア設定をエクスポート
 */
export const PAINT_AREA = {
  LANE_WIDTH,
  FREE_THROW_DISTANCE,
  LANE_LENGTH,
  HALF_WIDTH: LANE_WIDTH / 2,
} as const;

/**
 * 戦術ゾーンタイプ
 */
export type TacticalZoneType =
  // ペリメーターゾーン（PG, SG, SF用）
  | 'top'
  | 'wing_left'
  | 'wing_right'
  | 'corner_left'
  | 'corner_right'
  | 'short_corner_left'
  | 'short_corner_right'
  // インサイドゾーン（PF, C用）
  | 'high_post'
  | 'elbow_left'
  | 'elbow_right'
  | 'mid_post'
  | 'low_post_left'
  | 'low_post_right';

/**
 * ポジションタイプ別のゾーンリスト
 */
export const PERIMETER_ZONES: TacticalZoneType[] = [
  'top',
  'wing_left',
  'wing_right',
  'corner_left',
  'corner_right',
  'short_corner_left',
  'short_corner_right',
];

export const INSIDE_ZONES: TacticalZoneType[] = [
  'high_post',
  'elbow_left',
  'elbow_right',
  'mid_post',
  'low_post_left',
  'low_post_right',
];

/**
 * ゾーン位置計算結果
 */
export interface ZonePosition {
  x: number;
  z: number;
}

/**
 * ゴール中心座標を取得
 */
function getGoalCenterZ(isAllyTeam: boolean): number {
  const fieldHalfLength = FIELD_CONFIG.length / 2;
  const goalZ = fieldHalfLength - GOAL_CONFIG.backboardDistance - GOAL_CONFIG.rimOffset;
  return isAllyTeam ? goalZ : -goalZ;
}

/**
 * 指定位置がペイントエリア内かどうかを判定
 * @param position チェックする位置
 * @param isAllyTeam allyチームかどうか（攻撃方向を決定）
 * @returns ペイントエリア内ならtrue
 */
export function isInPaintArea(
  position: { x: number; z: number },
  isAllyTeam: boolean
): boolean {
  const goalCenterZ = getGoalCenterZ(isAllyTeam);
  const halfWidth = LANE_WIDTH / 2;

  // X方向（横幅）のチェック
  if (Math.abs(position.x) > halfWidth) {
    return false;
  }

  // Z方向（縦）のチェック
  if (isAllyTeam) {
    // allyチームは+Z側のゴールを攻める
    // ペイントエリアは goalCenterZ から goalCenterZ - LANE_LENGTH
    const paintMinZ = goalCenterZ - LANE_LENGTH;
    const paintMaxZ = goalCenterZ + 0.5; // ベースライン付近まで含める
    return position.z >= paintMinZ && position.z <= paintMaxZ;
  } else {
    // enemyチームは-Z側のゴールを攻める
    // ペイントエリアは goalCenterZ から goalCenterZ + LANE_LENGTH
    const paintMinZ = goalCenterZ - 0.5; // ベースライン付近まで含める
    const paintMaxZ = goalCenterZ + LANE_LENGTH;
    return position.z >= paintMinZ && position.z <= paintMaxZ;
  }
}

/**
 * 戦術ゾーンの中心座標を取得
 *
 * @param zoneType ゾーンタイプ
 * @param isAllyTeam allyチームかどうか（攻撃方向を決定）
 * @returns ゾーンの中心座標
 */
export function getZonePosition(zoneType: TacticalZoneType, isAllyTeam: boolean): ZonePosition {
  const goalCenterZ = getGoalCenterZ(isAllyTeam);
  const zSign = isAllyTeam ? 1 : -1;

  const halfLaneWidth = LANE_WIDTH / 2;
  const freeThrowZ = goalCenterZ - zSign * FREE_THROW_DISTANCE;

  // 3Pアークとコーナーラインの交点
  const arcCornerDeltaZ = Math.sqrt(
    THREE_POINT_ARC_RADIUS * THREE_POINT_ARC_RADIUS -
    THREE_POINT_CORNER_DISTANCE * THREE_POINT_CORNER_DISTANCE
  );
  const arcCornerZ = goalCenterZ - zSign * arcCornerDeltaZ;

  // トップ位置の角度（ゴール中心からコート中央方向）
  const topAngle = -zSign * Math.PI / 2;
  const wingAngleFromTop = 45 * Math.PI / 180;

  switch (zoneType) {
    // ========================================
    // ペリメーターゾーン
    // ========================================

    case 'top':
      // 3Pアーク頂点
      return {
        x: 0,
        z: goalCenterZ - zSign * THREE_POINT_ARC_RADIUS,
      };

    case 'wing_left': {
      // トップから左に45°の3Pアーク上
      const leftWingAngle = topAngle - wingAngleFromTop;
      return {
        x: Math.cos(leftWingAngle) * THREE_POINT_ARC_RADIUS,
        z: goalCenterZ + Math.sin(leftWingAngle) * THREE_POINT_ARC_RADIUS,
      };
    }

    case 'wing_right': {
      // トップから右に45°の3Pアーク上
      const rightWingAngle = topAngle + wingAngleFromTop;
      return {
        x: Math.cos(rightWingAngle) * THREE_POINT_ARC_RADIUS,
        z: goalCenterZ + Math.sin(rightWingAngle) * THREE_POINT_ARC_RADIUS,
      };
    }

    case 'corner_left':
      // 左コーナー（3P直線部の中央付近）
      return {
        x: -THREE_POINT_CORNER_DISTANCE,
        z: (goalCenterZ + zSign * FIELD_CONFIG.length / 2 + arcCornerZ) / 2,
      };

    case 'corner_right':
      // 右コーナー（3P直線部の中央付近）
      return {
        x: THREE_POINT_CORNER_DISTANCE,
        z: (goalCenterZ + zSign * FIELD_CONFIG.length / 2 + arcCornerZ) / 2,
      };

    case 'short_corner_left':
      // 左ショートコーナー（ペイント外側、ベースライン寄り）
      return {
        x: -(halfLaneWidth + (THREE_POINT_CORNER_DISTANCE - halfLaneWidth) / 2),
        z: goalCenterZ + zSign * 1.5, // ベースライン寄り
      };

    case 'short_corner_right':
      // 右ショートコーナー
      return {
        x: halfLaneWidth + (THREE_POINT_CORNER_DISTANCE - halfLaneWidth) / 2,
        z: goalCenterZ + zSign * 1.5,
      };

    // ========================================
    // インサイドゾーン
    // ========================================

    case 'high_post':
      // ハイポスト（FTライン中央）
      return {
        x: 0,
        z: freeThrowZ,
      };

    case 'elbow_left':
      // 左エルボー（FTラインとペイント側線の交点）
      return {
        x: -halfLaneWidth,
        z: freeThrowZ,
      };

    case 'elbow_right':
      // 右エルボー
      return {
        x: halfLaneWidth,
        z: freeThrowZ,
      };

    case 'mid_post':
      // ミッドポスト（ペイント中央）
      return {
        x: 0,
        z: (goalCenterZ + freeThrowZ) / 2,
      };

    case 'low_post_left':
      // 左ローポスト（ブロック位置）
      return {
        x: -halfLaneWidth,
        z: goalCenterZ + zSign * 0.8,
      };

    case 'low_post_right':
      // 右ローポスト
      return {
        x: halfLaneWidth,
        z: goalCenterZ + zSign * 0.8,
      };

    default:
      return { x: 0, z: 0 };
  }
}

/**
 * プレイヤーポジションに基づいて利用可能なゾーンリストを取得
 */
export function getAvailableZones(playerPosition: string): TacticalZoneType[] {
  switch (playerPosition) {
    case 'PG':
    case 'SG':
    case 'SF':
      return PERIMETER_ZONES;
    case 'PF':
    case 'C':
      return INSIDE_ZONES;
    default:
      return [...PERIMETER_ZONES, ...INSIDE_ZONES];
  }
}

/**
 * ポジションごとの優先ゾーン順序
 * 各ポジションが最初に選ぶべきゾーンを定義
 * 重複を避けるため、各ポジションで異なる優先順位を設定
 */
const POSITION_ZONE_PRIORITY: Record<string, TacticalZoneType[]> = {
  // ペリメーター（PG, SG, SF）
  'PG': ['top', 'wing_left', 'wing_right', 'corner_left', 'corner_right', 'short_corner_left', 'short_corner_right'],
  'SG': ['wing_left', 'corner_left', 'short_corner_left', 'top', 'wing_right', 'corner_right', 'short_corner_right'],
  'SF': ['wing_right', 'corner_right', 'short_corner_right', 'top', 'wing_left', 'corner_left', 'short_corner_left'],
  // インサイド（PF, C）
  'PF': ['elbow_left', 'low_post_left', 'high_post', 'mid_post', 'elbow_right', 'low_post_right'],
  'C': ['low_post_right', 'mid_post', 'high_post', 'elbow_right', 'low_post_left', 'elbow_left'],
};

/**
 * ポジションに基づいた優先順位付きゾーンリストを取得
 */
export function getZonesWithPriority(playerPosition: string): TacticalZoneType[] {
  return POSITION_ZONE_PRIORITY[playerPosition] || getAvailableZones(playerPosition);
}

/**
 * 指定されたゾーンが他のプレイヤーに占有されているかチェック
 */
export function isZoneOccupied(
  zonePosition: ZonePosition,
  allCharacters: { getPosition: () => { x: number; z: number } }[],
  excludeCharacter: object,
  occupancyRadius: number = 2.0
): boolean {
  for (const character of allCharacters) {
    if (character === excludeCharacter) continue;

    const charPos = character.getPosition();
    const dx = zonePosition.x - charPos.x;
    const dz = zonePosition.z - charPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < occupancyRadius) {
      return true;
    }
  }
  return false;
}

/**
 * 利用可能なゾーンからランダムに1つ選択（占有されていないもの）
 */
export function selectRandomAvailableZone(
  playerPosition: string,
  isAllyTeam: boolean,
  allCharacters: { getPosition: () => { x: number; z: number } }[],
  excludeCharacter: object,
  sameTeamCharacters: { getPosition: () => { x: number; z: number } }[]
): ZonePosition | null {
  const availableZones = getAvailableZones(playerPosition);

  // 占有されていないゾーンをフィルタ
  const freeZones = availableZones.filter((zoneType) => {
    const zonePos = getZonePosition(zoneType, isAllyTeam);
    return !isZoneOccupied(zonePos, sameTeamCharacters, excludeCharacter);
  });

  if (freeZones.length === 0) {
    // すべて占有されている場合はランダムに選択
    const randomIndex = Math.floor(Math.random() * availableZones.length);
    return getZonePosition(availableZones[randomIndex], isAllyTeam);
  }

  // 空いているゾーンからランダムに選択
  const randomIndex = Math.floor(Math.random() * freeZones.length);
  return getZonePosition(freeZones[randomIndex], isAllyTeam);
}

/**
 * 左右ペアのゾーンマッピング
 * 一方のゾーンに選手がいる場合、ペアのゾーンも選択不可とする
 */
const ZONE_PAIRS: Record<TacticalZoneType, TacticalZoneType | null> = {
  // ペリメーターゾーン
  'top': null, // トップはペアなし
  'wing_left': 'wing_right',
  'wing_right': 'wing_left',
  // コーナーは全て相互排他（CORNER_GROUP_ZONESで処理）
  'corner_left': null,
  'corner_right': null,
  'short_corner_left': null,
  'short_corner_right': null,
  // インサイドゾーン
  'high_post': null, // ハイポストはペアなし
  'mid_post': null, // ミッドポストはペアなし
  'elbow_left': 'elbow_right',
  'elbow_right': 'elbow_left',
  'low_post_left': 'low_post_right',
  'low_post_right': 'low_post_left',
};

/**
 * コーナーグループ（コーナー+ショートコーナー）
 * これらは全て相互排他：1人しか入れない
 */
const CORNER_GROUP_ZONES: TacticalZoneType[] = [
  'corner_left',
  'corner_right',
  'short_corner_left',
  'short_corner_right',
];

/**
 * ゾーンのペアを取得
 */
export function getZonePair(zoneType: TacticalZoneType): TacticalZoneType | null {
  return ZONE_PAIRS[zoneType];
}

/**
 * コーナーグループのゾーンかどうかを判定
 */
export function isCornerGroupZone(zoneType: TacticalZoneType): boolean {
  return CORNER_GROUP_ZONES.includes(zoneType);
}

/**
 * ゾーンまたはそのペアが占有されているかチェック
 * 左右どちらかに選手がいたら、両方のゾーンを占有とみなす
 * コーナーグループ（corner + short_corner）は全て相互排他：1人のみ
 */
export function isZonePairOccupied(
  zoneType: TacticalZoneType,
  isAllyTeam: boolean,
  teammates: { getPosition: () => { x: number; z: number } }[],
  excludeCharacter: object,
  occupancyRadius: number = 2.5
): boolean {
  // コーナーグループの場合、全コーナーゾーンをチェック
  if (isCornerGroupZone(zoneType)) {
    for (const cornerZone of CORNER_GROUP_ZONES) {
      const cornerPos = getZonePosition(cornerZone, isAllyTeam);
      if (isZoneOccupied(cornerPos, teammates, excludeCharacter, occupancyRadius)) {
        return true;
      }
    }
    return false;
  }

  // このゾーン自体が占有されているかチェック
  const zonePos = getZonePosition(zoneType, isAllyTeam);
  if (isZoneOccupied(zonePos, teammates, excludeCharacter, occupancyRadius)) {
    return true;
  }

  // ペアのゾーンが占有されているかチェック
  const pairZone = ZONE_PAIRS[zoneType];
  if (pairZone) {
    const pairZonePos = getZonePosition(pairZone, isAllyTeam);
    if (isZoneOccupied(pairZonePos, teammates, excludeCharacter, occupancyRadius)) {
      return true;
    }
  }

  return false;
}

/**
 * コーナー/ショートコーナーゾーンかどうかを判定
 * これらのゾーンは3P待機のため、一度取ったら再評価しない
 */
export function isCornerZone(zoneType: TacticalZoneType): boolean {
  return zoneType === 'corner_left' ||
         zoneType === 'corner_right' ||
         zoneType === 'short_corner_left' ||
         zoneType === 'short_corner_right';
}

/**
 * 現在の位置がどのゾーンに属しているかを判定
 * @param position 現在の位置
 * @param isAllyTeam allyチームかどうか
 * @param zoneList チェック対象のゾーンリスト
 * @param detectionRadius ゾーン中心からの検出半径
 * @returns ゾーンタイプ（見つからなければnull）
 */
export function detectCurrentZone(
  position: { x: number; z: number },
  isAllyTeam: boolean,
  zoneList: TacticalZoneType[],
  detectionRadius: number = 2.0
): TacticalZoneType | null {
  for (const zoneType of zoneList) {
    const zonePos = getZonePosition(zoneType, isAllyTeam);
    const dx = position.x - zonePos.x;
    const dz = position.z - zonePos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < detectionRadius) {
      return zoneType;
    }
  }
  return null;
}
