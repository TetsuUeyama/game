import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  TransformNode,
} from "@babylonjs/core";

import { ENTITY_HEIGHT } from "../Config/FieldConfig";
import type { SimVisState } from "./SimVisualization";

const GAUGE_W = 0.5;
const GAUGE_H = 0.04;
const GAUGE_Y_OFFSET = 0.7;

/** charge, startup, active, recovery の4フェーズ */
type Phase4<T> = [T, T, T, T];

interface ActionGaugeMeshes {
  root: TransformNode;
  bg: Mesh;
  phases: Phase4<Mesh>;
  phaseMats: Phase4<StandardMaterial>;
}

export class ActionGaugeRenderer {
  private scene: Scene;
  private gauges: ActionGaugeMeshes[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  create(count: number): void {
    const phaseColors = [
      new Color3(1.0, 0.55, 0.0),   // charge: orange
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
      bg.position.z = 0.001;
      bg.isPickable = false;

      // Phase fill planes (4 phases: charge, startup, active, recovery)
      const phases: Mesh[] = [];
      const phaseMats: StandardMaterial[] = [];
      for (let p = 0; p < 4; p++) {
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
        phases: phases as Phase4<Mesh>,
        phaseMats: phaseMats as Phase4<StandardMaterial>,
      });
    }
  }

  sync(state: SimVisState, entityVisible?: boolean[]): void {
    const entities: { x: number; z: number }[] = [
      state.launcher,
      ...state.targets,
      ...state.obstacles,
    ];

    for (let i = 0; i < this.gauges.length && i < state.actionStates.length; i++) {
      const g = this.gauges[i];
      const as = state.actionStates[i];
      const ent = entities[i];

      if (as.phase === 'idle' || !as.timing || as.type === 'move' || (entityVisible && !entityVisible[i])) {
        g.root.setEnabled(false);
        continue;
      }

      g.root.setEnabled(true);
      g.root.position.set(ent.x, ENTITY_HEIGHT + GAUGE_Y_OFFSET, ent.z);

      const t = as.timing;
      const total = t.charge + t.startup + t.active + t.recovery;
      if (total <= 0) { g.root.setEnabled(false); continue; }

      const phaseWidths = [
        GAUGE_W * (t.charge / total),
        GAUGE_W * (t.startup / total),
        GAUGE_W * (t.active / total),
        GAUGE_W * (t.recovery / total),
      ];
      const phaseDurations = [t.charge, t.startup, t.active, t.recovery];
      const phaseIdx = as.phase === 'charge' ? 0
        : as.phase === 'startup' ? 1
        : as.phase === 'active' ? 2
        : 3;

      let xOffset = -GAUGE_W / 2;

      for (let p = 0; p < 4; p++) {
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
          fillRatio = 1.0;
          g.phaseMats[p].alpha = 0.6;
        } else if (p === phaseIdx) {
          fillRatio = Math.min(as.elapsed / dur, 1.0);
          g.phaseMats[p].alpha = 1.0;
        } else {
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

  dispose(): void {
    for (const g of this.gauges) {
      g.phases.forEach(p => { p.material?.dispose(); p.dispose(); });
      g.bg.material?.dispose();
      g.bg.dispose();
      g.root.dispose();
    }
    this.gauges = [];
  }
}
