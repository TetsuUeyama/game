import Link from 'next/link';

const pages = [
  { href: '/qm-mustardui-preview', label: 'QM MustardUI Preview' },
  { href: '/blackwidow-preview',   label: 'BlackWidow Preview' },
  { href: '/anna-preview',         label: 'Anna Preview' },
  { href: '/nina-preview',         label: 'Nina Preview' },
  { href: '/ahsoka-preview',       label: 'Ahsoka Preview' },
  { href: '/joanna-preview',       label: 'Joanna Dark Preview' },
  { href: '/shaakti-preview',      label: 'Shaak Ti Preview' },
  { href: '/ivy-preview',          label: 'Ivy Valentine Preview' },
  { href: '/shermie-preview',      label: 'Shermie Preview' },
  { href: '/sheva-preview',        label: 'Sheva Preview' },
  { href: '/darkelfblader-preview', label: 'Dark Elf Blader Preview' },
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
