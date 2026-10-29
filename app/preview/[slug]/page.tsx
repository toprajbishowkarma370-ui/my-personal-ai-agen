import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  return { title: `Preview — ${slug}`, description: "Responsive website preview" };
}

export default function PreviewPage({ params }: { params: { slug: string | string[] } }) {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  return (
    <div className="min-h-screen bg-[#070a14] text-slate-100 font-sans">
      <div className="border-b border-slate-800 bg-[#0b0f1f] px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400">Preview: <span className="text-white font-bold">{slug}</span></span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs font-mono text-slate-500">Responsive: Mobile / Tablet / Desktop</span>
          <div className="ml-auto flex gap-2">
            <a href="/" className="text-xs text-brand-400 underline hover:text-brand-300">Back to Manager</a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Mobile */}
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mobile</div>
            <div className="w-[375px] h-[700px] bg-slate-950 border border-slate-700 rounded-2xl overflow-hidden relative shadow-2xl">
              <WebsitePreview className="w-full h-full" slug={slug} width={375} />
            </div>
          </div>
          {/* Tablet */}
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tablet</div>
            <div className="w-[768px] h-[900px] bg-slate-950 border border-slate-700 rounded-2xl overflow-hidden relative shadow-2xl">
              <WebsitePreview className="w-full h-full" slug={slug} width={768} />
            </div>
          </div>
          {/* Desktop */}
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Desktop</div>
            <div className="w-full max-w-[1024px] h-[768px] bg-slate-950 border border-slate-700 rounded-2xl overflow-hidden relative shadow-2xl">
              <WebsitePreview className="w-full h-full" slug={slug} width={1024} />
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-[#0b0f1f] border border-slate-800 rounded-xl text-xs text-slate-500 font-mono">
          Previews render the website's stored content/theme from the database. Each template has distinct layouts and clearly labeled demo content. Owner approval is required before publishing.
        </div>
      </div>
    </div>
  );
}

function WebsitePreview({ className, slug, width }: { className?: string; slug: string; width: number }) {
  return (
    <div className={`${className || ""} flex flex-col`}>
      <iframe
        src={`/api/websites/preview/${slug}?width=${width}`}
        className="w-full h-full"
        title={`Preview ${slug} ${width}px`}
      />
    </div>
  );
}
