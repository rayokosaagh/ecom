"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { parseRegistration } from "@/lib/auth/validation";
import { notifyAdmins } from "@/lib/notifications/service";
import { NotificationType, Role } from "@/generated/prisma/enums";

export type AuthFormState = {
  errors?: Record<string, string>;
  message?: string;
};

// After sign-in, land on the storefront — the dashboard is a click away for
// those who need it. A `redirectTo` param (e.g. from the cart flow) still wins.
const DEFAULT_REDIRECT = "/";

/**
 * Only allow relative, single-slash paths through as a post-login destination.
 * Without this, `?redirectTo=https://evil.example` would turn the login form
 * into an open redirect.
 */
function safeRedirect(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  if (!path.startsWith("/") || path.startsWith("//")) return DEFAULT_REDIRECT;
  return path;
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirect(formData.get("redirectTo"));

  if (!email || !password) {
    return {
      errors: {
        ...(email ? {} : { email: "Email is required" }),
        ...(password ? {} : { password: "Password is required" }),
      },
    };
  }

  try {
    // `redirect: false` keeps the redirect out of the try block, so a genuine
    // navigation is never mistaken for an auth failure.
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Incorrect email or password." };
    }
    throw error;
  }

  redirect(redirectTo);
}

export async function register(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (process.env.ALLOW_PUBLIC_SIGNUP === "false") {
    return { message: "Registration is currently disabled." };
  }

  const parsed = parseRegistration(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { errors: { email: "An account with this email already exists." } };
  }

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      // Self-registration always yields USER. Promotion to ADMIN is a
      // deliberate admin action, never something the signup form can grant.
      role: Role.USER,
    },
  });

  // Real event → real notification for the people who care about it.
  await notifyAdmins({
    type: NotificationType.ACCOUNT,
    title: "New account created",
    description: `${name} signed up (${email})`,
    href: "/dashboard/users",
  });

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // The account exists at this point, so send them to sign in manually
      // rather than losing the registration.
      return { message: "Account created — please sign in." };
    }
    throw error;
  }

  redirect(DEFAULT_REDIRECT);
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
