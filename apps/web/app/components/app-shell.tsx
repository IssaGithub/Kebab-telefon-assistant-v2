const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/restaurants", label: "Restaurants" },
  { href: "/menus", label: "Speisekarten" },
  { href: "/orders", label: "Bestellungen" },
  { href: "/calls", label: "Anrufe" },
  { href: "/settings", label: "Einstellungen" }
];

type AppShellProps = {
  activePath: string;
  children: React.ReactNode;
};

export function AppShell({ activePath, children }: AppShellProps) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Kebab AI</div>
        <nav className="nav" aria-label="Hauptnavigation">
          {navItems.map((item) => (
            <a className={activePath === item.href ? "active" : undefined} href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

