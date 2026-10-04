import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fontes ficam dentro do projeto: o sistema não depende de internet para carregar.
const figtree = localFont({
  src: "./fonts/figtree-latin.woff2",
  variable: "--font-figtree",
  weight: "300 900",
  display: "swap",
});
const bricolage = localFont({
  src: "./fonts/bricolage-latin.woff2",
  variable: "--font-bricolage",
  weight: "500 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LeadFlow",
  description: "Encontre empresas sem site, acompanhe cada conversa e veja quanto sobrou no mês.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#111615" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${figtree.variable} ${bricolage.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Aplica o tema escolhido antes da primeira pintura, para a tela não piscar. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('leadflow_theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
