import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Choose a new password · Ecom",
  description: "Set a new password for your Ecom account.",
  // Same reasoning as /forgot-password, plus one of its own: the URL carries a
  // token, and a crawler has no business fetching it.
  robots: { index: false, follow: false },
};

/**
 * Deliberately reachable while signed in.
 *
 * The token in the link is the authority here, not the session — someone who
 * is signed in on this browser but has lost the password on another device
 * still has a legitimate reason to be on this page, and bouncing them to
 * /profile would burn the link they just clicked.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Whether the token is live is decided when it is spent, against the
  // database — see `lib/auth/reset`. All this catches is arriving with no
  // token at all, which means a truncated link rather than an expired one, and
  // deserves to be said plainly instead of failing on submit.
  if (!token) {
    return (
      <Card className="w-full max-w-[400px]" variant="elevated">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div
            role="alert"
            className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
          >
            <Icon name="link_off" size={20} className="mt-px" />
            <span>
              That link is incomplete. Email clients sometimes break long links
              across lines — request a fresh one and open it in a single click.
            </span>
          </div>

          <p className="text-on-surface-variant text-center text-sm">
            <Link
              href="/forgot-password"
              className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Request a new link
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-[400px]" variant="elevated">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-on-surface text-headline-sm">New password</h1>
          <p className="text-on-surface-variant mt-2 text-sm">
            Choose something you have not used here before
          </p>
        </div>

        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
