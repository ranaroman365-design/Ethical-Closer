import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

interface SetterRow {
  setter_id: string;
  name: string;
  calls_assigned: number;
  calls_attended: number;
  calls_no_show: number;
  calls_qualified: number;
  show_rate: number;
  qual_rate: number;
  score: number;
}

export default function SetterCloserTable({ range }: { range: string }) {
  const [rows, setRows] = useState<SetterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [range]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('setter_performance')
      .select('*')
      .order('show_rate', { ascending: false });

    const mapped: SetterRow[] = (data ?? []).map((r: any) => {
      const showRate = r.show_rate ?? (r.calls_assigned > 0 ? r.calls_attended / r.calls_assigned : 0);
      const qualRate = r.qualification_rate ?? (r.calls_attended > 0 ? r.calls_qualified / r.calls_attended : 0);
      const score = Math.round(showRate * 50 + qualRate * 50);
      return {
        setter_id: r.setter_id,
        name: r.setter_id?.slice(0, 8) ?? '—',
        calls_assigned: r.calls_assigned ?? 0,
        calls_attended: r.calls_attended ?? 0,
        calls_no_show: r.calls_no_show ?? 0,
        calls_qualified: r.calls_qualified ?? 0,
        show_rate: Math.round(showRate * 100),
        qual_rate: Math.round(qualRate * 100),
        score,
      };
    });

    // Enrich with profile names
    const ids = mapped.map(m => m.setter_id).filter(Boolean);
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const nameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]));
      mapped.forEach(m => { if (nameMap[m.setter_id]) m.name = nameMap[m.setter_id]; });
    }

    mapped.sort((a, b) => b.score - a.score);
    setRows(mapped);
    setLoading(false);
  }

  if (loading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Setter / Closer Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Setter-Daten vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 pr-4">Name</th>
                  <th className="text-right py-2 px-2">Calls</th>
                  <th className="text-right py-2 px-2">Show Rate</th>
                  <th className="text-right py-2 px-2">Qualified</th>
                  <th className="text-right py-2 px-2">No-Show</th>
                  <th className="text-right py-2 pl-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isTop = i === 0 && rows.length > 1;
                  const isBottom = i === rows.length - 1 && rows.length > 2;
                  return (
                    <tr key={r.setter_id} className="border-b border-border/20">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        {r.name}
                        {isTop && <Badge className="ml-2 text-[9px] bg-primary/10 text-primary border-primary/20">Top</Badge>}
                        {isBottom && <Badge variant="destructive" className="ml-2 text-[9px]">Low</Badge>}
                      </td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{r.calls_assigned}</td>
                      <td className={`text-right py-2 px-2 font-semibold ${r.show_rate < 60 ? 'text-destructive' : 'text-foreground'}`}>{r.show_rate}%</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{r.calls_qualified}</td>
                      <td className={`text-right py-2 px-2 ${r.calls_no_show > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{r.calls_no_show}</td>
                      <td className="text-right py-2 pl-2 font-bold text-foreground">{r.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
