const pulseStyle: React.CSSProperties = {
  background: '#EDE7D9',
  animation: 'tc-pulse 1.5s ease infinite',
};

function Block({ h, w }: { h: number; w?: string }) {
  return <div style={{ ...pulseStyle, height: h, width: w ?? '100%' }} />;
}

export function CloserCardSkeleton() {
  return (
    <div style={{ border: '1px solid #D4C9A8', background: '#F7F2E9', padding: 24 }}>
      <div className="flex justify-between"><div className="flex gap-3"><Block h={44} w="44px" /><div className="space-y-2"><Block h={14} w="120px" /><Block h={10} w="180px" /></div></div><Block h={8} w="8px" /></div>
      <div className="flex gap-2 mt-3"><Block h={20} w="60px" /><Block h={20} w="50px" /><Block h={20} w="70px" /></div>
      <div className="grid grid-cols-3 gap-4 mt-4"><Block h={36} /><Block h={36} /><Block h={36} /></div>
    </div>
  );
}

export function JobCardSkeleton() {
  return (
    <div style={{ border: '1px solid #D4C9A8', background: '#F7F2E9', padding: 24 }}>
      <div className="flex justify-between"><div className="flex gap-3"><Block h={36} w="36px" /><Block h={12} w="100px" /></div><Block h={16} w="50px" /></div>
      <Block h={16} w="70%" /><div className="flex gap-2 mt-3"><Block h={20} w="60px" /><Block h={20} w="50px" /></div>
      <div className="grid grid-cols-2 gap-4 mt-4"><Block h={36} /><Block h={36} /></div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="max-w-[760px] mx-auto py-8 px-6">
      <div className="flex gap-4"><Block h={72} w="72px" /><div className="space-y-2 flex-1"><Block h={24} w="200px" /><Block h={14} w="300px" /><Block h={10} w="150px" /></div></div>
      <div className="grid grid-cols-4 gap-4 mt-6"><Block h={48} /><Block h={48} /><Block h={48} /><Block h={48} /></div>
      <Block h={120} w="100%" />
    </div>
  );
}

// Inject keyframes
if (typeof document !== 'undefined' && !document.getElementById('tc-pulse-style')) {
  const style = document.createElement('style');
  style.id = 'tc-pulse-style';
  style.textContent = '@keyframes tc-pulse{0%,100%{opacity:.6}50%{opacity:.3}}';
  document.head.appendChild(style);
}
