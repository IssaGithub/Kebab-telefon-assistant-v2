"use client";

import { Room, RoomEvent, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { apiBaseUrl, fetchJson, formatMoney, type CallRecord, type DemoCallSession } from "../lib/api";
import { useSelectedRestaurant } from "./use-selected-restaurant";

type ViewState = {
  status: "idle" | "loading" | "error" | "success";
  message: string;
};

type BrowserCallSession = {
  token: string;
  url: string;
  roomName: string;
  identity: string;
};

const BROWSER_CALL_AUDIO_TIMEOUT_MS = 12000;

function browserCallFailureHint() {
  return "Kein Audio vom Agenten empfangen. Wahrscheinliche Ursache: LiveKit Inference ist nicht verfuegbar oder die Quote ist leer.";
}

function extractSystemHint(transcriptText: string | null | undefined) {
  if (!transcriptText) {
    return null;
  }

  const lines = transcriptText.split("\n").map((line) => line.trim()).filter(Boolean);
  const systemLine = [...lines].reverse().find((line) => line.startsWith("Agent: Systemhinweis:"));
  return systemLine ? systemLine.replace("Agent: ", "") : null;
}

export function DemoCallPanel() {
  const { restaurantId, setRestaurantId } = useSelectedRestaurant();
  const [callerNumber, setCallerNumber] = useState("+491701234567");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<DemoCallSession | null>(null);
  const [browserCall, setBrowserCall] = useState<BrowserCallSession | null>(null);
  const [state, setState] = useState<ViewState>({
    status: "idle",
    message: "Starte einen Demo-Anruf und fuehre das Bestellgespraech direkt im Dashboard."
  });
  const [browserState, setBrowserState] = useState<ViewState>({
    status: "idle",
    message: "Starte den Anruf direkt im Browser und sprich ohne Telefonnummer mit dem LiveKit-Agenten."
  });
  const [audioDebug, setAudioDebug] = useState({
    remoteTrackAttached: false,
    remoteElements: 0,
    lastEvent: "Noch kein Remote-Audio."
  });
  const audioRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const browserAudioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browserReceivedAudioRef = useRef(false);

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      const audioTimeout = browserAudioTimeoutRef.current;

      roomRef.current = null;
      browserAudioTimeoutRef.current = null;
      if (audioTimeout) {
        clearTimeout(audioTimeout);
      }
      if (room) {
        void room.disconnect();
      }
    };
  }, []);

  async function resolveRestaurantId() {
    if (restaurantId) {
      return restaurantId;
    }

    const restaurants = await fetchJson<Array<{ id: string }>>("/v1/restaurants");
    const fallbackRestaurantId = restaurants[0]?.id ?? "";

    if (fallbackRestaurantId) {
      setRestaurantId(fallbackRestaurantId);
    }

    return fallbackRestaurantId;
  }

  async function startDemoCall() {
    const activeRestaurantId = await resolveRestaurantId();

    if (!activeRestaurantId) {
      setState({
        status: "error",
        message: "Es ist noch kein Restaurant verfuegbar."
      });
      return;
    }

    setState({
      status: "loading",
      message: "Demo-Anruf wird gestartet..."
    });

    try {
      const payload = await fetchJson<DemoCallSession>(`/v1/restaurants/${activeRestaurantId}/demo-call`, {
        method: "POST",
        body: JSON.stringify({
          callerNumber
        })
      });

      setSession(payload);
      setState({
        status: "success",
        message: "Demo-Anruf gestartet. Du kannst jetzt als Anrufer schreiben."
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Demo-Anruf konnte nicht gestartet werden."
      });
    }
  }

  async function sendMessage() {
    if (!session || message.trim().length === 0) {
      return;
    }

    setState({
      status: "loading",
      message: "Nachricht wird verarbeitet..."
    });

    try {
      const response = await fetch(`${apiBaseUrl}/v1/demo-calls/${session.callId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message
        })
      });

      const payload = (await response.json().catch(() => null)) as DemoCallSession | { message?: string } | null;

      if (!response.ok || !payload || !("callId" in payload)) {
        throw new Error(
          payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Nachricht konnte nicht verarbeitet werden."
        );
      }

      setSession(payload);
      setMessage("");
      setState({
        status: "success",
        message:
          payload.order.status === "pending_restaurant"
            ? "Bestellung abgeschlossen. Sie erscheint jetzt in den Bestellungen und im Anrufprotokoll."
            : "Antwort vom Demo-Agenten aktualisiert."
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Nachricht konnte nicht verarbeitet werden."
      });
    }
  }

  async function startBrowserCall() {
    setBrowserState({
      status: "loading",
      message: "Browser-Call wird mit LiveKit verbunden..."
    });

    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true
      });

      // Must happen directly from the button click path so browsers allow audio playback.
      await room.startAudio();

      const activeRestaurantId = await resolveRestaurantId();

      if (!activeRestaurantId) {
        setBrowserState({
          status: "error",
          message: "Es ist noch kein Restaurant verfuegbar."
        });
        return;
      }

      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identity: "Browser Demo",
          restaurantId: activeRestaurantId
        })
      });

      const payload = (await response.json().catch(() => null)) as BrowserCallSession | { error?: string } | null;

      if (!response.ok || !payload || !("token" in payload)) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "LiveKit-Token konnte nicht erstellt werden."
        );
      }

      if (roomRef.current) {
        await roomRef.current.disconnect();
      }

      if (audioRef.current) {
        audioRef.current.innerHTML = "";
      }
      if (browserAudioTimeoutRef.current) {
        clearTimeout(browserAudioTimeoutRef.current);
      }
      browserReceivedAudioRef.current = false;
      setAudioDebug({
        remoteTrackAttached: false,
        remoteElements: 0,
        lastEvent: "Warte auf Remote-Audio..."
      });

      room
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio || !audioRef.current) {
            return;
          }

          const element = track.attach();
          element.autoplay = true;
          if (element instanceof HTMLVideoElement) {
            element.playsInline = true;
          }
          if (element instanceof HTMLAudioElement || element instanceof HTMLVideoElement) {
            element.controls = true;
          }
          audioRef.current.appendChild(element);
          browserReceivedAudioRef.current = true;
          if (browserAudioTimeoutRef.current) {
            clearTimeout(browserAudioTimeoutRef.current);
            browserAudioTimeoutRef.current = null;
          }
          setAudioDebug({
            remoteTrackAttached: true,
            remoteElements: audioRef.current.childElementCount,
            lastEvent: "Remote-Audio empfangen und im Browser angehaengt."
          });
          void element.play().catch(() => {
            setBrowserState({
              status: "error",
              message: "Audio ist verbunden, aber der Browser blockiert die Wiedergabe. Bitte klicke erneut auf Start."
            });
            setAudioDebug({
              remoteTrackAttached: true,
              remoteElements: audioRef.current?.childElementCount ?? 0,
              lastEvent: "Remote-Audio ist da, aber play() wurde vom Browser blockiert."
            });
          });
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((element) => element.remove());
          setAudioDebug({
            remoteTrackAttached: false,
            remoteElements: audioRef.current?.childElementCount ?? 0,
            lastEvent: "Remote-Audio wurde wieder getrennt."
          });
        })
        .on(RoomEvent.Disconnected, () => {
          const remoteAudioWasReceived = browserReceivedAudioRef.current;
          const disconnectedRoomName = payload.roomName;
          const disconnectedRestaurantId = activeRestaurantId;

          if (browserAudioTimeoutRef.current) {
            clearTimeout(browserAudioTimeoutRef.current);
            browserAudioTimeoutRef.current = null;
          }
          browserReceivedAudioRef.current = false;

          if (audioRef.current) {
            audioRef.current.innerHTML = "";
          }

          roomRef.current = null;
          setBrowserCall(null);
          setAudioDebug({
            remoteTrackAttached: false,
            remoteElements: 0,
            lastEvent: remoteAudioWasReceived
              ? "Browser-Call beendet."
              : "Verbindung beendet, bevor Remote-Audio vom Agenten ankam."
          });

          if (remoteAudioWasReceived) {
            setBrowserState({
              status: "idle",
              message: "Browser-Call beendet. Du kannst jederzeit erneut starten."
            });
            return;
          }

          void resolveBrowserCallFailureMessage(disconnectedRestaurantId, disconnectedRoomName).then((nextMessage) => {
            setBrowserState({
              status: "error",
              message: nextMessage
            });
          });
        });

      await room.connect(payload.url, payload.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      browserAudioTimeoutRef.current = setTimeout(() => {
        if (browserReceivedAudioRef.current || roomRef.current !== room) {
          return;
        }

        setAudioDebug({
          remoteTrackAttached: false,
          remoteElements: audioRef.current?.childElementCount ?? 0,
          lastEvent: "Auch nach 12 Sekunden kam kein Remote-Audio vom Agenten."
        });
        void resolveBrowserCallFailureMessage(activeRestaurantId, payload.roomName).then((nextMessage) => {
          setBrowserState({
            status: "error",
            message: nextMessage
          });
        });
      }, BROWSER_CALL_AUDIO_TIMEOUT_MS);

      roomRef.current = room;
      setBrowserCall(payload);
      setBrowserState({
        status: "success",
        message: `Browser-Call verbunden. Room: ${payload.roomName}. Sprich jetzt direkt mit dem Agenten.`
      });
    } catch (error) {
      setBrowserState({
        status: "error",
        message: error instanceof Error ? error.message : "Browser-Call konnte nicht gestartet werden."
      });
    }
  }

  async function resolveBrowserCallFailureMessage(activeRestaurantId: string, roomName: string) {
    try {
      const calls = await fetchJson<CallRecord[]>(`/v1/restaurants/${activeRestaurantId}/calls`);
      const matchingCall = calls.find((call) => call.livekitRoom === roomName);
      const systemHint = extractSystemHint(matchingCall?.transcriptText);

      if (systemHint) {
        return systemHint;
      }
    } catch {
      // Ignore and fall back to the generic timeout hint.
    }

    return browserCallFailureHint();
  }

  async function stopBrowserCall() {
    const room = roomRef.current;
    roomRef.current = null;
    browserReceivedAudioRef.current = false;

    if (browserAudioTimeoutRef.current) {
      clearTimeout(browserAudioTimeoutRef.current);
      browserAudioTimeoutRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.innerHTML = "";
    }

    if (room) {
      await room.disconnect();
    }

    setBrowserCall(null);
    setBrowserState({
      status: "idle",
      message: "Browser-Call beendet. Du kannst jederzeit erneut starten."
    });
  }

  return (
    <section className="card stack-md">
      <div className="page-header demo-panel-header">
        <div>
          <div className="eyebrow">Vertikaler Slice</div>
          <h2>KI-Telefonassistent Demo</h2>
          <p className="muted">
            Diese Demo simuliert einen eingehenden Restaurantanruf, fuehrt das Gespraech und schreibt echte Call- und
            Order-Daten in die Datenbank.
          </p>
        </div>
      </div>

      <div className="card inset-card stack-md">
        <div className="status-row">
          <div>
            <strong>Browser zu LiveKit</strong>
            <div className="muted">
              Starte die Vorfuehrung direkt mit Mikrofon im Browser. Keine Zielnummer und kein Telefon notwendig.
            </div>
          </div>
          {browserCall ? <span className="pill">{browserCall.roomName}</span> : null}
        </div>

        <div className="button-row">
          <button
            className="button"
            type="button"
            disabled={browserState.status === "loading" || !!browserCall}
            onClick={startBrowserCall}
          >
            Browser-Anruf starten
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={!browserCall}
            onClick={stopBrowserCall}
          >
            Browser-Anruf beenden
          </button>
        </div>

        <div className={`form-message ${browserState.status}`}>
          {restaurantId ? browserState.message : "Waehle zuerst ein Restaurant."}
        </div>

        <div className="demo-hints">
          <strong>So fuehrst du es vor</strong>
          <div className="muted">1. Mikrofon erlauben und den Browser-Anruf starten.</div>
          <div className="muted">2. Sage: "Ich haette gern zwei Doener Teller und eine Cola."</div>
          <div className="muted">3. Danach Name, Telefonnummer und Abholung oder Lieferung nennen.</div>
        </div>

        <div className="card inset-card stack-sm">
          <strong>Audio-Debug</strong>
          <div className="muted">Remote-Track: {audioDebug.remoteTrackAttached ? "ja" : "nein"}</div>
          <div className="muted">Audioelemente: {audioDebug.remoteElements}</div>
          <div className="muted">{audioDebug.lastEvent}</div>
        </div>

        <div className="livekit-audio-host" ref={audioRef} />
      </div>

      <div className="demo-panel-grid">
        <div className="form-card">
          <label className="form-field">
            <span>Anrufernummer</span>
            <input value={callerNumber} onChange={(event) => setCallerNumber(event.target.value)} />
          </label>

          <button
            className="button"
            type="button"
            disabled={state.status === "loading"}
            onClick={startDemoCall}
          >
            Demo-Anruf starten
          </button>

          <div className={`form-message ${state.status}`}>{restaurantId ? state.message : "Waehle zuerst ein Restaurant."}</div>

          <div className="demo-hints">
            <strong>Beispielsätze</strong>
            <div className="muted">"Ich haette gern 2x Doener Teller."</div>
            <div className="muted">"Lieferung bitte, mein Name ist Samet."</div>
            <div className="muted">"Meine Adresse ist Hauptstrasse 1 in Berlin."</div>
            <div className="muted">"Meine Nummer ist +491701234567."</div>
            <div className="muted">"Das war alles."</div>
          </div>
        </div>

        <div className="card inset-card stack-md">
          <div className="demo-chat">
            {session?.messages.length ? (
              session.messages.map((entry, index) => (
                <div className={`demo-message ${entry.role}`} key={`${entry.role}-${index}`}>
                  <strong>{entry.role === "assistant" ? "Agent" : "Anrufer"}</strong>
                  <div>{entry.text}</div>
                </div>
              ))
            ) : (
              <div className="empty-state">Noch kein Demo-Gespraech gestartet.</div>
            )}
          </div>

          <div className="inline-form">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Sag dem Agenten, was bestellt wird"
              disabled={!session}
            />
            <button className="button button-secondary" type="button" disabled={!session || !message.trim()} onClick={sendMessage}>
              Senden
            </button>
          </div>
        </div>
      </div>

      <div className="card inset-card stack-md">
        <div className="status-row">
          <div>
            <strong>Aktuelle Demo-Bestellung</strong>
            <div className="muted">
              {session
                ? `${session.order.fulfillmentType} · ${session.order.status}`
                : "Die Zusammenfassung erscheint nach dem Start des Demo-Anrufs."}
            </div>
          </div>
          {session ? <span className="pill">{formatMoney(session.order.totalCents, session.order.currency)}</span> : null}
        </div>

        {session ? (
          <>
            <div className="status-row">
              <div>
                <strong>Kunde</strong>
                <div className="muted">
                  {session.order.customerName ?? "Noch kein Name"} · {session.order.customerPhone ?? "Noch keine Nummer"}
                </div>
              </div>
              <span className={session.order.deliveryAddress ? "pill" : "pill warning"}>
                {session.order.deliveryAddress ?? "Keine Lieferadresse"}
              </span>
            </div>

            <div className="demo-order-items">
              {session.order.items.length === 0 ? (
                <div className="empty-state">Noch keine Artikel im Warenkorb.</div>
              ) : (
                session.order.items.map((item) => (
                  <div className="order-row" key={item.id}>
                    <div>
                      <strong>{item.quantity}x {item.name}</strong>
                    </div>
                    <span className="pill">{formatMoney(item.totalCents, session.order.currency)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
