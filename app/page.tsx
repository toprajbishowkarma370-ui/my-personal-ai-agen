import fs from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import ClientDashboard from '@/components/ClientDashboard';

export const dynamic = 'force-dynamic';

export default function Page() {
  const session = getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  const pathsToTry = [
    path.join(process.cwd(), 'index.html'),
    path.join(process.cwd(), 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
    path.join(__dirname, '../index.html'),
    path.join(__dirname, '../../index.html'),
    path.join(__dirname, '../../../index.html'),
  ];

  let bodyContent = '';
  let htmlFound = false;

  for (const filePath of pathsToTry) {
    try {
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf8');
        const match = html.match(/<body[^>]*>(.*)<\/body>/is);
        if (match && match[1]) {
          bodyContent = match[1];
        } else {
          bodyContent = html;
        }
        htmlFound = true;
        break;
      }
    } catch (e) {
      // try next path
    }
  }

  if (!htmlFound) {
    bodyContent = `
      <div style="background:#070a14;color:#fff;padding:40px;font-family:sans-serif;text-align:center;">
        <h1>My Personal AI Business Agent</h1>
        <p>Autonomous Business OS is online. Dashboard template loading...</p>
      </div>
    `;
  }

  return <ClientDashboard htmlContent={bodyContent} />;
}
