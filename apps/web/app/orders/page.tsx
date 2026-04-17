import { AppShell } from "../components/app-shell";

const orders = [
  {
    id: "#1001",
    summary: "2x Doener, 1x Cola",
    customer: "Demo Kunde",
    status: "Wartet"
  },
  {
    id: "#1000",
    summary: "1x Pizza Margherita",
    customer: "Abholung",
    status: "Angenommen"
  }
];

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

      <section className="card">
        <h2>Aktuelle Bestellungen</h2>
        {orders.map((order) => (
          <div className="order-row" key={order.id}>
            <div>
              <strong>{order.id} · {order.customer}</strong>
              <div className="muted">{order.summary}</div>
            </div>
            <span className={order.status === "Wartet" ? "pill warning" : "pill"}>{order.status}</span>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

