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

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function getOwnerConfig() {
  const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
  const ownerHash = process.env.OWNER_PASSWORD_HASH?.trim();
  return { ownerEmail, ownerHash };
}

function validateProductionEnv(): string[] {
  const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "OWNER_EMAIL", "OWNER_PASSWORD_HASH"];
  const missing = required.filter((v) => !process.env[v]);

  if (missing.length > 0 && isProduction()) {
    throw new Error(`[Auth Security Error] Missing required production environment variables: ${missing.join(", ")}`);
  }

  if (isProduction()) {
    const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
    if (nextAuthUrl && !/^https:\/\//i.test(nextAuthUrl)) {
      throw new Error("[Auth Security Error] NEXTAUTH_URL must use https:// in production.");
    }
  }

  return missing;
}

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
        validateProductionEnv();

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = normalizeEmail(credentials.email);
        const { ownerEmail, ownerHash } = getOwnerConfig();

        if (ownerEmail && ownerHash && email === ownerEmail) {
          try {
            const ok = await bcrypt.compare(credentials.password, ownerHash);
            if (ok) {
              return {
                id: "owner_admin_01",
                email: ownerEmail,
                name: "Owner Admin",
                role: "ADMIN",
              } as any;
            }
          } catch {
            return null;
          }
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (user?.passwordHash) {
            const ok = await bcrypt.compare(credentials.password, user.passwordHash);
            if (ok) {
              return {
                id: user.id,
                email: user.email,
                name: user.name || "Agency Staff",
                role: user.role,
              } as any;
            }
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
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction(),
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction(),
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production" ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction(),
      },
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
        const userEmail = normalizeEmail(user.email);
        const isVerified = (profile as any)?.email_verified === true || (profile as any)?.verified_email === true || (user as any)?.emailVerified;

        if (!ownerEmail) {
          console.error("Google sign-in rejected: OWNER_EMAIL is not configured.");
          return false;
        }

        if (!isVerified) {
          return false;
        }

        if (userEmail === ownerEmail) {
          (user as any).role = "ADMIN";
          return true;
        }

        console.error("Google sign-in rejected: user email does not match OWNER_EMAIL");
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
  const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
  if (!ownerEmail) {
    throw new Error("UNAUTHORIZED: OWNER_EMAIL not configured");
  }
  return ownerEmail;
}

export function isOwner(email?: string | null) {
  if (!email) return false;
  return normalizeEmail(email) === requireOwnerEmail();
}
