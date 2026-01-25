import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import {
  CircleSituation,
  CircleSizeUtils,
} from "../config/CircleSizeConfig";

/**
 * キャラクターのサークルサイズ状態
 */
interface CharacterCircleState {
  character: Character;
  currentSituation: CircleSituation;
  currentSize: number;
  targetSize: number;
}

/**
 * サークルサイズコントローラー
 * 各キャラクターのサークルサイズを状況に応じて管理・更新する
 */
export class CircleSizeController {
  private allCharacters: () => Character[];
  private ball: Ball;
  private characterStates: Map<Character, CharacterCircleState> = new Map();

  constructor(getAllCharacters: () => Character[], ball: Ball) {
    this.allCharacters = getAllCharacters;
    this.ball = ball;
  }

  /**
   * キャラクターの現在の状況を判定
   */
  private determineSituation(character: Character): CircleSituation {
    const holder = this.ball.getHolder();
    const isHoldingBall = holder === character;
    const actionController = character.getActionController();
    const currentAction = actionController.getCurrentAction();
    const currentPhase = actionController.getCurrentPhase();

    // アクション中の状況を優先
    if (currentAction) {
      if (currentAction.startsWith('shoot_') && currentAction !== 'shoot_feint') {
        // シュートアクションがrecoveryフェーズの場合は硬直中
        if (currentPhase === 'recovery') {
          return 'shoot_recovery';
        }
        return 'shooting';
      }
      if (currentAction.startsWith('pass_')) {
        return 'passing';
      }
      if (currentAction === 'dribble_breakthrough') {
        return 'dribbling';
      }
      if (currentAction === 'block_shot') {
        return 'blocking';
      }
    }

    // ボール保持状況による判定
    if (isHoldingBall) {
      return 'offense_with_ball';
    }

    // ボール保持者のチームを確認
    if (holder) {
      const holderTeam = holder.team;
      const characterTeam = character.team;

      if (holderTeam === characterTeam) {
        // 同じチーム = オフボール
        return 'offense_no_ball';
      } else {
        // 相手チーム = ディフェンス
        // ボール保持者との距離でマーキングかヘルプか判定
        const distanceToHolder = this.getDistanceXZ(character, holder);
        if (distanceToHolder < 3.0) {
          return 'defense_marking';
        } else {
          return 'defense_help';
        }
      }
    }

    // ボール保持者がいない = ルーズボール状態
    return 'loose_ball';
  }

  /**
   * XZ平面上の2キャラクター間の距離を計算
   */
  private getDistanceXZ(char1: Character, char2: Character): number {
    const pos1 = char1.getPosition();
    const pos2 = char2.getPosition();
    const dx = pos1.x - pos2.x;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * キャラクターの状態を初期化または取得
   */
  private getOrCreateState(character: Character): CharacterCircleState {
    let state = this.characterStates.get(character);
    if (!state) {
      const currentSize = character.getFootCircleRadius();
      state = {
        character,
        currentSituation: 'default',
        currentSize,
        targetSize: currentSize,
      };
      this.characterStates.set(character, state);
    }
    return state;
  }

  /**
   * 更新処理（毎フレーム呼び出し）
   */
  public update(deltaTime: number): void {
    const characters = this.allCharacters();

    for (const character of characters) {
      const state = this.getOrCreateState(character);

      // 状況を判定
      const newSituation = this.determineSituation(character);

      // 状況が変わった場合、新しい目標サイズを計算
      if (newSituation !== state.currentSituation) {
        state.currentSituation = newSituation;

        // ステータスを取得
        const stats = character.playerData?.stats;

        // 新しい目標サイズを計算
        state.targetSize = CircleSizeUtils.calculateCircleSize(newSituation, stats);
      }

      // サイズをスムーズに補間
      if (Math.abs(state.currentSize - state.targetSize) > 0.01) {
        state.currentSize = CircleSizeUtils.interpolateSize(
          state.currentSize,
          state.targetSize,
          deltaTime
        );

        // キャラクターに反映
        character.setFootCircleRadius(state.currentSize);
      }

      // サイズが0の場合はサークルを非表示、それ以外は表示
      if (state.targetSize === 0) {
        character.setFootCircleVisible(false);
      } else {
        character.setFootCircleVisible(true);
      }
    }

    // 不要になった状態を削除
    this.cleanupStates(characters);
  }

  /**
   * 不要になった状態を削除
   */
  private cleanupStates(currentCharacters: Character[]): void {
    const currentSet = new Set(currentCharacters);
    for (const [character] of this.characterStates) {
      if (!currentSet.has(character)) {
        this.characterStates.delete(character);
      }
    }
  }

  /**
   * 特定のキャラクターのサークルサイズを強制設定
   * @param character 対象キャラクター
   * @param size サイズ（メートル）
   * @param immediate true: 即座に反映、false: スムーズに変化
   */
  public setCircleSize(character: Character, size: number, immediate: boolean = false): void {
    const state = this.getOrCreateState(character);
    state.targetSize = size;

    if (immediate) {
      state.currentSize = size;
      character.setFootCircleRadius(size);
    }
  }

  /**
   * 特定のキャラクターの状況を強制設定
   * @param character 対象キャラクター
   * @param situation 状況
   * @param immediate true: 即座に反映、false: スムーズに変化
   */
  public setSituation(character: Character, situation: CircleSituation, immediate: boolean = false): void {
    const state = this.getOrCreateState(character);
    state.currentSituation = situation;

    const stats = character.playerData?.stats;
    state.targetSize = CircleSizeUtils.calculateCircleSize(situation, stats);

    if (immediate) {
      state.currentSize = state.targetSize;
      character.setFootCircleRadius(state.currentSize);
    }
  }

  /**
   * 特定のキャラクターの現在の状況を取得
   */
  public getSituation(character: Character): CircleSituation {
    const state = this.characterStates.get(character);
    return state?.currentSituation ?? 'default';
  }

  /**
   * 特定のキャラクターの現在のサイズを取得
   */
  public getCurrentSize(character: Character): number {
    const state = this.characterStates.get(character);
    return state?.currentSize ?? character.getFootCircleRadius();
  }

  /**
   * 特定のキャラクターの目標サイズを取得
   */
  public getTargetSize(character: Character): number {
    const state = this.characterStates.get(character);
    return state?.targetSize ?? character.getFootCircleRadius();
  }

  /**
   * 全キャラクターのサークル状態を取得（デバッグ用）
   */
  public getAllStates(): Array<{
    name: string;
    situation: CircleSituation;
    currentSize: number;
    targetSize: number;
  }> {
    const result: Array<{
      name: string;
      situation: CircleSituation;
      currentSize: number;
      targetSize: number;
    }> = [];

    for (const [character, state] of this.characterStates) {
      result.push({
        name: character.playerData?.basic?.NAME ?? 'unknown',
        situation: state.currentSituation,
        currentSize: state.currentSize,
        targetSize: state.targetSize,
      });
    }

    return result;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.characterStates.clear();
  }
}
