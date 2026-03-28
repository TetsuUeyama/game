'use client';

import { RefObject } from 'react';

type Props = {
  selectedMotion: string;
  selectedMotionB: string;
  blendDuration: number;
  animPlaying: boolean;
  animFrameRef: RefObject<number>;
  frameDisplayRef: RefObject<HTMLSpanElement | null>;
  frameCount: number;
  onMotionChange: (val: string) => void;
  onMotionBChange: (val: string) => void;
  onBlendDurationChange: (val: number) => void;
  onTogglePlay: () => void;
};

export function AnimationControlTmp({
  selectedMotion, selectedMotionB, blendDuration, animPlaying,
  frameDisplayRef, frameCount,
  onMotionChange, onMotionBChange, onBlendDurationChange, onTogglePlay,
}: Props) {
  const ss = {
    width: '100%', padding: '4px 6px', fontSize: 11, marginBottom: 6,
    background: '#1a1a2e', color: '#ddd', border: '1px solid #555',
    borderRadius: 4, fontFamily: 'monospace' as const,
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 'bold', color: '#fa0', fontSize: 13, marginBottom: 6 }}>
        Animation
      </div>
      <select value={selectedMotion} onChange={(e) => onMotionChange(e.target.value)} style={ss}>
        <option value="">Walk Cycle (default)</option>
        <option value="ero_pose_01.motion.json">Ero Pose 01</option>
        <option value="ero_pose_02.motion.json">Ero Pose 02</option>
        <option value="ero_pose_03.motion.json">Ero Pose 03</option>
        <option value="nursing_handjob.motion.json">Nursing Handjob (CE)</option>
        <option value="nursing_handjob_qm.motion.json">Nursing Handjob (QM)</option>
        <option value="doggy_qm.motion.json">Doggy (QM)</option>
        <option value="blowjob_qm.motion.json">Blowjob (QM)</option>
        <option value="reverse_cowgirl_qm.motion.json">Reverse Cowgirl (QM)</option>
        <option value="amazon_qm.motion.json">Amazon (QM)</option>
        <option value="missionary_qm.motion.json">Missionary (QM)</option>
        <option value="tall_qm.motion.json">Tall (QM)</option>
        <option value="tallqueenspooning_qm_detailed.motion.json">TallQueen Spooning (QM Detailed)</option>
        <option value="spin_qm_detailed.motion.json">Spin (QM Detailed)</option>
        <option value="riding_default.motion.json">Riding Default</option>
        <option value="riding_full_start.motion.json">Riding Full Start</option>
        <option value="riding_mid.motion.json">Riding Mid</option>
        <option value="riding_loop_extended.motion.json">Riding Loop Extended</option>
        <option value="riding_loop_extended_raw.motion.json">Riding Loop Extended (RAW/New)</option>
        <option value="bunnyakali_cozywinter.motion.json">BunnyAkali CozyWinter</option>
        <option value="bunnyakali_reversecowgirl.motion.json">BunnyAkali ReverseCowgirl</option>
        <option value="darkelfblader_titsuck.motion.json">DarkElfBlader TitSuck</option>
      </select>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Motion B (blend to)</div>
      <select value={selectedMotionB} onChange={(e) => onMotionBChange(e.target.value)} style={{ ...ss, color: '#adf', border: '1px solid #446' }}>
        <option value="">(none - loop A)</option>
        <option value="walk_cycle_arp.motion.json">Walk Cycle</option>
        <option value="bunnyakali_cozywinter.motion.json">BunnyAkali CozyWinter</option>
        <option value="bunnyakali_reversecowgirl.motion.json">BunnyAkali ReverseCowgirl</option>
        <option value="darkelfblader_titsuck.motion.json">DarkElfBlader TitSuck</option>
        <option value="riding_loop_extended_raw.motion.json">Riding Loop Extended (RAW)</option>
      </select>
      {selectedMotionB && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#888' }}>Blend:</span>
          <input type="range" min={5} max={120} value={blendDuration}
            onChange={(e) => onBlendDurationChange(Number(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: '#adf', minWidth: 35 }}>{blendDuration}f</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button onClick={onTogglePlay} style={{
          padding: '6px 16px', fontSize: 12, fontWeight: 'bold',
          border: animPlaying ? '2px solid #f44' : '2px solid #4f4',
          borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
          background: animPlaying ? 'rgba(80,20,20,0.4)' : 'rgba(20,80,20,0.4)',
          color: animPlaying ? '#faa' : '#afa',
        }}>
          {animPlaying ? 'Stop' : 'Play'}
        </button>
        <span ref={frameDisplayRef} style={{ fontSize: 10, color: '#888' }}>
          Frame: 0/{frameCount}
        </span>
      </div>
    </div>
  );
}
