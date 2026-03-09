/**
 * FighterMotion: manages motion playback per fighter with cross-fade blending.
 *
 * Each fighter has a "current" and optionally a "previous" motion.
 * During blend-in, both are evaluated and Slerp'd together.
 * When blend completes, previous is discarded.
 */

import { TransformNode, Vector3, Quaternion } from '@babylonjs/core';
import {
  BONE_DEFS, threeQuatToViewer, loadMotionClipFromFile,
} from '@/lib/voxel-skeleton';
import type { MotionClip } from '@/lib/voxel-skeleton';
import { getMotionForAction } from '@/GamePlay/FightGame/Config/MotionConfig';
import type { MotionDef } from '@/GamePlay/FightGame/Config/MotionConfig';
import type { FighterState } from '@/GamePlay/FightGame/Fighter/Fighter';

interface ActiveMotion {
  clip: MotionClip;
  def: MotionDef;
  time: number;        // current playback time
}

export class FighterMotionPlayer {
  private current: ActiveMotion | null = null;
  private previous: ActiveMotion | null = null;
  private blendTimer = 0;
  private blendDuration = 0;
  private currentMotionKey = '';  // track which motion is playing to avoid redundant switches

  // Cache loaded clips
  private static clipCache = new Map<string, MotionClip>();
  private static loadingFiles = new Map<string, Promise<MotionClip | null>>();

  constructor(
    private nodes: Map<string, TransformNode>,
    private boneRestPos: Map<string, Vector3>,
    private voxelBodyHeight: number,
  ) {}

  /**
   * Update motion based on fighter state. Call every frame.
   * Handles automatic motion switching and blending.
   */
  async update(fighter: FighterState, dt: number): Promise<void> {
    // Determine desired motion
    const attackName = fighter.currentAttack?.name;
    const kdVariant = fighter.action === 'knockdown' ? fighter.knockdownVariant : undefined;
    const grappleKey = (fighter.action === 'grapple' || fighter.action === 'grappled')
      ? fighter.grappleMotionKey : undefined;
    const motionDef = getMotionForAction(fighter.action, attackName, kdVariant, grappleKey);
    const motionKey = motionDef?.file
      ? `${motionDef.file}:${motionDef.speed}`
      : `action:${fighter.action}:${attackName ?? ''}:${kdVariant ?? ''}:${grappleKey ?? ''}`;

    // Switch motion if changed
    if (motionKey !== this.currentMotionKey) {
      this.currentMotionKey = motionKey;
      await this.switchMotion(motionDef);
    }

    // Advance time
    if (this.current) {
      const speed = Math.abs(this.current.def.speed);
      this.current.time += dt * speed;

      // Loop or clamp
      if (this.current.def.loop && this.current.clip) {
        this.current.time = this.current.time % this.current.clip.duration;
      } else if (this.current.clip) {
        this.current.time = Math.min(this.current.time, this.current.clip.duration - 0.001);
      }
    }

    if (this.previous) {
      const speed = Math.abs(this.previous.def.speed);
      this.previous.time += dt * speed;
    }

    // Advance blend
    if (this.blendDuration > 0) {
      this.blendTimer += dt;
      if (this.blendTimer >= this.blendDuration) {
        this.previous = null;
        this.blendDuration = 0;
        this.blendTimer = 0;
      }
    }

    // Apply to skeleton
    this.applyToSkeleton();

    // Floor clamp: prevent character from sinking below ground.
    // When lying flat, hips (body center) must be elevated by the body's
    // cross-section radius so the skin doesn't clip through the floor.
    const hipsNode = this.nodes.get('Hips');
    if (hipsNode) {
      const rootY = (hipsNode.parent instanceof TransformNode) ? hipsNode.parent.position.y : 0;
      // Body radius ≈ 20% of body height (torso thickness when lying down)
      const bodyRadius = this.voxelBodyHeight * 0.2;
      const minLocalY = bodyRadius - rootY;
      if (hipsNode.position.y < minLocalY) {
        hipsNode.position.y = minLocalY;
      }
    }
  }

  /**
   * Switch to a new motion with cross-fade.
   */
  private async switchMotion(motionDef: MotionDef | null): Promise<void> {
    // Save current as previous for blending
    if (this.current) {
      this.previous = this.current;
    }

    if (!motionDef || !motionDef.file) {
      this.current = null;
      this.blendDuration = motionDef?.blendIn ?? 0.2;
      this.blendTimer = 0;
      return;
    }

    const clip = await FighterMotionPlayer.loadClip(motionDef.file);
    if (!clip) {
      this.current = null;
      this.blendDuration = motionDef.blendIn;
      this.blendTimer = 0;
      return;
    }

    this.current = {
      clip,
      def: motionDef,
      time: motionDef.speed < 0 ? clip.duration : 0,
    };
    this.blendDuration = motionDef.blendIn;
    this.blendTimer = 0;
  }

  /**
   * Load a motion clip with caching and deduplication.
   */
  private static async loadClip(file: string): Promise<MotionClip | null> {
    if (FighterMotionPlayer.clipCache.has(file)) {
      return FighterMotionPlayer.clipCache.get(file)!;
    }

    // Deduplicate concurrent loads
    if (FighterMotionPlayer.loadingFiles.has(file)) {
      return FighterMotionPlayer.loadingFiles.get(file)!;
    }

    const promise = (async () => {
      try {
        const clip = await loadMotionClipFromFile(file, file, file);
        FighterMotionPlayer.clipCache.set(file, clip);
        return clip;
      } catch {
        return null;
      } finally {
        FighterMotionPlayer.loadingFiles.delete(file);
      }
    })();

    FighterMotionPlayer.loadingFiles.set(file, promise);
    return promise;
  }

  /**
   * Apply current (and optionally blended previous) motion to skeleton nodes.
   */
  private applyToSkeleton(): void {
    const hasCurrent = this.current?.clip;
    const hasPrevious = this.previous?.clip;
    const isBlending = this.blendDuration > 0 && hasPrevious;

    if (!hasCurrent && !hasPrevious) {
      // No motion: rest pose
      this.applyRestPose();
      return;
    }

    if (!hasCurrent && hasPrevious) {
      // Blending from previous to rest pose
      const t = Math.min(1, this.blendTimer / this.blendDuration);
      const prevRotations = this.evaluateClip(this.previous!);
      const restRotations = this.getRestRotations();
      this.applyBlendedRotations(prevRotations, restRotations, t);
      this.applyHipsPosition(this.previous!, 1 - t);
      return;
    }

    if (hasCurrent && !isBlending) {
      // Just current, no blend
      this.applyClipToNodes(this.current!);
      return;
    }

    // Blending previous → current
    const t = Math.min(1, this.blendTimer / this.blendDuration);
    const prevRotations = hasPrevious
      ? this.evaluateClip(this.previous!)
      : this.getRestRotations();
    const currRotations = this.evaluateClip(this.current!);
    this.applyBlendedRotations(prevRotations, currRotations, t);

    // Hips position: blend
    if (hasPrevious) {
      this.applyHipsPositionBlended(this.previous!, this.current!, t);
    } else {
      this.applyHipsPosition(this.current!, 1);
    }
  }

  /**
   * Evaluate a clip at its current time, returning per-bone local rotations.
   */
  private evaluateClip(active: ActiveMotion): Map<string, Quaternion> {
    const clip = active.clip;
    const frameDuration = 1.0 / clip.fps;
    let time = active.time;

    // Handle reverse playback
    if (active.def.speed < 0) {
      time = clip.duration - active.time;
    }

    const frameIndex = Math.min(
      Math.max(0, Math.floor(time / frameDuration)),
      clip.frameCount - 1,
    );
    const frame = clip.frames[frameIndex];
    if (!frame) return new Map();

    // Compute world dqs
    const worldDqs = new Map<string, Quaternion>();
    for (const boneDef of BONE_DEFS) {
      const data = frame[boneDef.name];
      worldDqs.set(boneDef.name, data ? threeQuatToViewer(data.dq) : Quaternion.Identity());
    }

    // Convert to local rotations
    const localRots = new Map<string, Quaternion>();
    for (const boneDef of BONE_DEFS) {
      const worldDq = worldDqs.get(boneDef.name) ?? Quaternion.Identity();
      if (boneDef.parent) {
        const parentWorldDq = worldDqs.get(boneDef.parent) ?? Quaternion.Identity();
        localRots.set(boneDef.name, Quaternion.Inverse(parentWorldDq).multiply(worldDq));
      } else {
        localRots.set(boneDef.name, worldDq);
      }
    }
    return localRots;
  }

  private getRestRotations(): Map<string, Quaternion> {
    const rots = new Map<string, Quaternion>();
    for (const boneDef of BONE_DEFS) {
      rots.set(boneDef.name, Quaternion.Identity());
    }
    return rots;
  }

  private applyBlendedRotations(
    from: Map<string, Quaternion>,
    to: Map<string, Quaternion>,
    t: number,
  ): void {
    for (const boneDef of BONE_DEFS) {
      const node = this.nodes.get(boneDef.name);
      if (!node) continue;

      const fromQ = from.get(boneDef.name) ?? Quaternion.Identity();
      const toQ = to.get(boneDef.name) ?? Quaternion.Identity();
      node.rotationQuaternion = Quaternion.Slerp(fromQ, toQ, t);
    }
  }

  private applyClipToNodes(active: ActiveMotion): void {
    const clip = active.clip;
    const scaleFactor = clip.fbxBodyHeight > 0
      ? this.voxelBodyHeight / clip.fbxBodyHeight : 1;
    const voxelHipsPos = this.boneRestPos.get('Hips') ?? Vector3.Zero();

    const frameDuration = 1.0 / clip.fps;
    let time = active.time;
    if (active.def.speed < 0) time = clip.duration - active.time;

    const frameIndex = Math.min(
      Math.max(0, Math.floor(time / frameDuration)),
      clip.frameCount - 1,
    );
    const frame = clip.frames[frameIndex];
    if (!frame) return;

    // World dqs
    const worldDqs = new Map<string, Quaternion>();
    for (const boneDef of BONE_DEFS) {
      const data = frame[boneDef.name];
      worldDqs.set(boneDef.name, data ? threeQuatToViewer(data.dq) : Quaternion.Identity());
    }

    // Apply local rotations
    for (const boneDef of BONE_DEFS) {
      const node = this.nodes.get(boneDef.name);
      if (!node) continue;
      const worldDq = worldDqs.get(boneDef.name) ?? Quaternion.Identity();
      if (boneDef.parent) {
        const parentWorldDq = worldDqs.get(boneDef.parent) ?? Quaternion.Identity();
        node.rotationQuaternion = Quaternion.Inverse(parentWorldDq).multiply(worldDq);
      } else {
        node.rotationQuaternion = worldDq;
      }
    }

    // Hips dp
    const hipsData = frame['Hips'];
    const hipsNode = this.nodes.get('Hips');
    if (hipsNode && hipsData?.dp) {
      hipsNode.position.x = voxelHipsPos.x + (-hipsData.dp[0]) * scaleFactor;
      hipsNode.position.y = voxelHipsPos.y + hipsData.dp[1] * scaleFactor;
      hipsNode.position.z = voxelHipsPos.z + hipsData.dp[2] * scaleFactor;
    } else if (hipsNode) {
      hipsNode.position.copyFrom(voxelHipsPos);
    }
  }

  private applyHipsPosition(active: ActiveMotion, weight: number): void {
    const clip = active.clip;
    const scaleFactor = clip.fbxBodyHeight > 0
      ? this.voxelBodyHeight / clip.fbxBodyHeight : 1;
    const voxelHipsPos = this.boneRestPos.get('Hips') ?? Vector3.Zero();

    const frameDuration = 1.0 / clip.fps;
    let time = active.time;
    if (active.def.speed < 0) time = clip.duration - active.time;

    const frameIndex = Math.min(
      Math.max(0, Math.floor(time / frameDuration)),
      clip.frameCount - 1,
    );
    const frame = clip.frames[frameIndex];
    const hipsData = frame?.['Hips'];
    const hipsNode = this.nodes.get('Hips');

    if (hipsNode && hipsData?.dp) {
      const dx = (-hipsData.dp[0]) * scaleFactor * weight;
      const dy = hipsData.dp[1] * scaleFactor * weight;
      const dz = hipsData.dp[2] * scaleFactor * weight;
      hipsNode.position.x = voxelHipsPos.x + dx;
      hipsNode.position.y = voxelHipsPos.y + dy;
      hipsNode.position.z = voxelHipsPos.z + dz;
    } else if (hipsNode) {
      hipsNode.position.copyFrom(voxelHipsPos);
    }
  }

  private applyHipsPositionBlended(prev: ActiveMotion, curr: ActiveMotion, t: number): void {
    const voxelHipsPos = this.boneRestPos.get('Hips') ?? Vector3.Zero();
    const hipsNode = this.nodes.get('Hips');
    if (!hipsNode) return;

    const getHipsDp = (active: ActiveMotion): Vector3 => {
      const clip = active.clip;
      const sf = clip.fbxBodyHeight > 0 ? this.voxelBodyHeight / clip.fbxBodyHeight : 1;
      const fd = 1.0 / clip.fps;
      let time = active.time;
      if (active.def.speed < 0) time = clip.duration - active.time;
      const fi = Math.min(Math.max(0, Math.floor(time / fd)), clip.frameCount - 1);
      const frame = clip.frames[fi];
      const hd = frame?.['Hips'];
      if (hd?.dp) {
        return new Vector3((-hd.dp[0]) * sf, hd.dp[1] * sf, hd.dp[2] * sf);
      }
      return Vector3.Zero();
    };

    const prevDp = getHipsDp(prev);
    const currDp = getHipsDp(curr);
    const blended = Vector3.Lerp(prevDp, currDp, t);
    hipsNode.position.x = voxelHipsPos.x + blended.x;
    hipsNode.position.y = voxelHipsPos.y + blended.y;
    hipsNode.position.z = voxelHipsPos.z + blended.z;
  }

  private applyRestPose(): void {
    for (const boneDef of BONE_DEFS) {
      const node = this.nodes.get(boneDef.name);
      if (!node) continue;
      node.rotationQuaternion = Quaternion.Identity();
      if (!boneDef.parent) {
        const rest = this.boneRestPos.get(boneDef.name);
        if (rest) node.position.copyFrom(rest);
      } else {
        const bonePos = this.boneRestPos.get(boneDef.name);
        const parentPos = this.boneRestPos.get(boneDef.parent);
        if (bonePos && parentPos) {
          node.position = bonePos.subtract(parentPos);
        }
      }
    }
  }
}
