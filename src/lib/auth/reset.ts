import "server-only";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email/send";
import {
  emailBadge,
  emailButton,
  emailHeading,
  emailIconCircle,
  emailShell,
  emailTrustFooter,
} from "@/lib/email/layout";
import type { EmailAsset } from "@/lib/email/assets";
import { hashPassword } from "@/lib/auth/password";
import { notifyUser } from "@/lib/notifications/service";
import { getPublishedSocialLinks } from "@/lib/social/service";
import { socialLinkName } from "@/lib/social/catalogue";
import { NotificationType } from "@/generated/prisma/enums";
import {
  RESET_TOKEN_TTL_MS,
  hashResetToken,
  judgeResetToken,
  mayIssueResetToken,
  newResetToken,
  type ResetTokenVerdict,
} from "@/lib/auth/reset-rules";

/**
 * Issuing and redeeming password-reset links.
 *
 * The arithmetic and the judgement live in `./reset-rules`; this is the part
 * that touches the database and the mail provider.
 */

async function composeResetEmail(
  link: string,
): Promise<{ subject: string; text: string; html: string; assets: EmailAsset[] }> {
  const subject = "Reset your Ecom password";

  const text = [
    "Someone asked to reset the password for this address.",
    "",
    "Open this link to choose a new one:",
    link,
    "",
    "The link works once and expires in an hour.",
    "",
    "If this was not you, nothing has changed and you can ignore this message.",
  ].join("\n");

  // The link is repeated as plain text below the button, because plenty of
  // mail clients will not make a button clickable but every one of them shows
  // a URL.
  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ecom-stack" style="border-collapse:collapse;margin-bottom:24px">
    <tr>
      <td class="ecom-iconCell" style="width:72px;vertical-align:top">${emailIconCircle("lock", 56)}</td>
      <td style="vertical-align:top">
        ${emailHeading("Reset your password")}
        <p style="margin:0 0 10px;color:#44474f;font-size:15px;line-height:1.5">Someone asked to reset the password for this address.</p>
        ${emailBadge("Expires in 1 hour")}
      </td>
    </tr>
  </table>
  <p style="margin:0 0 24px">
    ${emailButton(link, "Choose a new password")}
  </p>
  <p style="margin:0 0 16px;color:#44474f;font-size:13px">Or paste this into your browser:<br>
    <span style="word-break:break-all">${link}</span>
  </p>
  <p style="margin:0 0 8px;color:#44474f;font-size:14px">The link works once and expires in an hour.</p>
  <p style="margin:0;color:#44474f;font-size:14px">If this was not you, nothing has changed and you can ignore this message.</p>`.trim();

  const socialLinks = await getPublishedSocialLinks();
  const trustFooterHtml = emailTrustFooter(
    socialLinks.map((social) => ({ url: social.url, label: socialLinkName(social.platform, social.label) })),
  );

  const html = emailShell(body, appUrl("/"), trustFooterHtml);

  return { subject, text, html, assets: ["headerArt", "lock", "heart"] };
}

/**
 * Send a reset link, if there is anything to send it to.
 *
 * Returns nothing on every path — deliberately. The caller must answer the
 * visitor identically whether or not the address has an account, so there is
 * no outcome here worth reporting upward: a return value that distinguished
 * "sent" from "no such user" would only be waiting for somebody to render it.
 *
 * A missing address, an account still inside its cooldown, and a mail provider
 * having a bad day all end the same way.
 */
export async function issuePasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return;

  const now = new Date();

  const latest = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!mayIssueResetToken(latest?.createdAt ?? null, now)) return;

  const token = newResetToken();

  // Older unspent links are dropped as the new one is minted, so exactly one
  // live link exists per account. Someone who requests twice because the first
  // mail was slow should not be leaving a second working key behind them.
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: email, ...(await composeResetEmail(link)) });
}

/**
 * Spend a link and set the new password.
 *
 * The token is matched by hash, so what arrives from the form is never
 * compared against anything stored in the clear.
 */
export async function redeemPasswordReset(
  token: string,
  newPassword: string,
): Promise<ResetTokenVerdict> {
  if (!token) return judgeResetToken(null, new Date());

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  const verdict = judgeResetToken(row, new Date());
  if (!verdict.ok || !row) return verdict;

  const passwordHash = await hashPassword(newPassword);

  const spent = await prisma.$transaction(async (tx) => {
    // Conditional on the token still being unspent, in the same shape the
    // order and discount paths use. Two submissions of the same link racing
    // each other — a double-clicked button, or a link opened twice — must set
    // the password once, not hand the second one a fresh success.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    });

    // Everything else outstanding for this account goes too. The password has
    // changed; any other link in flight was minted against the old one.
    await tx.passwordResetToken.deleteMany({
      where: { userId: row.userId, usedAt: null },
    });

    return true;
  });

  if (!spent) return judgeResetToken({ expiresAt: row.expiresAt, usedAt: new Date() }, new Date());

  // Waiting for them next time they sign in. This is the detection half of the
  // flow: if a reset happens that the account holder did not ask for, this is
  // where they find out.
  await notifyUser(row.userId, {
    type: NotificationType.ACCOUNT,
    title: "Password changed",
    description: "Your password was reset from a link sent to your email address.",
    href: "/profile",
  });

  return { ok: true };
}
