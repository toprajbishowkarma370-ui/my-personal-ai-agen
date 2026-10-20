
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const authOptions: NextAuthOptions = {
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
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.toLowerCase();
        const ownerEmail = process.env.OWNER_EMAIL;
        const ownerHash = process.env.OWNER_PASSWORD_HASH;

        if (
          ownerEmail &&
          ownerHash &&
          email === ownerEmail.toLowerCase()
        ) {
          const ok = await bcrypt.compare(
            credentials.password,
            ownerHash
          );

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

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
