import { AppShell } from "../components/app-shell";
import { RestaurantDataPanel } from "../components/restaurant-data-panel";

export default function RestaurantsPage() {
  return (
    <AppShell activePath="/restaurants">
      <header className="page-header">
        <div>
          <div className="eyebrow">Restaurants</div>
          <h1>Restaurant-Onboarding</h1>
          <p className="muted">
            Lege neue Betriebe an und begleite sie bis zum ersten aktiven Telefonassistenten.
          </p>
        </div>
      </header>

      <div className="stack-lg">
        <RestaurantDataPanel section="restaurants" />
        <section className="card">
          <h2>Tenant-Zugriff</h2>
          <p className="muted">
            Neue Accounts und das erste Restaurant werden ueber die oeffentliche Login-Seite angelegt. Weitere
            restaurantbezogene Daten in diesem Dashboard sind automatisch auf das aktive Tenant beschraenkt.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
