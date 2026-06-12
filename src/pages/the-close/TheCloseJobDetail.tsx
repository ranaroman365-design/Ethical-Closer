import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTheCloseUser } from '@/hooks/the-close/useTheCloseUser';
import { TierBadge } from '@/components/the-close/TierBadge';
import TierUpgradeBanner from '@/components/the-close/TierUpgradeBanner';
import type { TierKey } from '@/types/the-close';
import { TIER_RANK, TIER_LABEL } from '@/types/the-close';

const roleLabels: Record<string, string> = { closer: 'Closer', setter: 'Setter', sales_manager: 'Sales Manager', other: 'Sonstige' };
const locationLabels: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Vor Ort' };

export default function TheCloseJobDetail() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, tierRank, isCloser, isAuthenticated } = useTheCloseUser();

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data, error } = await (supabase.from as Function)('tc_job_offers')
        .select('*, partner:tc_partner_profiles(*)')
        .eq('id', jobId)
        .single();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setJob(data);

      // Views counter (fire and forget)
      (supabase.from as Function)('tc_job_offers')
        .update({ views_count: (data.views_count ?? 0) + 1 })
        .eq('id', jobId)
        .then(() => {});

      // Check if already applied
      if (user) {
        const { data: cp } = await supabase.from('closer_profiles').select('id').eq('user_id', user.id).single();
        if (cp) {
          const { data: existing } = await (supabase.from as Function)('tc_job_applications')
            .select('id, applied_at')
            .eq('job_id', jobId)
            .eq('closer_id', cp.id)
            .maybeSingle();
          if (existing) {
            setHasApplied(true);
            setAppliedAt(existing.applied_at);
          }
        }
      }
      setLoading(false);
    })();
  }, [jobId, user?.id]);

  const handleApply = async () => {
    if (!user || !isCloser) { navigate('/the-close/join'); return; }
    setSubmitting(true);
    const { data: cp } = await supabase.from('closer_profiles').select('id').eq('user_id', user.id).single();
    if (!cp) { setSubmitting(false); return; }
    const { error } = await (supabase.from as Function)('tc_job_applications').insert({
      job_id: jobId,
      closer_id: cp.id,
      message: message.trim() || null,
      status: 'sent',
    });
    if (!error) {
      setHasApplied(true);
      setAppliedAt(new Date().toISOString());
    }
    setSubmitting(false);
  };

  // --- LOADING ---
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F2E9' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
          <div style={{ background: '#EDE7D9', height: 60, animation: 'tc-pulse 1.5s ease infinite', marginBottom: 16 }} />
          <div style={{ background: '#EDE7D9', height: 300, animation: 'tc-pulse 1.5s ease infinite' }} />
        </div>
        <style>{`@keyframes tc-pulse { 0%,100% { opacity:.6 } 50% { opacity:.3 } }`}</style>
      </div>
    );
  }

  // --- NOT FOUND ---
  if (notFound || !job) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F2E9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 300, color: '#7A7568' }}>Position nicht gefunden.</div>
        <button onClick={() => navigate('/the-close/jobs')} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#B8952A', background: 'none', border: 'none', cursor: 'pointer', marginTop: 16 }}>
          ← Zurück zum Job Board
        </button>
      </div>
    );
  }

  const jobMinTier = (job.min_tier as TierKey) || 'bronze';
  const isGated = tierRank < (TIER_RANK[jobMinTier] ?? 1);

  const dealRange =
    job.deal_size_min && job.deal_size_max
      ? `€${job.deal_size_min.toLocaleString('de-DE')} – €${job.deal_size_max.toLocaleString('de-DE')}`
      : job.deal_size_min
        ? `ab €${job.deal_size_min.toLocaleString('de-DE')}`
        : job.deal_size_max
          ? `bis €${job.deal_size_max.toLocaleString('de-DE')}`
          : '—';

  const tags = [
    roleLabels[job.role_type] || job.role_type,
    locationLabels[job.location_type] || job.location_type,
    job.industry,
    ...(job.languages || []),
  ].filter(Boolean);

  // --- TIER GATE ---
  if (isGated) {
    return (
      <div style={{ minHeight: '100vh', background: '#F7F2E9' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
          <button onClick={() => navigate('/the-close/jobs')} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#B8952A', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0 }}>
            ← Zurück zum Job Board
          </button>
          <div style={{ background: '#F0EAD9', border: '1px solid #D4C9A8', padding: 48, textAlign: 'center' }}>
            <TierBadge size="md" tier={jobMinTier} />
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 24, fontWeight: 300, color: '#141410', marginTop: 16 }}>
              Diese Position ist ab {TIER_LABEL[jobMinTier]} sichtbar.
            </div>
            <div style={{ maxWidth: 400, margin: '16px auto 0' }}>
              <TierUpgradeBanner requiredTier={jobMinTier} message="Um Details und Anforderungen zu sehen." />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN CONTENT ---
  return (
    <div style={{ minHeight: '100vh', background: '#F7F2E9' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        {/* Back */}
        <button onClick={() => navigate('/the-close/jobs')} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#B8952A', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, padding: 0 }}>
          ← Zurück zum Job Board
        </button>

        {/* 2-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }} className="tc-detail-grid">
          {/* CONTENT COLUMN */}
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500, color: '#3A3830' }}>
                {job.partner?.company_name}
              </span>
              {job.partner?.is_verified && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, color: '#B8952A', border: '1px solid #B8952A40', padding: '1px 6px' }}>
                  ✓ Verifiziert
                </span>
              )}
            </div>
            <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 32, fontWeight: 300, color: '#141410', margin: '6px 0' }}>
              {job.title}
            </h1>

            {/* Tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
              {tags.map((tag, i) => (
                <span key={i} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, padding: '2px 8px', border: '1px solid #D4C9A860', background: '#EDE7D9', color: '#7A7568' }}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Deal Info Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid #D4C9A8', padding: '16px 0', marginBottom: 24 }}>
              <InfoCell value={dealRange} label="Deal Size" />
              <InfoCell value={job.commission_rate ?? '—'} label="Commission" border />
              <InfoCell value={`${job.min_experience_years}+ Jahre`} label="Erfahrung" border />
            </div>

            {/* Beschreibung */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#7A7568' }}>
                Die Position
              </div>
              <div style={{ height: 1, background: '#D4C9A8', margin: '8px 0 16px' }} />
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 300, color: '#3A3830', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {job.description ?? 'Keine Beschreibung vorhanden.'}
              </div>
            </div>

            {/* Anforderungen */}
            {job.requirements && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#7A7568', marginBottom: 10 }}>
                  Voraussetzungen
                </div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 300, color: '#3A3830', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {job.requirements}
                </div>
              </div>
            )}

            {/* ETC Badge Section */}
            {job.requires_etc_badge && (
              <div style={{ background: '#F0EAD9', border: '1px solid #D4C9A8', padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
                <div style={{ width: 24, height: 24, background: 'linear-gradient(135deg, #B8952A, #D4AF50)', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#3A3830' }}>
                  ETC Badge erforderlich. Nur zertifizierte Closer werden berücksichtigt.
                </span>
              </div>
            )}
          </div>

          {/* SIDEBAR COLUMN */}
          <div>
            {/* Partner Info Card */}
            <div style={{ border: '1px solid #D4C9A8', padding: 20, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                {job.partner?.logo_url ? (
                  <img src={job.partner.logo_url} alt={job.partner.company_name} style={{ width: 48, height: 48, objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: 48, height: 48, background: '#EDE7D9', border: '1px solid #D4C9A8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: '#B8952A' }}>
                    {job.partner?.company_name?.[0] || '?'}
                  </div>
                )}
                <div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, color: '#141410' }}>
                    {job.partner?.company_name}
                  </div>
                  {job.partner?.is_verified && (
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, color: '#B8952A', border: '1px solid #B8952A40', padding: '1px 6px' }}>
                      ✓ Verifiziert
                    </span>
                  )}
                </div>
              </div>
              {job.partner?.industry && (
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#7A7568', marginBottom: 4 }}>{job.partner.industry}</div>
              )}
              {job.partner?.company_size && (
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#7A7568', marginBottom: 4 }}>{job.partner.company_size}</div>
              )}
              {job.partner?.website_url && (
                <a href={job.partner.website_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, color: '#B8952A', textDecoration: 'none' }}>
                  Website besuchen →
                </a>
              )}
              {job.partner?.description && (
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#7A7568', marginTop: 12, lineHeight: 1.6 }}>
                  {job.partner.description}
                </div>
              )}
              {tierRank >= 2 && (
                <button
                  onClick={() => {/* Sprint 6: DirectContactModal */}}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    background: '#141410',
                    color: '#F7F2E9',
                    padding: '10px 0',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Partner kontaktieren
                </button>
              )}
            </div>

            {/* APPLY BOX */}
            <div style={{ border: '1px solid #D4C9A8', padding: 20 }}>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7A7568', marginBottom: 12 }}>
                Bewerben
              </div>

              {hasApplied ? (
                <div style={{ background: '#F0EAD9', padding: 16 }}>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#22C55E' }}>✓ Bewerbung eingereicht</div>
                  {appliedAt && (
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#7A7568', marginTop: 4 }}>
                      Am {new Date(appliedAt).toLocaleDateString('de-DE')}
                    </div>
                  )}
                </div>
              ) : !isAuthenticated ? (
                <div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#7A7568', marginBottom: 12 }}>
                    Melde dich an um dich zu bewerben.
                  </div>
                  <button
                    onClick={() => navigate('/the-close/join')}
                    style={{
                      width: '100%',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      background: '#141410',
                      color: '#F7F2E9',
                      padding: '12px 0',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Zugang beantragen
                  </button>
                </div>
              ) : isCloser ? (
                <div>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value.slice(0, 500))}
                    maxLength={500}
                    rows={3}
                    placeholder="Warum passt du zu dieser Position?"
                    style={{
                      width: '100%',
                      padding: 10,
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 12,
                      border: '1px solid #D4C9A8',
                      background: '#F7F2E9',
                      color: '#141410',
                      resize: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, color: '#7A7568', textAlign: 'right', marginTop: 2 }}>
                    {message.length}/500
                  </div>
                  <button
                    onClick={handleApply}
                    disabled={submitting}
                    style={{
                      width: '100%',
                      marginTop: 12,
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      background: '#141410',
                      color: '#F7F2E9',
                      padding: '12px 0',
                      border: 'none',
                      cursor: 'pointer',
                      opacity: submitting ? 0.5 : 1,
                    }}
                  >
                    {submitting ? '...' : 'Jetzt bewerben'}
                  </button>
                </div>
              ) : (
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 300, color: '#7A7568' }}>
                  Nur Closer können sich bewerben.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Responsive override for mobile */}
      <style>{`
        @keyframes tc-pulse { 0%,100% { opacity:.6 } 50% { opacity:.3 } }
        @media (max-width: 768px) {
          .tc-detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function InfoCell({ value, label, border }: { value: string; label: string; border?: boolean }) {
  return (
    <div style={{ padding: '0 20px', textAlign: 'center', ...(border ? { borderLeft: '1px solid #D4C9A8' } : {}) }}>
      <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 300, color: '#141410' }}>{value}</div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#7A7568', marginTop: 2 }}>{label}</div>
    </div>
  );
}
