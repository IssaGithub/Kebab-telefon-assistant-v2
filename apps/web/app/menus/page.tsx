import { AppShell } from "../components/app-shell";
import { MenuBuilder } from "../components/menu-builder";

export default function MenusPage() {
  return (
    <AppShell activePath="/menus">
      <header className="page-header">
        <div>
          <div className="eyebrow">Speisekarten</div>
          <h1>Menues fuer den KI-Agenten</h1>
          <p className="muted">Strukturierte Speisekarten verhindern falsche Preise und erfundene Artikel.</p>
        </div>
      </header>

      <MenuBuilder />
    </AppShell>
  );
}
