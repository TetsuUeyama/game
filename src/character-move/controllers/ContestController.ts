import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CONTEST_CONFIG, ContestStatType } from "../config/ContestConfig";

// 設定をre-export（既存のインポートを壊さないため）
export { CONTEST_CONFIG };

/**
 * 競り合いペアの状態
 */
interface ContestPair {
  character1: Character;
  character2: Character;
  startTime: number;              // 競り合い開始時刻
  knockbackRemaining: number;     // 残りノックバック距離（メートル）
  isKnockbackPhase: boolean;      // ノックバックフェーズ中かどうか
}

/**
 * 競り合いコントローラー
 * キャラクター同士のサークルが重なった時に、設定されたパラメーターで押し合いを処理する
 *
 * 重なり許容設定:
 * - OVERLAP_TOLERANCE以内の重なりは押し返さない（移動中の軽い接触を許容）
 * - それ以上の重なりはパラメーターに従って押し返す
 *
 * 使用パラメーター:
 * - オフェンス側（ボール保持者）: CONTEST_CONFIG.OFFENSE_STAT
 * - ディフェンス側（ボール非保持者）: CONTEST_CONFIG.DEFENSE_STAT
 */
export class ContestController {
  private allCharacters: () => Character[];
  private ball: Ball;
  private activeContests: Map<string, ContestPair> = new Map();

  constructor(getAllCharacters: () => Character[], ball: Ball) {
    this.allCharacters = getAllCharacters;
    this.ball = ball;
  }

  /**
   * 競り合いペアのキーを生成
   */
  private getPairKey(char1: Character, char2: Character): string {
    // IDの順序を固定してキーを一意にする
    const id1 = char1.playerData?.basic?.ID ?? '';
    const id2 = char2.playerData?.basic?.ID ?? '';
    return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
  }

  /**
   * 2つのキャラクターのサークルが重なっているかチェック
   */
  private isOverlapping(char1: Character, char2: Character): boolean {
    const overlap = this.getOverlapAmount(char1, char2);
    return overlap > 0;
  }

  /**
   * 重なり量を計算（メートル）
   * 正の値 = 重なっている、0以下 = 重なっていない
   */
  private getOverlapAmount(char1: Character, char2: Character): number {
    const pos1 = char1.getPosition();
    const pos2 = char2.getPosition();

    const dx = pos1.x - pos2.x;
    const dz = pos1.z - pos2.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    const radius1 = char1.getFootCircleRadius();
    const radius2 = char2.getFootCircleRadius();
    const minDistance = radius1 + radius2;

    return Math.max(0, minDistance - distance);
  }

  /**
   * キャラクターの競り合いステータスを取得
   * ボール保持者はOFFENSE_STAT、非保持者はDEFENSE_STATを使用
   */
  private getContestStat(character: Character): number {
    const holder = this.ball.getHolder();
    const statType: ContestStatType = holder === character
      ? CONTEST_CONFIG.OFFENSE_STAT
      : CONTEST_CONFIG.DEFENSE_STAT;

    return this.getStatValue(character, statType);
  }

  /**
   * 指定したステータスタイプの値を取得
   */
  private getStatValue(character: Character, statType: ContestStatType): number {
    const stats = character.playerData?.stats;
    if (!stats) return 50; // デフォルト値

    switch (statType) {
      case 'offense':
        return stats.offense ?? 50;
      case 'defense':
        return stats.defense ?? 50;
      case 'power':
        return stats.power ?? 50;
      case 'speed':
        return stats.speed ?? 50;
      default:
        return 50;
    }
  }

  /**
   * パラメーターに基づいた押し出し比率を計算
   * ステータス差が大きいほど、弱い側が一方的に押される
   * @returns { push1: char1が押される比率, push2: char2が押される比率 }
   */
  private calculatePushRatios(char1: Character, char2: Character): { push1: number; push2: number } {
    // ステータス値を取得
    const stat1 = this.getContestStat(char1);
    const stat2 = this.getContestStat(char2);

    // ステータス差を計算
    const statDiff = stat2 - stat1; // 正の値ならchar1が弱い

    if (Math.abs(statDiff) < 1) {
      // ほぼ同等ステータスの場合、お互い同じ比率で押される
      return {
        push1: CONTEST_CONFIG.EQUAL_STAT_PUSH_RATIO,
        push2: CONTEST_CONFIG.EQUAL_STAT_PUSH_RATIO,
      };
    }

    // ステータス差に基づいて比率を計算（感度を考慮）
    // sensitivity = 2.0 の場合、statDiff = 50 で最大/最小比率に到達
    const sensitivity = CONTEST_CONFIG.STAT_RATIO_SENSITIVITY;
    const normalizedDiff = Math.abs(statDiff) / (100 / sensitivity);
    const diffRatio = Math.min(1, normalizedDiff); // 0-1の範囲にクランプ

    const minRatio = CONTEST_CONFIG.MIN_PUSH_RATIO;
    const maxRatio = CONTEST_CONFIG.MAX_PUSH_RATIO;

    if (statDiff > 0) {
      // char1が弱い → char1が多く押される
      return {
        push1: minRatio + (maxRatio - minRatio) * diffRatio, // 弱い側: 最大95%押される
        push2: maxRatio - (maxRatio - minRatio) * diffRatio, // 強い側: 最小5%押される
      };
    } else {
      // char2が弱い → char2が多く押される
      return {
        push1: maxRatio - (maxRatio - minRatio) * diffRatio,
        push2: minRatio + (maxRatio - minRatio) * diffRatio,
      };
    }
  }

  /**
   * ステータス差に基づいた押し返し距離を計算（フレームあたり）
   */
  private calculatePushDistance(char1: Character, char2: Character): number {
    const stat1 = this.getContestStat(char1);
    const stat2 = this.getContestStat(char2);

    // ステータス差が大きいほど速く押し出す
    const statDiff = Math.abs(stat1 - stat2);
    const statBonus = statDiff * CONTEST_CONFIG.STAT_DIFF_DISTANCE_MULTIPLIER;

    const distance = CONTEST_CONFIG.PUSH_DISTANCE_BASE + statBonus;
    return Math.min(distance, CONTEST_CONFIG.PUSH_DISTANCE_MAX);
  }

  /**
   * 競り合いの押し出し処理を実行
   * @returns 押し返しが完了したかどうか（ノックバックフェーズに移行すべきか）
   */
  private processPush(char1: Character, char2: Character): boolean {
    const overlap = this.getOverlapAmount(char1, char2);

    // 許容範囲内の重なりは押し返さない
    if (overlap <= CONTEST_CONFIG.OVERLAP_TOLERANCE) {
      return false;
    }

    // 解消マージン以下なら押し返し完了
    if (overlap <= CONTEST_CONFIG.OVERLAP_MARGIN) {
      return true; // ノックバックフェーズへ
    }

    const pos1 = char1.getPosition();
    const pos2 = char2.getPosition();

    // 押し出し方向を計算（お互いを離す方向）
    let pushDirection = new Vector3(
      pos1.x - pos2.x,
      0,
      pos1.z - pos2.z
    );

    // 同じ位置にいる場合はランダムな方向に
    if (pushDirection.length() < 0.01) {
      const randomAngle = Math.random() * Math.PI * 2;
      pushDirection = new Vector3(Math.sin(randomAngle), 0, Math.cos(randomAngle));
    } else {
      pushDirection.normalize();
    }

    // パラメーターに基づいた押し出し比率を取得
    const ratios = this.calculatePushRatios(char1, char2);

    // ステータス差に基づいた押し返し距離を計算
    const pushDistance = this.calculatePushDistance(char1, char2);

    // char1を押し出す（pushDirectionの方向 = char2から離れる方向）
    if (ratios.push1 > 0) {
      const push1Amount = pushDistance * ratios.push1;
      const newPos1 = new Vector3(
        pos1.x + pushDirection.x * push1Amount,
        pos1.y,
        pos1.z + pushDirection.z * push1Amount
      );
      char1.setPosition(newPos1);
    }

    // char2を押し出す（pushDirectionの逆方向 = char1から離れる方向）
    if (ratios.push2 > 0) {
      const push2Amount = pushDistance * ratios.push2;
      const newPos2 = new Vector3(
        pos2.x - pushDirection.x * push2Amount,
        pos2.y,
        pos2.z - pushDirection.z * push2Amount
      );
      char2.setPosition(newPos2);
    }

    return false; // まだ押し返し中
  }

  /**
   * ノックバック処理を実行
   * @returns ノックバックが完了したかどうか
   */
  private processKnockback(char1: Character, char2: Character, contest: ContestPair): boolean {
    if (contest.knockbackRemaining <= 0) {
      return true; // ノックバック完了
    }

    const pos1 = char1.getPosition();
    const pos2 = char2.getPosition();

    // ノックバック方向を計算（お互いを離す方向）
    let knockbackDirection = new Vector3(
      pos1.x - pos2.x,
      0,
      pos1.z - pos2.z
    );

    if (knockbackDirection.length() < 0.01) {
      const randomAngle = Math.random() * Math.PI * 2;
      knockbackDirection = new Vector3(Math.sin(randomAngle), 0, Math.cos(randomAngle));
    } else {
      knockbackDirection.normalize();
    }

    // このフレームでのノックバック量
    const knockbackAmount = Math.min(contest.knockbackRemaining, CONTEST_CONFIG.KNOCKBACK_SPEED);

    // 両者を等しく離す
    const halfKnockback = knockbackAmount / 2;

    const newPos1 = new Vector3(
      pos1.x + knockbackDirection.x * halfKnockback,
      pos1.y,
      pos1.z + knockbackDirection.z * halfKnockback
    );
    char1.setPosition(newPos1);

    const newPos2 = new Vector3(
      pos2.x - knockbackDirection.x * halfKnockback,
      pos2.y,
      pos2.z - knockbackDirection.z * halfKnockback
    );
    char2.setPosition(newPos2);

    // 残りノックバック距離を更新
    contest.knockbackRemaining -= knockbackAmount;

    return contest.knockbackRemaining <= 0;
  }

  /**
   * 更新処理（毎フレーム呼び出し）
   */
  public update(_deltaTime: number): void {
    const characters = this.allCharacters();
    const currentContests = new Set<string>();
    const completedContests: string[] = [];

    // 全キャラクターペアをチェック
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const char1 = characters[i];
        const char2 = characters[j];
        const pairKey = this.getPairKey(char1, char2);

        // 既存のコンテストを取得
        const existingContest = this.activeContests.get(pairKey);

        // ノックバックフェーズ中の処理
        if (existingContest && existingContest.isKnockbackPhase) {
          currentContests.add(pairKey);
          const knockbackComplete = this.processKnockback(char1, char2, existingContest);
          if (knockbackComplete) {
            completedContests.push(pairKey);
          }
          continue;
        }

        if (this.isOverlapping(char1, char2)) {
          currentContests.add(pairKey);

          // 新しい競り合いを開始
          if (!existingContest) {
            this.activeContests.set(pairKey, {
              character1: char1,
              character2: char2,
              startTime: Date.now(),
              knockbackRemaining: 0,
              isKnockbackPhase: false,
            });
          }

          // 押し出し処理を実行
          const pushComplete = this.processPush(char1, char2);

          // 押し返しが完了したらノックバックフェーズへ
          if (pushComplete) {
            const contest = this.activeContests.get(pairKey);
            if (contest) {
              contest.isKnockbackPhase = true;
              contest.knockbackRemaining = CONTEST_CONFIG.KNOCKBACK_DISTANCE;
            }
          }
        }
      }
    }

    // 完了したノックバックを削除
    for (const pairKey of completedContests) {
      this.activeContests.delete(pairKey);
    }

    // 重なりが解消された競り合いを削除（ノックバック中でないもの）
    for (const [pairKey, contest] of this.activeContests) {
      if (!currentContests.has(pairKey) && !contest.isKnockbackPhase) {
        this.activeContests.delete(pairKey);
      }
    }
  }

  /**
   * 特定のキャラクターが競り合い中かどうかをチェック
   */
  public isInContest(character: Character): boolean {
    for (const contest of this.activeContests.values()) {
      if (contest.character1 === character || contest.character2 === character) {
        return true;
      }
    }
    return false;
  }

  /**
   * 特定のキャラクターの競り合い相手を取得
   */
  public getContestOpponent(character: Character): Character | null {
    for (const contest of this.activeContests.values()) {
      if (contest.character1 === character) {
        return contest.character2;
      }
      if (contest.character2 === character) {
        return contest.character1;
      }
    }
    return null;
  }

  /**
   * 特定の2キャラクター間の重なり量を取得（デバッグ用）
   */
  public getOverlapBetween(char1: Character, char2: Character): number {
    return this.getOverlapAmount(char1, char2);
  }

  /**
   * 許容範囲を超えた重なりがあるかチェック
   */
  public hasExcessiveOverlap(char1: Character, char2: Character): boolean {
    const overlap = this.getOverlapAmount(char1, char2);
    return overlap > CONTEST_CONFIG.OVERLAP_TOLERANCE;
  }

  /**
   * アクティブな競り合いの数を取得
   */
  public getActiveContestCount(): number {
    return this.activeContests.size;
  }

  /**
   * アクティブな競り合い情報を取得（デバッグ用）
   */
  public getActiveContests(): Array<{
    char1Name: string;
    char2Name: string;
    char1Stat: number;
    char2Stat: number;
    char1Role: 'offense' | 'defense';
    char2Role: 'offense' | 'defense';
    overlap: number;
    isBeingPushed: boolean;
    duration: number;
  }> {
    const result: Array<{
      char1Name: string;
      char2Name: string;
      char1Stat: number;
      char2Stat: number;
      char1Role: 'offense' | 'defense';
      char2Role: 'offense' | 'defense';
      overlap: number;
      isBeingPushed: boolean;
      duration: number;
    }> = [];

    const holder = this.ball.getHolder();

    for (const contest of this.activeContests.values()) {
      const char1Role = holder === contest.character1 ? 'offense' : 'defense';
      const char2Role = holder === contest.character2 ? 'offense' : 'defense';
      const overlap = this.getOverlapAmount(contest.character1, contest.character2);

      result.push({
        char1Name: contest.character1.playerData?.basic?.NAME ?? 'unknown',
        char2Name: contest.character2.playerData?.basic?.NAME ?? 'unknown',
        char1Stat: this.getContestStat(contest.character1),
        char2Stat: this.getContestStat(contest.character2),
        char1Role: char1Role as 'offense' | 'defense',
        char2Role: char2Role as 'offense' | 'defense',
        overlap: overlap,
        isBeingPushed: overlap > CONTEST_CONFIG.OVERLAP_TOLERANCE,
        duration: (Date.now() - contest.startTime) / 1000,
      });
    }

    return result;
  }

  /**
   * 現在の設定値を取得（デバッグ用）
   */
  public getConfig(): typeof CONTEST_CONFIG {
    return CONTEST_CONFIG;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.activeContests.clear();
  }
}
