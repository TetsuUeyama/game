import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { CharacterState } from "../types/CharacterState";
import { PlayerPosition } from "../config/FormationConfig";

/**
 * オフェンス時の役割
 * ボール保持チーム側のプレイスタイルを決定する
 */
export enum OffenseRole {
  /** メインハンドラー: プレイメイク担当、ボール運び・起点 */
  MAIN_HANDLER = 'MAIN_HANDLER',
  /** セカンドハンドラー: 第2のボール運び・プレイメイク */
  SECOND_HANDLER = 'SECOND_HANDLER',
  /** スペーサー: 外角に広がりスペースを作る（3P担当） */
  SPACER = 'SPACER',
  /** スクリーナー: スクリーン（ピック）をセットする */
  SCREENER = 'SCREENER',
  /** ダンカー: ゴール下付近でフィニッシュ */
  DUNKER = 'DUNKER',
  /** スラッシャー: カッティング・ドライブでゴールに切り込む */
  SLASHER = 'SLASHER',
}

/**
 * ディフェンス時の役割
 * 守備チーム側の担当を決定する
 */
export enum DefenseRole {
  /** POA (Point of Attack): メインハンドラーへの守備 */
  POA = 'POA',
  /** Nail: セカンドハンドラー／スラッシャーへの守備 */
  NAIL = 'NAIL',
  /** Low Man: ダンカーへの守備 */
  LOW_MAN = 'LOW_MAN',
  /** Closeout: スペーサーへの守備 */
  CLOSEOUT = 'CLOSEOUT',
  /** Scrambler: 全体調整を行う穴埋め */
  SCRAMBLER = 'SCRAMBLER',
}

/**
 * チーム守備スキーム
 * ピック&ロールやスクリーン対応時のチーム全体の守備方針
 */
export enum DefenseScheme {
  /** ドロップ: ビッグマンがリム付近まで下がり、ペイント内を守る */
  DROP = 'DROP',
  /** スイッチ: スクリーン時にマークマンを入れ替える */
  SWITCH = 'SWITCH',
  /** ゾーン: エリア担当制（マンツーマンではなく担当区域を守る） */
  ZONE = 'ZONE',
}

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
  /** オフェンス時の役割 */
  offenseRole: OffenseRole | null;
  /** ディフェンス時の役割 */
  defenseRole: DefenseRole | null;
  /** シュート優先度（1=ファーストチョイス〜5=フィフスチョイス、未設定時null） */
  shotPriority: number | null;
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
  /** チーム守備スキーム */
  defenseScheme: DefenseScheme;
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
