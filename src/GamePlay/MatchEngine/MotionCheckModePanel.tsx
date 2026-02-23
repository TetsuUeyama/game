'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MeshBuilder, StandardMaterial, Color3, Vector3, Quaternion, Matrix, TransformNode, Mesh, Bone } from '@babylonjs/core';
import { GameScene } from '@/GamePlay/MatchEngine/GameScene';
import { PlayerDataLoader } from '@/GamePlay/Data/PlayerDataLoader';
import { PlayerData } from '@/GamePlay/Data/Types/PlayerData';
import { Character } from '@/GamePlay/Object/Entities/Character';
import { MotionCheckPanel } from '@/GamePlay/MatchEngine/MotionCheckPanel';
import { CatchPoseCheckPanel } from '@/GamePlay/MatchEngine/CatchPoseCheckPanel';
import { GAME_MOTIONS } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/GameMotionCatalog';
import { MotionDefinition } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes';
import { MotionPlayer, SingleMotionPoseData } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionPlayer';
import { createSingleMotionPoseData } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory';
import { loadGLBAnimation } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/GLBAnimationLoader';
import { GameMotionEntry } from '@/GamePlay/GameSystem/CharacterMove/MotionEngine/GameMotionCatalog';
import { clampJointDegrees } from '@/GamePlay/GameSystem/CharacterMove/Config/JointLimitsConfig';

interface MotionCheckModePanelProps {
  gameScene: GameScene | null;
  onClose: () => void;
}

type Phase = 'setup' | 'playing';
type SubMode = 'motion' | 'catch_pose';

/**
 * GAME_MOTIONS のエントリ名（"game:idle"）と
 * motionDataToDefinition が返す MotionDefinition.name（"idle"）が異なる場合があるため、
 * MotionCheckPanel の select value が一致するようエントリ名で統一する。
 */
const BASE_MOTIONS: GameMotionEntry[] = GAME_MOTIONS.map(entry => ({
  name: entry.name,
  motion: entry.motion.name === entry.name
    ? entry.motion
    : { ...entry.motion, name: entry.name },
}));

/**
 * モーションチェックモードパネル
 * MotionCheckPanel（テストシーン用）を試合環境で再利用し、
 * 37+モーション・12関節リスト・キーフレーム編集・コードエクスポートを提供する。
 */
export function MotionCheckModePanel({ gameScene, onClose }: MotionCheckModePanelProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [loading, setLoading] = useState(true);

  // 選手データ
  const [players, setPlayers] = useState<Record<string, PlayerData>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');

  // MotionCheckPanel 用 state
  const [availableMotions, setAvailableMotions] = useState<GameMotionEntry[]>(BASE_MOTIONS);
  const [currentMotion, setCurrentMotion] = useState<MotionDefinition>(
    BASE_MOTIONS[0].motion
  );
  const [motionPlaying, setMotionPlaying] = useState(false);
  const [glbLoading, setGlbLoading] = useState(false);

  // sub-mode (tab)
  const [subMode, setSubMode] = useState<SubMode>('motion');

  // catch pose parameters
  const [ballHeight, setBallHeight] = useState(1.2);
  const [ballHorizontal, setBallHorizontal] = useState(0);
  const [ballForward, setBallForward] = useState(0.5);
  const [spinePitch, setSpinePitch] = useState(0);
  const [spineRoll, setSpineRoll] = useState(0);
  const [armSlerpAmount, setArmSlerpAmount] = useState(0.8);
  const [catchArmSide, setCatchArmSide] = useState<'left' | 'right'>('right');
  const [autoMode, setAutoMode] = useState(true);
  const [kneeBend, setKneeBend] = useState(0);

  // catch params ref (avoid re-creating RAF effect on every slider change)
  const catchParamsRef = useRef({
    ballHeight, ballHorizontal, ballForward,
    spinePitch, spineRoll, kneeBend, armSlerpAmount, catchArmSide, autoMode,
  });
  catchParamsRef.current = {
    ballHeight, ballHorizontal, ballForward,
    spinePitch, spineRoll, kneeBend, armSlerpAmount, catchArmSide, autoMode,
  };

  // refs
  const characterRef = useRef<Character | null>(null);
  const motionPlayerRef = useRef<MotionPlayer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const ballMeshRef = useRef<Mesh | null>(null);
  const ikTargetRef = useRef<TransformNode | null>(null);
  const catchAnimFrameRef = useRef<number | null>(null);

  // 選手データを読み込む
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const playerData = await PlayerDataLoader.loadPlayerData();
        setPlayers(playerData);
        const playerIds = Object.keys(playerData);
        if (playerIds.length > 0) {
          setSelectedPlayerId(playerIds[0]);
        }
      } catch (error) {
        console.error('Failed to load player data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPlayers();
  }, []);

  // アニメーションループの停止
  const stopAnimLoop = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  /** MotionDefinition → SingleMotionPoseData を生成 */
  const buildPoseData = useCallback((motion: MotionDefinition): SingleMotionPoseData | null => {
    const character = characterRef.current;
    if (!character) return null;
    const adapter = character.getSkeletonAdapter();
    if (!adapter) return null;
    return createSingleMotionPoseData(adapter.skeleton, motion, adapter.getRestPoseCache(), adapter.isXMirrored);
  }, []);

  /** MotionPlayer を作成 or ホットスワップ */
  const applyMotionToPlayer = useCallback((motion: MotionDefinition) => {
    const poseData = buildPoseData(motion);
    if (!poseData) return;

    if (motionPlayerRef.current) {
      motionPlayerRef.current.setData(poseData);
      motionPlayerRef.current.reset();
    } else {
      motionPlayerRef.current = new MotionPlayer(poseData);
      motionPlayerRef.current.setLoop(true);
    }
    // 最初のフレームを描画
    motionPlayerRef.current.seekTo(0);
  }, [buildPoseData]);

  // ── ball mesh helpers ──
  const createBallMesh = useCallback(() => {
    if (ballMeshRef.current || !gameScene) return;
    const scene = gameScene.getScene();
    const sphere = MeshBuilder.CreateSphere('catchCheckBall', { diameter: 0.24 }, scene);
    const mat = new StandardMaterial('catchCheckBallMat', scene);
    mat.emissiveColor = new Color3(1, 0.55, 0.1);
    mat.disableLighting = true;
    sphere.material = mat;
    ballMeshRef.current = sphere;

    // IK target node (same position as ball)
    const target = new TransformNode('catchCheckIKTarget', scene);
    ikTargetRef.current = target;
  }, [gameScene]);

  const disposeBallMesh = useCallback(() => {
    if (ballMeshRef.current) {
      ballMeshRef.current.dispose();
      ballMeshRef.current = null;
    }
    if (ikTargetRef.current) {
      ikTargetRef.current.dispose();
      ikTargetRef.current = null;
    }
  }, []);

  const stopCatchLoop = useCallback(() => {
    if (catchAnimFrameRef.current !== null) {
      cancelAnimationFrame(catchAnimFrameRef.current);
      catchAnimFrameRef.current = null;
    }
  }, []);

  // 開始ボタン
  const handleStart = useCallback(async () => {
    if (!gameScene || !selectedPlayerId) return;

    const character = gameScene.setupMotionCheckMode(selectedPlayerId, players);
    if (!character) return;

    // GameScene を一時停止して Character.update() がボーンを上書きしないようにする
    gameScene.pause();

    characterRef.current = character;

    // IK初期化（冪等 — 2回目以降は何もしない）
    character.initializeIK();

    // デフォルトのモーション（カタログ先頭）をセット
    const initialMotion = availableMotions[0].motion;
    setCurrentMotion(initialMotion);

    // MotionPlayer を作成し、即座に再生開始
    const adapter = character.getSkeletonAdapter();
    const poseData = adapter ? createSingleMotionPoseData(adapter.skeleton, initialMotion, adapter.getRestPoseCache(), adapter.isXMirrored) : null;
    if (poseData) {
      motionPlayerRef.current = new MotionPlayer(poseData);
      motionPlayerRef.current.setLoop(true);
    }

    lastTimeRef.current = performance.now();
    setMotionPlaying(true);
    setPhase('playing');

    // public/dribble.glb を自動読み込み＆即再生
    try {
      const glbMotion = await loadGLBAnimation('/dribble.glb', gameScene.getScene(), 'glb:dribble');
      if (glbMotion) {
        const entry: GameMotionEntry = { name: 'glb:dribble', motion: glbMotion };
        setAvailableMotions(prev => {
          if (prev.some(m => m.name === 'glb:dribble')) return prev;
          return [...prev, entry];
        });
        // 読み込み完了後、即座に選択＆再生
        stopAnimLoop();
        setCurrentMotion(glbMotion);
        applyMotionToPlayer(glbMotion);
        lastTimeRef.current = performance.now();
        setMotionPlaying(true);
      }
    } catch {
      // dribble.glb が存在しない場合は無視
    }
  }, [gameScene, selectedPlayerId, players, stopAnimLoop, applyMotionToPlayer]);

  // モーション選択（MotionCheckPanel からのコールバック）
  const handleMotionSelect = useCallback((name: string) => {
    const entry = availableMotions.find(m => m.name === name);
    if (!entry) return;

    stopAnimLoop();

    setCurrentMotion(entry.motion);
    applyMotionToPlayer(entry.motion);

    // 選択後すぐに再生開始
    lastTimeRef.current = performance.now();
    setMotionPlaying(true);
  }, [availableMotions, stopAnimLoop, applyMotionToPlayer]);

  // モーション変更（キーフレーム編集）— MotionCheckPanel からのコールバック
  // MotionCheckPanel は name を保持したまま joints を変更するのでそのまま使える
  const handleMotionChange = useCallback((edited: MotionDefinition) => {
    setCurrentMotion(edited);

    // MotionPlayer にホットスワップ（再生位置を維持）
    const poseData = buildPoseData(edited);
    if (poseData && motionPlayerRef.current) {
      const prevTime = motionPlayerRef.current.currentTime;
      motionPlayerRef.current.setData(poseData);
      motionPlayerRef.current.seekTo(prevTime);
    }
  }, [buildPoseData]);

  // 再生/一時停止トグル
  const handlePlayToggle = useCallback(() => {
    if (motionPlaying) {
      // 一時停止
      stopAnimLoop();
      setMotionPlaying(false);
    } else {
      // 再生開始
      lastTimeRef.current = performance.now();
      setMotionPlaying(true);
    }
  }, [motionPlaying, stopAnimLoop]);

  // 再生中の RAF ループ
  useEffect(() => {
    if (!motionPlaying || !motionPlayerRef.current) return;

    const updateLoop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      motionPlayerRef.current?.update(dt);
      animFrameRef.current = requestAnimationFrame(updateLoop);
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      stopAnimLoop();
    };
  }, [motionPlaying, stopAnimLoop]);

  // ── catch pose RAF loop ──
  useEffect(() => {
    if (subMode !== 'catch_pose' || phase !== 'playing') return;

    const character = characterRef.current;
    if (!character) return;

    const adapter = character.getSkeletonAdapter();
    if (!adapter) return;
    const ik = character.getIKSystem();
    const sign = adapter.isXMirrored ? -1 : 1;

    /** World-space rotation → bone-local conversion + bone matrix sync */
    function applyWorldRotationToBone(
      bone: Bone, node: TransformNode,
      parentNode: TransformNode,
      worldDeltaQ: Quaternion,
    ): void {
      const parentWorldQ = new Quaternion();
      parentNode.getWorldMatrix().decompose(undefined, parentWorldQ, undefined);
      const pInv = Quaternion.Inverse(parentWorldQ);
      const localDelta = pInv.multiply(worldDeltaQ).multiply(parentWorldQ);
      const currentQ = node.rotationQuaternion!.clone();
      node.rotationQuaternion = localDelta.multiply(currentQ);
      const mat = Matrix.Compose(node.scaling, node.rotationQuaternion, node.position);
      bone.updateMatrix(mat, false, true);
    }

    const loop = () => {
      const p = catchParamsRef.current;
      const charPos = character.getPosition();
      const forward = character.getForwardDirection();
      const rightDir = character.getRightDirection();

      // ball world position
      const ballPos = charPos
        .add(forward.scale(p.ballForward))
        .add(rightDir.scale(p.ballHorizontal))
        .add(new Vector3(0, p.ballHeight, 0));

      if (ballMeshRef.current) ballMeshRef.current.position.copyFrom(ballPos);
      if (ikTargetRef.current) ikTargetRef.current.position.copyFrom(ballPos);

      // auto mode: height → pitch/roll/kneeBend mapping
      let pitch = p.spinePitch;
      let roll = p.spineRoll;
      let knBend = p.kneeBend;
      if (p.autoMode) {
        const charHeight = character.config.physical.height;
        const heightRatio = p.ballHeight / charHeight;
        if (heightRatio > 1.0) {
          pitch = -0.15; knBend = 0;
        } else if (heightRatio > 0.6) {
          pitch = 0.08; knBend = 0;
        } else if (heightRatio > 0.3) {
          pitch = 0.30; knBend = 0.15;
        } else if (heightRatio > 0.1) {
          pitch = 0.45; knBend = 0.50;
        } else {
          pitch = 0.55; knBend = 0.85;
        }
        roll = 0;
        setSpinePitch(pitch);
        setSpineRoll(roll);
        setKneeBend(knBend);
      }

      // 1. Reset all bones to rest pose (bone matrices only)
      adapter.initializeAllBones();

      // 2. Sync bone → TransformNode (GLB FK reads from TransformNodes,
      //    initializeAllBones only writes bone API, not TransformNodes)
      const skeleton = adapter.skeleton;
      for (const bone of skeleton.bones) {
        const node = bone.getTransformNode();
        if (!node) continue;
        const q = new Quaternion();
        const pos = new Vector3();
        bone.getLocalMatrix().decompose(undefined, q, pos);
        node.rotationQuaternion = q;
        node.position.copyFrom(pos);
      }

      // 3. Set overlay + head look-at (disable arm IK to avoid interference)
      character.setCatchBodyOverlay({ spinePitch: pitch, spineRoll: roll });
      if (ik) {
        ik.setArmTarget('left', null);
        ik.setArmTarget('right', null);
        ik.setLookAtTarget(ikTargetRef.current);
      }

      // 4. Run character pipeline with dt=0
      character.update(0);

      // 5. Shoulder rotation → ball direction
      adapter.forceWorldMatrixUpdate();

      const isRight = p.catchArmSide === 'right';
      const upperArmBone = adapter.findBone(isRight ? 'rightArm' : 'leftArm');
      const foreArmBone = adapter.findBone(isRight ? 'rightForeArm' : 'leftForeArm');
      const handBone = adapter.findBone(isRight ? 'rightHand' : 'leftHand');
      const upperArmNode = upperArmBone?.getTransformNode();
      const foreArmNode = foreArmBone?.getTransformNode();
      const handNode = handBone?.getTransformNode();

      if (upperArmBone && foreArmBone && upperArmNode && foreArmNode) {
        // Shoulder → ball rotation
        const armWorldPos = upperArmNode.absolutePosition.clone();
        const elbowWorldPos = foreArmNode.absolutePosition.clone();
        const restArmDir = elbowWorldPos.subtract(armWorldPos).normalize();
        const targetDir = ballPos.subtract(armWorldPos).normalize();
        const cross = Vector3.Cross(restArmDir, targetDir);
        const dot = Vector3.Dot(restArmDir, targetDir);

        if (cross.length() > 0.001) {
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          const axis = cross.normalize();
          const worldDeltaQ = Quaternion.RotationAxis(axis, sign * angle * p.armSlerpAmount);

          const parentBone = upperArmBone.getParent();
          const parentNode = parentBone?.getTransformNode();
          if (parentNode) {
            applyWorldRotationToBone(upperArmBone, upperArmNode, parentNode, worldDeltaQ);
          }
        }

        // 5b. Forearm (elbow) rotation → ball direction
        //     After shoulder rotation, update world matrices to get new forearm position
        adapter.skeleton.computeAbsoluteMatrices(true);
        adapter.forceWorldMatrixUpdate();

        if (handBone && handNode) {
          const elbowWorldPos2 = foreArmNode.absolutePosition.clone();
          const wristWorldPos = handNode.absolutePosition.clone();
          const restForearmDir = wristWorldPos.subtract(elbowWorldPos2).normalize();
          const targetDir2 = ballPos.subtract(elbowWorldPos2).normalize();
          const cross2 = Vector3.Cross(restForearmDir, targetDir2);
          const dot2 = Vector3.Dot(restForearmDir, targetDir2);

          if (cross2.length() > 0.001) {
            const angle2 = Math.acos(Math.max(-1, Math.min(1, dot2)));
            const axis2 = cross2.normalize();
            const worldDeltaQ2 = Quaternion.RotationAxis(axis2, sign * angle2 * p.armSlerpAmount);
            // Forearm's parent is upper arm
            applyWorldRotationToBone(foreArmBone, foreArmNode, upperArmNode, worldDeltaQ2);
          }
        }
      }

      // 5c. Knee bend — rotate upper legs forward, lower legs counter-rotate
      //     to create proper knee flexion. Clamp to JointLimitsConfig.
      const RAD_TO_DEG = 180 / Math.PI;
      const DEG_TO_RAD = Math.PI / 180;
      const rawBendRad = knBend * 1.5; // slider range → max ≈ 86°
      if (rawBendRad > 0.001) {
        // Clamp to joint limits (hip forward = +X, knee flexion = -X)
        const rawBendDeg = rawBendRad * RAD_TO_DEG;
        const hipBendRad = clampJointDegrees('leftHip', 'X', rawBendDeg) * DEG_TO_RAD;
        const kneeBendActualRad = Math.abs(clampJointDegrees('leftKnee', 'X', -rawBendDeg)) * DEG_TO_RAD;

        adapter.skeleton.computeAbsoluteMatrices(true);
        adapter.forceWorldMatrixUpdate();

        // Measure thigh length BEFORE rotations (rest pose Y distance)
        const upLegRef = adapter.findBone('leftUpLeg')?.getTransformNode();
        const lowLegRef = adapter.findBone('leftLeg')?.getTransformNode();
        const restThighLength = (upLegRef && lowLegRef)
          ? Math.abs(lowLegRef.absolutePosition.y - upLegRef.absolutePosition.y)
          : 0;

        const legSign = -sign;
        const sides = ['left', 'right'] as const;
        for (const side of sides) {
          const upLegBone = adapter.findBone(side === 'left' ? 'leftUpLeg' : 'rightUpLeg');
          const lowLegBone = adapter.findBone(side === 'left' ? 'leftLeg' : 'rightLeg');
          const upLegNode = upLegBone?.getTransformNode();
          const lowLegNode = lowLegBone?.getTransformNode();

          if (upLegBone && upLegNode) {
            // Rotate upper leg forward (hip flexion)
            const worldDeltaUp = Quaternion.RotationAxis(rightDir, legSign * hipBendRad);
            const upLegParent = upLegBone.getParent();
            const upLegParentNode = upLegParent?.getTransformNode();
            if (upLegParentNode) {
              applyWorldRotationToBone(upLegBone, upLegNode, upLegParentNode, worldDeltaUp);
            }
          }

          // Update matrices after upper leg rotation before rotating lower leg
          adapter.skeleton.computeAbsoluteMatrices(true);
          adapter.forceWorldMatrixUpdate();

          if (lowLegBone && lowLegNode && upLegNode) {
            // Counter-rotate lower leg (opposite direction) to create knee flexion.
            // This keeps the shin roughly vertical instead of following the thigh.
            const worldDeltaLow = Quaternion.RotationAxis(rightDir, -legSign * kneeBendActualRad);
            applyWorldRotationToBone(lowLegBone, lowLegNode, upLegNode, worldDeltaLow);
          }
        }

        // Hip height drop compensation using rest-pose thigh length
        if (restThighLength > 0) {
          adapter.skeleton.computeAbsoluteMatrices(true);
          adapter.forceWorldMatrixUpdate();

          const hipBone = adapter.findBone('hips');
          const hipNode = hipBone?.getTransformNode();
          if (hipBone && hipNode) {
            const hipDrop = restThighLength * (1 - Math.cos(hipBendRad));
            hipNode.position.y -= hipDrop;
            const hipMat = Matrix.Compose(hipNode.scaling, hipNode.rotationQuaternion!, hipNode.position);
            hipBone.updateMatrix(hipMat, false, true);
          }
        }
      }

      // 6. Recompute bone absolute matrices + world matrices for rendering
      adapter.skeleton.computeAbsoluteMatrices(true);
      adapter.forceWorldMatrixUpdate();

      catchAnimFrameRef.current = requestAnimationFrame(loop);
    };

    catchAnimFrameRef.current = requestAnimationFrame(loop);
    return () => stopCatchLoop();
  }, [subMode, phase, stopCatchLoop]);

  // 現在の再生時刻を返す（MotionCheckPanel の getPlaybackTime）
  const getPlaybackTime = useCallback(() => {
    return motionPlayerRef.current?.currentTime ?? 0;
  }, []);

  // GLB ファイルからアニメーションを読み込み、モーションリストに追加
  const handleLoadGLB = useCallback(async (file: File) => {
    if (!gameScene) return;

    setGlbLoading(true);
    try {
      const url = URL.createObjectURL(file);
      const motionName = `glb:${file.name.replace(/\.glb$/i, '')}`;
      const motion = await loadGLBAnimation(url, gameScene.getScene(), motionName);
      URL.revokeObjectURL(url);

      if (!motion) return;

      const entry: GameMotionEntry = { name: motionName, motion };
      setAvailableMotions(prev => {
        // 同名エントリがあれば上書き
        const filtered = prev.filter(m => m.name !== motionName);
        return [...filtered, entry];
      });

      // 読み込んだモーションを即座に選択＆再生
      stopAnimLoop();
      setCurrentMotion(motion);
      applyMotionToPlayer(motion);
      lastTimeRef.current = performance.now();
      setMotionPlaying(true);
    } finally {
      setGlbLoading(false);
    }
  }, [gameScene, stopAnimLoop, applyMotionToPlayer]);

  // ── tab switching ──
  const handleSubModeChange = useCallback((mode: SubMode) => {
    if (mode === subMode) return;
    const character = characterRef.current;
    if (!character) return;

    if (mode === 'catch_pose') {
      // motion → catch_pose
      stopAnimLoop();
      setMotionPlaying(false);
      character.getMotionController().stop();
      character.getSkeletonAdapter()?.initializeAllBones();
      createBallMesh();
    } else {
      // catch_pose → motion
      stopCatchLoop();
      character.clearCatchBodyOverlay();
      const ik = character.getIKSystem();
      if (ik) {
        ik.setArmTarget('left', null);
        ik.setArmTarget('right', null);
        ik.setLookAtTarget(null);
      }
      disposeBallMesh();
      character.getSkeletonAdapter()?.initializeAllBones();
      applyMotionToPlayer(currentMotion);
      lastTimeRef.current = performance.now();
      setMotionPlaying(true);
    }

    setSubMode(mode);
  }, [subMode, stopAnimLoop, stopCatchLoop, createBallMesh, disposeBallMesh, applyMotionToPlayer, currentMotion]);

  // 設定に戻る
  const handleBackToSetup = useCallback(() => {
    stopAnimLoop();
    stopCatchLoop();
    setMotionPlaying(false);
    const character = characterRef.current;
    if (character) {
      character.clearCatchBodyOverlay();
      const ik = character.getIKSystem();
      if (ik) {
        ik.setArmTarget('left', null);
        ik.setArmTarget('right', null);
        ik.setLookAtTarget(null);
      }
    }
    disposeBallMesh();
    motionPlayerRef.current?.dispose();
    motionPlayerRef.current = null;
    characterRef.current = null;
    gameScene?.resume();
    setSubMode('motion');
    setPhase('setup');
  }, [stopAnimLoop, stopCatchLoop, disposeBallMesh, gameScene]);

  // 閉じる
  const handleClose = useCallback(() => {
    stopAnimLoop();
    stopCatchLoop();
    const character = characterRef.current;
    if (character) {
      character.clearCatchBodyOverlay();
      const ik = character.getIKSystem();
      if (ik) {
        ik.setArmTarget('left', null);
        ik.setArmTarget('right', null);
        ik.setLookAtTarget(null);
      }
    }
    disposeBallMesh();
    motionPlayerRef.current?.dispose();
    motionPlayerRef.current = null;
    gameScene?.resume();
    onClose();
  }, [stopAnimLoop, stopCatchLoop, disposeBallMesh, onClose, gameScene]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopAnimLoop();
      stopCatchLoop();
      disposeBallMesh();
      motionPlayerRef.current?.dispose();
      motionPlayerRef.current = null;
      gameScene?.resume();
    };
  }, [stopAnimLoop, stopCatchLoop, disposeBallMesh, gameScene]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  if (!gameScene) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="bg-red-900/20 border border-red-500 p-6 rounded-lg">
          <p className="text-red-400 text-xl mb-4">ゲームシーンが初期化されていません</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col pointer-events-none">
      {/* セットアップ画面 */}
      {phase === 'setup' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto">
          <div className="bg-gray-800 p-8 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                モーションチェック設定
              </h3>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
              >
                閉じる
              </button>
            </div>

            {/* 選手選択 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                選手
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none"
              >
                <option value="">選手を選択...</option>
                {Object.entries(players).map(([id, player]) => (
                  <option key={id} value={id}>
                    {player.basic.NAME} ({player.basic.PositionMain})
                  </option>
                ))}
              </select>
            </div>

            {/* 開始ボタン */}
            <button
              onClick={handleStart}
              disabled={!selectedPlayerId}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                selectedPlayerId
                  ? 'bg-teal-600 hover:bg-teal-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              開始
            </button>
          </div>
        </div>
      )}

      {/* プレビュー画面: 右サイドパネル */}
      {phase === 'playing' && (
        <div className="absolute top-0 right-0 bottom-0 w-80 flex flex-col pointer-events-auto"
             style={{ background: '#1e1e1e' }}>
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <h3 className="text-sm font-bold text-white">Motion Check</h3>
            <div className="flex gap-1">
              {subMode === 'motion' && (
                <label
                  className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer ${
                    glbLoading
                      ? 'bg-gray-700 text-gray-400'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {glbLoading ? '...' : 'GLB'}
                  <input
                    type="file"
                    accept=".glb"
                    className="hidden"
                    disabled={glbLoading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLoadGLB(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              <button
                onClick={handleBackToSetup}
                className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs font-semibold"
              >
                戻る
              </button>
              <button
                onClick={handleClose}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
              >
                閉じる
              </button>
            </div>
          </div>

          {/* タブバー */}
          <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
            {(['motion', 'catch_pose'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleSubModeChange(mode)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: 11,
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  color: subMode === mode ? '#fff' : '#666',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: subMode === mode ? '2px solid #0078d4' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {mode === 'motion' ? 'Motion' : 'Catch Pose'}
              </button>
            ))}
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-hidden p-1" style={{ display: 'flex', flexDirection: 'column' }}>
            {subMode === 'motion' ? (
              <MotionCheckPanel
                motionData={currentMotion}
                onMotionChange={handleMotionChange}
                playing={motionPlaying}
                onPlayToggle={handlePlayToggle}
                availableMotions={availableMotions}
                onMotionSelect={handleMotionSelect}
                getPlaybackTime={getPlaybackTime}
              />
            ) : (
              <CatchPoseCheckPanel
                ballHeight={ballHeight}
                ballHorizontal={ballHorizontal}
                ballForward={ballForward}
                spinePitch={spinePitch}
                spineRoll={spineRoll}
                kneeBend={kneeBend}
                armSlerpAmount={armSlerpAmount}
                catchArmSide={catchArmSide}
                autoMode={autoMode}
                onBallHeightChange={setBallHeight}
                onBallHorizontalChange={setBallHorizontal}
                onBallForwardChange={setBallForward}
                onSpinePitchChange={setSpinePitch}
                onSpineRollChange={setSpineRoll}
                onKneeBendChange={setKneeBend}
                onArmSlerpAmountChange={setArmSlerpAmount}
                onCatchArmSideChange={setCatchArmSide}
                onAutoModeChange={setAutoMode}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
