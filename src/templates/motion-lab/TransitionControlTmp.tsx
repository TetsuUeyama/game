'use client';

import type { Keyframe } from '@/types/motion';
import { RefObject } from 'react';

type Props = {
  keyframes: Keyframe[];
  editingKf: number;
  playing: boolean;
  transitionDuration: number;
  loopMode: 'once' | 'pingpong';
  frameDisplayRef: RefObject<HTMLSpanElement | null>;
  onSelectKf: (idx: number) => void;
  onResetPose: () => void;
  onSetDuration: (dur: number) => void;
  onSetLoopMode: (mode: 'once' | 'pingpong') => void;
  onTogglePlay: () => void;
};

export function TransitionControlTmp({
  keyframes, editingKf, playing, transitionDuration, loopMode,
  frameDisplayRef,
  onSelectKf, onResetPose, onSetDuration, onSetLoopMode, onTogglePlay,
}: Props) {
  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, marginTop: 4 }}>
        {keyframes.map((kf, i) => (
          <button key={i} onClick={() => onSelectKf(i)} style={{
            flex: 1, padding: '5px', fontSize: 11, borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
            border: editingKf === i ? '2px solid #fa0' : '1px solid #555',
            background: editingKf === i ? 'rgba(180,120,0,0.25)' : 'rgba(40,40,60,0.4)',
            color: editingKf === i ? '#fda' : '#999',
          }}>{kf.label}</button>
        ))}
      </div>

      <button onClick={onResetPose} style={{
        width: '100%', padding: '4px', fontSize: 10, marginTop: 8, marginBottom: 12,
        background: 'rgba(200,50,50,0.2)', color: '#faa', border: '1px solid #a44',
        borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
      }}>Reset {keyframes[editingKf].label}</button>

      <div style={{ fontWeight: 'bold', color: '#c8a', fontSize: 11, marginBottom: 4 }}>Transition</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#888' }}>Duration:</span>
        <input type="range" min={10} max={300} value={transitionDuration}
          onChange={e => onSetDuration(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#c8a', minWidth: 30 }}>{transitionDuration}f</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['pingpong', 'once'] as const).map(m => (
          <button key={m} onClick={() => onSetLoopMode(m)} style={{
            flex: 1, padding: '3px', fontSize: 10, borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
            border: loopMode === m ? '1px solid #c8a' : '1px solid #555',
            background: loopMode === m ? 'rgba(150,100,200,0.2)' : 'transparent',
            color: loopMode === m ? '#c8a' : '#888',
          }}>{m === 'pingpong' ? 'Ping-Pong' : 'A→B Loop'}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={onTogglePlay} style={{
          padding: '6px 16px', fontSize: 12, fontWeight: 'bold', borderRadius: 4,
          cursor: 'pointer', fontFamily: 'monospace',
          border: playing ? '2px solid #f44' : '2px solid #4f4',
          background: playing ? 'rgba(80,20,20,0.4)' : 'rgba(20,80,20,0.4)',
          color: playing ? '#faa' : '#afa',
        }}>{playing ? 'Stop' : 'Play'}</button>
        <span ref={frameDisplayRef} style={{ fontSize: 10, color: '#888' }}>0/0</span>
      </div>
      <div style={{ padding: '8px', background: 'rgba(60,30,80,0.3)', borderRadius: 4, border: '1px solid rgba(150,100,200,0.3)' }}>
        <div style={{ fontSize: 11, color: '#c8a', fontWeight: 'bold', marginBottom: 4 }}>Hit Reaction</div>
        <div style={{ fontSize: 10, color: '#999' }}>
          {playing ? 'Click any body part to apply hit impulse.' : 'Click a body part to select for editing. Start playback for hit reactions.'}
        </div>
      </div>
    </>
  );
}
