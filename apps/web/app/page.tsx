import { AppShell } from "./components/app-shell";
import { TestCallPanel } from "./components/test-call-panel";

const onboardingSteps = [
  { label: "Restaurantprofil", status: "Bereit" },
  { label: "Speisekarte importieren", status: "Naechster Schritt" },
  { label: "Telefonnummer verbinden", status: "Offen" },
  { label: "Testanruf", status: "Offen" }
];

const recentOrders = [
  {
    customer: "Demo Kunde",
    summary: "2x Doener, 1x Cola, Lieferung",
    total: "22,50 EUR",
    status: "Wartet"
  },
  {
    customer: "Abholung",
    summary: "1x Pizza Margherita, extra Kaese",
    total: "10,00 EUR",
    status: "Angenommen"
  }
];

export default function DashboardPage() {
  return (
    <AppShell activePath="/">
        <header className="page-header">
          <div>
            <div className="eyebrow">SaaS Control Center</div>
            <h1>KI-Telefonbestellungen fuer Restaurants</h1>
            <p className="muted">
              Verwalte Onboarding, Speisekarten, Telefonnummern und Bestellungen fuer den ersten Pilotbetrieb.
            </p>
          </div>
          <TestCallPanel />
        </header>

        <section className="grid metrics" aria-label="Kennzahlen">
          <div className="card">
            <div className="metric-value">0</div>
            <div className="muted">aktive Restaurants</div>
          </div>
          <div className="card">
            <div className="metric-value">0</div>
            <div className="muted">Anrufe heute</div>
          </div>
          <div className="card">
            <div className="metric-value">0</div>
            <div className="muted">offene Bestellungen</div>
          </div>
          <div className="card">
            <div className="metric-value">0 min</div>
            <div className="muted">KI-Nutzung</div>
          </div>
        </section>

        <section className="grid content-grid" style={{ marginTop: 18 }}>
          <div className="card">
            <h2>Onboarding Pipeline</h2>
            <div className="status-list">
              {onboardingSteps.map((step) => (
                <div className="status-row" key={step.label}>
                  <div>
                    <strong>{step.label}</strong>
                    <div className="muted">Self-Service Setup fuer ein Restaurant</div>
                  </div>
                  <span className={step.status === "Naechster Schritt" ? "pill warning" : "pill"}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Letzte Bestellungen</h2>
            {recentOrders.map((order) => (
              <div className="order-row" key={`${order.customer}-${order.summary}`}>
                <div>
                  <strong>{order.customer}</strong>
                  <div className="muted">{order.summary}</div>
                </div>
                <div>
                  <strong>{order.total}</strong>
                  <div className="muted">{order.status}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
    </AppShell>
  );
}
