'use client';

import React from 'react';

export interface CatchPoseCheckPanelProps {
  ballHeight: number;
  ballHorizontal: number;
  ballForward: number;
  spinePitch: number;
  spineRoll: number;
  kneeBend: number;
  armSlerpAmount: number;
  catchArmSide: 'left' | 'right';
  autoMode: boolean;
  onBallHeightChange: (v: number) => void;
  onBallHorizontalChange: (v: number) => void;
  onBallForwardChange: (v: number) => void;
  onSpinePitchChange: (v: number) => void;
  onSpineRollChange: (v: number) => void;
  onKneeBendChange: (v: number) => void;
  onArmSlerpAmountChange: (v: number) => void;
  onCatchArmSideChange: (v: 'left' | 'right') => void;
  onAutoModeChange: (v: boolean) => void;
}

// ─── styles ──────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '8px 6px',
  overflowY: 'auto',
  flex: 1,
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#ddd',
};

const sectionStyle: React.CSSProperties = {
  background: '#2a2a2a',
  borderRadius: 4,
  padding: '6px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 'bold',
  color: '#aaa',
  marginBottom: 2,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

const sliderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  width: 70,
  fontSize: 11,
  color: '#ccc',
  flexShrink: 0,
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  height: 4,
  cursor: 'pointer',
  accentColor: '#0078d4',
};

const valueStyle: React.CSSProperties = {
  width: 42,
  textAlign: 'right',
  fontSize: 11,
  color: '#ddd',
  flexShrink: 0,
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
};

const sideButtonBase: React.CSSProperties = {
  flex: 1,
  padding: '4px 0',
  border: '1px solid #444',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 'bold',
  cursor: 'pointer',
  textAlign: 'center',
};

// ─── helpers ─────────────────────────────────────────────
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={sliderRowStyle}>
      <span style={{ ...labelStyle, color: disabled ? '#555' : '#ccc' }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ ...sliderStyle, opacity: disabled ? 0.3 : 1 }}
      />
      <span style={{ ...valueStyle, color: disabled ? '#555' : '#ddd' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ─── component ───────────────────────────────────────────
export function CatchPoseCheckPanel(props: CatchPoseCheckPanelProps) {
  const {
    ballHeight,
    ballHorizontal,
    ballForward,
    spinePitch,
    spineRoll,
    kneeBend,
    armSlerpAmount,
    catchArmSide,
    autoMode,
    onBallHeightChange,
    onBallHorizontalChange,
    onBallForwardChange,
    onSpinePitchChange,
    onSpineRollChange,
    onKneeBendChange,
    onArmSlerpAmountChange,
    onCatchArmSideChange,
    onAutoModeChange,
  } = props;

  return (
    <div style={containerStyle}>
      {/* ── Ball Position ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Ball Position</div>
        <SliderRow
          label="Height"
          value={ballHeight}
          min={0}
          max={2.5}
          step={0.01}
          onChange={onBallHeightChange}
        />
        <SliderRow
          label="Horizontal"
          value={ballHorizontal}
          min={-1}
          max={1}
          step={0.01}
          onChange={onBallHorizontalChange}
        />
        <SliderRow
          label="Forward"
          value={ballForward}
          min={0}
          max={1.5}
          step={0.01}
          onChange={onBallForwardChange}
        />
      </div>

      {/* ── Spine Overlay ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Spine Overlay</div>
        <div style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={autoMode}
            onChange={(e) => onAutoModeChange(e.target.checked)}
            style={{ accentColor: '#0078d4' }}
          />
          <span style={{ color: autoMode ? '#ddd' : '#888' }}>Auto</span>
        </div>
        <SliderRow
          label="Pitch"
          value={spinePitch}
          min={-0.5}
          max={0.6}
          step={0.01}
          onChange={onSpinePitchChange}
          disabled={autoMode}
        />
        <SliderRow
          label="Roll"
          value={spineRoll}
          min={-0.3}
          max={0.3}
          step={0.01}
          onChange={onSpineRollChange}
          disabled={autoMode}
        />
      </div>

      {/* ── Leg ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Leg</div>
        <SliderRow
          label="Knee Bend"
          value={kneeBend}
          min={0}
          max={1}
          step={0.01}
          onChange={onKneeBendChange}
          disabled={autoMode}
        />
      </div>

      {/* ── Arm IK ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Arm IK</div>
        <SliderRow
          label="Slerp"
          value={armSlerpAmount}
          min={0}
          max={1}
          step={0.01}
          onChange={onArmSlerpAmountChange}
        />
        <div style={sliderRowStyle}>
          <span style={labelStyle}>Side</span>
          <div style={{ display: 'flex', flex: 1, gap: 4 }}>
            <button
              onClick={() => onCatchArmSideChange('left')}
              style={{
                ...sideButtonBase,
                background: catchArmSide === 'left' ? '#0078d4' : '#333',
                color: catchArmSide === 'left' ? '#fff' : '#888',
                borderColor: catchArmSide === 'left' ? '#0078d4' : '#444',
              }}
            >
              Left
            </button>
            <button
              onClick={() => onCatchArmSideChange('right')}
              style={{
                ...sideButtonBase,
                background: catchArmSide === 'right' ? '#0078d4' : '#333',
                color: catchArmSide === 'right' ? '#fff' : '#888',
                borderColor: catchArmSide === 'right' ? '#0078d4' : '#444',
              }}
            >
              Right
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
