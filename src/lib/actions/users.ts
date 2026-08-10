"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOut, unstable_update } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";
import { isSafeImageUrl } from "@/lib/products/validation";
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

function validateProfile(fields: { name: string; email: string; image: string }) {
  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Name is required";
  else if (fields.name.length > 80) errors.name = "Name must be 80 characters or fewer";
  if (!fields.email) errors.email = "Email is required";
  else if (!EMAIL_PATTERN.test(fields.email)) errors.email = "Enter a valid email address";
  // Blank is how a picture is removed. Anything else is checked against the
  // same rule product images are: an uploaded file or an http(s) address, so a
  // `javascript:` or `data:` value can never reach the <img> the avatar
  // becomes. The upload action returns URLs of exactly this shape, but the
  // field also accepts a pasted address, and a form is never the authority.
  if (fields.image && !isSafeImageUrl(fields.image)) {
    errors.image = "Picture must be an uploaded file or an http(s) URL";
  }
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

  const image = fields.image || null;

  await prisma.user.update({
    where: { id: user.id },
    data: { name: fields.name, email: fields.email, image },
  });

  /**
   * The row is the truth; the token is a copy of it that the navbar reads.
   *
   * Wrapped because the save has already happened: if refreshing the session
   * fails, the edit is still saved and the worst case is a stale name or
   * avatar in the bar until the next sign-in. Failing the action here would
   * report a successful change as an error.
   */
  try {
    await unstable_update({ user: { name: fields.name, email: fields.email, image } });
  } catch (error) {
    console.error("[users] could not refresh session after profile update", error);
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard/users");
  // The avatar sits in the navbar, which every storefront page renders.
  revalidatePath("/", "layout");
  return { success: "Profile updated." };
}

/** Which notices this account wants. All four default on. */
export async function updateNotifications(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const user = await requireUser();

  // Unchecked boxes submit nothing at all, so absence is the "off" signal —
  // which is why every switch has to be read, not just the ones present.
  const on = (name: string) => formData.get(name) === "on";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      notifyOrders: on("notifyOrders"),
      notifyStock: on("notifyStock"),
      notifyNews: on("notifyNews"),
      notifyEmails: on("notifyEmails"),
    },
  });

  revalidatePath("/profile");
  return { success: "Notification preferences saved." };
}

/**
 * Close your own account.
 *
 * Anonymised in place rather than deleted. `Order.userId` cascades, so deleting
 * the row would take every order this person ever placed with it — the shop's
 * revenue figures would silently fall, past receipts would stop reconciling,
 * and the stock adjustments tied to those orders would point at nothing. What
 * the shop keeps is the transaction; what goes is the person.
 *
 * So: the personal data is overwritten, everything that is purely theirs
 * (addresses, wishlist, reviews, notifications, cart) is deleted outright, and
 * the row is left as a tombstone that still owns the orders and cannot be
 * signed into. The orders keep their own snapshotted delivery details, which is
 * a deliberate limit worth stating plainly to the user rather than hiding: a
 * shop has to be able to say where it sent something.
 *
 * Password-confirmed. This is irreversible, and a misclick should not be enough.
 */
export async function deleteAccount(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const user = await requireUser();

  const password = String(formData.get("password") ?? "");
  if (!password) return { errors: { password: "Enter your password to confirm" } };

  // Typing the word is the second gate: a password manager fills the first one
  // without the owner having read anything.
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { errors: { confirm: "Type DELETE to confirm" } };
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, role: true },
  });
  if (!record?.passwordHash) {
    return { message: "This account has no password set, so it cannot be closed here." };
  }

  if (!(await verifyPassword(password, record.passwordHash))) {
    return { errors: { password: "That password is incorrect" } };
  }

  /**
   * An administrator cannot close their own account from here.
   *
   * The same reasoning as `adminUpdateUser` refusing to take away your own last
   * privilege: a shop that has locked itself out of its own dashboard has a
   * worse problem than an account it wanted rid of.
   */
  if (record.role === Role.ADMIN) {
    return {
      message:
        "Administrator accounts cannot be closed here. Ask another administrator to change your role first.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.deleteMany({ where: { userId: user.id } });
    await tx.wishlistItem.deleteMany({ where: { userId: user.id } });
    await tx.review.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.cart.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    // Any OAuth links and server-side sessions go too, or the account could be
    // signed back into by a route that never looks at the password.
    await tx.account.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });

    await tx.user.update({
      where: { id: user.id },
      data: {
        name: "Deleted account",
        // Unique, so closing a second account cannot collide — and shaped so it
        // can never be a real inbox somebody later signs up with.
        email: `deleted-${user.id}@deleted.invalid`,
        image: null,
        passwordHash: null,
        closedAt: new Date(),
        notifyOrders: false,
        notifyStock: false,
        notifyNews: false,
        notifyEmails: false,
      },
    });
  });

  revalidatePath("/", "layout");
  revalidatePath("/dashboard/users");

  // Out of the browser as well as out of the database. `signOut` redirects, so
  // nothing after this runs. To /login rather than the storefront, because that
  // page can say what happened — see its `notice`.
  await signOut({ redirectTo: "/login?closed=1" });

  return {};
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
