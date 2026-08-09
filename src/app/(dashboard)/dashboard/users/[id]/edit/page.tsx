import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminUserForm } from "@/components/users/AdminUserForm";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { adminUpdateUser, adminDeleteUser } from "@/lib/actions/users";

export const metadata: Metadata = { title: "Edit user" };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    // passwordHash is deliberately never selected.
    select: { id: true, name: true, email: true, image: true, role: true, createdAt: true },
  });

  if (!user) notFound();

  const isSelf = user.id === admin.id;
  const action = adminUpdateUser.bind(null, user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/dashboard/users"
          className="text-on-surface-variant inline-flex items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={16} />
          Users
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">
          {user.name ?? user.email}
        </h2>
        <p className="text-on-surface-variant text-sm">
          Joined{" "}
          {user.createdAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <AdminUserForm action={action} user={user} isSelf={isSelf} />

      {!isSelf && (
        <Card variant="outlined" className="border-error/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-on-surface text-sm font-medium">Delete this user</p>
              <p className="text-on-surface-variant text-xs">
                Their products stay, but are no longer attributed to them.
              </p>
            </div>
            <form action={adminDeleteUser}>
              <input type="hidden" name="id" value={user.id} />
              <Button
                type="submit"
                variant="outlined"
                icon="delete"
                className="border-error text-error"
              >
                Delete
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
