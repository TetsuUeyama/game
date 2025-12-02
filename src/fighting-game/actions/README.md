# Fighting Game Action System

このディレクトリには、戦闘ゲームの行動システムが含まれています。全ての戦闘行動（攻撃、移動、防御）は個別のファイルとして管理され、`ActionExecutor`を通じて実行されます。

## 📁 ディレクトリ構造

```
actions/
├── Action.ts                # 基底インターフェースと抽象クラス
├── ActionRegistry.ts        # 全アクションの登録
├── attacks/                 # 攻撃アクション
│   ├── LightAttacks.ts     # 弱攻撃（パンチ系）
│   ├── MediumAttacks.ts    # 中攻撃（キック系）
│   ├── HeavyAttacks.ts     # 強攻撃
│   ├── SpecialAttacks.ts   # 必殺技・超必殺技
│   └── index.ts
├── movement/                # 移動アクション
│   ├── WalkActions.ts      # 歩行
│   ├── DashActions.ts      # ダッシュ
│   ├── JumpActions.ts      # ジャンプ
│   └── index.ts
└── defense/                 # 防御アクション
    ├── GuardActions.ts     # ガード
    └── index.ts
```

## 🎯 基本的な使い方

### 1. FightSceneでの初期化

```typescript
import { ActionExecutor } from './systems/ActionExecutor';
import { registerAllActions } from './actions/ActionRegistry';

// シーンのcreate()メソッド内
this.actionExecutor = new ActionExecutor();
registerAllActions(this.actionExecutor);
```

### 2. アクションの実行

```typescript
import { ActionContext } from './actions/Action';

// アクションコンテキストを作成
const context: ActionContext = {
  fighter: this.player1,
  opponent: this.player2,
  scene: this,
  keys: this.inputSystem.getKeys()
};

// アクションを実行
const result = this.actionExecutor.execute('mediumMid', context);

if (result.success) {
  console.log('中段攻撃成功！');
} else {
  console.log('実行失敗:', result.reason);
}
```

### 3. 実行可能なアクションの取得

```typescript
// カテゴリ別に実行可能なアクションを取得（優先度順）
const availableAttacks = this.actionExecutor.getAvailableActions('attack', context);

// 最も優先度の高い攻撃を選択
if (availableAttacks.length > 0) {
  const bestAttack = availableAttacks[0];
  this.actionExecutor.execute(bestAttack.name, context);
}
```

## ✨ 新しいアクションの追加

### ステップ1: アクションクラスを作成

```typescript
// src/fighting-game/actions/attacks/MyCustomAttack.ts
import { BaseAction, ActionContext, ActionResult, ActionCost } from '../Action';

export class MyCustomAttack extends BaseAction {
  readonly name = 'myCustomAttack';
  readonly category = 'attack' as const;

  canExecute(context: ActionContext): boolean {
    const { fighter } = context;

    if (!this.basicCanExecute(context)) return false;
    if (fighter.isAttacking) return false;

    // カスタム条件
    if (fighter.specialMeter < 50) return false;

    return true;
  }

  execute(context: ActionContext): ActionResult {
    const { fighter } = context;

    // アクション実行ロジック
    fighter.performAttack('customAttackType');

    return {
      success: true,
      cooldown: this.getCooldown()
    };
  }

  getCost(context: ActionContext): ActionCost {
    return {
      specialMeter: 50
    };
  }

  getCooldown(): number {
    return 2000; // 2秒
  }

  getPriority(context: ActionContext): number {
    return 5; // 優先度
  }
}
```

### ステップ2: ActionRegistryに登録

```typescript
// src/fighting-game/actions/ActionRegistry.ts
import { MyCustomAttack } from './attacks/MyCustomAttack';

export function registerAllActions(executor: ActionExecutor): void {
  // ... 既存の登録 ...

  // 新しいアクションを追加
  executor.register(new MyCustomAttack());
}
```

## 📊 アクションの優先度システム

各アクションは`getPriority()`メソッドで優先度を返します。AIがアクションを選択する際、この優先度が高いほど選ばれやすくなります。

```typescript
getPriority(context: ActionContext): number {
  const { fighter, opponent } = context;
  const distance = Math.abs(fighter.x - opponent.x);
  const healthPercent = fighter.health / fighter.maxHealth;

  // 状況に応じて優先度を動的に変更
  if (healthPercent < 0.3 && distance < 100) {
    return 8; // 体力が少なく近距離なら高優先度
  }

  return 3; // 通常時
}
```

## 🔒 コスト管理

アクションは以下のコストを設定できます：

- `stamina`: スタミナコスト
- `specialMeter`: 必殺技ゲージコスト
- `guardStamina`: ガードスタミナコスト

```typescript
getCost(context: ActionContext): ActionCost {
  return {
    stamina: 15,
    specialMeter: 30
  };
}
```

`ActionExecutor`は自動的にコストをチェックし、不足している場合は実行を拒否します。

## ⏱️ クールダウンシステム

各アクションはクールダウン時間を設定できます。同じアクションを連続実行できないようにします。

```typescript
getCooldown(): number {
  return 1500; // 1.5秒
}
```

## 🎮 利用可能なアクション一覧

### 攻撃アクション
- `lightHigh`, `lightMid`, `lightLow` - 弱攻撃
- `mediumHigh`, `mediumMid`, `mediumLow` - 中攻撃
- `heavyHigh`, `heavyMid`, `heavyLow` - 強攻撃
- `specialHighMid`, `specialMidLow` - 必殺技
- `superSpecial` - 超必殺技

### 移動アクション
- `walkForward`, `walkBackward` - 歩行
- `forwardDash`, `backwardDash` - ダッシュ
- `smallVerticalJump` - 小ジャンプ（垂直）
- `mediumForwardJump` - 中ジャンプ（前方）
- `largeForwardJump` - 大ジャンプ（前方）
- `backwardJump` - 後方ジャンプ

### 防御アクション
- `highGuard`, `midGuard`, `lowGuard` - 単一ガード
- `highMidGuard`, `midLowGuard` - 複合ガード
- `allGuard` - 全面ガード

## 🧪 デバッグ

```typescript
// 登録されているアクション名を確認
console.log(this.actionExecutor.getRegisteredActionNames());

// 特定のアクションが実行可能かチェック
const canExecute = this.actionExecutor.canExecute('mediumMid', context);
console.log('mediumMid can execute:', canExecute);

// クールダウン状態を確認
const isOnCooldown = this.actionExecutor.isOnCooldown(1, 'mediumMid');
console.log('mediumMid is on cooldown:', isOnCooldown);
```

## 🏗️ 設計パターン

このアクションシステムは以下のデザインパターンを使用しています：

- **Command Pattern**: 各アクションは独立したコマンドオブジェクト
- **Strategy Pattern**: `getPriority()`で状況に応じた戦略を選択
- **Registry Pattern**: `ActionExecutor`が全アクションを管理
- **Template Method Pattern**: `BaseAction`が共通処理を提供

## 📝 利点

1. **保守性**: 各アクションが独立したファイルで管理され、変更が容易
2. **拡張性**: 新しいアクションを追加しても既存コードに影響なし
3. **再利用性**: 同じアクションを異なるキャラクターやAIで再利用可能
4. **テスト性**: 各アクションを個別に単体テスト可能
5. **可読性**: アクションの役割と責任が明確
