import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { CharacterState } from "../types/CharacterState";
import { PlayerPosition } from "../config/FormationConfig";

/**
 * フレームごとの選手スナップショット
 * update()で毎フレーム再構築される
 */
export interface PlayerStateSnapshot {
  /** 元のCharacterへの参照 */
  character: Character;
  /** キャッシュされた位置 */
  position: Vector3;
  /** キャッシュされた速度 */
  velocity: Vector3;
  /** チーム */
  team: 'ally' | 'enemy';
  /** 現在の状態 */
  state: CharacterState;
  /** ポジション（PG/SG/SF/PF/C） */
  playerPosition: PlayerPosition | null;
  /** ボール保持中か */
  hasBall: boolean;
  /** スピード能力値（キャッシュ） */
  speedStat: number;
}

/**
 * チーム単位の状態
 */
export interface TeamState {
  /** チーム識別 */
  team: 'ally' | 'enemy';
  /** オフェンス中か */
  isOnOffense: boolean;
  /** ボール保持者のスナップショット（いない場合null） */
  ballHolder: PlayerStateSnapshot | null;
  /** チーム全選手のスナップショット */
  players: PlayerStateSnapshot[];
}

/**
 * 範囲検索オプション
 */
export interface RadiusQueryOptions {
  /** 検索の中心点 */
  center: Vector3;
  /** 検索半径 */
  radius: number;
  /** チームフィルタ（省略時は全チーム） */
  team?: 'ally' | 'enemy';
  /** 除外するキャラクター */
  exclude?: Character;
}
