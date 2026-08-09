import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { StoreSettingsForm } from "@/components/settings/StoreSettingsForm";
import { requireAdmin } from "@/lib/auth/dal";
import {
  getStoreSettingsForAdmin,
  whatsappNumberFromEnvOnly,
} from "@/lib/settings/service";

export const metadata: Metadata = { title: "Settings · Ecom" };

export default async function SettingsPage() {
  const admin = await requireAdmin();

  const [settings, envFallbackNumber] = await Promise.all([
    getStoreSettingsForAdmin(),
    whatsappNumberFromEnvOnly(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Settings</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Store configuration. Administrator access only.
        </p>
      </div>

      <div>
        <h3 className="text-on-surface text-sm font-medium tracking-[0.15em] uppercase">
          Customer support
        </h3>
        <p className="text-on-surface-variant mt-1 mb-4 text-sm">
          The WhatsApp buttons on the home page, product pages, order pages and
          the FAQ. Each one opens a chat with the question already written.
        </p>
        <StoreSettingsForm values={settings} envFallbackNumber={envFallbackNumber} />
      </div>

      <Card variant="outlined">
        <CardHeader>
          <CardTitle>Signed in as</CardTitle>
          <CardDescription>{admin.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-on-surface-variant">Role</dt>
              <dd className="text-on-surface mt-0.5">Administrator</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">User ID</dt>
              <dd className="text-on-surface mt-0.5 font-mono text-xs break-all">
                {admin.id}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
