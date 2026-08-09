import type { Metadata } from "next";

import { SocialLinkForm } from "@/components/social/SocialLinkForm";
import { createSocialLink } from "@/lib/actions/social";
import { requireAdmin } from "@/lib/auth/dal";
import { SocialPlatform } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "New social link" };

export default async function NewSocialLinkPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">New social link</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          It joins the end of the bar; reorder it from the social links screen.
        </p>
      </div>

      <SocialLinkForm
        action={createSocialLink}
        submitLabel="Add link"
        values={{
          // First in the dropdown, and the account most shops reach for first.
          platform: SocialPlatform.INSTAGRAM,
          url: "",
          label: "",
          // Empty rather than Instagram's pink: the form fills the picker from
          // whichever platform is chosen, and an empty value here is what says
          // "still following the platform" rather than "chose this colour".
          hoverColor: "",
          iconSvg: "",
          published: true,
        }}
      />
    </div>
  );
}
