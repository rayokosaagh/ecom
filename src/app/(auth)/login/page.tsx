import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/Card";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Sign in · Ecom",
  description: "Sign in to your Ecom account.",
};

export default async function LoginPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<{ redirectTo?: string; reset?: string; closed?: string }>;
}) {
  // Already signed in — no reason to show the form again.
  if (await getCurrentUser()) redirect("/");

  const { redirectTo, reset, closed } = await searchParams;

  return (
    <Card className="w-full max-w-[400px]" variant="elevated">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-on-surface text-headline-sm">Sign in</h1>
          <p className="text-on-surface-variant mt-2 text-sm">
            to continue to your dashboard
          </p>
        </div>

        <LoginForm
          redirectTo={redirectTo}
          // Set by `resetPassword` when it redirects here. Compared as an exact
          // value rather than truthiness so the banner cannot be conjured by
          // anyone who fancies putting `?reset=` on a link they are sharing.
          notice={
            reset === "1"
              ? "Password updated. Sign in with your new password."
              : // Set by `deleteAccount`. Landing on the storefront with no
                // word of what happened would leave someone wondering whether
                // the button worked.
                closed === "1"
                ? "Your account has been closed. Thank you for shopping with us."
                : undefined
          }
        />
      </CardContent>
    </Card>
  );
}
