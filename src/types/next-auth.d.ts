import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// Teach Auth.js about the `role` we attach in the jwt/session callbacks.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

// `next-auth/jwt` only re-exports `@auth/core/jwt`, so augmenting the former
// has no effect — the JWT interface is declared in the core package.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
