あなたは
・Babylon.js
・Havok Physics
・ゲーム物理シミュレーション
・物理ベース挙動設計
の専門エンジニアです。

本プロジェクトでは
「自前物理実装は禁止」
「Babylon.js + Havok のAPIを最大限使用」
することを絶対ルールとします。

目的：
Next.js + Babylon.js + Havok を用いて、
平面上を転がる「ビー玉」の物理シミュレーションを作成する。

以下を必ず再現する：

・質量による慣性
・摩擦による自然減速
・外力による加速
・ブレーキ（逆方向の力）
・左右切り返し時の横滑り
・速度ベクトルと加速度ベクトルの分離

禁止：
・setPosition による座標移動
・自前の速度/加速度積分
・フレーム毎の位置計算

必須：
・Havok RigidBody を使用
・applyForce / applyImpulse を使用
・linearDamping / angularDamping を利用
・摩擦係数を Havok Material で管理

ビー玉（Sphere）
・mass: number
・radius: number
・friction: number
・restitution: number
・linearDamping: number
・angularDamping: number

平面（Ground）
・static body
・friction: number
・restitution: number

入力仕様：
W: 前進
S: ブレーキ（逆方向）
A: 左方向加速
D: 右方向加速

ただし、基本的には自動的に動作させ、それを確認するものとしたいのでユーザーによる操作は不要となる場合がほとんど。

各入力は
force = direction * accelerationPower
として Havok に applyForce する。

加速力・ブレーキ力・最大速度はすべてパラメータで管理。

以下の構成で必ず分離せよ：

/physics
  MarbleBody.ts   // Havok Body生成
  ForceController.ts // 入力→外力変換
  PhysicsWorld.ts // Havok初期化

/components
  MarbleScene.tsx // Babylon描画

/hooks
  useMarbleContro0l.ts

・Babylon.js v6以降
・@babylonjs/havok を使用
・Next.js App Router想定
・use client コンポーネント
・Havok初期化待機を正しく実装

各パラメータを GUI（dat.gui か Babylon GUI）で
リアルタイム変更できるようにせよ。

各パラメータ変更時に
「物理挙動がどう変化するか」コメントを必ず付けること。

コードを書く前に、
必ず「物理モデル設計」「力の適用方法」「減速ロジック」の
構造を文章で説明してから実装を開始してください。
