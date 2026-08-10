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
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }

      /**
       * A profile edit catching up with the token.
       *
       * Sessions are JWTs, so what the navbar shows — the name, the email, the
       * avatar — is whatever was true at sign-in, not what is in the database
       * now. Without this, someone who uploads a profile picture saves it,
       * sees it on /profile (which reads the row), and finds their old initial
       * still in the bar until they next sign in.
       *
       * Only the three display fields are taken. `id` and `role` are
       * deliberately absent: they are the only two anything authorizes on, and
       * this payload is not a trustworthy source — Auth.js exposes the update
       * as a POST to its own session route, so it is reachable by more than
       * the server action that means to call it.
       */
      if (trigger === "update") {
        const patch = (session as { user?: Record<string, unknown> } | undefined)?.user;
        if (patch) {
          if (typeof patch.name === "string") token.name = patch.name;
          if (typeof patch.email === "string") token.email = patch.email;
          // Cleared as well as set — removing an avatar has to reach the bar
          // the same way adding one does.
          if ("image" in patch) {
            token.picture = typeof patch.image === "string" ? patch.image : null;
          }
        }
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
