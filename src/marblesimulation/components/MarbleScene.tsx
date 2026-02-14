"use client";

import { useRef, useState } from "react";
import { useMarbleControl } from "../hooks/useMarbleControl";
import { CourseType } from "../types/MarbleConfig";

const MODE_OPTIONS: { type: CourseType; label: string; desc: string }[] = [
  { type: CourseType.RANDOM, label: "ランダム衝突", desc: "フィールド内を自由に動き回り衝突し合う" },
  { type: CourseType.STRAIGHT, label: "直線レース", desc: "直線コースで速さを比較" },
];

/**
 * ビー玉物理シミュレーションのReactコンポーネント
 * モード選択UIを備え、切替時にシミュレーションを再構築する
 */
export default function MarbleScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [courseType, setCourseType] = useState<CourseType>(CourseType.RANDOM);
  const { loading, error } = useMarbleControl(canvasRef, courseType);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      {/* モード選択UI */}
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
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => setCourseType(opt.type)}
            title={opt.desc}
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
