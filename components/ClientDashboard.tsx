'use client';
import { useEffect, useRef, useState } from 'react';

export default function ClientDashboard({ htmlContent }: { htmlContent: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string>('Initializing: Waiting for script execution...');
  const [clickCount, setClickCount] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = htmlContent;

    // Ensure window.doLogin is guaranteed to be defined immediately
    if (typeof (window as any).doLogin !== 'function') {
      (window as any).doLogin = async function(demo = false) {
        const email = (document.getElementById('authEmail') as HTMLInputElement)?.value;
        const pass = (document.getElementById('authPass') as HTMLInputElement)?.value;
        const errBox = document.getElementById('authError');
        if (!errBox) return;
        if (!email || !pass) {
          errBox.textContent = "Please enter both email and password.";
          errBox.className = "mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs";
          errBox.classList.remove('hidden');
          return;
        }
        try {
          const csrfRes = await fetch('/api/auth/csrf');
          const csrfData = await csrfRes.json();
          const formData = new URLSearchParams();
          formData.append('email', email);
          formData.append('password', pass);
          formData.append('csrfToken', csrfData.csrfToken);
          formData.append('json', 'true');

          const res = await fetch('/api/auth/callback/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: formData.toString()
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && !data.error && data.status !== 401) {
            localStorage.setItem('owner_session_active', 'true');
            const wall = document.getElementById('authWall');
            if (wall) wall.classList.add('hidden');
            if (typeof (window as any).bootApp === 'function') (window as any).bootApp();
          } else {
            errBox.textContent = "Sign in error: " + (data.error || "Invalid credentials.");
            errBox.className = "mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs";
            errBox.classList.remove('hidden');
          }
        } catch (err: any) {
          errBox.textContent = "Sign in error: " + (err?.message || "Connection error.");
          errBox.className = "mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs";
          errBox.classList.remove('hidden');
        }
      };
    }

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
    };

    const handleLoginClick = (e: Event) => {
      setClickCount((c) => c + 1);
      const fnExists = typeof (window as any).doLogin === 'function';
      if (!fnExists) {
        e.preventDefault();
        setDiagnosticStatus(`Click fired! Error: window.doLogin is undefined.`);
      } else {
        setDiagnosticStatus(`Click fired! Executing window.doLogin()...`);
      }
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
