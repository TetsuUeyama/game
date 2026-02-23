import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  LinesMesh,
  TransformNode,
} from "@babylonjs/core";

import {
  ENTITY_HEIGHT,
  LAUNCHER_SIZE,
  TARGET_SIZE,
  OBSTACLE_SIZE,
  FOV_FULL_LEN,
  FOV_WINDOW_LEN,
} from "../Config/FieldConfig";
import { TARGET_COLORS_3D } from "../Config/EntityConfig";
import type { SimMover, SimPreFireInfo, SimScanMemory, ActionState } from "../Types/TrackingSimTypes";
import { dirSpeedMult } from "../Movement/MovementCore";
import { isTrajectoryInFOV, fovHalfAtDist } from "../Decision/TrajectoryAnalysis";

export interface SimVisState {
  launcher: SimMover;
  targets: SimMover[];
  obstacles: SimMover[];
  obMems: SimScanMemory[];
  obFocusDists: number[];
  preFire: SimPreFireInfo | null;
  ballActive: boolean;
  interceptPt: { x: number; z: number } | null;
  ballTrailPositions: Vector3[];
  actionStates: ActionState[];
}

// --- Action gauge constants ---
const GAUGE_W = 0.5;
const GAUGE_H = 0.04;
const GAUGE_Y_OFFSET = 0.15;

interface ActionGaugeMeshes {
  root: TransformNode;
  bg: Mesh;
  phases: [Mesh, Mesh, Mesh];
  phaseMats: [StandardMaterial, StandardMaterial, StandardMaterial];
}

export class SimVisualization {
  private scene: Scene;

  // Meshes
  launcherMesh!: Mesh;
  targetMeshes: Mesh[] = [];
  obstacleMeshes: Mesh[] = [];
  fovLines: LinesMesh[] = [];
  fovWindowLines: LinesMesh[] = [];
  reachLines: LinesMesh[] = [];
  trajectoryLine: LinesMesh | null = null;
  ballTrailLine: LinesMesh | null = null;
  interceptMarkerLine: LinesMesh | null = null;
  private gauges: ActionGaugeMeshes[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  createMeshes(): void {
    // Launcher (green box)
    this.launcherMesh = MeshBuilder.CreateBox("simLauncher", {
      width: LAUNCHER_SIZE, height: ENTITY_HEIGHT, depth: LAUNCHER_SIZE,
    }, this.scene);
    const launcherMat = new StandardMaterial("simLauncherMat", this.scene);
    launcherMat.diffuseColor = new Color3(0.27, 0.8, 0.27);
    launcherMat.specularColor = Color3.Black();
    this.launcherMesh.material = launcherMat;

    // Targets (colored boxes)
    for (let i = 0; i < 5; i++) {
      const mesh = MeshBuilder.CreateBox(`simTarget${i}`, {
        width: TARGET_SIZE, height: ENTITY_HEIGHT, depth: TARGET_SIZE,
      }, this.scene);
      const mat = new StandardMaterial(`simTargetMat${i}`, this.scene);
      const c = TARGET_COLORS_3D[i];
      mat.diffuseColor = new Color3(c.r, c.g, c.b);
      mat.specularColor = Color3.Black();
      mesh.material = mat;
      this.targetMeshes.push(mesh);
    }

    // Obstacles (purple boxes)
    for (let i = 0; i < 5; i++) {
      const mesh = MeshBuilder.CreateBox(`simOb${i}`, {
        width: OBSTACLE_SIZE, height: ENTITY_HEIGHT, depth: OBSTACLE_SIZE,
      }, this.scene);
      const mat = new StandardMaterial(`simObMat${i}`, this.scene);
      mat.diffuseColor = new Color3(0.6, 0.4, 0.8);
      mat.specularColor = Color3.Black();
      mesh.material = mat;
      this.obstacleMeshes.push(mesh);
    }

    // FOV lines (one pair per obstacle)
    for (let i = 0; i < 5; i++) {
      const line = MeshBuilder.CreateLines(`simFov${i}`, {
        points: [Vector3.Zero(), Vector3.Zero(), Vector3.Zero()],
        updatable: true,
      }, this.scene);
      line.color = new Color3(0.6, 0.4, 0.8);
      this.fovLines.push(line);
    }

    // Action gauges (1 launcher + 5 targets + 5 obstacles = 11)
    this.createActionGauges(11);
  }

  disposeMeshes(): void {
    this.launcherMesh?.dispose();
    this.targetMeshes.forEach(m => m.dispose());
    this.targetMeshes = [];
    this.obstacleMeshes.forEach(m => m.dispose());
    this.obstacleMeshes = [];
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
    this.disposeActionGauges();
  }

  syncAll(state: SimVisState): void {
    this.syncFovVisualization(state);
    this.syncReachVisualization(state);
    this.syncTrajectoryVisualization(state);
    this.syncBallTrailVisualization(state);
    this.syncInterceptMarker(state);
    this.syncActionGauges(state);
  }

  private createLine(name: string, points: Vector3[], r: number, g: number, b: number, alpha = 1.0): LinesMesh {
    const line = MeshBuilder.CreateLines(name, { points }, this.scene);
    line.color = new Color3(r, g, b);
    if (alpha < 1.0) {
      line.alpha = alpha;
    }
    return line;
  }

  private syncFovVisualization(state: SimVisState): void {
    const VIS_Y = 0.15;

    for (let i = 0; i < 5; i++) {
      const ob = state.obstacles[i];
      const mem = state.obMems[i];
      const searching = mem.searching;
      const fovHalf = searching
        ? Math.PI / 6
        : fovHalfAtDist(state.obFocusDists[i]);

      // --- Edge lines (full length FOV boundaries) ---
      const len = FOV_FULL_LEN;
      const leftAngle = ob.facing + fovHalf;
      const rightAngle = ob.facing - fovHalf;
      const origin = new Vector3(ob.x, VIS_Y, ob.z);
      const leftEnd = new Vector3(
        ob.x + Math.cos(leftAngle) * len, VIS_Y,
        ob.z + Math.sin(leftAngle) * len,
      );
      const rightEnd = new Vector3(
        ob.x + Math.cos(rightAngle) * len, VIS_Y,
        ob.z + Math.sin(rightAngle) * len,
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

      // Check if trajectory is in FOV for highlight color
      let trajInFov = false;
      if (state.preFire) {
        trajInFov = isTrajectoryInFOV(ob, state.launcher.x, state.launcher.z,
          state.preFire.estIPx, state.preFire.estIPz);
      }

      // Build window outline: inner arc -> right radial -> outer arc (reversed) -> left radial
      const windowPoints: Vector3[] = [];

      // Inner arc (left to right)
      for (let s = 0; s <= arcSteps; s++) {
        const t = s / arcSteps;
        const angle = ob.facing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          ob.x + Math.cos(angle) * innerR, VIS_Y - 0.01,
          ob.z + Math.sin(angle) * innerR,
        ));
      }
      // Right radial (inner to outer)
      windowPoints.push(new Vector3(
        ob.x + Math.cos(ob.facing + fovHalf) * outerR, VIS_Y - 0.01,
        ob.z + Math.sin(ob.facing + fovHalf) * outerR,
      ));
      // Outer arc (right to left, reversed)
      for (let s = arcSteps; s >= 0; s--) {
        const t = s / arcSteps;
        const angle = ob.facing - fovHalf + (2 * fovHalf) * t;
        windowPoints.push(new Vector3(
          ob.x + Math.cos(angle) * outerR, VIS_Y - 0.01,
          ob.z + Math.sin(angle) * outerR,
        ));
      }
      // Left radial (outer to inner, close the shape)
      windowPoints.push(new Vector3(
        ob.x + Math.cos(ob.facing - fovHalf) * innerR, VIS_Y - 0.01,
        ob.z + Math.sin(ob.facing - fovHalf) * innerR,
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

  private syncReachVisualization(state: SimVisState): void {
    for (let i = 0; i < this.reachLines.length; i++) {
      if (this.reachLines[i]) this.reachLines[i].dispose();
    }
    this.reachLines = [];

    // Only draw reach circles when pre-fire info is available
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

  private syncTrajectoryVisualization(state: SimVisState): void {
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

  private syncBallTrailVisualization(state: SimVisState): void {
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

  private syncInterceptMarker(state: SimVisState): void {
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

  // =========================================================================
  // Action gauge visualization
  // =========================================================================

  private createActionGauges(count: number): void {
    const phaseColors = [
      new Color3(1.0, 0.85, 0.0),   // startup: yellow
      new Color3(0.0, 0.8, 1.0),    // active: cyan
      new Color3(1.0, 0.25, 0.25),  // recovery: red
    ];

    for (let i = 0; i < count; i++) {
      const root = new TransformNode(`gaugeRoot_${i}`, this.scene);
      root.billboardMode = TransformNode.BILLBOARDMODE_ALL;
      root.setEnabled(false);

      // Background
      const bgMat = new StandardMaterial(`gaugeBgMat_${i}`, this.scene);
      bgMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
      bgMat.specularColor = Color3.Black();
      bgMat.alpha = 0.7;
      const bg = MeshBuilder.CreatePlane(`gaugeBg_${i}`, { width: GAUGE_W, height: GAUGE_H }, this.scene);
      bg.material = bgMat;
      bg.parent = root;
      bg.position.z = 0.001; // slightly behind fill planes
      bg.isPickable = false;

      // Phase fill planes
      const phases: Mesh[] = [];
      const phaseMats: StandardMaterial[] = [];
      for (let p = 0; p < 3; p++) {
        const mat = new StandardMaterial(`gaugePhMat_${i}_${p}`, this.scene);
        mat.diffuseColor = phaseColors[p];
        mat.specularColor = Color3.Black();
        mat.emissiveColor = phaseColors[p].scale(0.3);
        mat.alpha = 1.0;

        const plane = MeshBuilder.CreatePlane(`gaugePh_${i}_${p}`, {
          width: 1, height: GAUGE_H * 0.85,
        }, this.scene);
        plane.material = mat;
        plane.parent = root;
        plane.isPickable = false;

        phases.push(plane);
        phaseMats.push(mat);
      }

      this.gauges.push({
        root,
        bg,
        phases: phases as [Mesh, Mesh, Mesh],
        phaseMats: phaseMats as [StandardMaterial, StandardMaterial, StandardMaterial],
      });
    }
  }

  private disposeActionGauges(): void {
    for (const g of this.gauges) {
      g.phases.forEach(p => { p.material?.dispose(); p.dispose(); });
      g.bg.material?.dispose();
      g.bg.dispose();
      g.root.dispose();
    }
    this.gauges = [];
  }

  private syncActionGauges(state: SimVisState): void {
    const entities: { x: number; z: number }[] = [
      state.launcher,
      ...state.targets,
      ...state.obstacles,
    ];

    for (let i = 0; i < this.gauges.length && i < state.actionStates.length; i++) {
      const g = this.gauges[i];
      const as = state.actionStates[i];
      const ent = entities[i];

      if (as.phase === 'idle' || !as.timing) {
        g.root.setEnabled(false);
        continue;
      }

      g.root.setEnabled(true);
      g.root.position.set(ent.x, ENTITY_HEIGHT + GAUGE_Y_OFFSET, ent.z);

      const t = as.timing;
      const total = t.startup + t.active + t.recovery;
      if (total <= 0) { g.root.setEnabled(false); continue; }

      const phaseWidths = [
        GAUGE_W * (t.startup / total),
        GAUGE_W * (t.active / total),
        GAUGE_W * (t.recovery / total),
      ];
      const phaseDurations = [t.startup, t.active, t.recovery];
      const phaseIdx = as.phase === 'startup' ? 0 : as.phase === 'active' ? 1 : 2;

      let xOffset = -GAUGE_W / 2;

      for (let p = 0; p < 3; p++) {
        const pw = phaseWidths[p];
        const dur = phaseDurations[p];

        if (pw < 0.001 || dur <= 0) {
          g.phases[p].setEnabled(false);
          xOffset += pw;
          continue;
        }

        g.phases[p].setEnabled(true);

        let fillRatio: number;
        if (p < phaseIdx) {
          // Past phase: fully filled
          fillRatio = 1.0;
          g.phaseMats[p].alpha = 0.6;
        } else if (p === phaseIdx) {
          // Current phase: partial fill
          fillRatio = Math.min(as.elapsed / dur, 1.0);
          g.phaseMats[p].alpha = 1.0;
        } else {
          // Future phase: dim outline
          fillRatio = 1.0;
          g.phaseMats[p].alpha = 0.15;
        }

        const fillW = pw * fillRatio;
        g.phases[p].scaling.x = Math.max(fillW, 0.002);
        g.phases[p].position.x = xOffset + fillW / 2;

        xOffset += pw;
      }
    }
  }
}
