"use client";

// Reactのフック: useRef(DOM参照), useState(状態管理)をインポート
import { useRef, useState } from "react";
// ビー玉シミュレーション統合フックをインポート
import { useMarbleControl } from "@/GamePlay/GameSystem/MarbleSimulation/Hooks/UseMarbleControl";
// コースタイプのenum定義をインポート
import { CourseType } from "@/GamePlay/GameSystem/MarbleSimulation/Types/MarbleConfig";

/** モード選択UIの選択肢定義: コースタイプ・表示ラベル・説明テキスト */
const MODE_OPTIONS: { type: CourseType; label: string; desc: string }[] = [
  /** ランダム衝突モード: ヒューマノイドビー玉がフィールド内で衝突し合う */
  { type: CourseType.RANDOM, label: "ランダム衝突", desc: "フィールド内を自由に動き回り衝突し合う" },
  /** 直線レースモード: ビー玉が直線コースで速さを競う */
  { type: CourseType.STRAIGHT, label: "直線レース", desc: "直線コースで速さを比較" },
];

/**
 * ビー玉物理シミュレーションのReactコンポーネント
 * モード選択UIを備え、切替時にシミュレーションを再構築する
 */
export default function MarbleScene() {
  /** Babylon.js描画用のcanvas要素への参照 */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 現在選択中のコースタイプ（デフォルト: ランダム） */
  const [courseType, setCourseType] = useState<CourseType>(CourseType.RANDOM);
  /** シミュレーションの読み込み状態とエラー状態を取得 */
  const { loading, error } = useMarbleControl(canvasRef, courseType);

  return (
    /* ルートコンテナ: 全画面表示 */
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      {/* Babylon.js描画用のcanvas要素 */}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      {/* モード選択UI: 画面左上に固定配置 */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          gap: 8,
          zIndex: 10,
        }}
      >
        {/* 各モードボタンを動的生成 */}
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            /* クリックでコースタイプを切り替え → シミュレーション再構築 */
            onClick={() => setCourseType(opt.type)}
            /* ホバー時にコースの説明テキストを表示 */
            title={opt.desc}
            /* 選択中のモードはハイライト表示 */
            style={{
              padding: "8px 16px",
              border: courseType === opt.type ? "2px solid #4af" : "1px solid #666",
              borderRadius: 6,
              background: courseType === opt.type ? "rgba(40,80,160,0.9)" : "rgba(30,30,30,0.85)",
              color: courseType === opt.type ? "#fff" : "#aaa",
              fontSize: "0.9rem",
              fontWeight: courseType === opt.type ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ローディングオーバーレイ: 物理エンジン初期化中に表示 */}
      {loading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            color: "white",
            fontSize: "1.5rem",
          }}
        >
          Loading Havok Physics...
        </div>
      )}
      {/* エラーオーバーレイ: 初期化失敗時にエラーメッセージを表示 */}
      {error && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(100,0,0,0.8)",
            color: "white",
            fontSize: "1.2rem",
            padding: "2rem",
          }}
        >
          Error: {error}
        </div>
      )}
    </div>
  );
}
