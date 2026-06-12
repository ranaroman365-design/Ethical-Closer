import { useEffect, useState } from 'react';
import { Upload, Download, History, Loader2, CheckCircle2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import AccessDenied from '@/components/members/AccessDenied';

interface PlaybookEntry {
  playbook_key: string;
  current_version: number;
  current_file_name: string;
  required_level: number;
  tier: string;
}

interface VersionRow {
  id: string;
  playbook_key: string;
  version: number;
  file_name: string;
  notes: string | null;
  uploaded_by: string | null;
  is_current: boolean;
  created_at: string;
}

/**
 * Admin-only: upload new versions of playbooks. Old versions remain
 * accessible via signed URLs (storage RLS allows any historical file
 * that belongs to a registered playbook the caller can access).
 */
export default function PlaybookVersionsAdmin() {
  const { isAdmin, isLoading } = useAuth();
  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [versionsByKey, setVersionsByKey] = useState<Record<string, VersionRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: regs }, { data: vers }] = await Promise.all([
      supabase.from('playbook_access_registry')
        .select('playbook_key, current_version, current_file_name, required_level, tier')
        .order('required_level'),
      supabase.from('playbook_versions')
        .select('id, playbook_key, version, file_name, notes, uploaded_by, is_current, created_at')
        .order('version', { ascending: false }),
    ]);
    setEntries((regs as PlaybookEntry[]) ?? []);
    const grouped: Record<string, VersionRow[]> = {};
    for (const v of (vers as VersionRow[]) ?? []) {
      (grouped[v.playbook_key] ||= []).push(v);
    }
    setVersionsByKey(grouped);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  if (isLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) return <AccessDenied requiredLevel="Admin" />;

  async function handleUpload(entry: PlaybookEntry, file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast({ title: 'Nur PDF erlaubt', variant: 'destructive' });
      return;
    }
    setUploading(entry.playbook_key);
    try {
      const nextVersion = entry.current_version + 1;
      const baseName = entry.current_file_name.replace(/_v\d+\.pdf$|\.pdf$/, '');
      const newFileName = `${baseName}_v${nextVersion}.pdf`;

      // 1. Upload to private 'playbooks' bucket (admin RLS allows insert)
      const { error: upErr } = await supabase.storage
        .from('playbooks')
        .upload(newFileName, file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;

      // 2. Register version (DB trigger demotes old current + syncs registry pointer)
      const { error: rpcErr } = await supabase.rpc('register_playbook_version', {
        _playbook_key: entry.playbook_key,
        _file_name: newFileName,
        _notes: notesByKey[entry.playbook_key] || null,
        _make_current: true,
      });
      if (rpcErr) throw rpcErr;

      toast({ title: `Version ${nextVersion} veröffentlicht`, description: newFileName });
      setNotesByKey((m) => ({ ...m, [entry.playbook_key]: '' }));
      await load();
    } catch (e: any) {
      toast({ title: 'Upload fehlgeschlagen', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  }

  async function handleDownloadVersion(playbookKey: string, version: number) {
    const { data, error } = await supabase.functions.invoke('playbook-download', {
      body: { playbook_key: playbookKey, version },
    });
    if (error || !data?.url) {
      toast({ title: 'Download fehlgeschlagen', variant: 'destructive' });
      return;
    }
    window.open(data.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Playbook-Versionen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Neue Versionen hochladen — alte Versionen bleiben dauerhaft erreichbar.
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const versions = versionsByKey[entry.playbook_key] ?? [];
            const isUp = uploading === entry.playbook_key;
            return (
              <Card key={entry.playbook_key} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-serif text-lg font-semibold">{entry.playbook_key}</h3>
                      <Badge variant="outline" className="font-mono text-[10px]">L{entry.required_level}</Badge>
                      <Badge variant="secondary" className="font-mono text-[10px]">v{entry.current_version}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground font-mono">{entry.current_file_name}</p>
                  </div>
                </div>

                {/* Upload */}
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <Label htmlFor={`notes-${entry.playbook_key}`} className="text-xs">
                      Versions-Notiz (optional)
                    </Label>
                    <Input
                      id={`notes-${entry.playbook_key}`}
                      value={notesByKey[entry.playbook_key] ?? ''}
                      onChange={(e) =>
                        setNotesByKey((m) => ({ ...m, [entry.playbook_key]: e.target.value }))
                      }
                      placeholder="z.B. Q2-Update, neue Compliance-Sektion"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <input
                      id={`file-${entry.playbook_key}`}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={isUp}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(entry, f);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      asChild
                      size="sm"
                      disabled={isUp}
                      className="bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)]"
                    >
                      <label htmlFor={`file-${entry.playbook_key}`} className="cursor-pointer">
                        {isUp
                          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                        Neue Version (v{entry.current_version + 1})
                      </label>
                    </Button>
                  </div>
                </div>

                {/* History */}
                {versions.length > 0 && (
                  <div className="mt-5 border-t border-border/40 pt-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <History className="h-3.5 w-3.5" />
                      Versionshistorie ({versions.length})
                    </div>
                    <div className="space-y-1.5">
                      {versions.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant={v.is_current ? 'default' : 'outline'} className="font-mono">
                              v{v.version}
                            </Badge>
                            {v.is_current && (
                              <CheckCircle2 className="h-3 w-3 text-[hsl(39,41%,55%)]" />
                            )}
                            <span className="truncate font-mono text-muted-foreground">{v.file_name}</span>
                            {v.notes && (
                              <span className="truncate italic text-muted-foreground/80">— {v.notes}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground/70">
                              {new Date(v.created_at).toLocaleDateString('de-DE')}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() => handleDownloadVersion(v.playbook_key, v.version)}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
