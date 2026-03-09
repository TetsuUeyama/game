/**
 * Convert FBX animation to JSON motion data.
 * Outputs WORLD-SPACE delta quaternions and delta positions per bone per frame.
 * Delta = difference from rest pose (frame 0).
 *
 * Usage: node scripts/convert-fbx-motion.mjs <input.fbx> [output.json]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Blob } from 'buffer';

// ── Polyfills for Three.js in Node.js ──
global.Blob = Blob;
global.self = global;
global.window = global;
global.document = {
  createElementNS: (_ns, tag) => {
    if (tag === 'img') return { set src(_v) {}, addEventListener() {} };
    return { style: {} };
  },
  createElement: (tag) => {
    if (tag === 'canvas') return { getContext: () => null, style: {} };
    return { style: {} };
  },
};
try { global.navigator = { userAgent: 'node', platform: 'node' }; } catch {
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'node', platform: 'node' }, writable: true, configurable: true });
}
global.URL = global.URL || {};
global.URL.createObjectURL = global.URL.createObjectURL || (() => '');
global.URL.revokeObjectURL = global.URL.revokeObjectURL || (() => '');

if (!global.fetch) {
  global.fetch = async (url) => {
    const filePath = url.startsWith('file://') ? fileURLToPath(url) : url;
    const buf = fs.readFileSync(filePath);
    return {
      ok: true,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => buf.toString('utf-8'),
      json: async () => JSON.parse(buf.toString('utf-8')),
    };
  };
}

const THREE = await import('three');

THREE.FileLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
  try {
    const filePath = path.resolve(url);
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (this.responseType === 'arraybuffer') {
      setTimeout(() => onLoad(ab), 0);
    } else {
      setTimeout(() => onLoad(buf.toString('utf-8')), 0);
    }
  } catch (e) {
    if (onError) onError(e);
    else console.error(e);
  }
  return {};
};

THREE.TextureLoader.prototype.load = function () {
  return new THREE.Texture();
};

const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

function cleanBoneName(name) {
  return name.replace(/^mixamorig/, '');
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

async function convertFBX(inputPath, outputPath) {
  console.log(`Loading FBX: ${inputPath}`);

  const loader = new FBXLoader();
  const group = await new Promise((resolve, reject) => {
    loader.load(inputPath, resolve, undefined, reject);
  });

  // Collect all bones
  const allBones = [];
  const boneByName = {};
  group.traverse((obj) => {
    if (obj.isBone) {
      allBones.push(obj);
      boneByName[cleanBoneName(obj.name)] = obj;
    }
  });
  console.log(`Bones found: ${allBones.length}`);

  // Build hierarchy info
  const hierarchy = [];
  for (const bone of allBones) {
    const name = cleanBoneName(bone.name);
    const parentName = bone.parent?.isBone ? cleanBoneName(bone.parent.name) : null;
    const pos = bone.position;
    hierarchy.push({
      name,
      parent: parentName,
      restPosition: { x: round4(pos.x), y: round4(pos.y), z: round4(pos.z) },
    });
  }

  const clips = group.animations;
  if (!clips || clips.length === 0) {
    console.error('No animation clips found!');
    process.exit(1);
  }

  const results = [];

  for (const clip of clips) {
    console.log(`\nProcessing: "${clip.name}" (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`);

    // Determine source FPS from first quaternion track
    let sourceFps = 30;
    for (const track of clip.tracks) {
      if (track.name.endsWith('.quaternion') && track.times.length > 1) {
        sourceFps = Math.round(1 / (track.times[1] - track.times[0]));
        break;
      }
    }
    const targetFps = sourceFps > 40 ? 30 : sourceFps;
    const dt = 1.0 / targetFps;
    const totalFrames = Math.ceil(clip.duration * targetFps);
    console.log(`  Source FPS: ${sourceFps}, Target FPS: ${targetFps}, Frames: ${totalFrames}`);

    // Identify which bones have animation tracks
    const trackedBoneNames = new Set();
    for (const track of clip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      const rawName = track.name.substring(0, dotIdx);
      trackedBoneNames.add(cleanBoneName(rawName));
    }

    // Capture BIND POSE (T-pose, before any animation) as rest reference.
    // This is critical: the voxel viewer model is in T-pose, so delta quaternions
    // must represent changes from T-pose (bind pose), NOT from frame 0.
    group.updateMatrixWorld(true);

    const restWorldPos = {};
    const restWorldQuat = {};
    for (const bone of allBones) {
      const name = cleanBoneName(bone.name);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      bone.getWorldPosition(pos);
      bone.getWorldQuaternion(quat);
      restWorldPos[name] = pos.clone();
      restWorldQuat[name] = quat.clone();
    }

    // Now set up animation mixer for frame evaluation
    const mixer = new THREE.AnimationMixer(group);
    const action = mixer.clipAction(clip);
    action.play();

    // Compute FBX body scale (Hips to Head world distance) from bind pose
    const hipsRestY = restWorldPos['Hips']?.y ?? 0;
    const headRestY = restWorldPos['Head']?.y ?? 1;
    const fbxBodyHeight = headRestY - hipsRestY;
    console.log(`  FBX body height (Hips→Head): ${fbxBodyHeight.toFixed(3)}`);

    // Determine which bones to output (all tracked bones)
    const outputBones = allBones
      .map(b => cleanBoneName(b.name))
      .filter(name => trackedBoneNames.has(name));
    console.log(`  Output bones (${outputBones.length}): ${outputBones.join(', ')}`);

    // Evaluate each frame - world-space delta from rest
    const frames = [];
    for (let f = 0; f < totalFrames; f++) {
      const time = f * dt;
      mixer.setTime(time);
      group.updateMatrixWorld(true);

      const frame = {};
      for (const name of outputBones) {
        const bone = boneByName[name];
        if (!bone) continue;

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        bone.getWorldPosition(worldPos);
        bone.getWorldQuaternion(worldQuat);

        // Delta position = animated - rest (in FBX world space)
        const dp = worldPos.clone().sub(restWorldPos[name]);

        // Delta rotation = animated * restInverse (RIGHT-SIDED)
        // This ensures dq.rotate(bindBoneVec) = Q_anim.rotate(localOffset)
        // which is required for correct FK positioning with bind-pose bone vectors.
        const dq = worldQuat.clone().multiply(restWorldQuat[name].clone().invert());

        const entry = {
          dq: [round4(dq.x), round4(dq.y), round4(dq.z), round4(dq.w)],
        };

        // Include delta position for root motion (Hips etc.)
        if (Math.abs(dp.x) > 0.0001 || Math.abs(dp.y) > 0.0001 || Math.abs(dp.z) > 0.0001) {
          entry.dp = [round4(dp.x), round4(dp.y), round4(dp.z)];
        }

        frame[name] = entry;
      }
      frames.push(frame);
    }

    // Cleanup
    mixer.stopAllAction();
    mixer.uncacheRoot(group);

    // Print samples
    console.log(`  Frame 0 Hips: ${JSON.stringify(frames[0].Hips)}`);
    const mid = Math.floor(totalFrames / 2);
    console.log(`  Frame ${mid} Hips: ${JSON.stringify(frames[mid].Hips)}`);
    console.log(`  Frame ${mid} Head: ${JSON.stringify(frames[mid].Head)}`);

    // Bind-pose world positions for FK bone vectors
    // The viewer needs these to compute correct bone directions
    const bindWorldPositions = {};
    for (const bone of allBones) {
      const name = cleanBoneName(bone.name);
      if (!outputBones.includes(name)) continue;
      const wp = restWorldPos[name];
      bindWorldPositions[name] = [round4(wp.x), round4(wp.y), round4(wp.z)];
    }

    results.push({
      name: clip.name || path.basename(inputPath, '.fbx'),
      label: path.basename(inputPath, '.fbx'),
      duration: clip.duration,
      fps: targetFps,
      frameCount: frames.length,
      fbxBodyHeight,
      hierarchy,
      outputBones,
      bindWorldPositions,
      frames,
    });
  }

  const output = results.length === 1 ? results[0] : results;
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
  const stat = fs.statSync(outputPath);
  console.log(`File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
}

// ── CLI ──
const args = process.argv.slice(2);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputFile = args[0] || path.join(__dirname, '..', 'public', 'models', 'character-motion', 'Hip Hop Dancing.fbx');
const defaultOutput = inputFile.replace(/\.fbx$/i, '.motion.json');
const outputFile = args[1] || defaultOutput;

convertFBX(path.resolve(inputFile), path.resolve(outputFile));
