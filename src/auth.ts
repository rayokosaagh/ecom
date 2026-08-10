import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { parseCredentials } from "@/lib/auth/validation";
import { claimGuestCart } from "@/lib/cart/merge";
import { clearCartToken, readCartToken } from "@/lib/cart/cookie";

// `unstable_update` is how a server action pushes a profile edit into the JWT.
// Still prefixed in Auth.js v5 beta; it is the only supported way to refresh a
// token in place, and the alternative — reading the user from the database on
// every request — is exactly what the token exists to avoid.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  // The adapter is not used for Credentials sessions, but keeping it wired up
  // means adding an OAuth provider later needs no schema or config changes.
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = parseCredentials(raw);
        if (!parsed.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        // Returning null for "no such user" and "wrong password" alike keeps
        // the failure indistinguishable, so this cannot be used to enumerate
        // which email addresses have accounts.
        if (!user?.passwordHash) return null;

        // A closed account is a tombstone that still owns its orders. Its
        // password hash is already cleared, so this is belt and braces — but
        // the row is the thing that says the account is gone, and the check
        // should read from it rather than from a side effect of closing.
        if (user.closedAt) return null;

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  events: {
    /**
     * Hand over whatever was in the browser's cart.
     *
     * Here rather than on the next request because this runs inside the auth
     * route handler, which is allowed to write cookies — a page render is not,
     * so a signed-in visitor who only browses would otherwise carry a stale
     * guest cookie until they happened to take an action.
     *
     * A failure here must not block the sign-in: losing a guest cart is a bad
     * afternoon, being unable to sign in is a broken site.
     */
    async signIn({ user }) {
      if (!user.id) return;
      try {
        const token = await readCartToken();
        if (!token) return;
        await claimGuestCart(token, user.id);
        await clearCartToken();
      } catch (error) {
        console.error("cart claim failed", error);
      }
    },
  },
});
