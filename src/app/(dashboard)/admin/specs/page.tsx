import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  SpecDefinitionList,
  type SpecDefinitionRow,
} from "@/components/products/SpecDefinitionList";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Spec labels" };

export default async function AdminSpecsPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const definitions = await prisma.specDefinition.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      key: true,
      unit: true,
      group: true,
      icon: true,
      filterable: true,
      _count: { select: { specs: true } },
    },
  });

  // How many distinct answers each label has across the catalogue. A label
  // where that equals the product count yields a facet with one product per
  // option, which is the signal for turning `filterable` off.
  const distinct = await prisma.productSpec.findMany({
    distinct: ["definitionId", "valueKey"],
    select: { definitionId: true },
  });

  const valueCounts = new Map<string, number>();
  for (const row of distinct) {
    valueCounts.set(row.definitionId, (valueCounts.get(row.definitionId) ?? 0) + 1);
  }

  const rows: SpecDefinitionRow[] = definitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    key: definition.key,
    unit: definition.unit,
    group: definition.group,
    icon: definition.icon,
    filterable: definition.filterable,
    productCount: definition._count.specs,
    valueCount: valueCounts.get(definition.id) ?? 0,
  }));

  const filterableCount = rows.filter((row) => row.filterable).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Spec labels</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "Shared across the catalogue, so shoppers can filter by them."
              : `${filterableCount} of ${rows.length} offered as filters.`}
          </p>
        </div>

        <Link
          href="/admin/specs/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add label
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="table_rows" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">No spec labels yet</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Labels are created on the fly from the product form. Adding one
              here lets you set its unit, section and whether it becomes a
              filter before it is used.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SpecDefinitionList rows={rows} />
      )}
    </div>
  );
}
