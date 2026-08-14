import "server-only";

import { join } from "node:path";

import nodemailer, { type Transporter } from "nodemailer";

import { EMAIL_ASSETS, assetCid, type EmailAsset } from "@/lib/email/assets";

/**
 * Outbound mail.
 *
 * One function, one seam. Everything that needs to send something composes an
 * `OutgoingEmail` and hands it here; swapping providers is an edit to
 * `deliver`/`getTransporter` below and nothing else — the same shape
 * `lib/actions/uploads` uses to keep the storage backend replaceable.
 *
 * Delivery goes through Gmail's SMTP over nodemailer, authenticated with a
 * Google App Password (not the account password — Gmail rejects plain
 * passwords for SMTP once 2-Step Verification is on, which it must be to
 * generate one). See `.env.example` for how to obtain one.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  /** Always provide both — some clients refuse to render HTML-only mail. */
  text: string;
  html: string;
  /**
   * The art the HTML refers to by `cid:`, attached inline alongside it.
   *
   * Named by the body rather than sent wholesale: a mail that draws a padlock
   * has no reason to carry a delivery van, and each one is bytes in an inbox.
   * An asset referenced but not listed here renders as a broken image, so the
   * template that writes the `<img>` is the thing that names it — see
   * `RenderedEmail.assets`.
   */
  assets?: readonly EmailAsset[];
  /**
   * Pictures the body refers to by `cid:` that are not part of the fixed art —
   * product photographs, which vary per message and live under `public`.
   *
   * Separate from `assets` because those are a closed set this module can name
   * and these are paths chosen per send. Every one has to be inside
   * `public/uploads`, and the caller is what guarantees it — see
   * `lib/orders/email`'s `resolveLineImage`, which is the only thing that
   * builds these and refuses anything else.
   */
  inlineImages?: readonly { cid: string; path: string }[];
};

/**
 * What "sending worked" means to a caller.
 *
 * Callers on an anti-enumeration path (password reset) must not vary their
 * response on this, so it is deliberately advisory: something to log, not
 * something to show a visitor.
 */
export type SendResult = { ok: true } | { ok: false; error: string };

let transporter: Transporter | null = null;

/**
 * Built once and reused — nodemailer's SMTP transport pools connections
 * internally, and re-creating it per send would throw that away for nothing.
 */
function getTransporter(user: string, appPassword: string): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    });
  }
  return transporter;
}

/**
 * Send a message, or write it to the log when no provider is configured.
 *
 * The console fallback is the development path, and it is a feature rather
 * than a stub: the whole reset flow can be exercised end to end — including
 * clicking the real link — without a Google account, an app password, or a
 * mail server. Set GMAIL_USER and GMAIL_PASSWORD to switch to real
 * delivery; see `.env.example`.
 */
export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const user = process.env.GMAIL_USER?.trim();
  const appPassword = process.env.GMAIL_PASSWORD?.trim();
  const from = process.env.EMAIL_FROM?.trim() || user;

  if (!user || !appPassword || !from) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[email] GMAIL_USER and GMAIL_PASSWORD are not set — no mail was sent.",
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
    await getTransporter(user, appPassword).sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      // Read off disk at send time. `public/email` is committed art built by
      // `npm run build:email-art`, not user content, so there is no path here
      // that a request can influence — the key is one of a closed set.
      attachments: [
        ...[...new Set(message.assets ?? [])].map((key) => ({
          filename: EMAIL_ASSETS[key],
          path: join(process.cwd(), "public", "email", EMAIL_ASSETS[key]),
          cid: assetCid(key),
        })),
        ...(message.inlineImages ?? []).map((image) => ({
          filename: image.cid,
          path: image.path,
          cid: image.cid,
        })),
      ],
    });

    return { ok: true };
  } catch (error) {
    // A network or auth failure must not take down the request that
    // triggered it. Worth logging in full — it is the difference between "my
    // app password is wrong" and "Gmail is rate-limiting me", and both look
    // identical otherwise.
    console.error("[email] delivery failed", error);
    return { ok: false, error: "Delivery failed." };
  }
}
