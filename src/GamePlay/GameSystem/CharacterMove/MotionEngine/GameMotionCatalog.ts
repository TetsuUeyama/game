/**
 * 全ゲームモーションを MotionDefinition として一覧提供するカタログ。
 * MotionDataConverter を使い、ゲーム形式 → Viewer形式に変換。
 */
import { motionDataToDefinition } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDataConverter";
import { MotionDefinition } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";

// --- Basic ---
import { IDLE_MOTION as GAME_IDLE } from "@/GamePlay/GameSystem/CharacterMove/Motion/IdleMotion";
import { CROUCH_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/CrouchMotion";

// --- Walk ---
import {
  WALK_FORWARD_MOTION,
  WALK_BACKWARD_MOTION,
  WALK_LEFT_MOTION,
  WALK_RIGHT_MOTION,
  WALK_FORWARD_LEFT_MOTION,
  WALK_FORWARD_RIGHT_MOTION,
  WALK_BACKWARD_LEFT_MOTION,
  WALK_BACKWARD_RIGHT_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/WalkMotion";

// --- Dash ---
import {
  DASH_FORWARD_MOTION,
  DASH_BACKWARD_MOTION,
  DASH_LEFT_MOTION,
  DASH_RIGHT_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/DashMotion";

// --- Shoot ---
import {
  SHOOT_3PT_MOTION,
  SHOOT_MIDRANGE_MOTION,
  SHOOT_LAYUP_MOTION,
  SHOOT_DUNK_MOTION,
  SHOOT_FEINT_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/ShootMotion";

// --- Pass ---
import {
  PASS_CHEST_MOTION,
  PASS_BOUNCE_MOTION,
  PASS_OVERHEAD_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/PassMotion";

// --- Defense ---
import {
  BLOCK_SHOT_MOTION,
  STEAL_ATTEMPT_MOTION,
  PASS_INTERCEPT_MOTION,
  DEFENSE_STANCE_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/DefenseMotion";

// --- Jump ---
import {
  JUMP_MOTION,
  JUMP_BALL_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/JumpMotion";
import {
  LANDING_MOTION,
  LANDING_SMALL_MOTION,
  LANDING_LARGE_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/LandingMotion";

// --- Dribble ---
import {
  DRIBBLE_BREAKTHROUGH_MOTION,
  DRIBBLE_STANCE_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/DribbleMotion";

// --- Other ---
import {
  LOOSE_BALL_SCRAMBLE_MOTION,
  LOOSE_BALL_PICKUP_MOTION,
} from "@/GamePlay/GameSystem/CharacterMove/Motion/LooseBallMotion";
import { BALL_CATCH_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/BallCatchMotion";
import { DASH_STOP_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/DashStopMotion";

/** カタログエントリ */
export interface GameMotionEntry {
  name: string;
  motion: MotionDefinition;
}

/** 全ゲームモーション一覧（カテゴリ順） */
export const GAME_MOTIONS: GameMotionEntry[] = [
  // Basic
  { name: "game:idle", motion: motionDataToDefinition(GAME_IDLE) },
  { name: "game:crouch", motion: motionDataToDefinition(CROUCH_MOTION) },

  // Walk
  { name: "game:walk_forward", motion: motionDataToDefinition(WALK_FORWARD_MOTION) },
  { name: "game:walk_backward", motion: motionDataToDefinition(WALK_BACKWARD_MOTION) },
  { name: "game:walk_left", motion: motionDataToDefinition(WALK_LEFT_MOTION) },
  { name: "game:walk_right", motion: motionDataToDefinition(WALK_RIGHT_MOTION) },
  { name: "game:walk_forward_left", motion: motionDataToDefinition(WALK_FORWARD_LEFT_MOTION) },
  { name: "game:walk_forward_right", motion: motionDataToDefinition(WALK_FORWARD_RIGHT_MOTION) },
  { name: "game:walk_backward_left", motion: motionDataToDefinition(WALK_BACKWARD_LEFT_MOTION) },
  { name: "game:walk_backward_right", motion: motionDataToDefinition(WALK_BACKWARD_RIGHT_MOTION) },

  // Dash
  { name: "game:dash_forward", motion: motionDataToDefinition(DASH_FORWARD_MOTION) },
  { name: "game:dash_backward", motion: motionDataToDefinition(DASH_BACKWARD_MOTION) },
  { name: "game:dash_left", motion: motionDataToDefinition(DASH_LEFT_MOTION) },
  { name: "game:dash_right", motion: motionDataToDefinition(DASH_RIGHT_MOTION) },

  // Shoot
  { name: "game:shoot_3pt", motion: motionDataToDefinition(SHOOT_3PT_MOTION) },
  { name: "game:shoot_midrange", motion: motionDataToDefinition(SHOOT_MIDRANGE_MOTION) },
  { name: "game:shoot_layup", motion: motionDataToDefinition(SHOOT_LAYUP_MOTION) },
  { name: "game:shoot_dunk", motion: motionDataToDefinition(SHOOT_DUNK_MOTION) },
  { name: "game:shoot_feint", motion: motionDataToDefinition(SHOOT_FEINT_MOTION) },

  // Pass
  { name: "game:pass_chest", motion: motionDataToDefinition(PASS_CHEST_MOTION) },
  { name: "game:pass_bounce", motion: motionDataToDefinition(PASS_BOUNCE_MOTION) },
  { name: "game:pass_overhead", motion: motionDataToDefinition(PASS_OVERHEAD_MOTION) },

  // Defense
  { name: "game:block_shot", motion: motionDataToDefinition(BLOCK_SHOT_MOTION) },
  { name: "game:steal_attempt", motion: motionDataToDefinition(STEAL_ATTEMPT_MOTION) },
  { name: "game:pass_intercept", motion: motionDataToDefinition(PASS_INTERCEPT_MOTION) },
  { name: "game:defense_stance", motion: motionDataToDefinition(DEFENSE_STANCE_MOTION) },

  // Jump
  { name: "game:jump", motion: motionDataToDefinition(JUMP_MOTION) },
  { name: "game:jump_ball", motion: motionDataToDefinition(JUMP_BALL_MOTION) },
  { name: "game:landing", motion: motionDataToDefinition(LANDING_MOTION) },
  { name: "game:landing_small", motion: motionDataToDefinition(LANDING_SMALL_MOTION) },
  { name: "game:landing_large", motion: motionDataToDefinition(LANDING_LARGE_MOTION) },

  // Dribble
  { name: "game:dribble_breakthrough", motion: motionDataToDefinition(DRIBBLE_BREAKTHROUGH_MOTION) },
  { name: "game:dribble_stance", motion: motionDataToDefinition(DRIBBLE_STANCE_MOTION) },

  // Other
  { name: "game:loose_ball_scramble", motion: motionDataToDefinition(LOOSE_BALL_SCRAMBLE_MOTION) },
  { name: "game:loose_ball_pickup", motion: motionDataToDefinition(LOOSE_BALL_PICKUP_MOTION) },
  { name: "game:ball_catch", motion: motionDataToDefinition(BALL_CATCH_MOTION) },
  { name: "game:dash_stop", motion: motionDataToDefinition(DASH_STOP_MOTION) },
];
