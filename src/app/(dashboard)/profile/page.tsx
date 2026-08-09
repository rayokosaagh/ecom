import type { Metadata } from "next";

import { ProfileDetailsForm, ChangePasswordForm } from "@/components/users/ProfileForms";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Profile" };

/**
 * Self-service account page. Any signed-in user can edit their own name,
 * email and password here — but never their role, which only an admin can
 * change from /dashboard/users.
 */
export default async function ProfilePage() {
  const session = await requireUser();

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true, email: true, image: true, role: true },
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Profile</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Signed in as {user.email} ·{" "}
          {user.role === "ADMIN" ? "Administrator" : "Standard user"}
        </p>
      </div>

      <ProfileDetailsForm user={user} />
      <ChangePasswordForm />
    </div>
  );
}
