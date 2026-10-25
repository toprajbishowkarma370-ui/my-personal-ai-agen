import { getServerSession } from "next-auth/next";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export type Role = "ADMIN" | "AGENT" | "CLIENT";

function validateProductionEnv() {
  const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "OWNER_EMAIL", "OWNER_PASSWORD_HASH"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0 && process.env.NODE_ENV === "production") {
    console.error(`[Auth] Configuration Error: Missing required production environment variables: ${missing.join(", ")}`);
  }
  return missing;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        validateProductionEnv();

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase();
        const ownerEmail = process.env.OWNER_EMAIL?.trim();
        const ownerHash = process.env.OWNER_PASSWORD_HASH?.trim();

        console.log(`[Auth] Attempting login for email length: ${email.length}`);
        console.log(`[Auth] OWNER_EMAIL configured: ${!!ownerEmail}, OWNER_PASSWORD_HASH configured: ${!!ownerHash}, Hash valid prefix: ${ownerHash?.startsWith('$2')}`);

        if (
          ownerEmail &&
          ownerHash &&
          email === ownerEmail.toLowerCase()
        ) {
          const ok = await bcrypt.compare(
            credentials.password,
            ownerHash
          );
          console.log(`[Auth] Owner email match. Bcrypt comparison result: ${ok}`);

          if (ok) {
            return {
              id: "owner_admin_01",
              email: ownerEmail,
              name: "Owner Admin",
              role: "ADMIN",
            } as any;
          }
        } else {
          console.log(`[Auth] Owner email mismatch or missing config. Incoming email matched owner: ${email === ownerEmail?.toLowerCase()}`);
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (
            user?.passwordHash &&
            await bcrypt.compare(
              credentials.password,
              user.passwordHash
            )
          ) {
            return {
              id: user.id,
              email: user.email,
              name: user.name || "Agency Staff",
              role: user.role,
            } as any;
          }
        } catch (error) {
          console.error("Prisma auth lookup error", error);
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || "ADMIN";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role || "ADMIN";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function getAuthSession() {
  return await getServerSession(authOptions as any);
}

export async function requireAdminSession() {
  const session = await getAuthSession();

  if (!session || ((session as any).user as any)?.role !== "ADMIN") {
    throw new Error("UNAUTHORIZED: Owner ADMIN role required");
  }

  return session;
}

export async function requireAgentSession() {
  const session = await getAuthSession();
  const role = ((session as any)?.user as any)?.role;

  if (!session || !["ADMIN", "AGENT"].includes(role)) {
    throw new Error("UNAUTHORIZED: AGENT or ADMIN role required");
  }

  return session;
}
