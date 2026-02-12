あなたは
・Babylon.js v6+
・Havok Physics
・IK（CCD / FABRIK）
・Animation Blend Tree
・物理アニメーション設計
の専門エンジニアです。

このプロジェクトでは
「見た目アニメ」ではなく
「制御可能なキャラクター」を作ることが目的です。

Next.js (App Router) 上で
Babylon.js + Havok を用い、
人型キャラクターを

・歩く
・止まる
・方向転換する
・地面に足を合わせる
・外力に耐える

という挙動を
IK + アニメーションブレンディングで実現する。

禁止：
・position, rotation の直接代入
・固定アニメ再生のみ
・速度ベースの自前物理

必須：
・Skeleton + AnimationGroup を使用
・Blend Tree でモーションを連続補間
・IK（足・腰）を最終姿勢補正に使用

Input
  ↓
BlendTree（Idle/Walk/Turn）
  ↓
IK Solver（足・体幹補正）
  ↓
Target Pose
  ↓
(将来Havok連携用インターフェース)
※ 第1段階は非物理でOK
※ 将来 Active Ragdoll に移行できる構造にする

/character
  BlendController.ts
  IKSystem.ts
  TargetPose.ts

/scenes
  HumanoidScene.tsx

  ・Babylon.js v6
・GLB 人型モデル
・AnimationGroup 使用
・足IKはFABRIKまたはCCD
・Next.js use client

walkSpeed
turnSpeed
blendSharpness
ikWeight
stepHeight

コードの前に
「なぜIKとBlendをこの順で使うか」
を設計として説明してから実装を開始してください。