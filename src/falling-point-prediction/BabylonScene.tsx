"use client";

import { useRef } from "react";
import { useBabylonScene } from "./useBabylonScene";

export function BabylonScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useBabylonScene(canvasRef);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
