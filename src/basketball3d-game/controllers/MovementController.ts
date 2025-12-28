import {Player} from "../entities/Player";
import {COURT_CONFIG} from "../config/gameConfig";

/**
 * プレイヤーの移動を管理するコントローラー
 * 注: Phase 2移行により、移動ロジックは状態ベースのActionシステムに移管されました
 * このクラスは後方互換性のため、最小限のユーティリティメソッドのみ提供します
 */
export class MovementController {
  private player1: Player;
  private player2: Player;
  private player2Enabled: boolean;

  constructor(player1: Player, player2: Player, player2Enabled: boolean) {
    this.player1 = player1;
    this.player2 = player2;
    this.player2Enabled = player2Enabled;
  }

  /**
   * Player2有効/無効を設定
   */
  setPlayer2Enabled(enabled: boolean): void {
    this.player2Enabled = enabled;
  }

  /**
   * リムの中心位置（Z座標）を取得
   */
  getRimCenterZ(side: "player1" | "player2"): number {
    const backboardZ = side === "player1" ? -COURT_CONFIG.length / 2 + COURT_CONFIG.backboardDistance : COURT_CONFIG.length / 2 - COURT_CONFIG.backboardDistance;
    const rimCenterZ = side === "player1" ? backboardZ + COURT_CONFIG.rimOffset : backboardZ - COURT_CONFIG.rimOffset;
    return rimCenterZ;
  }
}
