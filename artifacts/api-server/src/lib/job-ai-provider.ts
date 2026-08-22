import { z } from "zod";
import type { SafetyClassification } from "./safety-classifier";

export const tradeClassificationSchema = z.enum([
  "plumbing",
  "electrical",
  "heating_cooling",
  "unsure",
]);

export const urgencyClassificationSchema = z.enum([
  "not_urgent",
  "soon",
  "today",
  "emergency",
  "unsure",
]);

export const photoContextSchema = z
  .object({
    provided: z.boolean(),
    count: z.number().int().nonnegative(),
  })
  .strict();

export const aiAssessmentSchema = z
  .object({
    tradeClassification: tradeClassificationSchema,
    urgencyClassification: urgencyClassificationSchema,
    suburb: z.string().trim().min(1).max(120).nullable(),
    postcode: z.string().trim().min(1).max(16).nullable(),
    preferredAttendanceTime: z.string().trim().min(1).max(160).nullable(),
    neutralProblemSummary: z.string().trim().min(1).max(500).nullable(),
    equipment: z.string().trim().min(1).max(120).nullable(),
    brand: z.string().trim().min(1).max(120).nullable(),
    model: z.string().trim().min(1).max(120).nullable(),
    photoContext: photoContextSchema,
    confidence: z.enum(["low", "medium", "high"]),
    codes: z
      .array(z.enum(["ROUTING_REVIEW", "URGENCY_REVIEW", "MANUAL_REVIEW_REQUIRED"]))
      .max(3),
  })
  .strict();

export type AiAssessment = z.infer<typeof aiAssessmentSchema>;
export type StoredAssessment = Omit<AiAssessment, "codes"> & { codes: string[] };

type AssessmentInput = {
  description: string;
  trade: string;
  suburb: string;
  postcode: string;
  urgency: string;
  preferredAttendanceTime: string;
  photoContext: z.infer<typeof photoContextSchema>;
  safety: SafetyClassification;
};

export type AssessmentResult = {
  provider: string;
  model: string | null;
  outcome: "success" | "unavailable" | "failure" | "safety_override";
  assessment: StoredAssessment;
};

export interface JobAiProvider {
  assess(input: AssessmentInput): Promise<AssessmentResult>;
}

function manualReviewAssessment(
  photoContext: z.infer<typeof photoContextSchema>,
): AiAssessment {
  return {
    tradeClassification: "unsure",
    urgencyClassification: "unsure",
    suburb: null,
    postcode: null,
    preferredAttendanceTime: null,
    neutralProblemSummary: null,
    equipment: null,
    brand: null,
    model: null,
    photoContext,
    confidence: "low",
    codes: ["MANUAL_REVIEW_REQUIRED"],
  };
}

function sanitizeProviderText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(
      /\b(?:\+?61[\s.-]?)?(?:0?4\d{2}|0?[2378]\d)[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
      "[redacted-phone]",
    )
    .trim();
}

function sanitizeProviderInput(input: AssessmentInput) {
  return {
    description: sanitizeProviderText(input.description),
    customerConfirmedTrade: sanitizeProviderText(input.trade),
    customerConfirmedSuburb: sanitizeProviderText(input.suburb),
    customerConfirmedPostcode: sanitizeProviderText(input.postcode),
    customerConfirmedUrgency: sanitizeProviderText(input.urgency),
    customerConfirmedPreferredAttendanceTime: sanitizeProviderText(
      input.preferredAttendanceTime,
    ),
    photoContext: input.photoContext,
  };
}

export class OpenAiResponsesProvider implements JobAiProvider {
  readonly provider = "openai";

  constructor(
    private readonly config: {
      apiKey?: string;
      model?: string;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  async assess(input: AssessmentInput): Promise<AssessmentResult> {
    const model = this.config.model?.trim() || null;
    const apiKey = this.config.apiKey?.trim();
    if (!model || !apiKey) {
      return {
        provider: this.provider,
        model,
        outcome: "unavailable",
        assessment: manualReviewAssessment(input.photoContext),
      };
    }

    try {
      const response = await (this.config.fetchImpl ?? fetch)(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input:
              "Extract a review-only dispatch intake draft from this contact-free data. Do not diagnose, quote prices, dispatch anyone, infer customer contact details, or analyse images. photoContext is attachment metadata only; do not infer image contents. Return only the schema. Customer-confirmed values are authoritative and must not be replaced. Keep neutralProblemSummary factual and neutral. Codes are routing process codes, never diagnoses. " +
              JSON.stringify(sanitizeProviderInput(input)),
            text: {
              format: {
                type: "json_schema",
                name: "job_intake_assessment",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "tradeClassification",
                    "urgencyClassification",
                    "suburb",
                    "postcode",
                    "preferredAttendanceTime",
                    "neutralProblemSummary",
                    "equipment",
                    "brand",
                    "model",
                    "photoContext",
                    "confidence",
                    "codes",
                  ],
                  properties: {
                    tradeClassification: {
                      type: "string",
                      enum: ["plumbing", "electrical", "heating_cooling", "unsure"],
                    },
                    urgencyClassification: {
                      type: "string",
                      enum: ["not_urgent", "soon", "today", "emergency", "unsure"],
                    },
                    suburb: { type: ["string", "null"], maxLength: 120 },
                    postcode: { type: ["string", "null"], maxLength: 16 },
                    preferredAttendanceTime: { type: ["string", "null"], maxLength: 160 },
                    neutralProblemSummary: { type: ["string", "null"], maxLength: 500 },
                    equipment: { type: ["string", "null"], maxLength: 120 },
                    brand: { type: ["string", "null"], maxLength: 120 },
                    model: { type: ["string", "null"], maxLength: 120 },
                    photoContext: {
                      type: "object",
                      additionalProperties: false,
                      required: ["provided", "count"],
                      properties: {
                        provided: { type: "boolean" },
                        count: { type: "integer", minimum: 0 },
                      },
                    },
                    confidence: { type: "string", enum: ["low", "medium", "high"] },
                    codes: {
                      type: "array",
                      maxItems: 3,
                      items: {
                        type: "string",
                        enum: ["ROUTING_REVIEW", "URGENCY_REVIEW", "MANUAL_REVIEW_REQUIRED"],
                      },
                    },
                  },
                },
              },
            },
          }),
        },
      );

      if (!response.ok) throw new Error(`Responses API returned ${response.status}`);
      const payload = (await response.json()) as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ text?: unknown }> }>;
      };
      const outputText =
        typeof payload.output_text === "string"
          ? payload.output_text
          : payload.output?.flatMap((item) => item.content ?? []).find(
              (content) => typeof content.text === "string",
            )?.text;
      if (typeof outputText !== "string") throw new Error("Responses API returned no structured text");

      return {
        provider: this.provider,
        model,
        outcome: "success",
        assessment: {
          ...aiAssessmentSchema.parse(JSON.parse(outputText)),
          photoContext: input.photoContext,
        },
      };
    } catch {
      return {
        provider: this.provider,
        model,
        outcome: "failure",
        assessment: manualReviewAssessment(input.photoContext),
      };
    }
  }
}

export class SafeJobAssessmentService {
  constructor(private readonly provider: JobAiProvider) {}

  assess(input: AssessmentInput): Promise<AssessmentResult> {
    if (input.safety.interruptFlow) {
      return Promise.resolve({
        provider: "deterministic-safety",
        model: null,
        outcome: "safety_override",
        assessment: {
          ...manualReviewAssessment(input.photoContext),
          confidence: "high",
          codes: input.safety.codes,
        },
      });
    }
    return this.provider.assess(input).then((result) => ({
      ...result,
      assessment: {
        ...result.assessment,
        photoContext: input.photoContext,
      },
    }));
  }
}

export function createServerAiProvider(): OpenAiResponsesProvider {
  return new OpenAiResponsesProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  });
}
