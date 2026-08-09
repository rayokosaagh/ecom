import "server-only";

/**
 * Outbound mail.
 *
 * One function, one seam. Everything that needs to send something composes an
 * `OutgoingEmail` and hands it here; swapping providers is an edit to `deliver`
 * below and nothing else — the same shape `lib/actions/uploads` uses to keep
 * the storage backend replaceable.
 *
 * The provider is driven over its REST API with `fetch` rather than through an
 * SDK, which is why this costs no dependency. That matters more than it
 * sounds: an email SDK is a large surface to audit for a project that needs
 * exactly one call from it, and this way the request is right there to read.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  /** Always provide both — some clients refuse to render HTML-only mail. */
  text: string;
  html: string;
};

/**
 * What "sending worked" means to a caller.
 *
 * Callers on an anti-enumeration path (password reset) must not vary their
 * response on this, so it is deliberately advisory: something to log, not
 * something to show a visitor.
 */
export type SendResult = { ok: true } | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Send a message, or write it to the log when no provider is configured.
 *
 * The console fallback is the development path, and it is a feature rather
 * than a stub: the whole reset flow can be exercised end to end — including
 * clicking the real link — without an API key, a verified domain, or a mail
 * server. Set RESEND_API_KEY and EMAIL_FROM to switch to real delivery; see
 * `.env.example`.
 */
export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[email] RESEND_API_KEY and EMAIL_FROM are not set — no mail was sent.",
      );
      return { ok: false, error: "Email is not configured." };
    }

    console.info(
      [
        "",
        "──────────────── email (not configured — logged instead) ────────────────",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "─────────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return { ok: true };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      // The body carries the provider's reason (unverified domain, bad key).
      // Worth logging in full — it is the difference between "my key is wrong"
      // and "my domain is not verified", and both look identical otherwise.
      const detail = await response.text().catch(() => "");
      console.error(`[email] provider rejected the message (${response.status})`, detail);
      return { ok: false, error: `Provider returned ${response.status}.` };
    }

    return { ok: true };
  } catch (error) {
    // A network failure must not take down the request that triggered it.
    console.error("[email] delivery failed", error);
    return { ok: false, error: "Delivery failed." };
  }
}
