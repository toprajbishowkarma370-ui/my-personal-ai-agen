import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export default function Page() {
  const filePath = path.join(process.cwd(), 'index.html');
  let bodyContent = '';
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const match = html.match(/<body[^>]*>(.*)<\/body>/is);
    if (match && match[1]) {
      bodyContent = match[1];
    } else {
      bodyContent = html;
    }
  } catch (e) {
    bodyContent = '<div class="p-8 text-white">Dashboard loading error</div>';
  }

  return (
    <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
  );
}
