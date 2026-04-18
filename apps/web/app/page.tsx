import { AppShell } from "./components/app-shell";
import { RestaurantDataPanel } from "./components/restaurant-data-panel";
import { TestCallPanel } from "./components/test-call-panel";

export default function DashboardPage() {
  return (
    <AppShell activePath="/">
      <header className="page-header">
        <div>
          <div className="eyebrow">SaaS Control Center</div>
          <h1>Self-Service Setup fuer Restaurant-Tenants</h1>
          <p className="muted">
            Bestellen, Restaurant anlegen, Menue pflegen, Telefonnummer verbinden und den ersten Testanruf direkt aus
            einem Flow heraus abschliessen.
          </p>
        </div>
        <TestCallPanel />
      </header>

      <div className="stack-lg">
        <RestaurantDataPanel section="dashboard" />
      </div>
    </AppShell>
  );
}
