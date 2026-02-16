Babylon.js + Havok 物理エンジン 3D空間の作成        │
│                                                     │
│ Context                                             │
│                                                     │
│ src/falling-point-prediction/ にBabylon.jsとHavok物 │
│ 理エンジンを使った3D空間を作成する。地面・照明・重  │
│ 力のある物理シミュレーション空間を構築し、Next.js   │
│ App Router上で動作させる。                          │
│                                                     │
│ 1. パッケージインストール                           │
│                                                     │
│ npm install @babylonjs/core @babylonjs/havok        │
│                                                     │
│ 2. next.config.ts の変更                            │
│                                                     │
│ Havok の WASM ファイルを webpack                    │
│ で扱うため、asyncWebAssembly を有効化する。         │
│                                                     │
│ ファイル: next.config.ts                            │
│                                                     │
│ 3. ファイル構成                                     │
│                                                     │
│ src/                                                │
│   app/                                              │
│     falling-point-prediction/                       │
│       page.tsx                       # ルート       │
│ (dynamic import, ssr: false)                        │
│   falling-point-prediction/                         │
│     FallingPointPredictionView.tsx    # "use        │
│ client" ビューコンポーネント                        │
│     BabylonScene.tsx                 # "use client" │
│  canvasコンポーネント                               │
│     useBabylonScene.ts               #              │
│ カスタムフック (Engine lifecycle)                   │
│     createPhysicsScene.ts            #              │
│ シーン構築関数 (カメラ, 照明, 地面, 物理)           │
│                                                     │
│ 4. 各ファイルの役割                                 │
│                                                     │
│ ファイル: page.tsx                                  │
│ 内容: next/dynamic で ssr: false                    │
│   読み込み。Babylon.jsのサーバー評価を防ぐ          │
│ ────────────────────────────────────────            │
│ ファイル: FallingPointPredictionView.tsx            │
│ 内容: 全画面ラッパー + BabylonScene をレンダー      │
│ ────────────────────────────────────────            │
│ ファイル: BabylonScene.tsx                          │
│ 内容: <canvas> を保持し、useBabylonScene            │
│ フックに渡す                                        │
│ ────────────────────────────────────────            │
│ ファイル: useBabylonScene.ts                        │
│ 内容: Engine生成 → createPhysicsScene呼出 →         │
│ renderLoop                                          │
│   → cleanup                                         │
│ ────────────────────────────────────────            │
│ ファイル: createPhysicsScene.ts                     │
│ 内容: HavokPhysics                                  │
│                                                     │
│ WASM初期化、カメラ・ライト・地面・球体(デモ)を構築  │
│                                                     │
│ 5. シーン内容                                       │
│                                                     │
│ - カメラ: FreeCamera (マウス/キーボード操作可能)    │
│ - 照明: HemisphericLight                            │
│ - 地面: 10x10 の静的物理ボディ (mass: 0)            │
│ - デモ球体: y=5 から落下、バウンド (mass: 1,        │
│ restitution: 0.75)                                  │
│ - 重力: -9.81 m/s²                                  │
│                                                     │
│ 6. 検証方法                                         │
│                                                     │
│ 1. npm run dev でサーバー起動                       │
│ 2. /falling-point-prediction にアクセス             │
│ 3. 地面が表示され、球体が落下してバウンドすることを │
│ 確認                                                │
│ 4. カメラ操作が機能することを確認                   │
│ 5. コンソールにWASMエラーが出ないことを確認  