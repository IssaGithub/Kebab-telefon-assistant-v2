import { AppShell } from "../components/app-shell";
import { TestCallPanel } from "../components/test-call-panel";

const calls = [
  {
    caller: "+49 30 1234567",
    restaurant: "Demo Kebab",
    outcome: "Bestellung vorbereitet",
    duration: "03:42"
  },
  {
    caller: "Unbekannt",
    restaurant: "Demo Kebab",
    outcome: "Testanruf",
    duration: "00:58"
  }
];

export default function CallsPage() {
  return (
    <AppShell activePath="/calls">
      <header className="page-header">
        <div>
          <div className="eyebrow">Anrufe</div>
          <h1>Anrufhistorie</h1>
          <p className="muted">Ueberwache Telefonate, Transkripte, Dauer und Agent-Ergebnisse.</p>
        </div>
        <TestCallPanel />
      </header>

      <section className="card">
        <h2>Letzte Anrufe</h2>
        {calls.map((call) => (
          <div className="order-row" key={`${call.caller}-${call.duration}`}>
            <div>
              <strong>{call.caller}</strong>
              <div className="muted">{call.restaurant} · {call.outcome}</div>
            </div>
            <span className="pill">{call.duration}</span>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
