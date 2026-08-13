import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Access denied · Ecom" };

export default function ForbiddenPage() {
  return (
    <main className="bg-surface-container-low grid min-h-dvh place-items-center px-4">
      <Card className="w-full max-w-md" variant="elevated">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="bg-error-container text-on-error-container grid size-14 place-items-center rounded-full">
            <Icon name="lock" size={28} />
          </div>
          <h1 className="text-on-surface text-headline-sm">Access denied</h1>
          <p className="text-on-surface-variant text-sm">
            This area is restricted to administrators. If you believe this is a
            mistake, contact your store administrator.
          </p>
          <Link
            href="/dashboard"
            className="state-layer bg-primary text-on-primary mt-2 inline-flex h-10 items-center rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
