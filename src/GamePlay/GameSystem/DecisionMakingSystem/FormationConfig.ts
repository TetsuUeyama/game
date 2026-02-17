/**
 * フォーメーション設定
 * オフェンス・ディフェンス時の各ポジションの配置を定義
 *
 * コート座標系:
 * - 小升目: A〜O（X軸）、1〜30（Z軸）
 * - ゴール1: Z=+15付近（row 30側）
 * - ゴール2: Z=-15付近（row 1側）
 * - allyチームはゴール1を攻める、enemyチームはゴール2を攻める
 */

import { FieldGridUtils } from "@/GamePlay/GameSystem/FieldSystem/FieldGridConfig";

/**
 * プレイヤーポジション
 */
export type PlayerPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

/**
 * フォーメーション内のポジション定義
 * cell: 小升目の座標（例: "H25"）
 */
export interface FormationSlot {
  position: PlayerPosition;
  cell: string;  // 例: "H25"
}

/**
 * フォーメーション定義
 */
export interface Formation {
  name: string;
  description: string;
  slots: FormationSlot[];
}

/**
 * オフェンスフォーメーション
 * allyチーム用（ゴール1方向 = row 16-30）
 */
export const OFFENSE_FORMATIONS: Formation[] = [
  {
    name: "1-4 High",
    description: "PGがトップ、4人がフリースローライン付近に並ぶ",
    slots: [
      { position: 'PG', cell: 'H22' },  // トップ
      { position: 'SG', cell: 'E25' },  // 左ウイング
      { position: 'SF', cell: 'K25' },  // 右ウイング
      { position: 'PF', cell: 'F27' },  // 左エルボー
      { position: 'C', cell: 'J27' },   // 右エルボー
    ],
  },
  {
    name: "2-3 High",
    description: "ガード2人がトップ、フォワード2人がウイング、センターがペイント",
    slots: [
      { position: 'PG', cell: 'F22' },  // 左トップ
      { position: 'SG', cell: 'J22' },  // 右トップ
      { position: 'SF', cell: 'D25' },  // 左ウイング
      { position: 'PF', cell: 'L25' },  // 右ウイング
      { position: 'C', cell: 'H28' },   // ペイント内
    ],
  },
  {
    name: "Horns",
    description: "PGがトップ、PFとCがエルボー、ウイングが広がる",
    slots: [
      { position: 'PG', cell: 'H21' },  // トップ
      { position: 'SG', cell: 'C24' },  // 左コーナー寄り
      { position: 'SF', cell: 'M24' },  // 右コーナー寄り
      { position: 'PF', cell: 'F26' },  // 左エルボー
      { position: 'C', cell: 'J26' },   // 右エルボー
    ],
  },
];

/**
 * ディフェンスフォーメーション
 * allyチーム用（自陣ゴール2を守る = row 1-15）
 */
export const DEFENSE_FORMATIONS: Formation[] = [
  {
    name: "Man-to-Man",
    description: "マンツーマンディフェンス - 各自がマッチアップ相手をマーク",
    slots: [
      { position: 'PG', cell: 'H8' },   // トップをカバー
      { position: 'SG', cell: 'E5' },   // 左ウイングをカバー
      { position: 'SF', cell: 'K5' },   // 右ウイングをカバー
      { position: 'PF', cell: 'F3' },   // 左エルボーをカバー
      { position: 'C', cell: 'J3' },    // 右エルボー/ペイントをカバー
    ],
  },
  {
    name: "2-3 Zone",
    description: "2-3ゾーンディフェンス",
    slots: [
      { position: 'PG', cell: 'F6' },   // 左上
      { position: 'SG', cell: 'J6' },   // 右上
      { position: 'SF', cell: 'D3' },   // 左下
      { position: 'PF', cell: 'L3' },   // 右下
      { position: 'C', cell: 'H2' },    // 中央下（ペイント）
    ],
  },
  {
    name: "3-2 Zone",
    description: "3-2ゾーンディフェンス",
    slots: [
      { position: 'PG', cell: 'H7' },   // 中央上
      { position: 'SG', cell: 'E6' },   // 左上
      { position: 'SF', cell: 'K6' },   // 右上
      { position: 'PF', cell: 'F3' },   // 左下
      { position: 'C', cell: 'J3' },    // 右下
    ],
  },
];

/**
 * フォーメーションユーティリティ
 */
export class FormationUtils {
  /**
   * フォーメーションから指定ポジションの目標座標を取得
   */
  static getTargetPosition(
    formation: Formation,
    playerPosition: PlayerPosition,
    isAllyTeam: boolean
  ): { x: number; z: number } | null {
    const slot = formation.slots.find(s => s.position === playerPosition);
    if (!slot) return null;

    const cellName = slot.cell;
    const match = cellName.match(/^([A-O])(\d+)$/);
    if (!match) return null;

    const col = match[1];
    let row = parseInt(match[2], 10);

    // enemyチームの場合は座標を反転（コートの反対側）
    if (!isAllyTeam) {
      row = 31 - row;
      const colIndex = 'ABCDEFGHIJKLMNO'.indexOf(col);
      const mirroredColIndex = 14 - colIndex;
      const mirroredCol = 'ABCDEFGHIJKLMNO'[mirroredColIndex];
      return FieldGridUtils.cellToWorld(mirroredCol, row);
    }

    return FieldGridUtils.cellToWorld(col, row);
  }

  /**
   * デフォルトのオフェンスフォーメーションを取得
   */
  static getDefaultOffenseFormation(): Formation {
    return OFFENSE_FORMATIONS[0];
  }

  /**
   * デフォルトのディフェンスフォーメーションを取得
   */
  static getDefaultDefenseFormation(): Formation {
    return DEFENSE_FORMATIONS[0];
  }
}
