/**
 * FightGameEngine: Babylon.js scene setup, character loading, and game loop.
 * Extracted from page.tsx — page is now a thin React UI wrapper.
 */

import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color4, Color3, Quaternion,
  TransformNode,
} from '@babylonjs/core';
import { loadVoxFile, SCALE } from '@/lib/vox-parser';
import type { ModelEntry } from '@/lib/model-registry';
import {
  BONE_DEFS, calculateAllBones, getDefaultMarkers, voxelToViewer,
  buildSkeletalCharacter,
} from '@/lib/voxel-skeleton';
import { InputHandler } from '@/GamePlay/FightGame/Core/InputHandler';
import {
  createFighter, updateFighter, applyHit,
} from '@/GamePlay/FightGame/Fighter/Fighter';
import {
  createInitialFightState, checkRoundEnd, startNewRound,
} from '@/GamePlay/FightGame/Core/FightState';
import {
  STAGE_CONFIG, P1_SPAWN, P2_SPAWN, DEFAULT_FIGHTER_STATS,
} from '@/GamePlay/FightGame/Config/FighterConfig';
import { checkHit } from '@/GamePlay/FightGame/Combat/HitboxSystem';
import {
  triggerScreenShake, updateScreenShake,
  createHitParticles, spawnDamageNumber,
  updateDamageNumbers, disposeAllEffects,
} from '@/GamePlay/FightGame/Combat/HitEffects';
import { FighterMotionPlayer } from '@/GamePlay/FightGame/Fighter/FighterMotion';
import {
  createComboState, registerComboHit, updateCombo, resetCombo,
} from '@/GamePlay/FightGame/Combat/ComboSystem';
import type { ComboState } from '@/GamePlay/FightGame/Combat/ComboSystem';
import { FighterAI } from '@/GamePlay/FightGame/Core/FighterAI';
import type { AIDifficulty } from '@/GamePlay/FightGame/Core/FighterAI';
import { buildStage } from '@/GamePlay/FightGame/Stage/StageBuilder';
import { SoundManager } from '@/GamePlay/FightGame/Audio/SoundManager';
import {
  createGrappleState, canInitiateGrapple, startGrapple,
  updateGrapple, isGrappleActive,
} from '@/GamePlay/FightGame/Combat/GrappleSystem';
import type { GrappleState } from '@/GamePlay/FightGame/Combat/GrappleSystem';

export type GameMode = 'menu' | 'pvp' | 'cpu' | 'cpuvcpu';

/** UI state snapshot pushed to React every N frames */
export interface FightUIState {
  p1Hp: number;
  p2Hp: number;
  p1DelayHp: number;
  p2DelayHp: number;
  p1Guard: number;
  p2Guard: number;
  p1GuardBroken: boolean;
  p2GuardBroken: boolean;
  timer: number;
  phase: string;
  roundNum: number;
  p1Wins: number;
  p2Wins: number;
  p1Action: string;
  p2Action: string;
  matchWinner: string | null;
  p1ComboCount: number;
  p1ComboDmg: number;
  p2ComboCount: number;
  p2ComboDmg: number;
}

export class FightGameEngine {
  private disposed = false;
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private inputHandler: InputHandler;
  private sound: SoundManager;

  private matchState;
  private p1;
  private p2;
  private p1Root: TransformNode;
  private p2Root: TransformNode;
  private p1Nodes: Map<string, TransformNode> = new Map();
  private p2Nodes: Map<string, TransformNode> = new Map();
  private p1RestPos = new Map<string, Vector3>();
  private p2RestPos = new Map<string, Vector3>();
  private p1BodyHeight = 0;
  private p2BodyHeight = 0;
  private p1Motion: FighterMotionPlayer | null = null;
  private p2Motion: FighterMotionPlayer | null = null;
  private p1Combo: ComboState;
  private p2Combo: ComboState;
  private grapple: GrappleState;
  private p1DelayHpVal: number;
  private p2DelayHpVal: number;

  private gameMode: GameMode = 'menu';
  private aiP2: FighterAI;
  private aiP1: FighterAI;
  private resetMatchSignal = false;

  private lastTime = 0;
  private uiUpdateCounter = 0;
  private onUIUpdate: ((state: FightUIState) => void) | null = null;
  private onResize: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.45, 0.65, 0.90, 1);

    // Camera
    this.camera = new ArcRotateCamera('cam',
      Math.PI / 2, Math.PI / 3,
      STAGE_CONFIG.cameraDistance,
      new Vector3(0, STAGE_CONFIG.cameraHeight, 0),
      this.scene,
    );
    this.camera.lowerRadiusLimit = 3;
    this.camera.upperRadiusLimit = 50;
    this.camera.lowerBetaLimit = 0.2;
    this.camera.upperBetaLimit = Math.PI / 2.05;
    this.camera.attachControl(canvas, true);

    // Lights
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.5;
    hemi.groundColor = new Color3(0.05, 0.05, 0.12);
    const dir = new DirectionalLight('dir', new Vector3(-1, -2, 1), this.scene);
    dir.intensity = 0.4;

    // Sound
    this.sound = new SoundManager();

    // Input
    this.inputHandler = new InputHandler();

    // Game state
    this.matchState = createInitialFightState(DEFAULT_FIGHTER_STATS.maxHp);
    this.p1 = createFighter(P1_SPAWN.x, P1_SPAWN.z, Math.PI);
    this.p2 = createFighter(P2_SPAWN.x, P2_SPAWN.z, 0);
    this.p1Root = new TransformNode('p1_root', this.scene);
    this.p2Root = new TransformNode('p2_root', this.scene);
    this.p1Combo = createComboState();
    this.p2Combo = createComboState();
    this.grapple = createGrappleState();
    this.p1DelayHpVal = DEFAULT_FIGHTER_STATS.maxHp;
    this.p2DelayHpVal = DEFAULT_FIGHTER_STATS.maxHp;

    // AI
    this.aiP2 = new FighterAI('normal');
    this.aiP1 = new FighterAI('normal');

    // Resize
    this.onResize = () => this.engine.resize();
    window.addEventListener('resize', this.onResize);
  }

  /** Load assets and start render loop. Returns when ready. */
  async init(p1Model: ModelEntry, p2Model: ModelEntry): Promise<void> {
    await buildStage(this.scene);

    const [p1Data, p2Data] = await Promise.all([
      this.loadCharacterModel(p1Model, 'p1', this.p1Root),
      this.loadCharacterModel(p2Model, 'p2', this.p2Root),
    ]);
    if (this.disposed) return;

    this.p1Nodes = p1Data.nodes;
    this.p2Nodes = p2Data.nodes;
    this.p1RestPos = p1Data.restPos;
    this.p2RestPos = p2Data.restPos;
    this.p1BodyHeight = p1Data.bodyHeight;
    this.p2BodyHeight = p2Data.bodyHeight;

    // Initial positions
    this.p1Root.position.x = P1_SPAWN.x;
    this.p1Root.position.z = P1_SPAWN.z;
    this.p2Root.position.x = P2_SPAWN.x;
    this.p2Root.position.z = P2_SPAWN.z;
    this.p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI + Math.PI / 2);
    this.p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);

    this.matchState.phase = 'intro';
    this.matchState.phaseTimer = 0;

    // Motion players
    this.p1Motion = new FighterMotionPlayer(this.p1Nodes, this.p1RestPos, this.p1BodyHeight);
    this.p2Motion = new FighterMotionPlayer(this.p2Nodes, this.p2RestPos, this.p2BodyHeight);

    // Register game loop and start rendering
    this.lastTime = performance.now();
    this.scene.registerBeforeRender(() => this.gameLoop());
    this.engine.runRenderLoop(() => this.scene.render());
  }

  /** Set callback for UI state updates (throttled to every 6 frames) */
  setUICallback(cb: (state: FightUIState) => void): void {
    this.onUIUpdate = cb;
  }

  /** Start a game with the given mode */
  startGame(mode: 'pvp' | 'cpu' | 'cpuvcpu', p2Difficulty: AIDifficulty = 'normal', p1Difficulty: AIDifficulty = 'normal'): void {
    this.gameMode = mode;
    this.aiP2.setDifficulty(p2Difficulty);
    this.aiP1.setDifficulty(p1Difficulty);
  }

  /** Signal a full match reset */
  requestReset(): void {
    this.resetMatchSignal = true;
  }

  /** Return to menu */
  returnToMenu(): void {
    this.gameMode = 'menu';
  }

  getGameMode(): GameMode {
    return this.gameMode;
  }

  setMuted(muted: boolean): void {
    this.sound.setMuted(muted);
  }

  dispose(): void {
    this.disposed = true;
    disposeAllEffects();
    this.sound.dispose();
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
    }
    this.inputHandler.dispose();
    this.engine.dispose();
  }

  // ====================================================================
  // Character loading
  // ====================================================================
  private async loadCharacterModel(
    model: ModelEntry,
    prefix: string,
    rootNode: TransformNode,
  ) {
    const { model: voxModel, voxels } = await loadVoxFile(model.bodyFile);
    const cx = voxModel.sizeX / 2;
    const cy = voxModel.sizeY / 2;
    const maxZ = voxModel.sizeZ;

    // Load equipment
    let mergedVoxels = [...voxels];
    try {
      const partsResp = await fetch(model.partsManifest + `?v=${Date.now()}`);
      if (partsResp.ok) {
        const parts = await partsResp.json();
        const defaultParts = parts.filter((p: { key: string; default_on: boolean }) =>
          p.key !== model.bodyKey && p.default_on
        );
        const bodySet = new Set(mergedVoxels.map(v => `${v.x},${v.y},${v.z}`));
        for (const part of defaultParts) {
          try {
            const { voxels: equipVoxels } = await loadVoxFile(part.file);
            for (const v of equipVoxels) {
              const k = `${v.x},${v.y},${v.z}`;
              if (!bodySet.has(k)) { mergedVoxels.push(v); bodySet.add(k); }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* no equipment */ }

    // Load saved markers
    let markers = getDefaultMarkers(cx);
    try {
      const resp = await fetch(`/api/bone-config?dir=${model.dir}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data?.markers) markers = { ...markers, ...data.markers };
      }
    } catch { /* defaults */ }

    const bones = calculateAllBones(markers, maxZ);
    const charBuild = buildSkeletalCharacter(mergedVoxels, bones, this.scene, cx, cy, prefix);
    const hipsNode = charBuild.nodes.get('Hips');
    if (hipsNode && !hipsNode.parent) hipsNode.parent = rootNode;

    // Rest positions
    const restPos = new Map<string, Vector3>();
    for (const boneDef of BONE_DEFS) {
      const bp = bones[boneDef.name];
      if (bp) {
        restPos.set(boneDef.name, voxelToViewer(bp.x, bp.y, bp.z, cx, cy).clone());
      }
    }

    let bodyHeight = 0;
    const hipsPos = bones['Hips'];
    const headPos = bones['Head'];
    if (hipsPos && headPos) {
      bodyHeight = (headPos.z - hipsPos.z) * SCALE;
    }

    return { nodes: charBuild.nodes, restPos, bodyHeight };
  }

  // ====================================================================
  // Game loop
  // ====================================================================
  private gameLoop(): void {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const { matchState, p1, p2, grapple } = this;

    // Hitstop
    if (matchState.hitstopTimer > 0) {
      matchState.hitstopTimer--;
      return;
    }

    // Wait for mode selection
    if (this.gameMode === 'menu') return;

    // Check for match reset signal
    if (this.resetMatchSignal) {
      this.resetMatchSignal = false;
      this.resetAllState();
      return;
    }

    matchState.phaseTimer += dt;

    if (matchState.phase === 'intro') {
      this.handleIntroPhase(dt);
      return;
    }

    if (matchState.phase === 'ko') {
      this.handleKOPhase(dt);
      return;
    }

    if (matchState.phase !== 'fight') return;

    // Timer
    matchState.timer -= dt;
    if (matchState.timer < 0) matchState.timer = 0;

    // Input
    const p1Input = this.gameMode === 'cpuvcpu'
      ? this.aiP1.update(p1, p2, dt)
      : this.inputHandler.getP1Input();
    const p2Input = (this.gameMode === 'cpu' || this.gameMode === 'cpuvcpu')
      ? this.aiP2.update(p2, p1, dt)
      : this.inputHandler.getP2Input();

    // === GRAPPLE SYSTEM ===
    if (isGrappleActive(grapple)) {
      const isP1Attacker = grapple.attackerIndex === 1;
      const atkr = isP1Attacker ? p1 : p2;
      const defr = isP1Attacker ? p2 : p1;
      const defInput = isP1Attacker ? p2Input : p1Input;
      const atkInput = isP1Attacker ? p1Input : p2Input;

      const gResult = updateGrapple(
        grapple, atkr, defr,
        defInput.mash,
        atkInput.attack !== null,
        dt,
      );

      if (gResult.damage > 0) {
        if (isP1Attacker) {
          matchState.p2Hp = Math.max(0, matchState.p2Hp - gResult.damage);
        } else {
          matchState.p1Hp = Math.max(0, matchState.p1Hp - gResult.damage);
        }
        triggerScreenShake(0.02, 0.1);
        this.sound.play(gResult.mountPunchLanded ? 'hit_light' : 'hit_heavy');
      }

      this.syncRootPositions();
      if (this.p1Motion) this.p1Motion.update(p1, dt);
      if (this.p2Motion) this.p2Motion.update(p2, dt);
      this.updateCamera();
      updateScreenShake(this.camera, dt);
      updateDamageNumbers(dt);
      this.inputHandler.consumeFrame();
      checkRoundEnd(matchState);
      this.pushUIState();
      return;
    }

    // Check grapple initiation
    if (p1Input.grapple && canInitiateGrapple(p1, p2, grapple)) {
      startGrapple(p1Input.grapple, grapple, 1, p1, p2);
    }
    if (p2Input.grapple && canInitiateGrapple(p2, p1, grapple)) {
      startGrapple(p2Input.grapple, grapple, 2, p2, p1);
    }

    // Update fighters
    updateFighter(p1, p1Input, p2.x, p2.z, dt);
    updateFighter(p2, p2Input, p1.x, p1.z, dt);

    // Hit detection P1 → P2
    this.processHitDetection(p1, p2, this.p1Nodes, this.p2Nodes, this.p1Combo, true);
    // Hit detection P2 → P1
    this.processHitDetection(p2, p1, this.p2Nodes, this.p1Nodes, this.p2Combo, false);

    // Update combos
    updateCombo(this.p1Combo, dt);
    updateCombo(this.p2Combo, dt);

    checkRoundEnd(matchState);

    this.syncRootPositions();

    // Motion
    if (this.p1Motion) this.p1Motion.update(p1, dt);
    if (this.p2Motion) this.p2Motion.update(p2, dt);

    this.updateCamera();
    updateScreenShake(this.camera, dt);
    updateDamageNumbers(dt);
    this.inputHandler.consumeFrame();

    // Delayed HP drain
    const drainSpeed = 30;
    if (this.p1DelayHpVal > matchState.p1Hp) {
      this.p1DelayHpVal = Math.max(matchState.p1Hp, this.p1DelayHpVal - drainSpeed * dt);
    }
    if (this.p2DelayHpVal > matchState.p2Hp) {
      this.p2DelayHpVal = Math.max(matchState.p2Hp, this.p2DelayHpVal - drainSpeed * dt);
    }

    this.pushUIState();
  }

  private handleIntroPhase(dt: number): void {
    if (this.matchState.phaseTimer >= 1.5 && this.matchState.phaseTimer < 1.5 + dt * 2) {
      this.sound.play('round_start');
    }
    if (this.matchState.phaseTimer >= 2.0) {
      this.matchState.phase = 'fight';
      this.matchState.phaseTimer = 0;
      this.sound.play('fight');
    }
  }

  private handleKOPhase(dt: number): void {
    const { matchState, p1, p2, grapple } = this;

    // First frame of KO
    if (matchState.phaseTimer < dt * 2) {
      this.sound.play('ko');
      // Clear grapple
      grapple.active = null; grapple.phase = 'none'; grapple.phaseTimer = 0;
      grapple.escapeProgress = 0; grapple.mountTimer = 0; grapple.mountHits = 0;
      p1.grappleMotionKey = null;
      p2.grappleMotionKey = null;
      // Set loser to knockdown
      if (matchState.winner === 'p1' || matchState.winner === 'draw') {
        p2.action = 'knockdown';
        p2.knockdownVariant = Math.random() < 0.5 ? 'knockdown' : 'knockdown_fwd';
        p2.stunTimer = 0; p2.currentAttack = null; p2.currentMotion = null;
      }
      if (matchState.winner === 'p2' || matchState.winner === 'draw') {
        p1.action = 'knockdown';
        p1.knockdownVariant = Math.random() < 0.5 ? 'knockdown' : 'knockdown_fwd';
        p1.stunTimer = 0; p1.currentAttack = null; p1.currentMotion = null;
      }
    }

    // Slowmo then normal speed
    const koDt = matchState.phaseTimer < 0.8 ? dt * 0.3 : dt;
    if (this.p1Motion) this.p1Motion.update(p1, koDt);
    if (this.p2Motion) this.p2Motion.update(p2, koDt);

    if (matchState.phaseTimer >= 5.5) {
      if (matchState.matchWinner) {
        matchState.phase = 'result';
        matchState.phaseTimer = 0;
      } else {
        startNewRound(matchState);
        this.resetFightersForNewRound();
      }
    }

    this.pushUIState();
  }

  private processHitDetection(
    attacker: ReturnType<typeof createFighter>,
    defender: ReturnType<typeof createFighter>,
    atkNodes: Map<string, TransformNode>,
    defNodes: Map<string, TransformNode>,
    combo: ComboState,
    isP1Attacking: boolean,
  ): void {
    if (attacker.action !== 'attack' || attacker.attackPhase !== 'active' ||
        attacker.attackHasHit || !attacker.currentAttack) return;

    const result = checkHit(attacker.currentAttack, atkNodes, defNodes);
    if (!result.hit) return;

    const wasBlocked = defender.action === 'block';
    const fullDamage = attacker.currentAttack.damage * result.damageMultiplier;
    let actualDamage = wasBlocked
      ? fullDamage * defender.stats.blockDamageRatio
      : fullDamage;

    if (!wasBlocked) {
      actualDamage = registerComboHit(combo, actualDamage);
    }

    applyHit(defender, attacker.currentAttack, attacker.x, attacker.z);
    if (isP1Attacking) {
      this.matchState.p2Hp = Math.max(0, this.matchState.p2Hp - actualDamage);
    } else {
      this.matchState.p1Hp = Math.max(0, this.matchState.p1Hp - actualDamage);
    }
    this.matchState.hitstopTimer = STAGE_CONFIG.hitstopFrames;
    attacker.attackHasHit = true;

    // Effects
    createHitParticles(this.scene, result.hitPoint, wasBlocked);
    spawnDamageNumber(this.scene, result.hitPoint, actualDamage, wasBlocked);
    triggerScreenShake(wasBlocked ? 0.01 : 0.025, wasBlocked ? 0.08 : 0.15);

    if (wasBlocked) {
      this.sound.play(defender.guardBroken ? 'guard_break' : 'block');
    } else {
      this.sound.play(actualDamage > 12 ? 'hit_heavy' : 'hit_light');
    }
  }

  private syncRootPositions(): void {
    this.p1Root.position.x = this.p1.x;
    this.p1Root.position.y = this.p1.y;
    this.p1Root.position.z = this.p1.z;
    this.p2Root.position.x = this.p2.x;
    this.p2Root.position.y = this.p2.y;
    this.p2Root.position.z = this.p2.z;
    this.p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), this.p1.facingAngle + Math.PI / 2);
    this.p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), this.p2.facingAngle + Math.PI / 2);
  }

  private updateCamera(): void {
    const midX = (this.p1.x + this.p2.x) / 2;
    const midZ = (this.p1.z + this.p2.z) / 2;
    this.camera.target.x = midX;
    this.camera.target.z = midZ;
    this.camera.target.y = STAGE_CONFIG.cameraHeight;
  }

  private resetFighterState(f: ReturnType<typeof createFighter>, spawnX: number, spawnZ: number, facingAngle: number): void {
    f.x = spawnX; f.y = 0; f.z = spawnZ; f.vy = 0;
    f.facingAngle = facingAngle;
    f.action = 'idle'; f.stunTimer = 0; f.currentAttack = null;
    f.guard = f.stats.maxGuard; f.guardBroken = false;
    f.currentMotion = null; f.grappleMotionKey = null; f.knockdownVariant = 'knockdown';
  }

  private resetFightersForNewRound(): void {
    this.resetFighterState(this.p1, P1_SPAWN.x, P1_SPAWN.z, Math.PI);
    this.resetFighterState(this.p2, P2_SPAWN.x, P2_SPAWN.z, 0);
    this.p1Root.position.set(P1_SPAWN.x, 0, P1_SPAWN.z);
    this.p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI + Math.PI / 2);
    this.p2Root.position.set(P2_SPAWN.x, 0, P2_SPAWN.z);
    this.p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
    this.p1DelayHpVal = this.p1.stats.maxHp;
    this.p2DelayHpVal = this.p2.stats.maxHp;
    resetCombo(this.p1Combo);
    resetCombo(this.p2Combo);
    this.clearGrapple();
  }

  private resetAllState(): void {
    const ms = this.matchState;
    ms.phase = 'intro'; ms.phaseTimer = 0;
    ms.roundNumber = 1; ms.p1Wins = 0; ms.p2Wins = 0;
    ms.p1Hp = ms.maxHp; ms.p2Hp = ms.maxHp;
    ms.timer = STAGE_CONFIG.roundTime;
    ms.winner = null; ms.matchWinner = null; ms.hitstopTimer = 0;
    this.resetFightersForNewRound();
  }

  private clearGrapple(): void {
    this.grapple.active = null; this.grapple.phase = 'none'; this.grapple.phaseTimer = 0;
    this.grapple.escapeProgress = 0; this.grapple.mountTimer = 0; this.grapple.mountHits = 0;
  }

  private pushUIState(): void {
    this.uiUpdateCounter++;
    if (this.uiUpdateCounter % 6 !== 0 || !this.onUIUpdate) return;

    const { matchState, p1, p2 } = this;
    this.onUIUpdate({
      p1Hp: matchState.p1Hp,
      p2Hp: matchState.p2Hp,
      p1DelayHp: this.p1DelayHpVal,
      p2DelayHp: this.p2DelayHpVal,
      p1Guard: p1.guard,
      p2Guard: p2.guard,
      p1GuardBroken: p1.guardBroken,
      p2GuardBroken: p2.guardBroken,
      timer: matchState.timer,
      phase: matchState.phase,
      roundNum: matchState.roundNumber,
      p1Wins: matchState.p1Wins,
      p2Wins: matchState.p2Wins,
      p1Action: p1.action + (p1.grappleMotionKey ? `:${p1.grappleMotionKey}` : (p1.currentAttack ? `:${p1.currentAttack.name}` : '')),
      p2Action: p2.action + (p2.grappleMotionKey ? `:${p2.grappleMotionKey}` : (p2.currentAttack ? `:${p2.currentAttack.name}` : '')),
      matchWinner: matchState.matchWinner,
      p1ComboCount: this.p1Combo.hitCount,
      p1ComboDmg: Math.round(this.p1Combo.totalDamage),
      p2ComboCount: this.p2Combo.hitCount,
      p2ComboDmg: Math.round(this.p2Combo.totalDamage),
    });
  }
}
