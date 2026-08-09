"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";
import { Role } from "@/generated/prisma/enums";

export type UserFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readProfileFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    image: String(formData.get("image") ?? "").trim(),
  };
}

function validateProfile(fields: { name: string; email: string }) {
  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Name is required";
  else if (fields.name.length > 80) errors.name = "Name must be 80 characters or fewer";
  if (!fields.email) errors.email = "Email is required";
  else if (!EMAIL_PATTERN.test(fields.email)) errors.email = "Enter a valid email address";
  return errors;
}

// ---------------------------------------------------------------------------
// Admin: edit any user, including their role
// ---------------------------------------------------------------------------

export async function adminUpdateUser(
  id: string,
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const admin = await requireAdmin();

  const fields = readProfileFields(formData);
  const errors = validateProfile(fields);

  const roleRaw = String(formData.get("role") ?? "");
  if (roleRaw !== Role.ADMIN && roleRaw !== Role.USER) {
    errors.role = "Select a valid role";
  }
  const role = roleRaw as Role;

  // Stop an admin removing their own last privilege and locking themselves out.
  if (id === admin.id && role === Role.USER) {
    errors.role = "You cannot remove your own administrator role";
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return { message: "That user no longer exists." };

  if (!errors.email) {
    const clash = await prisma.user.findUnique({
      where: { email: fields.email },
      select: { id: true },
    });
    if (clash && clash.id !== id) errors.email = "Another account already uses this email";
  }

  // Optional password reset by an admin — blank means "leave unchanged".
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword && newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  if (Object.keys(errors).length > 0) return { errors };

  await prisma.user.update({
    where: { id },
    data: {
      name: fields.name,
      email: fields.email,
      image: fields.image || null,
      role,
      ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
    },
  });

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

export async function adminDeleteUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id || id === admin.id) return; // Never let an admin delete themselves.

  await prisma.user.delete({ where: { id } });
  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

// ---------------------------------------------------------------------------
// Self-service: a signed-in user editing their own account
// ---------------------------------------------------------------------------

export async function updateProfile(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  // Note the id comes from the session, never from the form — otherwise
  // anyone could edit any account by changing a hidden field.
  const user = await requireUser();

  const fields = readProfileFields(formData);
  const errors = validateProfile(fields);

  if (!errors.email) {
    const clash = await prisma.user.findUnique({
      where: { email: fields.email },
      select: { id: true },
    });
    if (clash && clash.id !== user.id) errors.email = "Another account already uses this email";
  }

  if (Object.keys(errors).length > 0) return { errors };

  await prisma.user.update({
    where: { id: user.id },
    data: { name: fields.name, email: fields.email, image: fields.image || null },
  });

  revalidatePath("/profile");
  revalidatePath("/dashboard/users");
  return { success: "Profile updated." };
}

export async function changePassword(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const user = await requireUser();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const errors: Record<string, string> = {};
  if (!currentPassword) errors.currentPassword = "Enter your current password";
  if (!newPassword) errors.newPassword = "Enter a new password";
  else if (newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (newPassword !== confirmPassword) errors.confirmPassword = "Passwords do not match";

  if (Object.keys(errors).length > 0) return { errors };

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!record?.passwordHash) {
    return { message: "This account has no password set." };
  }

  const valid = await verifyPassword(currentPassword, record.passwordHash);
  if (!valid) return { errors: { currentPassword: "That password is incorrect" } };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return { success: "Password changed." };
}
