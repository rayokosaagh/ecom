import type { Metadata } from "next";
import Link from "next/link";

import { ProfileShell } from "@/components/users/ProfileShell";
import { ProfileDetailsForm } from "@/components/users/ProfileForms";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit profile" };

/**
 * Where the account's own details are edited.
 *
 * Its own route rather than a section of /profile, which is the point: this
 * form is a Client Component carrying validation, `useActionState` and the
 * avatar upload's drag-and-drop plumbing, and none of it should be shipped to
 * somebody who only came to look at an order. /profile renders the same
 * information read-only, on the server.
 *
 * The password lives on /profile/settings rather than here. It is not a profile
 * detail — nobody edits their name and their password in the same sitting — and
 * one form per concern beats a page that saves two unrelated things.
 */
export default async function EditProfilePage() {
  const session = await requireUser();

  const [user, nav] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { name: true, email: true, image: true },
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
        <h1 className="text-on-surface text-headline-sm">
          Edit profile
        </h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Your name, email and picture. Your password is under{" "}
          <Link
            href="/profile/settings#password"
            className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Settings
          </Link>
          .
        </p>
      </div>

      <ProfileDetailsForm user={user} />
    </ProfileShell>
  );
}
