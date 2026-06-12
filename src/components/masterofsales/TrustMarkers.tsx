/**
 * Schmaler Trust-Block direkt vor den Testimonials. Vier ruhige Marker,
 * die das Versprechen "Auswahl statt Druck" konkret machen. Keine
 * Erfolgsbilder, keine Zahlen.
 */
const markers = [
  {
    title: "Persönliche Auswahl",
    body: "Jede Bewerbung wird manuell gesichtet. Wir nehmen nur Menschen auf, die wir wirklich weiterbringen.",
  },
  {
    title: "Begrenzte Plätze",
    body: "Wir wachsen langsam. Lieber wenige starke Wege als viele halbherzige.",
  },
  {
    title: "Transparente Struktur",
    body: "Klare Stufen, klare Erwartungen, klare Vergütung. Nichts wird im Kleingedruckten versteckt.",
  },
  {
    title: "Keine Netzwerk-Akquise",
    body: "Du arbeitest mit echten Partnerunternehmen — niemals mit deiner Familie oder deinem Freundeskreis.",
  },
];

const TrustMarkers = () => {
  return (
    <section
      id="trust-markers"
      className="border-b border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            Worauf du dich verlassen kannst
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight md:text-4xl">
            Vier ruhige Versprechen — eingehalten, nicht inszeniert.
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {markers.map((m) => (
            <div
              key={m.title}
              className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-6"
            >
              <span className="h-1 w-8 rounded-full bg-accent" />
              <h3 className="font-serif text-xl leading-tight">{m.title}</h3>
              <p className="text-sm leading-relaxed text-foreground/70">
                {m.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustMarkers;
