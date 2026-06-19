// KI-Reporting-Client (Kap. 29): Claude-gestützte Zusammenfassung der Kennzahlen.
// Implementiert den AiReportClient-Port der ReportingService mit dem offiziellen
// Anthropic-SDK (@anthropic-ai/sdk), Modell claude-opus-4-8. Der Prompt enthält nur
// aggregierte Zahlen (keine Personendaten, Kap. 28). Eine einzelne, nicht-streamende
// Anfrage genügt für die kurze Erzählung. `fromEnv()` baut den Client nur, wenn ein
// API-Schlüssel vorhanden ist — sonst null (graceful degradation, s. ReportingService).

import Anthropic from "@anthropic-ai/sdk";
import type { AiReportClient } from "./reporting.service.js";

const MODEL = "claude-opus-4-8";

export class AnthropicReportClient implements AiReportClient {
  constructor(private readonly client: Anthropic) {}

  /** Baut den Client aus der Umgebung (ANTHROPIC_API_KEY); ohne Schlüssel null. */
  static fromEnv(): AnthropicReportClient | null {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    return new AnthropicReportClient(new Anthropic());
  }

  async summarize(prompt: string): Promise<string> {
    // Kurze, sachliche Controlling-Prosa: eine einzelne, nicht-streamende Anfrage genügt.
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
}
