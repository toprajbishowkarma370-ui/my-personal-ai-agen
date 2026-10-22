import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Personal AI Business Agent — Autonomous Business OS v3.8',
  description: 'Autonomous Business OS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                theme: {
                  extend: {
                    fontFamily: {
                      sans: ['"Plus Jakarta Sans"','system-ui','sans-serif'],
                      mono: ['"JetBrains Mono"','monospace']
                    },
                    colors: {
                      brand: {50:'#f4f3ff',100:'#ebe8ff',200:'#d9d4fe',300:'#bfb5fd',400:'#9f8efc',500:'#7e63f8',600:'#6957f5',700:'#543fe0',800:'#4533ba',900:'#3a2d96',950:'#15103b'},
                      dark:{800:'#141a2e',850:'#101526',900:'#0b0f1f',950:'#070a14'}
                    }
                  }
                }
              };
            `,
          }}
        />
      </head>
      <body className="h-full bg-[#070a14] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
