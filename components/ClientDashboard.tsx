'use client';
import { useEffect, useRef, useState } from 'react';

export default function ClientDashboard({ htmlContent }: { htmlContent: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string>('Initializing: Waiting for script execution...');
  const [clickCount, setClickCount] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = htmlContent;

    const scripts = containerRef.current.querySelectorAll('script');
    let loadedCount = 0;
    
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      if (oldScript.src) {
        newScript.src = oldScript.src;
        newScript.onload = () => {
          loadedCount++;
          setDiagnosticStatus(`Scripts loaded (${loadedCount}/${scripts.length}). window.doLogin: ${typeof (window as any).doLogin}`);
        };
        newScript.onerror = () => {
          setDiagnosticStatus(`Error loading script: ${oldScript.src}`);
        };
      } else {
        newScript.textContent = oldScript.textContent;
      }
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });

    const timer = setTimeout(() => {
      const hasLogin = typeof (window as any).doLogin === 'function';
      setDiagnosticStatus(hasLogin ? 'Ready: window.doLogin is defined.' : 'Warning: window.doLogin is NOT defined yet.');
    }, 500);

    const bindLoginButton = () => {
      const loginBtn = containerRef.current?.querySelector('#loginBtn');
      if (loginBtn) {
        loginBtn.removeEventListener('click', handleLoginClick);
        loginBtn.addEventListener('click', handleLoginClick);
      }
      const googleBtn = containerRef.current?.querySelector('#googleLoginBtn');
      if (googleBtn) {
        googleBtn.removeEventListener('click', handleGoogleClick);
        googleBtn.addEventListener('click', handleGoogleClick);
      }
    };

    const handleLoginClick = (e: Event) => {
      setClickCount((c) => c + 1);
      // The login button now navigates to /login (real NextAuth signIn). Do not block
      // navigation; only record the click for diagnostics.
      setDiagnosticStatus(`Click fired! Redirecting to /login for a real NextAuth session...`);
    };

    const handleGoogleClick = (e: Event) => {
      setClickCount((c) => c + 1);
      // The Google button now navigates to /login where signIn("google") from
      // next-auth/react initiates OAuth. Do not rely on or block on the legacy
      // window.signInWithGoogle global, and do not prevent navigation.
      setDiagnosticStatus(`Google Click fired! Redirecting to /login for Google OAuth...`);
    };

    bindLoginButton();
    const interval = setInterval(bindLoginButton, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      const loginBtn = containerRef.current?.querySelector('#loginBtn');
      if (loginBtn) {
        loginBtn.removeEventListener('click', handleLoginClick);
      }
      const googleBtn = containerRef.current?.querySelector('#googleLoginBtn');
      if (googleBtn) {
        googleBtn.removeEventListener('click', handleGoogleClick);
      }
    };
  }, [htmlContent]);

  return (
    <div className="relative">
      <div className="fixed top-0 left-0 right-0 z-[100] bg-slate-900 border-b border-brand-500/40 px-4 py-2 text-xs font-mono text-cyan-300 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span><b>Diagnostic Status:</b> {diagnosticStatus}</span>
        </div>
        <div className="text-slate-400">
          Clicks: {clickCount} | window.doLogin: {typeof window !== 'undefined' && typeof (window as any).doLogin === 'function' ? 'YES' : 'NO'}
        </div>
      </div>
      <div ref={containerRef} className="pt-10" />
    </div>
  );
}
