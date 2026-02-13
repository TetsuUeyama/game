"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionDefinition, JointKeyframes } from "../motion/MotionTypes";
import { JOINT_NAMES, AXES, motionToCode } from "./CheckModeTypes";
import { CodeExportDialog } from "./CodeExportDialog";

interface MotionCheckPanelProps {
  motionData: MotionDefinition;
  onMotionChange: (motion: MotionDefinition) => void;
  playing: boolean;
  onPlayToggle: () => void;
  availableMotions: { name: string; motion: MotionDefinition }[];
  onMotionSelect: (name: string) => void;
  getPlaybackTime: () => number;
  onJointExpand?: (jointName: string | null) => void;
}

export function MotionCheckPanel({
  motionData,
  onMotionChange,
  playing,
  onPlayToggle,
  availableMotions,
  onMotionSelect,
  getPlaybackTime,
  onJointExpand,
}: MotionCheckPanelProps) {
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [expandedJoint, setExpandedJoint] = useState<string | null>(null);

  // タイムバーのマーカー要素ref
  const markerRef = useRef<HTMLDivElement>(null);
  const timeTextRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);

  // モーション切替時に展開状態をリセット
  useEffect(() => {
    setExpandedJoint(null);
    onJointExpand?.(null);
  }, [motionData.name, onJointExpand]);

  // requestAnimationFrame でマーカー位置を更新（React再描画なし）
  useEffect(() => {
    const update = () => {
      const t = getPlaybackTime();
      const dur = motionData.duration;
      if (markerRef.current) {
        const pct = dur > 0 ? (t / dur) * 100 : 0;
        markerRef.current.style.top = `${pct}%`;
      }
      if (timeTextRef.current) {
        timeTextRef.current.textContent = `${t.toFixed(2)}s`;
      }
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getPlaybackTime, motionData.duration]);

  // 元のモーションデータ（リセット用）
  const originalMotion = useMemo(
    () => availableMotions.find((m) => m.name === motionData.name)?.motion ?? null,
    [availableMotions, motionData.name]
  );

  /** モーション全体のユニーク時間ポイントを収集（全ジョイント共通） */
  const allTimes = useMemo(() => {
    const timesSet = new Set<number>();
    for (const kf of Object.values(motionData.joints)) {
      for (const t of Object.keys(kf)) timesSet.add(Number(t));
    }
    if (timesSet.size === 0) {
      return [0, motionData.duration];
    }
    return Array.from(timesSet).sort((a, b) => a - b);
  }, [motionData.joints, motionData.duration]);

  /** 値を取得（データなしは0） */
  const getValue = useCallback(
    (jointAxis: string, time: number): number => {
      return motionData.joints[jointAxis]?.[time] ?? 0;
    },
    [motionData.joints]
  );

  /** キーフレーム値を変更 */
  const handleValueChange = useCallback(
    (jointName: string, axis: string, time: number, value: number) => {
      const key = jointName + axis;
      const newJoints = { ...motionData.joints };
      newJoints[key] = { ...(newJoints[key] ?? {}), [time]: value };
      onMotionChange({ ...motionData, joints: newJoints });
    },
    [motionData, onMotionChange]
  );

  /** ジョイントが元から変更されているか（3軸すべてチェック） */
  const isJointModified = useCallback(
    (jointName: string): boolean => {
      if (!originalMotion) return false;
      for (const axis of AXES) {
        const key = jointName + axis;
        const current = motionData.joints[key];
        const original = originalMotion.joints[key];
        if (!current && !original) continue;
        if (!current || !original) return true;
        if (!keyframesEqual(current, original)) return true;
      }
      return false;
    },
    [motionData.joints, originalMotion]
  );

  /** ジョイント単位でリセット（3軸すべて） */
  const handleResetJoint = useCallback(
    (jointName: string) => {
      if (!originalMotion) return;
      const newJoints = { ...motionData.joints };
      for (const axis of AXES) {
        const key = jointName + axis;
        const originalKf = originalMotion.joints[key];
        if (originalKf) {
          newJoints[key] = { ...originalKf };
        } else {
          delete newJoints[key];
        }
      }
      onMotionChange({ ...motionData, joints: newJoints });
    },
    [motionData, onMotionChange, originalMotion]
  );

  /** 全ジョイントのリセット */
  const handleResetAll = useCallback(() => {
    if (!originalMotion) return;
    onMotionChange({ ...originalMotion });
  }, [onMotionChange, originalMotion]);

  const hasAnyModification = useMemo(
    () => JOINT_NAMES.some((j) => isJointModified(j)),
    [isJointModified]
  );

  /** ジョイントにデータがあるか（3軸いずれか） */
  const hasData = useCallback(
    (jointName: string): boolean => {
      return AXES.some((axis) => motionData.joints[jointName + axis] != null);
    },
    [motionData.joints]
  );

  const handleExport = useCallback(() => {
    setExportCode(motionToCode(motionData));
  }, [motionData]);

  return (
    <div style={panelStyle}>
      {/* Motion selector */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Motion</div>
        <select
          style={selectStyle}
          value={motionData.name}
          onChange={(e) => onMotionSelect(e.target.value)}
        >
          {availableMotions.map((m) => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Play controls */}
      <div style={controlsStyle}>
        <button onClick={onPlayToggle} style={playButtonStyle}>
          {playing ? "Pause" : "Play"}
        </button>
        <span style={durationStyle}>
          Duration: {motionData.duration.toFixed(1)}s
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleResetAll}
          disabled={!hasAnyModification}
          style={hasAnyModification ? resetAllButtonStyle : resetAllButtonDisabledStyle}
        >
          Reset All
        </button>
      </div>

      {/* Joint list (all 12 joints) */}
      <div style={jointsContainerStyle}>
        {JOINT_NAMES.map((jointName) => {
          const isExpanded = expandedJoint === jointName;
          const modified = isJointModified(jointName);
          const active = hasData(jointName);

          return (
            <div key={jointName}>
              {/* Joint header */}
              <div style={jointHeaderRowStyle}>
                <button
                  onClick={() => {
                    const next = isExpanded ? null : jointName;
                    setExpandedJoint(next);
                    onJointExpand?.(next);
                  }}
                  style={jointHeaderStyle}
                >
                  <span style={chevronStyle}>{isExpanded ? "v" : ">"}</span>
                  <span style={active ? jointNameActiveStyle : jointNameInactiveStyle}>
                    {jointName}
                  </span>
                  {modified && <span style={modifiedDotStyle} />}
                </button>
                {modified && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetJoint(jointName);
                    }}
                    style={resetButtonStyle}
                    title="Reset to original"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Expanded: time bar + time × axis table */}
              {isExpanded && (
                <div style={jointBodyStyle}>
                  {/* Axis color legend */}
                  <div style={axisLegendStyle}>
                    <span style={legendItemStyle}><span style={legendDotX} />X</span>
                    <span style={legendItemStyle}><span style={legendDotY} />Y</span>
                    <span style={legendItemStyle}><span style={legendDotZ} />Z</span>
                  </div>
                  {/* Table header (offset for time bar column) */}
                  <div style={tableHeaderStyle}>
                    <span style={barHeaderSpaceStyle} />
                    <span style={timeColStyle}>time</span>
                    {AXES.map((axis) => (
                      <span key={axis} style={axisColHeaderStyle}>{axis}</span>
                    ))}
                  </div>
                  {/* Data area: time bar + rows */}
                  <div style={dataAreaStyle}>
                    {/* Time bar (left) */}
                    <div style={timeBarContainerStyle}>
                      <div style={timeBarTrackStyle} />
                      <div ref={markerRef} style={timeBarMarkerStyle}>
                        <div style={timeBarMarkerHeadStyle} />
                      </div>
                    </div>
                    {/* Table rows */}
                    <div style={tableRowsStyle}>
                      {allTimes.map((time) => (
                        <div key={time} style={tableRowStyle}>
                          <span style={timeColStyle}>{time.toFixed(3)}s</span>
                          {AXES.map((axis) => {
                            const key = jointName + axis;
                            const val = getValue(key, time);
                            return (
                              <div key={axis} style={axisCellStyle}>
                                <input
                                  type="number"
                                  step={0.5}
                                  value={val}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    handleValueChange(jointName, axis, time, isNaN(v) ? 0 : v);
                                  }}
                                  style={cellInputStyle}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Current time display */}
                  <div style={currentTimeDisplayStyle}>
                    <span ref={timeTextRef} style={currentTimeTextStyle}>0.00s</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Export button */}
      <button onClick={handleExport} style={exportButtonStyle}>
        Export Code
      </button>

      {exportCode !== null && (
        <CodeExportDialog
          code={exportCode}
          onClose={() => setExportCode(null)}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  height: "100%",
  overflow: "hidden",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 4px",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#aaa",
  minWidth: 60,
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 6px",
  background: "#2a2a2a",
  color: "#ddd",
  border: "1px solid #555",
  borderRadius: 3,
  fontSize: 12,
};

const controlsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 4px",
};

const playButtonStyle: React.CSSProperties = {
  padding: "5px 16px",
  background: "#0078d4",
  color: "white",
  border: "none",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
};

const durationStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
};

const jointsContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "0 4px",
};

const jointHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderBottom: "1px solid #333",
};

const jointHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flex: 1,
  padding: "5px 4px",
  background: "none",
  color: "#ccc",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  textAlign: "left",
};

const chevronStyle: React.CSSProperties = {
  width: 10,
  fontFamily: "monospace",
  fontSize: 10,
};

const jointNameActiveStyle: React.CSSProperties = {
  flex: 1,
  fontWeight: "bold",
  color: "#ddd",
};

const jointNameInactiveStyle: React.CSSProperties = {
  flex: 1,
  fontWeight: "normal",
  color: "#666",
};

const modifiedDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#e8a030",
  flexShrink: 0,
};

const resetButtonStyle: React.CSSProperties = {
  padding: "2px 8px",
  background: "none",
  color: "#e8a030",
  border: "1px solid #e8a030",
  borderRadius: 2,
  cursor: "pointer",
  fontSize: 10,
  flexShrink: 0,
  marginRight: 4,
};

const resetAllButtonStyle: React.CSSProperties = {
  padding: "3px 10px",
  background: "none",
  color: "#e8a030",
  border: "1px solid #e8a030",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 11,
};

const resetAllButtonDisabledStyle: React.CSSProperties = {
  ...resetAllButtonStyle,
  color: "#555",
  border: "1px solid #444",
  cursor: "default",
};

const jointBodyStyle: React.CSSProperties = {
  padding: "4px 4px 8px",
  background: "#1a1a1a",
};

const tableHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 0 4px",
  borderBottom: "1px solid #333",
  marginBottom: 2,
};

const barHeaderSpaceStyle: React.CSSProperties = {
  width: 14,
  flexShrink: 0,
};

const timeColStyle: React.CSSProperties = {
  width: 52,
  fontSize: 10,
  color: "#666",
  fontFamily: "monospace",
  textAlign: "right",
  flexShrink: 0,
};

const axisColHeaderStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 10,
  color: "#888",
  fontWeight: "bold",
  textAlign: "center",
};

const dataAreaStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
};

const timeBarContainerStyle: React.CSSProperties = {
  position: "relative",
  width: 14,
  flexShrink: 0,
};

const timeBarTrackStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  left: 6,
  width: 2,
  background: "#333",
  borderRadius: 1,
};

const timeBarMarkerStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  width: 14,
  transform: "translateY(-50%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
};

const timeBarMarkerHeadStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: "#0078d4",
  border: "2px solid #4aa3df",
  boxSizing: "border-box",
};

const tableRowsStyle: React.CSSProperties = {
  flex: 1,
};

const tableRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "1px 0",
};

const axisCellStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
};

const cellInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "2px 3px",
  background: "#2a2a2a",
  color: "#ddd",
  border: "1px solid #444",
  borderRadius: 2,
  fontSize: 11,
  fontFamily: "monospace",
  textAlign: "right",
};

const currentTimeDisplayStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  padding: "4px 0 0 2px",
  borderTop: "1px solid #333",
  marginTop: 4,
};

const currentTimeTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#0078d4",
  fontFamily: "monospace",
  fontWeight: "bold",
};

const axisLegendStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  padding: "2px 4px 4px",
  fontSize: 10,
  color: "#888",
};

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
};

const legendDotBase: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  display: "inline-block",
};

const legendDotX: React.CSSProperties = { ...legendDotBase, background: "#f44" };
const legendDotY: React.CSSProperties = { ...legendDotBase, background: "#4f4" };
const legendDotZ: React.CSSProperties = { ...legendDotBase, background: "#44f" };

const exportButtonStyle: React.CSSProperties = {
  padding: "8px 0",
  background: "#0078d4",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  margin: "4px",
};

// ── Helpers ────────────────────────────────────────────────

function keyframesEqual(a: JointKeyframes, b: JointKeyframes): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[Number(k)] === b[Number(k)]);
}
