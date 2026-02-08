/**
 * 視覚情報のON/OFF状態を一元管理
 *
 * 実際のメッシュ操作は行わず、状態だけを管理する。
 * GameScene が apply（VisualizationManager / Field / Character に反映）する。
 */

export interface VisualSettings {
  shootTrajectory: boolean;
  passTrajectory: boolean;
  dribblePath: boolean;
  tacticalZones: boolean;
  visionCone: boolean;
  gridLines: boolean;
  gridLabels: boolean;
  shootRange: boolean;
}

export class VisualSettingsManager {
  private settings: VisualSettings = {
    shootTrajectory: false,
    passTrajectory: false,
    dribblePath: false,
    tacticalZones: false,
    visionCone: false,
    gridLines: true,
    gridLabels: false,
    shootRange: false,
  };

  getAll(): VisualSettings {
    return { ...this.settings };
  }

  get(key: keyof VisualSettings): boolean {
    return this.settings[key];
  }

  set(key: keyof VisualSettings, value: boolean): void {
    this.settings[key] = value;
  }

  toggle(key: keyof VisualSettings): boolean {
    this.settings[key] = !this.settings[key];
    return this.settings[key];
  }
}
