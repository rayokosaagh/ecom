import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { SpecDefinitionForm } from "@/components/products/SpecDefinitionForm";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { createSpecDefinition } from "@/lib/actions/specs";

export const metadata: Metadata = { title: "New spec label" };

/** Sections already in use, so a new label joins one rather than inventing it. */
async function getGroups(): Promise<string[]> {
  const rows = await prisma.specDefinition.findMany({
    where: { group: { not: null } },
    distinct: ["group"],
    orderBy: { group: "asc" },
    select: { group: true },
  });
  return rows.flatMap((row) => (row.group ? [row.group] : []));
}

export default async function NewSpecPage() {
  await requireAdmin();

  const groups = await getGroups();

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
        <h2 className="text-on-surface mt-2 text-2xl font-normal">New spec label</h2>
      </div>

      <SpecDefinitionForm
        action={createSpecDefinition}
        knownGroups={groups}
        submitLabel="Create label"
      />
    </div>
  );
}
