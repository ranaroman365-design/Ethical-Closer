import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function TheCloseBlackInvitation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A08' }}>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#5A5850' }}>Diese Seite existiert nicht.</p>
      </div>
    );
  }

  const handleAccept = async () => {
    setStatus('loading');
    try {
      const { data, error } = await supabase.functions.invoke('grant-black-tier', { body: { token } });
      if (error || !data?.success) {
        setErrorMsg(data?.error ?? error?.message ?? 'Einladung konnte nicht angenommen werden.');
        setStatus('error');
        return;
      }
      setStatus('success');
      setTimeout(() => navigate('/the-close/dashboard'), 2500);
    } catch {
      setErrorMsg('Ein Fehler ist aufgetreten.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A08' }}>
        <div className="text-center">
          <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '36px', fontWeight: 300, color: '#F7F2E9' }}>Willkommen.</h1>
          <p className="mt-2" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', fontWeight: 300, color: '#D4AF50', fontStyle: 'italic' }}>Black Member.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A08' }}>
      <div className="text-center max-w-md px-6">
        <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '36px', fontWeight: 300, color: '#F7F2E9' }}>Du wurdest eingeladen.</h1>
        <div className="my-6 mx-auto" style={{ width: 60, height: 1, background: '#B8952A' }} />
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', fontWeight: 300, color: '#5A5850' }}>Black ist nicht käuflich. Es wird verdient.</p>
        {status === 'error' && <p className="mt-4" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#EF4444' }}>{errorMsg}</p>}
        <button onClick={handleAccept} disabled={status === 'loading'}
          className="mt-8 uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px 32px', background: '#F7F2E9', color: '#0A0A08', border: 'none' }}>
          {status === 'loading' ? '...' : 'Einladung annehmen'}
        </button>
      </div>
    </div>
  );
}
