/**
 * Stage decoration builder for the fighting game arena.
 * Creates floor grid, boundary pillars, ambient particles, and lighting.
 */

import {
  Scene, MeshBuilder, StandardMaterial, Color3, Vector3,
  PointLight, GlowLayer, Mesh,
} from '@babylonjs/core';
import { STAGE_CONFIG } from '@/GamePlay/FightGame/Config/FighterConfig';

export interface StageElements {
  meshes: Mesh[];
  lights: PointLight[];
  glowLayer: GlowLayer;
}

/**
 * Build a decorated arena stage.
 * Call once after scene creation.
 */
export function buildStage(scene: Scene): StageElements {
  const r = STAGE_CONFIG.arenaRadius;
  const meshes: Mesh[] = [];
  const lights: PointLight[] = [];

  // === GROUND ===
  // Main floor disc
  const ground = MeshBuilder.CreateDisc('ground', {
    radius: r + 0.5,
    tessellation: 64,
  }, scene);
  ground.rotation.x = Math.PI / 2;
  const gMat = new StandardMaterial('gMat', scene);
  gMat.diffuseColor = new Color3(0.08, 0.08, 0.14);
  gMat.specularColor = new Color3(0.05, 0.05, 0.1);
  ground.material = gMat;
  ground.isPickable = false;
  meshes.push(ground);

  // Inner ring (fight zone marker)
  const innerRing = MeshBuilder.CreateTorus('innerRing', {
    diameter: r * 1.4,
    thickness: 0.015,
    tessellation: 64,
  }, scene);
  innerRing.position.y = 0.005;
  const innerRingMat = new StandardMaterial('innerRingMat', scene);
  innerRingMat.diffuseColor = new Color3(0.15, 0.15, 0.3);
  innerRingMat.emissiveColor = new Color3(0.08, 0.08, 0.2);
  innerRing.material = innerRingMat;
  innerRing.isPickable = false;
  meshes.push(innerRing);

  // Arena boundary ring (glowing)
  const ring = MeshBuilder.CreateTorus('ring', {
    diameter: r * 2,
    thickness: 0.04,
    tessellation: 64,
  }, scene);
  ring.position.y = 0.015;
  const ringMat = new StandardMaterial('ringMat', scene);
  ringMat.diffuseColor = new Color3(0.5, 0.12, 0.12);
  ringMat.emissiveColor = new Color3(0.35, 0.06, 0.06);
  ring.material = ringMat;
  ring.isPickable = false;
  meshes.push(ring);

  // Outer decorative ring
  const outerRing = MeshBuilder.CreateTorus('outerRing', {
    diameter: (r + 0.5) * 2,
    thickness: 0.025,
    tessellation: 64,
  }, scene);
  outerRing.position.y = 0.01;
  const outerRingMat = new StandardMaterial('outerRingMat', scene);
  outerRingMat.diffuseColor = new Color3(0.2, 0.2, 0.3);
  outerRingMat.emissiveColor = new Color3(0.05, 0.05, 0.12);
  outerRing.material = outerRingMat;
  outerRing.isPickable = false;
  meshes.push(outerRing);

  // === CORNER PILLARS ===
  const pillarCount = 8;
  const pillarDist = r + 0.6;
  for (let i = 0; i < pillarCount; i++) {
    const angle = (i / pillarCount) * Math.PI * 2;
    const px = Math.cos(angle) * pillarDist;
    const pz = Math.sin(angle) * pillarDist;

    // Base pillar
    const pillar = MeshBuilder.CreateCylinder(`pillar_${i}`, {
      height: 0.8,
      diameterTop: 0.04,
      diameterBottom: 0.06,
      tessellation: 8,
    }, scene);
    pillar.position.set(px, 0.4, pz);
    const pillarMat = new StandardMaterial(`pillarMat_${i}`, scene);
    pillarMat.diffuseColor = new Color3(0.15, 0.15, 0.25);
    pillarMat.emissiveColor = new Color3(0.05, 0.05, 0.1);
    pillar.material = pillarMat;
    pillar.isPickable = false;
    meshes.push(pillar);

    // Glowing tip
    const tip = MeshBuilder.CreateSphere(`tip_${i}`, { diameter: 0.06, segments: 8 }, scene);
    tip.position.set(px, 0.82, pz);
    const tipMat = new StandardMaterial(`tipMat_${i}`, scene);
    // Alternate between blue-ish and red-ish tones
    if (i % 2 === 0) {
      tipMat.emissiveColor = new Color3(0.2, 0.2, 0.6);
    } else {
      tipMat.emissiveColor = new Color3(0.6, 0.15, 0.15);
    }
    tipMat.diffuseColor = Color3.Black();
    tip.material = tipMat;
    tip.isPickable = false;
    meshes.push(tip);
  }

  // === AMBIENT POINT LIGHTS ===
  // Blue corner light
  const lightBlue = new PointLight('stageLight1', new Vector3(-r * 0.6, 1.2, -r * 0.6), scene);
  lightBlue.diffuse = new Color3(0.3, 0.3, 0.8);
  lightBlue.intensity = 0.4;
  lightBlue.range = 4;
  lights.push(lightBlue);

  // Red corner light
  const lightRed = new PointLight('stageLight2', new Vector3(r * 0.6, 1.2, r * 0.6), scene);
  lightRed.diffuse = new Color3(0.8, 0.2, 0.2);
  lightRed.intensity = 0.4;
  lightRed.range = 4;
  lights.push(lightRed);

  // === GLOW LAYER ===
  const glowLayer = new GlowLayer('glow', scene, {
    mainTextureFixedSize: 256,
    blurKernelSize: 32,
  });
  glowLayer.intensity = 0.6;

  return { meshes, lights, glowLayer };
}
