import { getServerSession } from "next-auth/next";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export type Role = "ADMIN" | "AGENT" | "CLIENT";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function validateProductionEnv(): string[] {
  const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "OWNER_EMAIL", "OWNER_PASSWORD_HASH"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0 && isProduction()) {
    throw new Error(`[Auth Security Error] Missing required production environment variables: ${missing.join(", ")}`);
  }
  return missing;
}

// Do not validate at module load time: the build and dev server import this module
// before production environment variables are available. Validation happens lazily at
// request time inside authorize(), so production never starts with silent fallback secrets.
export const authOptions: NextAuthOptions = {
  // @ts-ignore
  trustHost: true,
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
        // Fail safely in production: never authenticate when required secrets are absent.
        validateProductionEnv();

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email?.toLowerCase()?.trim();
        const ownerEmail = process.env.OWNER_EMAIL?.trim()?.toLowerCase();
        const ownerHash = process.env.OWNER_PASSWORD_HASH?.trim();

        if (ownerEmail && ownerHash && email === ownerEmail) {
          let ok = false;
          try {
            ok = await bcrypt.compare(credentials.password, ownerHash);
          } catch {
            ok = false;
          }
          if (ok) {
            return {
              id: "owner_admin_01",
              email: ownerEmail,
              name: "Owner Admin",
              role: "ADMIN",
            } as any;
          }
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (user?.passwordHash && await bcrypt.compare(credentials.password, user.passwordHash)) {
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
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: "select_account",
                access_type: "offline",
                response_type: "code",
              },
            },
          }),
        ]
      : []),
  ],
  // Use NextAuth v4 native cookie handling for better compatibility in production
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
        const userEmail = user.email?.trim().toLowerCase();
        const isVerified = (profile as any)?.email_verified === true || (user as any)?.emailVerified;

        if (!isVerified) {
          return false;
        }

        if (ownerEmail && userEmail === ownerEmail) {
          (user as any).role = "ADMIN";
          return true;
        }
        return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || "ADMIN";
      }
      if (account?.provider === "google") {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role || "ADMIN";
        (session.user as any).provider = token.provider;
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

export function requireOwnerEmail() {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    throw new Error("UNAUTHORIZED: OWNER_EMAIL not configured");
  }
  return ownerEmail.toLowerCase();
}

export function isOwner(email?: string | null) {
  if (!email) return false;
  return email.trim().toLowerCase() === requireOwnerEmail();
}
