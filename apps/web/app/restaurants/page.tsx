import { AppShell } from "../components/app-shell";

const restaurants = [
  {
    name: "Demo Kebab",
    city: "Berlin",
    status: "Onboarding",
    menus: 0
  }
];

export default function RestaurantsPage() {
  return (
    <AppShell activePath="/restaurants">
      <header className="page-header">
        <div>
          <div className="eyebrow">Restaurants</div>
          <h1>Restaurant-Onboarding</h1>
          <p className="muted">Lege neue Betriebe an und begleite sie bis zum ersten aktiven Telefonassistenten.</p>
        </div>
        <button className="button" type="button">Restaurant anlegen</button>
      </header>

      <section className="card">
        <h2>Pilotbetriebe</h2>
        {restaurants.map((restaurant) => (
          <div className="status-row" key={restaurant.name}>
            <div>
              <strong>{restaurant.name}</strong>
              <div className="muted">{restaurant.city} · {restaurant.menus} Speisekarten</div>
            </div>
            <span className="pill warning">{restaurant.status}</span>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

