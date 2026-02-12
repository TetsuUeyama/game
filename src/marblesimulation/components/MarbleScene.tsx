"use client";

import { useRef } from "react";
import { useMarbleControl } from "../hooks/useMarbleControl";

/**
 * ビー玉物理シミュレーションのReactコンポーネント
 * canvas要素をレンダリングし、useMarbleControl hookで初期化を管理
 */
export default function MarbleScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loading, error } = useMarbleControl(canvasRef);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
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
