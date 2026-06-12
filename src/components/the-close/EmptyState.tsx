interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="py-12 px-6 text-center">
      <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '22px', color: '#7A7568' }}>{title}</h3>
      <p className="mt-2" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 300, color: '#7A7568' }}>{description}</p>
      {action && (
        <a href={action.href} className="inline-block mt-4 uppercase tracking-[0.2em]"
          style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '10px 20px', background: '#141410', color: '#F7F2E9', textDecoration: 'none' }}>
          {action.label}
        </a>
      )}
    </div>
  );
}
