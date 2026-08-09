import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  SocialLinkList,
  type SocialLinkRow,
} from "@/components/social/SocialLinkList";
import { requireAdmin } from "@/lib/auth/dal";
import { getSocialLinksForAdmin } from "@/lib/social/service";

export const metadata: Metadata = { title: "Social links" };

export default async function AdminSocialPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const rows: SocialLinkRow[] = await getSocialLinksForAdmin();
  const live = rows.filter((row) => row.published).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Social links</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "The “Follow us” bar on the home page."
              : `${live} of ${rows.length} showing in the home page bar.`}
          </p>
        </div>

        <Link
          href="/admin/social/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add link
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon
              name="thumb_up"
              size={40}
              className="text-on-surface-variant"
            />
            <p className="text-on-surface">No social links yet</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Add the accounts the shop actually posts to. The bar is hidden
              entirely while this list is empty, so the home page never invites
              anyone to follow nothing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SocialLinkList rows={rows} />
      )}

      {/* Said here rather than on the form: it answers "where is LinkedIn?",
          which is a question about the feature, not about a field being filled
          in. */}
      <p className="text-on-surface-variant text-xs">
        The dropdown lists the networks this shop posts to. For anything else —
        LinkedIn, Mastodon, a newsletter — add a <strong>Custom</strong> link
        and paste its logo: it gets its own name, mark and hover colour.
      </p>
    </div>
  );
}
