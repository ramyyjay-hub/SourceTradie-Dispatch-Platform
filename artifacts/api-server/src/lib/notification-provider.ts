export type EmailMessage = {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
};

export type NotificationSendResult =
  { ok: true; providerMessageId: string } | { ok: false; errorCode: string };

export interface NotificationProvider {
  sendEmail(message: EmailMessage): Promise<NotificationSendResult>;
}

export class ResendNotificationProvider implements NotificationProvider {
  constructor(
    private readonly apiKey = process.env["RESEND_API_KEY"],
    private readonly from = process.env["NOTIFICATION_FROM_EMAIL"],
  ) {}

  async sendEmail(message: EmailMessage): Promise<NotificationSendResult> {
    if (!this.apiKey || !this.from)
      return { ok: false, errorCode: "provider_not_configured" };
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          reply_to: message.replyTo,
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!response.ok)
        return { ok: false, errorCode: `provider_http_${response.status}` };
      const body = (await response.json()) as { id?: string };
      if (!body.id)
        return { ok: false, errorCode: "provider_missing_message_id" };
      // Provider acceptance proves only that the message was sent, not delivered.
      return { ok: true, providerMessageId: body.id };
    } catch {
      return { ok: false, errorCode: "provider_request_failed" };
    }
  }
}

export function createNotificationProvider(): NotificationProvider {
  return new ResendNotificationProvider();
}
