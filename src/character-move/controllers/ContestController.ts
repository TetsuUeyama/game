import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CONTEST_CONFIG } from "../config/ContestConfig";

// 設定をre-export（既存のインポートを壊さないため）
export { CONTEST_CONFIG };

/**
 * 競り合いペアの状態
 */
interface ContestPair {
  character1: Character;
  character2: Character;
  startTime: number;              // 競り合い開始時刻
}

/**
 * 競り合いコントローラー
 * キャラクター同士のサークルが重なった時に、offense/defense値で押し合いを処理する
 * オフェンス側（ボール保持者）はoffense値、ディフェンス側はdefense値を使用
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
    const pos1 = char1.getPosition();
    const pos2 = char2.getPosition();

    // XZ平面上の距離を計算
    const dx = pos1.x - pos2.x;
    const dz = pos1.z - pos2.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // サークル半径の合計
    const radius1 = char1.getFootCircleRadius();
    const radius2 = char2.getFootCircleRadius();
    const minDistance = radius1 + radius2;

    return distance < minDistance;
  }

  /**
   * 重なり量を計算
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
   * ボール保持者はoffense値、非保持者はdefense値を使用
   */
  private getContestStat(character: Character): number {
    const holder = this.ball.getHolder();
    if (holder === character) {
      // ボール保持者はoffense値を使用
      return character.playerData?.stats?.offense ?? 50;
    } else {
      // 非保持者はdefense値を使用
      return character.playerData?.stats?.defense ?? 50;
    }
  }

  /**
   * offense/defense値に基づいた押し出し比率を計算
   * @returns { push1: 押し出し比率（char1が押される量）, push2: 押し出し比率（char2が押される量） }
   */
  private calculatePushRatios(char1: Character, char2: Character): { push1: number; push2: number } {
    // ステータス値を取得（ボール保持者はoffense、非保持者はdefense）
    const stat1 = this.getContestStat(char1);
    const stat2 = this.getContestStat(char2);

    // ステータス差を計算
    const statDiff = stat2 - stat1; // 正の値ならchar1が弱い

    if (statDiff === 0) {
      // 同等ステータスの場合、お互い同じ比率で押される
      return {
        push1: CONTEST_CONFIG.EQUAL_STAT_PUSH_RATIO,
        push2: CONTEST_CONFIG.EQUAL_STAT_PUSH_RATIO,
      };
    }

    // ステータス差に基づいて比率を計算
    // statDiff > 0: char1が弱い → char1が多く押される
    // statDiff < 0: char2が弱い → char2が多く押される
    const diffRatio = Math.abs(statDiff) / 100; // 0-1の範囲

    if (statDiff > 0) {
      // char1が弱い
      return {
        push1: 0.5 + diffRatio * 0.5, // 0.5〜1.0
        push2: 0.5 - diffRatio * 0.5, // 0.5〜0.0
      };
    } else {
      // char2が弱い
      return {
        push1: 0.5 - diffRatio * 0.5, // 0.5〜0.0
        push2: 0.5 + diffRatio * 0.5, // 0.5〜1.0
      };
    }
  }

  /**
   * 押し出し速度を計算
   */
  private calculatePushSpeed(char1: Character, char2: Character): number {
    const stat1 = this.getContestStat(char1);
    const stat2 = this.getContestStat(char2);

    // ステータス差が大きいほど速く押し出す
    const statDiff = Math.abs(stat1 - stat2);
    const speedBonus = statDiff * CONTEST_CONFIG.STAT_DIFF_MULTIPLIER;

    const speed = CONTEST_CONFIG.PUSH_SPEED_BASE + speedBonus;
    return Math.min(speed, CONTEST_CONFIG.PUSH_SPEED_MAX);
  }

  /**
   * 競り合いの押し出し処理を実行
   */
  private processPush(char1: Character, char2: Character, deltaTime: number): void {
    const overlap = this.getOverlapAmount(char1, char2);

    // 重なりがなければ何もしない
    if (overlap <= CONTEST_CONFIG.OVERLAP_MARGIN) {
      return;
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

    // パワーに基づいた押し出し比率を取得
    const ratios = this.calculatePushRatios(char1, char2);

    // 押し出し速度を計算
    const pushSpeed = this.calculatePushSpeed(char1, char2);

    // 押し出し量を計算（速度 × 時間 × 比率）
    const pushAmount = pushSpeed * deltaTime;

    // char1を押し出す（pushDirectionの方向 = char2から離れる方向）
    if (ratios.push1 > 0) {
      const push1Amount = pushAmount * ratios.push1;
      const newPos1 = new Vector3(
        pos1.x + pushDirection.x * push1Amount,
        pos1.y,
        pos1.z + pushDirection.z * push1Amount
      );
      char1.setPosition(newPos1);
    }

    // char2を押し出す（pushDirectionの逆方向 = char1から離れる方向）
    if (ratios.push2 > 0) {
      const push2Amount = pushAmount * ratios.push2;
      const newPos2 = new Vector3(
        pos2.x - pushDirection.x * push2Amount,
        pos2.y,
        pos2.z - pushDirection.z * push2Amount
      );
      char2.setPosition(newPos2);
    }
  }

  /**
   * 更新処理（毎フレーム呼び出し）
   */
  public update(deltaTime: number): void {
    const characters = this.allCharacters();
    const currentContests = new Set<string>();

    // 全キャラクターペアをチェック
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const char1 = characters[i];
        const char2 = characters[j];
        const pairKey = this.getPairKey(char1, char2);

        if (this.isOverlapping(char1, char2)) {
          currentContests.add(pairKey);

          // 新しい競り合いを開始
          if (!this.activeContests.has(pairKey)) {
            this.activeContests.set(pairKey, {
              character1: char1,
              character2: char2,
              startTime: Date.now(),
            });

            // const stat1 = this.getContestStat(char1);
            // const stat2 = this.getContestStat(char2);
            // const holder = this.ball.getHolder();
            // const char1Role = holder === char1 ? 'offense' : 'defense';
            // const char2Role = holder === char2 ? 'offense' : 'defense';
            // console.log(`[ContestController] 競り合い開始: ${char1.playerData?.basic?.NAME ?? 'char1'}(${char1Role}:${stat1}) vs ${char2.playerData?.basic?.NAME ?? 'char2'}(${char2Role}:${stat2})`);
          }

          // 押し出し処理を実行
          this.processPush(char1, char2, deltaTime);
        }
      }
    }

    // 終了した競り合いを削除
    for (const [pairKey, _contest] of this.activeContests) {
      if (!currentContests.has(pairKey)) {
        // const duration = (Date.now() - _contest.startTime) / 1000;
        // console.log(`[ContestController] 競り合い終了: ${_contest.character1.playerData?.basic?.NAME ?? 'char1'} vs ${_contest.character2.playerData?.basic?.NAME ?? 'char2'} (${duration.toFixed(2)}秒)`);
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
    duration: number;
  }> {
    const result: Array<{
      char1Name: string;
      char2Name: string;
      char1Stat: number;
      char2Stat: number;
      char1Role: 'offense' | 'defense';
      char2Role: 'offense' | 'defense';
      duration: number;
    }> = [];

    const holder = this.ball.getHolder();

    for (const contest of this.activeContests.values()) {
      const char1Role = holder === contest.character1 ? 'offense' : 'defense';
      const char2Role = holder === contest.character2 ? 'offense' : 'defense';
      result.push({
        char1Name: contest.character1.playerData?.basic?.NAME ?? 'unknown',
        char2Name: contest.character2.playerData?.basic?.NAME ?? 'unknown',
        char1Stat: this.getContestStat(contest.character1),
        char2Stat: this.getContestStat(contest.character2),
        char1Role: char1Role as 'offense' | 'defense',
        char2Role: char2Role as 'offense' | 'defense',
        duration: (Date.now() - contest.startTime) / 1000,
      });
    }

    return result;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.activeContests.clear();
  }
}
