import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendNotificationProvider } from "../lib/notification-provider";

describe("Resend notification provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps applicant replies to the Partner Operations mailbox", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-message-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ResendNotificationProvider(
      "synthetic-api-key",
      "SourceTradie <dispatch@updates.sourcetradie.com.au>",
    );
    await expect(
      provider.sendEmail({
        to: "applicant@example.test",
        replyTo: "partners@sourcetradie.com.au",
        subject: "We received your SourceTradie application",
        text: "Transactional acknowledgement",
      }),
    ).resolves.toEqual({ ok: true, providerMessageId: "resend-message-id" });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      from: "SourceTradie <dispatch@updates.sourcetradie.com.au>",
      to: ["applicant@example.test"],
      reply_to: "partners@sourcetradie.com.au",
      subject: "We received your SourceTradie application",
      text: "Transactional acknowledgement",
    });
  });
});
