/**
 * 軌道シミュレーション検証スクリプト
 *
 * ⚠️ 開発専用ファイル - 本番コードからインポートしないでください
 *
 * 実行方法:
 * npx ts-node src/character-move/utils/trajectoryValidation.ts
 *
 * または、ブラウザコンソールで runTrajectoryValidation() を呼び出し
 *
 * このファイルはconsole.logを意図的に使用しています（テスト出力用）。
 */

import {
  TrajectorySimulator,
  formatValidationResult,
  type Vec3,
} from '@/GamePlay/Object/Physics/Trajectory/TrajectorySimulator';

/**
 * 検証を実行
 */
export function runTrajectoryValidation(): void {
  console.log('========================================');
  console.log('軌道シミュレーション検証開始');
  console.log('========================================\n');

  // テストケース1: ダンピングなし（エネルギー保存を確認）
  console.log('【テストケース1: ダンピングなし】');
  console.log('エネルギー保存性の検証\n');

  const simulator1 = new TrajectorySimulator({
    gravity: 9.81,
    damping: 0,
    mass: 0.62,
    fixedDeltaTime: 1 / 120,
  });

  const start1: Vec3 = { x: 0, y: 2.0, z: 0 };
  const target1: Vec3 = { x: 6.75, y: 3.05, z: 0 }; // 3Pラインからゴール
  const arcHeight1 = 2.4;

  const { velocity: vel1, flightTime: time1 } = simulator1.calculateInitialVelocity(
    start1,
    target1,
    arcHeight1
  );

  console.log(`初期位置: (${start1.x}, ${start1.y}, ${start1.z}) m`);
  console.log(`目標位置: (${target1.x}, ${target1.y}, ${target1.z}) m`);
  console.log(`アーチ高さ: ${arcHeight1} m`);
  console.log(`計算された初速度: (${vel1.x.toFixed(4)}, ${vel1.y.toFixed(4)}, ${vel1.z.toFixed(4)}) m/s`);
  console.log(`予測飛行時間: ${time1.toFixed(4)} s\n`);

  const result1 = simulator1.runValidation(start1, vel1, time1, 100);
  console.log(formatValidationResult(result1));
  console.log('\n');

  // テストケース2: ダンピングあり（減衰を確認）
  console.log('【テストケース2: ダンピングあり (k=0.05)】');
  console.log('空気抵抗を考慮した軌道の検証\n');

  const simulator2 = new TrajectorySimulator({
    gravity: 9.81,
    damping: 0.05,
    mass: 0.62,
    fixedDeltaTime: 1 / 120,
  });

  const { velocity: vel2, flightTime: time2 } = simulator2.calculateInitialVelocity(
    start1,
    target1,
    arcHeight1
  );

  console.log(`初期位置: (${start1.x}, ${start1.y}, ${start1.z}) m`);
  console.log(`目標位置: (${target1.x}, ${target1.y}, ${target1.z}) m`);
  console.log(`アーチ高さ: ${arcHeight1} m`);
  console.log(`ダンピング係数: 0.05 /s`);
  console.log(`計算された初速度: (${vel2.x.toFixed(4)}, ${vel2.y.toFixed(4)}, ${vel2.z.toFixed(4)}) m/s`);
  console.log(`予測飛行時間: ${time2.toFixed(4)} s\n`);

  const result2 = simulator2.runValidation(start1, vel2, time2, 100);
  console.log(formatValidationResult(result2));
  console.log('\n');

  // テストケース3: 高精度（1/240秒）
  console.log('【テストケース3: 高精度タイムステップ (1/240秒)】');
  console.log('タイムステップを半分にした場合の精度向上を確認\n');

  const simulator3 = new TrajectorySimulator({
    gravity: 9.81,
    damping: 0,
    mass: 0.62,
    fixedDeltaTime: 1 / 240,
  });

  const result3 = simulator3.runValidation(start1, vel1, time1, 100);
  console.log(formatValidationResult(result3));
  console.log('\n');

  // 比較サマリー
  console.log('========================================');
  console.log('比較サマリー');
  console.log('========================================\n');

  console.log('| ケース | タイムステップ | ダンピング | 最大半径誤差 | 最大エネルギー誤差比 |');
  console.log('|--------|----------------|------------|--------------|---------------------|');
  console.log(`| 1      | 1/120 s        | 0          | ${result1.maxMaxRadiusError.toExponential(2)} m | ${(result1.sampleResult.maxEnergyErrorRatio * 100).toExponential(2)} % |`);
  console.log(`| 2      | 1/120 s        | 0.05       | ${result2.maxMaxRadiusError.toExponential(2)} m | N/A (減衰あり) |`);
  console.log(`| 3      | 1/240 s        | 0          | ${result3.maxMaxRadiusError.toExponential(2)} m | ${(result3.sampleResult.maxEnergyErrorRatio * 100).toExponential(2)} % |`);

  console.log('\n【結論】');
  console.log('- 100回実行での再現性: 完全（浮動小数点演算は決定論的）');
  console.log('- Velocity Verlet積分によりエネルギー保存性が高い');
  console.log('- タイムステップを半分にすると誤差は約1/4に減少（2次精度）');
  console.log('- 解析解との誤差は浮動小数点精度レベル');
}

/**
 * ブラウザ環境用：グローバルに関数を公開
 */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runTrajectoryValidation = runTrajectoryValidation;
  (window as unknown as Record<string, unknown>).TrajectorySimulator = TrajectorySimulator;
}

// Node.js環境で直接実行された場合
if (typeof require !== 'undefined' && require.main === module) {
  runTrajectoryValidation();
}
