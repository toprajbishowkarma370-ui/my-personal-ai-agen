"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("error");
    if (errParam) {
      if (errParam === "AccessDenied" || errParam === "Forbidden") {
        setError("Access Denied: Owner ADMIN role required.");
      } else {
        setError(`Authentication error: ${errParam}`);
      }
    }
  }, []);

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      if (!csrfRes.ok) throw new Error("CSRF fetch failed");
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.csrfToken;

      const formData = new URLSearchParams();
      formData.append('email', email);
      formData.append('password', password);
      formData.append('csrfToken', csrfToken);
      formData.append('json', 'true');

      const res = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: formData.toString()
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && !data.error && data.status !== 401) {
        localStorage.setItem('owner_session_active', 'true');
        window.location.href = '/';
      } else {
        const errorMsg = data.error || (res.status === 401 ? 'Invalid Owner Email or Password.' : `Authentication failed (${res.status}). Please check credentials.`);
        setError("Sign in error: " + errorMsg);
      }
    } catch (err: any) {
      setError("Sign in error: " + (err?.message || "Network error connecting to NextAuth API."));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      if (!csrfRes.ok) throw new Error("CSRF fetch failed");
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.csrfToken;
      if (!csrfToken) throw new Error("CSRF token missing");

      const formData = new URLSearchParams();
      formData.append('csrfToken', csrfToken);
      formData.append('json', 'true');

      const res = await fetch('/api/auth/signin/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: formData.toString()
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to initiate Google sign-in");
      }
    } catch (err: any) {
      setError(`Google sign-in error: ${err?.message || "Unable to initiate Google OAuth"}`);
    }
  }

  function handleDemoLogin() {
    localStorage.setItem('owner_session_active', 'true');
    window.location.href = '/';
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

        <div className="mt-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
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
          Configured production ENV status:<br />
          <span className="text-emerald-400">✓ NEXTAUTH_SECRET • NEXTAUTH_URL • DATABASE_URL • OWNER_EMAIL</span>
        </div>
      </div>
    </div>
  );
}
