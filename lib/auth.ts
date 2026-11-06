import { getServerSession } from "next-auth/next";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { verifyOtpLogin } from "./otp";
import { prismaOtpStore } from "./otp-store";
import { findMissingAuthEnv } from "./auth-env";

export type Role = "ADMIN" | "AGENT" | "CLIENT";

export const VALID_ROLES = new Set<Role>(["ADMIN", "AGENT", "CLIENT"]);

export function normalizeRole(role: unknown): Role | undefined {
  if (typeof role !== "string") {
    return undefined;
  }

  return VALID_ROLES.has(role as Role) ? (role as Role) : undefined;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

/**
 * NEXTAUTH_URL is intentionally part of the base list: it is the single source
 * of truth for the Google OAuth callback (never derived from the Host header).
 *
 * OWNER_PASSWORD_HASH is NOT in the base list. Password login stays available
 * when it is set, but OTP email login only needs NEXTAUTH_SECRET,
 * OWNER_EMAIL and an OTP delivery channel (Gmail or SMTP).
 */
export const REQUIRED_AUTH_ENV = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "DATABASE_URL", "OWNER_EMAIL"] as const;

function validateProductionEnv(): string[] {
  const missing = findMissingAuthEnv(REQUIRED_AUTH_ENV);
  if (missing.length > 0 && isProduction()) {
    throw new Error(`[Auth Security Error] Missing required production environment variables: ${missing.join(", ")}`);
  }
  return missing;
}

export const authOptions: NextAuthOptions = {
  // NEXTAUTH_URL is the single source of truth for the OAuth callback URL.
  // trustHost is intentionally NOT set: it would derive the callback URL from
  // the incoming request Host/X-Forwarded-Host header (e.g. localhost:3000
  // behind Render's proxy) instead of NEXTAUTH_URL, causing
  // redirect_uri_mismatch against Google's configured production callback.
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
        otp: { label: "One-time code", type: "text" },
      },
      async authorize(credentials) {
        // Fail safely in production: never authenticate when required secrets
        // are absent. Return null (fail safely) instead of throwing so NextAuth
        // returns a clean authentication error instead of an unhandled
        // exception.
        const missing = validateProductionEnv();
        if (missing.length > 0) {
          return null;
        }

        if (!credentials?.email) {
          return null;
        }

        const email = credentials.email?.toLowerCase()?.trim();
        const ownerEmail = process.env.OWNER_EMAIL?.trim()?.toLowerCase();
        const ownerHash = process.env.OWNER_PASSWORD_HASH?.trim();

        // OTP login. This is the ONLY place a one-time code is verified and
        // consumed: /api/auth/otp/request only issues codes, it never verifies
        // them, and the login page calls signIn("credentials") once. Verify and
        // consume happen in a single call so a code can never be checked twice.
        const otpCode = typeof credentials.otp === "string" ? credentials.otp.trim() : "";
        if (otpCode.length > 0) {
          const otpResult = await verifyOtpLogin({
            email,
            code: otpCode,
            ownerEmail: process.env.OWNER_EMAIL,
            secret: process.env.NEXTAUTH_SECRET,
            store: prismaOtpStore,
          });

          if (!otpResult.ok) {
            // Reason only: never log the submitted code or the session token.
            const reason = "reason" in otpResult ? otpResult.reason : "invalid";
            console.warn("[auth] OTP login rejected:", reason);
            return null;
          }

          return otpResult.user as any;
        }

        if (!credentials.password) {
          return null;
        }

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

          if (user?.passwordHash && (await bcrypt.compare(credentials.password, user.passwordHash))) {
            const role = normalizeRole(user.role);
            if (!role) {
              return null;
            }

            return {
              id: user.id,
              email: user.email,
              name: user.name || "Agency Staff",
              role,
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
  cookies: {
    sessionToken: {
      name: isProduction() ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction(),
      },
    },
    callbackUrl: {
      name: isProduction() ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction(),
      },
    },
    csrfToken: {
      name: isProduction() ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
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
        const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
        const userEmail = user.email?.trim().toLowerCase();
        const isVerified =
          (profile as any)?.email_verified === true ||
          (profile as any)?.verified_email === true ||
          (user as any)?.emailVerified;

        if (!isVerified) {
          return false;
        }

        if (ownerEmail && userEmail === ownerEmail) {
          (user as any).role = "ADMIN";
          return true;
        }

        console.error("Google sign-in rejected: user email does not match OWNER_EMAIL");
        return false;
      }

      return true;
    },

    async jwt({ token, user, account }) {
      const userRole = normalizeRole((user as any)?.role ?? (token as any)?.role);

      if (user) {
        (token as any).id = (user as any).id ?? (token as any).sub;
        (token as any).sub = (token as any).id ?? (token as any).sub;
        if ((user as any).email) {
          (token as any).email = (user as any).email;
        }
      }

      if (userRole) {
        (token as any).role = userRole;
      } else {
        delete (token as any).role;
      }

      if (account?.provider === "google") {
        (token as any).provider = account.provider;
      }

      return token;
    },

    async session({ session, token }) {
      const sessionRole = normalizeRole((token as any)?.role ?? (session.user as any)?.role);

      if (session.user) {
        (session.user as any).id = (token as any).sub ?? (token as any).id;
        if (sessionRole) {
          (session.user as any).role = sessionRole;
        } else {
          delete (session.user as any).role;
        }

        if ((token as any).provider) {
          (session.user as any).provider = (token as any).provider;
        }
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
  const role = normalizeRole((session as any)?.user?.role);

  if (!session || role !== "ADMIN") {
    throw new Error("UNAUTHORIZED: Owner ADMIN role required");
  }

  return session;
}

export async function requireAgentSession() {
  const session = await getAuthSession();
  const role = normalizeRole((session as any)?.user?.role);

  if (!session || !role || !["ADMIN", "AGENT"].includes(role)) {
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
