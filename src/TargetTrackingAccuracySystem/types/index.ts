/** 追跡対象の情報 */
export interface TrackingTarget {
  id: string;
  position: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
}

/** 追跡精度の測定結果 */
export interface AccuracyMeasurement {
  accuracy: number; // 0.0〜1.0 の精度スコア
  deviation: number; // 目標からのずれ量
  timestamp: number; // 測定時刻
  reason?: string; // デバッグ用の理由
}

/** 追跡コンテキスト（追跡に必要な情報を格納） */
export interface TrackingContext {
  target: TrackingTarget;
  currentPosition: { x: number; y: number; z: number };
  deltaTime: number;
  [key: string]: unknown;
}

/** 追跡精度評価器インターフェース */
export interface AccuracyEvaluator<
  TContext extends TrackingContext = TrackingContext,
> {
  readonly name: string;
  evaluate(context: TContext): AccuracyMeasurement;
}
