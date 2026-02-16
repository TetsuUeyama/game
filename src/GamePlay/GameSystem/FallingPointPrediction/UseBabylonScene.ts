"use client";

import { useEffect, type RefObject } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createPhysicsScene } from "./CreatePhysicsScene";

export function useBabylonScene(canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true);
    let disposed = false;

    const init = async () => {
      const scene = await createPhysicsScene(engine);
      if (disposed) {
        scene.dispose();
        return;
      }

      engine.runRenderLoop(() => {
        scene.render();
      });
    };

    init();

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      engine.stopRenderLoop();
      engine.dispose();
    };
  }, [canvasRef]);
}
