/** 判断のコンテキスト（判断に必要な情報を格納するブラックボード） */
export interface DecisionContext {
  [key: string]: unknown;
}

/** 評価結果 */
export interface EvaluationResult {
  score: number; // 0.0〜1.0 の評価スコア
  confidence: number; // 確信度 0.0〜1.0
  reason?: string; // デバッグ用の理由
}

/** 評価器インターフェース */
export interface Evaluator<TContext extends DecisionContext = DecisionContext> {
  readonly name: string;
  evaluate(context: TContext): EvaluationResult;
}

/** 判断結果 */
export interface Decision<TAction = string> {
  action: TAction;
  score: number;
  evaluations: EvaluationResult[];
}
