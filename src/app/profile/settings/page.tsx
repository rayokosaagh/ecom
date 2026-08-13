import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/users/ProfileForms";
import { NotificationForm, DeleteAccountForm } from "@/components/users/SettingsForms";
import { ProfileShell } from "@/components/users/ProfileShell";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Settings" };

/**
 * Password, notifications, and closing the account.
 *
 * The three things that are neither profile information nor shopping, gathered
 * on one route because that is what a reader looking for any of them expects to
 * find. A Client Component route, like /profile/edit: all three are forms, so
 * there is no read-only view here to keep free of JavaScript.
 */
export default async function ProfileSettingsPage() {
  const session = await requireUser();

  const [user, nav] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: {
        notifyOrders: true,
        notifyStock: true,
        notifyNews: true,
        notifyEmails: true,
      },
    }),
    getNavData(),
  ]);

  if (!user) return null;

  return (
    <ProfileShell
      nav={nav}
      width="max-w-2xl"
      back={{ href: "/profile", label: "Back to profile" }}
    >
      <div>
        <h1 className="text-on-surface text-headline-sm">Settings</h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Your password, what we tell you about, and closing your account.
        </p>
      </div>

      {/* Linked to from the profile as /profile/settings#password. */}
      <div id="password" className="scroll-mt-24">
        <ChangePasswordForm />
      </div>

      <div id="notifications" className="scroll-mt-24">
        <NotificationForm preferences={user} />
      </div>

      <div id="close" className="scroll-mt-24">
        <DeleteAccountForm />
      </div>
    </ProfileShell>
  );
}
