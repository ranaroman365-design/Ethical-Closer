import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CloserProfile, JobOffer } from '@/types/the-close';

interface DirectContactModalProps {
  targetCloser: CloserProfile;
  jobs?: JobOffer[];
  onClose: () => void;
}

export function DirectContactModal({ targetCloser, jobs, onClose }: DirectContactModalProps) {
  const [message, setMessage] = useState('');
  const [jobId, setJobId] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt');
      const { error } = await (supabase.from as Function)('tc_direct_contacts').insert({
        from_user_id: user.id,
        to_user_id: targetCloser.user_id,
        message: message.trim(),
        job_offer_id: jobId || null,
      });
      if (error) throw error;
      toast.success('Nachricht gesendet. Der Closer wird benachrichtigt.');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      toast.error(msg);
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: '#14141090', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-[440px] mx-4 p-6" style={{ background: '#F7F2E9', border: '1px solid #D4C9A8' }} onClick={e => e.stopPropagation()}>
        <p className="uppercase tracking-[0.28em] text-[9px] mb-3" style={{ color: '#B8952A', fontFamily: 'DM Sans, sans-serif' }}>Direktkontakt</p>
        <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '22px', fontWeight: 300, color: '#141410' }}>
          Nachricht an {targetCloser.display_name}
        </h3>
        {jobs && jobs.length > 0 && (
          <div className="mt-4">
            <label className="block mb-1 uppercase tracking-[0.14em] text-[9px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Bezug zu Angebot (optional)</label>
            <select value={jobId} onChange={e => setJobId(e.target.value)} className="w-full p-3 outline-none cursor-pointer"
              style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }}>
              <option value="">Kein spezifisches Angebot</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
        )}
        <div className="mt-4">
          <label className="block mb-1 uppercase tracking-[0.14em] text-[9px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>Nachricht</label>
          <textarea value={message} onChange={e => setMessage(e.target.value.slice(0, 300))} maxLength={300} rows={4}
            className="w-full p-3 outline-none resize-none" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', background: '#F7F2E9', border: '1px solid #D4C9A8', color: '#141410' }} />
          <p className="text-right text-[10px]" style={{ fontFamily: 'DM Sans, sans-serif', color: '#7A7568' }}>{message.length}/300</p>
        </div>
        <button onClick={handleSend} disabled={sending || !message.trim()} className="w-full mt-2 uppercase tracking-[0.2em] cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', padding: '14px', background: '#141410', color: '#F7F2E9', border: 'none' }}>
          {sending ? '...' : 'Nachricht senden'}
        </button>
        <button onClick={onClose} className="w-full mt-2 cursor-pointer bg-transparent border-none" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#7A7568' }}>Abbrechen</button>
      </div>
    </div>
  );
}
