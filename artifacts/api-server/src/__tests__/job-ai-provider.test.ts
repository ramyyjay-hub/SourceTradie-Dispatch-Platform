import { describe, expect, it } from "vitest";
import { OpenAiResponsesProvider } from "../lib/job-ai-provider";

const input = {
  description: "Kitchen tap leaks slowly. Call me on 0400 000 000 or alex@example.com.",
  trade: "Plumbing",
  suburb: "Brunswick",
  postcode: "3056",
  urgency: "Soon",
  preferredAttendanceTime: "Weekday morning",
  photoContext: { provided: true, count: 2 },
  safety: { level: "standard" as const, interruptFlow: false, codes: [], customerMessage: null },
};

const extractedAssessment = {
  tradeClassification: "plumbing",
  urgencyClassification: "soon",
  suburb: "Brunswick",
  postcode: "3056",
  preferredAttendanceTime: "Weekday morning",
  neutralProblemSummary: "Kitchen tap is leaking slowly.",
  equipment: "tap",
  brand: null,
  model: null,
  photoContext: { provided: true, count: 2 },
  confidence: "medium" as const,
  codes: ["ROUTING_REVIEW"],
};

describe("OpenAiResponsesProvider", () => {
  it("uses the configured model and persists the exact strict extraction", async () => {
    let request: RequestInit | undefined;
    const provider = new OpenAiResponsesProvider({
      apiKey: "test-key",
      model: "approved-model",
      fetchImpl: async (_url, init) => {
        request = init;
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify(extractedAssessment),
          }),
          { status: 200 },
        );
      },
    });
    const result = await provider.assess(input);
    expect(result).toMatchObject({ outcome: "success", provider: "openai", model: "approved-model" });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: "approved-model",
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(result.assessment).toEqual(extractedAssessment);
    const providerInput = String(JSON.parse(String(request?.body)).input);
    expect(providerInput).not.toContain("alex@example.com");
    expect(providerInput).not.toContain("0400 000 000");
    expect(providerInput).not.toContain("customerName");
    expect(providerInput).not.toContain("customerPhone");
    expect(providerInput).not.toContain("customerEmail");
  });

  it("returns typed unavailable and failure fallbacks without throwing", async () => {
    const unavailable = await new OpenAiResponsesProvider().assess(input);
    expect(unavailable.outcome).toBe("unavailable");

    const invalid = await new OpenAiResponsesProvider({
      apiKey: "test-key",
      model: "approved-model",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              tradeClassification: "plumbing",
            }),
          }),
          { status: 200 },
        ),
    }).assess(input);
    expect(invalid.outcome).toBe("failure");
    expect(invalid.assessment.codes).toEqual(["MANUAL_REVIEW_REQUIRED"]);
  });
});
