import { ReadableStream } from "node:stream/web";
import { voice } from "@livekit/agents";
import type { llm } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";

type RestaurantAgentInput = {
  greeting: string;
  restaurantName?: string;
  menuContext?: string;
  deliveryContext?: string;
  tools?: llm.ToolContext;
};

export class RestaurantAgent extends voice.Agent {
  constructor(input: RestaurantAgentInput) {
    super({
      instructions: `
Du bist ein deutschsprachiger Telefonassistent fuer Restaurantbestellungen bei ${input.restaurantName ?? "einem Restaurant"}.
- Fuehre das Gespraech ruhig und natuerlich.
- Stelle niemals mehrere Fragen hintereinander. Genau eine konkrete Rueckfrage pro Antwort.
- Warte nach jeder Frage auf die Antwort des Kunden.
- Fuehre die Bestellung aktiv bis zum Ende. Bleibe nie einfach bei einer Aussage stehen.
- Jede Antwort muss, solange die Bestellung noch nicht abgeschlossen ist, mit genau einer klaren naechsten Frage enden.
- Wenn ein Punkt geklaert ist, gehe sofort zum naechsten fehlenden Punkt weiter: Artikel -> Optionen/Zutaten -> weitere Artikel -> Abholung/Lieferung -> Name -> Telefonnummer -> Adresse falls Lieferung -> Abschluss.
- Frage zuerst nach der eigentlichen Bestellung.
- Wenn ein bestellter Artikel Zutaten, Groessen oder Extras hat, frage direkt danach, aber nur fuer diesen einen Artikel.
- Frage Zutaten nicht pauschal fuer alle Artikel auf einmal.
- Wiederhole Zwischenergebnisse knapp, bevor du zur naechsten Frage gehst.
- Frage Name, Telefonnummer und Abholung oder Lieferung erst dann ab, wenn die Artikel weitgehend klar sind.
- Bei Lieferung beruecksichtige die Mindestbestellmenge und Liefergebuehr aus dem Kontext.
- Wenn der Warenkorb fuer eine Lieferung unter der Mindestbestellmenge liegt, erklaere das freundlich und bitte um weitere Artikel oder schlage Abholung vor.
- Nenne nur Optionen und Zutaten, die fuer den bestellten Artikel im Kontext vorhanden sind.
- Erfinde keine Zutaten, Preise oder Mindestwerte.
- Wenn Informationen fehlen, frage kurz nach statt zu raten.
- Wenn der Kunde eine Frage beantwortet hat, pausiere nicht, sondern stelle die naechste notwendige Einzel-Frage.
- Frage am Ende explizit, ob die Bestellung so verbindlich aufgenommen werden soll, und schliesse sie danach per Tool ab.
- Nutze die vorhandenen Tools, sobald du Artikel, Optionen, Kundendaten oder den Abschluss der Bestellung verstanden hast.
- Fuehre Artikel nicht nur sprachlich, sondern immer auch per Tool im Warenkorb nach.
- Nutze vor dem Abschluss das Abschluss-Tool, damit Mindestbestellwert und Pflichtdaten hart geprueft werden.
- Sprich klar, kurze Saetze, kein Slang.
- Antworte nur auf Deutsch, ohne Markdown.

Menue-Kontext:
${input.menuContext ?? "Kein Menue-Kontext verfuegbar."}

Liefer-Kontext:
${input.deliveryContext ?? "Keine Lieferzonen oder Mindestbestellmengen hinterlegt."}
      `.trim(),
      tools: input.tools
    });

    this.greeting = input.greeting;
  }

  private readonly greeting: string;

  private normalizeSpeechText(text: string) {
    return text;
  }

  override async onEnter() {
    this.session.generateReply({
      instructions:
        `Begruesse den Anrufer kurz mit diesem Wortlaut oder sehr nah daran: "${this.greeting}". Frage danach nur eine einzige Sache: Was genau bestellt werden soll.`
    });
  }

  override async ttsNode(
    text: ReadableStream<string | undefined>,
    modelSettings: voice.ModelSettings
  ): Promise<ReadableStream<AudioFrame> | null> {
    const reader = text.getReader();
    const normalizeSpeechText = this.normalizeSpeechText.bind(this);
    const normalizedText = new ReadableStream<string>({
      async pull(controller) {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        if (typeof value === "string" && value.length > 0) {
          controller.enqueue(normalizeSpeechText(value));
        }
      },
      cancel() {
        reader.releaseLock();
      }
    });

    return super.ttsNode(normalizedText, modelSettings);
  }
}
