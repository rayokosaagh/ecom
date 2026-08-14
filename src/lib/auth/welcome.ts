import "server-only";

import { appUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email/send";
import {
  emailButton,
  emailHeading,
  emailIconCircle,
  emailScene,
  emailShell,
  emailTrustFooter,
  escapeHtml,
} from "@/lib/email/layout";
import { getPublishedSocialLinks } from "@/lib/social/service";
import { socialLinkName } from "@/lib/social/catalogue";
import type { EmailAsset } from "@/lib/email/assets";

/**
 * Saying hello to a new account.
 *
 * Deliberately not a receipt for anything — nobody has bought anything yet —
 * so it says what the account is now good for and gets out of the way. The
 * one thing it must not do is read as a confirmation step: there is no link
 * to click to activate anything, because the account is already usable and
 * `register` has signed them in by the time this arrives.
 */

/**
 * The first name, or something to greet them by when there isn't one.
 *
 * `parseRegistration` requires a name, so the fallback is for the shapes a
 * name can take rather than for its absence — "  " or a single emoji both
 * leave nothing worth putting after "Welcome".
 */
function greeting(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first ? `Welcome, ${first}` : "Welcome";
}

export async function sendWelcomeEmail(name: string, email: string): Promise<void> {
  const subject = "Welcome to Ecom";
  const shopUrl = appUrl("/products");
  const profileUrl = appUrl("/profile");

  const text = [
    `${greeting(name)} — your Ecom account is ready.`,
    "",
    "From here you can:",
    "· follow an order from placed to delivered",
    "· keep your delivery address for next time",
    "· get an email whenever an order of yours moves",
    "",
    "Start shopping:",
    shopUrl,
    "",
    `Your details and email preferences live in your profile: ${profileUrl}`,
  ].join("\n");

  const item = (copy: string) =>
    `<li style="margin:0 0 8px;color:#44474f;font-size:15px;line-height:1.5">${copy}</li>`;

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ecom-stack" style="border-collapse:collapse;margin-bottom:24px">
    <tr>
      <td class="ecom-iconCell" style="width:72px;vertical-align:top">${emailIconCircle("bag", 56)}</td>
      <td style="vertical-align:top">
        ${emailHeading(escapeHtml(greeting(name)))}
        <p style="margin:0;color:#44474f;font-size:15px;line-height:1.5">Your account is ready. Here is what it does for you.</p>
      </td>
    </tr>
  </table>

  <ul style="margin:0 0 24px;padding-left:20px">
    ${item("Follow an order from placed to delivered.")}
    ${item("Keep your delivery address for next time.")}
    ${item("Get an email whenever an order of yours moves.")}
  </ul>

  ${emailScene("welcomeArt")}

  <p style="margin:0 0 24px">${emailButton(shopUrl, "Start shopping", "bagOn")}</p>

  <p style="margin:0;color:#44474f;font-size:13px;line-height:1.6">
    Your details and email preferences live in
    <a href="${escapeHtml(profileUrl)}" style="color:#0b57d0;font-weight:600;text-decoration:underline">your profile</a>.
  </p>`.trim();

  const socialLinks = await getPublishedSocialLinks();
  const trustFooterHtml = emailTrustFooter(
    socialLinks.map((social) => ({
      url: social.url,
      label: socialLinkName(social.platform, social.label),
    })),
    { lead: "Glad to have you at", sub: "We're happy you're here." },
  );

  const html = emailShell(body, appUrl("/"), trustFooterHtml, "headerArtWelcome");
  const assets: EmailAsset[] = ["headerArtWelcome", "welcomeArt", "bag", "bagOn", "heart"];

  await sendEmail({ to: email, subject, text, html, assets });
}

/**
 * Send without letting a failure escape.
 *
 * The caller is an `after()` callback in `lib/actions/auth`, where a rejection
 * is an unhandled one — it would surface as a server error long after the
 * response, attached to nothing a reader can trace back. More to the point,
 * the account has already been created and signed into by then: a greeting
 * that did not arrive is a small thing, and must never be the reason somebody
 * cannot register.
 */
export async function sendWelcomeEmailSafely(name: string, email: string): Promise<void> {
  try {
    await sendWelcomeEmail(name, email);
  } catch (error) {
    console.error(`[welcome-email] could not greet ${email}`, error);
  }
}
