"use client";

import { apiBaseUrl, fetchJson } from "../lib/api";
import { useAuthSession } from "./use-auth-session";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/restaurants", label: "Restaurants" },
  { href: "/menus", label: "Speisekarten" },
  { href: "/orders", label: "Bestellungen" },
  { href: "/calls", label: "Anrufe" },
  { href: "/usage", label: "Usage" },
  { href: "/settings", label: "Einstellungen" }
];

type AppShellProps = {
  activePath: string;
  children: React.ReactNode;
};

export function AppShell({ activePath, children }: AppShellProps) {
  const { status, session, setSession } = useAuthSession();

  async function logout() {
    await fetch(`${apiBaseUrl}/v1/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => null);

    window.localStorage.removeItem("restaurant-ai:selected-restaurant-id");
    window.location.href = "/login";
  }

  async function switchTenant(tenantId: string) {
    try {
      await fetchJson("/v1/auth/switch-tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId })
      });

      if (!session) {
        return;
      }

      const nextTenant = session.tenants.find((tenant) => tenant.tenantId === tenantId)?.tenant ?? null;

      setSession({
        ...session,
        tenant: nextTenant
      });
      window.localStorage.removeItem("restaurant-ai:selected-restaurant-id");
      window.location.href = "/";
    } catch {
      window.location.href = "/login";
    }
  }

  if (status === "loading") {
    return (
      <div className="shell shell-loading">
        <main className="main">
          <div className="card">Sitzung wird geladen...</div>
        </main>
      </div>
    );
  }

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }

    return null;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Kebab AI</div>
        <div className="sidebar-user">
          <strong>{session?.user.name ?? session?.user.email}</strong>
          <div className="sidebar-meta">{session?.user.email}</div>
          <div className="sidebar-meta">{session?.tenant?.name ?? "Kein Tenant"}</div>
        </div>

        {session && session.tenants.length > 1 ? (
          <label className="sidebar-select">
            <span>Aktives Tenant</span>
            <select
              value={session.tenant?.id ?? ""}
              onChange={(event) => switchTenant(event.target.value)}
            >
              {session.tenants.map((membership) => (
                <option key={membership.tenantId} value={membership.tenantId}>
                  {membership.tenant.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <nav className="nav" aria-label="Hauptnavigation">
          {navItems.map((item) => (
            <a className={activePath === item.href ? "active" : undefined} href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <button className="button button-secondary" onClick={logout} type="button">
          Abmelden
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
