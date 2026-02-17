/**
 * ライト設定
 */
export const LIGHT_CONFIG = {
  // 環境光
  ambient: {
    intensity: 0.6,
    color: '#FFFFFF',
  },

  // 太陽光
  directional: {
    intensity: 0.8,
    direction: { x: -1, y: -3, z: -1 },
    color: '#FFFFFF',
  },
};
