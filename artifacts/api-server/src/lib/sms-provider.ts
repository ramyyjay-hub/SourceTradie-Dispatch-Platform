export type SmsMessage = {
  to: string;
  body: string;
};

export type SmsSendResult =
  { ok: true; providerMessageId: string } | { ok: false; errorCode: string };

export interface SmsProvider {
  sendSms(message: SmsMessage): Promise<SmsSendResult>;
}

function sanitizedProviderCode(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)
    ? `twilio_${value}`
    : "twilio_request_failed";
}

export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid = process.env.TWILIO_ACCOUNT_SID,
    private readonly authToken = process.env.TWILIO_AUTH_TOKEN,
    private readonly from = process.env.TWILIO_SMS_FROM,
  ) {}

  async sendSms(message: SmsMessage): Promise<SmsSendResult> {
    if (!this.accountSid || !this.authToken || !this.from) {
      return { ok: false, errorCode: "twilio_not_configured" };
    }

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: message.to,
            From: this.from,
            Body: message.body,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        sid?: unknown;
        code?: unknown;
      };
      if (!response.ok || typeof payload.sid !== "string") {
        return { ok: false, errorCode: sanitizedProviderCode(payload.code) };
      }
      return { ok: true, providerMessageId: payload.sid };
    } catch {
      return { ok: false, errorCode: "twilio_unavailable" };
    }
  }
}

export function createSmsProvider(): SmsProvider {
  return new TwilioSmsProvider();
}

export function normalizeAustralianMobile(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (/^04\d{8}$/.test(compact)) return `+61${compact.slice(1)}`;
  if (/^\+614\d{8}$/.test(compact)) return compact;
  return null;
}

const gsmBasic = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ!\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(
    "",
  ),
);
const gsmExtended = new Set("^{}\\[~]|€".split(""));

export function gsm7Length(value: string): number | null {
  let length = 0;
  for (const character of value) {
    if (gsmBasic.has(character)) length += 1;
    else if (gsmExtended.has(character)) length += 2;
    else return null;
  }
  return length;
}

export function isSingleSegmentGsm7(value: string): boolean {
  const length = gsm7Length(value);
  return length !== null && length <= 160;
}
