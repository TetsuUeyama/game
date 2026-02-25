import {
  Scene,
  MeshBuilder,
  Color3,
  Vector3,
  LinesMesh,
} from "@babylonjs/core";

import {
  FOV_FULL_LEN,
  FOV_WINDOW_LEN,
} from "../Config/FieldConfig";

import type { SimVisState } from "./SimVisualization";
import { dirSpeedMult } from "../Movement/MovementCore";
import { isTrajectoryInFOV, fovHalfAtDist } from "../Decision/TrajectoryAnalysis";

export class OverlayRenderer {
  private scene: Scene;
  fovLines: LinesMesh[] = [];
  fovWindowLines: LinesMesh[] = [];
  reachLines: LinesMesh[] = [];
  trajectoryLine: LinesMesh | null = null;
  ballTrailLine: LinesMesh | null = null;
  interceptMarkerLine: LinesMesh | null = null;
  headFaceForwardOffset = 0;
  headFaceCenterY = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  createFovLines(): void {
    for (let i = 0; i < 5; i++) {
      const line = MeshBuilder.CreateLines(`simFov${i}`, {
        points: [Vector3.Zero(), Vector3.Zero(), Vector3.Zero()],
        updatable: true,
      }, this.scene);
      line.color = new Color3(0.6, 0.4, 0.8);
      this.fovLines.push(line);
    }
  }

  private createLine(name: string, points: Vector3[], r: number, g: number, b: number, alpha = 1.0): LinesMesh {
    const line = MeshBuilder.CreateLines(name, { points }, this.scene);
    line.color = new Color3(r, g, b);
    if (alpha < 1.0) {
      line.alpha = alpha;
    }
    return line;
  }

  syncFov(state: SimVisState): void {
    const faceY = this.headFaceCenterY;
    const fwd = this.headFaceForwardOffset;

    for (let i = 0; i < 5; i++) {
      const ob = state.obstacles[i];
      const mem = state.obMems[i];
      const searching = mem.searching;
      const fovHalf = searching
        ? Math.PI / 6
        : fovHalfAtDist(state.obFocusDists[i]);

      const cosF = Math.cos(ob.neckFacing);
      const sinF = Math.sin(ob.neckFacing);
      const faceX = ob.x + cosF * fwd;
      const faceZ = ob.z + sinF * fwd;

      // --- Edge lines (full length FOV boundaries) ---
      const len = FOV_FULL_LEN;
      const leftAngle = ob.neckFacing + fovHalf;
      const rightAngle = ob.neckFacing - fovHalf;
      const origin = new Vector3(faceX, faceY, faceZ);
      const leftEnd = new Vector3(
        faceX + Math.cos(leftAngle) * len, faceY,
        faceZ + Math.sin(leftAngle) * len,
      );
      const rightEnd = new Vector3(
        faceX + Math.cos(rightAngle) * len, faceY,
        faceZ + Math.sin(rightAngle) * len,
      );

      this.fovLines[i].dispose();
      if (searching) {
        this.fovLines[i] = this.createLine(`simFov${i}`, [leftEnd, origin, rightEnd], 1.0, 0.78, 0.39, 0.5);
      } else {
        this.fovLines[i] = this.createLine(`simFov${i}`, [leftEnd, origin, rightEnd], 0.6, 0.4, 0.8, 0.5);
      }

      // --- Sliding window (annular sector at focus distance) ---
      if (this.fovWindowLines[i]) this.fovWindowLines[i].dispose();

      const focusDist = state.obFocusDists[i];
      const halfWin = FOV_WINDOW_LEN / 2;
      const innerR = Math.max(0.1, focusDist - halfWin);
      const outerR = focusDist + halfWin;
      const arcSteps = 20;

      let trajInFov = false;
      if (state.preFire) {
        trajInFov = isTrajectoryInFOV(ob, state.launcher.x, state.launcher.z,
          state.preFire.estIPx, state.preFire.estIPz);
      }

      const windowPoints: Vector3[] = [];

      // Inner arc (left to right)
      for (let s = 0; s <= arcSteps; s++) {
        const t = s / arcSteps;
        const angle = ob.neckFacing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          faceX + Math.cos(angle) * innerR, faceY - 0.01,
          faceZ + Math.sin(angle) * innerR,
        ));
      }
      // Right radial (inner to outer)
      windowPoints.push(new Vector3(
        faceX + Math.cos(ob.neckFacing + fovHalf) * outerR, faceY - 0.01,
        faceZ + Math.sin(ob.neckFacing + fovHalf) * outerR,
      ));
      // Outer arc (right to left, reversed)
      for (let s = arcSteps; s >= 0; s--) {
        const t = s / arcSteps;
        const angle = ob.neckFacing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          faceX + Math.cos(angle) * outerR, faceY - 0.01,
          faceZ + Math.sin(angle) * outerR,
        ));
      }
      // Left radial (outer to inner, close the shape)
      windowPoints.push(new Vector3(
        faceX + Math.cos(ob.neckFacing - fovHalf) * innerR, faceY - 0.01,
        faceZ + Math.sin(ob.neckFacing - fovHalf) * innerR,
      ));

      const [wr, wg, wb, wa] = trajInFov
        ? [1.0, 0.6, 0.2, 0.8]
        : searching
          ? [1.0, 0.78, 0.39, 0.6]
          : [0.6, 0.4, 0.8, 0.6];

      this.fovWindowLines[i] = this.createLine(
        `simFovWin${i}`, windowPoints, wr, wg, wb, wa,
      );
    }
  }

  syncReach(state: SimVisState): void {
    for (let i = 0; i < this.reachLines.length; i++) {
      if (this.reachLines[i]) this.reachLines[i].dispose();
    }
    this.reachLines = [];

    if (!state.preFire) return;

    const pf = state.preFire;
    const VIS_Y = 0.12;

    for (let i = 0; i < 5; i++) {
      const ob = state.obstacles[i];
      const baseReach = pf.obReaches[i];
      const isBlocking = pf.obBlocks[i];
      const segments = 32;
      const points: Vector3[] = [];

      for (let s = 0; s <= segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const mult = dirSpeedMult(ob.facing, angle);
        const r = baseReach * mult;
        points.push(new Vector3(
          ob.x + Math.cos(angle) * r, VIS_Y,
          ob.z + Math.sin(angle) * r,
        ));
      }

      if (isBlocking) {
        this.reachLines.push(this.createLine(`simReach${i}`, points, 1.0, 0.3, 0.3, 0.7));
      } else {
        this.reachLines.push(this.createLine(`simReach${i}`, points, 0.6, 0.4, 0.8, 0.4));
      }
    }
  }

  syncTrajectory(state: SimVisState): void {
    if (this.trajectoryLine) {
      this.trajectoryLine.dispose();
      this.trajectoryLine = null;
    }
    if (state.preFire) {
      const pf = state.preFire;
      const VIS_Y = 0.18;
      const from = new Vector3(state.launcher.x, VIS_Y, state.launcher.z);
      const to = new Vector3(pf.estIPx, VIS_Y, pf.estIPz);
      if (pf.blocked) {
        this.trajectoryLine = this.createLine("simTraj", [from, to], 1.0, 0.3, 0.3, 1.0);
      } else {
        this.trajectoryLine = this.createLine("simTraj", [from, to], 0.4, 1.0, 0.4, 1.0);
      }
    }
  }

  syncBallTrail(state: SimVisState): void {
    if (this.ballTrailLine) {
      this.ballTrailLine.dispose();
      this.ballTrailLine = null;
    }

    if (state.ballTrailPositions.length >= 2) {
      this.ballTrailLine = this.createLine(
        "simBallTrail", state.ballTrailPositions,
        1.0, 0.85, 0.2, 0.6,
      );
    }
  }

  syncInterceptMarker(state: SimVisState): void {
    if (this.interceptMarkerLine) {
      this.interceptMarkerLine.dispose();
      this.interceptMarkerLine = null;
    }

    if (state.interceptPt && state.ballActive) {
      const ix = state.interceptPt.x;
      const iz = state.interceptPt.z;
      const s = 0.3;
      const VIS_Y = 0.16;
      this.interceptMarkerLine = this.createLine(
        "simIntercept",
        [
          new Vector3(ix - s, VIS_Y, iz - s),
          new Vector3(ix + s, VIS_Y, iz + s),
          new Vector3(ix, VIS_Y, iz),
          new Vector3(ix + s, VIS_Y, iz - s),
          new Vector3(ix - s, VIS_Y, iz + s),
        ],
        1.0, 0.4, 0.4, 0.8,
      );
    }
  }

  dispose(): void {
    this.fovLines.forEach(l => l.dispose());
    this.fovLines = [];
    this.fovWindowLines.forEach(l => l.dispose());
    this.fovWindowLines = [];
    this.reachLines.forEach(l => l.dispose());
    this.reachLines = [];
    if (this.trajectoryLine) {
      this.trajectoryLine.dispose();
      this.trajectoryLine = null;
    }
    if (this.ballTrailLine) {
      this.ballTrailLine.dispose();
      this.ballTrailLine = null;
    }
    if (this.interceptMarkerLine) {
      this.interceptMarkerLine.dispose();
      this.interceptMarkerLine = null;
    }
  }
}
