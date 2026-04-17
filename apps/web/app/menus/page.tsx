import { AppShell } from "../components/app-shell";

const menuTasks = [
  "PDF- oder CSV-Import vorbereiten",
  "Kategorien und Artikel pruefen",
  "Optionen wie scharf, ohne Zwiebeln oder extra Fleisch erfassen",
  "Preise fuer den KI-Agenten freigeben"
];

export default function MenusPage() {
  return (
    <AppShell activePath="/menus">
      <header className="page-header">
        <div>
          <div className="eyebrow">Speisekarten</div>
          <h1>Menues fuer den KI-Agenten</h1>
          <p className="muted">Strukturierte Speisekarten verhindern falsche Preise und erfundene Artikel.</p>
        </div>
        <button className="button" type="button">Speisekarte importieren</button>
      </header>

      <section className="card">
        <h2>Naechste Aufgaben</h2>
        <div className="status-list">
          {menuTasks.map((task) => (
            <div className="status-row" key={task}>
              <strong>{task}</strong>
              <span className="pill">Offen</span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

