'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color4, Color3, Quaternion,
  TransformNode,
} from '@babylonjs/core';
import { loadVoxFile, SCALE } from '@/lib/vox-parser';
import { MODEL_REGISTRY } from '@/lib/model-registry';
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

// ========================================================================
// Page component
// ========================================================================
export default function FightPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<'menu' | 'pvp' | 'cpu' | 'cpuvcpu'>('menu');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('normal');
  const [ai2Difficulty, setAi2Difficulty] = useState<AIDifficulty>('normal');
  const gameModeRef = useRef<'menu' | 'pvp' | 'cpu' | 'cpuvcpu'>('menu');
  const aiRef = useRef<FighterAI | null>(null);
  const ai1Ref = useRef<FighterAI | null>(null);
  const soundRef = useRef<SoundManager | null>(null);
  const [soundMuted, setSoundMuted] = useState(false);
  // Character selection
  const [p1ModelId, setP1ModelId] = useState(MODEL_REGISTRY[0]?.id ?? '');
  const [p2ModelId, setP2ModelId] = useState(MODEL_REGISTRY[MODEL_REGISTRY.length > 1 ? 1 : 0]?.id ?? '');
  // Refs to pass selected models into the game loop
  const p1ModelRef = useRef<ModelEntry>(MODEL_REGISTRY[0]);
  const p2ModelRef = useRef<ModelEntry>(MODEL_REGISTRY[MODEL_REGISTRY.length > 1 ? 1 : 0]);
  // Used to signal a full match reset from UI into the game loop
  const resetMatchSignal = useRef(false);

  // UI display state
  const [p1Hp, setP1Hp] = useState(DEFAULT_FIGHTER_STATS.maxHp);
  const [p2Hp, setP2Hp] = useState(DEFAULT_FIGHTER_STATS.maxHp);
  const [p1DelayHp, setP1DelayHp] = useState(DEFAULT_FIGHTER_STATS.maxHp);
  const [p2DelayHp, setP2DelayHp] = useState(DEFAULT_FIGHTER_STATS.maxHp);
  const [p1Guard, setP1Guard] = useState(DEFAULT_FIGHTER_STATS.maxGuard);
  const [p2Guard, setP2Guard] = useState(DEFAULT_FIGHTER_STATS.maxGuard);
  const [p1GuardBroken, setP1GuardBroken] = useState(false);
  const [p2GuardBroken, setP2GuardBroken] = useState(false);
  const [timer, setTimer] = useState(STAGE_CONFIG.roundTime);
  const [phase, setPhase] = useState<string>('intro');
  const [roundNum, setRoundNum] = useState(1);
  const [p1Wins, setP1Wins] = useState(0);
  const [p2Wins, setP2Wins] = useState(0);
  const [p1Action, setP1Action] = useState('idle');
  const [p2Action, setP2Action] = useState('idle');
  const [matchWinner, setMatchWinner] = useState<string | null>(null);
  // Combo display
  const [p1ComboCount, setP1ComboCount] = useState(0);
  const [p1ComboDmg, setP1ComboDmg] = useState(0);
  const [p2ComboCount, setP2ComboCount] = useState(0);
  const [p2ComboDmg, setP2ComboDmg] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.08, 0.14, 1);

    // Camera - 3D free orbit
    const camera = new ArcRotateCamera('cam',
      Math.PI / 2, Math.PI / 3,
      STAGE_CONFIG.cameraDistance,
      new Vector3(0, STAGE_CONFIG.cameraHeight, 0),
      scene
    );
    camera.lowerRadiusLimit = 1.5;
    camera.upperRadiusLimit = 8;
    camera.lowerBetaLimit = 0.2;
    camera.upperBetaLimit = Math.PI / 2.05;
    camera.attachControl(canvas, true);

    // Lights
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.5;
    hemi.groundColor = new Color3(0.05, 0.05, 0.12);
    const dir = new DirectionalLight('dir', new Vector3(-1, -2, 1), scene);
    dir.intensity = 0.4;

    // Build decorated stage
    buildStage(scene);

    // Sound manager
    soundRef.current = new SoundManager();

    // Input
    const inputHandler = new InputHandler();

    // Game state
    const matchState = createInitialFightState(DEFAULT_FIGHTER_STATS.maxHp);
    const p1 = createFighter(P1_SPAWN.x, P1_SPAWN.z, Math.PI);
    const p2 = createFighter(P2_SPAWN.x, P2_SPAWN.z, 0);

    // Character roots
    const p1Root = new TransformNode('p1_root', scene);
    const p2Root = new TransformNode('p2_root', scene);

    // Loaded data
    let p1Nodes: Map<string, TransformNode> = new Map();
    let p2Nodes: Map<string, TransformNode> = new Map();
    let p1RestPos = new Map<string, Vector3>();
    let p2RestPos = new Map<string, Vector3>();
    let p1BodyHeight = 0;
    let p2BodyHeight = 0;
    let p1Motion: FighterMotionPlayer | null = null;
    let p2Motion: FighterMotionPlayer | null = null;
    // Combo tracking: p1Combo tracks P1's hits ON P2, p2Combo tracks P2's hits ON P1
    const p1Combo: ComboState = createComboState();
    const p2Combo: ComboState = createComboState();
    // Grapple state (shared between both fighters)
    const grapple: GrappleState = createGrappleState();
    let p1DelayHpVal = DEFAULT_FIGHTER_STATS.maxHp;
    let p2DelayHpVal = DEFAULT_FIGHTER_STATS.maxHp;

    // Helper: load a single character model
    async function loadCharacterModel(
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
      const charBuild = buildSkeletalCharacter(mergedVoxels, bones, scene, cx, cy, prefix);
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

    // Load assets
    (async () => {
      try {
        const p1Model = p1ModelRef.current;
        const p2Model = p2ModelRef.current;

        // Load both characters (possibly different models)
        const [p1Data, p2Data] = await Promise.all([
          loadCharacterModel(p1Model, 'p1', p1Root),
          loadCharacterModel(p2Model, 'p2', p2Root),
        ]);
        if (disposed) return;

        p1Nodes = p1Data.nodes;
        p2Nodes = p2Data.nodes;
        p1RestPos = p1Data.restPos;
        p2RestPos = p2Data.restPos;
        p1BodyHeight = p1Data.bodyHeight;
        p2BodyHeight = p2Data.bodyHeight;

        // Initial positions
        p1Root.position.x = P1_SPAWN.x;
        p1Root.position.z = P1_SPAWN.z;
        p2Root.position.x = P2_SPAWN.x;
        p2Root.position.z = P2_SPAWN.z;
        // P1 faces P2 (facingAngle=PI, model offset +PI/2)
        p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI + Math.PI / 2);
        // P2 faces P1 (facingAngle=0, model offset +PI/2)
        p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);

        matchState.phase = 'intro';
        matchState.phaseTimer = 0;

        // Initialize AIs (activated when CPU mode selected)
        aiRef.current = new FighterAI('normal');
        ai1Ref.current = new FighterAI('normal');

        // Create motion players
        p1Motion = new FighterMotionPlayer(p1Nodes, p1RestPos, p1BodyHeight);
        p2Motion = new FighterMotionPlayer(p2Nodes, p2RestPos, p2BodyHeight);

        setLoading(false);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();

    // ====================================================================
    // GAME LOOP
    // ====================================================================
    let lastTime = performance.now();
    let uiUpdateCounter = 0;

    const gameLoop = () => {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Hitstop
      if (matchState.hitstopTimer > 0) {
        matchState.hitstopTimer--;
        return;
      }

      // Wait for mode selection
      if (gameModeRef.current === 'menu') return;

      // Check for match reset signal (CONTINUE button)
      if (resetMatchSignal.current) {
        resetMatchSignal.current = false;
        matchState.phase = 'intro';
        matchState.phaseTimer = 0;
        matchState.roundNumber = 1;
        matchState.p1Wins = 0;
        matchState.p2Wins = 0;
        matchState.p1Hp = matchState.maxHp;
        matchState.p2Hp = matchState.maxHp;
        matchState.timer = STAGE_CONFIG.roundTime;
        matchState.winner = null;
        matchState.matchWinner = null;
        matchState.hitstopTimer = 0;
        p1.x = P1_SPAWN.x; p1.y = 0; p1.z = P1_SPAWN.z; p1.vy = 0;
        p1.facingAngle = Math.PI;
        p1.action = 'idle'; p1.stunTimer = 0; p1.currentAttack = null;
        p1.guard = p1.stats.maxGuard; p1.guardBroken = false;
        p1.currentMotion = null; p1.grappleMotionKey = null; p1.knockdownVariant = 'knockdown';
        p2.x = P2_SPAWN.x; p2.y = 0; p2.z = P2_SPAWN.z; p2.vy = 0;
        p2.facingAngle = 0;
        p2.action = 'idle'; p2.stunTimer = 0; p2.currentAttack = null;
        p2.guard = p2.stats.maxGuard; p2.guardBroken = false;
        p2.currentMotion = null; p2.grappleMotionKey = null; p2.knockdownVariant = 'knockdown';
        p1Root.position.set(P1_SPAWN.x, 0, P1_SPAWN.z);
        p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI + Math.PI / 2);
        p2Root.position.set(P2_SPAWN.x, 0, P2_SPAWN.z);
        p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
        p1DelayHpVal = p1.stats.maxHp;
        p2DelayHpVal = p2.stats.maxHp;
        resetCombo(p1Combo);
        resetCombo(p2Combo);
        grapple.active = null; grapple.phase = 'none'; grapple.phaseTimer = 0;
        grapple.escapeProgress = 0; grapple.mountTimer = 0; grapple.mountHits = 0;
        return;
      }

      matchState.phaseTimer += dt;

      if (matchState.phase === 'intro') {
        if (matchState.phaseTimer >= 1.5 && matchState.phaseTimer < 1.5 + dt * 2) {
          soundRef.current?.play('round_start');
        }
        if (matchState.phaseTimer >= 2.0) {
          matchState.phase = 'fight';
          matchState.phaseTimer = 0;
          soundRef.current?.play('fight');
        }
        return;
      }

      if (matchState.phase === 'ko') {
        // On first frame of KO: play sound + force loser into knockdown + clear grapple
        if (matchState.phaseTimer < dt * 2) {
          soundRef.current?.play('ko');
          // Clear any active grapple immediately
          grapple.active = null; grapple.phase = 'none'; grapple.phaseTimer = 0;
          grapple.escapeProgress = 0; grapple.mountTimer = 0; grapple.mountHits = 0;
          p1.grappleMotionKey = null;
          p2.grappleMotionKey = null;
          // Set loser to knockdown action (randomly pick fall direction)
          if (matchState.winner === 'p1' || matchState.winner === 'draw') {
            p2.action = 'knockdown';
            p2.knockdownVariant = Math.random() < 0.5 ? 'knockdown' : 'knockdown_fwd';
            p2.stunTimer = 0;
            p2.currentAttack = null;
            p2.currentMotion = null;
          }
          if (matchState.winner === 'p2' || matchState.winner === 'draw') {
            p1.action = 'knockdown';
            p1.knockdownVariant = Math.random() < 0.5 ? 'knockdown' : 'knockdown_fwd';
            p1.stunTimer = 0;
            p1.currentAttack = null;
            p1.currentMotion = null;
          }
        }

        // Run motions: slowmo for first 0.8s, then normal speed until knockdown finishes
        const koDt = matchState.phaseTimer < 0.8 ? dt * 0.3 : dt;
        if (p1Motion) p1Motion.update(p1, koDt);
        if (p2Motion) p2Motion.update(p2, koDt);

        if (matchState.phaseTimer >= 5.5) {
          if (matchState.matchWinner) {
            matchState.phase = 'result';
            matchState.phaseTimer = 0;
          } else {
            startNewRound(matchState);
            p1.x = P1_SPAWN.x; p1.y = 0; p1.z = P1_SPAWN.z; p1.vy = 0;
            p1.facingAngle = Math.PI;
            p1.action = 'idle'; p1.stunTimer = 0; p1.currentAttack = null;
            p1.guard = p1.stats.maxGuard; p1.guardBroken = false;
            p1.currentMotion = null; p1.grappleMotionKey = null; p1.knockdownVariant = 'knockdown';
            p2.x = P2_SPAWN.x; p2.y = 0; p2.z = P2_SPAWN.z; p2.vy = 0;
            p2.facingAngle = 0;
            p2.action = 'idle'; p2.stunTimer = 0; p2.currentAttack = null;
            p2.guard = p2.stats.maxGuard; p2.guardBroken = false;
            p2.currentMotion = null; p2.grappleMotionKey = null; p2.knockdownVariant = 'knockdown';
            p1Root.position.set(P1_SPAWN.x, 0, P1_SPAWN.z);
            p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI + Math.PI / 2);
            p2Root.position.set(P2_SPAWN.x, 0, P2_SPAWN.z);
            p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
            p1DelayHpVal = p1.stats.maxHp;
            p2DelayHpVal = p2.stats.maxHp;
            resetCombo(p1Combo);
            resetCombo(p2Combo);
            grapple.active = null; grapple.phase = 'none'; grapple.phaseTimer = 0;
            grapple.escapeProgress = 0; grapple.mountTimer = 0; grapple.mountHits = 0;
          }
        }
        return;
      }

      if (matchState.phase !== 'fight') return;

      // Timer
      matchState.timer -= dt;
      if (matchState.timer < 0) matchState.timer = 0;

      // Input
      const mode = gameModeRef.current;
      const p1Input = mode === 'cpuvcpu' && ai1Ref.current
        ? ai1Ref.current.update(p1, p2, dt)
        : inputHandler.getP1Input();
      const p2Input = (mode === 'cpu' || mode === 'cpuvcpu') && aiRef.current
        ? aiRef.current.update(p2, p1, dt)
        : inputHandler.getP2Input();

      // === GRAPPLE SYSTEM ===
      if (isGrappleActive(grapple)) {
        // During grapple, skip normal fighter updates — grapple controls both
        const isP1Attacker = grapple.attackerIndex === 1;
        const atkr = isP1Attacker ? p1 : p2;
        const defr = isP1Attacker ? p2 : p1;
        const defInput = isP1Attacker ? p2Input : p1Input;
        const atkInput = isP1Attacker ? p1Input : p2Input;

        const gResult = updateGrapple(
          grapple, atkr, defr,
          defInput.mash,     // defender escape mashing
          atkInput.attack !== null, // attacker punch (for mount)
          dt,
        );

        if (gResult.damage > 0) {
          if (isP1Attacker) {
            matchState.p2Hp = Math.max(0, matchState.p2Hp - gResult.damage);
          } else {
            matchState.p1Hp = Math.max(0, matchState.p1Hp - gResult.damage);
          }
          triggerScreenShake(0.02, 0.1);
          soundRef.current?.play(gResult.mountPunchLanded ? 'hit_light' : 'hit_heavy');
        }

        // Update root positions during grapple
        p1Root.position.x = p1.x;
        p1Root.position.y = p1.y;
        p1Root.position.z = p1.z;
        p2Root.position.x = p2.x;
        p2Root.position.y = p2.y;
        p2Root.position.z = p2.z;
        p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), p1.facingAngle + Math.PI / 2);
        p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), p2.facingAngle + Math.PI / 2);

        if (p1Motion) p1Motion.update(p1, dt);
        if (p2Motion) p2Motion.update(p2, dt);

        // Camera track
        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.z + p2.z) / 2;
        camera.target.x = midX;
        camera.target.z = midZ;
        camera.target.y = STAGE_CONFIG.cameraHeight;

        updateScreenShake(camera, dt);
        updateDamageNumbers(dt);
        inputHandler.consumeFrame();

        // Check round end
        checkRoundEnd(matchState);

        // UI update
        uiUpdateCounter++;
        if (uiUpdateCounter % 6 === 0) {
          setP1Hp(matchState.p1Hp);
          setP2Hp(matchState.p2Hp);
          setP1DelayHp(p1DelayHpVal);
          setP2DelayHp(p2DelayHpVal);
          setP1Guard(p1.guard);
          setP2Guard(p2.guard);
          setP1GuardBroken(p1.guardBroken);
          setP2GuardBroken(p2.guardBroken);
          setTimer(matchState.timer);
          setPhase(matchState.phase);
          setRoundNum(matchState.roundNumber);
          setP1Wins(matchState.p1Wins);
          setP2Wins(matchState.p2Wins);
          setP1Action(p1.action + (p1.grappleMotionKey ? `:${p1.grappleMotionKey}` : ''));
          setP2Action(p2.action + (p2.grappleMotionKey ? `:${p2.grappleMotionKey}` : ''));
          setMatchWinner(matchState.matchWinner);
        }
        return;
      }

      // Check grapple initiation (P1)
      if (p1Input.grapple && canInitiateGrapple(p1, p2, grapple)) {
        startGrapple(p1Input.grapple, grapple, 1, p1, p2);
      }
      // Check grapple initiation (P2)
      if (p2Input.grapple && canInitiateGrapple(p2, p1, grapple)) {
        startGrapple(p2Input.grapple, grapple, 2, p2, p1);
      }

      // Update fighters (3D: pass opponent XZ)
      updateFighter(p1, p1Input, p2.x, p2.z, dt);
      updateFighter(p2, p2Input, p1.x, p1.z, dt);

      // Hit detection P1 → P2
      if (p1.action === 'attack' && p1.attackPhase === 'active' && !p1.attackHasHit && p1.currentAttack) {
        const result = checkHit(p1.currentAttack, p1Nodes, p2Nodes);
        if (result.hit) {
          const wasBlocked = p2.action === 'block';
          const fullDamage = p1.currentAttack.damage * result.damageMultiplier;
          let actualDamage = wasBlocked
            ? fullDamage * p2.stats.blockDamageRatio
            : fullDamage;

          // Combo scaling (only on real hits, not blocked)
          if (!wasBlocked) {
            actualDamage = registerComboHit(p1Combo, actualDamage);
          }

          applyHit(p2, p1.currentAttack, p1.x, p1.z);
          matchState.p2Hp = Math.max(0, matchState.p2Hp - actualDamage);
          matchState.hitstopTimer = STAGE_CONFIG.hitstopFrames;
          p1.attackHasHit = true;

          // Effects
          createHitParticles(scene, result.hitPoint, wasBlocked);
          spawnDamageNumber(scene, result.hitPoint, actualDamage, wasBlocked);
          triggerScreenShake(wasBlocked ? 0.01 : 0.025, wasBlocked ? 0.08 : 0.15);
          // Sound
          if (wasBlocked) {
            soundRef.current?.play(p2.guardBroken ? 'guard_break' : 'block');
          } else {
            soundRef.current?.play(actualDamage > 12 ? 'hit_heavy' : 'hit_light');
          }
        }
      }

      // Hit detection P2 → P1
      if (p2.action === 'attack' && p2.attackPhase === 'active' && !p2.attackHasHit && p2.currentAttack) {
        const result = checkHit(p2.currentAttack, p2Nodes, p1Nodes);
        if (result.hit) {
          const wasBlocked = p1.action === 'block';
          const fullDamage = p2.currentAttack.damage * result.damageMultiplier;
          let actualDamage = wasBlocked
            ? fullDamage * p1.stats.blockDamageRatio
            : fullDamage;

          if (!wasBlocked) {
            actualDamage = registerComboHit(p2Combo, actualDamage);
          }

          applyHit(p1, p2.currentAttack, p2.x, p2.z);
          matchState.p1Hp = Math.max(0, matchState.p1Hp - actualDamage);
          matchState.hitstopTimer = STAGE_CONFIG.hitstopFrames;
          p2.attackHasHit = true;

          // Effects
          createHitParticles(scene, result.hitPoint, wasBlocked);
          spawnDamageNumber(scene, result.hitPoint, actualDamage, wasBlocked);
          triggerScreenShake(wasBlocked ? 0.01 : 0.025, wasBlocked ? 0.08 : 0.15);
          // Sound
          if (wasBlocked) {
            soundRef.current?.play(p1.guardBroken ? 'guard_break' : 'block');
          } else {
            soundRef.current?.play(actualDamage > 12 ? 'hit_heavy' : 'hit_light');
          }
        }
      }

      // Update combos
      updateCombo(p1Combo, dt);
      updateCombo(p2Combo, dt);

      checkRoundEnd(matchState);

      // Update root positions and facing
      p1Root.position.x = p1.x;
      p1Root.position.y = p1.y;
      p1Root.position.z = p1.z;
      p2Root.position.x = p2.x;
      p2Root.position.y = p2.y;
      p2Root.position.z = p2.z;

      // Facing: rotate root around Y axis so character faces the opponent
      // facingAngle is in world XZ plane. Character model faces +X by default in viewer space,
      // Voxel model faces -Z (viewer_z = -(vy-cy)*S), which is angle -PI/2 from +X.
      // To rotate model to face facingAngle: rotation = facingAngle - (-PI/2) = facingAngle + PI/2
      p1Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), p1.facingAngle + Math.PI / 2);
      p2Root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), p2.facingAngle + Math.PI / 2);

      // Apply motion via FighterMotionPlayer
      if (p1Motion) p1Motion.update(p1, dt);
      if (p2Motion) p2Motion.update(p2, dt);

      // Camera: track midpoint of both fighters
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      camera.target.x = midX;
      camera.target.z = midZ;
      camera.target.y = STAGE_CONFIG.cameraHeight;

      // Update effects
      updateScreenShake(camera, dt);
      updateDamageNumbers(dt);

      inputHandler.consumeFrame();

      // Delayed HP drain (white bar catches up slowly)
      const drainSpeed = 30; // HP per second
      if (p1DelayHpVal > matchState.p1Hp) {
        p1DelayHpVal = Math.max(matchState.p1Hp, p1DelayHpVal - drainSpeed * dt);
      }
      if (p2DelayHpVal > matchState.p2Hp) {
        p2DelayHpVal = Math.max(matchState.p2Hp, p2DelayHpVal - drainSpeed * dt);
      }

      // UI (throttled)
      uiUpdateCounter++;
      if (uiUpdateCounter % 6 === 0) {
        setP1Hp(matchState.p1Hp);
        setP2Hp(matchState.p2Hp);
        setP1DelayHp(p1DelayHpVal);
        setP2DelayHp(p2DelayHpVal);
        setP1Guard(p1.guard);
        setP2Guard(p2.guard);
        setP1GuardBroken(p1.guardBroken);
        setP2GuardBroken(p2.guardBroken);
        setTimer(matchState.timer);
        setPhase(matchState.phase);
        setRoundNum(matchState.roundNumber);
        setP1Wins(matchState.p1Wins);
        setP2Wins(matchState.p2Wins);
        setP1Action(p1.action + (p1.currentAttack ? `:${p1.currentAttack.name}` : ''));
        setP2Action(p2.action + (p2.currentAttack ? `:${p2.currentAttack.name}` : ''));
        setMatchWinner(matchState.matchWinner);
        // Combo display
        setP1ComboCount(p1Combo.hitCount);
        setP1ComboDmg(Math.round(p1Combo.totalDamage));
        setP2ComboCount(p2Combo.hitCount);
        setP2ComboDmg(Math.round(p2Combo.totalDamage));
      }
    };

    scene.registerBeforeRender(gameLoop);
    engine.runRenderLoop(() => scene.render());

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      disposeAllEffects();
      soundRef.current?.dispose();
      window.removeEventListener('resize', onResize);
      inputHandler.dispose();
      engine.dispose();
    };
  }, []);

  const startGame = (mode: 'pvp' | 'cpu' | 'cpuvcpu', p2diff?: AIDifficulty, p1diff?: AIDifficulty) => {
    // Update model refs for character loading
    p1ModelRef.current = MODEL_REGISTRY.find(m => m.id === p1ModelId) ?? MODEL_REGISTRY[0];
    p2ModelRef.current = MODEL_REGISTRY.find(m => m.id === p2ModelId) ?? MODEL_REGISTRY[MODEL_REGISTRY.length > 1 ? 1 : 0];
    gameModeRef.current = mode;
    setGameMode(mode);
    if (aiRef.current) aiRef.current.setDifficulty(p2diff ?? 'normal');
    if (ai1Ref.current) ai1Ref.current.setDifficulty(p1diff ?? 'normal');
    setAiDifficulty(p2diff ?? 'normal');
    setAi2Difficulty(p1diff ?? 'normal');
  };

  const maxHp = DEFAULT_FIGHTER_STATS.maxHp;
  const maxGuard = DEFAULT_FIGHTER_STATS.maxGuard;
  const p1HpPct = Math.max(0, (p1Hp / maxHp) * 100);
  const p2HpPct = Math.max(0, (p2Hp / maxHp) * 100);
  const p1DelayPct = Math.max(0, (p1DelayHp / maxHp) * 100);
  const p2DelayPct = Math.max(0, (p2DelayHp / maxHp) * 100);
  const p1GuardPct = Math.max(0, (p1Guard / maxGuard) * 100);
  const p2GuardPct = Math.max(0, (p2Guard / maxGuard) * 100);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a18', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />

      {/* Mode selection menu */}
      {gameMode === 'menu' && !loading && !error && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)',
        }}>
          <div style={{
            fontSize: 48, fontWeight: 'bold', color: '#fff',
            textShadow: '0 0 30px #44f', marginBottom: 40,
            fontFamily: 'monospace', letterSpacing: 8,
          }}>
            VOXEL FIGHT
          </div>

          {/* Character selection */}
          {MODEL_REGISTRY.length > 1 && (
            <div style={{ display: 'flex', gap: 40, marginBottom: 30, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#4af', marginBottom: 6 }}>P1</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {MODEL_REGISTRY.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setP1ModelId(m.id)}
                      style={{
                        padding: '8px 16px', fontSize: 13,
                        background: p1ModelId === m.id ? '#246' : '#1a1a2a',
                        color: p1ModelId === m.id ? '#8cf' : '#666',
                        border: p1ModelId === m.id ? '2px solid #48f' : '1px solid #333',
                        borderRadius: 4, cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 20, color: '#555' }}>VS</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#f84', marginBottom: 6 }}>P2</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {MODEL_REGISTRY.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setP2ModelId(m.id)}
                      style={{
                        padding: '8px 16px', fontSize: 13,
                        background: p2ModelId === m.id ? '#432' : '#1a1a2a',
                        color: p2ModelId === m.id ? '#fc8' : '#666',
                        border: p2ModelId === m.id ? '2px solid #f84' : '1px solid #333',
                        borderRadius: 4, cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, marginBottom: 30, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => startGame('cpuvcpu', 'normal', 'normal')}
              style={{
                padding: '16px 36px', fontSize: 20, fontWeight: 'bold',
                background: '#342', color: '#cf8', border: '2px solid #4f4',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              CPU vs CPU
            </button>
            <button
              onClick={() => startGame('cpu', 'normal')}
              style={{
                padding: '16px 36px', fontSize: 20, fontWeight: 'bold',
                background: '#432', color: '#fc8', border: '2px solid #f84',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              VS CPU
            </button>
            <button
              onClick={() => startGame('pvp')}
              style={{
                padding: '16px 36px', fontSize: 20, fontWeight: 'bold',
                background: '#234', color: '#8cf', border: '2px solid #48f',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              VS PLAYER
            </button>
          </div>
          {/* CPU difficulty */}
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>CPU Difficulty</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {(['easy', 'normal', 'hard'] as AIDifficulty[]).map(d => (
              <button
                key={d}
                onClick={() => startGame('cpuvcpu', d, d)}
                style={{
                  padding: '8px 20px', fontSize: 14,
                  background: d === 'normal' ? '#553' : '#222',
                  color: '#ccc', border: '1px solid #555',
                  borderRadius: 4, cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 15 }}>
            Difficulty buttons start CPU vs CPU
          </div>
        </div>
      )}

      {/* HUD overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', width: '90%', maxWidth: 800,
          padding: '10px 0', gap: 12,
        }}>
          {/* P1 HP + Guard */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 12, color: '#4af', fontWeight: 'bold' }}>
              {gameMode === 'cpuvcpu' ? `CPU1 (${ai2Difficulty})` : 'P1 (JKLU)'} {p1Wins > 0 && Array(p1Wins).fill(null).map((_, i) => <span key={i} style={{ color: '#ff4' }}>&#9733;</span>)}
            </div>
            {/* HP bar with delayed white bar */}
            <div style={{
              height: 20, background: '#222', borderRadius: 4, overflow: 'hidden',
              border: '1px solid #444', position: 'relative',
            }}>
              {/* Delayed (white) bar behind */}
              <div style={{
                position: 'absolute', left: 0, top: 0,
                width: `${p1DelayPct}%`, height: '100%',
                background: 'rgba(255,255,255,0.3)',
              }} />
              {/* Actual HP bar */}
              <div style={{
                position: 'relative',
                width: `${p1HpPct}%`, height: '100%',
                background: p1HpPct > 30 ? '#4a4' : '#a44',
                transition: 'width 0.05s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>{Math.ceil(p1Hp)} / {maxHp}</div>
            {/* Guard bar */}
            <div style={{
              height: 6, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden',
              border: p1GuardBroken ? '1px solid #f44' : '1px solid #333',
            }}>
              <div style={{
                width: `${p1GuardPct}%`, height: '100%',
                background: p1GuardBroken ? '#a33' : p1GuardPct > 30 ? '#48c' : '#c84',
                transition: 'width 0.15s',
              }} />
            </div>
            {p1GuardBroken && <div style={{ fontSize: 9, color: '#f44' }}>GUARD BREAK!</div>}
          </div>

          {/* Timer + Round */}
          <div style={{ textAlign: 'center', minWidth: 80 }}>
            <div style={{
              fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace',
              color: timer <= 10 ? '#f44' : '#fff',
            }}>
              {Math.ceil(timer)}
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>Round {roundNum}</div>
          </div>

          {/* P2 HP + Guard */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 12, color: '#f84', fontWeight: 'bold', textAlign: 'right' }}>
              {p2Wins > 0 && Array(p2Wins).fill(null).map((_, i) => <span key={i} style={{ color: '#ff4' }}>&#9733;</span>)} {gameMode === 'pvp' ? 'P2 (1234)' : gameMode === 'cpuvcpu' ? `CPU2 (${aiDifficulty})` : `CPU (${aiDifficulty})`}
            </div>
            {/* HP bar with delayed white bar */}
            <div style={{
              height: 20, background: '#222', borderRadius: 4, overflow: 'hidden',
              border: '1px solid #444', position: 'relative', direction: 'rtl',
            }}>
              <div style={{
                position: 'absolute', right: 0, top: 0,
                width: `${p2DelayPct}%`, height: '100%',
                background: 'rgba(255,255,255,0.3)',
              }} />
              <div style={{
                position: 'relative',
                width: `${p2HpPct}%`, height: '100%',
                background: p2HpPct > 30 ? '#4a4' : '#a44',
                transition: 'width 0.05s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#888', textAlign: 'right' }}>{Math.ceil(p2Hp)} / {maxHp}</div>
            {/* Guard bar */}
            <div style={{
              height: 6, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden',
              border: p2GuardBroken ? '1px solid #f44' : '1px solid #333', direction: 'rtl',
            }}>
              <div style={{
                width: `${p2GuardPct}%`, height: '100%',
                background: p2GuardBroken ? '#a33' : p2GuardPct > 30 ? '#48c' : '#c84',
                transition: 'width 0.15s',
              }} />
            </div>
            {p2GuardBroken && <div style={{ fontSize: 9, color: '#f44', textAlign: 'right' }}>GUARD BREAK!</div>}
          </div>
        </div>

        {/* Phase announcements */}
        {phase === 'intro' && (
          <div style={{
            fontSize: 48, fontWeight: 'bold', color: '#fff',
            textShadow: '0 0 20px #44f', marginTop: 100,
            animation: 'none',
          }}>
            Round {roundNum}
          </div>
        )}
        {phase === 'fight' && timer >= STAGE_CONFIG.roundTime - 0.8 && (
          <div style={{
            fontSize: 56, fontWeight: 'bold', color: '#ff4',
            textShadow: '0 0 30px #fa0', marginTop: 100,
          }}>
            FIGHT!
          </div>
        )}
        {phase === 'ko' && (
          <div style={{
            fontSize: 60, fontWeight: 'bold', color: '#f44',
            textShadow: '0 0 30px #f00', marginTop: 100,
          }}>
            K.O.!
          </div>
        )}
        {phase === 'result' && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            marginTop: 80,
          }}>
            <div style={{
              fontSize: 48, fontWeight: 'bold', color: '#ff4',
              textShadow: '0 0 20px #ff0',
            }}>
              {matchWinner === 'p1'
                ? (gameMode === 'cpuvcpu' ? 'CPU1' : 'P1')
                : (gameMode === 'pvp' ? 'P2' : 'CPU')} WINS!
            </div>
            <div style={{
              fontSize: 16, color: '#aaa', marginTop: 8,
            }}>
              {p1Wins} - {p2Wins}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 30 }}>
              <button
                onClick={() => {
                  resetMatchSignal.current = true;
                  setMatchWinner(null);
                }}
                style={{
                  padding: '12px 40px',
                  fontSize: 18, fontWeight: 'bold',
                  background: '#335', color: '#aaf', border: '2px solid #44f',
                  borderRadius: 8, cursor: 'pointer', pointerEvents: 'auto',
                }}
              >
                CONTINUE
              </button>
              <button
                onClick={() => {
                  gameModeRef.current = 'menu';
                  setGameMode('menu');
                  setMatchWinner(null);
                  setPhase('intro');
                }}
                style={{
                  padding: '12px 40px',
                  fontSize: 18, fontWeight: 'bold',
                  background: '#433', color: '#faa', border: '2px solid #f44',
                  borderRadius: 8, cursor: 'pointer', pointerEvents: 'auto',
                }}
              >
                END
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Combo counters */}
      {p1ComboCount >= 2 && (
        <div style={{
          position: 'absolute', left: 30, top: '35%',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 36, fontWeight: 'bold', color: '#ff4',
            textShadow: '0 0 15px #fa0',
            fontFamily: 'monospace',
          }}>
            {p1ComboCount} HIT
          </div>
          <div style={{ fontSize: 14, color: '#fca', fontFamily: 'monospace' }}>
            {p1ComboDmg} DMG
          </div>
        </div>
      )}
      {p2ComboCount >= 2 && (
        <div style={{
          position: 'absolute', right: 30, top: '35%',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 36, fontWeight: 'bold', color: '#ff4',
            textShadow: '0 0 15px #fa0',
            fontFamily: 'monospace',
          }}>
            {p2ComboCount} HIT
          </div>
          <div style={{ fontSize: 14, color: '#fca', fontFamily: 'monospace' }}>
            {p2ComboDmg} DMG
          </div>
        </div>
      )}

      {/* Debug */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10,
        fontSize: 10, color: '#555', fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 4,
      }}>
        <div>P1: {p1Action}</div>
        <div>P2: {p2Action}</div>
      </div>

      <Link href="/" style={{
        position: 'absolute', top: 10, left: 10, fontSize: 12,
        color: '#666', textDecoration: 'none', pointerEvents: 'auto',
      }}>
        ← Top
      </Link>

      {/* Sound mute toggle */}
      <button
        onClick={() => {
          const next = !soundMuted;
          setSoundMuted(next);
          soundRef.current?.setMuted(next);
        }}
        style={{
          position: 'absolute', top: 10, left: 60, fontSize: 12,
          color: soundMuted ? '#a44' : '#4a4', background: 'rgba(0,0,0,0.5)',
          border: '1px solid #333', borderRadius: 4, padding: '2px 8px',
          cursor: 'pointer',
        }}
      >
        {soundMuted ? 'SFX OFF' : 'SFX ON'}
      </button>

      {/* Controls */}
      <div style={{
        position: 'absolute', bottom: 10, right: 10,
        fontSize: 10, color: '#444', fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 4,
        textAlign: 'right',
      }}>
        {gameMode !== 'cpuvcpu' && <div>P1: WASD=move Space=jump F=block J=R.punch K=R.kick L=L.punch U=L.kick G=takedown H=throw</div>}
        {gameMode === 'pvp' && <div>P2: Arrows=move 0=jump 6=block 1=R.punch 2=R.kick 3=L.punch 4=L.kick 5=takedown 7=throw</div>}
        {gameMode !== 'cpuvcpu' && <div style={{ color: '#666', marginTop: 2 }}>W/Up+attack=upper S/Down+attack=lower neutral=mid</div>}
        {gameMode === 'cpuvcpu' && <div>CPU vs CPU - Watch mode</div>}
        <div style={{ color: '#666', marginTop: 2 }}>Mouse drag=rotate camera, Wheel=zoom</div>
      </div>

      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 18, color: '#88f',
        }}>
          Loading...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 14, color: '#f88',
        }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}
