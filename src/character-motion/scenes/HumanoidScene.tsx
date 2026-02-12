"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHumanoidControl } from "../hooks/useHumanoidControl";
import { CheckMode } from "../ui/CheckModeTypes";
import { FaceCheckPanel } from "../ui/FaceCheckPanel";
import { MotionCheckPanel } from "../ui/MotionCheckPanel";
import { IDLE_MOTION } from "../motion/IdleMotion";
import { WALK_MOTION } from "../motion/WalkMotion";

const AVAILABLE_MOTIONS = [
  { name: "idle", motion: IDLE_MOTION },
  { name: "walk", motion: WALK_MOTION },
];

/**
 * 人型キャラクターモーションのReactコンポーネント
 * canvas要素をレンダリングし、useHumanoidControl hookで初期化を管理
 */
export default function HumanoidScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    loading,
    error,
    faceParams,
    updateFaceParams,
    setFaceCloseUp,
    faceCamConfig,
    updateFaceCam,
    currentMotion,
    updateMotion,
    motionPlaying,
    setMotionPlaying,
    setMotionCheckMode,
  } = useHumanoidControl(canvasRef);

  const [mode, setMode] = useState<CheckMode>("face");
  const [activeCharIndex, setActiveCharIndex] = useState(0);

  const handleModeChange = useCallback((newMode: CheckMode) => {
    setMode(newMode);
    if (newMode === "face") {
      setFaceCloseUp(activeCharIndex);
      setMotionCheckMode(false);
    } else {
      setFaceCloseUp(null);
      setMotionCheckMode(true);
    }
  }, [activeCharIndex, setFaceCloseUp, setMotionCheckMode]);

  const handleCharIndexChange = useCallback((i: number) => {
    setActiveCharIndex(i);
    setFaceCloseUp(i);
  }, [setFaceCloseUp]);

  // ロード完了時に Face モードならカメラを顔位置に移動
  useEffect(() => {
    if (!loading && mode === "face") {
      setFaceCloseUp(activeCharIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleMotionSelect = (name: string) => {
    const found = AVAILABLE_MOTIONS.find((m) => m.name === name);
    if (found) updateMotion({ ...found.motion });
  };

  return (
    <div style={containerStyle}>
      {/* Mode tabs */}
      <div style={tabBarStyle}>
        <button
          onClick={() => handleModeChange("face")}
          style={mode === "face" ? activeModeTabStyle : modeTabStyle}
        >
          Face
        </button>
        <button
          onClick={() => handleModeChange("motion")}
          style={mode === "motion" ? activeModeTabStyle : modeTabStyle}
        >
          Motion
        </button>
      </div>

      {/* Main area: 3D viewport + side panel */}
      <div style={mainAreaStyle}>
        {/* 3D Viewport */}
        <div style={viewportStyle}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
          {loading && (
            <div style={overlayStyle}>
              Loading Character...
            </div>
          )}
          {error && (
            <div style={errorOverlayStyle}>
              <div>
                <div>Error: {error}</div>
                <div style={{ fontSize: "0.9rem", marginTop: "1rem", opacity: 0.8 }}>
                  public/models/character-motion/ に idle.glb と walk.glb を配置してください
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div style={sidePanelStyle}>
          {mode === "face" ? (
            <FaceCheckPanel
              faceParams={faceParams}
              activeCharIndex={activeCharIndex}
              onCharIndexChange={handleCharIndexChange}
              onParamsChange={updateFaceParams}
              faceCamConfig={faceCamConfig}
              onFaceCamChange={updateFaceCam}
            />
          ) : (
            <MotionCheckPanel
              motionData={currentMotion}
              onMotionChange={updateMotion}
              playing={motionPlaying}
              onPlayToggle={() => setMotionPlaying(!motionPlaying)}
              availableMotions={AVAILABLE_MOTIONS}
              onMotionSelect={handleMotionSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: "100vw",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "#1a1a1a",
  color: "#ddd",
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 2,
  padding: "4px 8px",
  background: "#111",
  borderBottom: "1px solid #333",
};

const modeTabStyle: React.CSSProperties = {
  padding: "6px 20px",
  background: "#222",
  color: "#999",
  borderTop: "1px solid #444",
  borderLeft: "1px solid #444",
  borderRight: "1px solid #444",
  borderBottom: "1px solid #444",
  borderRadius: "4px 4px 0 0",
  cursor: "pointer",
  fontSize: 13,
};

const activeModeTabStyle: React.CSSProperties = {
  ...modeTabStyle,
  background: "#333",
  color: "#fff",
  borderBottom: "2px solid #0078d4",
};

const mainAreaStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
};

const viewportStyle: React.CSSProperties = {
  flex: 1,
  position: "relative",
};

const sidePanelStyle: React.CSSProperties = {
  width: 320,
  background: "#222",
  borderLeft: "1px solid #333",
  padding: "8px",
  overflowY: "auto",
};

const overlayStyle: React.CSSProperties = {
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
};

const errorOverlayStyle: React.CSSProperties = {
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
};
