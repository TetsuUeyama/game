"use client";

import React, { useState, useEffect } from "react";
import { GameScene } from "@/character-move/scenes/GameScene";
import { IDLE_MOTION } from "@/character-move/data/IdleMotion";
import { WALK_FORWARD_MOTION, WALK_BACKWARD_MOTION, WALK_LEFT_MOTION, WALK_RIGHT_MOTION } from "@/character-move/data/WalkMotion";
import { JUMP_MOTION } from "@/character-move/data/JumpMotion";
import { LANDING_MOTION } from "@/character-move/data/LandingMotion";
import { DASH_FORWARD_MOTION } from "@/character-move/data/DashMotion";
import { CROUCH_MOTION } from "@/character-move/data/CrouchMotion";
import { MotionData, KeyframeJoints } from "@/character-move/types/MotionTypes";

interface MotionConfirmationPanelProps {
  gameScene: GameScene | null;
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
    z: { min: -40, max: 40 },
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
    x: { min: -150, max: 0 },    // 曲げる（0度が真っ直ぐ）
    y: { min: -10, max: 10 },   // ほぼ動かない
    z: { min: -90, max: 90 },   // 前腕の回転
  },
  rightElbow: {
    x: { min: -150, max: 0 },
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

const MOTIONS: { motion: MotionData; label: string }[] = [
  { motion: IDLE_MOTION, label: "待機" },
  { motion: WALK_FORWARD_MOTION, label: "前進" },
  { motion: WALK_BACKWARD_MOTION, label: "後退" },
  { motion: WALK_LEFT_MOTION, label: "左移動" },
  { motion: WALK_RIGHT_MOTION, label: "右移動" },
  { motion: JUMP_MOTION, label: "ジャンプ" },
  { motion: LANDING_MOTION, label: "着地" },
  { motion: DASH_FORWARD_MOTION, label: "ダッシュ" },
  { motion: CROUCH_MOTION, label: "しゃがみ" },
];

export function MotionConfirmationPanel({ gameScene }: MotionConfirmationPanelProps) {
  const [selectedMotion, setSelectedMotion] = useState<MotionData>(IDLE_MOTION);
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number>(0);
  const [defaultJoints, setDefaultJoints] = useState<KeyframeJoints>({});
  const [editedJoints, setEditedJoints] = useState<KeyframeJoints>({});

  // 選択されたキーフレームが変更されたら関節データを更新してキャラクターに適用
  useEffect(() => {
    if (selectedMotion.keyframes.length > 0 && gameScene) {
      const keyframe = selectedMotion.keyframes[selectedKeyframeIndex];
      if (keyframe) {
        // デフォルト値として保存
        setDefaultJoints(JSON.parse(JSON.stringify(keyframe.joints)));
        // 編集用の値として初期化
        setEditedJoints(JSON.parse(JSON.stringify(keyframe.joints)));

        // キャラクターに適用
        const character = gameScene.getCharacter();
        const jointNames: (keyof KeyframeJoints)[] = ["upperBody", "lowerBody", "head", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftHip", "rightHip", "leftKnee", "rightKnee"];

        for (const jointName of jointNames) {
          const rotation = keyframe.joints[jointName];
          const characterJoint = character.getJoint(jointName);
          if (rotation && characterJoint) {
            characterJoint.rotation.x = (rotation.x * Math.PI) / 180;
            characterJoint.rotation.y = (rotation.y * Math.PI) / 180;
            characterJoint.rotation.z = (rotation.z * Math.PI) / 180;
          }
        }
      }
    }
  }, [selectedMotion, selectedKeyframeIndex, gameScene]);

  const handleMotionChange = (motionName: string) => {
    const motionData = MOTIONS.find((m) => m.motion.name === motionName);
    if (motionData) {
      setSelectedMotion(motionData.motion);
      setSelectedKeyframeIndex(0);
    }
  };

  const handleKeyframeChange = (index: number) => {
    setSelectedKeyframeIndex(index);
  };

  const handleMotionJointChange = (jointName: keyof KeyframeJoints, axis: "x" | "y" | "z", value: number) => {
    // 可動域制限を取得
    const limits = JOINT_LIMITS[jointName as string];
    if (!limits) return;

    // 値を可動域内に制限
    const clampedValue = Math.max(
      limits[axis].min,
      Math.min(limits[axis].max, value)
    );

    const updatedJoints = { ...editedJoints };
    if (updatedJoints[jointName]) {
      updatedJoints[jointName] = { ...updatedJoints[jointName], [axis]: clampedValue };
    } else {
      updatedJoints[jointName] = { x: 0, y: 0, z: 0, [axis]: clampedValue };
    }
    setEditedJoints(updatedJoints);

    // キャラクターに適用
    if (gameScene) {
      const character = gameScene.getCharacter();
      const joint = character.getJoint(jointName);
      if (joint && updatedJoints[jointName]) {
        joint.rotation[axis] = (updatedJoints[jointName]![axis] * Math.PI) / 180;
      }
    }
  };

  const resetToDefault = (jointName: keyof KeyframeJoints, axis: "x" | "y" | "z") => {
    const defaultRotation = defaultJoints[jointName];
    if (!defaultRotation) return;

    const updatedJoints = { ...editedJoints };
    if (updatedJoints[jointName]) {
      updatedJoints[jointName] = { ...updatedJoints[jointName], [axis]: defaultRotation[axis] };
    }
    setEditedJoints(updatedJoints);

    // キャラクターに適用
    if (gameScene) {
      const character = gameScene.getCharacter();
      const joint = character.getJoint(jointName);
      if (joint && updatedJoints[jointName]) {
        joint.rotation[axis] = (updatedJoints[jointName]![axis] * Math.PI) / 180;
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
      <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>モーション確認</h3>

      {/* モーション選択 */}
      <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: "4px" }}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>モーション選択</h4>

        <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
          モーション:
        </label>
        <select
          value={selectedMotion.name}
          onChange={(e) => handleMotionChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "#333",
            color: "white",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          {MOTIONS.map((motion) => (
            <option key={motion.motion.name} value={motion.motion.name}>
              {motion.label} ({motion.motion.name})
            </option>
          ))}
        </select>

        <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
          キーフレーム時間:
        </label>
        <select
          value={selectedKeyframeIndex}
          onChange={(e) => handleKeyframeChange(Number(e.target.value))}
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
          {selectedMotion.keyframes.map((keyframe, index) => (
            <option key={index} value={index}>
              time: {keyframe.time.toFixed(2)}s
            </option>
          ))}
        </select>
      </div>

      {/* モーション詳細（全関節の角度表示） */}
      <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "rgba(100, 150, 255, 0.1)", borderRadius: "4px" }}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>モーション詳細 ({selectedMotion.name})</h4>

        {JOINTS.map((joint) => {
          const defaultRotation = defaultJoints[joint.name as keyof KeyframeJoints];
          const editedRotation = editedJoints[joint.name as keyof KeyframeJoints];
          if (!defaultRotation || !editedRotation) return null;

          const limits = JOINT_LIMITS[joint.name] || {
            x: { min: -180, max: 180 },
            y: { min: -180, max: 180 },
            z: { min: -180, max: 180 },
          };

          return (
            <div key={joint.name} style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>{joint.label}</div>

              {/* X軸 */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px" }}>X:</label>
                  <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.7)" }}>
                    デフォルト: {defaultRotation.x.toFixed(1)}° (範囲: {limits.x.min}° ~ {limits.x.max}°)
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="range"
                    min={limits.x.min}
                    max={limits.x.max}
                    step={1}
                    value={editedRotation.x}
                    onChange={(e) => handleMotionJointChange(joint.name as keyof KeyframeJoints, "x", Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min={limits.x.min}
                    max={limits.x.max}
                    step={0.1}
                    value={editedRotation.x.toFixed(1)}
                    onChange={(e) => handleMotionJointChange(joint.name as keyof KeyframeJoints, "x", Number(e.target.value))}
                    style={{
                      width: "60px",
                      padding: "4px",
                      borderRadius: "4px",
                      border: "1px solid #555",
                      backgroundColor: "#222",
                      color: "white",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    onClick={() => resetToDefault(joint.name as keyof KeyframeJoints, "x")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "1px solid #555",
                      backgroundColor: "#444",
                      color: "white",
                      fontSize: "11px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    リセット
                  </button>
                </div>
              </div>

              {/* Y軸 */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px" }}>Y:</label>
                  <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.7)" }}>
                    デフォルト: {defaultRotation.y.toFixed(1)}° (範囲: {limits.y.min}° ~ {limits.y.max}°)
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="range"
                    min={limits.y.min}
                    max={limits.y.max}
                    step={1}
                    value={editedRotation.y}
                    onChange={(e) => handleMotionJointChange(joint.name as keyof KeyframeJoints, "y", Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min={limits.y.min}
                    max={limits.y.max}
                    step={0.1}
                    value={editedRotation.y.toFixed(1)}
                    onChange={(e) => handleMotionJointChange(joint.name as keyof KeyframeJoints, "y", Number(e.target.value))}
                    style={{
                      width: "60px",
                      padding: "4px",
                      borderRadius: "4px",
                      border: "1px solid #555",
                      backgroundColor: "#222",
                      color: "white",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    onClick={() => resetToDefault(joint.name as keyof KeyframeJoints, "y")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "1px solid #555",
                      backgroundColor: "#444",
                      color: "white",
                      fontSize: "11px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    リセット
                  </button>
                </div>
              </div>

              {/* Z軸 */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px" }}>Z:</label>
                  <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.7)" }}>
                    デフォルト: {defaultRotation.z.toFixed(1)}° (範囲: {limits.z.min}° ~ {limits.z.max}°)
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="range"
                    min={limits.z.min}
                    max={limits.z.max}
                    step={1}
                    value={editedRotation.z}
                    onChange={(e) => handleMotionJointChange(joint.name as keyof KeyframeJoints, "z", Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min={limits.z.min}
                    max={limits.z.max}
                    step={0.1}
                    value={editedRotation.z.toFixed(1)}
                    onChange={(e) => handleMotionJointChange(joint.name as keyof KeyframeJoints, "z", Number(e.target.value))}
                    style={{
                      width: "60px",
                      padding: "4px",
                      borderRadius: "4px",
                      border: "1px solid #555",
                      backgroundColor: "#222",
                      color: "white",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    onClick={() => resetToDefault(joint.name as keyof KeyframeJoints, "z")}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "1px solid #555",
                      backgroundColor: "#444",
                      color: "white",
                      fontSize: "11px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    リセット
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
