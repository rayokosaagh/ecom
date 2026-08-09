import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SocialLinkForm } from "@/components/social/SocialLinkForm";
import { updateSocialLink } from "@/lib/actions/social";
import { requireAdmin } from "@/lib/auth/dal";
import { getSocialLink } from "@/lib/social/service";

export const metadata: Metadata = { title: "Edit social link" };

export default async function EditSocialLinkPage({
  params,
}: {
  // Next 16: params is a Promise and must be awaited.
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const link = await getSocialLink(id);
  if (!link) notFound();

  // Bound here rather than inside the form, so the form stays identical
  // whether it is creating or editing.
  const action = updateSocialLink.bind(null, link.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">
          Edit social link
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Changes appear on the home page as soon as they are saved.
        </p>
      </div>

      <SocialLinkForm
        action={action}
        submitLabel="Save changes"
        values={{
          platform: link.platform,
          url: link.url,
          label: link.label ?? "",
          hoverColor: link.hoverColor ?? "",
          iconSvg: link.iconSvg ?? "",
          published: link.published,
        }}
      />
    </div>
  );
}
