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
];

export default function Home() {
  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>Pages</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
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
