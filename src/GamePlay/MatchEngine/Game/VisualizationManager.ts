/**
 * 可視化マネージャー
 * パス軌道、シュート軌道、ドリブル導線の可視化を管理
 */

import { PassTrajectoryVisualizer } from "@/GamePlay/GameSystem/CharacterMove/Visualization/PassTrajectoryVisualizer";
import { ShootTrajectoryVisualizer } from "@/GamePlay/GameSystem/ShootingSystem/ShootTrajectoryVisualizer";
import { DribblePathVisualizer } from "@/GamePlay/GameSystem/CharacterMove/Visualization/DribblePathVisualizer";

/**
 * 可視化マネージャー用コンテキスト
 */
export interface VisualizationManagerContext {
  passTrajectoryVisualizer?: PassTrajectoryVisualizer;
  shootTrajectoryVisualizer?: ShootTrajectoryVisualizer;
  dribblePathVisualizer?: DribblePathVisualizer;
}

/**
 * 可視化マネージャー
 */
export class VisualizationManager {
  private context: VisualizationManagerContext;

  constructor(context: VisualizationManagerContext) {
    this.context = context;
  }

  /**
   * コンテキストを更新（可視化オブジェクトの再設定用）
   */
  public updateContext(context: Partial<VisualizationManagerContext>): void {
    this.context = { ...this.context, ...context };
  }

  // =============================================================================
  // パス軌道可視化
  // =============================================================================

  /**
   * パス軌道可視化の表示/非表示を設定
   */
  public setPassTrajectoryVisible(visible: boolean): void {
    this.context.passTrajectoryVisualizer?.setEnabled(visible);
  }

  /**
   * パス軌道可視化の表示状態を取得
   */
  public isPassTrajectoryVisible(): boolean {
    return this.context.passTrajectoryVisualizer?.getEnabled() ?? false;
  }

  /**
   * パス軌道可視化の表示/非表示を切り替え
   */
  public togglePassTrajectoryVisible(): void {
    const visualizer = this.context.passTrajectoryVisualizer;
    if (visualizer) {
      visualizer.setEnabled(!visualizer.getEnabled());
    }
  }

  /**
   * パス軌道可視化の移動先予測を設定
   */
  public setPassTrajectoryDestinationPrediction(use: boolean): void {
    this.context.passTrajectoryVisualizer?.setUseDestinationPrediction(use);
  }

  // =============================================================================
  // シュート軌道可視化
  // =============================================================================

  /**
   * シュート軌道可視化の表示/非表示を設定
   */
  public setShootTrajectoryVisible(visible: boolean): void {
    this.context.shootTrajectoryVisualizer?.setEnabled(visible);
  }

  /**
   * シュート軌道可視化の表示状態を取得
   */
  public isShootTrajectoryVisible(): boolean {
    return this.context.shootTrajectoryVisualizer?.getEnabled() ?? false;
  }

  /**
   * シュート軌道可視化の表示/非表示を切り替え
   */
  public toggleShootTrajectoryVisible(): void {
    const visualizer = this.context.shootTrajectoryVisualizer;
    if (visualizer) {
      visualizer.setEnabled(!visualizer.getEnabled());
    }
  }

  // =============================================================================
  // ドリブル導線可視化
  // =============================================================================

  /**
   * ドリブル導線可視化の表示/非表示を設定
   */
  public setDribblePathVisible(visible: boolean): void {
    this.context.dribblePathVisualizer?.setEnabled(visible);
  }

  /**
   * ドリブル導線可視化の表示状態を取得
   */
  public isDribblePathVisible(): boolean {
    return this.context.dribblePathVisualizer?.getEnabled() ?? false;
  }

  /**
   * ドリブル導線可視化の表示/非表示を切り替え
   */
  public toggleDribblePathVisible(): void {
    const visualizer = this.context.dribblePathVisualizer;
    if (visualizer) {
      visualizer.setEnabled(!visualizer.getEnabled());
    }
  }
}
