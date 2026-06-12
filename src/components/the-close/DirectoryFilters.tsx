import { useState } from 'react';

interface DirectoryFilters {
  searchQuery: string;
  industries: string[];
  languages: string[];
  availability: 'all' | 'available' | 'open';
  hasEtcBadge: boolean;
}

interface DirectoryFiltersProps {
  filters: DirectoryFilters;
  onChange: (filters: DirectoryFilters) => void;
  viewerTierRank: number;
}

const INDUSTRIES = ['Coaching', 'SaaS', 'Finance', 'Real Estate', 'Health', 'Other'];
const LANGUAGES = ['Deutsch', 'Englisch', 'Spanisch', 'Französisch'];
const AVAILABILITY_OPTIONS: { value: DirectoryFilters['availability']; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'available', label: 'Verfügbar' },
  { value: 'open', label: 'Offen' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase',
      letterSpacing: '0.2em', color: '#7A7568', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function toggleArrayItem(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];
}

export default function DirectoryFilters({ filters, onChange, viewerTierRank }: DirectoryFiltersProps) {
  const update = (partial: Partial<DirectoryFilters>) => onChange({ ...filters, ...partial });

  const sectionStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid #D4C9A8',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: '#F7F2E9' }}>
      {/* Search */}
      <div style={sectionStyle}>
        <SectionLabel>Suche</SectionLabel>
        <input
          type="text"
          placeholder="Name oder Headline"
          value={filters.searchQuery}
          onChange={e => update({ searchQuery: e.target.value })}
          style={{
            padding: '8px 12px', border: '1px solid #D4C9A8', background: '#F7F2E9',
            fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#141410',
            outline: 'none', width: '100%',
          }}
        />
      </div>

      {/* Availability */}
      <div style={sectionStyle}>
        <SectionLabel>Verfügbarkeit</SectionLabel>
        <div style={{ display: 'flex', gap: 4 }}>
          {AVAILABILITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update({ availability: opt.value })}
              style={{
                fontFamily: 'DM Sans, sans-serif', fontSize: 9, textTransform: 'uppercase',
                padding: '5px 10px', cursor: 'pointer', border: '1px solid',
                ...(filters.availability === opt.value
                  ? { background: '#141410', color: '#F7F2E9', borderColor: '#141410' }
                  : { background: 'transparent', color: '#7A7568', borderColor: '#D4C9A8' }),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Industries */}
      <div style={sectionStyle}>
        <SectionLabel>Branchen</SectionLabel>
        {INDUSTRIES.map(ind => (
          <label key={ind} style={{ display: 'flex', alignItems: 'center', marginBottom: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filters.industries.includes(ind)}
              onChange={() => update({ industries: toggleArrayItem(filters.industries, ind) })}
              style={{ accentColor: '#B8952A' }}
            />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 300, color: '#3A3830', marginLeft: 6 }}>
              {ind}
            </span>
          </label>
        ))}
      </div>

      {/* Languages */}
      <div style={sectionStyle}>
        <SectionLabel>Sprachen</SectionLabel>
        {LANGUAGES.map(lang => (
          <label key={lang} style={{ display: 'flex', alignItems: 'center', marginBottom: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filters.languages.includes(lang)}
              onChange={() => update({ languages: toggleArrayItem(filters.languages, lang) })}
              style={{ accentColor: '#B8952A' }}
            />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 300, color: '#3A3830', marginLeft: 6 }}>
              {lang}
            </span>
          </label>
        ))}
      </div>

      {/* ETC Badge filter — Silver+ only */}
      {viewerTierRank >= 2 && (
        <div style={sectionStyle}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filters.hasEtcBadge}
              onChange={() => update({ hasEtcBadge: !filters.hasEtcBadge })}
              style={{ accentColor: '#B8952A' }}
            />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 300, color: '#3A3830', marginLeft: 6 }}>
              Nur ETC-zertifizierte Closer
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
