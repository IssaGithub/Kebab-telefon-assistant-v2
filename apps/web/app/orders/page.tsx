import { AppShell } from "../components/app-shell";
import { OrdersPanel } from "../components/orders-panel";

export default function OrdersPage() {
  return (
    <AppShell activePath="/orders">
      <header className="page-header">
        <div>
          <div className="eyebrow">Bestellungen</div>
          <h1>Live-Bestelluebersicht</h1>
          <p className="muted">Hier landen KI-Bestellungen, bevor das Restaurant sie annimmt oder ablehnt.</p>
        </div>
      </header>

      <OrdersPanel />
    </AppShell>
  );
}
