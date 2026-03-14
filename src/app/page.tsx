import Link from 'next/link';

const pages = [
  { href: '/realistic-viewer', label: 'Realistic Viewer' },
  { href: '/equip-config', label: 'Equipment Behavior Config' },
  { href: '/model-import', label: 'Model Import' },
  { href: '/template-editor', label: 'Template Editor' },
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
