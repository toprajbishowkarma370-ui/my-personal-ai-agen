import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    if ((pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login?error=Forbidden", req.url));
    }
    if (pathname.startsWith("/agent") && !["ADMIN","AGENT"].includes(token?.role as string)) {
      return NextResponse.redirect(new URL("/login?error=Forbidden", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const p = req.nextUrl.pathname;
        if (p === "/login" || p === "/" || p.startsWith("/api/auth") || p.startsWith("/api/webhooks") || p.startsWith("/chat") || p.startsWith("/api/chat-public") || p.startsWith("/api/health")) {
          return true;
        }
        return !!token;
      }
    },
    pages: { signIn: "/login" }
  }
);

export const config = {
  matcher: ["/dashboard/:path*","/admin/:path*","/agent/:path*","/api/((?!auth|webhooks|chat-public|health).*)"]
};
