import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config.
 *
 * `proxy.ts` runs on the edge runtime, where Prisma and node:crypto are not
 * available. This file therefore holds only the callbacks and page overrides —
 * the Credentials provider and the Prisma adapter live in `auth.ts`, which is
 * only ever imported from the Node runtime.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Credentials sign-in requires JWT sessions; the Prisma adapter's database
  // session strategy only supports OAuth/email providers.
  session: { strategy: "jwt" },
  callbacks: {
    // Persist id and role onto the token at sign-in, so later requests can
    // authorize without a database round trip.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
