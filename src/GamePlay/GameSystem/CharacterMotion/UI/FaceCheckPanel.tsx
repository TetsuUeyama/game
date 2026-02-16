"use client";

import { useCallback, useState } from "react";
import {
  FaceParams,
  EYE_PRESETS,
  EYEBROW_PRESETS,
  NOSE_PRESETS,
  MOUTH_PRESETS,
  EYE_PRESET_NAMES,
  EYEBROW_PRESET_NAMES,
  NOSE_PRESET_NAMES,
  MOUTH_PRESET_NAMES,
  EYE_SLIDERS,
  EYEBROW_SLIDERS,
  NOSE_SLIDERS,
  MOUTH_SLIDERS,
  NOSE_SHAPES,
  SliderDef,
  faceParamsToCode,
} from "@/GamePlay/GameSystem/CharacterMotion/UI/CheckModeTypes";
import { FaceCamConfig } from "@/GamePlay/GameSystem/CharacterMotion/Hooks/UseHumanoidControl";
import { CodeExportDialog } from "@/GamePlay/GameSystem/CharacterMotion/UI/CodeExportDialog";

type FacePart = "eye" | "eyebrow" | "nose" | "mouth";

interface FaceCheckPanelProps {
  faceParams: FaceParams[];
  activeCharIndex: number;
  onCharIndexChange: (i: number) => void;
  onParamsChange: (index: number, params: FaceParams) => void;
  faceCamConfig: FaceCamConfig;
  onFaceCamChange: (config: FaceCamConfig) => void;
}

const CAM_SLIDERS: SliderDef[] = [
  { key: "targetY", label: "Target Y",  min: 0,     max: 3.0,   step: 0.01 },
  { key: "radius",  label: "Radius",    min: 0.05,  max: 5.0,   step: 0.01 },
  { key: "alpha",   label: "Alpha",     min: -Math.PI, max: Math.PI, step: 0.01 },
  { key: "beta",    label: "Beta",      min: 0,     max: Math.PI, step: 0.01 },
];

export function FaceCheckPanel({
  faceParams,
  activeCharIndex,
  onCharIndexChange,
  onParamsChange,
  faceCamConfig,
  onFaceCamChange,
}: FaceCheckPanelProps) {
  const [activePart, setActivePart] = useState<FacePart>("eye");
  const [exportCode, setExportCode] = useState<string | null>(null);

  const params = faceParams[activeCharIndex];

  const updateParams = (updated: FaceParams) => {
    onParamsChange(activeCharIndex, updated);
  };

  const handleSliderChange = (part: FacePart, key: string, value: number) => {
    const updated = { ...params };
    switch (part) {
      case "eye":
        updated.eye = { ...updated.eye, [key]: value };
        break;
      case "eyebrow":
        updated.eyebrow = { ...updated.eyebrow, [key]: value };
        break;
      case "nose":
        updated.nose = { ...updated.nose, [key]: value };
        break;
      case "mouth":
        updated.mouth = { ...updated.mouth, [key]: value };
        break;
    }
    updateParams(updated);
  };

  const handlePresetSelect = (part: FacePart, presetName: string) => {
    const updated = { ...params };
    switch (part) {
      case "eye":
        updated.eye = { ...EYE_PRESETS[presetName] };
        break;
      case "eyebrow":
        updated.eyebrow = { ...EYEBROW_PRESETS[presetName] };
        break;
      case "nose":
        updated.nose = { ...NOSE_PRESETS[presetName] };
        break;
      case "mouth":
        updated.mouth = { ...MOUTH_PRESETS[presetName] };
        break;
    }
    updateParams(updated);
  };

  const handleNoseShapeChange = (shape: "box" | "wedge" | "halfCone") => {
    updateParams({ ...params, nose: { ...params.nose, shape } });
  };

  const handleExport = useCallback(() => {
    setExportCode(faceParamsToCode(faceParams));
  }, [faceParams]);

  const parts: { key: FacePart; label: string }[] = [
    { key: "eye", label: "Eyes" },
    { key: "eyebrow", label: "Brows" },
    { key: "nose", label: "Nose" },
    { key: "mouth", label: "Mouth" },
  ];

  return (
    <div style={panelStyle}>
      {/* Character selector (A / B) */}
      <div style={charSelectorStyle}>
        {faceParams.map((_, i) => (
          <button
            key={i}
            onClick={() => onCharIndexChange(i)}
            style={activeCharIndex === i ? activeCharBtnStyle : charBtnStyle}
          >
            {String.fromCharCode(65 + i)}
          </button>
        ))}
      </div>

      {/* Part tabs */}
      <div style={partTabsStyle}>
        {parts.map((p) => (
          <button
            key={p.key}
            onClick={() => setActivePart(p.key)}
            style={activePart === p.key ? activePartTabStyle : partTabStyle}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Preset selector */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Preset</div>
        <select
          style={selectStyle}
          value=""
          onChange={(e) => {
            if (e.target.value) handlePresetSelect(activePart, e.target.value);
          }}
        >
          <option value="">-- Apply preset --</option>
          {getPresetNames(activePart).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* Nose shape selector (only for nose) */}
      {activePart === "nose" && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Shape</div>
          <select
            style={selectStyle}
            value={params.nose.shape}
            onChange={(e) => handleNoseShapeChange(e.target.value as "box" | "wedge" | "halfCone")}
          >
            {NOSE_SHAPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* Camera position sliders */}
      <div style={camSectionStyle}>
        <div style={camHeaderStyle}>Camera</div>
        {CAM_SLIDERS.map((slider) => (
          <SliderRow
            key={slider.key}
            slider={slider}
            value={(faceCamConfig as unknown as Record<string, number>)[slider.key] ?? 0}
            onChange={(v) => onFaceCamChange({ ...faceCamConfig, [slider.key]: v })}
          />
        ))}
      </div>

      {/* Face part sliders */}
      <div style={slidersContainerStyle}>
        {getSliders(activePart).map((slider) => (
          <SliderRow
            key={slider.key}
            slider={slider}
            value={getSliderValue(params, activePart, slider.key)}
            onChange={(v) => handleSliderChange(activePart, slider.key, v)}
          />
        ))}
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

function SliderRow({
  slider,
  value,
  onChange,
}: {
  slider: SliderDef;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={sliderRowStyle}>
      <label style={sliderLabelStyle}>{slider.label}</label>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={sliderInputStyle}
      />
      <span style={sliderValueStyle}>{value.toFixed(3)}</span>
    </div>
  );
}

function getPresetNames(part: FacePart): string[] {
  switch (part) {
    case "eye": return EYE_PRESET_NAMES;
    case "eyebrow": return EYEBROW_PRESET_NAMES;
    case "nose": return NOSE_PRESET_NAMES;
    case "mouth": return MOUTH_PRESET_NAMES;
  }
}

function getSliders(part: FacePart): SliderDef[] {
  switch (part) {
    case "eye": return EYE_SLIDERS;
    case "eyebrow": return EYEBROW_SLIDERS;
    case "nose": return NOSE_SLIDERS;
    case "mouth": return MOUTH_SLIDERS;
  }
}

function getSliderValue(params: FaceParams, part: FacePart, key: string): number {
  const partData = params[part];
  return ((partData as unknown as Record<string, number>)[key]) ?? 0;
}

// ── Styles ────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
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
  minWidth: 48,
};

const partTabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 2,
  padding: "0 4px",
};

const partTabStyle: React.CSSProperties = {
  flex: 1,
  padding: "5px 0",
  background: "#2a2a2a",
  color: "#999",
  borderTop: "1px solid #444",
  borderLeft: "1px solid #444",
  borderRight: "1px solid #444",
  borderBottom: "1px solid #444",
  borderRadius: "3px 3px 0 0",
  cursor: "pointer",
  fontSize: 11,
  textAlign: "center",
};

const activePartTabStyle: React.CSSProperties = {
  ...partTabStyle,
  background: "#383838",
  color: "#eee",
  borderBottom: "2px solid #0078d4",
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

const slidersContainerStyle: React.CSSProperties = {
  overflowY: "auto",
  padding: "0 4px",
  maxHeight: 250,
};

const sliderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 0",
};

const sliderLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#aaa",
  minWidth: 72,
};

const sliderInputStyle: React.CSSProperties = {
  flex: 1,
  height: 4,
  cursor: "pointer",
};

const sliderValueStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#888",
  minWidth: 48,
  textAlign: "right",
  fontFamily: "monospace",
};

const charSelectorStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "0 4px",
};

const charBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "6px 0",
  background: "#2a2a2a",
  color: "#999",
  borderTop: "1px solid #444",
  borderLeft: "1px solid #444",
  borderRight: "1px solid #444",
  borderBottom: "1px solid #444",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  textAlign: "center",
  fontWeight: "bold",
};

const activeCharBtnStyle: React.CSSProperties = {
  ...charBtnStyle,
  background: "#0078d4",
  color: "#fff",
  borderTop: "1px solid #0078d4",
  borderLeft: "1px solid #0078d4",
  borderRight: "1px solid #0078d4",
  borderBottom: "1px solid #0078d4",
};

const camSectionStyle: React.CSSProperties = {
  padding: "4px",
  background: "#1e1e1e",
  borderTop: "1px solid #444",
  borderBottom: "1px solid #444",
};

const camHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#ff0",
  marginBottom: 4,
};

const exportButtonStyle: React.CSSProperties = {
  padding: "8px 0",
  background: "#0078d4",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  margin: "0 4px 4px",
  flexShrink: 0,
};
