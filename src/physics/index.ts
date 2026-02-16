export { PhysicsManager } from "./PhysicsManager";
export type { PhysicsConfig, PhysicsBodyOptions, CollisionEvent } from "./PhysicsManager";
export {
  PhysicsConstants,
  ShootAngles,
  getOptimalShootAngle,
  degreesToRadians,
  radiansToDegrees,
} from "./PhysicsConfig";
export * from "./trajectory";
export * from "./spatial";
// balance exports clamp() which conflicts with spatial's clamp(), so use namespace import
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
} from "./balance";
export * from "./collision";
