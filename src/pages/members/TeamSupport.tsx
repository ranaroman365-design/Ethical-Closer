import SupportTeamAdmin from '@/components/admin/SupportTeamAdmin';

export default function TeamSupport() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Team & Support</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verwalte den Dashboard-Bereich „Wer dich begleitet" — Sektions-Einstellungen, Rollen-Karten und Team-Mitglieder.
        </p>
      </div>
      <SupportTeamAdmin />
    </div>
  );
}
