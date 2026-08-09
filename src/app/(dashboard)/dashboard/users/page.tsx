import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { FilterPills } from "@/components/admin/FilterPills";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Users · Ecom" };

/** Admin-only. `requireAdmin()` re-checks the role against the database. */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const role =
    params.role === Role.ADMIN || params.role === Role.USER ? params.role : undefined;

  const search: Prisma.UserWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, counts] = await Promise.all([
    prisma.user.findMany({
      where: { ...search, ...(role ? { role } : {}) },
      orderBy: { createdAt: "desc" },
      // Selected explicitly — passwordHash must never leave the data layer.
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    // Under the search but not under the role filter, so the rail keeps saying
    // what else is there rather than recounting itself to zero.
    prisma.user.groupBy({ by: ["role"], where: search, _count: { _all: true } }),
  ]);

  const adminCount = counts.find((row) => row.role === Role.ADMIN)?._count._all ?? 0;
  const userCount = counts.find((row) => row.role === Role.USER)?._count._all ?? 0;
  const filtered = Boolean(query || role);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Users</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          {users.length} account{users.length === 1 ? "" : "s"}
          {filtered && ` matching, of ${adminCount + userCount}`}
        </p>
      </div>

      <ListToolbar searchLabel="Search users by name or email" alsoClear={["role"]} />

      <FilterPills
        label="Filter by role"
        param="role"
        basePath="/dashboard/users"
        params={params}
        options={[
          { value: "", label: "All", count: adminCount + userCount },
          { value: Role.ADMIN, label: "Admin", count: adminCount },
          { value: Role.USER, label: "User", count: userCount },
        ]}
      />

      {users.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="search_off" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">Nothing matches those filters</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Searches cover the account&rsquo;s name and email address.
            </p>
          </CardContent>
        </Card>
      ) : (
      <Card variant="outlined" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-on-surface-variant border-outline-variant border-b">
              <tr>
                <th scope="col" className="px-6 py-3 font-medium">User</th>
                <th scope="col" className="px-6 py-3 font-medium">Role</th>
                <th scope="col" className="px-6 py-3 font-medium">Joined</th>
                <th scope="col" className="px-6 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-outline-variant hover:bg-on-surface/[0.04] border-b last:border-0 transition-colors duration-200"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary-container text-on-primary-container grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium">
                        {(user.name ?? user.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-on-surface truncate">{user.name ?? "—"}</p>
                        <p className="text-on-surface-variant truncate text-xs">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={
                        user.role === Role.ADMIN
                          ? "bg-primary-container text-on-primary-container inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs"
                          : "bg-surface-container-highest text-on-surface-variant inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs"
                      }
                    >
                      <Icon
                        name={user.role === Role.ADMIN ? "shield_person" : "person"}
                        size={14}
                      />
                      {user.role === Role.ADMIN ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="text-on-surface-variant px-6 py-4">
                    {user.createdAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/users/${user.id}/edit`}
                      aria-label={`Edit ${user.name ?? user.email}`}
                      className="text-on-surface-variant hover:bg-on-surface/[0.08] inline-grid size-9 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="edit" size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </div>
  );
}
