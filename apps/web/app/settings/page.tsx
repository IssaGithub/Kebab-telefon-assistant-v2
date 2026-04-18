import { AppShell } from "../components/app-shell";
import { PhoneActivationForm } from "../components/phone-activation-form";

export default function SettingsPage() {
  return (
    <AppShell activePath="/settings">
      <header className="page-header">
        <div>
          <div className="eyebrow">Einstellungen</div>
          <h1>Plattform-Konfiguration</h1>
          <p className="muted">Konfiguriere Telefonie, Abrechnung, Datenschutz und Agent-Verhalten.</p>
        </div>
      </header>

      <div className="grid content-grid">
        <PhoneActivationForm />

        <section className="card">
          <h2>Integrationen</h2>
          {[
            { label: "LiveKit Verbindung", value: "Ueber /v1/system/capabilities pruefbar" },
            { label: "SIP Provider", value: "Aktivierbar pro Restaurant" },
            { label: "Stripe Billing", value: "Noch nicht integriert" },
            { label: "Audioaufzeichnung", value: "Im AgentConfig-Modell vorgesehen" }
          ].map((setting) => (
            <div className="status-row" key={setting.label}>
              <strong>{setting.label}</strong>
              <span className="pill warning">{setting.value}</span>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
