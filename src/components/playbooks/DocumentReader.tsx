import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, List, Bookmark, BookmarkCheck,
  Search, X, ChevronDown, ChevronUp, Check, Clock, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

// ─── Types ───────────────────────────────────────────────────────────

export interface DocSection {
  id: string;
  title: string;
  /** Optional subtitle / duration label */
  subtitle?: string;
  content: string; // HTML-safe markdown-ish content (rendered via dangerouslySetInnerHTML)
  /** Nested sub-sections rendered as collapsible blocks */
  children?: DocSection[];
}

export interface DocumentData {
  id: string;
  title: string;
  version: string;
  subtitle: string;
  sections: DocSection[];
}

// ─── Persistence helpers (localStorage per user+doc) ─────────────────

function storageKey(userId: string, docId: string, suffix: string) {
  return `etc:reader:${userId}:${docId}:${suffix}`;
}

function loadSet(userId: string, docId: string, suffix: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId, docId, suffix));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveSet(userId: string, docId: string, suffix: string, s: Set<string>) {
  localStorage.setItem(storageKey(userId, docId, suffix), JSON.stringify([...s]));
}

function loadNumber(userId: string, docId: string, suffix: string): number {
  try {
    return Number(localStorage.getItem(storageKey(userId, docId, suffix))) || 0;
  } catch { return 0; }
}
function saveNumber(userId: string, docId: string, suffix: string, n: number) {
  localStorage.setItem(storageKey(userId, docId, suffix), String(n));
}

// ─── Component ───────────────────────────────────────────────────────

interface Props {
  document: DocumentData;
  backTo?: string;
}

export default function DocumentReader({ document: doc, backTo = '/members/playbooks' }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? 'anon';

  // Flatten sections for navigation
  const allSections = useMemo(() => {
    const flat: DocSection[] = [];
    function walk(sections: DocSection[]) {
      for (const s of sections) {
        flat.push(s);
        if (s.children) walk(s.children);
      }
    }
    walk(doc.sections);
    return flat;
  }, [doc.sections]);

  // Active section index (top-level for page nav)
  const [activeIdx, setActiveIdx] = useState(() => loadNumber(userId, doc.id, 'page'));
  const topSections = doc.sections;

  // Clamp
  const idx = Math.min(activeIdx, topSections.length - 1);
  const currentSection = topSections[idx];

  // Persist page
  useEffect(() => { saveNumber(userId, doc.id, 'page', idx); }, [idx, userId, doc.id]);

  // Read sections (retention: track which sections user has visited)
  const [readSections, setReadSections] = useState<Set<string>>(() => loadSet(userId, doc.id, 'read'));
  useEffect(() => {
    if (!currentSection) return;
    setReadSections(prev => {
      const next = new Set(prev);
      next.add(currentSection.id);
      saveSet(userId, doc.id, 'read', next);
      return next;
    });
  }, [currentSection?.id, userId, doc.id]);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => loadSet(userId, doc.id, 'bookmarks'));
  const toggleBookmark = (sectionId: string) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      saveSet(userId, doc.id, 'bookmarks', next);
      return next;
    });
  };

  // Reading time tracking
  const [totalSeconds, setTotalSeconds] = useState(() => loadNumber(userId, doc.id, 'time'));
  useEffect(() => {
    const interval = setInterval(() => {
      setTotalSeconds(prev => {
        const next = prev + 1;
        saveNumber(userId, doc.id, 'time', next);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [userId, doc.id]);

  // TOC panel
  const [tocOpen, setTocOpen] = useState(false);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allSections
      .filter(s => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q))
      .map(s => ({ id: s.id, title: s.title, snippet: extractSnippet(s.content, q) }));
  }, [searchQuery, allSections]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Navigate to section by id
  const goToSection = useCallback((sectionId: string) => {
    const topIdx = topSections.findIndex(s => s.id === sectionId || s.children?.some(c => c.id === sectionId));
    if (topIdx >= 0) {
      setActiveIdx(topIdx);
      setTocOpen(false);
      setSearchOpen(false);
      // Scroll to child if needed
      setTimeout(() => {
        const el = window.document.getElementById(`section-${sectionId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [topSections]);

  // Progress
  const readPct = topSections.length > 0 ? (readSections.size / topSections.length) * 100 : 0;
  const minutes = Math.floor(totalSeconds / 60);

  // Content ref for scroll-to-top on page change
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [idx]);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-background">
      {/* ─── Top Bar ─── */}
      <header className="flex items-center justify-between border-b border-border/40 bg-card px-3 py-2 md:px-5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[200px] md:max-w-md">{doc.title}</p>
            <p className="text-[10px] text-muted-foreground">{doc.version}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Reading stats */}
          <div className="mr-2 hidden items-center gap-3 text-[10px] text-muted-foreground sm:flex">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{minutes} min</span>
            <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{Math.round(readPct)}%</span>
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSearchOpen(!searchOpen); setTocOpen(false); }}>
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setTocOpen(!tocOpen); setSearchOpen(false); }}>
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => currentSection && toggleBookmark(currentSection.id)}
          >
            {currentSection && bookmarks.has(currentSection.id)
              ? <BookmarkCheck className="h-4 w-4 text-[hsl(39,41%,55%)]" />
              : <Bookmark className="h-4 w-4" />
            }
          </Button>
        </div>
      </header>

      {/* ─── Progress bar ─── */}
      <Progress value={readPct} className="h-1 rounded-none" />

      {/* ─── Search overlay ─── */}
      {searchOpen && (
        <div className="border-b border-border/40 bg-card px-3 py-2 md:px-5">
          <div className="relative">
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={lang === 'de' ? 'Im Dokument suchen…' : 'Search document…'}
              className="pr-8 text-sm"
            />
            {searchQuery && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')}>
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {searchResults.map(r => (
                <button
                  key={r.id}
                  className="w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors"
                  onClick={() => goToSection(r.id)}
                >
                  <p className="font-medium text-foreground">{r.title}</p>
                  <p className="text-muted-foreground line-clamp-1">{r.snippet}</p>
                </button>
              ))}
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{lang === 'de' ? 'Keine Ergebnisse' : 'No results'}</p>
          )}
        </div>
      )}

      {/* ─── Main content area ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* TOC sidebar (desktop: side panel, mobile: overlay) */}
        {tocOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setTocOpen(false)} />
            <aside className="fixed left-0 top-0 z-40 h-full w-72 border-r border-border/40 bg-card md:relative md:z-auto md:block md:w-64 md:shrink-0">
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {lang === 'de' ? 'Inhaltsverzeichnis' : 'Table of Contents'}
                </h3>
                <button onClick={() => setTocOpen(false)} className="md:hidden">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <ScrollArea className="h-[calc(100%-48px)]">
                <nav className="space-y-0.5 p-3">
                  {/* Bookmarks section */}
                  {bookmarks.size > 0 && (
                    <div className="mb-3">
                      <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(39,41%,55%)]">
                        <BookmarkCheck className="h-3 w-3" />
                        {lang === 'de' ? 'Lesezeichen' : 'Bookmarks'}
                      </p>
                      {topSections.filter(s => bookmarks.has(s.id)).map(s => (
                        <button
                          key={`bm-${s.id}`}
                          className="w-full rounded px-2 py-1 text-left text-[11px] text-[hsl(39,41%,55%)] hover:bg-muted/50"
                          onClick={() => goToSection(s.id)}
                        >
                          {s.title}
                        </button>
                      ))}
                      <div className="my-2 border-b border-border/30" />
                    </div>
                  )}

                  {topSections.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => { setActiveIdx(i); setTocOpen(false); }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors',
                        i === idx
                          ? 'bg-[hsl(39,41%,55%)]/10 text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      {readSections.has(s.id) && (
                        <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                      )}
                      <span className="flex-1 truncate">{s.title}</span>
                      {bookmarks.has(s.id) && <BookmarkCheck className="h-3 w-3 shrink-0 text-[hsl(39,41%,55%)]" />}
                    </button>
                  ))}
                </nav>
              </ScrollArea>
            </aside>
          </>
        )}

        {/* Content pane */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <article className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
            {/* Section header */}
            <div className="mb-6">
              <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[hsl(39,41%,55%)]">
                {idx + 1} / {topSections.length}
              </p>
              <h2 id={`section-${currentSection?.id}`} className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
                {currentSection?.title}
              </h2>
              {currentSection?.subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{currentSection.subtitle}</p>
              )}
            </div>

            {/* Main content */}
            <div
              className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:font-serif prose-headings:text-foreground
                prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3
                prose-h4:text-base prose-h4:mt-6 prose-h4:mb-2
                prose-p:text-[14px] prose-p:leading-relaxed prose-p:text-foreground/85
                prose-li:text-[14px] prose-li:text-foreground/85
                prose-blockquote:border-[hsl(39,41%,55%)]/40 prose-blockquote:bg-[hsl(39,41%,55%)]/5 prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:text-foreground/90 prose-blockquote:not-italic
                prose-strong:text-foreground prose-strong:font-semibold
                prose-table:text-[13px]
                prose-th:bg-muted/30 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-foreground
                prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border/30
                [&_mark]:bg-[hsl(39,41%,55%)]/20 [&_mark]:text-foreground [&_mark]:px-1 [&_mark]:rounded
                [&_.tip]:border-l-2 [&_.tip]:border-[hsl(39,41%,55%)] [&_.tip]:bg-[hsl(39,41%,55%)]/5 [&_.tip]:px-4 [&_.tip]:py-3 [&_.tip]:rounded-r-lg [&_.tip]:my-4 [&_.tip]:text-[13px]
                [&_.warn]:border-l-2 [&_.warn]:border-red-400 [&_.warn]:bg-red-500/5 [&_.warn]:px-4 [&_.warn]:py-3 [&_.warn]:rounded-r-lg [&_.warn]:my-4 [&_.warn]:text-[13px]
                [&_.script-line]:bg-muted/30 [&_.script-line]:border-l-3 [&_.script-line]:border-[hsl(39,41%,55%)]/60 [&_.script-line]:px-4 [&_.script-line]:py-3 [&_.script-line]:rounded-r-lg [&_.script-line]:my-3 [&_.script-line]:italic [&_.script-line]:text-[14px]
              "
              dangerouslySetInnerHTML={{ __html: currentSection?.content ?? '' }}
            />

            {/* Children sections */}
            {currentSection?.children?.map(child => (
              <ChildSection
                key={child.id}
                section={child}
                isRead={readSections.has(child.id)}
                onRead={() => {
                  setReadSections(prev => {
                    const next = new Set(prev);
                    next.add(child.id);
                    saveSet(userId, doc.id, 'read', next);
                    return next;
                  });
                }}
              />
            ))}
          </article>
        </div>
      </div>

      {/* ─── Bottom navigation ─── */}
      <footer className="flex items-center justify-between border-t border-border/40 bg-card px-4 py-2.5">
        <Button
          variant="ghost" size="sm"
          disabled={idx === 0}
          onClick={() => setActiveIdx(Math.max(0, idx - 1))}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{lang === 'de' ? 'Zurück' : 'Previous'}</span>
        </Button>

        <div className="flex items-center gap-1.5">
          {topSections.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'h-2 w-2 rounded-full transition-all',
                i === idx ? 'bg-[hsl(39,41%,55%)] w-5' : readSections.has(topSections[i].id) ? 'bg-emerald-500/60' : 'bg-muted-foreground/30'
              )}
              aria-label={`Page ${i + 1}`}
            />
          ))}
        </div>

        <Button
          variant="ghost" size="sm"
          disabled={idx >= topSections.length - 1}
          onClick={() => setActiveIdx(Math.min(topSections.length - 1, idx + 1))}
          className="gap-1.5"
        >
          <span className="hidden sm:inline">{lang === 'de' ? 'Weiter' : 'Next'}</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </footer>
    </div>
  );
}

// ─── Child section (collapsible) ─────────────────────────────────────

function ChildSection({ section, isRead, onRead }: { section: DocSection; isRead: boolean; onRead: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && !isRead) onRead();
  }, [open, isRead, onRead]);

  return (
    <div id={`section-${section.id}`} className="mt-6 rounded-lg border border-border/40 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          {isRead && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          <span className="text-sm font-semibold text-foreground">{section.title}</span>
          {section.subtitle && <span className="text-xs text-muted-foreground">· {section.subtitle}</span>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div
          className="border-t border-border/30 px-4 py-4 prose prose-sm dark:prose-invert max-w-none
            prose-p:text-[14px] prose-p:leading-relaxed
            prose-blockquote:border-[hsl(39,41%,55%)]/40 prose-blockquote:bg-[hsl(39,41%,55%)]/5 prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
            [&_.script-line]:bg-muted/30 [&_.script-line]:border-l-3 [&_.script-line]:border-[hsl(39,41%,55%)]/60 [&_.script-line]:px-4 [&_.script-line]:py-3 [&_.script-line]:rounded-r-lg [&_.script-line]:my-3 [&_.script-line]:italic
            [&_.tip]:border-l-2 [&_.tip]:border-[hsl(39,41%,55%)] [&_.tip]:bg-[hsl(39,41%,55%)]/5 [&_.tip]:px-4 [&_.tip]:py-3 [&_.tip]:rounded-r-lg [&_.tip]:my-4
            [&_.warn]:border-l-2 [&_.warn]:border-red-400 [&_.warn]:bg-red-500/5 [&_.warn]:px-4 [&_.warn]:py-3 [&_.warn]:rounded-r-lg [&_.warn]:my-4
          "
          dangerouslySetInnerHTML={{ __html: section.content }}
        />
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractSnippet(html: string, query: string): string {
  const text = html.replace(/<[^>]+>/g, '');
  const lower = text.toLowerCase();
  const pos = lower.indexOf(query);
  if (pos < 0) return text.slice(0, 80);
  const start = Math.max(0, pos - 30);
  const end = Math.min(text.length, pos + query.length + 50);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
