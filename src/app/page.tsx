import Link from 'next/link';

const pages = [
  { href: '/character-move-1on1', label: 'Character Move 1on1' },
  { href: '/league', label: 'League' },
  { href: '/league/match', label: 'League Match' },
  { href: '/teams', label: 'Teams' },
  { href: '/admin/upload', label: 'Admin Upload' },
  { href: '/vox-viewer', label: 'Vox Viewer' },
  { href: '/vox-viewer2', label: 'Vox Viewer 2' },
  { href: '/vox-compare', label: 'Vox Compare' },
  { href: '/fbx-viewer', label: 'Voxel Body Mover' },
  { href: '/equip-config', label: 'Equipment Behavior Config' },
  { href: '/bone-config', label: 'Bone Config (Skeleton Setup)' },
  { href: '/model-import', label: 'Model Import' },
  { href: '/template-editor', label: 'Template Editor' },
  { href: '/fight', label: 'Fight' },
  { href: '/cap-viewer', label: 'Cap Viewer' },
];

export default function Home() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Pages</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            target="_blank"
            style={{
              display: 'block',
              padding: '0.75rem 1.25rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              textAlign: 'center',
              fontSize: '1rem',
            }}
          >
            {page.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
