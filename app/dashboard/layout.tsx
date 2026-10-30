import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }
  if ((session as any)?.user?.role !== 'ADMIN') {
    redirect('/login?error=AccessDenied');
  }
  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100">
      <nav className="border-b border-slate-800 bg-[#0b0f1f] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center font-bold text-xs">WB</div>
            <span className="font-black text-lg tracking-tight">Website Manager</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="text-sm text-slate-400 hover:text-white transition">Back to Dashboard</a>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
