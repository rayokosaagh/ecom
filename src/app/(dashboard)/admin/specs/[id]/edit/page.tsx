import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { SpecDefinitionForm } from "@/components/products/SpecDefinitionForm";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { updateSpecDefinition } from "@/lib/actions/specs";

export const metadata: Metadata = { title: "Edit spec label" };

export default async function EditSpecPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const [definition, groupRows] = await Promise.all([
    prisma.specDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        unit: true,
        group: true,
        icon: true,
        filterable: true,
      },
    }),
    prisma.specDefinition.findMany({
      where: { group: { not: null } },
      distinct: ["group"],
      orderBy: { group: "asc" },
      select: { group: true },
    }),
  ]);

  if (!definition) notFound();

  // The action needs the id, but `useActionState` only supplies (state,
  // formData) — so it is bound here on the server rather than round-tripped
  // through a hidden input a client could tamper with.
  const action = updateSpecDefinition.bind(null, definition.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/specs"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={18} />
          Spec labels
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">
          {definition.label}
        </h2>
      </div>

      <SpecDefinitionForm
        action={action}
        knownGroups={groupRows.flatMap((row) => (row.group ? [row.group] : []))}
        values={{
          label: definition.label,
          unit: definition.unit ?? "",
          group: definition.group ?? "",
          icon: definition.icon ?? "",
          filterable: definition.filterable,
        }}
      />
    </div>
  );
}
