import { AppShell } from "../components/app-shell";
import { PhoneActivationForm } from "../components/phone-activation-form";

const settings = [
  { label: "LiveKit Verbindung", value: "Nicht konfiguriert" },
  { label: "SIP Provider", value: "Nicht konfiguriert" },
  { label: "Stripe Billing", value: "Nicht konfiguriert" },
  { label: "Audioaufzeichnung", value: "Aus" }
];

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
          {settings.map((setting) => (
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
