import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";

/**
 * 競り合い設定
 */
export const CONTEST_CONFIG = {
  // 押し出し速度（m/s）
  PUSH_SPEED_BASE: 1.0,           // 基本押し出し速度
  PUSH_SPEED_MAX: 2.0,            // 最大押し出し速度

  // パワー差による影響
  POWER_DIFF_MULTIPLIER: 0.01,    // パワー差1あたりの速度増加率

  // 同等パワー時の処理
  EQUAL_POWER_PUSH_RATIO: 0.5,    // 同等パワー時のお互いの押し出し比率

  // 判定マージン
  OVERLAP_MARGIN: 0.01,           // 重なり解消判定のマージン（m）
} as const;

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
 * キャラクター同士のサークルが重なった時に、パワー比較で押し合いを処理する
 */
export class ContestController {
  private allCharacters: () => Character[];
  private activeContests: Map<string, ContestPair> = new Map();

  constructor(getAllCharacters: () => Character[]) {
    this.allCharacters = getAllCharacters;
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
   * パワーに基づいた押し出し比率を計算
   * @returns { push1: 押し出し比率（char1が押される量）, push2: 押し出し比率（char2が押される量） }
   */
  private calculatePushRatios(char1: Character, char2: Character): { push1: number; push2: number } {
    // パワー値を取得（デフォルトは50）
    const power1 = char1.playerData?.stats?.power ?? 50;
    const power2 = char2.playerData?.stats?.power ?? 50;

    // パワー差を計算
    const powerDiff = power2 - power1; // 正の値ならchar1が弱い

    if (powerDiff === 0) {
      // 同等パワーの場合、お互い同じ比率で押される
      return {
        push1: CONTEST_CONFIG.EQUAL_POWER_PUSH_RATIO,
        push2: CONTEST_CONFIG.EQUAL_POWER_PUSH_RATIO,
      };
    }

    // パワー差に基づいて比率を計算
    // powerDiff > 0: char1が弱い → char1が多く押される
    // powerDiff < 0: char2が弱い → char2が多く押される
    const diffRatio = Math.abs(powerDiff) / 100; // 0-1の範囲

    if (powerDiff > 0) {
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
    const power1 = char1.playerData?.stats?.power ?? 50;
    const power2 = char2.playerData?.stats?.power ?? 50;

    // パワー差が大きいほど速く押し出す
    const powerDiff = Math.abs(power1 - power2);
    const speedBonus = powerDiff * CONTEST_CONFIG.POWER_DIFF_MULTIPLIER;

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

            const power1 = char1.playerData?.stats?.power ?? 50;
            const power2 = char2.playerData?.stats?.power ?? 50;
            console.log(`[ContestController] 競り合い開始: ${char1.playerData?.basic?.NAME ?? 'char1'}(power:${power1}) vs ${char2.playerData?.basic?.NAME ?? 'char2'}(power:${power2})`);
          }

          // 押し出し処理を実行
          this.processPush(char1, char2, deltaTime);
        }
      }
    }

    // 終了した競り合いを削除
    for (const [pairKey, contest] of this.activeContests) {
      if (!currentContests.has(pairKey)) {
        const duration = (Date.now() - contest.startTime) / 1000;
        console.log(`[ContestController] 競り合い終了: ${contest.character1.playerData?.basic?.NAME ?? 'char1'} vs ${contest.character2.playerData?.basic?.NAME ?? 'char2'} (${duration.toFixed(2)}秒)`);
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
    char1Power: number;
    char2Power: number;
    duration: number;
  }> {
    const result: Array<{
      char1Name: string;
      char2Name: string;
      char1Power: number;
      char2Power: number;
      duration: number;
    }> = [];

    for (const contest of this.activeContests.values()) {
      result.push({
        char1Name: contest.character1.playerData?.basic?.NAME ?? 'unknown',
        char2Name: contest.character2.playerData?.basic?.NAME ?? 'unknown',
        char1Power: contest.character1.playerData?.stats?.power ?? 50,
        char2Power: contest.character2.playerData?.stats?.power ?? 50,
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
