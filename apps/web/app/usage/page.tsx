 "use client";

import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { fetchJson, formatMoney, type UsageSummary } from "../lib/api";

function renderCount(value: number | null) {
  return value === null ? "Nicht verfuegbar" : value.toLocaleString("de-DE");
}

function renderMoney(value: number | null) {
  return value === null ? "Nicht konfiguriert" : formatMoney(value);
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const payload = await fetchJson<UsageSummary>("/v1/usage/summary");

        if (!active) {
          return;
        }

        setUsage(payload);
        setStatus("ready");
      } catch {
        if (active) {
          setStatus("error");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell activePath="/usage">
      <header className="page-header">
        <div>
          <div className="eyebrow">Usage</div>
          <h1>Token- und Kostenuebersicht</h1>
          <p className="muted">
            Diese Seite kombiniert lokal messbare Nutzung mit konfigurierbaren Kostensaetzen. Exakte Restkontingente
            der Provider sind ohne Billing-API-Anbindung nicht verfuegbar.
          </p>
        </div>
      </header>

      {status === "loading" ? (
        <section className="card">Usage-Daten werden geladen...</section>
      ) : status === "error" || !usage ? (
        <section className="card">Usage-Daten konnten aktuell nicht geladen werden.</section>
      ) : (
        <div className="stack-lg">
          <section className="grid compact-grid">
            <article className="summary-card">
              <p className="eyebrow">Volumen</p>
              <div className="metrics metrics-compact">
                <div className="card inset-card">
                  <div className="metric-value">{usage.totals.calls}</div>
                  <div className="muted">Calls</div>
                </div>
                <div className="card inset-card">
                  <div className="metric-value">{usage.totals.orders}</div>
                  <div className="muted">Orders</div>
                </div>
                <div className="card inset-card">
                  <div className="metric-value">{usage.totals.livekitRooms}</div>
                  <div className="muted">LiveKit Rooms</div>
                </div>
                <div className="card inset-card">
                  <div className="metric-value">{usage.totals.callMinutes.toLocaleString("de-DE")}</div>
                  <div className="muted">Call-Minuten</div>
                </div>
              </div>
            </article>

            <article className="summary-card">
              <p className="eyebrow">Token</p>
              <div className="status-row">
                <strong>Geschaetzte Input-Tokens</strong>
                <span>{renderCount(usage.tokens.estimatedInputTokens)}</span>
              </div>
              <div className="status-row">
                <strong>Geschaetzte Output-Tokens</strong>
                <span>{renderCount(usage.tokens.estimatedOutputTokens)}</span>
              </div>
              <div className="status-row">
                <strong>Gesamt geschaetzt</strong>
                <span>{renderCount(usage.tokens.estimatedTotalTokens)}</span>
              </div>
              <div className="status-row">
                <strong>Verbleibendes Gesamtbudget</strong>
                <span>{renderCount(usage.tokens.remainingTotal)}</span>
              </div>
            </article>
          </section>

          <section className="grid compact-grid">
            <article className="card stack-md">
              <h2>Kosten nach Service</h2>
              <div className="status-row">
                <strong>LiveKit</strong>
                <span>{renderMoney(usage.costs.livekitCents)}</span>
              </div>
              <div className="status-row">
                <strong>Speech-to-Text</strong>
                <span>{renderMoney(usage.costs.sttCents)}</span>
              </div>
              <div className="status-row">
                <strong>Text-to-Speech</strong>
                <span>{renderMoney(usage.costs.ttsCents)}</span>
              </div>
              <div className="status-row">
                <strong>LLM Input</strong>
                <span>{renderMoney(usage.costs.llmInputCents)}</span>
              </div>
              <div className="status-row">
                <strong>LLM Output</strong>
                <span>{renderMoney(usage.costs.llmOutputCents)}</span>
              </div>
              <div className="status-row">
                <strong>Gesamtkosten bekannt</strong>
                <span className="pill">{renderMoney(usage.costs.totalKnownCents)}</span>
              </div>
            </article>

            <article className="card stack-md">
              <h2>Preis-Konfiguration</h2>
              <div className="status-row">
                <strong>`LIVEKIT_COST_PER_MINUTE`</strong>
                <span>{usage.pricingConfig.livekitCostPerMinute ?? "nicht gesetzt"}</span>
              </div>
              <div className="status-row">
                <strong>`STT_COST_PER_MINUTE`</strong>
                <span>{usage.pricingConfig.sttCostPerMinute ?? "nicht gesetzt"}</span>
              </div>
              <div className="status-row">
                <strong>`TTS_COST_PER_1K_CHARS`</strong>
                <span>{usage.pricingConfig.ttsCostPer1kChars ?? "nicht gesetzt"}</span>
              </div>
              <div className="status-row">
                <strong>`LLM_INPUT_COST_PER_1M_TOKENS`</strong>
                <span>{usage.pricingConfig.llmInputCostPer1mTokens ?? "nicht gesetzt"}</span>
              </div>
              <div className="status-row">
                <strong>`LLM_OUTPUT_COST_PER_1M_TOKENS`</strong>
                <span>{usage.pricingConfig.llmOutputCostPer1mTokens ?? "nicht gesetzt"}</span>
              </div>
            </article>
          </section>

          <section className="card stack-md">
            <h2>Hinweise</h2>
            {usage.tracked.notes.map((note) => (
              <div className="muted" key={note}>
                {note}
              </div>
            ))}
          </section>
        </div>
      )}
    </AppShell>
  );
}
