'use client';

type Props = {
  boneGroups: Record<string, string[]>;
  availableBones: Set<string>;
  currentPose: Record<string, { rx: number; ry: number; rz: number }>;
  selectedBone: string | null;
  openGroup: string | null;
  editingLabel: string;
  onSelectBone: (bone: string) => void;
  onToggleGroup: (group: string | null) => void;
  onUpdateAngle: (bone: string, axis: 'rx' | 'ry' | 'rz', value: number) => void;
};

export function BoneRotationPanelTmp({
  boneGroups, availableBones, currentPose, selectedBone, openGroup, editingLabel,
  onSelectBone, onToggleGroup, onUpdateAngle,
}: Props) {
  const getAngles = (bone: string) => currentPose[bone] || { rx: 0, ry: 0, rz: 0 };

  return (
    <>
      <div style={{ fontWeight: 'bold', color: '#4f4', fontSize: 11, marginBottom: 4 }}>
        Bone Rotations ({editingLabel})
      </div>
      <div style={{ fontSize: 9, color: '#888', marginBottom: 6 }}>Click bone on model or expand group</div>
      {Object.entries(boneGroups).map(([group, bones]) => {
        const avail = bones.filter(b => availableBones.has(b));
        if (!avail.length) return null;
        const isOpen = openGroup === group;
        return (
          <div key={group} style={{ marginBottom: 4 }}>
            <div onClick={() => onToggleGroup(isOpen ? null : group)} style={{
              cursor: 'pointer', padding: '4px 6px', borderRadius: 3,
              background: isOpen ? 'rgba(100,150,200,0.15)' : 'transparent',
              color: isOpen ? '#8cf' : '#999', fontSize: 11,
            }}>
              {isOpen ? '- ' : '+ '}{group} ({avail.length})
            </div>
            {isOpen && avail.map(bone => {
              const ang = getAngles(bone);
              const isSel = selectedBone === bone;
              return (
                <div key={bone} style={{
                  padding: '4px 8px', marginLeft: 8,
                  background: isSel ? 'rgba(255,200,0,0.1)' : 'transparent',
                  borderLeft: isSel ? '2px solid #fa0' : '2px solid transparent',
                }}>
                  <div onClick={() => onSelectBone(bone)} style={{
                    fontSize: 10, color: isSel ? '#fda' : '#aaa', cursor: 'pointer', marginBottom: 2,
                  }}>{bone}</div>
                  {(['rx', 'ry', 'rz'] as const).map(ax => (
                    <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 9, width: 14,
                        color: ax === 'rx' ? '#f88' : ax === 'ry' ? '#8f8' : '#88f',
                      }}>{ax.toUpperCase().slice(1)}</span>
                      <input type="range" min={-180} max={180} value={ang[ax]}
                        onChange={e => onUpdateAngle(bone, ax, Number(e.target.value))}
                        style={{ width: '100%', margin: '2px 0' }} />
                      <span style={{ fontSize: 9, color: '#888', minWidth: 28, textAlign: 'right' }}>{ang[ax]}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
