/**
 * オフェンス・ディフェンス役割の型定義
 * 元: GameSystem/StatusCheckSystem/PlayerStateTypes.ts から移動
 */

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
