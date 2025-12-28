"use client";

import React, { useState } from "react";
import { GameScene } from "@/character-move/scenes/GameScene";

interface JointControlPanelProps {
  gameScene: GameScene | null;
}

interface JointRotation {
  x: number;
  y: number;
  z: number;
}

interface JointLimits {
  x: { min: number; max: number };
  y: { min: number; max: number };
  z: { min: number; max: number };
}

// 各関節の可動域設定（度数法）
const JOINT_LIMITS: { [key: string]: JointLimits } = {
  head: {
    x: { min: -45, max: 45 },   // 前後に傾ける
    y: { min: -90, max: 90 },   // 左右に振る
    z: { min: -30, max: 30 },   // 左右に傾ける
  },
  upperBody: {
    x: { min: -30, max: 30 },   // 前後に曲げる
    y: { min: -90, max: 90 },   // 腰を捻る
    z: { min: -30, max: 30 },   // 左右に曲げる
  },
  lowerBody: {
    x: { min: -30, max: 30 },
    y: { min: -80, max: 80 },
    z: { min: -30, max: 30 },
  },
  leftShoulder: {
    x: { min: -180, max: 180 }, // 前後に振る
    y: { min: -90, max: 90 },   // 内外転
    z: { min: -180, max: 180 }, // 回旋
  },
  rightShoulder: {
    x: { min: -180, max: 180 },
    y: { min: -90, max: 90 },
    z: { min: -180, max: 180 },
  },
  leftElbow: {
    x: { min: 0, max: 150 },    // 曲げる（0度が真っ直ぐ）
    y: { min: -10, max: 10 },   // ほぼ動かない
    z: { min: -90, max: 90 },   // 前腕の回転
  },
  rightElbow: {
    x: { min: 0, max: 150 },
    y: { min: -10, max: 10 },
    z: { min: -90, max: 90 },
  },
  leftHip: {
    x: { min: -120, max: 90 },  // 前後に振る
    y: { min: -45, max: 45 },   // 内外転
    z: { min: -45, max: 45 },   // 回旋
  },
  rightHip: {
    x: { min: -120, max: 90 },
    y: { min: -45, max: 45 },
    z: { min: -45, max: 45 },
  },
  leftKnee: {
    x: { min: 0, max: 150 },    // 曲げる（0度が真っ直ぐ）
    y: { min: -10, max: 10 },   // ほぼ動かない
    z: { min: -10, max: 10 },   // ほぼ動かない
  },
  rightKnee: {
    x: { min: 0, max: 150 },
    y: { min: -10, max: 10 },
    z: { min: -10, max: 10 },
  },
};

const JOINTS = [
  { name: "head", label: "頭" },
  { name: "upperBody", label: "上半身" },
  { name: "lowerBody", label: "下半身" },
  { name: "leftShoulder", label: "左肩" },
  { name: "rightShoulder", label: "右肩" },
  { name: "leftElbow", label: "左肘" },
  { name: "rightElbow", label: "右肘" },
  { name: "leftHip", label: "左股関節" },
  { name: "rightHip", label: "右股関節" },
  { name: "leftKnee", label: "左膝" },
  { name: "rightKnee", label: "右膝" },
];

export function JointControlPanel({ gameScene }: JointControlPanelProps) {
  const [selectedJoint, setSelectedJoint] = useState<string>("leftShoulder");
  const [rotation, setRotation] = useState<JointRotation>({ x: 0, y: 0, z: 0 });

  // 現在選択されている関節の可動域を取得
  const currentLimits = JOINT_LIMITS[selectedJoint] || {
    x: { min: -180, max: 180 },
    y: { min: -180, max: 180 },
    z: { min: -180, max: 180 },
  };

  const handleRotationChange = (axis: "x" | "y" | "z", value: number) => {
    // 関節の可動域制限を取得
    const limits = JOINT_LIMITS[selectedJoint];
    if (!limits) return;

    // 値を可動域内に制限
    const clampedValue = Math.max(
      limits[axis].min,
      Math.min(limits[axis].max, value)
    );

    const newRotation = { ...rotation, [axis]: clampedValue };
    setRotation(newRotation);

    // ゲームシーンの関節を更新
    if (gameScene) {
      const character = gameScene.getCharacter();
      const joint = character.getJoint(selectedJoint);
      if (joint) {
        joint.rotation[axis] = (clampedValue * Math.PI) / 180; // 度数をラジアンに変換
      }
    }
  };

  const handleJointChange = (jointName: string) => {
    setSelectedJoint(jointName);

    // 現在の関節の回転値を取得
    if (gameScene) {
      const character = gameScene.getCharacter();
      const joint = character.getJoint(jointName);
      if (joint) {
        setRotation({
          x: (joint.rotation.x * 180) / Math.PI, // ラジアンを度数に変換
          y: (joint.rotation.y * 180) / Math.PI,
          z: (joint.rotation.z * 180) / Math.PI,
        });
      }
    }
  };

  const resetRotation = () => {
    setRotation({ x: 0, y: 0, z: 0 });
    if (gameScene) {
      const character = gameScene.getCharacter();
      const joint = character.getJoint(selectedJoint);
      if (joint) {
        joint.rotation.x = 0;
        joint.rotation.y = 0;
        joint.rotation.z = 0;
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        color: "white",
        padding: "20px",
        borderRadius: "8px",
        width: "320px",
        maxHeight: "80vh",
        overflowY: "auto",
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        zIndex: 1000,
      }}
    >
      <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>関節コントロール</h3>

      {/* 関節選択 */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
          関節を選択:
        </label>
        <select
          value={selectedJoint}
          onChange={(e) => handleJointChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "#333",
            color: "white",
            fontSize: "14px",
          }}
        >
          {JOINTS.map((joint) => (
            <option key={joint.name} value={joint.name}>
              {joint.label}
            </option>
          ))}
        </select>
      </div>

      {/* X軸回転 */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", marginBottom: "4px" }}>
          X軸回転: {rotation.x.toFixed(0)}° (範囲: {currentLimits.x.min}° ～ {currentLimits.x.max}°)
        </label>
        <input
          type="range"
          min={currentLimits.x.min}
          max={currentLimits.x.max}
          value={rotation.x}
          onChange={(e) => handleRotationChange("x", Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <input
          type="number"
          min={currentLimits.x.min}
          max={currentLimits.x.max}
          value={Math.round(rotation.x)}
          onChange={(e) => handleRotationChange("x", Number(e.target.value))}
          style={{
            width: "100%",
            padding: "4px",
            marginTop: "4px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "#333",
            color: "white",
          }}
        />
      </div>

      {/* Y軸回転 */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", marginBottom: "4px" }}>
          Y軸回転: {rotation.y.toFixed(0)}° (範囲: {currentLimits.y.min}° ～ {currentLimits.y.max}°)
        </label>
        <input
          type="range"
          min={currentLimits.y.min}
          max={currentLimits.y.max}
          value={rotation.y}
          onChange={(e) => handleRotationChange("y", Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <input
          type="number"
          min={currentLimits.y.min}
          max={currentLimits.y.max}
          value={Math.round(rotation.y)}
          onChange={(e) => handleRotationChange("y", Number(e.target.value))}
          style={{
            width: "100%",
            padding: "4px",
            marginTop: "4px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "#333",
            color: "white",
          }}
        />
      </div>

      {/* Z軸回転 */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", marginBottom: "4px" }}>
          Z軸回転: {rotation.z.toFixed(0)}° (範囲: {currentLimits.z.min}° ～ {currentLimits.z.max}°)
        </label>
        <input
          type="range"
          min={currentLimits.z.min}
          max={currentLimits.z.max}
          value={rotation.z}
          onChange={(e) => handleRotationChange("z", Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <input
          type="number"
          min={currentLimits.z.min}
          max={currentLimits.z.max}
          value={Math.round(rotation.z)}
          onChange={(e) => handleRotationChange("z", Number(e.target.value))}
          style={{
            width: "100%",
            padding: "4px",
            marginTop: "4px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "#333",
            color: "white",
          }}
        />
      </div>

      {/* リセットボタン */}
      <button
        onClick={resetRotation}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "4px",
          border: "none",
          backgroundColor: "#d9534f",
          color: "white",
          fontSize: "14px",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        リセット
      </button>

      {/* 操作説明 */}
      <div
        style={{
          marginTop: "20px",
          padding: "12px",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          borderRadius: "4px",
          fontSize: "12px",
        }}
      >
        <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>操作方法:</p>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>スライダーまたは数値入力で回転</li>
          <li>WASD: キャラクター移動</li>
          <li>QE: キャラクター回転</li>
          <li>マウスドラッグ: カメラ回転</li>
        </ul>
      </div>
    </div>
  );
}
