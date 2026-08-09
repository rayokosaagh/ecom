import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/Card";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Forgot password · Ecom",
  description: "Send yourself a link to choose a new Ecom password.",
  // Nothing here is worth a search result, and a "reset your password" page
  // ranking for the shop's name is a gift to anyone building a phishing lure.
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  // Somebody already signed in does not need the emailed route — /profile
  // changes a password they can still remember.
  if (await getCurrentUser()) redirect("/profile");

  return (
    <Card className="w-full max-w-[400px]" variant="elevated">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-on-surface text-2xl font-normal">Forgot password</h1>
          <p className="text-on-surface-variant mt-2 text-sm">
            We will email you a link to choose a new one
          </p>
        </div>

        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
