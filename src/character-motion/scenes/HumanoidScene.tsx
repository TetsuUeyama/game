"use client";

import { useRef } from "react";
import { useHumanoidControl } from "../hooks/useHumanoidControl";

/**
 * 人型キャラクターモーションのReactコンポーネント
 * canvas要素をレンダリングし、useHumanoidControl hookで初期化を管理
 */
export default function HumanoidScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loading, error } = useHumanoidControl(canvasRef);

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
          Loading Character...
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
            textAlign: "center",
          }}
        >
          <div>
            <div>Error: {error}</div>
            <div style={{ fontSize: "0.9rem", marginTop: "1rem", opacity: 0.8 }}>
              public/models/character-motion/ に idle.glb と walk.glb を配置してください
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
