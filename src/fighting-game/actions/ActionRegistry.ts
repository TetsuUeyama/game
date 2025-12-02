/**
 * ActionRegistry - 全アクションの登録と管理
 */

import { ActionExecutor } from '../systems/ActionExecutor';
import {
  LightHighAttack,
  LightMidAttack,
  LightLowAttack,
  MediumHighAttack,
  MediumMidAttack,
  MediumLowAttack,
  HeavyHighAttack,
  HeavyMidAttack,
  HeavyLowAttack,
  SpecialHighMidAttack,
  SpecialMidLowAttack,
  SuperSpecialAttack
} from './attacks';

import {
  WalkForwardAction,
  WalkBackwardAction,
  ForwardDashAction,
  BackwardDashAction,
  SmallVerticalJump,
  MediumForwardJump,
  LargeForwardJump,
  BackwardJump
} from './movement';

import {
  HighGuardAction,
  MidGuardAction,
  LowGuardAction,
  HighMidGuardAction,
  MidLowGuardAction,
  AllGuardAction
} from './defense';

/**
 * 全アクションをActionExecutorに登録
 * @param executor ActionExecutorインスタンス
 */
export function registerAllActions(executor: ActionExecutor): void {
  // 攻撃アクション - 弱
  executor.register(new LightHighAttack());
  executor.register(new LightMidAttack());
  executor.register(new LightLowAttack());

  // 攻撃アクション - 中
  executor.register(new MediumHighAttack());
  executor.register(new MediumMidAttack());
  executor.register(new MediumLowAttack());

  // 攻撃アクション - 強
  executor.register(new HeavyHighAttack());
  executor.register(new HeavyMidAttack());
  executor.register(new HeavyLowAttack());

  // 攻撃アクション - 必殺技
  executor.register(new SpecialHighMidAttack());
  executor.register(new SpecialMidLowAttack());
  executor.register(new SuperSpecialAttack());

  // 移動アクション - 歩行
  executor.register(new WalkForwardAction());
  executor.register(new WalkBackwardAction());

  // 移動アクション - ダッシュ
  executor.register(new ForwardDashAction());
  executor.register(new BackwardDashAction());

  // 移動アクション - ジャンプ
  executor.register(new SmallVerticalJump());
  executor.register(new MediumForwardJump());
  executor.register(new LargeForwardJump());
  executor.register(new BackwardJump());

  // 防御アクション - ガード
  executor.register(new HighGuardAction());
  executor.register(new MidGuardAction());
  executor.register(new LowGuardAction());
  executor.register(new HighMidGuardAction());
  executor.register(new MidLowGuardAction());
  executor.register(new AllGuardAction());
}

/**
 * アクション名の定数
 */
export const ActionNames = {
  // 攻撃
  LIGHT_HIGH: 'lightHigh',
  LIGHT_MID: 'lightMid',
  LIGHT_LOW: 'lightLow',
  MEDIUM_HIGH: 'mediumHigh',
  MEDIUM_MID: 'mediumMid',
  MEDIUM_LOW: 'mediumLow',
  HEAVY_HIGH: 'heavyHigh',
  HEAVY_MID: 'heavyMid',
  HEAVY_LOW: 'heavyLow',
  SPECIAL_HIGH_MID: 'specialHighMid',
  SPECIAL_MID_LOW: 'specialMidLow',
  SUPER_SPECIAL: 'superSpecial',

  // 移動
  WALK_FORWARD: 'walkForward',
  WALK_BACKWARD: 'walkBackward',
  FORWARD_DASH: 'forwardDash',
  BACKWARD_DASH: 'backwardDash',
  SMALL_VERTICAL_JUMP: 'smallVerticalJump',
  MEDIUM_FORWARD_JUMP: 'mediumForwardJump',
  LARGE_FORWARD_JUMP: 'largeForwardJump',
  BACKWARD_JUMP: 'backwardJump',

  // 防御
  HIGH_GUARD: 'highGuard',
  MID_GUARD: 'midGuard',
  LOW_GUARD: 'lowGuard',
  HIGH_MID_GUARD: 'highMidGuard',
  MID_LOW_GUARD: 'midLowGuard',
  ALL_GUARD: 'allGuard'
} as const;

export type ActionName = typeof ActionNames[keyof typeof ActionNames];
