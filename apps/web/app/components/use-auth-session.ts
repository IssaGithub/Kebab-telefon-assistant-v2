"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
    emailVerifiedAt: string | null;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  tenants: Array<{
    tenantId: string;
    role: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
};

export function useAuthSession() {
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const payload = await fetchJson<AuthSession>("/v1/auth/me");

        if (!active) {
          return;
        }

        setSession(payload);
        setStatus("authenticated");
      } catch {
        if (!active) {
          return;
        }

        setSession(null);
        setStatus("unauthenticated");
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return {
    status,
    session,
    setSession
  };
}
