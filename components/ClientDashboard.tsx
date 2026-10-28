'use client';
import { useEffect, useRef, useState } from 'react';

export default function ClientDashboard({ htmlContent }: { htmlContent: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string>('Initializing: Waiting for script execution...');
  const [clickCount, setClickCount] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const scripts = tempDiv.querySelectorAll('script');

    const inlineScripts: string[] = [];
    const externalSrcs: string[] = [];

    scripts.forEach((s) => {
      if (s.src) {
        externalSrcs.push(s.src);
      } else if (s.textContent) {
        inlineScripts.push(s.textContent);
      }
      s.remove();
    });

    containerRef.current.innerHTML = tempDiv.innerHTML;

    let executedCount = 0;
    inlineScripts.forEach((scriptCode) => {
      try {
        eval(scriptCode);
        executedCount++;
      } catch (err) {
        console.error("Dashboard script execution error:", err);
      }
    });

    setDiagnosticStatus(`Scripts executed (${executedCount} blocks). window.doLogin: ${typeof (window as any).doLogin}`);

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
