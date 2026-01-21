import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";

/**
 * フェイント設定
 */
export const FEINT_CONFIG = {
  // フェイント反応距離（この距離内のディフェンダーが反応する可能性がある）
  REACTION_DISTANCE: 2.5,          // 2.5m以内

  // ディフェンダーの反応確率ベース（0-1）
  BASE_REACTION_CHANCE: 0.7,       // 70%の確率で反応

  // ステータスによる補正
  OFFENSE_STAT_INFLUENCE: 0.003,   // offense値1あたり反応確率-0.3%
  DEFENSE_STAT_INFLUENCE: 0.003,   // defense値1あたり反応確率+0.3%

  // フェイント成功後のドリブル突破ボーナス時間（秒）
  BREAKTHROUGH_WINDOW: 1.0,        // 1秒以内にドリブル突破すると成功しやすい

  // 連続フェイント防止クールダウン（秒）
  FEINT_COOLDOWN: 1.5,
} as const;

/**
 * フェイント結果
 */
export interface FeintResult {
  success: boolean;
  defenderReacted: boolean;      // ディフェンダーが反応したか
  defender: Character | null;    // 反応したディフェンダー
  message: string;
}

/**
 * フェイントコントローラー
 * シュートフェイントなどのフェイント処理とディフェンスの反応を管理
 */
export class FeintController {
  private allCharacters: () => Character[];
  private ball: Ball;

  // フェイント成功状態（ドリブル突破ウィンドウ）
  private feintSuccessWindow: Map<Character, number> = new Map();

  // 最後のフェイント時刻（クールダウン用）
  private lastFeintTime: Map<Character, number> = new Map();

  constructor(getAllCharacters: () => Character[], ball: Ball) {
    this.allCharacters = getAllCharacters;
    this.ball = ball;
  }

  /**
   * シュートフェイントを実行
   * @param feinter フェイントを行うキャラクター
   * @returns フェイント結果
   */
  public performShootFeint(feinter: Character): FeintResult {
    // ボールを持っているか確認
    if (this.ball.getHolder() !== feinter) {
      return {
        success: false,
        defenderReacted: false,
        defender: null,
        message: 'ボールを持っていません',
      };
    }

    // クールダウン確認
    const now = Date.now() / 1000;
    const lastFeint = this.lastFeintTime.get(feinter) ?? 0;
    if (now - lastFeint < FEINT_CONFIG.FEINT_COOLDOWN) {
      return {
        success: false,
        defenderReacted: false,
        defender: null,
        message: 'フェイントのクールダウン中',
      };
    }

    // フェイントアクションを開始
    const actionController = feinter.getActionController();
    const actionResult = actionController.startAction('shoot_feint');

    if (!actionResult.success) {
      return {
        success: false,
        defenderReacted: false,
        defender: null,
        message: actionResult.message,
      };
    }

    // 最後のフェイント時刻を記録
    this.lastFeintTime.set(feinter, now);

    // 近くのディフェンダーを探す
    const nearestDefender = this.findNearestDefender(feinter);

    if (!nearestDefender) {
      console.log(`[FeintController] ${feinter.playerData?.basic?.NAME}: シュートフェイント（近くにディフェンダーなし）`);
      return {
        success: true,
        defenderReacted: false,
        defender: null,
        message: 'フェイント実行（ディフェンダー不在）',
      };
    }

    // ディフェンダーの反応判定
    const reactionChance = this.calculateReactionChance(feinter, nearestDefender);
    const didReact = Math.random() < reactionChance;

    console.log(
      `[FeintController] ${feinter.playerData?.basic?.NAME}: シュートフェイント → ` +
      `${nearestDefender.playerData?.basic?.NAME} 反応確率${(reactionChance * 100).toFixed(0)}% → ` +
      `${didReact ? '反応！' : '反応せず'}`
    );

    if (didReact) {
      // ディフェンダーがブロックに飛ぶ
      this.makeDefenderBlock(nearestDefender);

      // フェイント成功ウィンドウを設定
      this.feintSuccessWindow.set(feinter, now + FEINT_CONFIG.BREAKTHROUGH_WINDOW);

      return {
        success: true,
        defenderReacted: true,
        defender: nearestDefender,
        message: `フェイント成功！${nearestDefender.playerData?.basic?.NAME}がブロックに飛んだ`,
      };
    }

    return {
      success: true,
      defenderReacted: false,
      defender: nearestDefender,
      message: 'フェイント実行（ディフェンダー反応せず）',
    };
  }

  /**
   * 最も近いディフェンダーを探す
   */
  private findNearestDefender(feinter: Character): Character | null {
    const characters = this.allCharacters();
    const feinterPos = feinter.getPosition();
    const feinterTeam = feinter.team;

    let nearestDefender: Character | null = null;
    let nearestDistance = Infinity;

    for (const character of characters) {
      // 相手チームのみ
      if (character.team === feinterTeam) continue;

      const pos = character.getPosition();
      const dx = pos.x - feinterPos.x;
      const dz = pos.z - feinterPos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // 反応距離内かつ最も近い
      if (distance < FEINT_CONFIG.REACTION_DISTANCE && distance < nearestDistance) {
        nearestDefender = character;
        nearestDistance = distance;
      }
    }

    return nearestDefender;
  }

  /**
   * ディフェンダーの反応確率を計算
   */
  private calculateReactionChance(feinter: Character, defender: Character): number {
    const baseChance = FEINT_CONFIG.BASE_REACTION_CHANCE;

    // オフェンス側のoffense値（高いほど反応確率が下がる = フェイントが効きやすい）
    const offenseStat = feinter.playerData?.stats?.offense ?? 50;
    const offenseBonus = (offenseStat - 50) * FEINT_CONFIG.OFFENSE_STAT_INFLUENCE;

    // ディフェンス側のdefense値（高いほど反応確率が上がる = フェイントを見切りやすい）
    const defenseStat = defender.playerData?.stats?.defense ?? 50;
    const defenseBonus = (defenseStat - 50) * FEINT_CONFIG.DEFENSE_STAT_INFLUENCE;

    // 最終的な反応確率（0.2〜0.95の範囲にクランプ）
    const finalChance = baseChance - offenseBonus + defenseBonus;
    return Math.max(0.2, Math.min(0.95, finalChance));
  }

  /**
   * ディフェンダーにブロックを実行させる
   */
  private makeDefenderBlock(defender: Character): void {
    const actionController = defender.getActionController();

    // 現在のアクションをキャンセルしてブロックを実行
    actionController.cancelAction();
    const result = actionController.startAction('block_shot');

    if (result.success) {
      console.log(`[FeintController] ${defender.playerData?.basic?.NAME}: フェイントに反応してブロック実行`);
    }
  }

  /**
   * フェイント成功後のドリブル突破ウィンドウ内かどうか
   * @param character チェックするキャラクター
   * @returns ウィンドウ内の場合true
   */
  public isInBreakthroughWindow(character: Character): boolean {
    const windowEnd = this.feintSuccessWindow.get(character);
    if (!windowEnd) return false;

    const now = Date.now() / 1000;
    return now < windowEnd;
  }

  /**
   * フェイント成功ウィンドウをクリア
   */
  public clearBreakthroughWindow(character: Character): void {
    this.feintSuccessWindow.delete(character);
  }

  /**
   * 更新処理（毎フレーム呼び出し）
   * 期限切れのウィンドウをクリーンアップ
   */
  public update(_deltaTime: number): void {
    const now = Date.now() / 1000;

    // 期限切れのフェイント成功ウィンドウを削除
    for (const [character, windowEnd] of this.feintSuccessWindow) {
      if (now >= windowEnd) {
        this.feintSuccessWindow.delete(character);
      }
    }
  }

  /**
   * フェイント成功後のドリブル突破を実行
   * @param character ドリブル突破を行うキャラクター
   * @param direction 突破方向
   * @returns 成功した場合true
   */
  public performBreakthroughAfterFeint(
    character: Character,
    direction: 'left' | 'right' | 'forward'
  ): boolean {
    // フェイント成功ウィンドウ内か確認
    if (!this.isInBreakthroughWindow(character)) {
      console.log(`[FeintController] ${character.playerData?.basic?.NAME}: フェイント成功ウィンドウ外`);
      return false;
    }

    // ボールを持っているか確認
    if (this.ball.getHolder() !== character) {
      return false;
    }

    // ドリブル突破アクションを開始
    const actionController = character.getActionController();
    const result = actionController.startAction('dribble_breakthrough');

    if (result.success) {
      console.log(
        `[FeintController] ${character.playerData?.basic?.NAME}: ` +
        `フェイント後のドリブル突破（${direction}）`
      );
      this.clearBreakthroughWindow(character);
      return true;
    }

    return false;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.feintSuccessWindow.clear();
    this.lastFeintTime.clear();
  }
}
