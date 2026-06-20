import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeuroSpace",
  description:
    "Gizlilik odaklı odak/yorgunluk analizi. Yazdığınız içerik asla kaydedilmez.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        {/* Tema: kayıtlı tercihi erken uygula (flash önleme) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ns-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
