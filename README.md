This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.

## キャラクターモーションシステム

### 概要

このプロジェクトでは、Babylon.jsを使用した3Dキャラクターのモーションシステムを実装しています。
モーションデータは時系列のキーフレームアニメーションとして定義され、各関節の回転角度と位置オフセットを制御します。

### モーションデータの構造

各モーションファイルは以下の構造で定義されています：

```typescript
// 1. 時間定数の定義
const T0 = 0.0;
const T1 = 0.5;
const T2 = 1.0;

// 2. 関節アニメーションデータ（軸ごとの時系列データ）
const JOINT_ANIMATIONS: Record<string, Record<number, number>> = {
  upperBodyX: {[T0]: 0, [T1]: 5, [T2]: 0},
  upperBodyY: {[T0]: 0, [T1]: 0, [T2]: 0},
  // ... 各関節のX/Y/Z軸データ
};

// 3. 位置アニメーションデータ（オプショナル）
const POSITION_ANIMATIONS: Record<string, Record<number, number>> = {
  x: {[T0]: 0, [T1]: 0, [T2]: 0},
  y: {[T0]: 0, [T1]: -0.5, [T2]: 0},
  z: {[T0]: 0, [T1]: 1.0, [T2]: 2.0},
};

// 4. モーションデータの定義
export const MOTION: MotionData = {
  name: "motion_name",
  duration: T2,
  loop: false,
  keyframes: buildKeyframes(JOINT_ANIMATIONS, POSITION_ANIMATIONS),
};
```

### 利用可能なモーション

- **IdleMotion.ts**: 待機モーション（呼吸アニメーション）
- **WalkMotion.ts**: 歩行モーション（前進、後退、左、右の4方向）
- **JumpMotion.ts**: ジャンプモーション
- **LandingMotion.ts**: 着地モーション（通常、小、大の3種類）
- **DashMotion.ts**: ダッシュモーション（前進、後退、左、右の4方向）
- **CrouchMotion.ts**: しゃがみモーション

### モーションの追加・編集方法

1. `src/character-move/data/` に新しいモーションファイルを作成
2. 時間定数（T0, T1, T2...）を定義
3. `JOINT_ANIMATIONS` オブジェクトで各関節の動きを定義
4. 必要に応じて `POSITION_ANIMATIONS` で位置移動を定義
5. `buildKeyframes()` ユーティリティ関数を使用してキーフレーム生成
6. `MotionData` と `MotionConfig` をエクスポート

**ユーティリティ関数**:
- `buildKeyframes(jointAnimations, positionAnimations?)`:
  - アニメーションデータからキーフレーム配列を自動生成
  - `src/character-move/utils/MotionUtils.ts` に実装

### 対応関節

- upperBody / lowerBody: 上半身 / 下半身
- head: 頭部
- leftShoulder / rightShoulder: 左肩 / 右肩
- leftElbow / rightElbow: 左肘 / 右肘
- leftHip / rightHip: 左腰 / 右腰
- leftKnee / rightKnee: 左膝 / 右膝

各関節について、X/Y/Z軸の回転角度（度数法）を指定できます。

## 操作方法

  新しいキー配置:

  移動操作:
  - W: 前進
  - A: 左移動
  - S: 後退
  - D: 右移動
  - Q: 左回転
  - E: 右回転

  アクション:
  - 1: NEUTRAL ポーズ
  - 2: DRIBBLE ポーズ
  - 3: DEFEND ポーズ
  - 4: SHOOT ポーズ
  - 5: LAYUP ポーズ
  - 6: ジャンプ
  - 7: ダッシュ

  デバッグ:
  - 8: 重心デバッグモード切り替え
  - 9: 移動可能範囲表示切り替え