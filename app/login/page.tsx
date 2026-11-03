"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = "/";

  // Forgot password / OTP reset flow state
  const [resetMode, setResetMode] = useState<"email" | "otp" | "password" | null>(null);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("error");
    if (!errParam || error) return;
    if (errParam === "AccessDenied" || errParam === "Forbidden" || errParam === "OAuthCallbackError") {
      setError("Access Denied: Owner ADMIN role required.");
    } else if (errParam === "OAuthNotConfigured") {
      setError("Google OAuth is not configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Render environment variables.");
    } else {
      setError(`Authentication error: ${errParam}`);
    }
  }, [error]);

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // NextAuth v4 supported client API: establishes a REAL session cookie.
      // redirect: false so signIn returns { ok, url, error, status } without
      // performing an internal window.location navigation. The login page then
      // sets the localStorage mirror and navigates to callbackUrl in one
      // controlled full-page reload, so the session cookie set by the callback
      // is sent on the request to "/" and getServerSession can verify it.
      const result = await signIn("credentials", {
        email,
        password,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError(result.status === 401 ? "Invalid Owner Email or Password." : "Sign in failed: " + result.error);
        return;
      }

      // Keep the legacy static dashboard's auth wall in sync now that a real NextAuth
      // session cookie exists. Full-page reload so DOMContentLoaded re-evaluates the
      // localStorage-owned auth wall and boots the app.
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("owner_session_active", "true");
      }
      window.location.href = callbackUrl;
    } catch (err: any) {
      setError("Sign in error: " + (err?.message || "Network error connecting to NextAuth API."));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setLoading(true);
    try {
      // redirect: false so signIn returns the OAuth result without navigating
      // internally; the login page then navigates to callbackUrl in one
      // controlled full-page reload after the session cookie is set.
      const result = await signIn("google", {
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        const msg = String(result.error || "");
        if (
          msg.includes("OAuth not configured") ||
          msg.includes("Provider") ||
          msg.includes("oauth") ||
          result.status === 401
        ) {
          if (result.status === 401 && !msg.includes("configured")) {
            setError("Access Denied: Owner ADMIN role required. Only the configured OWNER_EMAIL may sign in with Google.");
          } else {
            setError("Google OAuth is not configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Render environment variables.");
          }
        } else if (result.status === 401) {
          setError("Access Denied: Owner ADMIN role required. Only the configured OWNER_EMAIL may sign in with Google.");
        } else {
          setError("Google sign-in failed: " + msg);
        }
        return;
      }

      if (typeof result?.url === "string" && result.url) {
        window.location.href = result.url;
        return;
      }

      setError("sign-in did not return an authorization URL. Please try again.");
      return;
    } catch (err: any) {
      setError(`Google sign-in error: ${err?.message || "Unable to initiate Google OAuth"}`);
    } finally {
      setLoading(false);
    }
  }

  // Forgot password: request a one-time password (OTP) sent to the owner email.
  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Failed to send OTP. Try again.");
        return;
      }
      setResetMode("otp");
    } catch {
      setError("Failed to send OTP. Try again.");
    } finally {
      setResetLoading(false);
    }
  }

  // Verify the OTP and issue a single-use reset token.
  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail.trim(), otp: otpCode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Invalid or expired OTP.");
        return;
      }
      if (json.ok && json.resetToken) {
        setResetMode("password");
      } else {
        setError("Invalid or expired OTP.");
      }
    } catch {
      setError("Failed to verify OTP. Try again.");
    } finally {
      setResetLoading(false);
    }
  }

  // Set a new password after successful OTP verification.
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: otpCode, newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Failed to reset password. Try again.");
        return;
      }
      setError("");
      setResetMode(null);
      setOtpEmail("");
      setOtpCode("");
      setNewPassword("");
      setError("Password reset successful. You can now sign in with your new password.");
    } catch {
      setError("Failed to reset password. Try again.");
    } finally {
      setResetLoading(false);
    }
  }

  function handleDemoLogin() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("owner_session_active", "true");
    }
    window.location.href = callbackUrl;
  }

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent"></div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 mb-3 font-mono font-bold text-lg">
            AI
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">My Personal AI Business Agent</h1>
          <p className="text-xs text-slate-400 mt-1">Owner Portal & Autonomous Business OS Login</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleCredentialsLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">Owner Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@gmail.com"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-brand-500 transition"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 pr-10 text-sm text-white focus:outline-none focus:border-brand-500 transition"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white text-xs focus:outline-none"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-500">
            Enter your configured OWNER_EMAIL and password. • NextAuth Credentials / Google OAuth
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-black transition shadow-lg shadow-brand-600/20 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "🔒 Authenticate as Owner"}
          </button>
        </form>

        {resetMode === null && (
          <p className="text-[10px] text-center text-slate-500 mt-2">
            <button
              type="button"
              onClick={() => {
                setResetMode("email");
                setError("");
              }}
              className="text-xs text-brand-400 hover:text-brand-300 underline decoration-brand-500/30"
            >
              Forgot password?
            </button>
          </p>
        )}

        {resetMode === "email" && (
          <form onSubmit={handleForgotPassword} className="mt-4 space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">Owner Email</label>
              <input
                type="email"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                placeholder="owner@gmail.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-brand-500 transition"
                required
              />
            </div>
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              {resetLoading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        )}

        {resetMode === "otp" && (
          <form onSubmit={handleVerifyOTP} className="mt-4 space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">6-digit OTP</label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-brand-500 transition"
                required
              />
            </div>
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              {resetLoading ? "Verifying..." : "Verify OTP"}
            </button>
          </form>
        )}

        {resetMode === "password" && (
          <form onSubmit={handleResetPassword} className="mt-4 space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-brand-500 transition"
                required
              />
            </div>
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              {resetLoading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        <div className="mt-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 bg-white hover:bg-slate-100 text-slate-900 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 transition shadow"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-8.87z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.36 7.24 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 11.7s.43 3.58 1.19 5.12l4.09-2.55z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.24 0 3.17 2.64 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="mt-2">
          <button
            type="button"
            onClick={handleDemoLogin}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 transition"
          >
            Use One-Click Demo Session
          </button>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 text-center">
          NextAuth session via <code className="text-slate-300">signIn()</code> from next-auth/react.
        </div>
      </div>
    </div>
  );
}
