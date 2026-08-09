import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { FaqList, type FaqRow } from "@/components/faqs/FaqList";
import { requireAdmin } from "@/lib/auth/dal";
import { getFaqsForAdmin } from "@/lib/faqs/service";

export const metadata: Metadata = { title: "FAQ" };

export default async function AdminFaqsPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const rows: FaqRow[] = await getFaqsForAdmin();
  const live = rows.filter((row) => row.published).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">FAQ</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "Questions answered on the home page."
              : `${live} of ${rows.length} showing on the home page.`}
          </p>
        </div>

        <Link
          href="/admin/faqs/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add question
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="help" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">No questions yet</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Add the ones customers actually ask. The section is hidden
              entirely while this list is empty, so the home page never shows an
              empty heading.
            </p>
          </CardContent>
        </Card>
      ) : (
        <FaqList rows={rows} />
      )}
    </div>
  );
}
