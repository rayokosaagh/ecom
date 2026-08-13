import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/Card";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Create account · Ecom",
  description: "Create your Ecom account.",
};

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <Card className="w-full max-w-[400px]" variant="elevated">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-on-surface text-headline-sm">Create account</h1>
          <p className="text-on-surface-variant mt-2 text-sm">to get started with Ecom</p>
        </div>

        <RegisterForm />
      </CardContent>
    </Card>
  );
}
