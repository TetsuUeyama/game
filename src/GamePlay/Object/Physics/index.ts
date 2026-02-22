export { PhysicsManager } from "@/GamePlay/Object/Physics/PhysicsManager";
export type { PhysicsConfig, PhysicsBodyOptions, CollisionEvent } from "@/GamePlay/Object/Physics/PhysicsManager";
export {
  PhysicsConstants,
  ShootAngles,
  getOptimalShootAngle,
  degreesToRadians,
  radiansToDegrees,
} from "@/GamePlay/Object/Physics/PhysicsConfig";
export * from "@/GamePlay/Object/Physics/Trajectory";
export * from "@/GamePlay/Object/Physics/Spatial";
export {
  BALANCE_PHYSICS,
  BALANCE_SPHERE,
  BALANCE_SPRING,
  BALANCE_DAMPING,
  BALANCE_THRESHOLD,
  BALANCE_COLLISION,
  BALANCE_LIMITS,
  ACTION_FORCES,
  ACTION_TYPE_FORCES,
  CONTACT_PLAY,
  MOVEMENT_BALANCE,
  calculatePlayerPhysics,
  calculateAgility,
  calculateStability,
  calculatePushPower,
  calculateSpringDamperForce,
  integrateMotion,
  clampPosition,
  calculateCollision,
  canTransition,
  isNeutral,
  estimateRecoveryTime,
  getHorizontalOffset,
  getWeightForceFactor,
  type ActionForceConfig,
  type BalanceSphereState,
  type PlayerPhysicsParams,
  type CollisionResult,
} from "@/SimulationPlay/MarbleSimulation/Balance";
export * from "@/GamePlay/Object/Physics/Collision";
