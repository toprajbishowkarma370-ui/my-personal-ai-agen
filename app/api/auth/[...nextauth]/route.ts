import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Export authOptions as a plain JS object (no NextAuth import at module load)
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const ownerEmail = process.env.OWNER_EMAIL || "alex.morgan@agency.local";
        const ownerHash = process.env.OWNER_PASSWORD_HASH;

        if (credentials.email.toLowerCase() === ownerEmail.toLowerCase() && ownerHash) {
          const ok = await bcrypt.compare(credentials.password, ownerHash);
          if (ok) return { id: "owner_admin_01", email: ownerEmail, name: "Alex Morgan", role: "ADMIN" } as any;
        }

        try {
          const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase() } as any });
          if (user?.passwordHash && await bcrypt.compare(credentials.password, user.passwordHash)) {
            return { id: user.id, email: user.email, name: user.name || "Agency Staff", role: user.role } as any;
          }
        } catch (e) {
          console.error("Prisma auth lookup error", e);
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || "ADMIN";
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role || "ADMIN";
      }
      return session;
    }
  },
  pages: { signIn: "/login" }
};

// Dynamic handler: import NextAuth only at request time so builds without NEXTAUTH_SECRET succeed
export async function GET(req: Request) {
  const { default: NextAuth } = await import("next-auth/next");
  const handler = NextAuth(authOptions as any);
  // NextAuth expects Next.js request/response objects; adapt by calling handler with req as any
  // In App Router route handlers, exporting GET/POST that call NextAuth like this is supported.
  return handler(req as any);
}

export async function POST(req: Request) {
  const { default: NextAuth } = await import("next-auth/next");
  const handler = NextAuth(authOptions as any);
  return handler(req as any);
}
