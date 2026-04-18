import { AppShell } from "../components/app-shell";
import { CallsPanel } from "../components/calls-panel";
import { TestCallPanel } from "../components/test-call-panel";

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

      <CallsPanel />
    </AppShell>
  );
}
