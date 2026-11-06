"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

type SessionResponse = {
  user?: { email?: string | null; role?: string; id?: string };
} | null;

type LoginMode = "password" | "otp";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpNotice, setOtpNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = "/";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("error");
    if (!errParam || error) return;
    if (["AccessDenied", "Forbidden", "OAuthCallbackError"].includes(errParam)) {
      setError("Access Denied: Owner ADMIN role required.");
    } else if (errParam === "OAuthNotConfigured") {
      setError("Google OAuth is not configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Render environment variables.");
    } else {
      setError(`Authentication error: ${errParam}`);
    }
  }, [error]);

  async function confirmAdminSession(expectedEmail: string) {
    const response = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;

    const session = (await response.json()) as SessionResponse;
    const actualEmail = session?.user?.email?.trim().toLowerCase();
    return session?.user?.role === "ADMIN" && Boolean(session.user.id) && actualEmail === expectedEmail.trim().toLowerCase();
  }

  function switchMode(nextMode: LoginMode) {
    if (loading || otpSending) return;
    setError("");
    setOtpNotice("");
    if (nextMode === "otp" && !otpEmail) {
      setOtpEmail(email);
    }
    setMode(nextMode);
  }

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });

      if (!result || result.error) {
        setError(result?.status === 401 ? "Invalid Owner Email or Password." : `Sign in failed${result?.error ? `: ${result.error}` : "."}`);
        return;
      }

      // A successful signIn response is not enough to prove the browser can read
      // the session cookie. Confirm the server-issued session before navigating.
      if (!(await confirmAdminSession(email))) {
        setError("Sign-in was accepted, but an ADMIN session could not be confirmed. Please try again or contact the owner.");
        return;
      }

      // This flag only dismisses the legacy static dashboard's auth wall;
      // authorization is enforced by NextAuth middleware and server-side checks.
      window.localStorage.setItem("owner_session_active", "true");
      window.location.assign(callbackUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error connecting to NextAuth API.";
      setError(`Sign in error: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpRequest(e: React.FormEvent) {
    e.preventDefault();
    if (loading || otpSending) return;
    if (!otpEmail.trim()) {
      setError("Please enter the owner email address.");
      return;
    }

    setOtpSending(true);
    setError("");
    setOtpNotice("");

    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail }),
      });

      const data = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };

      if (!response.ok || !data.success) {
        setError(data.error || "Could not send a sign-in code.");
        return;
      }

      setOtpSent(true);
      setOtpNotice(data.message || "If this address is authorized, a 6-digit sign-in code has been sent.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error requesting a sign-in code.";
      setError(`Sign in error: ${message}`);
    } finally {
      setOtpSending(false);
    }
  }

  async function handleOtpLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const code = otpCode.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // The Credentials provider verifies and consumes the code exactly once.
      // There is deliberately no separate "verify" endpoint call here.
      const result = await signIn("credentials", {
        email: otpEmail,
        otp: code,
        callbackUrl,
        redirect: false,
      });

      if (!result || result.error) {
        setError(result?.status === 401 ? "Invalid or expired code." : `Sign in failed${result?.error ? `: ${result.error}` : "."}`);
        return;
      }

      if (!(await confirmAdminSession(otpEmail))) {
        setError("Sign-in was accepted, but an ADMIN session could not be confirmed. Please try again or contact the owner.");
        return;
      }

      window.localStorage.setItem("owner_session_active", "true");
      window.location.assign(callbackUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error connecting to NextAuth API.";
      setError(`Sign in error: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      // OAuth requires a browser navigation to Google's authorization endpoint.
      // Do not use redirect:false or inspect a returned URL for this provider.
      await signIn("google", { callbackUrl });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to initiate Google OAuth.";
      setError(`Google sign-in error: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent"></div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 mb-3 font-mono font-bold text-lg">AI</div>
          <h1 className="text-xl font-black text-white tracking-tight">My Personal AI Business Agent</h1>
          <p className="text-xs text-slate-400 mt-1">Owner Portal &amp; Autonomous Business OS Login</p>
        </div>

        {error && <div role="alert" className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs">{error}</div>}

        {mode === "password" ? (
          <form onSubmit={handleCredentialsLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">Owner Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@gmail.com" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-brand-500 transition" required autoComplete="username" />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white focus:outline-none focus:border-brand-500 transition" required autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white text-xs focus:outline-none">{showPassword ? "Hide" : "Show"}</button>
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-500">Enter your configured OWNER_EMAIL and password. • NextAuth Credentials / Google OAuth</div>

            <button type="submit" disabled={loading} className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-black transition shadow-lg shadow-brand-600/20 disabled:opacity-50">
              {loading ? "Authenticating..." : "🔒 Authenticate as Owner"}
            </button>

            <button type="button" onClick={() => switchMode("otp")} disabled={loading} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition disabled:opacity-50">
              ✉️ Email me a 6-digit sign-in code
            </button>
          </form>
        ) : (
          <form onSubmit={otpSent ? handleOtpLogin : handleOtpRequest} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">Owner Email</label>
              <input type="email" value={otpEmail} onChange={(e) => setOtpEmail(e.target.value)} placeholder="owner@gmail.com" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-brand-500 transition" required autoComplete="username" disabled={otpSent} />
            </div>

            {otpSent && (
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">6-Digit Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center tracking-[0.5em] font-mono text-lg text-white focus:outline-none focus:border-brand-500 transition"
                  required
                />
                <p className="text-[11px] font-mono text-slate-500 mt-2">The code expires 5 minutes after it was sent and can be used only once.</p>
              </div>
            )}

            {otpNotice && <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300">{otpNotice}</div>}

            <button type="submit" disabled={loading || otpSending} className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-black transition shadow-lg shadow-brand-600/20 disabled:opacity-50">
              {otpSending ? "Sending code..." : loading ? "Verifying code..." : otpSent ? "🔓 Sign in with code" : "✉️ Send sign-in code"}
            </button>

            {otpSent && (
              <button type="button" onClick={handleOtpRequest} disabled={loading || otpSending} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition disabled:opacity-50">
                Send a new code
              </button>
            )}

            <button type="button" onClick={() => switchMode("password")} disabled={loading || otpSending} className="w-full py-2.5 bg-transparent hover:bg-slate-800 text-slate-400 rounded-xl text-xs font-bold transition disabled:opacity-50">
              Use password instead
            </button>

            <div className="text-[11px] font-mono text-slate-500 text-center">Code verified once via the NextAuth Credentials provider. • ADMIN access only</div>
          </form>
        )}

        <div className="mt-3">
          <button type="button" onClick={handleGoogleLogin} disabled={loading} className="w-full py-3 bg-white hover:bg-slate-100 text-slate-900 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 transition shadow disabled:opacity-50">
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.87z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.36 7.24 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 11.7s.43 3.58 1.19 5.12l4.09-2.55z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.24 0 3.17 2.64 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 text-center">NextAuth session via <code className="text-slate-300">signIn()</code> from next-auth/react.</div>
      </div>
    </div>
  );
}
