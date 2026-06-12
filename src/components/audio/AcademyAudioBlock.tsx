import { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AudioPlayer from './AudioPlayer';

interface Props {
  filePath: string;
  title?: string;
  duration?: number;
}

export default function AcademyAudioBlock({ filePath, title, duration }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.storage
      .from('audio-messages')
      .createSignedUrl(filePath, 300) // 5 min expiry
      .then(({ data }) => {
        if (data?.signedUrl) setSignedUrl(data.signedUrl);
      });
  }, [filePath]);

  if (!signedUrl) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <Volume2 className="h-4 w-4 text-muted-foreground animate-pulse" />
        <span className="text-xs text-muted-foreground">Audio wird geladen…</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      {title && (
        <div className="flex items-center gap-1.5 mb-1">
          <Volume2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
      )}
      <AudioPlayer src={signedUrl} duration={duration} />
    </div>
  );
}
