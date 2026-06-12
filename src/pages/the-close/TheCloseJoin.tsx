import { useNavigate } from 'react-router-dom';

export default function TheCloseJoin() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#141410' }}>
      {/* Hero */}
      <div className="text-center mb-12 max-w-lg">
        <p className="uppercase tracking-[0.28em] text-[9px] mb-4" style={{ color: '#B8952A', fontFamily: 'DM Sans, sans-serif' }}>
          The Close
        </p>
        <h1 className="leading-[1.2] mb-3" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '38px', fontWeight: 300, color: '#F7F2E9' }}>
          Nicht jeder wird placed.<br />
          <em style={{ color: '#D4AF50' }}>Wer es wird, fängt hier an.</em>
        </h1>
        <p className="leading-relaxed" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 300, color: '#4A4840' }}>
          Wähle deine Rolle. Der Rest folgt.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px] w-full max-w-[640px]">
        {/* Closer */}
        <div className="p-10 px-8" style={{ background: '#F0EAD9', border: '1px solid #D4C9A8' }}>
          <p className="uppercase tracking-[0.22em] text-[9px] mb-3" style={{ color: '#B8952A', fontFamily: 'DM Sans, sans-serif' }}>Closer</p>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '26px', fontWeight: 400, color: '#141410' }}>Ich will placed werden.</h2>
          <div className="mt-3 space-y-0.5" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 300, color: '#7A7568', lineHeight: 1.7 }}>
            <p>Profil anlegen. Gefunden werden.</p>
            <p>Level A Deals. Auf eigenen Bedingungen.</p>
          </div>
          <button onClick={() => navigate('/the-close/onboarding/closer')} className="w-full mt-6 uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#141410', color: '#F7F2E9', border: 'none' }}>
            Zugang beantragen
          </button>
        </div>

        {/* Partner */}
        <div className="p-10 px-8" style={{ background: '#141410', border: '1px solid #262620' }}>
          <p className="uppercase tracking-[0.22em] text-[9px] mb-3" style={{ color: '#3A3830', fontFamily: 'DM Sans, sans-serif' }}>Partner</p>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '26px', fontWeight: 400, color: '#F7F2E9' }}>Ich suche den richtigen Closer.</h2>
          <div className="mt-3 space-y-0.5" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 300, color: '#4A4840', lineHeight: 1.7 }}>
            <p>Directory durchsuchen.</p>
            <p>Direkt anfragen. Ohne Umweg.</p>
          </div>
          <button onClick={() => navigate('/the-close/onboarding/partner')} className="w-full mt-6 uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#B8952A', color: '#141410', border: 'none' }}>
            Partner werden
          </button>
        </div>
      </div>

      <p className="mt-6 text-center" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#3A3830' }}>
        Bereits Teil des Netzwerks?{' '}
        <button onClick={() => navigate('/the-close/dashboard')} className="underline cursor-pointer" style={{ color: '#B8952A', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 'inherit' }}>
          Einloggen
        </button>
      </p>
    </div>
  );
}
