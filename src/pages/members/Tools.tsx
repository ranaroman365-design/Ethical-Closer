import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';

export default function Tools() {
  const { tx } = useLanguage();

  const categories = [
    {
      name: 'CRM',
      tools: [
        { title: 'GoHighLevel', description: tx('CRM, Funnels & Automations für dein Closing Business.', 'CRM, funnels & automations for your closing business.'), link: '#' },
      ],
    },
    {
      name: tx('Kommunikation', 'Communication'),
      tools: [
        { title: 'WhatsApp Business', description: tx('Professionelle Kundenkommunikation.', 'Professional client communication.'), link: '#' },
        { title: 'Calendly', description: tx('Terminbuchung und Kalender-Management.', 'Appointment booking and calendar management.'), link: '#' },
      ],
    },
    {
      name: 'AI Tools',
      tools: [
        { title: 'ChatGPT', description: tx('Gesprächsvorbereitung und Research.', 'Call preparation and research.'), link: '#' },
        { title: 'Otter.ai', description: tx('Call Recording und Transkription.', 'Call recording and transcription.'), link: '#' },
      ],
    },
    {
      name: 'Sales Tools',
      tools: [
        { title: 'Loom', description: tx('Video-Nachrichten für Follow-ups.', 'Video messages for follow-ups.'), link: '#' },
        { title: 'Stripe Dashboard', description: tx('Zahlungen und Provisionen im Überblick.', 'Payments and commissions at a glance.'), link: '#' },
      ],
    },
    {
      name: tx('Dokumente', 'Documents'),
      tools: [
        { title: 'Google Drive', description: tx('Gemeinsame Ressourcen, Templates und Scripts.', 'Shared resources, templates, and scripts.'), link: '#' },
        { title: 'Notion Workspace', description: tx('Organisiere deine Pipeline und Notizen.', 'Organize your pipeline and notes.'), link: '#' },
      ],
    },
  ];

  const systemItems = [
    { name: 'Lovable', desc: tx('Zentrale Lern- und Fortschrittsplattform', 'Central learning and progress platform') },
    { name: 'GoHighLevel', desc: tx('Bewerbung, Onboarding und Kommunikation', 'Application, onboarding, and communication') },
    { name: 'Stripe / Mollie', desc: tx('Zahlungsabwicklung', 'Payment processing') },
    { name: 'Circle', desc: tx('Community, Peer Learning und Ankündigungen', 'Community, peer learning, and announcements') },
    { name: 'Google Drive', desc: tx('Templates, Scripts und Dokumente', 'Templates, scripts, and documents') },
  ];

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Tools
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx('Alle Tools und Ressourcen für deinen Closer-Alltag.', 'All tools and resources for your daily closer workflow.')}
        </p>
      </div>

      {/* System Architecture */}
      <div className="mb-8 rounded-xl border border-border/40 bg-card p-5">
        <h2 className="mb-3 font-serif text-base font-semibold text-foreground">
          {tx('System Architektur', 'System Architecture')}
        </h2>
        <div className="space-y-2 text-[13px]">
          {systemItems.map(item => (
            <div key={item.name} className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="font-medium text-foreground">{item.name}</span>
              <span className="text-muted-foreground">— {item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tool Categories */}
      {categories.map(cat => (
        <div key={cat.name} className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {cat.name}
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {cat.tools.map(tool => (
              <div key={tool.title} className="flex items-center gap-4 rounded-xl border border-border/40 bg-card p-4 transition-all hover:border-border/70">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-foreground">{tool.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{tool.description}</p>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
