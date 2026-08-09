import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FaqForm } from "@/components/faqs/FaqForm";
import { updateFaq } from "@/lib/actions/faqs";
import { requireAdmin } from "@/lib/auth/dal";
import { getFaq } from "@/lib/faqs/service";

export const metadata: Metadata = { title: "Edit question" };

export default async function EditFaqPage({
  params,
}: {
  // Next 16: params is a Promise and must be awaited.
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const faq = await getFaq(id);
  if (!faq) notFound();

  // Bound here rather than inside the form, so the form stays identical
  // whether it is creating or editing.
  const action = updateFaq.bind(null, faq.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Edit question</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Changes appear on the home page as soon as they are saved.
        </p>
      </div>

      <FaqForm
        action={action}
        submitLabel="Save changes"
        values={{
          question: faq.question,
          answer: faq.answer,
          published: faq.published,
        }}
      />
    </div>
  );
}
