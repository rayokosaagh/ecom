import type { Metadata } from "next";

import { FaqForm } from "@/components/faqs/FaqForm";
import { createFaq } from "@/lib/actions/faqs";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "New question" };

export default async function NewFaqPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">New question</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          It joins the end of the list; reorder it from the FAQ screen.
        </p>
      </div>

      <FaqForm
        action={createFaq}
        submitLabel="Add question"
        values={{ question: "", answer: "", published: true }}
      />
    </div>
  );
}
