import {
  Scene,
  Vector3,
  Color3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMaterialCombineMode,
  Mesh,
} from "@babylonjs/core";
import { Camera } from "@/GamePlay/Object/Entities/Camera";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { DEFAULT_CHARACTER_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterStats";
import {
  predictTrajectoryPoints,
  predictLandingPoint as predictLandingPointCalc,
} from "@/GamePlay/Object/Physics/Trajectory/SimpleTrajectoryPredictor";

// ========== 定数 ==========

const BALL = {
  RADIUS: 0.12, MASS: 0.62, RESTITUTION: 0.83, FRICTION: 0.6,
  LINEAR_DAMPING: 0.05, ANGULAR_DAMPING: 0.1,
};
const RIM = {
  DIAMETER: 0.45, THICKNESS: 0.02, HEIGHT: 3.05,
  RESTITUTION: 0.85, FRICTION: 0.01, COLOR: "#FF6600",
};
const BACKBOARD = {
  WIDTH: 1.8, HEIGHT: 1.05, DEPTH: 0.05, RIM_OFFSET: 0.4,
  RESTITUTION: 0.6, FRICTION: 0.3,
};

const GRAVITY = -9.81;
const GROUND_Y = 0;

const FIELDER_HEIGHT = 1.8;
const FIELDER_GROUND_Y = FIELDER_HEIGHT / 2; // 0.9（Character root mesh は体の中心）
const FIELDER_SPEED = 5.0;
const RESET_DELAY_MS = 1500;

const JUMP_MAX_HEIGHT = 1.2;
const FIELDER_REACH_UP = 1.2; // 肩高 + 腕の長さ分

const CONTEST_DISTANCE = 1.2;

const TRAJECTORY_TIME_STEP = 0.02;
const TRAJECTORY_MAX_TIME = 3.0;
const REBOUND_VELOCITY_THRESHOLD = 1.5;

// 腕アクション
const PUSH_FORCE = 3.0; // プッシュ時の押し出し速度
const PUSH_RANGE = 0.7; // プッシュの有効距離
const HOLD_DOWN_RANGE = 0.6; // 抑え込みの有効距離
const HOLD_DOWN_JUMP_PENALTY = 0.7; // 抑え込まれたときジャンプ力の減衰率

// ========== フェーズ ==========

const enum BallPhase { PRE_REBOUND, POST_REBOUND }

// ========== 腕の状態 ==========

const enum ArmAction {
  IDLE,       // 体の横に下げている
  REACH_BALL, // ボールに向かって伸ばす
  PUSH,       // 相手を押す
  HOLD_DOWN,  // 相手を抑え込む（ジャンプ抑制）
}

// ========== フィールダー ==========

// 手によるキャッチ判定距離（腕先端とボール中心）
const HAND_CATCH_RADIUS = 0.25;
// 腕を上げ始めるボールまでの距離
const ARM_REACH_ANTICIPATION = 2.5;

interface FielderState {
  character: Character;
  interceptMarker: Mesh;
  initialPos: Vector3;
  color: Color3;
  jumping: boolean;
  jumpVelocityY: number;
  armAction: ArmAction;
  heldDown: boolean;
  pushCooldown: number;
}

function createFielderState(
  scene: Scene, name: string, color: Color3, initialPos: Vector3
): FielderState {
  const character = new Character(scene, initialPos, DEFAULT_CHARACTER_CONFIG);
  character.setBodyColor(color.r, color.g, color.b);

  // 不要な視覚要素を非表示
  character.getStateIndicator().isVisible = false;
  character.getVisionCone().isVisible = false;

  const marker = MeshBuilder.CreateSphere(
    `${name}Intercept`, { diameter: 0.15, segments: 8 }, scene
  );
  const markerMat = new StandardMaterial(`${name}InterceptMat`, scene);
  markerMat.diffuseColor = color.scale(1.5);
  markerMat.emissiveColor = color.scale(0.8);
  markerMat.alpha = 0.7;
  marker.material = markerMat;
  marker.isVisible = false;

  return {
    character, interceptMarker: marker,
    initialPos, color,
    jumping: false, jumpVelocityY: 0,
    armAction: ArmAction.IDLE,
    heldDown: false, pushCooldown: 0,
  };
}

function resetFielder(f: FielderState) {
  f.character.mesh.position.copyFrom(f.initialPos);
  f.jumping = false;
  f.jumpVelocityY = 0;
  f.armAction = ArmAction.IDLE;
  f.heldDown = false;
  f.pushCooldown = 0;
  f.interceptMarker.isVisible = false;

  // インターセプトマーカーの色をリセット
  const markerMat = f.interceptMarker.material as StandardMaterial;
  markerMat.diffuseColor = f.color.scale(1.5);
  markerMat.emissiveColor = f.color.scale(0.8);

  // 肩・肘の回転をリセット
  const joints = ["leftShoulder", "rightShoulder", "leftElbow", "rightElbow"];
  for (const name of joints) {
    const joint = f.character.getJoint(name);
    if (joint) joint.rotation.set(0, 0, 0);
  }
}

// ========== 腕の描画更新 ==========

// 肩のメッシュ中心から体中心までのY方向オフセット（概算）
const SHOULDER_Y_OFFSET = 0.6;

function updateArmVisuals(
  f: FielderState, opponentPos: Vector3, ballPos: Vector3
) {
  const bodyPos = f.character.mesh.position;

  // 相手方向を向く
  const toOpp = new Vector3(opponentPos.x - bodyPos.x, 0, opponentPos.z - bodyPos.z);
  if (toOpp.length() > 0.001) {
    const yawToOpponent = Math.atan2(toOpp.x, toOpp.z);
    f.character.setRotationImmediate(yawToOpponent);
  }

  const leftShoulder = f.character.getJoint("leftShoulder");
  const rightShoulder = f.character.getJoint("rightShoulder");
  const leftElbow = f.character.getJoint("leftElbow");
  const rightElbow = f.character.getJoint("rightElbow");
  if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow) return;

  switch (f.armAction) {
    case ArmAction.IDLE: {
      // 腕を下げた状態
      leftShoulder.rotation.set(0, 0, 0);
      rightShoulder.rotation.set(0, 0, 0);
      leftElbow.rotation.set(0, 0, 0);
      rightElbow.rotation.set(0, 0, 0);
      break;
    }
    case ArmAction.REACH_BALL: {
      // ボール方向への肩回転（ピッチ計算）+ 肘ストレート
      const shoulderWorldY = bodyPos.y + SHOULDER_Y_OFFSET;
      const toBall = ballPos.subtract(new Vector3(bodyPos.x, shoulderWorldY, bodyPos.z));
      const hDist = Math.sqrt(toBall.x * toBall.x + toBall.z * toBall.z);
      const elevation = Math.atan2(toBall.y, hDist); // 水平からの仰角
      // 肩 rotation.x: 0=下垂, -PI/2=水平前方, -PI=真上
      const shoulderPitch = -(Math.PI / 2 + elevation);
      leftShoulder.rotation.set(shoulderPitch, 0, 0);
      rightShoulder.rotation.set(shoulderPitch, 0, 0);
      leftElbow.rotation.set(0, 0, 0);
      rightElbow.rotation.set(0, 0, 0);
      break;
    }
    case ArmAction.PUSH: {
      // 水平前方に腕を突き出す
      leftShoulder.rotation.set(-Math.PI / 2, 0, 0);
      rightShoulder.rotation.set(-Math.PI / 2, 0, 0);
      leftElbow.rotation.set(0, 0, 0);
      rightElbow.rotation.set(0, 0, 0);
      break;
    }
    case ArmAction.HOLD_DOWN: {
      // 斜め下方向に押さえ込む
      leftShoulder.rotation.set(-Math.PI / 3, 0, 0);
      rightShoulder.rotation.set(-Math.PI / 3, 0, 0);
      leftElbow.rotation.set(0, 0, 0);
      rightElbow.rotation.set(0, 0, 0);
      break;
    }
  }

  // 回転適用後、手の位置を確定させるためワールドマトリクスを更新
  f.character.mesh.computeWorldMatrix(true);
}

// ========== 腕アクションのAI決定 ==========

function decideArmAction(
  f: FielderState,
  opponent: FielderState,
  ballPos: Vector3,
  ballPhase: BallPhase
): ArmAction {
  const pos = f.character.mesh.position;
  const oppPos = opponent.character.mesh.position;

  // ボールとの距離
  const toBall = ballPos.subtract(pos);
  const ballDist = toBall.length();

  // 相手との水平距離
  const toOpp = new Vector3(oppPos.x - pos.x, 0, oppPos.z - pos.z);
  const oppDist = toOpp.length();

  // PRE_REBOUND: ポジショニング中は腕を使わない
  if (ballPhase === BallPhase.PRE_REBOUND) return ArmAction.IDLE;

  // クールダウン中は IDLE
  if (f.pushCooldown > 0) return ArmAction.IDLE;

  // (1) ボールが近づいてきている → 早めに REACH_BALL
  if (ballDist < ARM_REACH_ANTICIPATION && ballPos.y > GROUND_Y) {
    return ArmAction.REACH_BALL;
  }

  // 以下は相手が近い場合のみ
  if (oppDist > CONTEST_DISTANCE) return ArmAction.IDLE;

  // (2) 相手がジャンプしようとしている & 近い → HOLD_DOWN
  //     相手がまだ地面にいて、ボールが上にある場合
  if (
    !opponent.jumping &&
    oppDist < HOLD_DOWN_RANGE &&
    ballPos.y > FIELDER_GROUND_Y + FIELDER_REACH_UP
  ) {
    // 50%の確率で抑え込みを試みる（毎フレーム判定なので実質的に積極的）
    if (Math.random() < 0.05) return ArmAction.HOLD_DOWN;
  }

  // (3) 相手が自分よりボールに近い & 接近中 → PUSH
  const oppBallDist = ballPos.subtract(oppPos).length();
  if (oppDist < PUSH_RANGE && oppBallDist < ballDist) {
    return ArmAction.PUSH;
  }

  return ArmAction.IDLE;
}

// ========== 腕アクションの効果適用 ==========

function applyArmEffects(
  f: FielderState, opponent: FielderState, dt: number
) {
  const pos = f.character.mesh.position;
  const oppPos = opponent.character.mesh.position;
  const toOpp = new Vector3(oppPos.x - pos.x, 0, oppPos.z - pos.z);
  const oppDist = toOpp.length();

  // クールダウン減算
  if (f.pushCooldown > 0) f.pushCooldown -= dt;

  // 相手の heldDown をリセット（毎フレーム、自分が HOLD_DOWN でなければ解除）
  // ※ 相手側の処理で再設定されるので、ここでは自分が抑え込んでいるかだけチェック

  switch (f.armAction) {
    case ArmAction.PUSH: {
      if (oppDist < PUSH_RANGE && oppDist > 0.01) {
        const pushDir = toOpp.normalize().scaleInPlace(PUSH_FORCE * dt);
        oppPos.addInPlace(pushDir);
        f.pushCooldown = 0.5; // プッシュ後 0.5秒クールダウン
        f.armAction = ArmAction.IDLE; // 単発
      }
      break;
    }
    case ArmAction.HOLD_DOWN: {
      if (oppDist < HOLD_DOWN_RANGE) {
        opponent.heldDown = true;
      }
      break;
    }
    default:
      break;
  }
}

// ========== ゴール ==========

function createBasketballGoal(scene: Scene) {
  const goalZ = 0;
  const backboard = MeshBuilder.CreateBox("backboard",
    { width: BACKBOARD.WIDTH, height: BACKBOARD.HEIGHT, depth: BACKBOARD.DEPTH }, scene);
  backboard.position = new Vector3(0, RIM.HEIGHT + BACKBOARD.HEIGHT / 2, goalZ);
  const bbMat = new StandardMaterial("backboardMat", scene);
  bbMat.diffuseColor = new Color3(0.3, 0.5, 1);
  bbMat.emissiveColor = new Color3(0.05, 0.1, 0.3);
  bbMat.alpha = 0.6;
  backboard.material = bbMat;
  new PhysicsAggregate(backboard, PhysicsShapeType.BOX,
    { mass: 0, restitution: BACKBOARD.RESTITUTION, friction: BACKBOARD.FRICTION }, scene);

  const rim = MeshBuilder.CreateTorus("rim",
    { diameter: RIM.DIAMETER, thickness: RIM.THICKNESS, tessellation: 32 }, scene);
  rim.position = new Vector3(0, RIM.HEIGHT, goalZ - BACKBOARD.RIM_OFFSET);
  const rMat = new StandardMaterial("rimMat", scene);
  rMat.diffuseColor = Color3.FromHexString(RIM.COLOR);
  rMat.emissiveColor = Color3.FromHexString(RIM.COLOR).scale(0.3);
  rim.material = rMat;
  const rp = new PhysicsAggregate(rim, PhysicsShapeType.MESH,
    { mass: 0, restitution: RIM.RESTITUTION, friction: RIM.FRICTION }, scene);
  rp.shape.material = {
    restitution: RIM.RESTITUTION, restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    friction: RIM.FRICTION, frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
  };
}

// ========== ボール ==========

function createBall(scene: Scene, position: Vector3) {
  const sphere = MeshBuilder.CreateSphere("ball",
    { diameter: BALL.RADIUS * 2, segments: 16 }, scene);
  sphere.position = position;
  const mat = new StandardMaterial("ballMat", scene);
  mat.diffuseColor = new Color3(0.9, 0.4, 0.1);
  sphere.material = mat;
  const bp = new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE,
    { mass: BALL.MASS, restitution: BALL.RESTITUTION, friction: BALL.FRICTION }, scene);
  bp.body.setLinearDamping(BALL.LINEAR_DAMPING);
  bp.body.setAngularDamping(BALL.ANGULAR_DAMPING);
  return { mesh: sphere, physics: bp };
}

// ========== 軌道予測 ==========

interface TrajectoryPoint { position: Vector3; time: number; }

function predictTrajectory(bp: PhysicsAggregate): TrajectoryPoint[] {
  const pos = bp.transformNode.position;
  const vel = bp.body.getLinearVelocity();
  const rawPoints = predictTrajectoryPoints(
    pos, vel, GRAVITY, TRAJECTORY_TIME_STEP, TRAJECTORY_MAX_TIME, GROUND_Y + BALL.RADIUS
  );
  return rawPoints.map(p => ({
    position: new Vector3(p.x, p.y, p.z),
    time: p.time,
  }));
}

function predictLandingPoint(bp: PhysicsAggregate): Vector3 | null {
  const pos = bp.transformNode.position;
  const vel = bp.body.getLinearVelocity();
  if (pos.y - GROUND_Y <= BALL.RADIUS) return null;
  const result = predictLandingPointCalc(pos, vel, GRAVITY, GROUND_Y);
  return result ? new Vector3(result.x, result.y, result.z) : null;
}

// ========== インターセプト ==========

interface InterceptResult {
  point: Vector3; time: number; needsJump: boolean; jumpTargetY: number;
}

function findMoveOnlyIntercept(traj: TrajectoryPoint[], fPos: Vector3): InterceptResult | null {
  const standY = FIELDER_GROUND_Y + FIELDER_REACH_UP;
  let best: InterceptResult | null = null;
  for (const tp of traj) {
    if (tp.position.y > standY || tp.position.y < GROUND_Y) continue;
    const dx = tp.position.x - fPos.x, dz = tp.position.z - fPos.z;
    if (Math.sqrt(dx * dx + dz * dz) / FIELDER_SPEED > tp.time + 0.1) continue;
    if (!best || tp.time < best.time)
      best = { point: tp.position.clone(), time: tp.time, needsJump: false, jumpTargetY: FIELDER_GROUND_Y };
  }
  return best;
}

function findJumpIntercept(traj: TrajectoryPoint[], fPos: Vector3): InterceptResult | null {
  const standY = FIELDER_GROUND_Y + FIELDER_REACH_UP;
  const maxY = FIELDER_GROUND_Y + JUMP_MAX_HEIGHT + FIELDER_REACH_UP;
  let best: InterceptResult | null = null;
  for (const tp of traj) {
    if (tp.position.y <= standY || tp.position.y > maxY || tp.position.y < GROUND_Y) continue;
    const dx = tp.position.x - fPos.x, dz = tp.position.z - fPos.z;
    const moveT = Math.sqrt(dx * dx + dz * dz) / FIELDER_SPEED;
    const jumpT = Math.sqrt(2 * (tp.position.y - standY) / Math.abs(GRAVITY));
    if (Math.max(moveT, jumpT) > tp.time + 0.15) continue;
    if (!best || tp.time < best.time)
      best = { point: tp.position.clone(), time: tp.time, needsJump: true, jumpTargetY: tp.position.y - FIELDER_REACH_UP };
  }
  return best;
}

// ========== フィールダー更新 ==========

function updateFielderJump(f: FielderState, dt: number) {
  if (!f.jumping) return;
  f.jumpVelocityY += GRAVITY * dt;
  f.character.mesh.position.y += f.jumpVelocityY * dt;
  if (f.character.mesh.position.y <= FIELDER_GROUND_Y) {
    f.character.mesh.position.y = FIELDER_GROUND_Y;
    f.jumping = false;
    f.jumpVelocityY = 0;
  }
}

/** 手先がボールに触れているか（REACH_BALL 時のみ有効） */
function handTouchingBall(f: FielderState, ballPos: Vector3): boolean {
  if (f.armAction !== ArmAction.REACH_BALL) return false;
  const dL = Vector3.Distance(f.character.getLeftHandPosition(), ballPos);
  const dR = Vector3.Distance(f.character.getRightHandPosition(), ballPos);
  return Math.min(dL, dR) < HAND_CATCH_RADIUS;
}

/** 体の貫通を防止する剛体衝突（水平＋垂直） */
function applyBodyCollision(a: FielderState, b: FielderState) {
  const aPos = a.character.mesh.position;
  const bPos = b.character.mesh.position;

  // --- 水平方向の分離 ---
  const dx = aPos.x - bPos.x;
  const dz = aPos.z - bPos.z;
  const horizDist = Math.sqrt(dx * dx + dz * dz);
  const minHorizGap = 0.7; // Character の体幅 + マージン

  if (horizDist < minHorizGap && horizDist > 0.001) {
    const overlap = minHorizGap - horizDist;
    const nx = dx / horizDist;
    const nz = dz / horizDist;
    const halfPush = overlap / 2 + 0.01; // 少し余分に押して再侵入防止
    aPos.x += nx * halfPush;
    aPos.z += nz * halfPush;
    bPos.x -= nx * halfPush;
    bPos.z -= nz * halfPush;
  }

  // --- 垂直方向の分離（ジャンプ中に重なった場合） ---
  const dy = Math.abs(aPos.y - bPos.y);
  const minVertGap = FIELDER_HEIGHT * 0.8;
  if (horizDist < minHorizGap && dy < minVertGap && dy > 0.01) {
    const vertOverlap = minVertGap - dy;
    if (aPos.y > bPos.y) {
      aPos.y += vertOverlap / 2;
      bPos.y -= vertOverlap / 2;
    } else {
      bPos.y += vertOverlap / 2;
      aPos.y -= vertOverlap / 2;
    }
    if (aPos.y < FIELDER_GROUND_Y) aPos.y = FIELDER_GROUND_Y;
    if (bPos.y < FIELDER_GROUND_Y) bPos.y = FIELDER_GROUND_Y;
  }
}

function updateFielderMovement(
  f: FielderState, dt: number, ballPhase: BallPhase,
  trajectory: TrajectoryPoint[], landing: Vector3 | null,
  opponentPos: Vector3, ballPos: Vector3,
) {
  const pos = f.character.mesh.position;

  if (ballPhase === BallPhase.PRE_REBOUND) {
    f.interceptMarker.isVisible = false;
    if (!landing) return;
    const dir = new Vector3(landing.x - pos.x, 0, landing.z - pos.z);
    const dist = dir.length();
    if (dist > 0.05) {
      const step = Math.min(FIELDER_SPEED * dt, dist);
      dir.normalize().scaleInPlace(step);
      pos.addInPlace(dir);
    }
    return;
  }

  const toOpp = new Vector3(opponentPos.x - pos.x, 0, opponentPos.z - pos.z);
  const oppDist = toOpp.length();
  const isContested = oppDist < CONTEST_DISTANCE;

  const moveIntercept = findMoveOnlyIntercept(trajectory, pos);
  const jumpIntercept = findJumpIntercept(trajectory, pos);

  const activeIntercept = isContested
    ? (jumpIntercept && (!moveIntercept || jumpIntercept.time < moveIntercept.time)
        ? jumpIntercept : moveIntercept || jumpIntercept)
    : (moveIntercept || jumpIntercept);

  if (activeIntercept) {
    f.interceptMarker.isVisible = true;
    f.interceptMarker.position.copyFrom(activeIntercept.point);
  } else {
    f.interceptMarker.isVisible = false;
  }

  const target = activeIntercept
    ? new Vector3(activeIntercept.point.x, 0, activeIntercept.point.z)
    : landing ? new Vector3(landing.x, 0, landing.z) : null;
  if (!target) return;

  const direction = new Vector3(target.x - pos.x, 0, target.z - pos.z);
  const horizontalDist = direction.length();
  if (horizontalDist > 0.05) {
    const step = Math.min(FIELDER_SPEED * dt, horizontalDist);
    direction.normalize().scaleInPlace(step);
    pos.addInPlace(direction);
  }

  // ジャンプ判定
  const onGround = !f.jumping && pos.y <= FIELDER_GROUND_Y + 0.01;
  if (!onGround) return;

  // 抑え込まれている場合: ジャンプ力減衰
  const jumpMultiplier = f.heldDown ? HOLD_DOWN_JUMP_PENALTY : 1.0;

  // (A) 競り合いジャンプ
  if (isContested && horizontalDist < 0.5) {
    const bDx = ballPos.x - pos.x, bDz = ballPos.z - pos.z;
    const bHDist = Math.sqrt(bDx * bDx + bDz * bDz);
    const standReachY = FIELDER_GROUND_Y + FIELDER_REACH_UP;
    const maxReachY = FIELDER_GROUND_Y + JUMP_MAX_HEIGHT + FIELDER_REACH_UP;
    if (bHDist < 1.0 && ballPos.y > standReachY && ballPos.y < maxReachY + 1.0) {
      f.jumping = true;
      f.jumpVelocityY = Math.sqrt(2 * Math.abs(GRAVITY) * JUMP_MAX_HEIGHT) * jumpMultiplier;
      return;
    }
  }

  // (B) 通常ジャンプ
  const needsJump = activeIntercept?.needsJump ? activeIntercept : null;
  if (needsJump && horizontalDist < 0.3 && needsJump.time < 0.6) {
    f.jumping = true;
    const h = Math.min(Math.max(needsJump.jumpTargetY - FIELDER_GROUND_Y, 0), JUMP_MAX_HEIGHT);
    f.jumpVelocityY = Math.sqrt(2 * Math.abs(GRAVITY) * h) * jumpMultiplier;
  }
}

// ========== UI ==========

function createPredictionMarker(scene: Scene): Mesh {
  const m = MeshBuilder.CreateCylinder("predMarker",
    { diameter: BALL.RADIUS * 4, height: 0.02 }, scene);
  m.position.y = 0.01;
  const mat = new StandardMaterial("predMarkerMat", scene);
  mat.diffuseColor = new Color3(1, 0, 0);
  mat.emissiveColor = new Color3(1, 0, 0);
  mat.alpha = 0.6;
  m.material = mat;
  m.isVisible = false;
  return m;
}

// ========== ボールリセット ==========

function randomBallStartPosition(): Vector3 {
  return new Vector3(
    RIM.DIAMETER / 2 + (Math.random() - 0.5) * RIM.DIAMETER,
    RIM.HEIGHT + 2,
    -BACKBOARD.RIM_OFFSET + (Math.random() - 0.5) * 0.3
  );
}

function resetBall(bp: PhysicsAggregate) {
  bp.body.setLinearVelocity(Vector3.Zero());
  bp.body.setAngularVelocity(Vector3.Zero());
  bp.transformNode.position.copyFrom(randomBallStartPosition());
  bp.body.disablePreStep = false;
}

// ========== メインシーン ==========

export async function createPhysicsScene(engine: Engine): Promise<Scene> {
  const scene = new Scene(engine);
  const hk = await HavokPhysics();
  scene.enablePhysics(new Vector3(0, GRAVITY, 0), new HavokPlugin(true, hk));

  Camera.createFallingPointCamera(scene, engine.getRenderingCanvas()!);
  new HemisphericLight("light", new Vector3(0, 1, 0), scene);

  const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
  const gMat = new StandardMaterial("groundMat", scene);
  gMat.diffuseColor = new Color3(0.4, 0.6, 0.4);
  ground.material = gMat;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

  createBasketballGoal(scene);
  const ball = createBall(scene,
    new Vector3(RIM.DIAMETER / 2, RIM.HEIGHT + 2, -BACKBOARD.RIM_OFFSET));
  const predMarker = createPredictionMarker(scene);

  const fA = createFielderState(scene, "fA", new Color3(0.2, 0.6, 1),
    new Vector3(-1.0, FIELDER_GROUND_Y, -BACKBOARD.RIM_OFFSET - 0.8));
  const fB = createFielderState(scene, "fB", new Color3(1, 0.2, 0.2),
    new Vector3(1.0, FIELDER_GROUND_Y, -BACKBOARD.RIM_OFFSET - 0.8));

  let resetting = false;
  let ballPhase: BallPhase = BallPhase.PRE_REBOUND;
  let prevBallVel = Vector3.Zero();

  scene.onBeforeRenderObservable.add(() => {
    if (resetting) return;
    const dt = engine.getDeltaTime() / 1000;
    const ballPos = ball.mesh.position;
    const ballVel = ball.physics.body.getLinearVelocity();

    // リバウンド検出
    if (ballPhase === BallPhase.PRE_REBOUND) {
      if (ballVel.subtract(prevBallVel).length() > REBOUND_VELOCITY_THRESHOLD
          && ballPos.y < RIM.HEIGHT + 0.5) {
        ballPhase = BallPhase.POST_REBOUND;
      }
    }
    prevBallVel = ballVel.clone();

    // heldDown を毎フレームリセット（この後のアクション適用で再設定される）
    fA.heldDown = false;
    fB.heldDown = false;

    // ジャンプ物理
    updateFielderJump(fA, dt);
    updateFielderJump(fB, dt);

    // 腕アクション決定
    fA.armAction = decideArmAction(fA, fB, ballPos, ballPhase);
    fB.armAction = decideArmAction(fB, fA, ballPos, ballPhase);

    // 腕アクション効果適用
    applyArmEffects(fA, fB, dt);
    applyArmEffects(fB, fA, dt);

    // 腕の見た目更新（手先位置を計算するため、判定より先に実行）
    updateArmVisuals(fA, fB.character.mesh.position, ballPos);
    updateArmVisuals(fB, fA.character.mesh.position, ballPos);

    // 取得判定（手先がボールに触れた時のみ）
    const aTouching = handTouchingBall(fA, ballPos);
    const bTouching = handTouchingBall(fB, ballPos);

    if (aTouching && bTouching) {
      // ===== ファンブル: 同時タッチ → ボールが弾かれる =====
      const fumbleDir = new Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 3 + 2,
        (Math.random() - 0.5) * 2
      );
      ball.physics.body.setLinearVelocity(fumbleDir);
      // 両者の腕を一瞬 IDLE にしてクールダウン
      fA.armAction = ArmAction.IDLE;
      fB.armAction = ArmAction.IDLE;
      fA.pushCooldown = 0.3;
      fB.pushCooldown = 0.3;
    } else if (aTouching || bTouching) {
      // ===== 片方だけ触れた → キャッチ成功 =====
      const catcher = aTouching ? fA : fB;
      resetting = true;
      ball.mesh.isVisible = false;
      ball.physics.body.setLinearVelocity(Vector3.Zero());
      ball.physics.body.setAngularVelocity(Vector3.Zero());
      predMarker.isVisible = false;
      // キャッチ成功の発光エフェクト: intercept marker を緑に変えて表示
      const markerMat = catcher.interceptMarker.material as StandardMaterial;
      markerMat.diffuseColor = new Color3(0.5, 1, 0.5);
      markerMat.emissiveColor = new Color3(0.5, 1, 0.5);
      catcher.interceptMarker.position.copyFrom(catcher.character.mesh.position);
      catcher.interceptMarker.position.y += FIELDER_HEIGHT / 2 + 0.2;
      catcher.interceptMarker.isVisible = true;
      fA.interceptMarker.isVisible = false;
      fB.interceptMarker.isVisible = false;

      setTimeout(() => {
        ball.mesh.isVisible = true;
        resetBall(ball.physics);
        resetFielder(fA);
        resetFielder(fB);
        ballPhase = BallPhase.PRE_REBOUND;
        prevBallVel = Vector3.Zero();
        resetting = false;
      }, RESET_DELAY_MS);
      return;
    }

    // 軌道予測
    const trajectory = predictTrajectory(ball.physics);
    const landing = predictLandingPoint(ball.physics);
    if (landing) {
      predMarker.isVisible = true;
      predMarker.position.x = landing.x;
      predMarker.position.z = landing.z;
    } else {
      predMarker.isVisible = false;
    }

    // 移動
    updateFielderMovement(fA, dt, ballPhase, trajectory, landing, fB.character.mesh.position, ballPos);
    applyBodyCollision(fA, fB); // 移動直後に分離（片方ずつ）
    updateFielderMovement(fB, dt, ballPhase, trajectory, landing, fA.character.mesh.position, ballPos);
    applyBodyCollision(fA, fB); // 全移動後に再度分離（最終補正）
  });

  return scene;
}
